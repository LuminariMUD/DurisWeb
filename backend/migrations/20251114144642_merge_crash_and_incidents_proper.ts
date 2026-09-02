import type { Knex } from 'knex';

/** Merge legacy incident and crash records into the unified incident table. */
export async function up(knex: Knex): Promise<void> {
  // Step 0: Drop temporary table if it exists from a previous failed migration
  await knex.schema.dropTableIfExists('server_incidents_new');

  // Step 1: Create new unified incidents table with all fields
  await knex.schema.createTable('server_incidents_new', (table) => {
    table.increments('id').primary();

    // Incident basic fields
    table.datetime('started_at').notNullable();
    table.datetime('ended_at');
    table.integer('duration_seconds').comment('Calculated when incident ends');

    // Type and severity
    table.enum('incident_type', ['crash', 'maintenance', 'degraded', 'outage']).notNullable();
    table.enum('severity', ['critical', 'major', 'minor', 'info']).notNullable().defaultTo('minor');

    // Description
    table.string('title', 255).notNullable().comment('Brief incident title');
    table.text('description').comment('Detailed incident description');

    // Resolution
    table.boolean('resolved').defaultTo(false);
    table.text('resolution_notes');
    table.boolean('public_visible').defaultTo(false).comment('Show on public status page');

    // Detection metadata (from crash_log)
    table.enum('detected_by', ['exit_log', 'process_monitor', 'manual']).comment('How crash was detected');
    table.integer('exit_code').comment('Process exit code');
    table.string('crash_signal', 20).comment('SIGSEGV, SIGABRT, etc.');
    table.string('shutdown_reason', 255).comment('Human-readable shutdown reason');

    // Process info at time of crash (from crash_log)
    table.integer('pid').comment('Process ID at crash');
    table.integer('uptime_seconds').comment('How long MUD was running before crash');
    table.float('memory_mb').comment('Memory usage in MiB');
    table.float('cpu_percent').comment('CPU usage percentage');

    // Core dump info (from crash_log)
    table.string('core_dump_path', 512).comment('Path to core dump file');
    table.bigInteger('core_dump_size_bytes').comment('Size of core dump in bytes');
    table.boolean('has_backtrace').defaultTo(false);

    // GDB backtrace analysis (from crash_log)
    table.text('backtrace', 'longtext').comment('Full GDB backtrace output');
    table.string('crash_function', 255).comment('Function where crash occurred');
    table.string('crash_file', 255).comment('Source file where crash occurred');
    table.integer('crash_line').comment('Line number where crash occurred');

    // Context logs (from crash_log)
    table.text('exit_log_excerpt').comment('Last lines from exit log before crash');
    table.text('debug_log_excerpt').comment('Last lines from debug log before crash');

    // MUD state at crash (from crash_log)
    table.integer('online_players').defaultTo(0).comment('Number of players online when crashed');
    table.text('last_command').comment('Last player command executed (if available)');

    // Analysis and resolution (from crash_log)
    table.boolean('analyzed').defaultTo(false).comment('Has this crash been reviewed by admin');
    table.text('notes').comment('Admin notes about crash and resolution');

    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('started_at', 'idx_incidents_started_at');
    table.index('incident_type', 'idx_incidents_type');
    table.index('resolved', 'idx_incidents_resolved');
    table.index('severity', 'idx_incidents_severity');
    table.index('exit_code', 'idx_incidents_exit_code');
    table.index('analyzed', 'idx_incidents_analyzed');
    table.index('crash_function', 'idx_incidents_crash_function');
    table.index('detected_by', 'idx_incidents_detected_by');
    table.index('public_visible', 'idx_incidents_public_visible');
  });

  // Step 2: Migrate data from server_incidents (if table exists)
  const hasIncidentsTable = await knex.schema.hasTable('server_incidents');

  if (hasIncidentsTable) {
    // Check which columns exist in the old table
    const hasPublicVisible = await knex.schema.hasColumn('server_incidents', 'public_visible');

    if (hasPublicVisible) {
      await knex.raw(`
        INSERT INTO server_incidents_new (
          id, started_at, ended_at, duration_seconds, incident_type, severity,
          title, description, resolved, resolution_notes, public_visible, created_at, updated_at
        )
        SELECT
          id, started_at, ended_at, duration_seconds, incident_type, severity,
          title, description, resolved, resolution_notes, public_visible, created_at, updated_at
        FROM server_incidents
      `);
    } else {
      // Old table doesn't have public_visible column
      await knex.raw(`
        INSERT INTO server_incidents_new (
          id, started_at, ended_at, duration_seconds, incident_type, severity,
          title, description, resolved, resolution_notes, created_at, updated_at
        )
        SELECT
          id, started_at, ended_at, duration_seconds, incident_type, severity,
          title, description, resolved, resolution_notes, created_at, updated_at
        FROM server_incidents
      `);
    }
  }

  // Step 3: Migrate data from crash_log and merge with incidents if linked (if table exists)
  const hasCrashLogTable = await knex.schema.hasTable('crash_log');

  if (hasCrashLogTable && hasIncidentsTable) {
    const hasCrashLogId = await knex.schema.hasColumn('server_incidents', 'crash_log_id');

    if (hasCrashLogId) {
      await knex.raw(`
        INSERT INTO server_incidents_new (
          started_at, incident_type, severity, title, description, resolved, public_visible,
          detected_by, exit_code, crash_signal, shutdown_reason,
          pid, uptime_seconds, memory_mb, cpu_percent,
          core_dump_path, core_dump_size_bytes, has_backtrace,
          backtrace, crash_function, crash_file, crash_line,
          exit_log_excerpt, debug_log_excerpt,
          online_players, last_command, analyzed, notes, created_at
        )
        SELECT
          cl.crash_timestamp,
          CASE WHEN cl.exit_code = 139 THEN 'crash' ELSE 'maintenance' END,
          CASE WHEN cl.exit_code = 139 THEN 'critical' ELSE 'info' END,
          COALESCE(cl.shutdown_reason, CONCAT('Exit code ', cl.exit_code)),
          CASE
            WHEN cl.crash_function IS NOT NULL THEN CONCAT('Crash in ', cl.crash_function, ' (', cl.crash_file, ':', cl.crash_line, ')')
            ELSE 'Server event'
          END,
          0,
          0,
          cl.detected_by, cl.exit_code, cl.crash_signal, cl.shutdown_reason,
          cl.pid, cl.uptime_seconds, cl.memory_mb, cl.cpu_percent,
          cl.core_dump_path, cl.core_dump_size_bytes, cl.has_backtrace,
          cl.backtrace, cl.crash_function, cl.crash_file, cl.crash_line,
          cl.exit_log_excerpt, cl.debug_log_excerpt,
          cl.online_players, cl.last_command, cl.analyzed, cl.notes, cl.created_at
        FROM crash_log cl
        WHERE NOT EXISTS (
          SELECT 1 FROM server_incidents si WHERE si.crash_log_id = cl.id
        )
      `);
    }
  } else if (hasCrashLogTable && !hasIncidentsTable) {
    // Only crash_log exists, migrate all crash logs as incidents
    await knex.raw(`
      INSERT INTO server_incidents_new (
        started_at, incident_type, severity, title, description, resolved, public_visible,
        detected_by, exit_code, crash_signal, shutdown_reason,
        pid, uptime_seconds, memory_mb, cpu_percent,
        core_dump_path, core_dump_size_bytes, has_backtrace,
        backtrace, crash_function, crash_file, crash_line,
        exit_log_excerpt, debug_log_excerpt,
        online_players, last_command, analyzed, notes, created_at
      )
      SELECT
        cl.crash_timestamp,
        CASE WHEN cl.exit_code = 139 THEN 'crash' ELSE 'maintenance' END,
        CASE WHEN cl.exit_code = 139 THEN 'critical' ELSE 'info' END,
        COALESCE(cl.shutdown_reason, CONCAT('Exit code ', cl.exit_code)),
        CASE
          WHEN cl.crash_function IS NOT NULL THEN CONCAT('Crash in ', cl.crash_function, ' (', cl.crash_file, ':', cl.crash_line, ')')
          ELSE 'Server event'
        END,
        0,
        0,
        cl.detected_by, cl.exit_code, cl.crash_signal, cl.shutdown_reason,
        cl.pid, cl.uptime_seconds, cl.memory_mb, cl.cpu_percent,
        cl.core_dump_path, cl.core_dump_size_bytes, cl.has_backtrace,
        cl.backtrace, crash_function, cl.crash_file, cl.crash_line,
        cl.exit_log_excerpt, cl.debug_log_excerpt,
        cl.online_players, cl.last_command, cl.analyzed, cl.notes, cl.created_at
      FROM crash_log cl
    `);
  }

  // Step 4: Update incidents that have crash_log_id with crash details (only if both tables exist)
  if (hasCrashLogTable && hasIncidentsTable) {
    const hasCrashLogId = await knex.schema.hasColumn('server_incidents', 'crash_log_id');
    if (hasCrashLogId) {
      await knex.raw(`
        UPDATE server_incidents_new sin
        INNER JOIN server_incidents si ON sin.id = si.id
        INNER JOIN crash_log cl ON si.crash_log_id = cl.id
        SET
          sin.detected_by = cl.detected_by,
          sin.exit_code = cl.exit_code,
          sin.crash_signal = cl.crash_signal,
          sin.shutdown_reason = cl.shutdown_reason,
          sin.pid = cl.pid,
          sin.uptime_seconds = cl.uptime_seconds,
          sin.memory_mb = cl.memory_mb,
          sin.cpu_percent = cl.cpu_percent,
          sin.core_dump_path = cl.core_dump_path,
          sin.core_dump_size_bytes = cl.core_dump_size_bytes,
          sin.has_backtrace = cl.has_backtrace,
          sin.backtrace = cl.backtrace,
          sin.crash_function = cl.crash_function,
          sin.crash_file = cl.crash_file,
          sin.crash_line = cl.crash_line,
          sin.exit_log_excerpt = cl.exit_log_excerpt,
          sin.debug_log_excerpt = cl.debug_log_excerpt,
          sin.online_players = cl.online_players,
          sin.last_command = cl.last_command,
          sin.analyzed = cl.analyzed,
          sin.notes = COALESCE(cl.notes, sin.notes)
      `);
    }
  }

  // Step 5: Drop old tables
  await knex.schema.dropTableIfExists('server_incidents');
  await knex.schema.dropTableIfExists('crash_log');

  // Step 6: Rename new table to final name
  await knex.schema.renameTable('server_incidents_new', 'server_incidents');
}

/**
 * Complete a prior down-migration attempt that reached the final table rename.
 * MySQL DDL auto-commits, so a failed foreign-key addition leaves the legacy
 * tables and reconstructed crash data in place even though Knex retries down().
 */
async function finishInterruptedDownMigration(knex: Knex): Promise<boolean> {
  const [hasIncidentsTable, hasCrashLogTable] = await Promise.all([
    knex.schema.hasTable('server_incidents'),
    knex.schema.hasTable('crash_log'),
  ]);
  if (!hasIncidentsTable || !hasCrashLogTable) {
    return false;
  }

  const [hasCrashLogId, hasUnifiedDetectedBy] = await Promise.all([
    knex.schema.hasColumn('server_incidents', 'crash_log_id'),
    knex.schema.hasColumn('server_incidents', 'detected_by'),
  ]);
  if (!hasCrashLogId || hasUnifiedDetectedBy) {
    return false;
  }

  const existingForeignKey = await knex('information_schema.KEY_COLUMN_USAGE')
    .select('CONSTRAINT_NAME')
    .whereRaw('CONSTRAINT_SCHEMA = DATABASE()')
    .where({
      TABLE_NAME: 'server_incidents',
      COLUMN_NAME: 'crash_log_id',
      REFERENCED_TABLE_NAME: 'crash_log',
    })
    .first();

  if (!existingForeignKey) {
    await knex.schema.alterTable('server_incidents', (table) => {
      table.foreign('crash_log_id').references('crash_log.id').onDelete('SET NULL');
    });
  }

  return true;
}

/** Restore the legacy incident and crash-log tables without losing recovered rows. */
export async function down(knex: Knex): Promise<void> {
  if (await finishInterruptedDownMigration(knex)) {
    return;
  }

  // A failed MySQL DDL rollback can leave these reconstruction tables behind
  // because ALTER/CREATE/DROP statements auto-commit. The unified source table
  // is still authoritative until the final rename, so rebuilding the two
  // temporary targets is safe and makes recovery deterministic.
  await knex.schema.dropTableIfExists('server_incidents_old');
  await knex.schema.dropTableIfExists('crash_log');

  // Recreate original tables structure
  await knex.schema.createTable('crash_log', (table) => {
    table.increments('id').primary();
    table.datetime('crash_timestamp').notNullable();
    table.enum('detected_by', ['exit_log', 'process_monitor', 'manual']).notNullable().defaultTo('exit_log');
    table.integer('exit_code');
    table.string('crash_signal', 20);
    table.string('shutdown_reason', 255);
    table.integer('pid');
    table.integer('uptime_seconds');
    table.float('memory_mb');
    table.float('cpu_percent');
    table.string('core_dump_path', 512);
    table.bigInteger('core_dump_size_bytes');
    table.boolean('has_backtrace').defaultTo(false);
    table.text('backtrace', 'longtext');
    table.string('crash_function', 255);
    table.string('crash_file', 255);
    table.integer('crash_line');
    table.text('exit_log_excerpt');
    table.text('debug_log_excerpt');
    table.integer('online_players').defaultTo(0);
    table.text('last_command');
    table.boolean('analyzed').defaultTo(false);
    table.text('notes');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.index('crash_timestamp', 'idx_crash_timestamp');
    table.index('exit_code', 'idx_exit_code');
    table.index('analyzed', 'idx_analyzed');
    table.index('crash_function', 'idx_crash_function');
    table.index('detected_by', 'idx_detected_by');
  });

  await knex.schema.createTable('server_incidents_old', (table) => {
    table.increments('id').primary();
    table.datetime('started_at').notNullable();
    table.datetime('ended_at');
    table.integer('duration_seconds');
    table.enum('incident_type', ['crash', 'maintenance', 'degraded', 'outage']).notNullable();
    table.enum('severity', ['critical', 'major', 'minor', 'info']).notNullable().defaultTo('minor');
    table.string('title', 255).notNullable();
    table.text('description');
    table.boolean('resolved').defaultTo(false);
    table.text('resolution_notes');
    table.integer('crash_log_id').unsigned();
    table.boolean('public_visible').defaultTo(false);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.index('started_at', 'idx_started_at');
    table.index('incident_type', 'idx_incident_type');
    table.index('resolved', 'idx_resolved');
    table.index('severity', 'idx_severity');
  });

  // Migrate data back from unified table
  await knex.raw(`
    INSERT INTO crash_log (
      crash_timestamp, detected_by, exit_code, crash_signal, shutdown_reason,
      pid, uptime_seconds, memory_mb, cpu_percent,
      core_dump_path, core_dump_size_bytes, has_backtrace,
      backtrace, crash_function, crash_file, crash_line,
      exit_log_excerpt, debug_log_excerpt,
      online_players, last_command, analyzed, notes
    )
    SELECT
      started_at, detected_by, exit_code, crash_signal, shutdown_reason,
      pid, uptime_seconds, memory_mb, cpu_percent,
      core_dump_path, core_dump_size_bytes, has_backtrace,
      backtrace, crash_function, crash_file, crash_line,
      exit_log_excerpt, debug_log_excerpt,
      online_players, last_command, analyzed, notes
    FROM server_incidents
    WHERE detected_by IS NOT NULL
  `);

  const hasPublicVisible = await knex.schema.hasColumn('server_incidents', 'public_visible');
  if (hasPublicVisible) {
    await knex.raw(`
      INSERT INTO server_incidents_old (
        started_at, ended_at, duration_seconds, incident_type, severity,
        title, description, resolved, resolution_notes, public_visible, created_at, updated_at
      )
      SELECT
        started_at, ended_at, duration_seconds, incident_type, severity,
        title, description, resolved, resolution_notes, public_visible, created_at, updated_at
      FROM server_incidents
    `);
  } else {
    await knex.raw(`
      INSERT INTO server_incidents_old (
        started_at, ended_at, duration_seconds, incident_type, severity,
        title, description, resolved, resolution_notes, created_at, updated_at
      )
      SELECT
        started_at, ended_at, duration_seconds, incident_type, severity,
        title, description, resolved, resolution_notes, created_at, updated_at
      FROM server_incidents
    `);
  }

  // Update crash_log_id references
  await knex.raw(`
    UPDATE server_incidents_old sio
    INNER JOIN server_incidents si ON sio.id = si.id
    INNER JOIN crash_log cl ON si.detected_by = cl.detected_by AND si.started_at = cl.crash_timestamp
    SET sio.crash_log_id = cl.id
    WHERE si.detected_by IS NOT NULL
  `);

  await knex.schema.dropTableIfExists('server_incidents');
  await knex.schema.renameTable('server_incidents_old', 'server_incidents');

  // Add foreign key
  await knex.schema.alterTable('server_incidents', (table) => {
    table.foreign('crash_log_id').references('crash_log.id').onDelete('SET NULL');
  });
}

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('crash_log', (table) => {
    table.increments('id').primary();

    // Crash metadata
    table.datetime('crash_timestamp').notNullable();
    table.enum('detected_by', ['exit_log', 'process_monitor', 'manual']).notNullable().defaultTo('exit_log');
    table.integer('exit_code');
    table.string('crash_signal', 20).comment('SIGSEGV, SIGABRT, etc.');
    table.string('shutdown_reason', 255);

    // Process info at time of crash
    table.integer('pid');
    table.integer('uptime_seconds').comment('How long MUD was running before crash');
    table.float('memory_mb').comment('Memory usage in MiB');
    table.float('cpu_percent').comment('CPU usage percentage');

    // Core dump info
    table.string('core_dump_path', 512).comment('Path to core dump file');
    table.bigInteger('core_dump_size_bytes').comment('Size of core dump in bytes');
    table.boolean('has_backtrace').defaultTo(false);

    // GDB backtrace analysis
    table.text('backtrace', 'longtext').comment('Full GDB backtrace output');
    table.string('crash_function', 255).comment('Function where crash occurred');
    table.string('crash_file', 255).comment('Source file where crash occurred');
    table.integer('crash_line').comment('Line number where crash occurred');

    // Context logs
    table.text('exit_log_excerpt').comment('Last lines from exit log before crash');
    table.text('debug_log_excerpt').comment('Last lines from debug log before crash');

    // MUD state at crash
    table.integer('online_players').defaultTo(0).comment('Number of players online when crashed');
    table.text('last_command').comment('Last player command executed (if available)');

    // Analysis and resolution
    table.boolean('analyzed').defaultTo(false).comment('Has this crash been reviewed by admin');
    table.text('notes').comment('Admin notes about crash and resolution');
    table.datetime('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('crash_timestamp', 'idx_crash_timestamp');
    table.index('exit_code', 'idx_exit_code');
    table.index('analyzed', 'idx_analyzed');
    table.index('crash_function', 'idx_crash_function');
    table.index('detected_by', 'idx_detected_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('crash_log');
}


import type { Knex } from 'knex';

const CANONICAL_SHUTDOWN_TYPES = [
  'shutdown',
  'reboot',
  'copyover',
  'autoreboot',
  'pwipe',
  'hung',
  'autoreboot_copyover',
  'crash',
  'unknown',
] as const;

interface CountRow {
  count: number | string;
}

interface ConstraintRow {
  CONSTRAINT_NAME: string;
}

interface ValidationRow {
  invalid_rows: number | string;
}

/** Remove cross-boundary keys and restore the sealed MUD reboot table shape. */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('user_profile_stats')) {
    const [constraints] = await knex.raw<ConstraintRow[]>(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_profile_stats'
        AND REFERENCED_TABLE_NAME = 'accounts'
    `);

    for (const constraint of constraints) {
      await knex.raw('ALTER TABLE user_profile_stats DROP FOREIGN KEY ??', [
        constraint.CONSTRAINT_NAME,
      ]);
    }
  }

  if (
    !(await knex.schema.hasTable('server_reboots')) ||
    !(await knex.schema.hasColumn('server_reboots', 'record_id'))
  ) {
    return;
  }

  const [canonicalRows] = await knex.raw<CountRow[]>(`
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'server_reboots'
      AND (
        (COLUMN_NAME = 'record_id' AND DATA_TYPE = 'bigint' AND COLUMN_TYPE LIKE '%unsigned%' AND IS_NULLABLE = 'NO' AND EXTRA LIKE '%auto_increment%')
        OR (COLUMN_NAME IN ('boot_time', 'shutdown_time', 'uptime_seconds') AND DATA_TYPE = 'bigint' AND COLUMN_TYPE LIKE '%unsigned%' AND IS_NULLABLE = 'NO')
        OR (COLUMN_NAME = 'shutdown_type' AND COLUMN_TYPE = 'enum(''shutdown'',''reboot'',''copyover'',''autoreboot'',''pwipe'',''hung'',''autoreboot_copyover'',''crash'',''unknown'')' AND IS_NULLABLE = 'NO' AND REPLACE(COLUMN_DEFAULT, CHAR(39), '') = 'unknown')
        OR (COLUMN_NAME = 'initiated_by' AND COLUMN_TYPE = 'varchar(255)' AND IS_NULLABLE = 'YES')
        OR (COLUMN_NAME = 'reason' AND DATA_TYPE = 'text' AND IS_NULLABLE = 'YES')
      )
  `);
  if (Number(canonicalRows[0]?.count) === 7) {
    return;
  }

  const [validationRows] = await knex.raw<ValidationRow[]>(`
    SELECT COUNT(*) AS invalid_rows
    FROM server_reboots
    WHERE boot_time IS NULL
       OR shutdown_time IS NULL
       OR uptime_seconds IS NULL
       OR boot_time < 0
       OR shutdown_time < 0
       OR uptime_seconds < 0
       OR shutdown_type IS NULL
       OR shutdown_type NOT IN (${CANONICAL_SHUTDOWN_TYPES.map(() => '?').join(', ')})
  `, CANONICAL_SHUTDOWN_TYPES);
  if (Number(validationRows[0]?.invalid_rows) !== 0) {
    throw new Error('server_reboots contains rows incompatible with the canonical MUD schema');
  }

  await knex.raw(`
    ALTER TABLE server_reboots
      MODIFY COLUMN boot_time BIGINT UNSIGNED NOT NULL,
      MODIFY COLUMN shutdown_time BIGINT UNSIGNED NOT NULL,
      MODIFY COLUMN uptime_seconds BIGINT UNSIGNED NOT NULL,
      MODIFY COLUMN shutdown_type ENUM(
        'shutdown',
        'reboot',
        'copyover',
        'autoreboot',
        'pwipe',
        'hung',
        'autoreboot_copyover',
        'crash',
        'unknown'
      ) NOT NULL DEFAULT 'unknown',
      MODIFY COLUMN initiated_by VARCHAR(255) NULL DEFAULT NULL,
      MODIFY COLUMN reason TEXT NULL DEFAULT NULL
  `);
}

/** Preserve the authoritative MUD runtime contract during rollback. */
export async function down(_knex: Knex): Promise<void> {
  // The MUD runtime contract is authoritative and must not be weakened on rollback.
}

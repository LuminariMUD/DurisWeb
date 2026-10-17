import type { Knex } from 'knex';
import {
  loadWebBaselineBundle,
  loadWebForwardSchemas,
  type BaselineDatabaseFamily,
} from './webBaselineBundle.js';
import {
  readTableMetadata,
  schemaDatabaseFamily,
  schemaRows,
  tableMetadataSha256,
  type SchemaDatabase,
} from './schemaPostconditions.js';
import { RETENTION_CONTROL_KEY } from './internalWebSettings.js';

export const RETENTION_RUN_MIGRATION = '20261017005000_web_retention_runs.ts';
export const RETENTION_RUN_UP_SQL = `CREATE TABLE web_retention_runs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  policy_version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rules_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  captured_at_epoch BIGINT UNSIGNED NOT NULL,
  progress MEDIUMTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  CONSTRAINT chk_retention_progress CHECK (JSON_VALID(progress) AND OCTET_LENGTH(progress)<=16384),
  CONSTRAINT chk_retention_epoch CHECK (captured_at_epoch>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function loadRetentionRunContract(directory?: string) {
  const entry = loadWebForwardSchemas(loadWebBaselineBundle(), directory).find(
    ({ name }) => name === RETENTION_RUN_MIGRATION,
  );
  if (
    !entry ||
    JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['web_retention_runs']) ||
    !entry.tables.web_retention_runs
  )
    throw new Error('Required retention run contract is missing');
  return entry.tables.web_retention_runs;
}
async function stage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<'before' | 'after'> {
  const names = await schemaRows(
    database,
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_retention_runs'",
  );
  if (!names.length) return 'before';
  if (
    tableMetadataSha256(await readTableMetadata(database, 'web_retention_runs', family)) !==
    loadRetentionRunContract(directory)[family]
  )
    throw new Error('schema_drift_web_retention_runs');
  return 'after';
}
export async function matchesRetentionRunPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  directory?: string,
): Promise<boolean> {
  loadRetentionRunContract(directory);
  return (
    (await stage(database, family, directory)) ===
    (ledger.has(RETENTION_RUN_MIGRATION) ? 'before' : 'after')
  );
}
export async function migrateRetentionRunSchema(
  knex: Knex,
  direction: 'up' | 'down',
): Promise<void> {
  const database: SchemaDatabase = { query: async (sql, values = []) => knex.raw(sql, values) };
  const family = await schemaDatabaseFamily(database);
  loadRetentionRunContract();
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_retention_migration_invariants');
  const actual = await stage(database, family);
  if (direction === 'down') {
    if (actual === 'after') {
      const [row] = await schemaRows(database, 'SELECT COUNT(*) AS count FROM web_retention_runs');
      if (Number(row.count) !== 0) throw new Error('retention_rollback_refuses_run_history');
    }
    const controls = await schemaRows(
      database,
      'SELECT setting_key,setting_value,description,updated_by FROM web_settings WHERE setting_key=?',
      [RETENTION_CONTROL_KEY],
    );
    if (
      controls.length &&
      (controls.length !== 1 ||
        controls[0].setting_key !== RETENTION_CONTROL_KEY ||
        controls[0].setting_value !== '{"format":1,"lease":null}' ||
        controls[0].description !== 'retention control v1' ||
        controls[0].updated_by !== null)
    )
      throw new Error('retention_rollback_refuses_control_state');
    if (controls.length)
      await knex.raw('DELETE FROM web_settings WHERE setting_key=?', [RETENTION_CONTROL_KEY]);
  }
  const target = direction === 'up' ? 'after' : 'before';
  if (actual === target) return;
  await knex.raw(direction === 'up' ? RETENTION_RUN_UP_SQL : 'DROP TABLE web_retention_runs');
  if ((await stage(database, family)) !== target)
    throw new Error('retention_schema_postcondition_failed');
}

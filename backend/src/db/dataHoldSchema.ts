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

export const DATA_HOLD_MIGRATION = '20261017004000_web_data_holds.ts';
export const DATA_HOLD_UP_SQL = `CREATE TABLE web_data_holds (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  class_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  account_name VARCHAR(50) COLLATE utf8mb4_unicode_ci NULL,
  reason VARCHAR(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  created_by VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  review_at_epoch BIGINT UNSIGNED NOT NULL,
  expires_at_epoch BIGINT UNSIGNED NULL,
  released_by VARCHAR(50) COLLATE utf8mb4_unicode_ci NULL,
  release_reason VARCHAR(512) COLLATE utf8mb4_unicode_ci NULL,
  released_at_epoch BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_data_holds_unreleased (released_at_epoch,id),
  CONSTRAINT chk_data_hold_scope CHECK (
    (scope_type=_ascii'global' AND class_id IS NULL AND account_name IS NULL) OR
    (scope_type=_ascii'class' AND class_id IS NOT NULL AND account_name IS NULL) OR
    (scope_type=_ascii'account' AND class_id IS NULL AND account_name IS NOT NULL) OR
    (scope_type=_ascii'account_class' AND class_id IS NOT NULL AND account_name IS NOT NULL)),
  CONSTRAINT chk_data_hold_review CHECK (review_at_epoch>0 AND (expires_at_epoch IS NULL OR expires_at_epoch>=review_at_epoch)),
  CONSTRAINT chk_data_hold_text CHECK (CHAR_LENGTH(TRIM(reason))>0 AND CHAR_LENGTH(TRIM(created_by))>0),
  CONSTRAINT chk_data_hold_release CHECK (
    (released_at_epoch IS NULL AND released_by IS NULL AND release_reason IS NULL) OR
    (released_at_epoch IS NOT NULL AND released_at_epoch>0 AND released_by IS NOT NULL AND release_reason IS NOT NULL AND CHAR_LENGTH(TRIM(released_by))>0 AND CHAR_LENGTH(TRIM(release_reason))>0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function loadDataHoldContract(directory?: string) {
  const entry = loadWebForwardSchemas(loadWebBaselineBundle(), directory).find(
    ({ name }) => name === DATA_HOLD_MIGRATION,
  );
  if (
    !entry ||
    JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['web_data_holds']) ||
    !entry.tables.web_data_holds
  )
    throw new Error('Required data hold contract is missing');
  return entry.tables.web_data_holds;
}
async function stage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<'before' | 'after'> {
  const rows = await schemaRows(
    database,
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_data_holds'",
  );
  if (!rows.length) return 'before';
  if (
    tableMetadataSha256(await readTableMetadata(database, 'web_data_holds', family)) !==
    loadDataHoldContract(directory)[family]
  )
    throw new Error('schema_drift_web_data_holds');
  return 'after';
}
export async function matchesDataHoldPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  directory?: string,
): Promise<boolean> {
  loadDataHoldContract(directory);
  return (
    (await stage(database, family, directory)) ===
    (ledger.has(DATA_HOLD_MIGRATION) ? 'before' : 'after')
  );
}
export async function migrateDataHoldSchema(knex: Knex, direction: 'up' | 'down'): Promise<void> {
  const database: SchemaDatabase = { query: async (sql, values = []) => knex.raw(sql, values) };
  const family = await schemaDatabaseFamily(database);
  loadDataHoldContract();
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_data_hold_migration_invariants');
  const actual = await stage(database, family);
  if (direction === 'down' && actual === 'after') {
    const [row] = await schemaRows(database, 'SELECT COUNT(*) AS count FROM web_data_holds');
    if (Number(row.count) !== 0) throw new Error('data_hold_rollback_refuses_history');
  }
  const target = direction === 'up' ? 'after' : 'before';
  if (actual === target) return;
  await knex.raw(direction === 'up' ? DATA_HOLD_UP_SQL : 'DROP TABLE web_data_holds');
  if ((await stage(database, family)) !== target)
    throw new Error('data_hold_schema_postcondition_failed');
}

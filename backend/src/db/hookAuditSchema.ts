import type { Knex } from 'knex';
import {
  loadWebBaselineBundle,
  loadWebForwardSchemas,
  type BaselineDatabaseFamily,
} from './webBaselineBundle.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  schemaRows,
  tableMetadataSha256,
  type SchemaDatabase,
} from './schemaPostconditions.js';
import { HOOK_JOURNAL_PREFIX } from './internalWebSettings.js';

export const HOOK_AUDIT_MIGRATION = '20261017002000_hook_audit_identity.ts';
export const HOOK_AUDIT_UP_SQL = `ALTER TABLE admin_action_log
  ADD COLUMN hook_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE INDEX uniq_hook_event_id (hook_event_id)`;
export const HOOK_AUDIT_DOWN_SQL = `ALTER TABLE admin_action_log
  DROP INDEX uniq_hook_event_id,
  DROP COLUMN hook_event_id`;

export function loadHookAuditContract(directory?: string) {
  const entry = loadWebForwardSchemas(loadWebBaselineBundle(), directory).find(
    ({ name }) => name === HOOK_AUDIT_MIGRATION,
  );
  if (
    !entry ||
    JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['admin_action_log']) ||
    !entry.tables.admin_action_log
  )
    throw new Error('Required hook audit schema contract is missing');
  return entry.tables.admin_action_log;
}
async function stage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<'before' | 'after'> {
  const hash = tableMetadataSha256(await readTableMetadata(database, 'admin_action_log', family));
  if (loadSchemaPostconditions().tables.admin_action_log[family].includes(hash)) return 'before';
  if (loadHookAuditContract(directory)[family] === hash) return 'after';
  throw new Error('schema_drift_admin_action_log');
}
export async function matchesHookAuditPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  directory?: string,
): Promise<boolean> {
  loadHookAuditContract(directory);
  const actual = await stage(database, family, directory);
  // Only the exact before/after shapes can retry this idempotent migration.
  return ledger.has(HOOK_AUDIT_MIGRATION) ? actual === 'before' : actual === 'after';
}
export async function migrateHookAuditSchema(knex: Knex, direction: 'up' | 'down'): Promise<void> {
  const database: SchemaDatabase = { query: async (sql, bindings = []) => knex.raw(sql, bindings) };
  const family = await schemaDatabaseFamily(database);
  loadHookAuditContract();
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_hook_audit_migration_invariants');
  const actual = await stage(database, family);
  if (direction === 'down') {
    const journal = await schemaRows(
      database,
      'SELECT COUNT(*) AS count FROM web_settings WHERE setting_key LIKE ?',
      [HOOK_JOURNAL_PREFIX + '%'],
    );
    if (Number(journal[0].count) !== 0) throw new Error('hook_audit_rollback_refuses_journal');
    if (actual === 'after') {
      const identities = await schemaRows(
        database,
        'SELECT COUNT(*) AS count FROM admin_action_log WHERE hook_event_id IS NOT NULL',
      );
      if (Number(identities[0].count) !== 0)
        throw new Error('hook_audit_rollback_refuses_attribution');
    }
  }
  const target = direction === 'up' ? 'after' : 'before';
  if (actual === target) return;
  await knex.raw(direction === 'up' ? HOOK_AUDIT_UP_SQL : HOOK_AUDIT_DOWN_SQL);
  if ((await stage(database, family)) !== target)
    throw new Error('hook_audit_schema_postcondition_failed');
}

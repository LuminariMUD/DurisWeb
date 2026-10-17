import type { Knex } from 'knex';
import {
  type BaselineDatabaseFamily,
  loadWebBaselineBundle,
  loadWebForwardSchemas,
} from './webBaselineBundle.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  schemaRows,
  type SchemaDatabase,
  tableMetadataSha256,
} from './schemaPostconditions.js';

export const SESSION_EXPAND_MIGRATION = '20261017000000_expand_web_session_credentials.ts';
export const SESSION_CUTOVER_MIGRATION = '20261017001000_cutover_web_session_credentials.ts';
type SessionSchemaStage = 'baseline' | 'expanded' | 'contracted';
const stages: SessionSchemaStage[] = ['baseline', 'expanded', 'contracted'];
export function assertSessionMigrationOrder(ledger: readonly string[]): void {
  const expanded = ledger.indexOf(SESSION_EXPAND_MIGRATION);
  const contracted = ledger.indexOf(SESSION_CUTOVER_MIGRATION);
  if (contracted >= 0 && (expanded < 0 || expanded > contracted))
    throw new Error('session_migration_order_invalid');
}
interface SessionContract {
  stages: Record<'expanded' | 'contracted', Record<BaselineDatabaseFamily, string>>;
}

export function loadSessionSchemaContract(directory?: string): SessionContract {
  const forward = loadWebForwardSchemas(loadWebBaselineBundle(), directory);
  const shape = (name: string) => {
    const entry = forward.find((migration) => migration.name === name);
    if (
      !entry ||
      JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['web_sessions']) ||
      !entry.tables.web_sessions
    )
      throw new Error('Required session forward schema contract is missing');
    return entry.tables.web_sessions;
  };
  return {
    stages: {
      expanded: shape(SESSION_EXPAND_MIGRATION),
      contracted: shape(SESSION_CUTOVER_MIGRATION),
    },
  };
}

export async function readSessionSchemaStage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<SessionSchemaStage> {
  const hash = tableMetadataSha256(await readTableMetadata(database, 'web_sessions', family));
  if (loadSchemaPostconditions().tables.web_sessions[family].includes(hash)) return 'baseline';
  const contract = loadSessionSchemaContract(directory);
  for (const stage of ['expanded', 'contracted'] as const)
    if (contract.stages[stage][family] === hash) return stage;
  throw new Error('schema_drift_web_sessions');
}

/** Strict for serving/verification; migrations alone may retry an exact adjacent DDL phase. */
export async function matchesSessionSchemaPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  recoverAdjacentPhase = false,
  directory?: string,
): Promise<boolean> {
  loadSessionSchemaContract(directory);
  const expanded = ledger.has(SESSION_EXPAND_MIGRATION);
  const contracted = ledger.has(SESSION_CUTOVER_MIGRATION);
  if (contracted && !expanded) return false;
  const expected = contracted ? 2 : expanded ? 1 : 0;
  const actual = stages.indexOf(await readSessionSchemaStage(database, family, directory));
  return actual === expected || (recoverAdjacentPhase && Math.abs(actual - expected) === 1);
}

export const SESSION_EXPAND_SQL = `ALTER TABLE web_sessions
  MODIFY refresh_token VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  MODIFY expires_at TIMESTAMP NULL DEFAULT NULL,
  ADD refresh_token_digest BINARY(32) NULL AFTER refresh_token,
  ADD expires_at_epoch BIGINT UNSIGNED NULL AFTER expires_at,
  ADD INDEX idx_expires_epoch (expires_at_epoch)`;
export const SESSION_CONTRACT_SQL = `ALTER TABLE web_sessions
  DROP INDEX idx_expires,
  DROP refresh_token,
  DROP expires_at,
  MODIFY refresh_token_digest BINARY(32) NOT NULL,
  MODIFY expires_at_epoch BIGINT UNSIGNED NOT NULL`;
export const SESSION_REVERSE_CONTRACT_SQL = `ALTER TABLE web_sessions
  ADD refresh_token VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER account_name,
  ADD expires_at TIMESTAMP NULL DEFAULT NULL AFTER refresh_token_digest,
  MODIFY refresh_token_digest BINARY(32) NULL,
  MODIFY expires_at_epoch BIGINT UNSIGNED NULL,
  ADD INDEX idx_expires (expires_at)`;
export const SESSION_REVERSE_EXPAND_SQL = `ALTER TABLE web_sessions
  DROP INDEX idx_expires_epoch,
  DROP refresh_token_digest,
  DROP expires_at_epoch,
  MODIFY refresh_token VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  MODIFY expires_at TIMESTAMP NOT NULL`;

/** Offline, nontransactional DDL. Destructive cutover/rollback requires release authorization. */
export async function migrateWebSessionSchema(
  knex: Knex,
  phase: 'expand' | 'cutover',
  direction: 'up' | 'down',
): Promise<void> {
  const database: SchemaDatabase = {
    query: async (sql, bindings = []) => knex.raw(sql, bindings),
  };
  const family = await schemaDatabaseFamily(database);
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit, @@foreign_key_checks AS foreign_key_checks, @@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_session_migration_invariants');
  const triggers = await schemaRows(
    database,
    "SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='web_sessions'",
  );
  if (Number(triggers[0]?.count) !== 0) throw new Error('unexpected_session_trigger');
  loadSessionSchemaContract();
  if (
    phase === 'cutover' &&
    direction === 'up' &&
    !(await knex('knex_migrations').where({ name: SESSION_EXPAND_MIGRATION }).first('id'))
  )
    throw new Error('session_expansion_not_recorded');
  if (
    phase === 'expand' &&
    direction === 'down' &&
    (await knex('knex_migrations').where({ name: SESSION_CUTOVER_MIGRATION }).first('id'))
  )
    throw new Error('session_cutover_rollback_required_first');
  const current = await readSessionSchemaStage(database, family);
  const from: SessionSchemaStage = phase === 'expand' ? 'baseline' : 'expanded';
  const to: SessionSchemaStage = phase === 'expand' ? 'expanded' : 'contracted';
  const expected = direction === 'up' ? from : to;
  const target = direction === 'up' ? to : from;
  if (current !== expected && current !== target)
    throw new Error('unsupported_session_schema_phase');
  if (current === target) {
    // DDL committed, but Knex may not have received the acknowledgement.
    if (direction === 'down') {
      const [row] = await schemaRows(database, 'SELECT COUNT(*) AS count FROM web_sessions');
      if (Number(row.count) !== 0) throw new Error('session_rollback_requires_empty_store');
    }
    return;
  }
  // Old expiry interpretations are intentionally discarded, never converted.
  // Rollback restores an empty schema and cannot recreate bearer credentials.
  if (phase === 'cutover' || direction === 'down') await knex('web_sessions').delete();
  await knex.raw(
    phase === 'expand'
      ? direction === 'up'
        ? SESSION_EXPAND_SQL
        : SESSION_REVERSE_EXPAND_SQL
      : direction === 'up'
        ? SESSION_CONTRACT_SQL
        : SESSION_REVERSE_CONTRACT_SQL,
  );
  if ((await readSessionSchemaStage(database, family)) !== target)
    throw new Error('session_schema_postcondition_failed');
}

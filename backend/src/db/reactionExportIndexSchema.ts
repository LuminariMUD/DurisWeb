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

export const REACTION_EXPORT_INDEX_MIGRATION = '20261017010000_forum_reaction_export_index.ts';
export const REACTION_EXPORT_INDEX = 'idx_forum_reactions_owner_id';
export const REACTION_EXPORT_INDEX_UP_SQL =
  'ALTER TABLE forum_reactions ADD INDEX idx_forum_reactions_owner_id (user_account_name,id)';
export const REACTION_EXPORT_INDEX_DOWN_SQL =
  'ALTER TABLE forum_reactions DROP INDEX idx_forum_reactions_owner_id';

export function loadReactionExportIndexContract(directory?: string) {
  const entry = loadWebForwardSchemas(loadWebBaselineBundle(), directory).find(
    ({ name }) => name === REACTION_EXPORT_INDEX_MIGRATION,
  );
  if (
    !entry ||
    JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['forum_reactions']) ||
    !entry.tables.forum_reactions
  )
    throw new Error('Required reaction export index contract is missing');
  return entry.tables.forum_reactions;
}
async function stage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<'before' | 'after'> {
  const hash = tableMetadataSha256(await readTableMetadata(database, 'forum_reactions', family));
  if (loadSchemaPostconditions().tables.forum_reactions[family].includes(hash)) return 'before';
  if (loadReactionExportIndexContract(directory)[family] === hash) return 'after';
  throw new Error('schema_drift_forum_reactions');
}
export async function matchesReactionExportIndexPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  directory?: string,
): Promise<boolean> {
  loadReactionExportIndexContract(directory);
  return (
    (await stage(database, family, directory)) ===
    (ledger.has(REACTION_EXPORT_INDEX_MIGRATION) ? 'before' : 'after')
  );
}
export async function migrateReactionExportIndexSchema(
  knex: Knex,
  direction: 'up' | 'down',
): Promise<void> {
  const database: SchemaDatabase = { query: async (sql, bindings = []) => knex.raw(sql, bindings) };
  const family = await schemaDatabaseFamily(database);
  loadReactionExportIndexContract();
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_reaction_export_index_invariants');
  const target = direction === 'up' ? 'after' : 'before';
  if ((await stage(database, family)) === target) return;
  await knex.raw(
    direction === 'up' ? REACTION_EXPORT_INDEX_UP_SQL : REACTION_EXPORT_INDEX_DOWN_SQL,
  );
  if ((await stage(database, family)) !== target)
    throw new Error('reaction_export_index_postcondition_failed');
}

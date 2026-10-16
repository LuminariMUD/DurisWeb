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

export const POST_IMAGE_REMOVAL_MIGRATION = '20261017003000_post_image_removal_intent.ts';
export const POST_IMAGE_REMOVAL_UP_SQL = `ALTER TABLE forum_post_images
  ADD COLUMN removal_requested_at_epoch BIGINT UNSIGNED NULL,
  ADD INDEX idx_post_image_removal (removal_requested_at_epoch,id)`;
export const POST_IMAGE_REMOVAL_DOWN_SQL = `ALTER TABLE forum_post_images
  DROP INDEX idx_post_image_removal,
  DROP COLUMN removal_requested_at_epoch`;

export function loadPostImageRemovalContract(directory?: string) {
  const entry = loadWebForwardSchemas(loadWebBaselineBundle(), directory).find(
    ({ name }) => name === POST_IMAGE_REMOVAL_MIGRATION,
  );
  if (
    !entry ||
    JSON.stringify(Object.keys(entry.tables)) !== JSON.stringify(['forum_post_images']) ||
    !entry.tables.forum_post_images
  )
    throw new Error('Required post image removal contract is missing');
  return entry.tables.forum_post_images;
}
async function stage(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  directory?: string,
): Promise<'before' | 'after'> {
  const hash = tableMetadataSha256(await readTableMetadata(database, 'forum_post_images', family));
  if (loadSchemaPostconditions().tables.forum_post_images[family].includes(hash)) return 'before';
  if (loadPostImageRemovalContract(directory)[family] === hash) return 'after';
  throw new Error('schema_drift_forum_post_images');
}
export async function matchesPostImageRemovalPhase(
  database: SchemaDatabase,
  family: BaselineDatabaseFamily,
  ledger: ReadonlySet<string>,
  directory?: string,
): Promise<boolean> {
  loadPostImageRemovalContract(directory);
  const actual = await stage(database, family, directory);
  return ledger.has(POST_IMAGE_REMOVAL_MIGRATION) ? actual === 'before' : actual === 'after';
}
export async function migratePostImageRemovalSchema(
  knex: Knex,
  direction: 'up' | 'down',
): Promise<void> {
  const database: SchemaDatabase = { query: async (sql, bindings = []) => knex.raw(sql, bindings) };
  const family = await schemaDatabaseFamily(database);
  loadPostImageRemovalContract();
  const [invariants] = await schemaRows(
    database,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants.autocommit) !== 1 ||
    Number(invariants.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants.sql_mode))
  )
    throw new Error('unsafe_post_image_migration_invariants');
  const actual = await stage(database, family);
  if (direction === 'down' && actual === 'after') {
    const pending = await schemaRows(
      database,
      'SELECT COUNT(*) AS count FROM forum_post_images WHERE removal_requested_at_epoch IS NOT NULL',
    );
    if (Number(pending[0].count) !== 0)
      throw new Error('post_image_rollback_refuses_pending_removal');
  }
  const target = direction === 'up' ? 'after' : 'before';
  if (actual === target) return;
  await knex.raw(direction === 'up' ? POST_IMAGE_REMOVAL_UP_SQL : POST_IMAGE_REMOVAL_DOWN_SQL);
  if ((await stage(database, family)) !== target)
    throw new Error('post_image_schema_postcondition_failed');
}

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import knexFactory, { type Knex } from 'knex';
import { getBackendConfiguration } from '../../config/environment.js';
import { WebMigrationSource } from '../webMigrationSource.js';
import { verifiedWebBaselineCoverage } from '../webBaseline.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  tableMetadataSha256,
} from '../schemaPostconditions.js';
import {
  REACTION_EXPORT_INDEX,
  REACTION_EXPORT_INDEX_MIGRATION,
  loadReactionExportIndexContract,
} from '../reactionExportIndexSchema.js';

const port = Number(process.env.TEST_ACCOUNT_EXPORT_DB_PORT);
if (
  process.env.TEST_ACCOUNT_EXPORT_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_NAME !== 'durisweb_qualification_archive_removal_suite')
)
  throw new Error('Reaction index qualification requires the owned export fixture');
const native = port ? describe : describe.skip;
let database: Connection, migration: Knex, source: WebMigrationSource;
let family: Awaited<ReturnType<typeof schemaDatabaseFamily>>;
let rowCount: number;
const owner = 'idx_owner_' + randomUUID().replaceAll('-', '').slice(0, 12);
const shape = async () =>
  tableMetadataSha256(await readTableMetadata(database, 'forum_reactions', family));
const count = async () =>
  Number(
    (await database.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM forum_reactions'))[0][0]
      .count,
  );

native('forward reaction owner index on actual database metadata and query plans', () => {
  beforeAll(async () => {
    const configuration = getBackendConfiguration().database;
    database = await mysql.createConnection(configuration);
    source = new WebMigrationSource(configuration);
    migration = knexFactory({
      client: 'mysql2',
      connection: configuration,
      pool: { min: 0, max: 2 },
      migrations: { migrationSource: source },
    });
    family = await schemaDatabaseFamily(database);
    await database.query('INSERT INTO user_profiles (account_name) VALUES (?)', [owner]);
    const [category] = await database.query<ResultSetHeader>(
      "INSERT INTO forum_categories (name,access_type) VALUES (?,'public')",
      [owner],
    );
    const [thread] = await database.query<ResultSetHeader>(
      'INSERT INTO forum_threads (category_id,author_account_name,title,content,ip_address) VALUES (?,?,?,?,?)',
      [category.insertId, owner, 'Synthetic index fixture', 'Synthetic', 'fixture'],
    );
    const posts = Array.from({ length: 100 }, () => [thread.insertId, owner, 'Synthetic']);
    await database.query(
      'INSERT INTO forum_posts (thread_id,author_account_name,content) VALUES ?',
      [posts],
    );
    const [postIds] = await database.query<RowDataPacket[]>(
      'SELECT id FROM forum_posts WHERE thread_id=? ORDER BY id',
      [thread.insertId],
    );
    const reactions = Array.from({ length: 20000 }, (_, index) => [
      postIds[index % postIds.length].id,
      'idx_other_' + index,
      'x',
    ]);
    reactions.push([postIds[0].id, owner, 'x']);
    await database.query('INSERT INTO forum_reactions (post_id,user_account_name,emoji) VALUES ?', [
      reactions,
    ]);
    rowCount = await count();
  }, 30000);
  afterAll(async () => {
    await migration?.destroy();
    await database?.end();
  });

  it('preserves rows through exact down/up shapes and selects the owner index for the export predicate', async () => {
    expect(await shape()).toBe(loadReactionExportIndexContract()[family]);
    await migration.migrate.down({ name: REACTION_EXPORT_INDEX_MIGRATION });
    expect(loadSchemaPostconditions().tables.forum_reactions[family]).toContain(await shape());
    expect(await count()).toBe(rowCount);
    await migration.migrate.up({ name: REACTION_EXPORT_INDEX_MIGRATION });
    expect(await shape()).toBe(loadReactionExportIndexContract()[family]);
    expect(await count()).toBe(rowCount);
    const [plan] = await database.query<RowDataPacket[]>(
      'EXPLAIN SELECT id,post_id,thread_id,emoji,created_at FROM forum_reactions WHERE user_account_name=? AND BINARY LOWER(user_account_name)=BINARY LOWER(?) ORDER BY id LIMIT 1001',
      [owner, owner],
    );
    expect(plan[0].key).toBe(REACTION_EXPORT_INDEX);
    expect(Number(plan[0].rows)).toBeLessThan(100);
    const [rows] = await database.query<RowDataPacket[]>(
      'SELECT id FROM forum_reactions WHERE user_account_name=? AND BINARY LOWER(user_account_name)=BINARY LOWER(?) ORDER BY id LIMIT 1001',
      [owner, owner],
    );
    expect(rows).toHaveLength(1);
    console.log(
      'Qualified reaction export plan',
      JSON.stringify({
        family,
        key: plan[0].key,
        estimatedRows: plan[0].rows,
        totalRows: rowCount,
      }),
    );
  }, 30000);

  it('recovers only the exact lost up/down acknowledgements through the real migration source', async () => {
    await database.query('DELETE FROM knex_migrations WHERE name=?', [
      REACTION_EXPORT_INDEX_MIGRATION,
    ]);
    await expect(verifiedWebBaselineCoverage(database)).rejects.toMatchObject({
      category: 'schema_drift_forum_reactions',
    });
    await migration.migrate.up({ name: REACTION_EXPORT_INDEX_MIGRATION });
    await expect(verifiedWebBaselineCoverage(database)).resolves.toBeInstanceOf(Set);
    const implementation = await source.getMigration(REACTION_EXPORT_INDEX_MIGRATION);
    if (!implementation.down) throw new Error('Required index down is absent');
    await implementation.down(migration);
    await expect(verifiedWebBaselineCoverage(database)).rejects.toMatchObject({
      category: 'schema_drift_forum_reactions',
    });
    await migration.migrate.down({ name: REACTION_EXPORT_INDEX_MIGRATION });
    expect(loadSchemaPostconditions().tables.forum_reactions[family]).toContain(await shape());
    await migration.migrate.up({ name: REACTION_EXPORT_INDEX_MIGRATION });
    await expect(verifiedWebBaselineCoverage(database)).resolves.toBeInstanceOf(Set);
    expect(await count()).toBe(rowCount);
  }, 30000);

  it('refuses an unreviewed adjacent shape before dropping the owned index', async () => {
    await database.query(
      'ALTER TABLE forum_reactions ADD INDEX idx_reaction_export_unreviewed (emoji)',
    );
    try {
      const implementation = await source.getMigration(REACTION_EXPORT_INDEX_MIGRATION);
      if (!implementation.down) throw new Error('Required index down is absent');
      await expect(implementation.down(migration)).rejects.toThrow('schema_drift_forum_reactions');
      const [indexes] = await database.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='forum_reactions' AND INDEX_NAME=?",
        [REACTION_EXPORT_INDEX],
      );
      expect(Number(indexes[0].count)).toBe(2);
    } finally {
      await database.query('ALTER TABLE forum_reactions DROP INDEX idx_reaction_export_unreviewed');
    }
    expect(await shape()).toBe(loadReactionExportIndexContract()[family]);
  });
});

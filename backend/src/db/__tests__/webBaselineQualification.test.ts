import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
  applyOwnerSchemaFixture,
  ownerMetadataFingerprint,
  readOwnerSchemaFixture,
} from '../../test/ownerSchemaFixture.js';
import { readForumReadiness, validateForumReadiness } from '../../services/forumReadiness.js';
import { readWikiMapReadiness, validateWikiMapReadiness } from '../../services/wikiMapReadiness.js';
import {
  readWikiObjectGeneration,
  readWikiMobGeneration,
  validateWikiObjectGeneration,
  validateWikiMobGeneration,
} from '../../services/wikiGeneration.js';
import {
  externalSchemaSha256,
  runWebBaseline,
  verifiedWebBaselineCoverage,
} from '../webBaseline.js';
import { loadWebBaselineBundle, webBaselineDirectory } from '../webBaselineBundle.js';

const bundle = loadWebBaselineBundle();
const backendRoot = path.resolve(webBaselineDirectory(), '../..');
const source = process.env.TEST_BASELINE_MUD_SOURCE;
const ports = (process.env.TEST_BASELINE_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
if (
  ports.some(
    (port) =>
      !Number.isInteger(port) || port < 1024 || port > 65535 || [3306, 3307, 13306].includes(port),
  )
)
  throw new Error('Select disposable qualification ports');
if (source && ports.length === 0)
  throw new Error('Owner fixture qualification requires explicit disposable ports');

describe('owner schema fixture input boundary', () => {
  it('rejects an unknown owner baseline before any schema application', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-owner-contract-'));
    try {
      fs.writeFileSync(
        path.join(directory, 'migration_manifest.json'),
        JSON.stringify({
          baseline: { id: 'unapproved', required_table_fingerprint: '0'.repeat(64) },
          migrations: [],
        }),
      );
      fs.writeFileSync(path.join(directory, 'runtime_compatibility_manifest.json'), '{}');
      expect(() => readOwnerSchemaFixture(directory)).toThrow(/migration contract is invalid/);
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
});

const inputs = source ? readOwnerSchemaFixture(source) : null;

async function fixture(
  port: number,
  suffix: string,
  work: (database: Connection, name: string) => Promise<void>,
): Promise<void> {
  if (!inputs) throw new Error('Explicit owner source is required');
  const name = `durisweb_qualification_${suffix}_${process.pid}`;
  const database = await mysql.createConnection({
    host: '127.0.0.1',
    port,
    user: 'root',
    multipleStatements: false,
    charset: 'utf8mb4',
  });
  let created = false;
  try {
    await database.query(
      `CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;
    await database.changeUser({ database: name });
    await applyOwnerSchemaFixture(database, port, name, inputs);
    const before = await ownerMetadataFingerprint(database, inputs);
    await work(database, name);
    expect(await ownerMetadataFingerprint(database, inputs)).toBe(before);
  } finally {
    if (created) await database.query(`DROP DATABASE ${name}`);
    await database.end();
  }
}

function sqlClient(port: number, name: string, sql: string): void {
  const result = spawnSync(
    'mysql',
    ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${port}`, '--user=root', name],
    { input: sql, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error('Synthetic fixture SQL client failed');
}

async function populateSyntheticWebsite(database: Connection): Promise<void> {
  await database.query(
    "INSERT INTO forum_categories (name,access_type) VALUES ('Synthetic public forum','public')",
  );
  await database.query(
    "INSERT INTO user_profiles (account_name,bio) VALUES ('FixtureAlice','Synthetic profile'),('FixtureBob','Other synthetic profile')",
  );
  await database.query(
    "INSERT INTO user_profile_stats (account_name,total_posts) VALUES ('FixtureAlice',3),('FixtureBob',7)",
  );
  await database.query(
    "INSERT INTO web_sessions (id,account_name,refresh_token,expires_at) VALUES ('synthetic-session','FixtureAlice','synthetic-refresh',DATE_ADD(NOW(),INTERVAL 1 DAY))",
  );
  await database.query(
    "INSERT INTO notifications (account_name,source,notification_type,message) VALUES ('FixtureAlice','forum','reply','Synthetic reply'),('FixtureBob','forum','reply','Other synthetic reply')",
  );
  await database.query(
    "INSERT INTO website_changelog (version,title,content,category,created_by,is_published) VALUES ('fixture','Synthetic release','<p>Fixture</p>','public','fixture',1)",
  );
  await database.query(
    "INSERT INTO wiki_objects (vnum,name,type,zone_number) VALUES (1,'Synthetic object',1,1)",
  );
  await database.query(
    "INSERT INTO wiki_mobs (zone_number,vnum,name,mob_class,species) VALUES (1,1,'Synthetic mob',1,1)",
  );
  await database.query('INSERT INTO wiki_mob_flags (zone_number,mob_vnum,flag_id) VALUES (1,1,1)');
  await database.query(
    'INSERT INTO wiki_reference_generations (id,source_revision,source_tree,object_count,mob_count,published_at) VALUES (1,?,?,1,1,NOW())',
    ['a'.repeat(40), 'b'.repeat(40)],
  );
  await database.query(
    'INSERT INTO wiki_map_positions (room_vnum,x_coord,y_coord,z_coord,sector_type,zone_number) VALUES (1,0,0,0,0,1)',
  );
  await database.query(
    "INSERT INTO wiki_zone_entrances (from_room_vnum,to_room_vnum,to_zone_number,direction) VALUES (1,2,2,'north')",
  );
}

async function verifyRepresentativeQueries(database: Connection): Promise<void> {
  expect(validateForumReadiness(await readForumReadiness(database))).toEqual([]);
  expect(validateWikiMapReadiness(await readWikiMapReadiness(database))).toEqual([]);
  expect(validateWikiObjectGeneration(await readWikiObjectGeneration(database))).toEqual([]);
  expect(validateWikiMobGeneration(await readWikiMobGeneration(database))).toEqual([]);
  const [profiles] = await database.query<RowDataPacket[]>(
    "SELECT p.account_name,s.total_posts FROM user_profiles p JOIN user_profile_stats s ON s.account_name=p.account_name WHERE p.account_name='FixtureAlice'",
  );
  expect(
    profiles.map(({ account_name, total_posts }) => ({
      account_name,
      total_posts: Number(total_posts),
    })),
  ).toEqual([{ account_name: 'FixtureAlice', total_posts: 3 }]);
  const [sessions] = await database.query<RowDataPacket[]>(
    "SELECT id FROM web_sessions WHERE account_name='FixtureAlice' AND expires_at>NOW()",
  );
  expect(sessions.map(({ id }) => id)).toEqual(['synthetic-session']);
  const [notifications] = await database.query<RowDataPacket[]>(
    "SELECT message FROM notifications WHERE account_name='FixtureAlice'",
  );
  expect(notifications.map(({ message }) => message)).toEqual(['Synthetic reply']);
  const [hooks] = await database.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM web_settings WHERE setting_key LIKE 'hook_enabled_%'",
  );
  expect(Number(hooks[0].count)).toBe(13);
  const [permissions] = await database.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM admin_permissions p JOIN admin_role_permissions rp ON rp.permission_id=p.id JOIN admin_roles r ON r.id=rp.role_id WHERE r.role_name='Full Admin'",
  );
  expect(Number(permissions[0].count)).toBeGreaterThan(0);
  const [analytics] = await database.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS count FROM page_views',
  );
  expect(Number(analytics[0].count)).toBe(0);
}

async function verifySubscriptionConstraint(database: Connection): Promise<void> {
  await database.query('START TRANSACTION');
  try {
    const [thread] = await database.query<ResultSetHeader>(
      "INSERT INTO forum_threads (category_id,author_account_name,title,content) VALUES (1,'FixtureAlice','Constraint fixture','Synthetic content')",
    );
    let caseId = 0;
    for (const type of ['thread', 'category'])
      for (const hasThread of [false, true])
        for (const hasCategory of [false, true]) {
          const valid = type === 'thread' ? hasThread && !hasCategory : hasCategory && !hasThread;
          let accepted = false;
          try {
            await database.query(
              'INSERT INTO forum_subscriptions (user_account_name,subscription_type,thread_id,category_id) VALUES (?,?,?,?)',
              [
                `SubscriptionFixture${caseId++}`,
                type,
                hasThread ? thread.insertId : null,
                hasCategory ? 1 : null,
              ],
            );
            accepted = true;
          } catch (error) {
            const errno =
              error && typeof error === 'object' && 'errno' in error ? Number(error.errno) : 0;
            expect([3819, 4025]).toContain(errno);
          }
          expect(accepted).toBe(valid);
        }
  } finally {
    await database.query('ROLLBACK');
  }
}

async function replayLegacyFixture(
  port: number,
  name: string,
  database: Connection,
): Promise<void> {
  const sql = bundle.manifest.legacySql
    .filter(({ coverage }) => coverage === 'schema')
    .map(({ name: filename }) =>
      fs.readFileSync(path.join(backendRoot, 'migrations', filename), 'utf8'),
    )
    .join('\n\n');
  sqlClient(port, name, sql);
  const user = `dw_qualification_${process.pid}`;
  const password = 'synthetic-qualification-only';
  let userCreated = false;
  try {
    await database.query('CREATE USER ?@? IDENTIFIED BY ?', [user, '%', password]);
    userCreated = true;
    await database.query('GRANT ALL PRIVILEGES ON ??.* TO ?@?', [name, user, '%']);
    const script = `
      import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
      const [root,port,database,user]=process.argv.slice(1);
      const require=createRequire(root+'/package.json');
      await import(pathToFileURL(root+'/src/test/setupEnvironment.ts').href);
      const {loadWebBaselineBundle}=await import(pathToFileURL(root+'/src/db/webBaselineBundle.ts').href);
      const historical=loadWebBaselineBundle().manifest.historicalMigrations.map(({name})=>name);
      const source={getMigrations:async()=>historical,getMigrationName:name=>name,getMigration:async name=>import(pathToFileURL(root+'/migrations/'+name).href)};
      const knex=require('knex')({client:'mysql2',connection:{host:'127.0.0.1',port:Number(port),database,user,password:process.env.DB_PASSWORD},pool:{min:0,max:1},migrations:{migrationSource:source}});
      try{await knex.migrate.latest();console.log('Historical sources executed in synthetic derivation fixture.');}
      finally{await knex.destroy();const {closeDatabaseConnection}=await import(pathToFileURL(root+'/src/db/connection.ts').href);await closeDatabaseConnection();const {default:redis}=await import(pathToFileURL(root+'/src/db/redis.ts').href);redis.disconnect();}
    `;
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        script,
        backendRoot,
        String(port),
        name,
        user,
      ],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TZ: 'UTC',
          DB_HOST: '127.0.0.1',
          DB_PORT: String(port),
          DB_NAME: name,
          DB_USER: user,
          DB_PASSWORD: password,
          CACHE_REDIS_HOST: '127.0.0.1',
          CACHE_REDIS_PORT: '23379',
          CACHE_REDIS_DB: '15',
          MUD_DIR: '/tmp/durisweb-qualification-mud',
          MUD_WS_URL: 'ws://127.0.0.1:23450',
          DOTENV_CONFIG_QUIET: 'true',
        },
        encoding: 'utf8',
        timeout: 45000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toContain('Historical sources executed');
  } finally {
    if (userCreated) await database.query('DROP USER ?@?', [user, '%']);
  }
}

if (inputs)
  for (const port of ports) {
    describe(`full owner-schema qualification on disposable port ${port}`, () => {
      it('installs the web baseline without changing the published full owner metadata and keeps readiness honest', async () => {
        await fixture(port, 'fresh', async (database) => {
          const expected = await externalSchemaSha256(database, bundle);
          await runWebBaseline(database, 'bootstrap', expected);
          expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
          expect(validateForumReadiness(await readForumReadiness(database))).not.toEqual([]);
          expect(validateWikiMapReadiness(await readWikiMapReadiness(database))).not.toEqual([]);
          expect(
            validateWikiObjectGeneration(await readWikiObjectGeneration(database)),
          ).not.toEqual([]);
          expect(validateWikiMobGeneration(await readWikiMobGeneration(database))).not.toEqual([]);
          await populateSyntheticWebsite(database);
          await verifyRepresentativeQueries(database);
          await verifySubscriptionConstraint(database);
        });
      }, 60000);

      it('restores genuinely replayed synthetic web history and adopts it without rewriting its ledger or data', async () => {
        await fixture(port, 'legacy', async (legacy, legacyName) => {
          await replayLegacyFixture(port, legacyName, legacy);
          await populateSyntheticWebsite(legacy);
          const [before] = await legacy.query('SELECT * FROM knex_migrations ORDER BY id');
          const tables = [
            ...bundle.tables.map(({ name }) => name),
            'knex_migrations',
            'knex_migrations_lock',
          ];
          const dump = spawnSync(
            'mysqldump',
            [
              '--no-defaults',
              '--protocol=TCP',
              '--host=127.0.0.1',
              `--port=${port}`,
              '--user=root',
              '--single-transaction',
              '--no-tablespaces',
              '--skip-comments',
              '--skip-add-locks',
              legacyName,
              ...tables,
            ],
            { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
          );
          expect(dump.status).toBe(0);
          await fixture(port, 'restored', async (restored, restoredName) => {
            sqlClient(port, restoredName, dump.stdout);
            const expected = await externalSchemaSha256(restored, bundle);
            await runWebBaseline(restored, 'adopt', expected);
            expect(await verifiedWebBaselineCoverage(restored)).toEqual(new Set());
            const [after] = await restored.query('SELECT * FROM knex_migrations ORDER BY id');
            expect(after).toEqual(before);
            await verifyRepresentativeQueries(restored);
            await verifySubscriptionConstraint(restored);
          });
        });
      }, 120000);
    });
  }

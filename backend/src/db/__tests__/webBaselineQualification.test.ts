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
import { loadWebBaselineBundle, sha256, webBaselineDirectory } from '../webBaselineBundle.js';

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
      expect(() => readOwnerSchemaFixture(directory)).toThrow(/published checksum differs/);
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
});

const inputs = source ? readOwnerSchemaFixture(source) : null;

if (source) {
  it('rejects a self-consistent replacement migration manifest and SQL', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-owner-replacement-'));
    try {
      fs.cpSync(source, directory, { recursive: true });
      const filename = path.join(directory, 'migration_manifest.json');
      const manifest = JSON.parse(fs.readFileSync(filename, 'utf8')) as {
        migrations: { apply: string; apply_checksum: string }[];
      };
      const migration = path.join(directory, manifest.migrations[0].apply);
      fs.appendFileSync(migration, '\nSELECT 1;\n');
      manifest.migrations[0].apply_checksum = sha256(fs.readFileSync(migration, 'utf8'));
      fs.writeFileSync(filename, JSON.stringify(manifest));
      expect(() => readOwnerSchemaFixture(directory)).toThrow(
        'Owner fixture published checksum differs: migration_manifest.json',
      );
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });

  it.each([
    'bootstrap_multithread_safe.sql',
    'migration_manifest.json',
    'runtime_compatibility_manifest.json',
  ])('rejects modified owner input %s even when metadata would be unchanged', (filename) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-owner-pins-'));
    try {
      fs.cpSync(source, directory, { recursive: true });
      fs.appendFileSync(path.join(directory, filename), '\n');
      expect(() => readOwnerSchemaFixture(directory)).toThrow(
        `Owner fixture published checksum differs: ${filename}`,
      );
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
}

for (const port of ports) {
  it(`enforces database-scoped fixture privileges and removes accounts at port ${port}`, async () => {
    const database = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' });
    const name = `durisweb_qualification_scope_${process.pid}`;
    // Would match an unescaped GRANT pattern because underscores are wildcards.
    const adjacent = name.replaceAll('_', 'x');
    const [usersBefore] = await database.query(
      "SELECT User,Host FROM mysql.user WHERE User LIKE 'dw_fixture_%' ORDER BY User,Host",
    );
    try {
      await database.query(`CREATE DATABASE ${name}`);
      await database.query(`CREATE DATABASE ${adjacent}`);
      await database.query(`CREATE TABLE ${adjacent}.sentinel (id INT PRIMARY KEY)`);
      await database.query(`INSERT INTO ${adjacent}.sentinel VALUES (42)`);
      await database.changeUser({ database: name });
      const fixtureInput = {
        sql: '',
        headId: 'synthetic',
        tableList: "'probe'",
        tableCount: 1,
        expected: { mysql8: '', mariadb10_11: '' },
      };
      for (const sql of [
        `INSERT INTO ${adjacent}.sentinel VALUES (43);`,
        `DROP TABLE ${adjacent}.sentinel;`,
        `CREATE DATABASE ${name}_escape;`,
      ]) {
        await expect(
          applyOwnerSchemaFixture(database, port, name, { ...fixtureInput, sql }),
        ).rejects.toThrow('Owner fixture SQL application failed');
        const [rows] = await database.query(`SELECT * FROM ${adjacent}.sentinel`);
        expect(rows).toEqual([{ id: 42 }]);
      }
      await applyOwnerSchemaFixture(database, port, name, {
        ...fixtureInput,
        sql: 'CREATE TABLE probe (id INT); INSERT INTO probe VALUES (7);',
      });
      const [rows] = await database.query('SELECT * FROM probe');
      expect(rows).toEqual([{ id: 7 }]);
      const [usersAfter] = await database.query(
        "SELECT User,Host FROM mysql.user WHERE User LIKE 'dw_fixture_%' ORDER BY User,Host",
      );
      expect(usersAfter).toEqual(usersBefore);
    } finally {
      await database.query(`DROP DATABASE IF EXISTS ${name}`);
      await database.query(`DROP DATABASE IF EXISTS ${adjacent}`);
      await database.query(`DROP DATABASE IF EXISTS ${name}_escape`);
      await database.end();
    }
  }, 60000);
}

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
    "INSERT INTO builder_settings (account_name,setting_key,setting_value) VALUES ('FixtureAlice','editor_theme','synthetic-theme'),('FixtureBob','editor_theme','other-theme')",
  );
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
  const [builder] = await database.query<RowDataPacket[]>(
    "SELECT setting_value FROM builder_settings WHERE account_name='FixtureAlice' AND setting_key='editor_theme'",
  );
  expect(builder.map(({ setting_value }) => setting_value)).toEqual(['synthetic-theme']);
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
      try{
        await knex.migrate.latest();
        const original=await knex('knex_migrations').select('*').orderBy('id');
        if(original.length!==85||await knex.schema.hasTable('builder_settings'))throw new Error('Unexpected historical fixture');
        const {WebMigrationSource}=await import(pathToFileURL(root+'/src/db/webMigrationSource.ts').href);
        const current=new WebMigrationSource({host:'127.0.0.1',port:Number(port),database,user,password:process.env.DB_PASSWORD});
        const name='20261016230000_repair_builder_settings.ts';
        await knex.migrate.up({name,migrationSource:current});
        await knex('builder_settings').insert({account_name:'SyntheticRollback',setting_key:'theme',setting_value:'synthetic'});
        try{await knex.migrate.down({name,migrationSource:current});throw new Error('Rollback deleted user data');}
        catch(error){if(!error.message.includes('refuses user data'))throw error;}
        await knex('builder_settings').where({account_name:'SyntheticRollback'}).delete();
        await knex.migrate.down({name,migrationSource:current});
        if(await knex.schema.hasTable('builder_settings'))throw new Error('Empty legacy repair did not reverse');
        await knex.migrate.up({name,migrationSource:current});
        const after=await knex('knex_migrations').whereIn('name',historical).select('*').orderBy('id');
        if(JSON.stringify(after)!==JSON.stringify(original))throw new Error('Historical ledger changed');
        console.log('Historical sources executed in synthetic derivation fixture.');
      }
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
            await restored.query(
              'ALTER TABLE web_settings PARTITION BY KEY(setting_key) PARTITIONS 2',
            );
            await expect(runWebBaseline(restored, 'adopt', expected)).rejects.toThrow(
              /Noncanonical schema table options or partitions/,
            );
            await restored.query('ALTER TABLE web_settings REMOVE PARTITIONING');
            await runWebBaseline(restored, 'adopt', expected);
            expect(await verifiedWebBaselineCoverage(restored)).toEqual(new Set());
            const rollback = spawnSync(
              process.execPath,
              [
                '--import',
                'tsx',
                '--input-type=module',
                '--eval',
                `
                import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
                const [root,port,database]=process.argv.slice(1);
                const require=createRequire(root+'/package.json');
                const {WebMigrationSource}=await import(pathToFileURL(root+'/src/db/webMigrationSource.ts').href);
                const connection={host:'127.0.0.1',port:Number(port),user:'root',password:'',database};
                const knex=require('knex')({client:'mysql2',connection,pool:{min:0,max:1},migrations:{migrationSource:new WebMigrationSource(connection)}});
                try{
                  try{await knex.migrate.down({name:'20261016230000_repair_builder_settings.ts'});throw new Error('Adopted table was removed');}
                  catch(error){if(!error.message.includes('do not roll back across adoption'))throw error;}
                  console.log('Adopted builder settings retained.');
                }finally{await knex.destroy();}
              `,
                backendRoot,
                String(port),
                restoredName,
              ],
              { cwd: backendRoot, encoding: 'utf8', timeout: 30000 },
            );
            expect({ status: rollback.status, stderr: rollback.stderr }).toEqual({
              status: 0,
              stderr: '',
            });
            expect(rollback.stdout).toContain('Adopted builder settings retained');
            const [after] = await restored.query('SELECT * FROM knex_migrations ORDER BY id');
            expect(after).toEqual(before);
            await verifyRepresentativeQueries(restored);
            await verifySubscriptionConstraint(restored);
          });
        });
      }, 120000);
    });
  }

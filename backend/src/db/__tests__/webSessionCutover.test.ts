import { describe, expect, it } from '@jest/globals';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import {
  applyOwnerSchemaFixture,
  ownerMetadataFingerprint,
  readOwnerSchemaFixture,
} from '../../test/ownerSchemaFixture.js';
import { schemaDatabaseFamily } from '../schemaPostconditions.js';
import {
  externalSchemaSha256,
  runWebBaseline,
  verifiedWebBaselineCoverage,
} from '../webBaseline.js';
import { loadWebBaselineBundle, webBaselineDirectory } from '../webBaselineBundle.js';
import {
  matchesSessionSchemaPhase,
  readSessionSchemaStage,
  SESSION_CUTOVER_MIGRATION,
  SESSION_EXPAND_MIGRATION,
} from '../webSessionSchema.js';

const root = path.resolve(webBaselineDirectory(), '../..');
const bundle = loadWebBaselineBundle();
const probeUser = `dw_session_probe_${process.pid}`;
const probePassword = 'synthetic-session-qualification-only';
const ports = (process.env.TEST_SESSION_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
if (ports.some((port) => ![23436, 23437].includes(port)))
  throw new Error('Session matrix requires its dedicated disposable servers on 23436/23437');
const source = process.env.TEST_BASELINE_MUD_SOURCE;
if (ports.length && !source)
  throw new Error('Session qualification requires explicit owner schema inputs');

describe('session schema source contract', () => {
  it('refuses contraction recorded without its expansion instead of authorizing a schema phase', async () => {
    expect(
      await matchesSessionSchemaPhase(
        {
          query: async () => {
            throw new Error('Must reject before database access');
          },
        },
        'mysql8',
        new Set([SESSION_CUTOVER_MIGRATION]),
      ),
    ).toBe(false);
  });
});

function migrate(
  port: number,
  database: string,
  direction: 'up' | 'down',
  name: string,
  interrupted = false,
): void {
  const script = `
    import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
    const [root,port,database,direction,name,interrupted]=process.argv.slice(1);
    const require=createRequire(root+'/package.json');
    const {WebMigrationSource}=await import(pathToFileURL(root+'/src/db/webMigrationSource.ts').href);
    const connection={host:'127.0.0.1',port:Number(port),database,user:'root',password:''};
    const knex=require('knex')({client:'mysql2',connection,pool:{min:0,max:1},migrations:{migrationSource:new WebMigrationSource(connection)},log:{warn:()=>{},error:()=>{}}});
    if(interrupted==='true'){
      const original=knex.client.query.bind(knex.client);let injected=false;
      knex.client.query=async(connection,query)=>{
        const result=await original(connection,query);
        if(!injected&&query.sql.startsWith('ALTER TABLE web_sessions')){
          injected=true;throw new Error('synthetic_after_ddl_commit');
        }
        return result;
      };
    }
    try{
      try{await knex.migrate[direction]({name});if(interrupted==='true')throw new Error('Expected interrupted DDL');}
      catch(error){if(interrupted!=='true'||!error.message.includes('synthetic_after_ddl_commit'))throw error;}
      console.log('Session migration operation verified.');
    }finally{await knex.destroy();}
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      script,
      root,
      String(port),
      database,
      direction,
      name,
      String(interrupted),
    ],
    { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  expect(result.stdout).toContain('Session migration operation verified');
}

function probe(port: number, database: string, timeZone: string, mode = 'matrix'): void {
  const options = {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TZ: timeZone,
      TEST_SESSION_TIMEZONE_PROBE: '1',
      DB_HOST: '127.0.0.1',
      DB_PORT: String(port),
      DB_NAME: database,
      DB_USER: probeUser,
      DB_PASSWORD: probePassword,
      CACHE_REDIS_HOST: '127.0.0.1',
      CACHE_REDIS_PORT: '23479',
      CACHE_REDIS_DB: '15',
      MUD_DIR: '/tmp/durisweb-session-qualification-mud',
      MUD_WS_URL: 'ws://127.0.0.1:23450',
      DOTENV_CONFIG_QUIET: 'true',
    },
    encoding: 'utf8' as const,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  };
  if (mode === 'expanded') {
    const args = ['--import', 'tsx', 'src/scripts/checkSessionCutover.ts', '--target'];
    const mismatch = spawnSync(process.execPath, [...args, 'wrong-target'], options);
    expect(mismatch.status).toBe(1);
    const write = spawnSync(process.execPath, [...args, `127.0.0.1:${port}/${database}`], options);
    expect({ status: write.status, stderr: write.stderr }).toEqual({ status: 0, stderr: '' });
    expect(write.stdout).toContain('probe row removed');
  }
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/test/sessionTimezoneProbe.ts', mode],
    options,
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  expect(result.stdout).toContain(
    mode === 'expanded'
      ? 'Expanded schema refuses incomplete'
      : 'Session HTTP timezone matrix passed',
  );
}

for (const port of ports)
  describe(`session cutover and HTTP timezone qualification on ${port}`, () => {
    it('preserves the full owner schema, retries actual DDL acknowledgements, and honors binding/expiry across app/database offsets and DST', async () => {
      const database = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        charset: 'utf8mb4',
      });
      const name = `durisweb_qualification_sessions_${process.pid}`;
      let created = false;
      let userCreated = false;
      let originalTimeZone: string | undefined;
      try {
        await database.query(
          `CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        created = true;
        await database.changeUser({ database: name });
        const inputs = readOwnerSchemaFixture(source!);
        await applyOwnerSchemaFixture(database, port, name, inputs);
        const ownerBefore = await ownerMetadataFingerprint(database, inputs);
        const family = await schemaDatabaseFamily(database);
        await runWebBaseline(database, 'bootstrap', await externalSchemaSha256(database, bundle));
        await database.query('CREATE USER ?@? IDENTIFIED BY ?', [probeUser, '%', probePassword]);
        userCreated = true;
        await database.query('GRANT ALL PRIVILEGES ON ??.* TO ?@?', [name, probeUser, '%']);
        await database.query(
          "INSERT INTO web_sessions (id,account_name,refresh_token,expires_at) VALUES ('legacy','SyntheticLegacy','synthetic-legacy-credential',DATE_ADD(NOW(),INTERVAL 1 DAY))",
        );
        const [oldColumns] = await database.query<RowDataPacket[]>(
          "SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_sessions' AND COLUMN_NAME='expires_at'",
        );
        expect(oldColumns.map(({ DATA_TYPE }) => DATA_TYPE)).toEqual(['timestamp']);
        migrate(port, name, 'up', SESSION_EXPAND_MIGRATION, true);
        expect(await readSessionSchemaStage(database, family)).toBe('expanded');
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /schema_drift_web_sessions/,
        );
        migrate(port, name, 'up', SESSION_EXPAND_MIGRATION);
        expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
        probe(port, name, 'UTC', 'expanded');
        migrate(port, name, 'up', SESSION_CUTOVER_MIGRATION, true);
        expect(await readSessionSchemaStage(database, family)).toBe('contracted');
        const [emptied] = await database.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM web_sessions',
        );
        expect(Number(emptied[0].count)).toBe(0);
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /schema_drift_web_sessions/,
        );
        await database.query(
          "INSERT INTO web_sessions (id,account_name,refresh_token_digest,expires_at_epoch) VALUES ('acknowledged','SyntheticNew',UNHEX(SHA2('synthetic-new-credential',256)),UNIX_TIMESTAMP()+300)",
        );
        migrate(port, name, 'up', SESSION_CUTOVER_MIGRATION);
        const [preserved] = await database.query<RowDataPacket[]>('SELECT id FROM web_sessions');
        expect(preserved.map(({ id }) => id)).toEqual(['acknowledged']);
        await database.query("DELETE FROM web_sessions WHERE id='acknowledged'");
        await database.query('START TRANSACTION');
        try {
          await database.query('DELETE FROM knex_migrations WHERE name=?', [
            SESSION_EXPAND_MIGRATION,
          ]);
          await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
            /session_migration_order_invalid/,
          );
        } finally {
          await database.query('ROLLBACK'); // Restore truthful original history; no fabricated rows.
        }
        const [global] = await database.query<RowDataPacket[]>('SELECT @@global.time_zone AS zone');
        originalTimeZone = String(global[0].zone);
        for (const databaseZone of ['+00:00', '+03:00', '-07:00']) {
          // These two containers were created solely for this matrix. Restore the
          // default afterwards; never use the shared baseline/dev servers here.
          await database.query('SET GLOBAL time_zone=?', [databaseZone]);
          for (const applicationZone of ['UTC', 'Asia/Jerusalem', 'America/Los_Angeles'])
            probe(port, name, applicationZone);
        }
        await database.query('SET GLOBAL time_zone=?', [originalTimeZone]);
        originalTimeZone = undefined;
        migrate(port, name, 'down', SESSION_CUTOVER_MIGRATION, true);
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /schema_drift_web_sessions/,
        );
        migrate(port, name, 'down', SESSION_CUTOVER_MIGRATION);
        expect(await readSessionSchemaStage(database, family)).toBe('expanded');
        migrate(port, name, 'down', SESSION_EXPAND_MIGRATION, true);
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /schema_drift_web_sessions/,
        );
        migrate(port, name, 'down', SESSION_EXPAND_MIGRATION);
        expect(await readSessionSchemaStage(database, family)).toBe('baseline');
        const [empty] = await database.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM web_sessions',
        );
        expect(Number(empty[0].count)).toBe(0);
        migrate(port, name, 'up', SESSION_EXPAND_MIGRATION);
        migrate(port, name, 'up', SESSION_CUTOVER_MIGRATION);
        const [ledger] = await database.query<RowDataPacket[]>(
          'SELECT name FROM knex_migrations ORDER BY name',
        );
        expect(ledger.map(({ name: filename }) => filename)).toEqual([
          SESSION_EXPAND_MIGRATION,
          SESSION_CUTOVER_MIGRATION,
        ]);
        expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
        expect(await ownerMetadataFingerprint(database, inputs)).toBe(ownerBefore);
      } finally {
        if (originalTimeZone !== undefined)
          await database.query('SET GLOBAL time_zone=?', [originalTimeZone]);
        if (userCreated) await database.query('DROP USER ?@?', [probeUser, '%']);
        if (created) await database.query(`DROP DATABASE ${name}`);
        await database.end();
      }
    }, 240000);
  });

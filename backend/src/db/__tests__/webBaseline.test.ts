import { describe, expect, it } from '@jest/globals';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadMudWriteAllowlist } from '../../scripts/verifyMudWriteAllowlist.js';
import { parseBaselineArguments } from '../../scripts/webBaseline.js';
import {
  type BaselineDatabase,
  externalSchemaSha256,
  runWebBaseline,
  verifiedWebBaselineCoverage,
} from '../webBaseline.js';
import {
  installedTableSha256,
  loadWebBaselineBundle,
  sha256,
  webBaselineDirectory,
} from '../webBaselineBundle.js';

const bundle = loadWebBaselineBundle();
const ports = (process.env.TEST_BASELINE_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
if (
  ports.some(
    (port) =>
      !Number.isInteger(port) || port < 1024 || port > 65535 || [3306, 3307, 13306].includes(port),
  )
)
  throw new Error('Select disposable loopback ports only');

describe('baseline operator arguments', () => {
  it('requires a target and an approved hash for every mutation', () => {
    expect(parseBaselineArguments(['inspect', '--target', '127.0.0.1:23336/test']).action).toBe(
      'inspect',
    );
    for (const action of ['bootstrap', 'adopt', 'verify', 'teardown']) {
      expect(() => parseBaselineArguments([action, '--target', 'test'])).toThrow(/explicit_target/);
      expect(
        parseBaselineArguments([action, '--target', 'test', '--mud-schema-sha256', 'a'.repeat(64)])
          .action,
      ).toBe(action);
    }
    expect(() =>
      parseBaselineArguments(['bootstrap', '--target', 'test', '--target', 'test']),
    ).toThrow(/invalid_arguments/);
    expect(() => parseBaselineArguments(['bootstrap', '--unknown', 'test'])).toThrow(
      /invalid_arguments/,
    );
  });
});

async function fixture(
  port: number,
  work: (database: Connection, expected: string, name: string) => Promise<void>,
): Promise<void> {
  const database = await mysql.createConnection({
    host: '127.0.0.1',
    port,
    user: 'root',
    multipleStatements: false,
  });
  const name = 'durisweb_baseline_engine_test';
  let created = false;
  try {
    await database.query(
      `CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;
    await database.changeUser({ database: name });
    // Synthetic names/metadata exercise the externally approved hash contract.
    // They do not stand in for a verified full MUD-owned schema.
    const inventory = loadMudWriteAllowlist(path.resolve(webBaselineDirectory(), '../..'));
    for (const table of [
      ...inventory.mudOwnedTables,
      ...bundle.manifest.additionalMudOwnedTables,
    ]) {
      await database.query('CREATE TABLE ?? (sentinel_id INT PRIMARY KEY) ENGINE=InnoDB', [table]);
    }
    await database.query('INSERT INTO accounts VALUES (42)');
    const expected = await externalSchemaSha256(database, bundle);
    await work(database, expected, name);
    expect(await externalSchemaSha256(database, bundle)).toBe(expected);
    const [accounts] = await database.query<RowDataPacket[]>('SELECT * FROM accounts');
    expect(accounts).toEqual([{ sentinel_id: 42 }]);
  } finally {
    if (created) await database.query(`DROP DATABASE ${name}`);
    await database.end();
  }
}

for (const port of ports) {
  describe(`guarded website baseline on disposable port ${port}`, () => {
    it('refuses an unrecorded matching object created after initial inspection', async () => {
      await fixture(port, async (database, expected) => {
        let injected = false;
        const raced: BaselineDatabase = {
          query: async (sql, bindings) => {
            const result = await database.query(sql, bindings);
            if (!injected && sql.startsWith('INSERT INTO web_schema_baselines ')) {
              injected = true;
              await database.query(bundle.tables[0].sql);
            }
            return result;
          },
        };
        await expect(runWebBaseline(raced, 'bootstrap', expected)).rejects.toThrow(
          /unrecorded_existing_web_schema/,
        );
        const [records] = await database.query<RowDataPacket[]>(
          'SELECT journal FROM web_schema_baselines',
        );
        expect(JSON.parse(String(records[0].journal))).toEqual({
          completed: [],
          pending: null,
          seeded: false,
        });
        await database.query('DROP TABLE ??', [bundle.tables[0].name]);
        await runWebBaseline(database, 'bootstrap', expected);
      });
    }, 60000);

    it('refuses nondurable or weakened sessions before writing installation progress', async () => {
      await fixture(port, async (database, expected) => {
        const [original] = await database.query<RowDataPacket[]>('SELECT @@sql_mode AS mode');
        for (const statement of [
          'SET autocommit=0',
          'SET foreign_key_checks=0',
          "SET sql_mode=''",
        ]) {
          try {
            await database.query(statement);
            await expect(runWebBaseline(database, 'bootstrap', expected)).rejects.toThrow(
              /unsafe_database_session_invariants/,
            );
            const [metadata] = await database.query<RowDataPacket[]>(
              "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_schema_baselines'",
            );
            expect(metadata).toEqual([]);
          } finally {
            await database.query('SET autocommit=1');
            await database.query('SET foreign_key_checks=1');
            await database.query('SET sql_mode=?', [String(original[0].mode)]);
          }
        }
        await runWebBaseline(database, 'bootstrap', expected);
      });
    }, 60000);

    it('runs the actual operator CLI with isolated credentials and explicit target confirmation', async () => {
      await fixture(port, async (database, expected, name) => {
        const user = 'durisweb_baseline_cli_fixture';
        const password = 'synthetic-baseline-fixture-only';
        let userCreated = false;
        try {
          await database.query('CREATE USER ?@? IDENTIFIED BY ?', [user, '%', password]);
          userCreated = true;
          await database.query('GRANT ALL PRIVILEGES ON ??.* TO ?@?', [name, user, '%']);
          const environment = {
            ...process.env,
            DB_HOST: '127.0.0.1',
            DB_PORT: String(port),
            DB_NAME: name,
            DB_USER: user,
            DB_PASSWORD: password,
            DOTENV_CONFIG_QUIET: 'true',
          };
          const run = (target: string) =>
            spawnSync(
              process.execPath,
              [
                '--import',
                'tsx',
                'src/scripts/webBaseline.ts',
                'bootstrap',
                '--target',
                target,
                '--mud-schema-sha256',
                expected,
              ],
              {
                cwd: path.resolve(webBaselineDirectory(), '../..'),
                env: environment,
                encoding: 'utf8',
                timeout: 45000,
              },
            );
          const mismatch = run('wrong-target');
          expect(mismatch.status).toBe(1);
          expect(mismatch.stderr).toContain('configured_target_mismatch');
          const result = run(`127.0.0.1:${port}/${name}`);
          expect({ status: result.status, stderr: result.stderr }).toEqual({
            status: 0,
            stderr: '',
          });
          expect(result.stdout).toContain('bootstrap verified');
          expect(result.stdout + result.stderr).not.toContain(password);
          expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
          for (const command of [
            'migrate:latest',
            'migrate:latest',
            'migrate:rollback',
            'migrate:status',
          ]) {
            const migrated = spawnSync('pnpm', ['--dir', 'backend', command], {
              cwd: path.resolve(webBaselineDirectory(), '../../..'),
              env: environment,
              encoding: 'utf8',
              timeout: 45000,
            });
            expect({ command, status: migrated.status, stderr: migrated.stderr }).toEqual({
              command,
              status: 0,
              stderr: '',
            });
            expect(migrated.stdout).not.toContain('resets migrationSource');
          }
          const [ledger] = await database.query('SELECT name FROM knex_migrations');
          expect(ledger).toEqual([]);
        } finally {
          if (userCreated) await database.query('DROP USER ?@?', [user, '%']);
        }
      });
    }, 60000);

    it('verifies altered baseline tables through real Knex forward/down/forward and rejects unrelated drift', async () => {
      await fixture(port, async (database, expected, name) => {
        await runWebBaseline(database, 'bootstrap', expected);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-forward-migration-'));
        const backendRoot = path.resolve(webBaselineDirectory(), '../..');
        try {
          fs.cpSync(path.join(backendRoot, 'migrations'), directory, { recursive: true });
          const migrationName = '20261017000000_synthetic_forward.ts';
          const migration = `
            import type { Knex } from 'knex';
            export async function up(knex:Knex):Promise<void>{await knex.raw('ALTER TABLE web_sessions ADD COLUMN forward_value INT');await knex.raw('CREATE TABLE web_synthetic_forward (id INT PRIMARY KEY) ENGINE=InnoDB');}
            export async function down(knex:Knex):Promise<void>{await knex.raw('DROP TABLE web_synthetic_forward');await knex.raw('ALTER TABLE web_sessions DROP COLUMN forward_value');}
          `;
          fs.writeFileSync(path.join(directory, migrationName), migration);
          await database.query('ALTER TABLE web_sessions ADD COLUMN forward_value INT');
          const [ddl] = await database.query<RowDataPacket[]>('SHOW CREATE TABLE web_sessions');
          const [version] = await database.query<RowDataPacket[]>('SELECT VERSION() AS version');
          const product = String(version[0].version).includes('MariaDB') ? 'mariadb11' : 'mysql8';
          const shape = {
            ...bundle.tables.find(({ name }) => name === 'web_sessions')!.installedSha256,
          };
          shape[product] = installedTableSha256(String(ddl[0]['Create Table']));
          await database.query(
            'CREATE TABLE web_synthetic_forward (id INT PRIMARY KEY) ENGINE=InnoDB',
          );
          const [newDDL] = await database.query<RowDataPacket[]>(
            'SHOW CREATE TABLE web_synthetic_forward',
          );
          const addedShape = { mysql8: 'a'.repeat(64), mariadb11: 'a'.repeat(64) };
          addedShape[product] = installedTableSha256(String(newDDL[0]['Create Table']));
          await database.query('ALTER TABLE web_sessions MODIFY forward_value BIGINT');
          const [secondDDL] = await database.query<RowDataPacket[]>(
            'SHOW CREATE TABLE web_sessions',
          );
          const secondShape = {
            ...shape,
            [product]: installedTableSha256(String(secondDDL[0]['Create Table'])),
          };
          await database.query('DROP TABLE web_synthetic_forward');
          await database.query('ALTER TABLE web_sessions DROP COLUMN forward_value');
          fs.writeFileSync(
            path.join(directory, migrationName.replace('.ts', '.schema.json')),
            JSON.stringify({
              sha256: sha256(migration),
              tables: { web_sessions: shape, web_synthetic_forward: addedShape },
            }),
          );
          const secondName = '20261018000000_synthetic_forward.ts';
          const secondMigration = `
            import type { Knex } from 'knex';
            export async function up(knex:Knex):Promise<void>{await knex.raw('ALTER TABLE web_sessions MODIFY forward_value BIGINT');await knex.raw('DROP TABLE web_synthetic_forward');}
            export async function down(knex:Knex):Promise<void>{await knex.raw('CREATE TABLE web_synthetic_forward (id INT PRIMARY KEY) ENGINE=InnoDB');await knex.raw('ALTER TABLE web_sessions MODIFY forward_value INT');}
          `;
          fs.writeFileSync(path.join(directory, secondName), secondMigration);
          fs.writeFileSync(
            path.join(directory, secondName.replace('.ts', '.schema.json')),
            JSON.stringify({
              sha256: sha256(secondMigration),
              tables: { web_sessions: secondShape, web_synthetic_forward: null },
            }),
          );
          const script = `
            import {createRequire} from 'node:module';
            import {pathToFileURL} from 'node:url';
            import fs from 'node:fs';
            const [root,port,database,directory]=process.argv.slice(1);
            const require=createRequire(root+'/package.json');
            const {WebMigrationSource}=await import(pathToFileURL(root+'/src/db/webMigrationSource.ts').href);
            const {verifiedWebBaselineCoverage}=await import(pathToFileURL(root+'/src/db/webBaseline.ts').href);
            const connection={host:'127.0.0.1',port:Number(port),user:'root',password:'',database};
            const source=new WebMigrationSource(connection,directory);
            const knex=require('knex')({client:'mysql2',connection,pool:{min:0,max:1},migrations:{migrationSource:source}});
            const probe=await require('mysql2/promise').createConnection(connection);
            const available=fs.readdirSync(directory).filter(name=>name.endsWith('.ts'));
            try{
              for(const action of ['latest','latest','rollback','latest']) {
                await knex.migrate[action]();
                if((await verifiedWebBaselineCoverage(probe,available,directory)).size!==85) throw new Error('coverage lost');
              }
              await knex.migrate.down();
              if((await verifiedWebBaselineCoverage(probe,available,directory)).size!==85) throw new Error('preceding forward state lost');
              await knex.migrate.up();
              await probe.query('ALTER TABLE web_sessions ADD COLUMN unexpected INT');
              try {
                await source.getMigrations();
                throw new Error('unrelated drift was accepted');
              } catch(error) {
                if(!error.message.includes('schema_drift_web_sessions')) throw error;
              } finally {await probe.query('ALTER TABLE web_sessions DROP COLUMN unexpected');}
              const applied=await knex('knex_migrations').select('name');
              if(applied.length!==2||applied[0].name!=='20261017000000_synthetic_forward.ts'||applied[1].name!=='20261018000000_synthetic_forward.ts') throw new Error('historical ledger was fabricated');
              await knex.migrate.rollback();
              await knex.migrate.rollback();
              if((await knex('knex_migrations').select('name')).length!==0) throw new Error('rollback left fake history');
              console.log('Native Knex forward/down/forward verified; no historical ledger rows.');
            }finally{await probe.end();await knex.destroy();}
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
              directory,
            ],
            { cwd: backendRoot, encoding: 'utf8', timeout: 45000 },
          );
          expect({ status: result.status, stderr: result.stderr }).toEqual({
            status: 0,
            stderr: '',
          });
          expect(result.stdout).toContain('no historical ledger rows');
          expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
        } finally {
          fs.rmSync(directory, { recursive: true });
        }
      });
    }, 60000);

    it.each(['before', 'after'])(
      'retries teardown from a fresh connection when the final DROP fails %s commit',
      async (timing) => {
        await fixture(port, async (database, expected, name) => {
          await runWebBaseline(database, 'bootstrap', expected);
          const interrupted: BaselineDatabase = {
            query: async (sql, bindings) => {
              if (sql === 'DROP TABLE web_schema_baselines' && timing === 'before')
                throw new Error('synthetic final DROP failure');
              const result = await database.query(sql, bindings);
              if (sql === 'DROP TABLE web_schema_baselines' && timing === 'after')
                throw new Error('synthetic final DROP failure');
              return result;
            },
          };
          await expect(runWebBaseline(interrupted, 'teardown', expected)).rejects.toThrow(
            /final DROP/,
          );
          const fresh = await mysql.createConnection({
            host: '127.0.0.1',
            port,
            user: 'root',
            database: name,
          });
          try {
            await runWebBaseline(fresh, 'teardown', expected);
            await runWebBaseline(fresh, 'teardown', expected);
            const [objects] = await fresh.query<RowDataPacket[]>(
              "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_schema_baselines'",
            );
            expect(objects).toEqual([]);
            await expect(runWebBaseline(fresh, 'teardown', '0'.repeat(64))).rejects.toThrow(
              /mud_schema_identity/,
            );
            await fresh.query(bundle.tables[0].sql);
            await expect(runWebBaseline(fresh, 'teardown', expected)).rejects.toThrow(
              /missing_provenance/,
            );
          } finally {
            await fresh.end();
          }
        });
      },
      60000,
    );

    it('installs, verifies, repeats without replacing user rows, refuses destructive teardown and then removes only its own empty/default stores', async () => {
      await fixture(port, async (database, expected) => {
        await expect(runWebBaseline(database, 'bootstrap', '0'.repeat(64))).rejects.toThrow(
          /mud_schema_identity/,
        );
        await runWebBaseline(database, 'bootstrap', expected);
        expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
        await runWebBaseline(database, 'verify', expected);
        await database.query("INSERT INTO forum_categories (name) VALUES ('Synthetic category')");
        await runWebBaseline(database, 'bootstrap', expected);
        await expect(runWebBaseline(database, 'teardown', expected)).rejects.toThrow(
          /teardown_has_user_data/,
        );
        const [categories] = await database.query<RowDataPacket[]>(
          'SELECT name FROM forum_categories',
        );
        expect(categories).toEqual([{ name: 'Synthetic category' }]);
        await database.query('DELETE FROM forum_categories');
        await database.query(
          "UPDATE web_settings SET setting_value='changed' WHERE setting_key='site_title'",
        );
        await expect(runWebBaseline(database, 'teardown', expected)).rejects.toThrow(
          /teardown_seed_modified/,
        );
        await database.query(
          "UPDATE web_settings SET setting_value='Duris' WHERE setting_key='site_title'",
        );
        await runWebBaseline(database, 'teardown', expected);
        const [remaining] = await database.query<RowDataPacket[]>(
          "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_schema_baselines'",
        );
        expect(remaining).toEqual([]);
        await runWebBaseline(database, 'bootstrap', expected);
      });
    }, 60000);

    it('recovers native DDL committed just before failure using only the recorded pending table', async () => {
      await fixture(port, async (database, expected, name) => {
        let failed = false;
        const interrupted: BaselineDatabase = {
          query: async (sql, bindings) => {
            const result = await database.query(sql, bindings);
            if (!failed && sql === bundle.tables[4].sql) {
              failed = true;
              throw new Error('synthetic process interruption after DDL');
            }
            return result;
          },
        };
        await expect(runWebBaseline(interrupted, 'bootstrap', expected)).rejects.toThrow(
          /interruption/,
        );
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /installation_incomplete/,
        );
        const fresh = await mysql.createConnection({
          host: '127.0.0.1',
          port,
          user: 'root',
          database: name,
        });
        try {
          await runWebBaseline(fresh, 'bootstrap', expected);
        } finally {
          await fresh.end();
        }
        expect((await verifiedWebBaselineCoverage(database)).size).toBe(85);
      });
    }, 60000);

    it('recovers an ambiguous seed commit without duplicated defaults', async () => {
      await fixture(port, async (database, expected) => {
        let failed = false;
        const interrupted: BaselineDatabase = {
          query: async (sql, bindings) => {
            const result = await database.query(sql, bindings);
            if (!failed && sql === 'COMMIT') {
              failed = true;
              throw new Error('synthetic ambiguous acknowledgement');
            }
            return result;
          },
        };
        await expect(runWebBaseline(interrupted, 'bootstrap', expected)).rejects.toThrow(
          /ambiguous/,
        );
        await runWebBaseline(database, 'bootstrap', expected);
        for (const seed of bundle.seeds) {
          const [count] = await database.query<RowDataPacket[]>(
            'SELECT COUNT(*) AS count FROM ??',
            [seed.table],
          );
          expect(Number(count[0].count)).toBe(seed.rows.length);
        }
      });
    }, 60000);

    it('refuses unrecorded objects, schema drift, metadata drift, triggers and missing provenance', async () => {
      await fixture(port, async (database, expected) => {
        await database.query(bundle.tables[0].sql);
        await expect(runWebBaseline(database, 'bootstrap', expected)).rejects.toThrow(
          /unrecorded_existing_web_schema/,
        );
        await database.query('DROP TABLE ??', [bundle.tables[0].name]);
        await runWebBaseline(database, 'bootstrap', expected);
        await database.query('ALTER TABLE web_sessions ADD COLUMN unexpected INT');
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /schema_drift_web_sessions/,
        );
        await database.query('ALTER TABLE web_sessions DROP COLUMN unexpected');
        await database.query(
          'ALTER TABLE web_schema_baselines MODIFY manifest_sha256 CHAR(65) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
        );
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /provenance_schema_drift/,
        );
        await database.query(
          'ALTER TABLE web_schema_baselines MODIFY manifest_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
        );
        await database.query(
          'CREATE TRIGGER synthetic_trigger BEFORE INSERT ON web_sessions FOR EACH ROW SET NEW.account_name=NEW.account_name',
        );
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /unexpected_web_trigger/,
        );
        await database.query('DROP TRIGGER synthetic_trigger');
        await database.query('DELETE FROM web_schema_baselines');
        await expect(verifiedWebBaselineCoverage(database)).rejects.toThrow(
          /installation_incomplete/,
        );
      });
    }, 60000);

    it('keeps a complete synthetic existing ledger and rows intact during adoption and refuses incomplete history', async () => {
      await fixture(port, async (database, expected) => {
        for (const table of bundle.tables) await database.query(table.sql);
        await database.query(
          'CREATE TABLE knex_migrations (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), batch INT, migration_time TIMESTAMP)',
        );
        await expect(runWebBaseline(database, 'adopt', expected)).rejects.toThrow(
          /existing_history_incomplete/,
        );
        for (const [index, migration] of bundle.manifest.historicalMigrations.entries())
          await database.query(
            'INSERT INTO knex_migrations (id,name,batch,migration_time) VALUES (?,?,?,?)',
            [index + 1, migration.name, 1, '2026-01-01 00:00:00'],
          );
        await database.query(
          "INSERT INTO forum_categories (name) VALUES ('Existing subject content')",
        );
        const [before] = await database.query('SELECT * FROM knex_migrations ORDER BY id');
        await runWebBaseline(database, 'adopt', expected);
        expect(await verifiedWebBaselineCoverage(database)).toEqual(new Set());
        const [after] = await database.query('SELECT * FROM knex_migrations ORDER BY id');
        expect(after).toEqual(before);
        await expect(runWebBaseline(database, 'teardown', expected)).rejects.toThrow(
          /adopted_or_migrated/,
        );
        const [content] = await database.query<RowDataPacket[]>(
          'SELECT name FROM forum_categories',
        );
        expect(content).toEqual([{ name: 'Existing subject content' }]);
      });
    }, 60000);

    it('refuses overlapping installers before mutation and releases the lock after failure', async () => {
      await fixture(port, async (database, expected, name) => {
        const lock = `durisweb:baseline:${sha256(name).slice(0, 32)}`;
        await database.query('SELECT GET_LOCK(?,0)', [lock]);
        const other = await mysql.createConnection({
          host: '127.0.0.1',
          port,
          user: 'root',
          database: name,
        });
        try {
          await expect(runWebBaseline(other, 'bootstrap', expected)).rejects.toThrow(
            /installation_busy/,
          );
        } finally {
          await other.end();
          await database.query('SELECT RELEASE_LOCK(?)', [lock]);
        }
        await runWebBaseline(database, 'bootstrap', expected);
      });
    }, 60000);
  });
}

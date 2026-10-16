import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import {
  type BaselineManifest,
  installedTableSha256,
  loadWebBaselineBundle,
  sha256,
  verifyWebBaselineSources,
  webBaselineDirectory,
} from '../webBaselineBundle.js';

const backendRoot = path.resolve(webBaselineDirectory(), '../..');
const temporaryDirectories: string[] = [];
function copyBundle(): { directory: string; manifest: BaselineManifest } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-baseline-inputs-'));
  temporaryDirectories.push(directory);
  fs.cpSync(webBaselineDirectory(), directory, { recursive: true });
  return { directory, manifest: loadWebBaselineBundle().manifest };
}
function saveManifest(directory: string, manifest: BaselineManifest): void {
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe('immutable website schema inputs', () => {
  it('verifies the full source bundle with no runtime environment or database', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/scripts/checkWebBaseline.ts'],
      {
        cwd: backendRoot,
        env: {},
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('76 web tables, 85 covered migration sources');
    expect(result.stdout).toContain('No database was inspected or changed');
  });

  it('pins historical files without excluding new forward migrations', () => {
    const { directory } = copyBundle();
    const migrations = path.join(directory, 'migrations');
    fs.cpSync(path.join(backendRoot, 'migrations'), migrations, { recursive: true });
    fs.writeFileSync(
      path.join(migrations, '20261017000000_future_change.ts'),
      '// future migration',
    );
    expect(() => verifyWebBaselineSources(loadWebBaselineBundle(), migrations)).not.toThrow();
    fs.writeFileSync(
      path.join(migrations, '20261001000000_unknown_history.ts'),
      '// unexpected past',
    );
    expect(() => verifyWebBaselineSources(loadWebBaselineBundle(), migrations)).toThrow(
      /coverage mismatch/,
    );
  });

  it('rejects altered source checksums, including excluded historical SQL', () => {
    const { directory } = copyBundle();
    const migrations = path.join(directory, 'migrations');
    fs.cpSync(path.join(backendRoot, 'migrations'), migrations, { recursive: true });
    fs.appendFileSync(path.join(migrations, '005_create_accounts_table.sql'), '\n-- changed');
    expect(() => verifyWebBaselineSources(loadWebBaselineBundle(), migrations)).toThrow(
      /checksum mismatch/,
    );
  });

  it.each(['schema.sql', 'seeds.json'])('rejects altered %s before interpreting it', (name) => {
    const { directory } = copyBundle();
    fs.appendFileSync(path.join(directory, name), '\n');
    expect(() => loadWebBaselineBundle(directory)).toThrow(/checksum mismatch/);
  });

  it('rejects a MUD table even if someone recomputes the bundle checksums', () => {
    const { directory, manifest } = copyBundle();
    const schema = fs
      .readFileSync(path.join(directory, 'schema.sql'), 'utf8')
      .replaceAll('account_login_history', 'server_reboots');
    fs.writeFileSync(path.join(directory, 'schema.sql'), schema);
    manifest.schemaSha256 = sha256(schema);
    manifest.tables[0].name = 'server_reboots';
    saveManifest(directory, manifest);
    expect(() => loadWebBaselineBundle(directory)).toThrow(/ownership violation/);
  });

  it('rejects unknown MUD identity rather than treating a table list as authority', () => {
    const { directory, manifest } = copyBundle();
    manifest.mudBaseline.id = 'not-the-approved-baseline';
    saveManifest(directory, manifest);
    expect(() => loadWebBaselineBundle(directory)).toThrow(/MUD identity/);
  });

  it('rejects duplicate table definitions', () => {
    const { directory, manifest } = copyBundle();
    manifest.tables[1] = manifest.tables[0];
    saveManifest(directory, manifest);
    expect(() => loadWebBaselineBundle(directory)).toThrow(/duplicate tables/);
  });

  it('never reinstalls obsolete notifications or account assignments', () => {
    const bundle = loadWebBaselineBundle();
    const names = bundle.tables.map(({ name }) => name);
    expect(names).toContain('notifications');
    for (const name of [
      'accounts',
      'server_reboots',
      'forum_notifications',
      'builder_notifications',
    ])
      expect(names).not.toContain(name);
    expect(bundle.seeds.map(({ table }) => table)).not.toContain('admin_account_roles');
    expect(bundle.seeds.map(({ table }) => table)).not.toContain('admin_account_permissions');
    expect(
      bundle.manifest.legacySql
        .filter(({ coverage }) => coverage === 'excluded')
        .map(({ name }) => name),
    ).toEqual(['005_create_accounts_table.sql', '017_fix_emoji_icons.sql']);
  });
});

// Explicit opt-in only. Never consume the normal dev/test/shared database credentials.
const ports = (process.env.TEST_BASELINE_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
if (
  ports.some(
    (port) =>
      !Number.isInteger(port) || port < 1024 || port > 65535 || [3306, 3307, 13306].includes(port),
  )
) {
  throw new Error('TEST_BASELINE_DB_PORTS must select disposable loopback servers');
}
for (const port of ports) {
  describe(`website baseline DDL on disposable port ${port}`, () => {
    it('creates every web object and nonsecret seed with FKs enabled, leaving external objects untouched', async () => {
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        multipleStatements: false,
      });
      const database = 'durisweb_baseline_bundle_test';
      let databaseCreated = false;
      try {
        await connection.query(
          `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        databaseCreated = true;
        await connection.changeUser({ database });
        // These sentinels prove ownership isolation; they are not a MUD baseline rehearsal.
        await connection.query(
          'CREATE TABLE accounts (id INT PRIMARY KEY, secret_value VARBINARY(32)) ENGINE=InnoDB',
        );
        await connection.query(
          'CREATE TABLE server_reboots (record_id BIGINT PRIMARY KEY) ENGINE=InnoDB',
        );
        await connection.query("INSERT INTO accounts VALUES (1, 'synthetic-protected-row')");
        const [beforeDDL] = await connection.query('SHOW CREATE TABLE accounts');
        const [beforeRows] = await connection.query('SELECT * FROM accounts');
        const bundle = loadWebBaselineBundle();
        for (const { sql } of bundle.tables) await connection.query(sql);
        for (const { table, rows } of bundle.seeds) {
          for (const row of rows) await connection.query('INSERT INTO ?? SET ?', [table, row]);
        }
        const [constraints] = await connection.query<RowDataPacket[]>(
          'SELECT @@foreign_key_checks AS enabled',
        );
        expect(Number(constraints[0].enabled)).toBe(1);
        const [afterDDL] = await connection.query('SHOW CREATE TABLE accounts');
        const [afterRows] = await connection.query('SELECT * FROM accounts');
        expect(afterDDL).toEqual(beforeDDL);
        expect(afterRows).toEqual(beforeRows);
        const [externalFKs] = await connection.query<RowDataPacket[]>(
          "SELECT TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('accounts','server_reboots')",
        );
        expect(externalFKs).toEqual([]);
        const [profiles] = await connection.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM user_profiles',
        );
        expect(Number(profiles[0].count)).toBe(0);
        const [forum] = await connection.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM forum_categories',
        );
        expect(Number(forum[0].count)).toBe(0);
        const [assignments] = await connection.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM admin_account_roles',
        );
        expect(Number(assignments[0].count)).toBe(0);
        const [version] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version');
        const family = String(version[0].version).includes('MariaDB') ? 'mariadb11' : 'mysql8';
        for (const table of bundle.tables) {
          const [ddl] = await connection.query<RowDataPacket[]>('SHOW CREATE TABLE ??', [
            table.name,
          ]);
          expect(installedTableSha256(String(ddl[0]['Create Table']))).toBe(
            table.installedSha256[family],
          );
        }
        console.log(
          `Verified website baseline DDL/seed syntax on ${String(version[0].version)} (${bundle.tables.length} tables).`,
        );
      } finally {
        // A fixture collision fails CREATE and must never delete another run's database.
        if (databaseCreated) await connection.query(`DROP DATABASE ${database}`);
        await connection.end();
      }
    }, 60000);
  });
}

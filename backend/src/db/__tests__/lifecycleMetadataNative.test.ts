import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { inspect } from 'node:util';
import { spawnSync } from 'node:child_process';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import {
  assertLifecycleMetadata,
  installLifecycleMetadata,
  readLifecycleMetadata,
  lifecycleMetadataBody,
  LIFECYCLE_METADATA_FUNCTION,
} from '../lifecycleMetadata.js';
import { parseLifecycleMetadataArguments } from '../../scripts/lifecycleMetadata.js';

const ports = process.env.TEST_LIFECYCLE_METADATA_DB_PORTS?.split(',').map(Number) ?? [];
if (ports.some((port) => ![23436, 23437].includes(port)))
  throw new Error('Lifecycle metadata qualification requires dedicated disposable database ports');

describe('explicit lifecycle metadata command arguments', () => {
  it('requires an exact explicit target and installation account without accepting secret flags', () => {
    expect(parseLifecycleMetadataArguments(['--target', 'fixture:3306/fixture'])).toEqual({
      install: false,
      target: 'fixture:3306/fixture',
      runtimeUser: undefined,
      runtimeHost: undefined,
    });
    for (const args of [
      [],
      ['install', '--target', 'fixture'],
      ['--target', 'fixture', '--runtime-user', 'app'],
      ['--target', 'fixture', '--password', 'private-sentinel'],
      ['--target', 'fixture', '--target', 'other'],
    ])
      expect(() => parseLifecycleMetadataArguments(args)).toThrow('invalid_arguments');
  });
});

for (const port of ports)
  describe(`authoritative metadata on restricted runtime account (${port})`, () => {
    const database = `durisweb_qualification_lifecycle_metadata_${port}`;
    const external = `${database}_external`;
    const appUser = `lifecycle_app_${port}`,
      guardUser = `lifecycle_guard_${port}`;
    let root: Connection, app: Connection, guard: Connection;
    let ownDatabase = false,
      ownExternal = false,
      ownApp = false,
      ownGuard = false;
    const family = port === 23436 ? 'mysql8' : 'mariadb11';
    async function recreate(body = lifecycleMetadataBody(family)) {
      await guard.query(`DROP FUNCTION ${LIFECYCLE_METADATA_FUNCTION}`);
      await root.query(
        `CREATE DEFINER=?@? FUNCTION ${LIFECYCLE_METADATA_FUNCTION}(target_table VARCHAR(64) CHARACTER SET ascii)
      RETURNS LONGTEXT CHARACTER SET ascii NOT DETERMINISTIC READS SQL DATA SQL SECURITY DEFINER ${body}`,
        [guardUser, '%'],
      );
      await guard.query(`GRANT EXECUTE ON FUNCTION ${LIFECYCLE_METADATA_FUNCTION} TO ?@?`, [
        appUser,
        '%',
      ]);
    }
    beforeAll(async () => {
      root = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' });
      await root.query(`CREATE DATABASE ${database}`);
      ownDatabase = true;
      await root.query(`CREATE DATABASE ${external}`);
      ownExternal = true;
      await root.changeUser({ database });
      await root.query('CREATE USER ?@? IDENTIFIED BY ?', [appUser, '%', 'synthetic-only']);
      ownApp = true;
      await root.query('CREATE USER ?@? IDENTIFIED BY ?', [guardUser, '%', 'synthetic-only']);
      ownGuard = true;
      await root.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.* TO ?@?`, [appUser, '%']);
      await root.query('GRANT SELECT,TRIGGER ON *.* TO ?@?', [guardUser, '%']);
      if (port === 23436) await root.query('GRANT SUPER ON *.* TO ?@?', [guardUser, '%']);
      await root.query(`GRANT ALL ON ${database}.* TO ?@? WITH GRANT OPTION`, [guardUser, '%']);
      await root.query('CREATE TABLE page_views(id INT PRIMARY KEY) ENGINE=InnoDB');
      await root.query('INSERT INTO page_views VALUES (1)');
      guard = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: guardUser,
        password: 'synthetic-only',
        database,
      });
      app = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: appUser,
        password: 'synthetic-only',
        database,
      });
      // MySQL binary logging can require an administrator to create a function.
      // Keep those server settings unchanged and use the fixture administrator.
      await root.query(
        `CREATE DEFINER=?@? FUNCTION ${LIFECYCLE_METADATA_FUNCTION}(target_table VARCHAR(64) CHARACTER SET ascii)
        RETURNS LONGTEXT CHARACTER SET ascii NOT DETERMINISTIC READS SQL DATA SQL SECURITY DEFINER ${lifecycleMetadataBody(family)}`,
        [guardUser, '%'],
      );
      await installLifecycleMetadata(guard, appUser, '%');
    });
    afterAll(async () => {
      await app?.end();
      await guard?.end();
      if (root) {
        if (ownExternal) await root.query(`DROP DATABASE ${external}`);
        if (ownDatabase) await root.query(`DROP DATABASE ${database}`);
        if (ownApp) await root.query('DROP USER ?@?', [appUser, '%']);
        if (ownGuard) await root.query('DROP USER ?@?', [guardUser, '%']);
        await root.end();
      }
    });
    it('returns bounded counts without global runtime privileges or body visibility', async () => {
      const [privileges] = await app.query<RowDataPacket[]>(
        "SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE PRIVILEGE_TYPE IN ('SELECT','TRIGGER','PROCESS')",
      );
      expect(privileges).toHaveLength(0);
      const [definition] = await app.query<RowDataPacket[]>(
        `SELECT ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='${LIFECYCLE_METADATA_FUNCTION}'`,
      );
      expect(definition[0].ROUTINE_DEFINITION).toBeNull();
      await expect(readLifecycleMetadata(app, 'page_views')).resolves.toEqual({
        triggers: 0,
        incoming: 0,
      });
      await expect(installLifecycleMetadata(guard, appUser, '%')).resolves.toBeUndefined();
    });
    it('checks through the real CLI as the restricted website account', () => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'src/scripts/lifecycleMetadata.ts',
          '--target',
          `127.0.0.1:${port}/${database}`,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            DB_HOST: '127.0.0.1',
            DB_PORT: String(port),
            DB_NAME: database,
            DB_USER: appUser,
            DB_PASSWORD: 'synthetic-only',
          },
          timeout: 15000,
        },
      );
      expect(result.stderr).not.toContain('synthetic-only');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('check passed; no application rows changed');
    });
    it('creates and grants the guard through the real explicit DBA command', async () => {
      await guard.query(`DROP FUNCTION ${LIFECYCLE_METADATA_FUNCTION}`);
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'src/scripts/lifecycleMetadata.ts',
          'install',
          '--target',
          `127.0.0.1:${port}/${database}`,
          '--runtime-user',
          appUser,
          '--runtime-host',
          '%',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            DB_HOST: '127.0.0.1',
            DB_PORT: String(port),
            DB_NAME: database,
            DB_USER: guardUser,
            DB_PASSWORD: 'synthetic-only',
          },
          timeout: 15000,
        },
      );
      expect(result.stderr).not.toContain('synthetic-only');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('installation passed; no application rows changed');
      await expect(readLifecycleMetadata(app, 'page_views')).resolves.toEqual({
        triggers: 0,
        incoming: 0,
      });
      await expect(
        installLifecycleMetadata(guard, 'nonexistent_fixture_user', '%'),
      ).rejects.toThrow('Lifecycle metadata');
      const [users] = await root.query<RowDataPacket[]>(
        "SELECT User FROM mysql.user WHERE User='nonexistent_fixture_user'",
      );
      expect(users).toHaveLength(0);
    });
    it('detects a hidden external-schema cascade before any row is removed', async () => {
      await root.query(
        `CREATE TABLE ${external}.child(id INT PRIMARY KEY, FOREIGN KEY(id) REFERENCES ${database}.page_views(id) ON DELETE CASCADE) ENGINE=InnoDB`,
      );
      await root.query(`INSERT INTO ${external}.child VALUES (1)`);
      try {
        const [filtered] = await app.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='page_views'",
        );
        expect(Number(filtered[0].count)).toBe(0);
        await expect(readLifecycleMetadata(app, 'page_views')).resolves.toEqual({
          triggers: 0,
          incoming: 1,
        });
        await expect(assertLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
        expect((await root.query<RowDataPacket[]>('SELECT id FROM page_views'))[0]).toHaveLength(1);
        expect(
          (await root.query<RowDataPacket[]>(`SELECT id FROM ${external}.child`))[0],
        ).toHaveLength(1);
      } finally {
        await root.query(`DROP TABLE ${external}.child`);
      }
    });
    it('detects a trigger that the runtime account cannot inspect', async () => {
      await root.query(
        'CREATE TRIGGER lifecycle_fixture BEFORE DELETE ON page_views FOR EACH ROW SET @lifecycle_fixture_hit=1',
      );
      try {
        const [filtered] = await app.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='page_views'",
        );
        expect(Number(filtered[0].count)).toBe(port === 23436 ? 0 : 1);
        await expect(readLifecycleMetadata(app, 'page_views')).resolves.toEqual({
          triggers: 1,
          incoming: 0,
        });
        await expect(assertLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
      } finally {
        await root.query('DROP TRIGGER lifecycle_fixture');
      }
    });
    it('refuses a definer whose global SELECT or TRIGGER authority is revoked', async () => {
      for (const privilege of ['SELECT', 'TRIGGER']) {
        await root.query(`REVOKE ${privilege} ON *.* FROM ?@?`, [guardUser, '%']);
        try {
          await expect(readLifecycleMetadata(app, 'page_views')).rejects.toThrow(
            'Lifecycle metadata',
          );
        } finally {
          await root.query(`GRANT ${privilege} ON *.* TO ?@?`, [guardUser, '%']);
        }
      }
      await expect(assertLifecycleMetadata(app, 'page_views')).resolves.toBeUndefined();
    });
    it('refuses an altered body and never replaces unknown installation state', async () => {
      await recreate(lifecycleMetadataBody(family).replace("'format',1", "'format',2"));
      try {
        await expect(readLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
        await expect(installLifecycleMetadata(guard, appUser, '%')).rejects.toThrow(
          'Lifecycle metadata',
        );
      } finally {
        await recreate();
      }
    });
    it('refuses changed security semantics and missing execution rights', async () => {
      await guard.query(`ALTER FUNCTION ${LIFECYCLE_METADATA_FUNCTION} SQL SECURITY INVOKER`);
      try {
        await expect(readLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
      } finally {
        await guard.query(`ALTER FUNCTION ${LIFECYCLE_METADATA_FUNCTION} SQL SECURITY DEFINER`);
      }
      await guard.query(`REVOKE EXECUTE ON FUNCTION ${LIFECYCLE_METADATA_FUNCTION} FROM ?@?`, [
        appUser,
        '%',
      ]);
      try {
        await expect(readLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
      } finally {
        await guard.query(`GRANT EXECUTE ON FUNCTION ${LIFECYCLE_METADATA_FUNCTION} TO ?@?`, [
          appUser,
          '%',
        ]);
      }
    });
    it('limits direct invocation to known target names and scrubs raw driver context', async () => {
      await expect(
        app.query(`SELECT ${LIFECYCLE_METADATA_FUNCTION}(?)`, ['other-database/private-sentinel']),
      ).rejects.toBeDefined();
      await guard.query(`DROP FUNCTION ${LIFECYCLE_METADATA_FUNCTION}`);
      try {
        await expect(readLifecycleMetadata(app, 'page_views')).rejects.toThrow(
          'Lifecycle metadata',
        );
        try {
          await readLifecycleMetadata(app, 'page_views');
        } catch (error) {
          expect(inspect(error)).not.toContain(database);
          expect(inspect(error)).not.toContain('SELECT');
          expect(inspect(error)).not.toContain('private-sentinel');
        }
      } finally {
        await root.query(
          `CREATE DEFINER=?@? FUNCTION ${LIFECYCLE_METADATA_FUNCTION}(target_table VARCHAR(64) CHARACTER SET ascii)
          RETURNS LONGTEXT CHARACTER SET ascii NOT DETERMINISTIC READS SQL DATA SQL SECURITY DEFINER ${lifecycleMetadataBody(family)}`,
          [guardUser, '%'],
        );
        await installLifecycleMetadata(guard, appUser, '%');
      }
    });
  });

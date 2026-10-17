import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import knex, { type Knex } from 'knex';
import {
  applyOwnerSchemaFixture,
  ownerMetadataFingerprint,
  readOwnerSchemaFixture,
} from '../../test/ownerSchemaFixture.js';
import { runFixtureWebMigrations, prepareFixtureMetadata } from '../../test/webMigrationFixture.js';
import {
  externalSchemaSha256,
  runWebBaseline,
  verifiedWebBaselineCoverage,
} from '../webBaseline.js';
import { loadWebBaselineBundle } from '../webBaselineBundle.js';
import {
  migrateWebSessionSchema,
  readSessionSchemaStage,
  SESSION_EXPAND_MIGRATION,
} from '../webSessionSchema.js';
import { schemaDatabaseFamily, readTableMetadata } from '../schemaPostconditions.js';
import {
  installLifecycleMetadata,
  LIFECYCLE_METADATA_FUNCTION,
  readSchemaLifecycleMetadata,
} from '../lifecycleMetadata.js';
import { assertNoWebSchemaTriggers } from '../schemaMetadataAuthority.js';

const ports = process.env.TEST_SCHEMA_AUTHORITY_DB_PORTS?.split(',').map(Number) ?? [];
if (
  ports.some((port) => ![23436, 23437].includes(port)) ||
  (ports.length && !process.env.TEST_BASELINE_MUD_SOURCE)
)
  throw new Error(
    'Schema authority tests require dedicated disposable ports and pinned owner inputs',
  );
describe('schema metadata target boundary', () => {
  it('refuses schema-qualified selectors before any database access', async () => {
    let touched = false;
    const database = {
      query: async () => {
        touched = true;
        throw new Error('Unexpected metadata I/O');
      },
    };
    await expect(readSchemaLifecycleMetadata(database, 'other_schema.table')).rejects.toThrow(
      'Lifecycle metadata',
    );
    expect(touched).toBe(false);
  });
});
for (const port of ports)
  describe(`schema/session authority under restricted credentials (${port})`, () => {
    const database = `durisweb_qualification_schema_auth_${port}_${process.pid}`;
    const evidence = `${database}_evidence`;
    const appUser = `dwsapp_${port}_${process.pid}`;
    const readerUser = `dwsread_${port}_${process.pid}`;
    let root: Connection, app: Connection, reader: Connection, migrator: Knex;
    let databaseOwned = false,
      evidenceOwned = false,
      userOwned = false,
      readerOwned = false;
    let ownerBefore = '';
    let initializing: Promise<void> | undefined;
    beforeAll(() => {
      initializing = (async () => {
        root = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root' });
        await root.query(
          `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        databaseOwned = true;
        await root.changeUser({ database });
        // Metadata installation has no table dependency and precedes actual bootstrap.
        await prepareFixtureMetadata(root);
        const inputs = readOwnerSchemaFixture(process.env.TEST_BASELINE_MUD_SOURCE!);
        await applyOwnerSchemaFixture(root, port, database, inputs);
        ownerBefore = await ownerMetadataFingerprint(root, inputs);
        const bundle = loadWebBaselineBundle();
        await runWebBaseline(root, 'bootstrap', await externalSchemaSha256(root, bundle));
        runFixtureWebMigrations(port, database, {
          direction: 'up',
          name: SESSION_EXPAND_MIGRATION,
        });
        await root.query(`CREATE DATABASE ${evidence}`);
        evidenceOwned = true;
        await root.query(
          `CREATE TABLE ${evidence}.captured(session_id VARCHAR(36) PRIMARY KEY) ENGINE=InnoDB`,
        );
        await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
          appUser,
          '%',
          'synthetic-authority-only',
        ]);
        userOwned = true;
        await root.query(`GRANT ALL ON ${database}.* TO ?@?`, [appUser, '%']);
        await root.query(`REVOKE TRIGGER ON ${database}.* FROM ?@?`, [appUser, '%']);
        const connection = {
          host: '127.0.0.1',
          port,
          user: appUser,
          password: 'synthetic-authority-only',
          database,
        };
        app = await mysql.createConnection(connection);
        migrator = knex({ client: 'mysql2', connection, pool: { min: 0, max: 1 } });
        await installLifecycleMetadata(root, appUser, '%');
        await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
          readerUser,
          '%',
          'synthetic-reader-only',
        ]);
        readerOwned = true;
        await root.query(`GRANT SELECT ON ${database}.* TO ?@?`, [readerUser, '%']);
        await installLifecycleMetadata(root, readerUser, '%');
        reader = await mysql.createConnection({
          host: '127.0.0.1',
          port,
          database,
          user: readerUser,
          password: 'synthetic-reader-only',
        });
      })();
      return initializing;
    }, 90000);
    afterAll(async () => {
      // Hook timeout does not cancel setup. Join it before checking ownership/closing SQL.
      if (initializing) await Promise.allSettled([initializing]);
      await migrator?.destroy();
      await app?.end();
      await reader?.end();
      if (root) {
        if (evidenceOwned) await root.query(`DROP DATABASE ${evidence}`);
        if (databaseOwned) await root.query(`DROP DATABASE ${database}`);
        if (userOwned) await root.query('DROP USER ?@?', [appUser, '%']);
        if (readerOwned) await root.query('DROP USER ?@?', [readerUser, '%']);
        await root.end();
      }
    }, 120000);
    it('verifies the real baseline with no global or schema trigger grant on the caller', async () => {
      const [grants] = await app.query<RowDataPacket[]>(
        "SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE PRIVILEGE_TYPE IN ('SELECT','TRIGGER')",
      );
      expect(grants).toHaveLength(0);
      expect((await verifiedWebBaselineCoverage(app)).size).toBe(85);
      const family = await schemaDatabaseFamily(root);
      if (port === 23437) {
        // MariaDB filters FK rule metadata for a SELECT-only table principal.
        expect(
          (await readTableMetadata(reader, 'admin_account_permissions', family)).foreignKeys,
        ).toHaveLength(0);
        expect(
          (await readTableMetadata(root, 'admin_account_permissions', family)).foreignKeys.length,
        ).toBeGreaterThan(0);
        await expect(verifiedWebBaselineCoverage(reader)).rejects.toThrow(
          'schema_drift_admin_account_permissions',
        );
      } else expect((await verifiedWebBaselineCoverage(reader)).size).toBe(85);
      // Qualify the actual website CRUD profile, with no DDL, trigger or global grant.
      for (const table of loadWebBaselineBundle().tables)
        await root.query('GRANT INSERT,UPDATE,DELETE ON ??.?? TO ?@?', [
          database,
          table.name,
          readerUser,
          '%',
        ]);
      await reader.end();
      reader = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        database,
        user: readerUser,
        password: 'synthetic-reader-only',
      });
      expect((await verifiedWebBaselineCoverage(reader)).size).toBe(85);
      await expect(
        assertNoWebSchemaTriggers(reader, new Set(['other_schema.table'])),
      ).rejects.toThrow('schema_trigger_visibility_unverified');
    });
    it('refuses missing authority even when the caller has a schema trigger grant', async () => {
      await root.query(`GRANT TRIGGER ON ${database}.* TO ?@?`, [appUser, '%']);
      await root.query(`DROP FUNCTION ${LIFECYCLE_METADATA_FUNCTION}`);
      try {
        await expect(verifiedWebBaselineCoverage(app)).rejects.toThrow(
          'schema_trigger_visibility_unverified',
        );
        await expect(migrateWebSessionSchema(migrator, 'cutover', 'up')).rejects.toThrow(
          'session_metadata_visibility_unverified',
        );
      } finally {
        await root.query(`REVOKE TRIGGER ON ${database}.* FROM ?@?`, [appUser, '%']);
        await installLifecycleMetadata(root, appUser, '%');
        await installLifecycleMetadata(root, readerUser, '%');
      }
    });
    it('refuses a hidden trigger during actual baseline coverage verification', async () => {
      await root.query(
        'CREATE TRIGGER authority_fixture_setting BEFORE UPDATE ON web_settings FOR EACH ROW SET @authority_fixture=1',
      );
      try {
        const [filtered] = await app.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='web_settings'",
        );
        expect(Number(filtered[0].count)).toBe(port === 23436 ? 0 : 1);
        await expect(verifiedWebBaselineCoverage(app)).rejects.toThrow();
      } finally {
        await root.query('DROP TRIGGER authority_fixture_setting');
      }
    });
    it('does not let a hidden delete trigger observe credential cutover', async () => {
      const id = randomUUID();
      await root.query(
        'INSERT INTO web_sessions(id,account_name,refresh_token,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
        [id, 'SyntheticAccount', 'synthetic-raw-credential'],
      );
      await root.query(
        `CREATE TRIGGER authority_fixture_session BEFORE DELETE ON web_sessions FOR EACH ROW INSERT INTO ${evidence}.captured VALUES(OLD.id)`,
      );
      let failure: unknown;
      try {
        try {
          await migrateWebSessionSchema(migrator, 'cutover', 'up');
        } catch (error) {
          failure = error;
        }
        const [sessions] = await root.query<RowDataPacket[]>(
          'SELECT id FROM web_sessions WHERE id=?',
          [id],
        );
        const [captured] = await root.query<RowDataPacket[]>(
          `SELECT session_id FROM ${evidence}.captured`,
        );
        expect({
          rejected: failure instanceof Error,
          sessions: sessions.length,
          captured: captured.length,
        }).toEqual({ rejected: true, sessions: 1, captured: 0 });
      } finally {
        await root.query('DROP TRIGGER authority_fixture_session');
        await root.query(`DELETE FROM ${evidence}.captured`);
        const family = await schemaDatabaseFamily(root);
        if ((await readSessionSchemaStage(root, family)) === 'contracted') {
          const owner = knex({
            client: 'mysql2',
            connection: { host: '127.0.0.1', port, user: 'root', database },
            pool: { min: 0, max: 1 },
          });
          try {
            await migrateWebSessionSchema(owner, 'cutover', 'down');
          } finally {
            await owner.destroy();
          }
        }
        await root.query('DELETE FROM web_sessions WHERE id=?', [id]);
      }
    });
    it('preserves sessions and foreign-schema children for both owner and restricted callers', async () => {
      const id = randomUUID();
      await root.query(
        'INSERT INTO web_sessions(id,account_name,refresh_token,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
        [id, 'SyntheticAccount', 'synthetic-reference-credential'],
      );
      await root.query(
        `CREATE TABLE ${evidence}.reference_child(id INT PRIMARY KEY,session_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,FOREIGN KEY(session_id) REFERENCES ${database}.web_sessions(id) ON DELETE CASCADE) ENGINE=InnoDB`,
      );
      const owner = knex({
        client: 'mysql2',
        connection: { host: '127.0.0.1', port, user: 'root', database },
        pool: { min: 0, max: 1 },
      });
      try {
        await root.query(`INSERT INTO ${evidence}.reference_child VALUES(1,?)`, [id]);
        const [filtered] = await app.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='web_sessions'",
        );
        expect(Number(filtered[0].count)).toBe(0);
        for (const writer of [migrator, owner])
          await expect(migrateWebSessionSchema(writer, 'cutover', 'up')).rejects.toThrow(
            'unexpected_session_reference',
          );
        expect(
          (await root.query<RowDataPacket[]>('SELECT id FROM web_sessions WHERE id=?', [id]))[0],
        ).toHaveLength(1);
        expect(
          (await root.query<RowDataPacket[]>(`SELECT id FROM ${evidence}.reference_child`))[0],
        ).toHaveLength(1);
      } finally {
        await owner.destroy();
        await root.query(`DROP TABLE ${evidence}.reference_child`);
        await root.query('DELETE FROM web_sessions WHERE id=?', [id]);
      }
    });
    it('runs the actual cutover and empty rollback with the restricted caller and installed authority', async () => {
      const id = randomUUID();
      await root.query(
        'INSERT INTO web_sessions(id,account_name,refresh_token,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
        [id, 'SyntheticAccount', 'synthetic-cutover-credential'],
      );
      const family = await schemaDatabaseFamily(root);
      await migrateWebSessionSchema(migrator, 'cutover', 'up');
      expect(await readSessionSchemaStage(root, family)).toBe('contracted');
      expect((await root.query<RowDataPacket[]>('SELECT id FROM web_sessions'))[0]).toHaveLength(0);
      await migrateWebSessionSchema(migrator, 'cutover', 'down');
      expect(await readSessionSchemaStage(root, family)).toBe('expanded');
    });
    it('refuses restricted verification and cutover if only old helper state remains', async () => {
      await root.query(
        `CREATE FUNCTION web_lifecycle_metadata_v1(target_table VARCHAR(64)) RETURNS INT READS SQL DATA RETURN 0`,
      );
      await root.query(`DROP FUNCTION ${LIFECYCLE_METADATA_FUNCTION}`);
      try {
        await expect(verifiedWebBaselineCoverage(app)).rejects.toThrow(
          'schema_trigger_visibility_unverified',
        );
        await expect(migrateWebSessionSchema(migrator, 'cutover', 'up')).rejects.toThrow(
          'session_metadata_visibility_unverified',
        );
        await installLifecycleMetadata(root, appUser, '%');
        await installLifecycleMetadata(root, readerUser, '%');
        const [old] = await root.query<RowDataPacket[]>(
          "SELECT ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME='web_lifecycle_metadata_v1'",
        );
        expect(old[0].ROUTINE_DEFINITION).toBe('RETURN 0');
        expect((await verifiedWebBaselineCoverage(app)).size).toBe(85);
      } finally {
        await root.query('DROP FUNCTION web_lifecycle_metadata_v1');
        await installLifecycleMetadata(root, appUser, '%');
        await installLifecycleMetadata(root, readerUser, '%');
      }
    });
    it('does not classify a synthetic owner-table trigger as a website trigger', async () => {
      await root.query(
        'CREATE TRIGGER authority_fixture_owner BEFORE UPDATE ON accounts FOR EACH ROW SET @authority_fixture_owner=1',
      );
      try {
        expect((await verifiedWebBaselineCoverage(reader)).size).toBe(85);
      } finally {
        await root.query('DROP TRIGGER authority_fixture_owner');
      }
    });
    it('preserves the full published MUD owner metadata', async () => {
      expect(
        await ownerMetadataFingerprint(
          root,
          readOwnerSchemaFixture(process.env.TEST_BASELINE_MUD_SOURCE!),
        ),
      ).toBe(ownerBefore);
    });
  });

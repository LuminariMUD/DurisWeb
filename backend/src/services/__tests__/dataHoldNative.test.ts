import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mysql, { type Pool, type Connection, type RowDataPacket } from 'mysql2/promise';
import type { UserPermissions } from '../permissionService.js';
import { DATA_HOLD_MIGRATION } from '../../db/dataHoldSchema.js';
import { verifiedWebBaselineCoverage } from '../../db/webBaseline.js';
import { runFixtureWebMigrations } from '../../test/webMigrationFixture.js';

const port = Number(process.env.TEST_DATA_HOLD_DB_PORT),
  database = process.env.DB_NAME ?? '';
if (
  process.env.TEST_DATA_HOLD_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    database !== 'durisweb_qualification_hold_suite')
)
  throw new Error('Data hold tests require the dedicated disposable fixture');
let role: 'player' | 'overlord' = 'overlord';
// Only the separate MUD account/role readers are fixtures. JWT/session/role gate/CSRF and hold storage are real.
jest.unstable_mockModule('../accountService.js', () => ({
  parseAccountFile: async () => ({ characters: [] }),
}));
jest.unstable_mockModule('../permissionService.js', () => ({
  getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
    accountName,
    role,
    immortalLevel: role === 'overlord' ? 62 : null,
    maxLevel: role === 'overlord' ? 62 : 20,
    guilds: [],
    canAccessImmortalForum: false,
    canAccessGodForum: false,
    canModerate: false,
    canBan: false,
    canEditPosts: false,
    canDeletePosts: false,
    canPinThreads: false,
    canLockThreads: false,
    adminPermissions: ['manage_permissions', 'manage_mud_properties'],
  }),
}));
jest.unstable_mockModule('../adminPermissionService.js', () => ({
  getUserPermissions: async () => new Set(['manage_permissions', 'manage_mud_properties']),
}));
let pool: Pool | undefined, root: Connection | undefined;
let service: typeof import('../dataHoldService.js');
let app: express.Express,
  token = '';
const actor = 'HoldFixtureOperator',
  session = randomUUID(),
  csrf = 'e'.repeat(64);
const ids = new Set<string>();
function cookies() {
  return [`access_token=${token}`, `csrf_token=${csrf}`];
}
async function input(scope: unknown = { kind: 'global' }) {
  const [rows] = await root!.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch');
  const now = Number(rows[0].epoch),
    id = randomUUID();
  ids.add(id);
  return {
    id,
    scope,
    reason: 'Synthetic private review reason',
    reviewAtEpoch: now + 10000,
    expiresAtEpoch: now + 20000,
  };
}
function intercept(
  operation: (method: string, sql: string, run: () => Promise<unknown>) => Promise<unknown>,
) {
  const checkout = pool!.getConnection.bind(pool!);
  jest.spyOn(pool!, 'getConnection').mockImplementation(
    async () =>
      new Proxy(await checkout(), {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (['query', 'execute', 'commit'].includes(String(key)) && typeof value === 'function')
            return (...args: unknown[]) => {
              const first = args[0],
                sql =
                  typeof first === 'string'
                    ? first
                    : first && typeof first === 'object' && 'sql' in first
                      ? String(first.sql)
                      : '';
              return operation(String(key), sql, async () => Reflect.apply(value, target, args));
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
  );
}

(port ? describe : describe.skip)(
  'data hold records on a disposable full owner/schema fixture',
  () => {
    beforeAll(async () => {
      pool = (await import('../../db/connection.js')).pool;
      service = await import('../dataHoldService.js');
      root = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', database });
      await (await import('../sessionService.js')).createWebSession(
        actor,
        session,
        'synthetic-hold-session-credential',
      );
      token = (await import('../../middleware/auth.js')).generateAccessToken(actor, '', session);
      app = express();
      app.use(express.json(), cookieParser());
      app.use('/api/admin/data-holds', (await import('../../routes/dataHolds.js')).default);
    });
    beforeEach(() => {
      role = 'overlord';
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      if (ids.size) await root!.query('DELETE FROM web_data_holds WHERE id IN (?)', [[...ids]]);
      ids.clear();
    });
    afterAll(async () => {
      if (root) {
        await root.execute('DELETE FROM web_sessions WHERE id=? AND account_name=?', [
          session,
          actor,
        ]);
        await root.end();
      }
      await pool?.end();
    });

    it('preserves all four scope intents, exact retries and immutable release history with database UTC instants', async () => {
      for (const scope of [
        { kind: 'global' },
        { kind: 'class', classId: 'analytics_events' },
        { kind: 'account', accountName: 'SyntheticSubject' },
        { kind: 'account_class', classId: 'login_history', accountName: 'SyntheticSubject' },
      ]) {
        const value = await input(scope);
        value.reason += " with 'quotes', \\slashes and \u05e2\u05d1\u05e8\u05d9\u05ea";
        const first = await service.createDataHold(actor, value);
        expect(await service.createDataHold(actor, value)).toEqual(first);
        await expect(service.createDataHold('OtherOperator', value)).rejects.toMatchObject({
          reason: 'identity_conflict',
        });
        const released = await service.releaseDataHold('HoldReviewer', value.id, {
          reason: 'Synthetic review complete',
        });
        expect(released).toMatchObject({
          status: 'released',
          createdBy: actor,
          reason: value.reason,
          releasedBy: 'HoldReviewer',
        });
        expect(
          await service.releaseDataHold('HoldReviewer', value.id, {
            reason: 'Synthetic review complete',
          }),
        ).toEqual(released);
        expect((await service.createDataHold(actor, value)).status).toBe('released');
        for (const zone of ['+00:00', '+03:00', '-07:00']) {
          await root!.query('SET time_zone=?', [zone]);
          const [stored] = await root!.execute<RowDataPacket[]>(
            'SELECT UNIX_TIMESTAMP(created_at) AS created,UNIX_TIMESTAMP(updated_at) AS updated FROM web_data_holds WHERE id=?',
            [value.id],
          );
          expect(Number(stored[0].created)).toBe(first.createdAtEpoch);
          expect(Number(stored[0].updated)).toBe(released.updatedAtEpoch);
        }
        await root!.query('SET time_zone=@@global.time_zone');
      }
      expect(
        (await service.listDataHolds({ after: null, includeReleased: true, limit: 100 })).holds
          .length,
      ).toBe(4);
    });

    it('serializes competing creates/releases and never replaces the winning attribution', async () => {
      const value = await input();
      for (let attempt = 0; attempt < 20; attempt++) {
        const current = attempt === 0 ? value : await input();
        const created = await Promise.all([
          service.createDataHold(actor, current),
          service.createDataHold(actor, current),
        ]);
        expect(created[0]).toEqual(created[1]);
      }
      const outcomes = await Promise.allSettled([
        service.releaseDataHold(actor, value.id, { reason: 'First review' }),
        service.releaseDataHold('OtherReviewer', value.id, { reason: 'Second review' }),
      ]);
      expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      const failed = outcomes.find((item) => item.status === 'rejected');
      expect(failed && failed.status === 'rejected' ? failed.reason : null).toMatchObject({
        reason: 'release_conflict',
      });
      expect((await service.getDataHold(value.id)).status).toBe('released');
    });

    it('recovers the same durable record after lost creation/release commit acknowledgements', async () => {
      const value = await input();
      let lose = true;
      intercept(async (method, _sql, run) => {
        const result = await run();
        if (method === 'commit' && lose) {
          lose = false;
          throw new Error('private-hold-commit-sentinel');
        }
        return result;
      });
      await expect(service.createDataHold(actor, value)).rejects.toMatchObject({
        reason: 'storage_unavailable',
      });
      const first = await service.createDataHold(actor, value);
      lose = true;
      await expect(
        service.releaseDataHold(actor, value.id, { reason: 'Done' }),
      ).rejects.toMatchObject({ reason: 'storage_unavailable' });
      const closed = await service.releaseDataHold(actor, value.id, { reason: 'Done' });
      expect(closed).toMatchObject({
        id: first.id,
        reason: first.reason,
        status: 'released',
        releasedBy: actor,
      });
    });

    it('enforces real signed-session authentication, Overlord role and CSRF with private record-only replies', async () => {
      const value = await input();
      expect((await request(app).get('/api/admin/data-holds')).status).toBe(401);
      role = 'player';
      expect(
        (await request(app).get('/api/admin/data-holds').set('Cookie', cookies())).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/admin/data-holds')
            .set('Cookie', cookies())
            .set('X-CSRF-Token', csrf)
            .send(value)
        ).status,
      ).toBe(403);
      role = 'overlord';
      expect(
        (await request(app).post('/api/admin/data-holds').set('Cookie', cookies()).send(value))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/admin/data-holds')
            .set('Cookie', cookies())
            .set('X-CSRF-Token', csrf)
            .send({ ...value, createdBy: 'ForgedOperator' })
        ).status,
      ).toBe(400);
      const created = await request(app)
        .post('/api/admin/data-holds')
        .set('Cookie', cookies())
        .set('X-CSRF-Token', csrf)
        .send(value);
      expect(created.status).toBe(200);
      expect(created.headers['cache-control']).toBe('no-store');
      expect(created.body).toMatchObject({
        enforcementReady: false,
        hold: { id: value.id, createdBy: actor },
      });
      const fetched = await request(app)
        .get('/api/admin/data-holds/' + value.id)
        .set('Cookie', cookies());
      expect(fetched.status).toBe(200);
      expect(fetched.headers.vary).toContain('Cookie');
      for (const query of [
        'includeReleased=true&includeReleased=false',
        'limit=101',
        'after=bad',
        'unknown=true',
      ])
        expect(
          (
            await request(app)
              .get('/api/admin/data-holds?' + query)
              .set('Cookie', cookies())
          ).status,
        ).toBe(400);
      const closed = await request(app)
        .post('/api/admin/data-holds/' + value.id + '/release')
        .set('Cookie', cookies())
        .set('X-CSRF-Token', csrf)
        .send({ reason: 'Reviewed' });
      expect(closed.status).toBe(200);
      expect(closed.body.hold.status).toBe('released');
      await root!.execute('UPDATE web_sessions SET expires_at_epoch=UNIX_TIMESTAMP() WHERE id=?', [
        session,
      ]);
      expect(
        (await request(app).get('/api/admin/data-holds').set('Cookie', cookies())).status,
      ).toBe(401);
      await root!.execute(
        'UPDATE web_sessions SET expires_at_epoch=UNIX_TIMESTAMP()+604800 WHERE id=?',
        [session],
      );
    });

    it('keeps expired/review-due and invalid records, and refuses raw provider/SQL payloads in errors', async () => {
      const value = await input();
      await service.createDataHold(actor, value);
      await root!.execute(
        'UPDATE web_data_holds SET created_at=FROM_UNIXTIME(UNIX_TIMESTAMP()-100),updated_at=FROM_UNIXTIME(UNIX_TIMESTAMP()-100),review_at_epoch=UNIX_TIMESTAMP()-10,expires_at_epoch=UNIX_TIMESTAMP()+10 WHERE id=?',
        [value.id],
      );
      expect(await service.getDataHold(value.id)).toMatchObject({
        status: 'active',
        reviewDue: true,
      });
      await root!.execute(
        'UPDATE web_data_holds SET expires_at_epoch=UNIX_TIMESTAMP() WHERE id=?',
        [value.id],
      );
      expect(await service.getDataHold(value.id)).toMatchObject({ status: 'expired' });
      const past = await service.getDataHold(value.id);
      expect(
        (
          await service.createDataHold(actor, {
            ...value,
            reviewAtEpoch: past.reviewAtEpoch,
            expiresAtEpoch: past.expiresAtEpoch,
          })
        ).status,
      ).toBe('expired');
      await root!.execute('UPDATE web_data_holds SET scope_type=?,class_id=? WHERE id=?', [
        'class',
        'unrecognized',
        value.id,
      ]);
      await expect(service.getDataHold(value.id)).rejects.toMatchObject({
        reason: 'invalid_record',
      });
      await expect(
        service.releaseDataHold(actor, value.id, { reason: 'Done' }),
      ).rejects.toMatchObject({ reason: 'invalid_record' });
      const [retained] = await root!.execute<RowDataPacket[]>(
        'SELECT class_id FROM web_data_holds WHERE id=?',
        [value.id],
      );
      expect(retained[0].class_id).toBe('unrecognized');
      intercept(async (_method, sql, run) => {
        if (sql.startsWith('INSERT')) throw new Error('private-sql-account-ip-password-sentinel');
        return run();
      });
      const log = (await import('../../utils/logger.js')).default;
      const warning = jest.spyOn(log, 'warn').mockReturnValue(log);
      const failing = await request(app)
        .post('/api/admin/data-holds')
        .set('Cookie', cookies())
        .set('X-CSRF-Token', csrf)
        .send(await input());
      expect(failing.status).toBe(503);
      expect(JSON.stringify(failing.body)).not.toContain(
        'private-sql-account-ip-password-sentinel',
      );
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(
        /private-sql|Synthetic private review|HoldFixtureOperator/,
      );
      expect(warning.mock.calls).toContainEqual([
        'data_hold_operation_failed',
        {
          reason: 'storage_unavailable',
          reference: expect.any(String),
        },
      ]);
    });

    it('bounds history pages and uses the released/ID index for an unreleased scan', async () => {
      const historic = [];
      const clock = await input();
      for (let index = 0; index < 1000; index++) {
        const id = randomUUID();
        ids.add(id);
        historic.push([
          id,
          'global',
          'Synthetic past reason',
          actor,
          clock.reviewAtEpoch,
          clock.expiresAtEpoch,
        ]);
      }
      await root!.query(
        'INSERT INTO web_data_holds(id,scope_type,reason,created_by,review_at_epoch,expires_at_epoch) VALUES ?',
        [historic],
      );
      await root!.query(
        'UPDATE web_data_holds SET released_by=?,release_reason=?,released_at_epoch=UNIX_TIMESTAMP() WHERE id IN (?)',
        [actor, 'Synthetic past release', historic.map((row) => row[0])],
      );
      const values = [];
      for (let index = 0; index < 120; index++) {
        const value = await input();
        values.push([
          value.id,
          'global',
          'Synthetic reason',
          actor,
          value.reviewAtEpoch,
          value.expiresAtEpoch,
        ]);
      }
      await root!.query(
        'INSERT INTO web_data_holds(id,scope_type,reason,created_by,review_at_epoch,expires_at_epoch) VALUES ?',
        [values],
      );
      const statements = jest.spyOn(pool!, 'execute');
      const first = await service.listDataHolds({
        after: null,
        includeReleased: false,
        limit: 100,
      });
      expect(first.holds.length).toBe(100);
      expect(first.nextCursor).not.toBeNull();
      expect(
        (
          await service.listDataHolds({
            after: first.nextCursor,
            includeReleased: false,
            limit: 100,
          })
        ).holds.length,
      ).toBe(20);
      const captured = statements.mock.calls.find(
        (call) =>
          typeof call[0] === 'object' &&
          call[0].sql.includes('FROM web_data_holds') &&
          call[0].sql.includes('released_at_epoch IS NULL'),
      );
      if (!captured || typeof captured[0] !== 'object')
        throw new Error('Actual hold list query was not observed');
      const bindings: unknown[] = Array.isArray(captured[1]) ? captured[1] : [];
      const [plan] = await root!.query<RowDataPacket[]>(
        { sql: 'EXPLAIN ' + captured[0].sql, timeout: 5000 },
        bindings,
      );
      expect(plan[0].key).toBe('idx_data_holds_unreleased');
      expect(String(plan[0].Extra)).not.toMatch(/filesort/i);
    });

    it('refuses rollback with any history and recovers only the exact interrupted empty schema', async () => {
      const value = await input();
      await service.createDataHold(actor, value);
      expect(() =>
        runFixtureWebMigrations(port, database, { direction: 'down', name: DATA_HOLD_MIGRATION }),
      ).toThrow(/data_hold_rollback_refuses_history/);
      await service.releaseDataHold(actor, value.id, { reason: 'Done' });
      expect(() =>
        runFixtureWebMigrations(port, database, { direction: 'down', name: DATA_HOLD_MIGRATION }),
      ).toThrow(/data_hold_rollback_refuses_history/);
      await root!.execute('DELETE FROM web_data_holds WHERE id=?', [value.id]);
      ids.delete(value.id);
      runFixtureWebMigrations(port, database, {
        direction: 'down',
        name: DATA_HOLD_MIGRATION,
        loseDdlAcknowledgement: 'holds',
      });
      await expect(verifiedWebBaselineCoverage(root!)).rejects.toThrow(
        /schema_drift_web_data_holds/,
      );
      runFixtureWebMigrations(port, database, { direction: 'down', name: DATA_HOLD_MIGRATION });
      runFixtureWebMigrations(port, database, {
        direction: 'up',
        name: DATA_HOLD_MIGRATION,
        loseDdlAcknowledgement: 'holds',
      });
      await expect(verifiedWebBaselineCoverage(root!)).rejects.toThrow(
        /schema_drift_web_data_holds/,
      );
      runFixtureWebMigrations(port, database, { direction: 'up', name: DATA_HOLD_MIGRATION });
      await root!.query('ALTER TABLE web_data_holds ADD COLUMN hold_fixture_drift INT NULL');
      try {
        expect(() =>
          runFixtureWebMigrations(port, database, { direction: 'up', name: DATA_HOLD_MIGRATION }),
        ).toThrow(/schema_drift_web_data_holds/);
      } finally {
        await root!.query('ALTER TABLE web_data_holds DROP COLUMN hold_fixture_drift');
      }
      await expect(service.createDataHold(actor, await input())).resolves.toMatchObject({
        status: 'active',
      });
    });
  },
);

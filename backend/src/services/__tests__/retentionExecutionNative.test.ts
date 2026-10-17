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
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import mysql, { type Connection, type Pool, type RowDataPacket } from 'mysql2/promise';
import { RETENTION_CONTROL_KEY } from '../../db/internalWebSettings.js';
import { RETENTION_RUN_MIGRATION } from '../../db/retentionRunSchema.js';
import { runFixtureWebMigrations } from '../../test/webMigrationFixture.js';
import { verifiedWebBaselineCoverage } from '../../db/webBaseline.js';
import { retentionCandidateRules } from '../retentionCandidates.js';
import { getBackendConfiguration } from '../../config/environment.js';

const port = Number(process.env.TEST_RETENTION_EXECUTION_DB_PORT),
  database = process.env.DB_NAME ?? '';
const cacheDb = port === 23436 ? '13' : '14';
if (
  process.env.TEST_RETENTION_EXECUTION_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    getBackendConfiguration().database.port !== port ||
    database !== 'durisweb_qualification_retention_execution_suite' ||
    process.env.CACHE_REDIS_HOST !== '127.0.0.1' ||
    process.env.CACHE_REDIS_PORT !== '23479' ||
    process.env.CACHE_REDIS_DB !== cacheDb)
)
  throw new Error('Retention execution requires its own disposable database/cache targets');
const fixturePolicy = {
  version: '2026-10-17-draft-1',
  approved: true,
  executionEnabled: true,
  approvalReference: 'isolated-synthetic-fixture-only',
  classes: {
    analytics_events: { proposedAgeSeconds: 30 * 86400, approved: true },
    login_history: { proposedAgeSeconds: 90 * 86400, approved: true },
  },
};
// Synthetic approval exists only in this isolated Jest runtime. The actual CLI remains source-gated.
jest.unstable_mockModule('../../config/retentionPolicy.js', () => ({
  retentionPreviewPolicy: fixturePolicy,
  retentionPreviewClasses: ['analytics_events', 'login_history'],
}));
const realConnect = mysql.createConnection.bind(mysql);
let root: Connection,
  pool: Pool,
  now = 0,
  executionNow = 0,
  zone = '+00:00';
let engine: typeof import('../retentionExecution.js'),
  holds: typeof import('../dataHoldService.js');
let redis: typeof import('../../db/redis.js')['default'];
const otherKey = 'retention-fixture-other:' + randomUUID();
const legacyKey = 'web_analytics:overview:365d';
function options(runId = randomUUID()) {
  return {
    target: `127.0.0.1:${port}/${database}`,
    policyVersion: fixturePolicy.version,
    runId,
    cacheTarget: `127.0.0.1:23479/${cacheDb}`,
    classes: ['analytics_events', 'login_history'] as const,
    batchSize: 100,
    maxCandidates: 1000,
    timeBudgetMs: 10000,
  };
}
async function page(epoch: number, account: string | null = 'Alpha') {
  await root.execute(
    'INSERT INTO page_views(session_id,path,account_name,created_at) VALUES (?,?,?,FROM_UNIXTIME(?))',
    ['synthetic-visit', '/private-fixture', account, epoch],
  );
}
async function login(epoch: number, account = 'Alpha', id?: string) {
  if (id)
    await root.execute(
      'INSERT INTO account_login_history(id,account_name,status,timestamp) VALUES (?,?,?,FROM_UNIXTIME(?))',
      [id, account, 'login', epoch],
    );
  else
    await root.execute(
      'INSERT INTO account_login_history(account_name,status,timestamp) VALUES (?,?,FROM_UNIXTIME(?))',
      [account, 'login', epoch],
    );
}
async function count(table: 'page_views' | 'account_login_history' | 'web_retention_runs') {
  return Number(
    (await root.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM ' + table))[0][0].count,
  );
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let intercept:
  | ((sql: string, run: () => Promise<unknown>, connection: Connection) => Promise<unknown>)
  | undefined;
async function hold(accountName = 'Alpha') {
  return holds.createDataHold('FixtureApprover', {
    id: randomUUID(),
    scope: { kind: 'account', accountName },
    reason: 'Preserve synthetic review',
    reviewAtEpoch: now + 10000,
    expiresAtEpoch: null,
  });
}

(port ? describe : describe.skip)(
  'approved-fixture SQL retention with real holds/progress/cache',
  () => {
    beforeAll(async () => {
      root = await realConnect({ host: '127.0.0.1', port, database, user: 'root' });
      pool = (await import('../../db/connection.js')).pool;
      engine = await import('../retentionExecution.js');
      holds = await import('../dataHoldService.js');
      redis = (await import('../../db/redis.js')).default;
      await redis.ping();
      if ((await redis.get('retention-execution-fixture-owner')) !== database)
        throw new Error(
          'Execution fixture cache ownership must be established by its isolated runner',
        );
    });
    beforeEach(async () => {
      await root.execute('DELETE FROM page_views');
      await root.execute('DELETE FROM account_login_history');
      await root.execute('DELETE FROM web_retention_runs');
      await root.execute('DELETE FROM web_data_holds');
      await root.execute('DELETE FROM web_settings WHERE setting_key=?', [RETENTION_CONTROL_KEY]);
      now = Number(
        (await root.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch'))[0][0].epoch,
      );
      executionNow = now;
      zone = '+00:00';
      intercept = undefined;
      jest.spyOn(mysql, 'createConnection').mockImplementation(async (config) => {
        const connection = await realConnect(config);
        await connection.query('SET time_zone=?', [zone]);
        await connection.query('SET timestamp=?', [executionNow]);
        return new Proxy(connection, {
          get(target, key) {
            const value: unknown = Reflect.get(target, key, target);
            if (['execute', 'query'].includes(String(key)) && typeof value === 'function')
              return (...args: unknown[]) => {
                const first = args[0],
                  sql =
                    typeof first === 'string'
                      ? first
                      : first && typeof first === 'object' && 'sql' in first
                        ? String(first.sql)
                        : '';
                const run = async () => Reflect.apply(value, target, args);
                return intercept ? intercept(sql, run, target) : run();
              };
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      });
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      intercept = undefined;
      await root.query('SET time_zone=DEFAULT');
      await redis.del(legacyKey, otherKey);
    });
    afterAll(async () => {
      await root?.end();
      await pool?.end();
      redis?.disconnect();
    });

    it('deletes only strict before-cutoff rows across offsets and preserves unknown/fresh/protected stores', async () => {
      for (const offset of ['+00:00', '+03:00', '-07:00']) {
        zone = offset;
        await root.execute('DELETE FROM page_views');
        await root.execute('DELETE FROM account_login_history');
        for (const delta of [-1, 0, 1]) {
          await page(now - 30 * 86400 + delta);
          await login(now - 90 * 86400 + delta);
        }
        await root.execute('INSERT INTO page_views(session_id,path,created_at) VALUES (?,?,NULL)', [
          'unknown-time',
          '/unknown',
        ]);
        const result = await engine.executeRetention(options());
        expect(result).toMatchObject({
          complete: true,
          cacheComplete: true,
          classes: [{ deleted: 1 }, { deleted: 1 }],
        });
        expect(await count('page_views')).toBe(3);
        expect(await count('account_login_history')).toBe(2);
        expect(JSON.stringify(result)).not.toMatch(/Alpha|private-fixture|cursorId|owner/);
      }
    });

    it.each(['analytics_events', 'login_history'] as const)(
      'keeps the two fall-back hour occurrences distinct for %s',
      async (classId) => {
        const cutoff = Date.parse('2025-11-02T05:45:00Z') / 1000;
        await root.query("SET time_zone='+00:00'");
        zone = 'America/New_York';
        executionNow = cutoff + fixturePolicy.classes[classId].proposedAgeSeconds;
        for (const delta of [-900, 0, 2700]) {
          if (classId === 'analytics_events') await page(cutoff + delta);
          else await login(cutoff + delta);
        }
        const result = await engine.executeRetention({ ...options(), classes: [classId] });
        expect(result).toMatchObject({
          complete: true,
          classes: [{ cutoffEpoch: cutoff, deleted: 1 }],
        });
        expect(
          await count(classId === 'analytics_events' ? 'page_views' : 'account_login_history'),
        ).toBe(2);
      },
    );

    it.each(['analytics_events', 'login_history'] as const)(
      'traverses both eligible fall-back occurrences for %s with one-row batches',
      async (classId) => {
        const cutoff = Date.parse('2025-11-02T06:45:00Z') / 1000;
        await root.query("SET time_zone='+00:00'");
        zone = 'America/New_York';
        executionNow = cutoff + fixturePolicy.classes[classId].proposedAgeSeconds;
        for (const delta of [-4500, -900, 0, 60]) {
          if (classId === 'analytics_events') await page(cutoff + delta);
          else await login(cutoff + delta);
        }
        const result = await engine.executeRetention({
          ...options(),
          classes: [classId],
          batchSize: 1,
        });
        expect(result).toMatchObject({
          complete: true,
          classes: [{ cutoffEpoch: cutoff, deleted: 2 }],
        });
        expect(
          await count(classId === 'analytics_events' ? 'page_views' : 'account_login_history'),
        ).toBe(2);
      },
    );

    it('refuses a saved run whose rules predate the explicit UTC execution contract', async () => {
      await page(now - 100 * 86400);
      await page(now - 100 * 86400);
      const input = { ...options(), maxCandidates: 1, batchSize: 1 };
      expect((await engine.executeRetention(input)).complete).toBe(false);
      const previousSignature = createHash('sha256')
        .update(
          JSON.stringify({
            format: 'retention-execution-v1',
            policy: fixturePolicy,
            rules: retentionCandidateRules,
          }),
        )
        .digest('hex');
      await root.execute(
        "UPDATE web_retention_runs SET rules_sha256=?,progress=JSON_SET(progress,'$.checkpoint.signature',?) WHERE id=?",
        [previousSignature, previousSignature, input.runId],
      );
      const before = (
        await root.execute<RowDataPacket[]>(
          'SELECT rules_sha256,CAST(progress AS CHAR) AS progress FROM web_retention_runs WHERE id=?',
          [input.runId],
        )
      )[0];
      await expect(engine.executeRetention(input)).rejects.toMatchObject({
        reason: 'run_identity_conflict',
      });
      const after = (
        await root.execute<RowDataPacket[]>(
          'SELECT rules_sha256,CAST(progress AS CHAR) AS progress FROM web_retention_runs WHERE id=?',
          [input.runId],
        )
      )[0];
      expect(after).toEqual(before);
    });

    it('rechecks a hold acknowledged after dry run and applies account collation without collateral deletion', async () => {
      await page(now - 100 * 86400, '\u00c1lpha');
      await page(now - 100 * 86400, 'Beta');
      await page(now - 100 * 86400, null);
      await login(now - 100 * 86400, '\u00c1lpha');
      await login(now - 100 * 86400, 'Beta');
      const preview = await (await import('../retentionPreview.js')).previewRetention(options());
      expect(preview.result.classes[0].unheldAgeCandidatesObserved).toBe(3);
      await hold('ALPHA');
      const result = await engine.executeRetention(options());
      expect(result).toMatchObject({
        complete: true,
        classes: [
          { deleted: 2, held: 1 },
          { deleted: 1, held: 1 },
        ],
      });
      expect(await count('page_views')).toBe(1);
      expect(await count('account_login_history')).toBe(1);
      const settings = await import('../webSettingsService.js');
      expect(await settings.getWebSetting(RETENTION_CONTROL_KEY)).toBeNull();
      expect(
        (await settings.getWebSettingsRaw()).some((row) =>
          row.setting_key.startsWith('retention-control-v1:'),
        ),
      ).toBe(false);
    });

    it('restarts from committed progress with fixed high water and exact BIGINT identities', async () => {
      for (let index = 0; index < 7; index++) await page(now - 100 * 86400);
      await login(now - 100 * 86400, 'Alpha', '9007199254740993');
      await login(now - 100 * 86400, 'Beta', '9007199254740995');
      const request = options();
      const first = await engine.executeRetention({ ...request, batchSize: 1, maxCandidates: 2 });
      expect(first.complete).toBe(false);
      expect(first.classes[0].deleted).toBe(2);
      await page(now - 101 * 86400, 'NewAfterCapture');
      const resumed = await engine.executeRetention(request);
      expect(resumed).toMatchObject({ complete: true, classes: [{ deleted: 7 }, { deleted: 2 }] });
      expect(await count('page_views')).toBe(1);
      expect(await count('account_login_history')).toBe(0);
      expect(await engine.executeRetention(request)).toEqual(resumed);
    });

    it('retains exact data/count state after an unknown commit acknowledgement and a rolled-back checkpoint failure', async () => {
      await page(now - 100 * 86400);
      let commits = 0,
        lost = false;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 2) {
          lost = true;
          throw new Error('private-commit-sentinel');
        }
        return result;
      };
      const request = options();
      await expect(engine.executeRetention(request)).rejects.toMatchObject({
        reason: 'storage_unavailable',
      });
      expect(lost).toBe(true);
      expect(await count('page_views')).toBe(0);
      intercept = undefined;
      expect(await engine.executeRetention(request)).toMatchObject({
        complete: true,
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
      await page(now - 100 * 86400);
      let rejected = false;
      intercept = async (sql, run) => {
        if (!rejected && sql.startsWith('UPDATE web_retention_runs')) {
          rejected = true;
          throw new Error('private-checkpoint-sentinel');
        }
        return run();
      };
      const second = options();
      await expect(engine.executeRetention(second)).rejects.toMatchObject({
        reason: 'storage_unavailable',
      });
      expect(await count('page_views')).toBe(1);
      intercept = undefined;
      expect(await engine.executeRetention(second)).toMatchObject({
        complete: true,
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
    });

    it('fences duplicate/expired owners while allowing hold creation between batches', async () => {
      await page(now - 100 * 86400);
      const claimed = deferred(),
        resume = deferred();
      let firstCommit = true;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && firstCommit) {
          firstCommit = false;
          claimed.resolve();
          await resume.promise;
        }
        return result;
      };
      const first = options(),
        running = engine.executeRetention(first);
      await Promise.race([
        claimed.promise,
        running.then(() => {
          throw new Error('Expected claim pause');
        }),
      ]);
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'operation_in_progress',
        });
        await hold();
      } finally {
        resume.resolve();
      }
      expect(await running).toMatchObject({
        complete: true,
        classes: [{ deleted: 0, held: 1 }, { deleted: 0 }],
      });
      await root.execute('DELETE FROM web_data_holds');
      intercept = undefined;
      const stale = JSON.stringify({
        format: 1,
        lease: { owner: randomUUID(), runId: randomUUID(), expiresAtEpoch: now - 1 },
      });
      await root.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
        stale,
        RETENTION_CONTROL_KEY,
      ]);
      expect(await engine.executeRetention(options())).toMatchObject({
        complete: true,
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
    });

    it('fences a live expired worker after a successor claims ownership without clearing the successor lease', async () => {
      await page(now - 100 * 86400);
      const claimed1 = deferred(),
        claimed2 = deferred(),
        resume1 = deferred(),
        resume2 = deferred();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT') {
          commits++;
          if (commits === 1) {
            claimed1.resolve();
            await resume1.promise;
          } else if (commits === 2) {
            claimed2.resolve();
            await resume2.promise;
          }
        }
        return result;
      };
      const first = options(),
        second = options();
      const old = engine.executeRetention(first).then(
        (result) => ({ result, error: null }),
        (error) => ({ result: null, error }),
      );
      await Promise.race([
        claimed1.promise,
        old.then(() => {
          throw new Error('First worker did not pause');
        }),
      ]);
      executionNow = now + 31;
      const successor = engine.executeRetention(second);
      await Promise.race([
        claimed2.promise,
        successor.then(() => {
          throw new Error('Successor did not pause');
        }),
      ]);
      try {
        resume1.resolve();
        const outcome = await old;
        if (outcome.error) expect(outcome.error).toMatchObject({ reason: 'lease_lost' });
        else
          expect(outcome.result).toMatchObject({
            complete: false,
            classes: [{ deleted: 0 }, { deleted: 0 }],
          });
        expect(await count('page_views')).toBe(1);
        const [control] = await root.execute<RowDataPacket[]>(
          'SELECT setting_value FROM web_settings WHERE setting_key=?',
          [RETENTION_CONTROL_KEY],
        );
        expect(JSON.parse(control[0].setting_value).lease.runId).toBe(second.runId);
      } finally {
        resume1.resolve();
        resume2.resolve();
      }
      expect(await successor).toMatchObject({
        complete: true,
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
    });

    it('rechecks the actual deletion predicate and records a changed candidate as skipped', async () => {
      await page(now - 100 * 86400);
      let changed = false;
      intercept = async (sql, run, connection) => {
        if (!changed && sql.startsWith('DELETE FROM page_views')) {
          changed = true;
          await connection.execute('UPDATE page_views SET created_at=FROM_UNIXTIME(?)', [now]);
        }
        return run();
      };
      const result = await engine.executeRetention(options());
      expect(result).toMatchObject({
        complete: true,
        classes: [{ deleted: 0, skipped: 1 }, { deleted: 0 }],
      });
      expect(await count('page_views')).toBe(1);
    });

    it('orders a concurrent hold acknowledgement after a deletion that already owns the transaction lock', async () => {
      await page(now - 100 * 86400);
      const selected = deferred(),
        resume = deferred();
      let paused = false,
        thread = 0;
      intercept = async (sql, run) => {
        if (sql.startsWith('DELETE FROM page_views') && !paused) {
          paused = true;
          selected.resolve();
          await resume.promise;
        }
        return run();
      };
      const checkout = pool.getConnection.bind(pool);
      jest.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const connection = await checkout();
        thread = connection.threadId;
        return connection;
      });

      const running = engine.executeRetention(options());
      await Promise.race([
        selected.promise,
        running.then(() => {
          throw new Error('Expected deletion pause');
        }),
      ]);
      const holding = hold();
      try {
        const deadline = Date.now() + 2500;
        let waiting = false;
        while (Date.now() < deadline) {
          const [rows] =
            port === 23436
              ? await root.execute<RowDataPacket[]>(
                  `SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w
            JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID
            JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE
            WHERE t.PROCESSLIST_ID=? AND l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME='web_settings'`,
                  [thread],
                )
              : await root.execute<RowDataPacket[]>(
                  "SELECT COUNT(*) AS count FROM information_schema.PROCESSLIST WHERE ID=? AND INFO LIKE '%web_settings%' AND TIME_MS>=100",
                  [thread],
                );
          if (Number(rows[0].count) > 0) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        resume.resolve();
        await Promise.allSettled([running, holding]);
      }
      expect(await running).toMatchObject({
        complete: true,
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
      expect((await holding).status).toBe('active');
      expect(await count('page_views')).toBe(0);
    });

    it('keeps cache cleanup pending on failure, serves fresh uncached reads, then confirms removal on retry', async () => {
      await page(now - 100 * 86400);
      await page(now - 86400);
      await redis.set(legacyKey, JSON.stringify({ totalPageViews: 999 }));
      await redis.set(otherKey, 'preserve unrelated cache');
      const scan = jest
        .spyOn(redis, 'scan')
        .mockRejectedValue(new Error('private-cache-key-password-sentinel'));
      const request = options(),
        partial = await engine.executeRetention(request);
      expect(partial).toMatchObject({
        status: 'awaiting_cache',
        complete: false,
        lastFailure: 'cache_unavailable',
        classes: [{ deleted: 1 }, { deleted: 0 }],
      });
      const get = jest.spyOn(redis, 'get'),
        setex = jest.spyOn(redis, 'setex');
      expect(
        (await (await import('../webAnalyticsService.js')).getWebOverviewStats(365)).totalPageViews,
      ).toBe(1);
      expect(get).not.toHaveBeenCalled();
      expect(setex).not.toHaveBeenCalled();
      expect(await redis.exists(legacyKey)).toBe(1);
      scan.mockRestore();
      const done = await engine.executeRetention(request);
      expect(done.complete).toBe(true);
      expect(await redis.exists(legacyKey)).toBe(0);
      expect(await redis.get(otherKey)).toBe('preserve unrelated cache');
    });

    it('refuses incoming FK/trigger/schema or progress drift and keeps the real CLI source-gated', async () => {
      await page(now - 100 * 86400);
      await root.query(
        'CREATE TABLE retention_fixture_child(id INT PRIMARY KEY,page_id INT UNSIGNED,FOREIGN KEY(page_id) REFERENCES page_views(id) ON DELETE CASCADE) ENGINE=InnoDB',
      );
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'schema_unverified',
        });
        expect(await count('page_views')).toBe(1);
      } finally {
        await root.query('DROP TABLE retention_fixture_child');
      }
      await root.query(
        'CREATE TRIGGER retention_fixture_trigger BEFORE DELETE ON page_views FOR EACH ROW SET @retention_fixture=1',
      );
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'schema_unverified',
        });
        expect(await count('page_views')).toBe(1);
      } finally {
        await root.query('DROP TRIGGER retention_fixture_trigger');
      }
      await root.query('ALTER TABLE page_views ADD COLUMN retention_fixture_drift INT NULL');
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'schema_unverified',
        });
        expect(await count('page_views')).toBe(1);
      } finally {
        await root.query('ALTER TABLE page_views DROP COLUMN retention_fixture_drift');
      }
      const request = options();
      await engine.executeRetention({ ...request, maxCandidates: 1 });
      await root.execute('UPDATE web_retention_runs SET progress=? WHERE id=?', [
        '{"format":1}',
        request.runId,
      ]);
      await expect(engine.executeRetention(request)).rejects.toMatchObject({
        reason: 'run_unverified',
      });
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'src/scripts/retention.ts',
          'execute',
          '--target',
          request.target,
          '--policy-version',
          request.policyVersion,
          '--run-id',
          randomUUID(),
          '--cache-target',
          request.cacheTarget,
        ],
        { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30000 },
      );
      expect(child.status).toBe(1);
      expect(child.stderr).toContain('execution_unavailable');
    });

    it('requires source approval for every selected class and a recorded approval reference', async () => {
      await page(now - 100 * 86400);
      fixturePolicy.classes.login_history.approved = false;
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'execution_unavailable',
        });
      } finally {
        fixturePolicy.classes.login_history.approved = true;
      }
      const original = fixturePolicy.approvalReference;
      fixturePolicy.approvalReference = '';
      try {
        await expect(engine.executeRetention(options())).rejects.toMatchObject({
          reason: 'execution_unavailable',
        });
      } finally {
        fixturePolicy.approvalReference = original;
      }
      expect(await count('page_views')).toBe(1);
      expect(await count('web_retention_runs')).toBe(0);
    });

    it('guards run history/control rollback and recovers exact interrupted DDL while ordinary preflight refuses', async () => {
      const request = options();
      await engine.executeRetention(request);
      expect(() =>
        runFixtureWebMigrations(port, database, {
          direction: 'down',
          name: RETENTION_RUN_MIGRATION,
        }),
      ).toThrow(/retention_rollback_refuses_run_history/);
      await root.execute('DELETE FROM web_retention_runs');
      await root.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
        JSON.stringify({
          format: 1,
          lease: { owner: randomUUID(), runId: randomUUID(), expiresAtEpoch: now + 100 },
        }),
        RETENTION_CONTROL_KEY,
      ]);
      expect(() =>
        runFixtureWebMigrations(port, database, {
          direction: 'down',
          name: RETENTION_RUN_MIGRATION,
        }),
      ).toThrow(/retention_rollback_refuses_control_state/);
      await root.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
        '{"format":1,"lease":null}',
        RETENTION_CONTROL_KEY,
      ]);
      runFixtureWebMigrations(port, database, {
        direction: 'down',
        name: RETENTION_RUN_MIGRATION,
        loseDdlAcknowledgement: 'retention',
      });
      await expect(verifiedWebBaselineCoverage(root)).rejects.toThrow(
        /schema_drift_web_retention_runs/,
      );
      runFixtureWebMigrations(port, database, { direction: 'down', name: RETENTION_RUN_MIGRATION });
      runFixtureWebMigrations(port, database, {
        direction: 'up',
        name: RETENTION_RUN_MIGRATION,
        loseDdlAcknowledgement: 'retention',
      });
      await expect(verifiedWebBaselineCoverage(root)).rejects.toThrow(
        /schema_drift_web_retention_runs/,
      );
      runFixtureWebMigrations(port, database, { direction: 'up', name: RETENTION_RUN_MIGRATION });
    });
  },
);

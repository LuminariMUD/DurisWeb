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
import crypto from 'node:crypto';
import { inspect } from 'node:util';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { getBackendConfiguration } from '../../config/environment.js';
import type { PrivacyPolicy } from '../../config/privacyPolicy.js';

const environment = getBackendConfiguration();
const nativePort = Number(process.env.TEST_PRIVACY_DB_PORT);
const database = environment.database.database;
if (
  process.env.TEST_PRIVACY_DB_PORT &&
  (![23436, 23437].includes(nativePort) ||
    environment.database.host !== '127.0.0.1' ||
    environment.database.port !== nativePort ||
    database !== 'durisweb_qualification_privacy_suite')
)
  throw new Error('Privacy tests require their dedicated disposable fixture and matching DB_PORT');

let policy: PrivacyPolicy;
jest.unstable_mockModule('../../config/privacyPolicy.js', () => ({
  getPrivacyPolicy: () => policy,
  privacyCollectionEnabled: () =>
    policy.approved && policy.collectionEnabled && policy.retentionReady,
}));
const { pool } = await import('../../db/connection.js');
const logger = (await import('../../utils/logger.js')).default;
const service = await import('../privacyChoiceService.js');
const { default: privacyRoutes } = await import('../../routes/privacy.js');
const { getWebSetting, getWebSettingsRaw, updateWebSetting } = await import(
  '../webSettingsService.js'
);
const keys = new Set<string>();
const sessions = new Set<string>();
let observer: mysql.Connection | undefined;
const approved: PrivacyPolicy = {
  noticeVersion: 'synthetic-1',
  choiceVersion: 'synthetic-1',
  approved: true,
  collectionEnabled: true,
  retentionReady: true,
  preferenceLifetimeSeconds: 86400,
};

function browser() {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const key = crypto
    .createHmac('sha256', environment.jwtSecret)
    .update('privacy-choice-browser-v1\0')
    .update(csrfToken)
    .digest('hex');
  keys.add('privacy-choice-v1:' + key);
  return { csrfToken, receipt: undefined as string | undefined };
}
function choose(context: ReturnType<typeof browser>, decision = 'accepted', revision = 0) {
  return service.recordPrivacyChoice(context, {
    decision,
    revision,
    choiceVersion: policy.choiceVersion,
    noticeVersion: policy.noticeVersion,
  });
}
function event(revision: number, route = 'news') {
  return {
    revision,
    route,
    choiceVersion: policy.choiceVersion,
    visitNonce: crypto.randomBytes(32).toString('hex'),
  };
}
function interceptQueries(
  intercept: (sql: string, execute: () => Promise<unknown>, thread: number) => Promise<unknown>,
) {
  const checkout = pool.getConnection.bind(pool);
  jest.spyOn(pool, 'getConnection').mockImplementation(
    async () =>
      new Proxy(await checkout(), {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if ((key === 'execute' || key === 'query') && typeof value === 'function')
            return (...args: unknown[]) => {
              const first = args[0];
              const sql =
                typeof first === 'string'
                  ? first
                  : first && typeof first === 'object' && 'sql' in first
                    ? String(first.sql)
                    : '';
              if (
                sql.startsWith('INSERT INTO page_views') &&
                Array.isArray(args[1]) &&
                typeof args[1][0] === 'string'
              )
                sessions.add(args[1][0]);
              return intercept(
                sql,
                async () => Reflect.apply(value, target, args),
                target.threadId,
              );
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
  );
}
function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    resolve: () => resolve(),
  };
}
async function waitForBlockedChoiceQuery(thread: number, read = false) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (nativePort === 23436) {
      const [waits] = await observer!.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_ID=?',
        [thread],
      );
      if (Number(waits[0].count) > 0) return;
    } else {
      // MariaDB can block the locking SELECT in Statistics before reporting an
      // InnoDB row wait. Observe the identified statement still executing after
      // 100 server-measured ms while the other transaction is held by our barrier.
      const prefix = read
        ? 'SELECT setting_key,description,updated_by,LEFT(setting_value,%'
        : 'INSERT INTO web_settings%';
      const [waits] = await observer!.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM information_schema.PROCESSLIST WHERE ID=? AND COMMAND IN ('Execute','Query') AND TIME_MS>=100 AND INFO LIKE ? AND (?=0 OR RIGHT(RTRIM(INFO),10)='FOR UPDATE')",
        [thread, prefix, Number(read)],
      );
      if (Number(waits[0].count) > 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected the identified privacy statement to remain blocked before release');
}

beforeEach(() => {
  policy = { ...approved, approved: false };
});
afterEach(async () => {
  jest.restoreAllMocks();
  if (nativePort) {
    if (sessions.size) {
      await pool.query('DELETE FROM page_views WHERE session_id IN (?)', [[...sessions]]);
      await pool.query('DELETE FROM visitor_sessions WHERE session_id IN (?)', [[...sessions]]);
    }
    if (keys.size)
      await pool.query('DELETE FROM web_settings WHERE setting_key IN (?)', [[...keys]]);
  }
  keys.clear();
  sessions.clear();
});
afterAll(async () => {
  await observer?.end();
  (await import('../../db/redis.js')).default.disconnect();
  await pool.end();
});

describe('privacy choice source gates', () => {
  it('correlates an acquisition outage with a safe stage and code', async () => {
    policy = { ...approved };
    const context = browser();
    const failure = Object.assign(new Error('private-diagnostic-sentinel'), {
      code: 'ECONNREFUSED',
      sql: 'private-sql-sentinel',
    });
    jest.spyOn(pool, 'getConnection').mockRejectedValue(failure);
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const app = express();
    app.use(cookieParser());
    app.use('/api/privacy', privacyRoutes);
    const response = await request(app)
      .get('/api/privacy')
      .set('Cookie', 'csrf_token=' + context.csrfToken);
    expect(response.status).toBe(503);
    expect(response.body.reference).toMatch(/^[\da-f-]{36}$/);
    expect(warning.mock.calls).toContainEqual([
      'privacy_choice_storage_unavailable',
      expect.objectContaining({
        reference: response.body.reference,
        operation: 'status',
        stage: 'acquire',
        code: 'ECONNREFUSED',
      }),
    ]);
    expect(inspect(warning.mock.calls) + JSON.stringify(response.body)).not.toContain('private-');
  });
  it('does no storage work before policy approval', async () => {
    const checkout = jest.spyOn(pool, 'getConnection');
    const context = browser();
    expect(await service.getPrivacyChoice(context)).toMatchObject({
      decision: 'unknown',
      choicesAvailable: false,
      collectionAvailable: false,
    });
    await expect(choose(context)).rejects.toMatchObject({ status: 503 });
    await expect(service.collectPrivacyPageView(undefined, event(1))).rejects.toMatchObject({
      status: 403,
    });
    expect(checkout).not.toHaveBeenCalled();
  });
  it.each(['collectionEnabled', 'retentionReady'] as const)(
    'cannot collect when %s is absent',
    async (gate) => {
      policy = { ...approved, [gate]: false };
      const checkout = jest.spyOn(pool, 'getConnection');
      await expect(choose(browser())).rejects.toMatchObject({ status: 409 });
      await expect(service.collectPrivacyPageView(undefined, event(1))).rejects.toMatchObject({
        status: 403,
      });
      expect(checkout).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed/coerced/extra choice input before storage', async () => {
    policy = { ...approved };
    const checkout = jest.spyOn(pool, 'getConnection');
    for (const input of [
      null,
      [],
      {},
      {
        decision: { toString: () => 'accepted' },
        revision: 0,
        choiceVersion: policy.choiceVersion,
        noticeVersion: policy.noticeVersion,
      },
      {
        decision: 'accepted',
        revision: -1,
        choiceVersion: policy.choiceVersion,
        noticeVersion: policy.noticeVersion,
      },
      {
        decision: 'accepted',
        revision: 0,
        choiceVersion: policy.choiceVersion,
        noticeVersion: policy.noticeVersion,
        account: 'private-sentinel',
      },
    ]) {
      await expect(service.recordPrivacyChoice(browser(), input)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(checkout).not.toHaveBeenCalled();
  });
  it('requires the current notice version even when the choice version has not changed', async () => {
    policy = { ...approved, noticeVersion: 'synthetic-notice-2' };
    const checkout = jest
      .spyOn(pool, 'getConnection')
      .mockRejectedValue(new Error('Storage must not be reached'));
    await expect(
      service.recordPrivacyChoice(browser(), {
        decision: 'accepted',
        revision: 0,
        choiceVersion: policy.choiceVersion,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(checkout).not.toHaveBeenCalled();
  });
  it('enforces origin and CSRF on the actual choice route without setting a receipt', async () => {
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/privacy', privacyRoutes);
    const checkout = jest.spyOn(pool, 'getConnection');
    const payload = {
      decision: 'accepted',
      revision: 0,
      choiceVersion: approved.choiceVersion,
      noticeVersion: approved.noticeVersion,
    };
    for (const origin of [undefined, 'https://untrusted.invalid']) {
      let action = request(app).post('/api/privacy/choice');
      if (origin) action = action.set('Origin', origin);
      const response = await action.send(payload);
      expect(response.status).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const noCsrf = await request(app)
      .post('/api/privacy/choice')
      .set('Origin', environment.siteUrl)
      .send(payload);
    expect(noCsrf.status).toBe(403);
    const crossSite = await request(app)
      .post('/api/privacy/choice')
      .set('Origin', environment.siteUrl)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Cookie', 'csrf_token=matching-token')
      .set('x-csrf-token', 'matching-token')
      .send(payload);
    expect(crossSite.status).toBe(403);
    expect(checkout).not.toHaveBeenCalled();
    const metadata = await request(app).get('/api/privacy');
    expect(metadata.status).toBe(200);
    expect(metadata.headers['cache-control']).toBe('no-store');
    expect(metadata.headers['set-cookie']).toBeUndefined();
  });
});

(nativePort ? describe : describe.skip)('real privacy receipt and collection transactions', () => {
  beforeAll(async () => {
    observer = await mysql.createConnection({
      host: '127.0.0.1',
      port: nativePort,
      user: 'root',
      database,
    });
  });
  beforeEach(() => {
    policy = { ...approved };
    interceptQueries(async (_sql, execute) => execute());
  });

  it('persists only a digest, excludes the namespace from generic settings, and stores minimal canonical events', async () => {
    const context = browser();
    const choice = await choose(context);
    context.receipt = choice.receipt;
    expect(choice.status).toMatchObject({ decision: 'accepted', revision: 1, receiptValid: true });
    expect(await service.getPrivacyChoice(context)).toEqual(choice.status);
    const key = 'privacy-choice-v1:' + choice.receipt.split('.')[0];
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM web_settings WHERE setting_key=?',
      [key],
    );
    expect(rows[0].setting_value).not.toContain(choice.receipt.split('.')[1]);
    expect(rows[0].setting_value).not.toContain(context.csrfToken);
    expect(await getWebSetting(key)).toBeNull();
    expect(await getWebSetting(key.replace('privacy', 'prívacy'))).toBeNull();
    expect((await getWebSettingsRaw()).some((row) => row.setting_key === key)).toBe(false);
    await expect(updateWebSetting(key, 'forged', 'actor')).rejects.toThrow(
      'Reserved internal setting',
    );
    const payload = event(1, 'battle');
    await service.collectPrivacyPageView(context.receipt, payload);
    await service.collectPrivacyPageView(context.receipt, payload);
    const [views] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM page_views WHERE session_id IN (?)',
      [[...sessions]],
    );
    expect(views).toHaveLength(2);
    for (const row of views) {
      expect(row.path).toBe('/pvp/:id');
      for (const field of [
        'account_name',
        'ip_address',
        'page_title',
        'referrer',
        'utm_source',
        'user_agent',
        'screen_width',
        'country',
        'city',
      ])
        expect(row[field]).toBeNull();
    }
    const [visits] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM visitor_sessions WHERE session_id IN (?)',
      [[...sessions]],
    );
    expect(visits).toHaveLength(1);
    expect(visits[0].page_views).toBe(2);
    expect(visits[0].is_bounce).toBe(0);
  });

  it('refuses forged, stale, obsolete, expired and withdrawn authorization at the direct service boundary', async () => {
    const context = browser();
    const first = await choose(context);
    context.receipt = first.receipt;
    await expect(
      service.collectPrivacyPageView('0'.repeat(64) + '.' + '1'.repeat(64), event(1)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.collectPrivacyPageView(context.receipt, { ...event(1), consent: true }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.collectPrivacyPageView(context.receipt, event(1, '/private?token=sentinel')),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.collectPrivacyPageView(context.receipt, { ...event(1), choiceVersion: 'obsolete' }),
    ).rejects.toMatchObject({ status: 403 });
    const withdrawn = await choose(context, 'withdrawn', 1);
    context.receipt = withdrawn.receipt;
    await expect(service.collectPrivacyPageView(first.receipt, event(1))).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.collectPrivacyPageView(context.receipt, event(2))).rejects.toMatchObject({
      status: 403,
    });
    const accepted = await choose(context, 'accepted', 2);
    context.receipt = accepted.receipt;
    await expect(service.collectPrivacyPageView(context.receipt, event(2))).rejects.toMatchObject({
      status: 403,
    });
    policy = { ...approved, choiceVersion: 'synthetic-2' };
    await expect(service.collectPrivacyPageView(context.receipt, event(3))).rejects.toMatchObject({
      status: 403,
    });
    policy = { ...approved };
    await pool.execute(
      "UPDATE web_settings SET setting_value=JSON_SET(setting_value,'$.changedAtEpoch',UNIX_TIMESTAMP()-10,'$.expiresAtEpoch',UNIX_TIMESTAMP()) WHERE setting_key=?",
      [[...keys][0]],
    );
    await expect(service.collectPrivacyPageView(context.receipt, event(3))).rejects.toMatchObject({
      status: 403,
    });
    expect((await service.getPrivacyChoice(context)).decision).toBe('unknown');
    expect(sessions.size).toBe(0);
  });

  it('keeps unknown and refused browsers silent, and supports an explicit withdrawal/reacceptance cycle', async () => {
    const context = browser();
    expect(await service.getPrivacyChoice(context)).toMatchObject({
      decision: 'unknown',
      revision: 0,
      receiptValid: false,
    });
    const [before] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM web_settings WHERE setting_key=?',
      [[...keys][0]],
    );
    expect(Number(before[0].count)).toBe(0);
    const refused = await choose(context, 'refused');
    context.receipt = refused.receipt;
    expect((await service.getPrivacyChoice(context)).decision).toBe('refused');
    await expect(service.collectPrivacyPageView(context.receipt, event(1))).rejects.toMatchObject({
      status: 403,
    });
    const withdrawn = await choose(context, 'withdrawn', 1);
    context.receipt = withdrawn.receipt;
    expect((await service.getPrivacyChoice(context)).decision).toBe('withdrawn');
    const accepted = await choose(context, 'accepted', 2);
    context.receipt = accepted.receipt;
    await service.collectPrivacyPageView(context.receipt, event(3));
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM page_views WHERE session_id IN (?)',
      [[...sessions]],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('fails closed on unreadable or oversized receipts and preserves the invalid evidence', async () => {
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const context = browser();
    const accepted = await choose(context);
    context.receipt = accepted.receipt;
    const key = [...keys][0];
    for (const invalid of ['{private-sentinel', 'x'.repeat(3000)]) {
      await pool.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
        invalid,
        key,
      ]);
      await expect(service.getPrivacyChoice(context)).rejects.toMatchObject({ status: 503 });
      await expect(service.collectPrivacyPageView(context.receipt, event(1))).rejects.toMatchObject(
        { status: 503 },
      );
      await expect(choose(context, 'withdrawn', 1)).rejects.toMatchObject({ status: 503 });
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT setting_value FROM web_settings WHERE setting_key=?',
        [key],
      );
      expect(rows[0].setting_value).toBe(invalid);
      expect(sessions.size).toBe(0);
    }
    expect(warning.mock.calls).toContainEqual([
      'privacy_choice_storage_unavailable',
      expect.objectContaining({
        code: 'invalid_choice',
        stage: 'action',
        operation: 'status',
      }),
    ]);
    expect(inspect(warning.mock.calls)).not.toContain('private-sentinel');
  });

  it('serializes competing first choices and rejects the losing revision without a second decision', async () => {
    const context = browser();
    const results = await Promise.allSettled([choose(context), choose(context, 'refused')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result) => result.status === 'rejected');
    expect(loser && loser.status === 'rejected' && loser.reason).toMatchObject({ status: 409 });
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM web_settings WHERE setting_key=?',
      [[...keys][0]],
    );
    expect(JSON.parse(rows[0].setting_value).revision).toBe(1);
  });

  it('finishes a locked event before acknowledging withdrawal, then denies the old receipt', async () => {
    const context = browser();
    const accepted = await choose(context);
    context.receipt = accepted.receipt;
    jest.restoreAllMocks();
    const locked = deferred(),
      release = deferred(),
      started = deferred();
    let paused = false,
      waitingThread = 0;
    interceptQueries(async (sql, execute, thread) => {
      if (sql.includes('FOR UPDATE') && !paused) {
        const result = await execute();
        paused = true;
        locked.resolve();
        await release.promise;
        return result;
      }
      if (paused && sql.startsWith('INSERT INTO web_settings')) {
        waitingThread = thread;
        started.resolve();
      }
      return execute();
    });
    const collected = service.collectPrivacyPageView(context.receipt, event(1));
    await locked.promise;
    const withdrawn = choose(context, 'withdrawn', 1);
    await started.promise;
    let lockError: unknown;
    try {
      await waitForBlockedChoiceQuery(waitingThread);
    } catch (error) {
      lockError = error;
    } finally {
      release.resolve();
    }
    await collected;
    await withdrawn;
    expect(lockError).toBeUndefined();
    await expect(service.collectPrivacyPageView(context.receipt, event(1))).rejects.toMatchObject({
      status: 403,
    });
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM page_views WHERE session_id IN (?)',
      [[...sessions]],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('rejects an in-flight event when withdrawal commits first', async () => {
    const context = browser();
    const accepted = await choose(context);
    context.receipt = accepted.receipt;
    jest.restoreAllMocks();
    const locked = deferred(),
      release = deferred(),
      started = deferred();
    let paused = false,
      waitingThread = 0;
    interceptQueries(async (sql, execute, thread) => {
      if (sql.startsWith('UPDATE web_settings') && !paused) {
        const result = await execute();
        paused = true;
        locked.resolve();
        await release.promise;
        return result;
      }
      if (paused && sql.includes('FOR UPDATE')) {
        waitingThread = thread;
        started.resolve();
      }
      return execute();
    });
    const withdrawn = choose(context, 'withdrawn', 1);
    await locked.promise;
    const collected = service.collectPrivacyPageView(context.receipt, event(1)).then(
      () => null,
      (error) => error as unknown,
    );
    await started.promise;
    let lockError: unknown;
    try {
      await waitForBlockedChoiceQuery(waitingThread, true);
    } catch (error) {
      lockError = error;
    } finally {
      release.resolve();
    }
    await withdrawn;
    expect(await collected).toMatchObject({ status: 403 });
    expect(lockError).toBeUndefined();
    expect(sessions.size).toBe(0);
  });

  it('issues an HTTP-only receipt after an explicit action and enforces it through both tracking mounts', async () => {
    const { default: trackingRoutes } = await import('../../routes/webAnalytics.js');
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/privacy', privacyRoutes);
    app.use('/api/analytics', trackingRoutes);
    app.use('/api/admin/analytics/web', trackingRoutes);
    const context = browser();
    const response = await request(app)
      .post('/api/privacy/choice')
      .set('Origin', environment.siteUrl)
      .set('Cookie', 'csrf_token=' + context.csrfToken)
      .set('x-csrf-token', context.csrfToken)
      .send({
        decision: 'accepted',
        revision: 0,
        choiceVersion: policy.choiceVersion,
        noticeVersion: policy.noticeVersion,
      });
    expect(response.status).toBe(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith(service.PRIVACY_COOKIE + '='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(JSON.stringify(response.body)).not.toContain('credential');
    const receipt = cookie!.split(';')[0];
    for (const mount of ['/api/analytics', '/api/admin/analytics/web']) {
      const rejected = await request(app)
        .post(mount + '/track')
        .send(event(1));
      expect(rejected.status).toBe(403);
      const accepted = await request(app)
        .post(mount + '/track')
        .set('Cookie', 'csrf_token=' + context.csrfToken + '; ' + receipt)
        .set('x-csrf-token', context.csrfToken)
        .send(event(1));
      expect(accepted.status).toBe(200);
    }
  });

  it('does not clear a newly rotated cookie when an older status request completes', async () => {
    const context = browser();
    const first = await choose(context);
    context.receipt = first.receipt;
    const current = await choose(context, 'refused', 1);
    const app = express();
    app.use(cookieParser());
    app.use('/api/privacy', privacyRoutes);
    const stale = await request(app)
      .get('/api/privacy')
      .set(
        'Cookie',
        'csrf_token=' + context.csrfToken + '; ' + service.PRIVACY_COOKIE + '=' + first.receipt,
      );
    expect(stale.status).toBe(200);
    expect(stale.body.receiptValid).toBe(false);
    expect(stale.headers['set-cookie']).toBeUndefined();
    expect(await service.getPrivacyChoice({ ...context, receipt: current.receipt })).toMatchObject({
      decision: 'refused',
      revision: 2,
      receiptValid: true,
    });
  });

  it.each([false, true])(
    'recovers a lost cookie rotation through the current CSRF binding (rotated=%s)',
    async (rotated) => {
      const original = browser();
      const initial = await choose(original);
      original.receipt = initial.receipt;
      const current = rotated ? browser() : original;
      current.receipt = initial.receipt;
      const lost = await choose(current, 'refused', 1);
      // The acknowledged update was not installed in the browser's cookie jar.
      const metadata = await service.getPrivacyChoice(current);
      expect(metadata).toMatchObject({
        receiptValid: false,
        decision: 'unknown',
        revision: rotated ? 0 : 2,
      });
      const recovered = await choose(current, 'accepted', metadata.revision);
      expect(
        await service.getPrivacyChoice({ ...current, receipt: recovered.receipt }),
      ).toMatchObject({
        decision: 'accepted',
        receiptValid: true,
      });
      if (rotated)
        expect(
          await service.getPrivacyChoice({ ...original, receipt: lost.receipt }),
        ).toMatchObject({
          decision: 'refused',
          revision: 2,
          receiptValid: true,
        });
      await expect(service.collectPrivacyPageView(initial.receipt, event(1))).rejects.toMatchObject(
        { status: 403 },
      );
    },
  );

  it('recovers only the current CSRF identity when a forged cookie names another browser', async () => {
    const victim = browser();
    const granted = await choose(victim);
    victim.receipt = granted.receipt;
    const other = browser();
    other.receipt = granted.receipt.split('.')[0] + '.' + '0'.repeat(64);
    const metadata = await service.getPrivacyChoice(other);
    expect(metadata).toMatchObject({ revision: 0, receiptValid: false });
    const choice = await choose(other, 'refused', 0);
    expect(choice.receipt.split('.')[0]).not.toBe(granted.receipt.split('.')[0]);
    expect(await service.getPrivacyChoice(victim)).toMatchObject({
      decision: 'accepted',
      revision: 1,
      receiptValid: true,
    });
  });

  it('does not issue a cookie after an ambiguous preference commit and never leaks the failure', async () => {
    const context = browser();
    jest.restoreAllMocks();
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const checkout = pool.getConnection.bind(pool);
    jest.spyOn(pool, 'getConnection').mockImplementation(
      async () =>
        new Proxy(await checkout(), {
          get(target, key) {
            if (key === 'commit')
              return async () => {
                await target.commit();
                throw new Error('private-commit-sentinel');
              };
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    );
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/privacy', privacyRoutes);
    const response = await request(app)
      .post('/api/privacy/choice')
      .set('Origin', environment.siteUrl)
      .set('Cookie', 'csrf_token=' + context.csrfToken)
      .set('x-csrf-token', context.csrfToken)
      .send({
        decision: 'accepted',
        revision: 0,
        choiceVersion: policy.choiceVersion,
        noticeVersion: policy.noticeVersion,
      });
    expect(response.status).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(warning.mock.calls).toContainEqual([
      'privacy_choice_storage_unavailable',
      expect.objectContaining({
        reference: response.body.reference,
        stage: 'commit',
        operation: 'choice',
        rollback: 'completed',
      }),
    ]);
    expect(inspect(warning.mock.calls)).not.toContain('private-commit-sentinel');
    jest.restoreAllMocks();
    expect(await service.getPrivacyChoice(context)).toMatchObject({
      decision: 'unknown',
      revision: 1,
      receiptValid: false,
    });
  });

  it('records rollback failures separately and discards the affected checkout', async () => {
    jest.restoreAllMocks();
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const checkout = pool.getConnection.bind(pool);
    let destroyed = false;
    jest.spyOn(pool, 'getConnection').mockImplementation(
      async () =>
        new Proxy(await checkout(), {
          get(target, key) {
            if (key === 'rollback')
              return async () => {
                throw Object.assign(new Error('private-rollback-sentinel'), { code: 'ECONNRESET' });
              };
            if (key === 'destroy')
              return () => {
                destroyed = true;
                target.destroy();
              };
            const value: unknown = Reflect.get(target, key, target);
            if (key === 'execute' && typeof value === 'function')
              return (...args: unknown[]) => {
                const first = args[0];
                if (
                  first &&
                  typeof first === 'object' &&
                  'sql' in first &&
                  String(first.sql).startsWith('INSERT INTO web_settings')
                )
                  return Promise.reject(
                    Object.assign(new Error('private-query-sentinel'), {
                      code: 'ER_LOCK_DEADLOCK',
                    }),
                  );
                return Reflect.apply(value, target, args);
              };
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    );
    await expect(choose(browser())).rejects.toMatchObject({ status: 503 });
    expect(destroyed).toBe(true);
    expect(warning.mock.calls).toContainEqual([
      'privacy_choice_storage_unavailable',
      expect.objectContaining({
        operation: 'choice',
        stage: 'action',
        code: 'ER_LOCK_DEADLOCK',
        rollback: 'failed',
        rollbackCode: 'ECONNRESET',
      }),
    ]);
    expect(inspect(warning.mock.calls)).not.toContain('private-');
  });

  it('rolls both optional writes back when visitor-session persistence fails, without disclosing bindings', async () => {
    const context = browser();
    const choice = await choose(context);
    context.receipt = choice.receipt;
    jest.restoreAllMocks();
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    interceptQueries(async (sql, execute) => {
      if (sql.startsWith('INSERT INTO visitor_sessions'))
        throw new Error('SQL private-sentinel ' + context.receipt);
      return execute();
    });
    await expect(service.collectPrivacyPageView(context.receipt, event(1))).rejects.toMatchObject({
      status: 503,
    });
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM page_views WHERE session_id IN (?)',
      [[...sessions]],
    );
    expect(Number(rows[0].count)).toBe(0);
    expect(inspect(warning.mock.calls)).not.toContain('private-sentinel');
    expect(inspect(warning.mock.calls)).not.toContain(context.receipt);
  });
});

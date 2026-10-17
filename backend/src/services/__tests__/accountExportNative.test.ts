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
import bcrypt from 'bcrypt';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { ResultSetHeader } from 'mysql2';
import { pool, mudPool } from '../../db/connection.js';
import { getBackendConfiguration } from '../../config/environment.js';

const port = Number(process.env.TEST_ACCOUNT_EXPORT_DB_PORT);
if (
  process.env.TEST_ACCOUNT_EXPORT_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    process.env.DB_NAME !== 'durisweb_qualification_archive_removal_suite')
)
  throw new Error('Account export tests require the dedicated disposable fixture');
const native = port ? describe : describe.skip;
const app = express();
app.use(express.json(), cookieParser());
let redis: typeof import('../../db/redis.js').default | undefined;
let generateAccessToken: typeof import('../../middleware/auth.js').generateAccessToken;
let createWebSession: typeof import('../sessionService.js').createWebSession;
let parseAccountFile: typeof import('../accountService.js').parseAccountFile;
let exportAccountData: typeof import('../accountExportService.js').exportAccountData;
const origin = new URL(getBackendConfiguration().siteUrl).origin;
const password = 'synthetic-export-password';
const forbidden = 'SYNTHETIC-EXCLUDED-PAYLOAD';
let passwordHash: string;
let otherHash: string;
let subject: string;
let other: string;
let session: string;
let otherSession: string;

function download(body: Record<string, unknown> = { password }, account = subject, sid = session) {
  return request(app)
    .post('/api/privacy/export')
    .set('Origin', origin)
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('Cookie', [
      `access_token=${generateAccessToken(account, '', sid)}`,
      'csrf_token=synthetic-csrf',
    ])
    .send(body);
}

async function seed(account: string, sid: string, category: number, marker: string) {
  await mudPool.query(
    'INSERT INTO accounts (account_name,password,email,blocked) VALUES (?,?,?,0)',
    [account, passwordHash, `${marker}@example.invalid`],
  );
  await createWebSession(account, sid, `synthetic-refresh-${account}`);
  await pool.query('INSERT INTO user_profiles (account_name,bio,email,location) VALUES (?,?,?,?)', [
    account,
    marker,
    `${marker}@example.invalid`,
    marker,
  ]);
  await pool.query('INSERT INTO user_profile_stats (account_name,total_posts) VALUES (?,1)', [
    account,
  ]);
  const character = 'E' + randomUUID().replaceAll('-', '').slice(0, 10);
  const [player] = await mudPool.query<ResultSetHeader>(
    'INSERT INTO player_data (name,account_name,level) VALUES (?,?,10)',
    [character, account],
  );
  await mudPool.query(
    'INSERT INTO account_characters (account_name,pid,char_name) VALUES (?,?,?)',
    [account, player.insertId, character],
  );
  const [thread] = await pool.query<ResultSetHeader>(
    'INSERT INTO forum_threads (category_id,author_account_name,title,content,ip_address) VALUES (?,?,?,?,?)',
    [category, account, forbidden, forbidden, '192.0.2.123'],
  );
  const [post] = await pool.query<ResultSetHeader>(
    'INSERT INTO forum_posts (thread_id,author_account_name,content) VALUES (?,?,?)',
    [thread.insertId, account, forbidden],
  );
  await pool.query('INSERT INTO forum_reactions (post_id,user_account_name,emoji) VALUES (?,?,?)', [
    post.insertId,
    account,
    'like',
  ]);
  await pool.query(
    "INSERT INTO forum_subscriptions (user_account_name,subscription_type,thread_id) VALUES (?,'thread',?)",
    [account, thread.insertId],
  );
  const [poll] = await pool.query<ResultSetHeader>(
    'INSERT INTO forum_polls (thread_id,question,created_by_account) VALUES (?,?,?)',
    [thread.insertId, forbidden, account],
  );
  const [option] = await pool.query<ResultSetHeader>(
    'INSERT INTO forum_poll_options (poll_id,option_text) VALUES (?,?)',
    [poll.insertId, forbidden],
  );
  await pool.query(
    'INSERT INTO forum_poll_votes (poll_id,option_id,voter_account) VALUES (?,?,?)',
    [poll.insertId, option.insertId, account],
  );
  await pool.query(
    'INSERT INTO notifications (account_name,source,notification_type,message,link,data) VALUES (?,?,?,?,?,?)',
    [account, 'forum', 'reply', forbidden, forbidden, JSON.stringify({ otherAccount: forbidden })],
  );
  await pool.query(
    'INSERT INTO push_subscriptions (account_name,endpoint,p256dh,auth) VALUES (?,?,?,?)',
    [account, forbidden, forbidden, forbidden],
  );
  await pool.query('INSERT INTO pvp_battle_favorites (event_id,account_name) VALUES (1,?)', [
    account,
  ]);
  await pool.query('INSERT INTO pvp_battle_likes (event_id,account_name) VALUES (1,?)', [account]);
}

function afterFirstProfileRead(action: () => Promise<void>) {
  const checkout = pool.getConnection.bind(pool);
  let fired = false;
  jest.spyOn(pool, 'getConnection').mockImplementation(
    async () =>
      new Proxy(await checkout(), {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (key === 'query' && typeof value === 'function')
            return async (...args: unknown[]) => {
              const first = args[0];
              const sql =
                first && typeof first === 'object' && 'sql' in first
                  ? String(first.sql)
                  : String(first);
              const result: unknown = await Reflect.apply(value, target, args);
              if (!fired && sql.includes('FROM `user_profiles`')) {
                fired = true;
                await action();
              }
              return result;
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
  );
}

native('private account data export through the real route and database', () => {
  beforeAll(async () => {
    // A skipped native suite must not open Redis connections during import.
    redis = (await import('../../db/redis.js')).default;
    const authentication = await import('../../middleware/auth.js');
    ({ generateAccessToken } = authentication);
    app.get('/fixture-auth', authentication.requireAuth, (req, res) => {
      res.json({ role: req.user?.permissions.role });
    });
    ({ createWebSession } = await import('../sessionService.js'));
    ({ parseAccountFile } = await import('../accountService.js'));
    ({ exportAccountData } = await import('../accountExportService.js'));
    app.use('/api/privacy', (await import('../../routes/privacy.js')).default);
    passwordHash = await bcrypt.hash(password, 4);
    otherHash = await bcrypt.hash('new-synthetic-password', 4);
  });
  beforeEach(async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    subject = `export_a_${suffix}`;
    other = `export_b_${suffix}`;
    session = randomUUID();
    otherSession = randomUUID();
    const [category] = await pool.query<ResultSetHeader>(
      "INSERT INTO forum_categories (name,access_type) VALUES (?,'public')",
      [suffix],
    );
    await seed(subject, session, category.insertId, 'OWN-DATA');
    await seed(other, otherSession, category.insertId, 'OTHER-SUBJECT-DATA');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    // The owning runner drops its entire synthetic database and cache after this suite.
    await pool.end();
    if (mudPool !== pool) await mudPool.end();
    redis?.disconnect();
  });

  it('downloads all eleven declared categories and explicitly identifies omissions', async () => {
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="duris-website-data-[\da-f-]+\.json"$/,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toMatchObject({
      accountName: subject,
      schemaVersion: 1,
      scope: 'partial-website-data',
      completeAccountExport: false,
    });
    expect(Object.keys(response.body.categories)).toHaveLength(11);
    for (const rows of Object.values(response.body.categories)) expect(rows).toHaveLength(1);
    expect(response.body.categories.profile[0].bio).toBe('OWN-DATA');
    expect(response.body.omissions).toHaveLength(5);
    for (const value of [
      other,
      'OTHER-SUBJECT-DATA',
      forbidden,
      passwordHash,
      password,
      session,
      '192.0.2.123',
    ])
      expect(response.text).not.toContain(value);
  });
  it('uses MUD credentials and character permissions while keeping website profile data on the web database', async () => {
    if (mudPool !== pool)
      await pool.query('INSERT INTO accounts (account_name,password,blocked) VALUES (?,?,1)', [
        subject,
        'synthetic-wrong-web-authority',
      ]);
    await mudPool.query('UPDATE player_data SET level=62 WHERE account_name=?', [subject]);
    await pool.query('UPDATE user_profiles SET avatar_url=? WHERE account_name=?', [
      'https://assets.example.invalid/own-avatar.png',
      subject,
    ]);
    const response = await request(app)
      .get('/fixture-auth')
      .set('Cookie', 'access_token=' + generateAccessToken(subject, '', session));
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('overlord');
    expect((await download()).status).toBe(200);
    const account = await parseAccountFile(subject);
    if (!account) throw new Error('Synthetic account authority was not found');
    const { getFullUserContext } = await import('../permissionService.js');
    const context = await getFullUserContext(subject, '', account.characters);
    expect(context.characters).toHaveLength(1);
    expect(context.permissions.role).toBe('overlord');
    expect(context.avatarUrl).toBe('https://assets.example.invalid/own-avatar.png');
  });
  it('does not reenter the held website pool for fresh credential checks', async () => {
    const nested = jest
      .spyOn(pool, 'query')
      .mockRejectedValue(new Error('Nested website pool query'));
    await expect(exportAccountData(subject, session, { password })).resolves.toHaveProperty(
      'payload',
    );
    expect(nested).not.toHaveBeenCalled();
  });
  it('destroys a failed credential connection instead of returning it to either pool', async () => {
    const checkout = mudPool.getConnection.bind(mudPool);
    const failure = new Error('Synthetic failed credential query');
    let destroyed = false;
    jest.spyOn(mudPool, 'getConnection').mockImplementation(async () => {
      const connection = await checkout();
      const destroy = connection.destroy.bind(connection);
      connection.destroy = () => {
        destroyed = true;
        destroy();
      };
      return new Proxy(connection, {
        get(target, key) {
          if (key === 'query')
            return async () => {
              throw failure;
            };
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    await expect(exportAccountData(subject, session, { password })).rejects.toBe(failure);
    expect(destroyed).toBe(true);
    jest.restoreAllMocks();
    await expect(exportAccountData(subject, session, { password })).resolves.toHaveProperty(
      'payload',
    );
  });
  it('accepts the same account with different letter case', async () => {
    expect((await download({ password }, subject.toUpperCase())).status).toBe(200);
  });
  it('rejects collation aliases even when the ordinary session lookup accepts them', async () => {
    const alias = subject.replace('export', 'éxport');
    expect((await download({ password }, alias)).status).toBe(401);
  });
  it('refuses anonymous requests', async () => {
    expect((await request(app).post('/api/privacy/export').send({ password })).status).toBe(401);
  });
  it('does not allow body-supplied ownership or export another session subject', async () => {
    expect((await download({ password, accountName: other })).status).toBe(400);
    await expect(exportAccountData(other, session, { password })).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects missing CSRF and a foreign origin', async () => {
    expect((await download().unset('X-CSRF-Token')).status).toBe(403);
    expect((await download().set('Origin', 'https://foreign.invalid')).status).toBe(403);
  });
  it('requires the password and refuses malformed input without an attachment', async () => {
    for (const body of [{}, { password: '' }, { password: 1 }, { password: 'x'.repeat(1025) }]) {
      const response = await download(body);
      expect(response.status).toBe(400);
      expect(response.headers['content-disposition']).toBeUndefined();
    }
    expect((await download({ password: 'wrong-password' })).status).toBe(401);
  });
  it('uses current credentials even when normal account data was cached', async () => {
    await parseAccountFile(subject);
    await mudPool.query('UPDATE accounts SET password=? WHERE account_name=?', [
      otherHash,
      subject,
    ]);
    expect((await download()).status).toBe(401);
    expect((await download({ password: 'new-synthetic-password' })).status).toBe(200);
  });
  it('rejects already expired and revoked sessions', async () => {
    await pool.query('UPDATE web_sessions SET expires_at_epoch=UNIX_TIMESTAMP()-1 WHERE id=?', [
      session,
    ]);
    expect((await download()).status).toBe(401);
    await pool.query('DELETE FROM web_sessions WHERE id=?', [session]);
    expect((await download()).status).toBe(401);
  });
  it.each(['revoked', 'password-changed', 'blocked'])(
    'discards the result if the account becomes %s during generation',
    async (change) => {
      afterFirstProfileRead(async () => {
        if (change === 'revoked')
          await pool.query('DELETE FROM web_sessions WHERE id=?', [session]);
        else if (change === 'password-changed')
          await mudPool.query('UPDATE accounts SET password=? WHERE account_name=?', [
            otherHash,
            subject,
          ]);
        else await mudPool.query('UPDATE accounts SET blocked=1 WHERE account_name=?', [subject]);
      });
      const response = await download();
      expect(response.status).toBe(401);
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.text).not.toContain('OWN-DATA');
    },
  );
  it('uses one snapshot across categories without changing pooled isolation defaults', async () => {
    afterFirstProfileRead(async () => {
      await pool.query('UPDATE user_profile_stats SET total_posts=999 WHERE account_name=?', [
        subject,
      ]);
    });
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.body.categories.profileStatistics[0].total_posts).toBe(1);
    jest.restoreAllMocks();
    const { verifyPoolSessionInvariants } = await import('../../db/connection.js');
    await expect(verifyPoolSessionInvariants()).resolves.toBeUndefined();
  });
  it('refuses an oversized category without delivering a truncated file', async () => {
    const rows = Array.from({ length: 1000 }, () => [subject, 'forum', 'reply', forbidden]);
    await pool.query(
      'INSERT INTO notifications (account_name,source,notification_type,message) VALUES ?',
      [rows],
    );
    const response = await download();
    expect(response.status).toBe(413);
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.text).not.toContain('OWN-DATA');
  });
  it('links unexpected failures to safe diagnostics without exposing raw database errors or payloads', async () => {
    const logger = (await import('../../utils/logger.js')).default;
    const diagnostic = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest
      .spyOn(pool, 'getConnection')
      .mockRejectedValue(
        Object.assign(new Error(forbidden), { code: 'ER_NO_SUCH_TABLE', sql: forbidden }),
      );
    const response = await download();
    expect(response.status).toBe(503);
    expect(response.body.reference).toMatch(/^[a-f0-9]{8}-[a-f0-9-]{27}$/);
    expect(diagnostic.mock.calls).toContainEqual([
      'account_export_unconfirmed',
      { code: 'ER_NO_SUCH_TABLE', reference: response.body.reference },
    ]);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(forbidden);
    expect(response.text).not.toContain(forbidden);
    expect(response.headers['content-disposition']).toBeUndefined();
  });
  it('bounds repeated password/download attempts per account', async () => {
    for (let count = 0; count < 5; count++)
      expect((await download({ password: 'wrong' })).status).toBe(401);
    expect((await download()).status).toBe(429);
  });
});

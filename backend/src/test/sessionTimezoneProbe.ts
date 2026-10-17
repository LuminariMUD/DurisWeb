import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

// This is a child-process fixture, never an application or production command.
if (
  process.env.TEST_SESSION_TIMEZONE_PROBE !== '1' ||
  process.env.DB_HOST !== '127.0.0.1' ||
  !/^durisweb_qualification_sessions_\d+$/.test(process.env.DB_NAME ?? '') ||
  !Number.isInteger(Number(process.env.DB_PORT)) ||
  Number(process.env.DB_PORT) < 1024 ||
  [3306, 3307, 13306].includes(Number(process.env.DB_PORT))
)
  throw new Error('Session timezone probe requires an explicitly disposable target');

await import('./setupEnvironment.js');
const { pool, closeDatabaseConnection, detectIsolationVariableName, sessionInvariantDrift } =
  await import('../db/connection.js');
const { default: redis } = await import('../db/redis.js');
const { default: bcrypt } = await import('bcrypt');
const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: request } = await import('supertest');
const auth = await import('../middleware/auth.js');
const { default: routes } = await import('../routes/auth.js');
const { createWebSession } = await import('../services/sessionService.js');
const { refreshTokenDigest } = await import('../services/sessionCredential.js');
const { clearAccountCache } = await import('../services/accountService.js');
const { clearPermissionCache } = await import('../services/permissionService.js');

const connection = await pool.getConnection();
const query = pool.query;
// Pin real HTTP/service queries to the connection whose SQL clock is frozen.
pool.query = connection.query.bind(connection) as typeof pool.query;
const account = `tz_${crypto.randomBytes(10).toString('hex')}`;
const email = 'timezone-fixture@example.invalid';
const password = 'synthetic-timezone-password';
const app = express();
app.use(express.json(), cookieParser());
app.use('/api/auth', routes);
app.get('/protected', auth.requireAuth, (_request, response) => response.json({ ok: true }));

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error('Expected authentication cookie is absent');
  return decodeURIComponent(cookie.split(';')[0].slice(name.length + 1));
}
async function status(access: string, refresh: string, expected: number): Promise<void> {
  assert.equal(
    (await request(app).get('/protected').set('Cookie', `access_token=${access}`)).status,
    expected,
  );
  assert.equal(
    (await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${refresh}`)).status,
    expected,
  );
}

try {
  const isolation = await detectIsolationVariableName(connection);
  const invariantsSql = `SELECT @@sql_mode AS sqlMode,@@global.sql_mode AS globalSqlMode,@@${isolation} AS isolationLevel,@@global.${isolation} AS globalIsolationLevel,@@time_zone AS timeZone,@@global.time_zone AS globalTimeZone,@@foreign_key_checks AS foreignKeyChecks`;
  const [before] = await connection.query<RowDataPacket[]>(invariantsSql);
  assert.deepEqual(
    sessionInvariantDrift(before[0] as Parameters<typeof sessionInvariantDrift>[0]),
    [],
  );
  await connection.query(
    'INSERT INTO accounts (account_name,email,password,confirmed) VALUES (?,?,?,1)',
    [account, email, await bcrypt.hash(password, 4)],
  );
  if (process.argv[2] === 'expanded') {
    const sid = crypto.randomUUID();
    const refresh = auth.generateRefreshToken(account, email, sid);
    const access = auth.generateAccessToken(account, email, sid);
    await connection.query(
      'INSERT INTO web_sessions (id,account_name,refresh_token,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
      [sid, account, refresh],
    );
    await status(access, refresh, 401);
    await connection.query('UPDATE web_sessions SET refresh_token_digest=? WHERE id=?', [
      refreshTokenDigest(refresh),
      sid,
    ]);
    await status(access, refresh, 401); // missing integer expiry
    await connection.query(
      'UPDATE web_sessions SET refresh_token_digest=NULL,expires_at_epoch=UNIX_TIMESTAMP()+300 WHERE id=?',
      [sid],
    );
    await status(access, refresh, 401); // missing digest
    await connection.query('DELETE FROM web_sessions WHERE id=?', [sid]);
    await createWebSession(account, sid, refresh);
    await status(access, refresh, 200); // new writer also works during expansion
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT refresh_token,expires_at FROM web_sessions WHERE id=?',
      [sid],
    );
    assert.equal(rows[0].refresh_token, null);
    assert.equal(rows[0].expires_at, null);
    console.log(
      'Expanded schema refuses incomplete legacy sessions and accepts digest-only writes.',
    );
  } else {
    const epochs = [
      '2026-03-26T21:00:00Z',
      '2026-03-27T03:00:00Z',
      '2026-10-24T20:00:00Z',
      '2026-10-25T03:00:00Z',
      '2026-03-08T08:00:00Z',
      '2026-03-08T12:00:00Z',
      '2026-11-01T07:00:00Z',
      '2026-11-01T11:00:00Z',
    ].map((value) => Date.parse(value) / 1000);
    const offsets = new Set(epochs.map((epoch) => new Date(epoch * 1000).getTimezoneOffset()));
    assert.equal(offsets.size, process.env.TZ === 'UTC' ? 1 : 2);
    for (const epoch of epochs) {
      await connection.query('SET timestamp=?', [epoch]);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: account, password });
      assert.equal(login.status, 200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const access = cookieValue(cookies, 'access_token');
      const refresh = cookieValue(cookies, 'refresh_token');
      const payload = auth.verifyToken(refresh);
      assert.ok(payload?.sid);
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM web_sessions WHERE id=?',
        [payload.sid],
      );
      assert.equal(rows.length, 1);
      assert.ok(Buffer.isBuffer(rows[0].refresh_token_digest));
      assert.equal(rows[0].refresh_token_digest.length, 32);
      assert.equal(Object.hasOwn(rows[0], 'refresh_token'), false);
      assert.equal(Object.hasOwn(rows[0], 'expires_at'), false);
      assert.deepEqual(rows[0].refresh_token_digest, refreshTokenDigest(refresh));
      assert.equal(Number(rows[0].expires_at_epoch), epoch + 604800);
      await status(access, refresh, 200);
      for (const wrong of [
        auth.generateRefreshToken(account, 'different@example.invalid', payload.sid),
        auth.generateRefreshToken('DifferentAccount', email, payload.sid),
        auth.generateRefreshToken(account, email, 'different-session'),
        rows[0].refresh_token_digest.toString('hex'),
      ]) {
        assert.equal(
          (await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${wrong}`))
            .status,
          401,
        );
      }
      for (const delta of [-60, 0, 1]) {
        await connection.query(
          'UPDATE web_sessions SET expires_at_epoch=UNIX_TIMESTAMP()+? WHERE id=?',
          [delta, payload.sid],
        );
        assert.ok(auth.verifyToken(refresh)); // JWT remains correctly signed and unexpired.
        await status(access, refresh, delta > 0 ? 200 : 401);
        const eligibility: RowDataPacket[] = (
          await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) AS count FROM web_sessions WHERE id=? AND expires_at_epoch<=UNIX_TIMESTAMP()',
            [payload.sid],
          )
        )[0];
        assert.equal(Number(eligibility[0].count), delta <= 0 ? 1 : 0);
      }
      assert.equal(
        (await request(app).post('/api/auth/logout').set('Cookie', `access_token=${access}`))
          .status,
        200,
      );
      await status(access, refresh, 401);
    }
    console.log(
      `Session HTTP timezone matrix passed: app=${process.env.TZ}, database=${String(before[0].globalTimeZone)}, DST epochs=${epochs.length}.`,
    );
  }
  const [after] = await connection.query<RowDataPacket[]>(invariantsSql);
  assert.deepEqual(after, before);
} finally {
  await connection.query('DELETE FROM web_sessions WHERE account_name=?', [account]);
  await connection.query('DELETE FROM accounts WHERE account_name=?', [account]);
  await clearAccountCache(account);
  await clearPermissionCache(account);
  await connection.query('SET timestamp=DEFAULT');
  pool.query = query;
  connection.release();
  await closeDatabaseConnection();
  redis.disconnect();
}

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const logError = jest.fn();
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: async () => true },
}));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  accountExists: async () => true,
  parseAccountFile: async () => ({
    accountName: 'CredentialFixture',
    email: 'fixture@example.invalid',
    passwordHash: 'synthetic-password-hash',
    characters: [],
    isBlocked: false,
  }),
  isBcryptHash: () => true,
  updateAccountPassword: jest.fn(),
}));
jest.unstable_mockModule('../../services/permissionService.js', () => ({
  getFullUserContext: async () => ({
    accountName: 'CredentialFixture',
    email: 'fixture@example.invalid',
    avatarUrl: null,
    characters: [],
    permissions: {},
  }),
  getUserPermissions: async () => ({}),
}));
jest.unstable_mockModule('../../services/adminPermissionService.js', () => ({
  getUserPermissions: async () => new Set<string>(),
}));
jest.unstable_mockModule('../../services/terminalService.js', () => ({
  cleanupAccountSessions: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: logError, info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

const auth = await import('../../middleware/auth.js');
const { hasMatchingRefreshSession } = await import('../../services/sessionService.js');
const { refreshTokenDigest } = await import('../../services/sessionCredential.js');

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error('Expected authentication cookie is absent');
  return decodeURIComponent(cookie.split(';')[0].slice(name.length + 1));
}

describe('HTTP session credential boundary', () => {
  let app: express.Express;
  const refresh = auth.generateRefreshToken('CredentialFixture', 'fixture@example.invalid', 'sid');
  beforeAll(async () => {
    const { default: routes } = await import('../auth.js');
    app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/auth', routes);
    app.get('/protected', auth.requireAuth, (_req, res) => res.json({ ok: true }));
  });
  beforeEach(() => {
    query.mockReset();
    logError.mockClear();
  });

  it('persists only the exact cookie JWT digest and lets the database set seven-day expiry', async () => {
    query.mockResolvedValue([{}]);
    const response = await request(app).post('/api/auth/login').send({
      username: 'CredentialFixture',
      password: 'synthetic-password',
    });
    expect(response.status).toBe(200);
    const token = cookieValue(
      response.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );
    const [sql, bindings] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('refresh_token_digest, expires_at_epoch');
    expect(sql).toContain('UNIX_TIMESTAMP() + 604800');
    expect(sql).not.toMatch(/\brefresh_token\b/);
    expect(bindings).toHaveLength(3);
    expect(bindings[2]).toEqual(createHash('sha256').update(token).digest());
    expect(Buffer.isBuffer(bindings[2])).toBe(true);
    expect(inspect(query.mock.calls)).not.toContain(token);
    const payload = auth.verifyToken(token)!;
    expect(payload.exp - payload.iat).toBe(30 * 24 * 60 * 60);
  });

  it('never issues cookies or leaks SQL bindings when session creation fails', async () => {
    query.mockRejectedValue(
      Object.assign(new Error('raw-jwt-secret-sentinel'), {
        sql: 'digest-secret-sentinel',
      }),
    );
    const response = await request(app).post('/api/auth/login').send({
      username: 'CredentialFixture',
      password: 'synthetic-password',
    });
    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(inspect(logError.mock.calls)).not.toMatch(
      /raw-jwt-secret-sentinel|digest-secret-sentinel/,
    );
    expect(logError).toHaveBeenCalled();
  });

  it('validates a signed refresh then compares its digest and keeps the same session without rotation', async () => {
    query.mockResolvedValue([[{ id: 'sid' }]]);
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}`);
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      'sid',
      'CredentialFixture',
      refreshTokenDigest(refresh),
    ]);
    expect(String(query.mock.calls[0][0])).toContain('expires_at_epoch > UNIX_TIMESTAMP()');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(auth.verifyToken(cookieValue(cookies, 'access_token'))?.sid).toBe('sid');
  });

  it('rejects missing or malformed refresh input without falling through to access-only lookup', async () => {
    for (const token of [undefined, '', null, 1, {}, []]) {
      expect(refreshTokenDigest(token)).toBeNull();
    }
    await expect(hasMatchingRefreshSession('CredentialFixture', 'sid', undefined)).resolves.toBe(
      false,
    );
    await expect(hasMatchingRefreshSession('CredentialFixture', 'sid', '')).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures, expired JWTs and access JWTs before querying sessions', async () => {
    const tokens = [
      'not-a-jwt',
      jwt.sign(
        { accountName: 'CredentialFixture', sid: 'sid', tokenType: 'refresh' },
        'wrong-signing-key',
      ),
      jwt.sign(
        { accountName: 'CredentialFixture', sid: 'sid', tokenType: 'refresh', exp: 1 },
        process.env.JWT_SECRET!,
      ),
      auth.generateAccessToken('CredentialFixture', 'fixture@example.invalid', 'sid'),
      refreshTokenDigest(refresh)!.toString('hex'),
    ];
    for (const token of tokens) {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${token}`);
      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a missing session and fails closed on lookup failure for refresh and access', async () => {
    query.mockResolvedValue([[]]);
    const missing = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}`);
    expect(missing.status).toBe(401);
    query.mockRejectedValue(
      Object.assign(new Error('raw-jwt-secret-sentinel'), { sql: 'digest-secret-sentinel' }),
    );
    const failedRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}`);
    expect(failedRefresh.status).toBe(500);
    expect(failedRefresh.headers['set-cookie']).toBeUndefined();
    const access = auth.generateAccessToken('CredentialFixture', 'fixture@example.invalid', 'sid');
    expect(
      (await request(app).get('/protected').set('Cookie', `access_token=${access}`)).status,
    ).toBe(500);
    expect(inspect(logError.mock.calls)).not.toMatch(
      /raw-jwt-secret-sentinel|digest-secret-sentinel/,
    );
  });
});

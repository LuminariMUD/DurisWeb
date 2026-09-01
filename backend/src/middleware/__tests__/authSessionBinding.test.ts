/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';
import { generateAccessToken, requireAuth, verifyToken } from '../auth.js';

describe('session-bound access tokens', () => {
  const accountName = 'Cwial';
  const sessionId = `binding-session-${crypto.randomUUID()}`;
  const refreshToken = `binding-refresh-${crypto.randomBytes(24).toString('hex')}`;

  beforeAll(async () => {
    const [accounts] = (await pool.query(
      'SELECT account_name FROM accounts WHERE LOWER(account_name) = LOWER(?) LIMIT 1',
      [accountName],
    )) as any;
    if (accounts.length === 0) {
      throw new Error('Cwial account is required for the local auth fixture');
    }

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, accountName, refreshToken, new Date(Date.now() + 5 * 60 * 1000)],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM web_sessions WHERE id = ?', [sessionId]);
    await pool.end();
    await redis.quit();
  });

  it('includes the web session ID in newly generated access tokens', () => {
    const token = generateAccessToken(accountName, 'fixture@example.invalid', sessionId);
    expect(verifyToken(token)?.sid).toBe(sessionId);
  });

  it('rejects a legacy access token even when a refresh session is active', async () => {
    const legacyToken = jwt.sign(
      { accountName, email: 'fixture@example.invalid' },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' },
    );
    let statusCode = 0;
    let nextCalled = false;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(_body: unknown) {
        return this;
      },
    };
    const request = {
      cookies: {
        access_token: legacyToken,
        refresh_token: refreshToken,
      },
    };

    await requireAuth(request as any, response as any, () => {
      nextCalled = true;
    });

    expect(statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });
});

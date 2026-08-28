/**
 * @jest-environment node
 */
import { beforeAll, afterAll, describe, expect, it } from '@jest/globals';
import crypto from 'node:crypto';
import { pool } from '../../db/connection.js';
import { hasActiveWebSession } from '../sessionService.js';

describe('web session revocation', () => {
  const accountName = 'Cwial';
  const sessionId = `test-session-${crypto.randomUUID()}`;
  const refreshToken = `test-refresh-${crypto.randomBytes(24).toString('hex')}`;
  const expiredSessionId = `test-session-expired-${crypto.randomUUID()}`;
  const expiredRefreshToken = `test-refresh-expired-${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  beforeAll(async () => {
    const [accounts] = await pool.query(
      'SELECT account_name FROM accounts WHERE LOWER(account_name) = LOWER(?) LIMIT 1',
      [accountName]
    ) as any;

    if (accounts.length === 0) {
      throw new Error('Cwial account is required for the local auth fixture');
    }

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, accountName, refreshToken, expiresAt]
    );

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [expiredSessionId, accountName, expiredRefreshToken, new Date(Date.now() - 60 * 1000)]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM web_sessions WHERE id IN (?, ?)', [sessionId, expiredSessionId]);
    await pool.end();
  });

  it('accepts a matching, unexpired session', async () => {
    await expect(hasActiveWebSession(accountName, refreshToken)).resolves.toBe(true);
  });

  it('rejects a missing or mismatched session handle', async () => {
    await expect(hasActiveWebSession(accountName, '')).resolves.toBe(false);
    await expect(hasActiveWebSession('different-account', refreshToken)).resolves.toBe(false);
    await expect(hasActiveWebSession(accountName, `${refreshToken}-wrong`)).resolves.toBe(false);
  });

  it('rejects a session after its database row is revoked', async () => {
    await pool.query('DELETE FROM web_sessions WHERE id = ?', [sessionId]);

    await expect(hasActiveWebSession(accountName, refreshToken)).resolves.toBe(false);
  });

  it('rejects an expired session even when the token matches', async () => {
    await expect(hasActiveWebSession(accountName, expiredRefreshToken)).resolves.toBe(false);
  });
});

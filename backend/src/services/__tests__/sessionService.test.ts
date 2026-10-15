/**
 * @jest-environment node
 */
import { beforeAll, afterAll, describe, expect, it } from '@jest/globals';
import crypto from 'node:crypto';
import { pool } from '../../db/connection.js';
import { hasActiveWebSession, hasMatchingRefreshSession } from '../sessionService.js';

describe('web session revocation', () => {
  const accountName = `session_${crypto.randomBytes(10).toString('hex')}`;
  const sessionId = `test-session-${crypto.randomUUID()}`;
  const refreshToken = `test-refresh-${crypto.randomBytes(24).toString('hex')}`;
  const otherSessionId = `test-session-other-${crypto.randomUUID()}`;
  const otherRefreshToken = `test-refresh-other-${crypto.randomBytes(24).toString('hex')}`;
  const expiredSessionId = `test-session-expired-${crypto.randomUUID()}`;
  const expiredRefreshToken = `test-refresh-expired-${crypto.randomBytes(24).toString('hex')}`;

  beforeAll(async () => {
    await pool.query('INSERT INTO accounts (account_name) VALUES (?)', [accountName]);

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, accountName, refreshToken, new Date(Date.now() + 5 * 60 * 1000)],
    );

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [otherSessionId, accountName, otherRefreshToken, new Date(Date.now() + 5 * 60 * 1000)],
    );

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [expiredSessionId, accountName, expiredRefreshToken, new Date(Date.now() - 60 * 1000)],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM web_sessions WHERE id IN (?, ?, ?)', [
      sessionId,
      otherSessionId,
      expiredSessionId,
    ]);
    await pool.query('DELETE FROM accounts WHERE account_name = ?', [accountName]);
    await pool.end();
  });

  it('accepts a matching, unexpired session ID', async () => {
    await expect(hasActiveWebSession(accountName, sessionId)).resolves.toBe(true);
    await expect(hasMatchingRefreshSession(accountName, sessionId, refreshToken)).resolves.toBe(
      true,
    );
  });

  it('rejects missing, mismatched, or cross-session handles', async () => {
    await expect(hasActiveWebSession(accountName, '')).resolves.toBe(false);
    await expect(hasActiveWebSession('different-account', sessionId)).resolves.toBe(false);
    await expect(hasMatchingRefreshSession(accountName, sessionId, '')).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(accountName, sessionId, otherRefreshToken),
    ).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(accountName, otherSessionId, refreshToken),
    ).resolves.toBe(false);
  });

  it('rejects a session after its database row is revoked', async () => {
    await pool.query('DELETE FROM web_sessions WHERE id = ?', [sessionId]);

    await expect(hasActiveWebSession(accountName, sessionId)).resolves.toBe(false);
    await expect(hasMatchingRefreshSession(accountName, sessionId, refreshToken)).resolves.toBe(
      false,
    );
  });

  it('rejects an expired session even when its ID and token match', async () => {
    await expect(hasActiveWebSession(accountName, expiredSessionId)).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(accountName, expiredSessionId, expiredRefreshToken),
    ).resolves.toBe(false);
  });
});

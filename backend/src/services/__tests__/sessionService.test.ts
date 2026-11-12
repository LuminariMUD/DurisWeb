/**
 * @jest-environment node
 */
import { beforeAll, afterAll, describe, expect, it } from '@jest/globals';
import crypto from 'node:crypto';
import { pool } from '../../db/connection.js';
import {
  getActiveWebSessionIds,
  hasActiveWebSession,
  hasMatchingRefreshSession,
} from '../sessionService.js';
import { refreshTokenDigest } from '../sessionCredential.js';

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
      'INSERT INTO web_sessions (id, account_name, refresh_token_digest, expires_at_epoch) VALUES (?, ?, ?, UNIX_TIMESTAMP()+300)',
      [sessionId, accountName, refreshTokenDigest(refreshToken)],
    );

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token_digest, expires_at_epoch) VALUES (?, ?, ?, UNIX_TIMESTAMP()+300)',
      [otherSessionId, accountName, refreshTokenDigest(otherRefreshToken)],
    );

    await pool.query(
      'INSERT INTO web_sessions (id, account_name, refresh_token_digest, expires_at_epoch) VALUES (?, ?, ?, UNIX_TIMESTAMP()-60)',
      [expiredSessionId, accountName, refreshTokenDigest(expiredRefreshToken)],
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
    await expect(hasMatchingRefreshSession(accountName, sessionId, undefined)).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(
        accountName,
        sessionId,
        refreshTokenDigest(refreshToken)!.toString('hex'),
      ),
    ).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession('different-account', sessionId, refreshToken),
    ).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(accountName, sessionId, otherRefreshToken),
    ).resolves.toBe(false);
    await expect(
      hasMatchingRefreshSession(accountName, otherSessionId, refreshToken),
    ).resolves.toBe(false);
  });

  it('batches the same session predicates for socket revalidation', async () => {
    await expect(getActiveWebSessionIds([])).resolves.toEqual(new Set());
    await expect(
      getActiveWebSessionIds([
        { accountName, sessionId },
        { accountName, sessionId: otherSessionId },
        { accountName, sessionId: expiredSessionId },
      ]),
    ).resolves.toEqual(new Set([sessionId, otherSessionId]));
    await expect(
      getActiveWebSessionIds([{ accountName: 'different-account', sessionId }]),
    ).resolves.toEqual(new Set());
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

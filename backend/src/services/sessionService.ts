import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/connection.js';
import { refreshTokenDigest } from './sessionCredential.js';

interface ActiveSessionRow extends RowDataPacket {
  id: string;
}

async function hasSession(
  accountName: string,
  sessionId: string | undefined,
  digest?: Buffer,
): Promise<boolean> {
  if (!accountName || !sessionId) {
    return false;
  }

  const refreshPredicate = digest === undefined ? '' : ' AND refresh_token_digest = ?';
  const params = digest === undefined ? [sessionId, accountName] : [sessionId, accountName, digest];

  try {
    const [rows] = await pool.query<ActiveSessionRow[]>(
      `SELECT id
     FROM web_sessions
     WHERE id = ?
       AND account_name = ?
       AND refresh_token_digest IS NOT NULL
       AND expires_at_epoch > UNIX_TIMESTAMP()${refreshPredicate}
     LIMIT 1`,
      params,
    );

    return rows.length > 0;
  } catch {
    // mysql2 errors can include interpolated SQL and credential bindings.
    throw new Error('Web session lookup failed');
  }
}

/** The database clock owns the unchanged seven-day session lifetime. */
export async function createWebSession(
  accountName: string,
  sessionId: string,
  refreshToken: string,
): Promise<void> {
  const digest = refreshTokenDigest(refreshToken);
  if (!accountName || !sessionId || !digest) throw new Error('Invalid web session input');
  try {
    await pool.query(
      `INSERT INTO web_sessions (id, account_name, refresh_token_digest, expires_at_epoch)
       VALUES (?, ?, ?, UNIX_TIMESTAMP() + 604800)`,
      [sessionId, accountName, digest],
    );
  } catch {
    throw new Error('Web session creation failed');
  }
}

/**
 * Check whether a signed access-token session is still active.
 */
export async function hasActiveWebSession(
  accountName: string,
  sessionId: string | undefined,
): Promise<boolean> {
  return hasSession(accountName, sessionId);
}

/**
 * Check whether a refresh token belongs to the same active session and account.
 */
export async function hasMatchingRefreshSession(
  accountName: string,
  sessionId: string | undefined,
  refreshToken: string | undefined,
): Promise<boolean> {
  const digest = refreshTokenDigest(refreshToken);
  if (!digest) return false;
  return hasSession(accountName, sessionId, digest);
}

export async function revokeAllWebSessions(accountName: string): Promise<number> {
  if (!accountName) return 0;

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM web_sessions WHERE LOWER(account_name) = LOWER(?)',
    [accountName],
  );
  return result.affectedRows;
}

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/connection.js';

interface ActiveSessionRow extends RowDataPacket {
  id: string;
}

async function hasSession(
  accountName: string,
  sessionId: string | undefined,
  refreshToken?: string
): Promise<boolean> {
  if (!accountName || !sessionId || refreshToken === '') {
    return false;
  }

  const refreshPredicate = refreshToken === undefined ? '' : ' AND refresh_token = ?';
  const params = refreshToken === undefined
    ? [sessionId, accountName]
    : [sessionId, accountName, refreshToken];

  const [rows] = await pool.query<ActiveSessionRow[]>(
    `SELECT id
     FROM web_sessions
     WHERE id = ?
       AND account_name = ?
       AND expires_at > NOW()${refreshPredicate}
     LIMIT 1`,
    params
  );

  return rows.length > 0;
}

/**
 * Check whether a signed access-token session is still active.
 */
export async function hasActiveWebSession(
  accountName: string,
  sessionId: string | undefined
): Promise<boolean> {
  return hasSession(accountName, sessionId);
}

/**
 * Check whether a refresh token belongs to the same active session and account.
 */
export async function hasMatchingRefreshSession(
  accountName: string,
  sessionId: string | undefined,
  refreshToken: string | undefined
): Promise<boolean> {
  return hasSession(accountName, sessionId, refreshToken);
}

export async function revokeAllWebSessions(accountName: string): Promise<number> {
  if (!accountName) return 0;

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM web_sessions WHERE LOWER(account_name) = LOWER(?)',
    [accountName],
  );
  return result.affectedRows;
}

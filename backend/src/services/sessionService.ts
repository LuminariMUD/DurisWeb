import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/connection.js';

interface ActiveSessionRow extends RowDataPacket {
  id: string;
}

/**
 * Check whether an access-token request still has a live web session.
 *
 * The access token is intentionally paired with the HTTP-only refresh-token
 * cookie. Removing or expiring the database session therefore invalidates
 * both the refresh path and any otherwise-unexpired access token.
 */
export async function hasActiveWebSession(
  accountName: string,
  refreshToken: string | undefined
): Promise<boolean> {
  if (!accountName || !refreshToken) {
    return false;
  }

  const [rows] = await pool.query<ActiveSessionRow[]>(
    `SELECT id
     FROM web_sessions
     WHERE account_name = ?
       AND refresh_token = ?
       AND expires_at > NOW()
     LIMIT 1`,
    [accountName, refreshToken]
  );

  return rows.length > 0;
}

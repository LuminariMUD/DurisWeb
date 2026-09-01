import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';

/**
 * Get news content from mud_info table
 * Returns the raw news content (frontend will parse ANSI codes)
 */
export async function getNewsContent(): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT content FROM mud_info WHERE name = 'news'`,
  );

  if (rows.length === 0) {
    return '';
  }

  // Return raw content, frontend will parse ANSI codes with parseAnsiForVue()
  return rows[0].content;
}

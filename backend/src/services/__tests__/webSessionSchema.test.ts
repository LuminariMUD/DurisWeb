import { afterAll, describe, expect, it } from '@jest/globals';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../db/connection.js';

type WebSessionSchemaRow = RowDataPacket & {
  CHARACTER_MAXIMUM_LENGTH: number | null;
};

describe('web session schema contract', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('stores the full signed refresh JWT without truncation', async () => {
    const [rows] = await pool.query<WebSessionSchemaRow[]>(
      `SELECT CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'web_sessions'
         AND column_name = 'refresh_token'`
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].CHARACTER_MAXIMUM_LENGTH)).toBeGreaterThanOrEqual(512);
  });
});

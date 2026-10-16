import { afterAll, describe, expect, it } from '@jest/globals';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../db/connection.js';

type WebSessionSchemaRow = RowDataPacket & {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
};

describe('web session schema contract', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('stores fixed-size digests and unsigned epoch expiry, with no legacy bearer column', async () => {
    const [rows] = await pool.query<WebSessionSchemaRow[]>(
      `SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'web_sessions'
         AND column_name IN ('refresh_token','expires_at','refresh_token_digest','expires_at_epoch')
       ORDER BY column_name`,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].COLUMN_NAME).toBe('expires_at_epoch');
    expect(rows[0].COLUMN_TYPE).toMatch(/^bigint(?:\(20\))? unsigned$/);
    expect(rows[1].COLUMN_NAME).toBe('refresh_token_digest');
    expect(rows[1].COLUMN_TYPE).toBe('binary(32)');
    expect(rows.every(({ IS_NULLABLE }) => IS_NULLABLE === 'NO')).toBe(true);
  });
});

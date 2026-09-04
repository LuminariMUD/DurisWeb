import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import request from 'supertest';

jest.unstable_mockModule('../../db/redis.js', () => ({
  default: {},
  checkRedisConnection: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  closeRedisConnection: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getCache: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  getCachedOrFetch: jest.fn(),
  mapToObject: jest.fn(),
  objectToMap: jest.fn(),
  objectToMapNumeric: jest.fn(),
  setCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));
jest.unstable_mockModule('../../index.js', () => ({
  broadcastForumPost: jest.fn(),
}));
jest.unstable_mockModule('../../services/pushNotificationService.js', () => ({
  broadcastPush: jest.fn(),
  sendAuctionOutbidNotification: jest.fn(),
  sendAuctionWonNotification: jest.fn(),
  sendForumReplyNotification: jest.fn(),
  sendItemSoldNotification: jest.fn(),
}));

const { pool } = await import('../../db/connection.js');
const { default: forumRoutes } = await import('../forum.js');

interface SchemaColumnRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
}

const schemaColumns = {
  account_characters: ['account_name', 'char_name', 'deleted_at', 'pid'],
  frag_leaderboard: ['deleted_at', 'pid', 'total_frags'],
  player_data: [
    'bank_copper',
    'bank_gold',
    'bank_platinum',
    'bank_silver',
    'copper',
    'gold',
    'pid',
    'platinum',
    'silver',
  ],
} as const;

describe('user profile schema integration', () => {
  const fixtureSuffix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const accountName = `profile_${fixtureSuffix}`;
  const firstCharacterName = `profile_a_${fixtureSuffix}`;
  const duplicateCharacterName = `profile_dup_${fixtureSuffix}`;
  const secondCharacterName = `profile_b_${fixtureSuffix}`;
  let firstPid = 0;
  let secondPid = 0;

  beforeAll(async () => {
    const [columns] = await pool.query<SchemaColumnRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name IN ('account_characters', 'frag_leaderboard', 'player_data')`,
    );
    const presentColumns = new Set(columns.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));

    for (const [tableName, requiredColumns] of Object.entries(schemaColumns)) {
      for (const columnName of requiredColumns) {
        if (!presentColumns.has(`${tableName}.${columnName}`)) {
          throw new Error(`Profile schema fixture is missing ${tableName}.${columnName}`);
        }
      }
    }

    await pool.query('INSERT INTO accounts (account_name) VALUES (?)', [accountName]);

    const [firstPlayer] = await pool.query<ResultSetHeader>(
      `INSERT INTO player_data (
         name, account_name, copper, silver, gold, platinum,
         bank_copper, bank_silver, bank_gold, bank_platinum
       ) VALUES (?, ?, 5, 2, 3, 4, 6, 7, 8, 9)`,
      [firstCharacterName, accountName],
    );
    firstPid = firstPlayer.insertId;

    const [secondPlayer] = await pool.query<ResultSetHeader>(
      `INSERT INTO player_data (
         name, account_name, copper, silver, gold, platinum,
         bank_copper, bank_silver, bank_gold, bank_platinum
       ) VALUES (?, ?, 2, 2, 2, 2, 2, 2, 2, 2)`,
      [secondCharacterName, accountName],
    );
    secondPid = secondPlayer.insertId;

    await pool.query(
      `INSERT INTO account_characters (account_name, pid, char_name)
       VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        accountName,
        firstPid,
        firstCharacterName,
        accountName,
        firstPid,
        duplicateCharacterName,
        accountName,
        secondPid,
        secondCharacterName,
      ],
    );
    await pool.query(
      `INSERT INTO frag_leaderboard
         (pid, account_name, char_name, total_frags, racewar)
       VALUES (?, ?, ?, 1234, 1), (?, ?, ?, 567, 1)`,
      [firstPid, accountName, firstCharacterName, secondPid, accountName, secondCharacterName],
    );
    await pool.query(
      `INSERT INTO pkill_info (event_id, pid, level, pk_type, equip)
       VALUES (0, ?, 1, 'VICTIM', ''), (0, ?, 1, 'KILLER', '')`,
      [firstPid, secondPid],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM pkill_info WHERE pid IN (?, ?)', [firstPid, secondPid]);
    await pool.query('DELETE FROM frag_leaderboard WHERE pid IN (?, ?)', [firstPid, secondPid]);
    await pool.query('DELETE FROM account_characters WHERE account_name = ?', [accountName]);
    await pool.query('DELETE FROM player_data WHERE pid IN (?, ?)', [firstPid, secondPid]);
    await pool.query('DELETE FROM accounts WHERE account_name = ?', [accountName]);
    await pool.end();
  });

  it('returns a successful aggregate response without multiplying duplicate PID mappings', async () => {
    const app = express();
    app.use('/api/forum', forumRoutes);

    const response = await request(app).get(`/api/forum/users/${accountName}/profile`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accountName,
      stats: {
        characterCount: 2,
        totalDeaths: 1,
        totalFrags: 17,
        totalThreads: 0,
        totalPosts: 0,
        totalWealth: 18645,
      },
    });
  });
});

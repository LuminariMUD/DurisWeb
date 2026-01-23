/**
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';
import { getCharacterMoney } from '../auctionService.js';

describe('auctionService', () => {
  let testPid: number;

  beforeAll(async () => {
    // find a real character in player_data for testing
    const [rows] = await pool.query(
      'SELECT pid FROM player_data LIMIT 1'
    ) as any;

    if (rows.length === 0) {
      throw new Error('no characters found in player_data for testing');
    }

    testPid = rows[0].pid;
  });

  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  describe('getCharacterMoney', () => {
    it('should return total copper from player_data', async () => {
      // get expected values directly from player_data
      const [rows] = await pool.query(
        'SELECT copper, silver, gold, platinum FROM player_data WHERE pid = ?',
        [testPid]
      ) as any;

      const expected = rows[0].copper +
        (rows[0].silver * 10) +
        (rows[0].gold * 100) +
        (rows[0].platinum * 1000);

      const result = await getCharacterMoney(testPid);

      expect(result).toBe(expected);
    });

    it('should return 0 for non-existent character', async () => {
      const result = await getCharacterMoney(999999999);
      expect(result).toBe(0);
    });
  });
});

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

  describe('deductCharacterMoney', () => {
    let richPid: number;
    let originalCoins: { copper: number; silver: number; gold: number; platinum: number };

    beforeAll(async () => {
      // find a character with some platinum for testing
      const [rows] = await pool.query(
        'SELECT pid, copper, silver, gold, platinum FROM player_data WHERE platinum > 0 LIMIT 1'
      ) as any;

      if (rows.length === 0) {
        throw new Error('no character with platinum found for testing');
      }

      richPid = rows[0].pid;
      originalCoins = {
        copper: rows[0].copper,
        silver: rows[0].silver,
        gold: rows[0].gold,
        platinum: rows[0].platinum,
      };
    });

    afterAll(async () => {
      // restore original coins
      await pool.query(
        'UPDATE player_data SET copper = ?, silver = ?, gold = ?, platinum = ? WHERE pid = ?',
        [originalCoins.copper, originalCoins.silver, originalCoins.gold, originalCoins.platinum, richPid]
      );
    });

    it('should deduct money from player_data', async () => {
      const { deductCharacterMoney } = await import('../auctionService.js');

      const beforeMoney = await getCharacterMoney(richPid);
      const deductAmount = 100; // 100 copper

      const result = await deductCharacterMoney(richPid, deductAmount);

      expect(result).toBe(true);

      const afterMoney = await getCharacterMoney(richPid);
      expect(afterMoney).toBe(beforeMoney - deductAmount);
    });

    it('should return false if insufficient funds', async () => {
      const { deductCharacterMoney } = await import('../auctionService.js');

      const beforeMoney = await getCharacterMoney(richPid);
      const deductAmount = beforeMoney + 1000000; // more than they have

      const result = await deductCharacterMoney(richPid, deductAmount);

      expect(result).toBe(false);

      // verify money unchanged
      const afterMoney = await getCharacterMoney(richPid);
      expect(afterMoney).toBe(beforeMoney);
    });
  });
});

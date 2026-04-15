/**
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';

import {
  getAccount,
  accountExists,
  clearAccountCache,
  isBcryptHash,
  findAccountByCharacter,
  searchAccounts,
  parseAccountFile,
} from '../accountService.js';

describe('accountService', () => {
  let testAccountName: string;

  beforeAll(async () => {
    // find a real account in the database for testing
    const [rows] = await pool.query(
      'SELECT account_name FROM accounts LIMIT 1'
    ) as any;

    if (rows.length === 0) {
      throw new Error('no accounts found in database for testing');
    }

    testAccountName = rows[0].account_name;
  });

  afterAll(async () => {
    // close connections after tests
    await pool.end();
    await redis.quit();
  });

  describe('getAccount', () => {
    it('should return account data for existing account', async () => {
      const account = await getAccount(testAccountName);

      expect(account).not.toBeNull();
      expect(account!.accountName.toLowerCase()).toBe(testAccountName.toLowerCase());
      expect(account).toHaveProperty('email');
      expect(account).toHaveProperty('passwordHash');
      expect(account).toHaveProperty('characters');
      expect(account).toHaveProperty('isBlocked');
      expect(account).toHaveProperty('isConfirmed');
      expect(account).toHaveProperty('uniqueIPs');
      expect(Array.isArray(account!.characters)).toBe(true);
      expect(Array.isArray(account!.uniqueIPs)).toBe(true);
    });

    it('should return null for non-existent account', async () => {
      const account = await getAccount('nonexistent_account_xyz_123');
      expect(account).toBeNull();
    });

    it('should return cached data on subsequent calls', async () => {
      // first call fetches from db
      const account1 = await getAccount(testAccountName);
      // second call should use cache (we can't easily verify this without mocks, but we verify same result)
      const account2 = await getAccount(testAccountName);

      expect(account1).toEqual(account2);
    });
  });

  describe('accountExists', () => {
    it('should return true for existing account', async () => {
      const exists = await accountExists(testAccountName);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent account', async () => {
      const exists = await accountExists('nonexistent_account_xyz_123');
      expect(exists).toBe(false);
    });

    it('should be case-insensitive', async () => {
      const existsLower = await accountExists(testAccountName.toLowerCase());
      const existsUpper = await accountExists(testAccountName.toUpperCase());

      expect(existsLower).toBe(true);
      expect(existsUpper).toBe(true);
    });
  });

  describe('clearAccountCache', () => {
    it('should clear cache for specific account without error', async () => {
      await expect(clearAccountCache('test_account')).resolves.not.toThrow();
    });

    it('should clear all account caches without error', async () => {
      await expect(clearAccountCache()).resolves.not.toThrow();
    });
  });

  describe('isBcryptHash', () => {
    it('should return true for bcrypt $2a$ hash', () => {
      expect(isBcryptHash('$2a$10$abcdefghijklmnopqrstuv')).toBe(true);
    });

    it('should return true for bcrypt $2b$ hash', () => {
      expect(isBcryptHash('$2b$12$abcdefghijklmnopqrstuv')).toBe(true);
    });

    it('should return true for bcrypt $2y$ hash', () => {
      expect(isBcryptHash('$2y$10$abcdefghijklmnopqrstuv')).toBe(true);
    });

    it('should return false for md5 crypt hash', () => {
      expect(isBcryptHash('$1$saltsalt$hashedvalue')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(isBcryptHash('plainpassword')).toBe(false);
    });
  });

  describe('findAccountByCharacter', () => {
    let testCharName: string;
    let expectedAccountName: string;

    beforeAll(async () => {
      // find a real character-account pair for testing
      const [rows] = await pool.query(
        'SELECT char_name, account_name FROM account_characters LIMIT 1'
      ) as any;

      if (rows.length > 0) {
        testCharName = rows[0].char_name;
        expectedAccountName = rows[0].account_name;
      }
    });

    it('should find account by character name', async () => {
      if (!testCharName) {
        console.warn('no characters in database, skipping test');
        return;
      }

      const accountName = await findAccountByCharacter(testCharName);

      expect(accountName).not.toBeNull();
      expect(accountName!.toLowerCase()).toBe(expectedAccountName.toLowerCase());
    });

    it('should return null for non-existent character', async () => {
      const accountName = await findAccountByCharacter('nonexistent_char_xyz_123');
      expect(accountName).toBeNull();
    });

    it('should be case-insensitive', async () => {
      if (!testCharName) {
        console.warn('no characters in database, skipping test');
        return;
      }

      const resultLower = await findAccountByCharacter(testCharName.toLowerCase());
      const resultUpper = await findAccountByCharacter(testCharName.toUpperCase());

      expect(resultLower).not.toBeNull();
      expect(resultUpper).not.toBeNull();
    });
  });

  describe('searchAccounts', () => {
    it('should return accounts matching prefix', async () => {
      // use first letter of test account
      const prefix = testAccountName.charAt(0);
      const results = await searchAccounts(prefix, 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // all results should start with the prefix
      results.forEach((name) => {
        expect(name.toLowerCase().startsWith(prefix.toLowerCase())).toBe(true);
      });
    });

    it('should respect limit parameter', async () => {
      const results = await searchAccounts('', 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for no matches', async () => {
      const results = await searchAccounts('zzzznonexistent', 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should be case-insensitive', async () => {
      const prefix = testAccountName.charAt(0);
      const resultsLower = await searchAccounts(prefix.toLowerCase(), 10);
      const resultsUpper = await searchAccounts(prefix.toUpperCase(), 10);

      expect(resultsLower).toEqual(resultsUpper);
    });

    it('should return sorted results', async () => {
      const results = await searchAccounts('', 20);

      const sorted = [...results].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );

      expect(results).toEqual(sorted);
    });
  });

  describe('parseAccountFile (backwards compat alias)', () => {
    it('should work like getAccount for existing account', async () => {
      const account = await parseAccountFile(testAccountName);

      expect(account).not.toBeNull();
      expect(account.accountName.toLowerCase()).toBe(testAccountName.toLowerCase());
    });

    it('should throw for non-existent account', async () => {
      await expect(parseAccountFile('nonexistent_account_xyz_123')).rejects.toThrow();
    });
  });

  describe('MudAccountData interface compliance', () => {
    it('should return data matching MudAccountData interface', async () => {
      const account = await getAccount(testAccountName);

      expect(account).not.toBeNull();

      // check all required fields exist and have correct types
      expect(typeof account!.serialNumber).toBe('number');
      expect(typeof account!.accountName).toBe('string');
      expect(typeof account!.email).toBe('string');
      expect(typeof account!.passwordHash).toBe('string');
      expect(typeof account!.confirmationString).toBe('string');
      expect(Array.isArray(account!.uniqueIPs)).toBe(true);
      expect(account!.lastIp === null || typeof account!.lastIp === 'string').toBe(true);
      expect(Array.isArray(account!.characters)).toBe(true);
      expect(typeof account!.isBlocked).toBe('boolean');
      expect(typeof account!.isConfirmed).toBe('boolean');
      expect(typeof account!.confirmationSent).toBe('boolean');
      expect(typeof account!.lastLogin).toBe('number');
      expect(typeof account!.lastGoodAlign).toBe('number');
      expect(typeof account!.lastEvilAlign).toBe('number');
      expect(Array.isArray(account!.flags)).toBe(true);
      expect(account!.flags.length).toBe(4);
    });

    it('should return characters matching MudAccountCharacter interface', async () => {
      const account = await getAccount(testAccountName);

      expect(account).not.toBeNull();

      if (account!.characters.length > 0) {
        const char = account!.characters[0];

        expect(typeof char.name).toBe('string');
        expect(typeof char.playCount).toBe('number');
        expect(typeof char.lastLogin).toBe('number');
        expect(typeof char.blocked).toBe('boolean');
        expect(typeof char.racewarSide).toBe('number');
      }
    });
  });
});

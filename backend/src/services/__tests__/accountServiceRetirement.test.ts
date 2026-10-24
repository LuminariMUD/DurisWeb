import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const cache = new Map<string, unknown>();
const getCache = jest.fn(async (key: string) => cache.get(key) ?? null);
const setCache = jest.fn(async (key: string, value: unknown) => {
  cache.set(key, value);
});
jest.unstable_mockModule('../../db/connection.js', () => ({ mudPool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
  deleteCache: jest.fn(async () => undefined),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));
const { getAccount, findAccountByCharacter } = await import('../accountService.js');

beforeEach(() => {
  jest.clearAllMocks();
  query.mockReset();
  cache.clear();
});

describe('current account character reads', () => {
  it('replaces a legacy cached roster with current SQL links while keeping account metadata cached', async () => {
    cache.set('mud:account:keeper', { accountName: 'Keeper', characters: [{ name: 'Retired' }] });
    query.mockResolvedValue([
      [{ char_name: 'Fresh', login_count: 0, last_login: null, blocked: 0, racewar: 1 }],
    ]);
    const account = await getAccount('KEEPER');
    expect(account?.characters.map((character) => character.name)).toEqual(['Fresh']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), ['keeper']);
    expect(setCache).not.toHaveBeenCalled();
  });

  it('refuses a cached roster when the authoritative character query fails', async () => {
    cache.set('mud:account:keeper', { accountName: 'Keeper', characters: [{ name: 'Retired' }] });
    query.mockRejectedValue(new Error('synthetic unavailable database'));
    expect(await getAccount('Keeper')).toBeNull();
  });

  it('ignores legacy name ownership cache and looks up only a live character link', async () => {
    cache.set('mud:char:reused', 'Former');
    query.mockResolvedValue([[{ account_name: 'Current' }]]);
    expect(await findAccountByCharacter('REUSED')).toBe('Current');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), ['reused']);
    expect(getCache).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
    query.mockResolvedValue([[]]);
    expect(await findAccountByCharacter('Reused')).toBeNull();
  });
});

const nativePort = Number(process.env.TEST_ACCOUNT_DB_PORT || 0);
if (
  nativePort &&
  (process.env.TEST_DB_HOST !== '127.0.0.1' ||
    nativePort !== Number(process.env.TEST_DB_PORT) ||
    [3306, 3307].includes(nativePort))
) {
  throw new Error('Account retirement tests require an owned disposable loopback SQL fixture');
}
(nativePort ? describe : describe.skip)('native account retirement and name reuse', () => {
  it('keeps the surviving account and recreated Overlord, hides retired bodies and resolves a reused name to its new account', async () => {
    const database = `durisweb_accounts_${randomUUID().replaceAll('-', '')}`;
    const admin = await mysql.createConnection({
      host: '127.0.0.1',
      port: nativePort,
      user: process.env.TEST_DB_USER,
      password: process.env.TEST_DB_PASSWORD,
    });
    try {
      await admin.query('CREATE DATABASE ??', [database]);
      await admin.query('USE ??', [database]);
      await admin.query(
        'CREATE TABLE accounts(account_name VARCHAR(50) PRIMARY KEY,email VARCHAR(255),password VARCHAR(255),confirmed TINYINT) ENGINE=InnoDB',
      );
      await admin.query(
        'CREATE TABLE account_characters(id INT PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(50),char_name VARCHAR(50),pid INT,login_count INT DEFAULT 0,last_login DATETIME NULL,blocked TINYINT DEFAULT 0,racewar INT DEFAULT 0,deleted_at DATETIME NULL) ENGINE=InnoDB',
      );
      await admin.query(
        'CREATE TABLE account_ips(id INT PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(50),ip_address VARCHAR(45)) ENGINE=InnoDB',
      );
      await admin.query(
        "INSERT INTO accounts VALUES('Former','synthetic@example.invalid','synthetic-hash',1),('Current','other@example.invalid','other-synthetic-hash',1)",
      );
      await admin.query(
        "INSERT INTO account_characters(account_name,char_name,pid) VALUES('Former','Reused',1),('Former','Overlord',2)",
      );
      query.mockImplementation(async (statement, parameters) => {
        if (typeof statement !== 'string' || !Array.isArray(parameters))
          throw new Error('Unexpected account query');
        return admin.query(statement, parameters);
      });
      const oldAccount = await getAccount('Former');
      expect(oldAccount?.characters.map((character) => character.name)).toEqual([
        'Reused',
        'Overlord',
      ]);
      expect(await findAccountByCharacter('Reused')).toBe('Former');
      // Keep the old deployment's cached arrays/mappings across the actual SQL transition.
      cache.set('mud:account:former', oldAccount);
      cache.set('mud:char:reused', 'Former');
      await admin.query('UPDATE account_characters SET deleted_at=UTC_TIMESTAMP()');
      await admin.query(
        "INSERT INTO account_characters(account_name,char_name,pid) VALUES('Former','Overlord',3),('Current','Reused',4)",
      );
      const currentAccount = await getAccount('Former');
      expect(currentAccount?.passwordHash).toBe('synthetic-hash');
      expect(currentAccount?.characters.map((character) => character.name)).toEqual(['Overlord']);
      expect((await getAccount('Current'))?.characters.map((character) => character.name)).toEqual([
        'Reused',
      ]);
      expect(await findAccountByCharacter('REUSED')).toBe('Current');
      await admin.query('UPDATE account_characters SET deleted_at=UTC_TIMESTAMP() WHERE pid=4');
      expect(await findAccountByCharacter('Reused')).toBeNull();
      expect((await getAccount('Current'))?.characters).toEqual([]);
    } finally {
      await admin.query('DROP DATABASE IF EXISTS ??', [database]);
      await admin.end();
    }
  });
});

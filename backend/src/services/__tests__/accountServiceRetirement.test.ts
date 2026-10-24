import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const cache = new Map<string, unknown>();
const getCache = jest.fn(async (key: string) => cache.get(key) ?? null);
const setCache = jest.fn(async (key: string, value: unknown) => {
  cache.set(key, value);
});
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query }, mudPool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
  deleteCache: jest.fn(async () => undefined),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));
jest.unstable_mockModule('../forumSettingsService.js', () => ({
  getForumSettings: async () => ({
    min_level_immortal_forum: 57,
    min_level_god_forum: 59,
    min_level_to_moderate: 59,
    min_level_to_ban: 61,
    min_level_to_delete_any_post: 59,
    min_level_to_pin: 59,
    min_level_to_lock: 59,
  }),
}));
jest.unstable_mockModule('../adminPermissionService.js', () => ({
  getUserPermissions: async () => new Set(['manage_changelog']),
}));
jest.unstable_mockModule('../sessionService.js', () => ({ hasActiveWebSession: async () => true }));
const { getAccount, findAccountByCharacter } = await import('../accountService.js');
const { getUserPermissions, getCharacterInfo } = await import('../permissionService.js');
const { requireAuth, requireImmortal, generateAccessToken } = await import(
  '../../middleware/auth.js'
);
const characterLink = { name: 'Staff', playCount: 0, lastLogin: 0, blocked: false, racewarSide: 0 };

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

describe('current MUD-derived permissions', () => {
  it('ignores a legacy staff-role cache and derives the current mortal permissions', async () => {
    cache.set('perms:Keeper', { role: 'overlord', maxLevel: 62 });
    query.mockResolvedValue([[{ pid: 3, name: 'Staff', level: 12, guild: 'New guild' }]]);
    const permissions = await getUserPermissions('Keeper', [characterLink]);
    expect(permissions.role).toBe('player');
    expect(permissions.maxLevel).toBe(12);
    expect(permissions.canBan).toBe(false);
    expect(permissions.guilds).toEqual(['New guild']);
    expect(permissions.adminPermissions).toEqual(['manage_changelog']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pd.active = 1'), [['Staff']]);
    expect(getCache).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
  });

  it('does not reuse cached privilege when the current character query fails', async () => {
    cache.set('perms:Keeper', { role: 'overlord', maxLevel: 62 });
    query.mockRejectedValue(new Error('synthetic unavailable database'));
    await expect(getUserPermissions('Keeper', [characterLink])).rejects.toThrow(
      'synthetic unavailable database',
    );
  });

  it('keeps current recreated Overlord privileges and separately assigned website permissions', async () => {
    query.mockResolvedValue([[{ pid: 3, name: 'Staff', level: 62, guild: '' }]]);
    const permissions = await getUserPermissions('Keeper', [characterLink]);
    expect(permissions.role).toBe('overlord');
    expect(permissions.maxLevel).toBe(62);
    expect(permissions.canBan).toBe(true);
    expect(permissions.adminPermissions).toEqual(['manage_changelog']);
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
      await admin.query(
        'CREATE TABLE player_data(pid INT PRIMARY KEY,name VARCHAR(50),level INT,active TINYINT,assoc_id INT DEFAULT 0,racewar INT DEFAULT 0,copper INT DEFAULT 0,silver INT DEFAULT 0,gold INT DEFAULT 0,platinum INT DEFAULT 0) ENGINE=InnoDB',
      );
      await admin.query(
        'CREATE TABLE frag_leaderboard(pid INT PRIMARY KEY,race VARCHAR(50),class VARCHAR(50)) ENGINE=InnoDB',
      );
      await admin.query(
        'CREATE TABLE associations(id INT PRIMARY KEY,name VARCHAR(50)) ENGINE=InnoDB',
      );
      await admin.query("INSERT INTO associations VALUES(1,'Old guild')");
      await admin.query(
        "INSERT INTO accounts VALUES('Retiredstaff','staff@example.invalid','synthetic-staff-hash',1)",
      );
      await admin.query(
        "INSERT INTO account_characters(account_name,char_name,pid) VALUES('Retiredstaff','Staff',5)",
      );
      await admin.query(
        "INSERT INTO player_data(pid,name,level,active,assoc_id) VALUES(1,'Reused',50,1,0),(2,'Overlord',62,1,0),(5,'Staff',61,1,1)",
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
      const app = express();
      app.use(cookieParser());
      app.get('/staff', requireAuth, requireImmortal, (_req, res) => {
        res.json({ allowed: true });
      });
      const staffToken = generateAccessToken(
        'Retiredstaff',
        'staff@example.invalid',
        'synthetic-staff-session',
      );
      await request(app).get('/staff').set('Cookie', `access_token=${staffToken}`).expect(200);
      const oldStaff = await getUserPermissions('Retiredstaff', [characterLink]);
      expect(oldStaff.role).toBe('forger');
      expect(oldStaff.guilds).toEqual(['Old guild']);
      cache.set('perms:Retiredstaff', oldStaff);

      // Keep the old deployment's cached arrays/mappings across the actual SQL transition.
      cache.set('mud:account:former', oldAccount);
      cache.set('mud:char:reused', 'Former');
      await admin.query('UPDATE account_characters SET deleted_at=UTC_TIMESTAMP()');
      await admin.query(
        "INSERT INTO account_characters(account_name,char_name,pid) VALUES('Former','Overlord',3),('Current','Reused',4)",
      );
      await admin.query("UPDATE player_data SET active=0,name=CONCAT('~pwipe-',pid)");
      await admin.query(
        "INSERT INTO player_data(pid,name,level,active) VALUES(3,'Overlord',62,1),(4,'Reused',1,1)",
      );
      await request(app).get('/staff').set('Cookie', `access_token=${staffToken}`).expect(403);
      const retiredAccount = await getAccount('Retiredstaff');
      const retiredPermissions = await getUserPermissions(
        'Retiredstaff',
        retiredAccount?.characters ?? [],
      );
      expect(retiredPermissions.role).toBe('player');
      expect(retiredPermissions.guilds).toEqual([]);
      expect(retiredPermissions.adminPermissions).toEqual(['manage_changelog']);
      expect(await getCharacterInfo(['~pwipe-5'])).toEqual([]);
      const overlordToken = generateAccessToken(
        'Former',
        'synthetic@example.invalid',
        'synthetic-overlord-session',
      );
      await request(app).get('/staff').set('Cookie', `access_token=${overlordToken}`).expect(200);
      expect((await getCharacterInfo(['Overlord']))[0]?.pid).toBe(3);
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

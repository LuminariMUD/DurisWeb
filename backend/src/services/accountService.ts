/**
 * database-backed account service
 * replaces flat-file parsing with mysql queries
 */
import { pool } from '../db/connection.js';
import { getCache, setCache, deleteCache } from '../db/redis.js';
import logger from '../utils/logger.js';
import type { RowDataPacket } from 'mysql2';

// interfaces for backwards compatibility with mudAccountParser
export interface MudAccountCharacter {
  name: string;
  playCount: number;
  lastLogin: number;
  blocked: boolean;
  racewarSide: number; // 1=good, 2=evil, 0=neutral
}

export interface MudAccountData {
  serialNumber: number;
  accountName: string;
  email: string;
  passwordHash: string;
  confirmationString: string;
  uniqueIPs: string[];
  lastIp: string | null;
  characters: MudAccountCharacter[];
  isBlocked: boolean;
  isConfirmed: boolean;
  confirmationSent: boolean;
  lastLogin: number;
  lastGoodAlign: number;
  lastEvilAlign: number;
  flags: number[];
}

// cache ttl values
const ACCOUNT_CACHE_TTL = 5 * 60; // 5 minutes
const CHAR_CACHE_TTL = 60 * 60; // 1 hour

// redis key prefixes
const REDIS_KEY_ACCOUNT = 'mud:account:';
const REDIS_KEY_CHAR = 'mud:char:';

// db row interfaces
interface AccountRow extends RowDataPacket {
  account_name: string;
  email: string;
  password: string;
  confirmation_code: string | null;
  confirmed: number;
  confirmation_sent: number;
  blocked: number;
  last_login: number | string | null;
  last_good_char: number | string | null;
  last_evil_char: number | string | null;
  flags1: number;
  flags2: number;
  flags3: number;
  flags4: number;
}

interface CharacterRow extends RowDataPacket {
  char_name: string;
  pid: number;
  login_count: number;
  last_login: number | string | null;
  blocked: number;
  racewar: number;
}

interface IpRow extends RowDataPacket {
  ip_address: string;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface AccountNameRow extends RowDataPacket {
  account_name: string;
}

/**
 * convert db timestamp to unix seconds
 */
function toUnixTimestamp(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  // handle mysql datetime string
  const date = new Date(value);
  return isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
}

/**
 * get account data from database
 * returns null if account doesn't exist
 */
export async function getAccount(accountName: string): Promise<MudAccountData | null> {
  const lowerName = accountName.toLowerCase();
  const cacheKey = `${REDIS_KEY_ACCOUNT}${lowerName}`;

  // check redis cache first
  const cached = await getCache<MudAccountData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // fetch account row
    const [accountRows] = await pool.query<AccountRow[]>(
      'SELECT * FROM accounts WHERE LOWER(account_name) = ?',
      [lowerName]
    );

    if (accountRows.length === 0) {
      return null;
    }

    const account = accountRows[0];

    // fetch characters for this account
    const [charRows] = await pool.query<CharacterRow[]>(
      'SELECT char_name, pid, login_count, last_login, blocked, racewar FROM account_characters WHERE LOWER(account_name) = ?',
      [lowerName]
    );

    // fetch ips for this account
    const [ipRows] = await pool.query<IpRow[]>(
      'SELECT ip_address FROM account_ips WHERE LOWER(account_name) = ? ORDER BY id ASC',
      [lowerName]
    );

    // map characters to interface
    const characters: MudAccountCharacter[] = charRows.map((row) => ({
      name: row.char_name,
      playCount: row.login_count,
      lastLogin: toUnixTimestamp(row.last_login),
      blocked: row.blocked === 1,
      racewarSide: row.racewar,
    }));

    // collect unique ips
    const uniqueIPs = ipRows.map((row) => row.ip_address);

    // build account data matching the interface
    const accountData: MudAccountData = {
      serialNumber: 0, // not stored in db, use 0
      accountName: account.account_name,
      email: account.email || '',
      passwordHash: account.password || '',
      confirmationString: account.confirmation_code || '',
      uniqueIPs,
      lastIp: uniqueIPs.length > 0 ? uniqueIPs[uniqueIPs.length - 1] : null,
      characters,
      isBlocked: account.blocked === 1,
      isConfirmed: account.confirmed === 1,
      confirmationSent: account.confirmation_sent === 1,
      lastLogin: toUnixTimestamp(account.last_login),
      lastGoodAlign: toUnixTimestamp(account.last_good_char),
      lastEvilAlign: toUnixTimestamp(account.last_evil_char),
      flags: [
        account.flags1 || 0,
        account.flags2 || 0,
        account.flags3 || 0,
        account.flags4 || 0,
      ],
    };

    // cache the result
    await setCache(cacheKey, accountData, ACCOUNT_CACHE_TTL);

    return accountData;
  } catch (error) {
    logger.error(`error fetching account '${accountName}':`, error);
    return null;
  }
}

/**
 * check if an account exists
 */
export async function accountExists(accountName: string): Promise<boolean> {
  const lowerName = accountName.toLowerCase();

  try {
    const [rows] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) as count FROM accounts WHERE LOWER(account_name) = ?',
      [lowerName]
    );

    return rows[0].count > 0;
  } catch (error) {
    logger.error(`error checking account existence '${accountName}':`, error);
    return false;
  }
}

/**
 * clear cached account data
 * if accountName provided, clears specific account
 * otherwise clears all account caches
 */
export async function clearAccountCache(accountName?: string): Promise<void> {
  if (accountName) {
    await deleteCache(`${REDIS_KEY_ACCOUNT}${accountName.toLowerCase()}`);
  } else {
    await deleteCache(`${REDIS_KEY_ACCOUNT}*`);
  }
}

/**
 * check if a password hash is bcrypt format
 */
export function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
}

/**
 * find account name that owns a character
 * returns null if character not found
 */
export async function findAccountByCharacter(characterName: string): Promise<string | null> {
  const lowerCharName = characterName.toLowerCase();
  const cacheKey = `${REDIS_KEY_CHAR}${lowerCharName}`;

  // check redis cache first
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const [rows] = await pool.query<AccountNameRow[]>(
      'SELECT account_name FROM account_characters WHERE LOWER(char_name) = ?',
      [lowerCharName]
    );

    if (rows.length === 0) {
      return null;
    }

    const accountName = rows[0].account_name;

    // cache the result
    await setCache(cacheKey, accountName, CHAR_CACHE_TTL);

    return accountName;
  } catch (error) {
    logger.error(`error finding account by character '${characterName}':`, error);
    return null;
  }
}

/**
 * search accounts by prefix
 * returns account names matching the query
 */
export async function searchAccounts(query: string, limit: number = 10): Promise<string[]> {
  const lowerQuery = query.toLowerCase();

  try {
    let sql: string;
    let params: (string | number)[];

    if (lowerQuery) {
      sql = 'SELECT account_name FROM accounts WHERE LOWER(account_name) LIKE ? ORDER BY account_name ASC LIMIT ?';
      params = [`${lowerQuery}%`, limit];
    } else {
      sql = 'SELECT account_name FROM accounts ORDER BY account_name ASC LIMIT ?';
      params = [limit];
    }

    const [rows] = await pool.query<AccountNameRow[]>(sql, params);

    return rows.map((row) => row.account_name);
  } catch (error) {
    logger.error(`error searching accounts '${query}':`, error);
    return [];
  }
}

/**
 * backwards compatibility alias for getAccount
 * throws if account not found (matching old behavior)
 */
export async function parseAccountFile(accountName: string): Promise<MudAccountData> {
  const account = await getAccount(accountName);

  if (!account) {
    throw new Error(`Account '${accountName}' not found`);
  }

  return account;
}

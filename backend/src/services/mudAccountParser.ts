import fs from 'fs/promises';
import path from 'path';
import { getCache, setCache, deleteCache } from '../db/redis.js';
import logger, { isErrorWithCode, getErrorMessage } from '../utils/logger.js';

/**
 * MUD Account File Structure (from src/account.c lines 1729-1826)
 *
 * Line 1: Serial number
 * Line 2: Account name
 * Line 3: Account email
 * Line 4: Account password (bcrypt or MD5 CRYPT2)
 * Line 5: Confirmation string
 * Line 6: Number of unique IPs (N)
 * Line 7+: IP entries (3 lines per IP):
 *   - Hostname
 *   - IP address
 *   - Connection count
 * Next: Number of characters (M)
 * Next+: Character entries (2 lines per character):
 *   - Character name
 *   - Play count, last login, blocked flag, racewar side (space-separated)
 * Next: Blocked flag (0/1)
 * Next: Confirmed flag (0/1)
 * Next: Confirmation sent flag (0/1)
 * Next: Last login timestamp
 * Next: Last good alignment timestamp
 * Next: Last evil alignment timestamp
 * Next: Flags 1-4 (reserved, 4 lines)
 * Final: ### (delimiter)
 */

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
  lastIp: string | null; // Most recent IP from uniqueIPs array
  characters: MudAccountCharacter[];
  isBlocked: boolean;
  isConfirmed: boolean;
  confirmationSent: boolean;
  lastLogin: number;
  lastGoodAlign: number;
  lastEvilAlign: number;
  flags: number[];
}

// Cache TTL for account data (in seconds for Redis)
const ACCOUNT_CACHE_TTL = 5 * 60; // 5 minutes
const PID_CACHE_TTL = 60 * 60; // 1 hour (was unbounded!)
const CHAR_CACHE_TTL = 60 * 60; // 1 hour (was unbounded!)
const REDIS_KEY_ACCOUNT = 'mud:account:';
const REDIS_KEY_PID = 'mud:pid:';
const REDIS_KEY_CHAR = 'mud:char:';

/**
 * Helper type for account file iteration callback
 * Return true to stop iteration early
 */
export type AccountFileCallback = (accountName: string) => Promise<boolean | void>;

/**
 * Check if a filename is a valid account file
 */
function isValidAccountFile(filename: string): boolean {
  return !filename.includes('.') && filename !== 'CVS';
}

/**
 * Check if a directory name is a valid letter directory
 */
function isLetterDirectory(name: string): boolean {
  return name.length === 1 && /[a-z]/.test(name);
}

/**
 * Iterate over all account files in the accounts directory
 * Handles the common pattern of letter-subdirectory scanning
 * @param callback Function called for each account filename
 * @param letterFilter Optional: only scan a specific letter directory
 */
export async function forEachAccountFile(
  callback: AccountFileCallback,
  letterFilter?: string
): Promise<void> {
  const accountsDir = process.env.MUD_ACCOUNTS_DIR!;

  try {
    const letters = await fs.readdir(accountsDir).catch(() => []);

    for (const letter of letters) {
      if (!isLetterDirectory(letter)) continue;
      if (letterFilter && letter !== letterFilter) continue;

      const letterDir = path.join(accountsDir, letter);
      const files = await fs.readdir(letterDir).catch(() => []);

      for (const file of files) {
        if (!isValidAccountFile(file)) continue;

        const shouldStop = await callback(file);
        if (shouldStop === true) return;
      }
    }
  } catch (error) {
    logger.error('Error iterating account files:', error);
  }
}

/**
 * Get the file path for a MUD account
 * Accounts are stored in /Accounts/{first-letter}/{lowercase-name}
 */
export function getAccountFilePath(accountName: string): string {
  const accountsDir = process.env.MUD_ACCOUNTS_DIR!;
  const firstLetter = accountName[0].toLowerCase();
  const fileName = accountName.toLowerCase();
  return path.join(accountsDir, firstLetter, fileName);
}

/**
 * Parse a MUD account file
 * @throws Error if file doesn't exist or is malformed
 */
export async function parseAccountFile(accountName: string): Promise<MudAccountData> {
  const cacheKey = `${REDIS_KEY_ACCOUNT}${accountName.toLowerCase()}`;

  // Check Redis cache first
  const cached = await getCache<MudAccountData>(cacheKey);
  if (cached) {
    return cached;
  }

  const filePath = getAccountFilePath(accountName);

  // retry logic for race condition with MUD file writes
  const maxRetries = 3;
  const retryDelay = 100; // ms

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // validate file is complete - must end with ### delimiter
      if (!content.trim().endsWith('###')) {
        if (attempt < maxRetries) {
          logger.debug(`[AccountParser] File incomplete for '${accountName}', retry ${attempt}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        throw new Error(`Account file for '${accountName}' appears incomplete (missing ### delimiter)`);
      }

      const lines = content.trim().split('\n');

    let idx = 0;

    // Line 1: Serial number
    const serialNumber = parseInt(lines[idx++], 10);

    // Line 2: Account name
    const parsedAccountName = lines[idx++];

    // Line 3: Email
    const email = lines[idx++];

    // Line 4: Password hash (bcrypt or MD5)
    const passwordHash = lines[idx++];

    // Line 5: Confirmation string
    const confirmationString = lines[idx++] || '';

    // Line 6: Number of unique IPs
    const numIPs = parseInt(lines[idx++], 10);

    // Next numIPs * 3 lines: IP entries (hostname, ip_address, count per entry)
    const uniqueIPs: string[] = [];
    for (let i = 0; i < numIPs; i++) {
      idx++;                           // Skip hostname
      const ipAddress = lines[idx++];  // ip_address
      idx++;                           // Skip connection count
      uniqueIPs.push(ipAddress);       // Store the IP address
    }

    // Next line: Number of characters
    const numChars = parseInt(lines[idx++], 10);

    // Parse each character (5 lines per character)
    const characters: MudAccountCharacter[] = [];
    for (let i = 0; i < numChars; i++) {
      const name = lines[idx++];
      const stats = lines[idx++].split(' ').map(n => parseInt(n, 10));
      const playCount = stats[0] || 0;
      const lastLogin = stats[1] || 0;
      const blocked = stats[2] === 1;
      const racewarSide = stats[3] || 0;

      characters.push({
        name,
        playCount,
        lastLogin,
        blocked,
        racewarSide
      });
    }

    // Next line: Account blocked flag
    const isBlocked = parseInt(lines[idx++], 10) === 1;

    // Next line: Confirmed flag
    const isConfirmed = parseInt(lines[idx++], 10) === 1;

    // Next line: Confirmation sent flag
    const confirmationSent = parseInt(lines[idx++], 10) === 1;

    // Next line: Last login timestamp
    const lastLogin = parseInt(lines[idx++], 10);

    // Next line: Last good alignment timestamp
    const lastGoodAlign = parseInt(lines[idx++], 10);

    // Next line: Last evil alignment timestamp
    const lastEvilAlign = parseInt(lines[idx++], 10);

    // Next 4 lines: Flags (reserved for future use)
    const flags: number[] = [];
    for (let i = 0; i < 4; i++) {
      flags.push(parseInt(lines[idx++], 10));
    }

    const accountData: MudAccountData = {
      serialNumber,
      accountName: parsedAccountName,
      email,
      passwordHash,
      confirmationString,
      uniqueIPs,
      lastIp: uniqueIPs.length > 0 ? uniqueIPs[uniqueIPs.length - 1] : null, // Last IP in array
      characters,
      isBlocked,
      isConfirmed,
      confirmationSent,
      lastLogin,
      lastGoodAlign,
      lastEvilAlign,
      flags
    };

    // Cache the parsed data in Redis
    await setCache(cacheKey, accountData, ACCOUNT_CACHE_TTL);

    return accountData;

    } catch (error) {
      // don't retry for file not found or permission denied
      if (isErrorWithCode(error) && error.code === 'ENOENT') {
        throw new Error(`Account '${accountName}' not found`);
      }
      if (isErrorWithCode(error) && error.code === 'EACCES') {
        throw new Error(`Permission denied reading account file for '${accountName}'`);
      }

      // retry on other errors (likely race condition)
      if (attempt < maxRetries) {
        logger.debug(`[AccountParser] Parse error for '${accountName}', retry ${attempt}/${maxRetries}: ${getErrorMessage(error)}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      throw new Error(`Failed to parse account file for '${accountName}': ${getErrorMessage(error)}`);
    }
  }

  // should not reach here, but just in case
  throw new Error(`Failed to parse account file for '${accountName}' after ${maxRetries} attempts`);
}

/**
 * Check if an account exists
 */
export async function accountExists(accountName: string): Promise<boolean> {
  try {
    const filePath = getAccountFilePath(accountName);
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get account by name (with caching)
 */
export async function getAccount(accountName: string): Promise<MudAccountData | null> {
  try {
    return await parseAccountFile(accountName);
  } catch (error) {
    logger.error(`Error getting account '${accountName}':`, error);
    return null;
  }
}

/**
 * Clear cached account data (useful after password changes in MUD)
 */
export async function clearAccountCache(accountName?: string): Promise<void> {
  if (accountName) {
    await deleteCache(`${REDIS_KEY_ACCOUNT}${accountName.toLowerCase()}`);
  } else {
    await deleteCache(`${REDIS_KEY_ACCOUNT}*`);
  }
}

/**
 * Check if a password hash is bcrypt format
 */
export function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
}

/**
 * Update the password hash in an account file
 * This reads the file, replaces line 4 (password hash), and writes it back
 */
export async function updateAccountPassword(accountName: string, newPasswordHash: string): Promise<void> {
  const filePath = getAccountFilePath(accountName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Line 4 (index 3) is the password hash
    if (lines.length < 4) {
      throw new Error('Account file is malformed');
    }

    lines[3] = newPasswordHash;

    // Write back with original line endings
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    // Clear cache for this account
    clearAccountCache(accountName);

  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      throw new Error(`Account '${accountName}' not found`);
    }
    if (isErrorWithCode(error) && error.code === 'EACCES') {
      throw new Error(`Permission denied writing account file for '${accountName}'`);
    }
    throw new Error(`Failed to update password for '${accountName}': ${getErrorMessage(error)}`);
  }
}

/**
 * Find account name by PID
 * Searches all account files for the PID (cached in Redis)
 * NOTE: This function is currently non-functional (TODO in original code)
 */
export async function findAccountByPid(pid: number): Promise<string | null> {
  const cacheKey = `${REDIS_KEY_PID}${pid}`;

  // Check Redis cache first
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    return cached;
  }

  let result: string | null = null;

  await forEachAccountFile(async (accountName) => {
    try {
      const accountData = await parseAccountFile(accountName);

      // Check if this account has a character with this PID
      // TODO: This needs a different approach - character names don't contain PID
      const hasCharacter = accountData.characters.some(_char => {
        return false; // Not implemented
      });

      if (hasCharacter) {
        await setCache(cacheKey, accountData.accountName, PID_CACHE_TTL);
        result = accountData.accountName;
        return true; // Stop iteration
      }
    } catch {
      // Skip malformed account files
    }
    return false;
  });

  return result;
}

/**
 * Find account name that owns a character
 * Searches all account files for the character (cached in Redis)
 */
export async function findAccountByCharacter(characterName: string): Promise<string | null> {
  const lowerCharName = characterName.toLowerCase();
  const cacheKey = `${REDIS_KEY_CHAR}${lowerCharName}`;

  // Check Redis cache first
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    return cached;
  }

  let result: string | null = null;

  await forEachAccountFile(async (accountName) => {
    try {
      const accountData = await parseAccountFile(accountName);

      // Check if this account has the character
      const hasCharacter = accountData.characters.some(
        char => char.name.toLowerCase() === lowerCharName
      );

      if (hasCharacter) {
        // Cache the result in Redis
        await setCache(cacheKey, accountData.accountName, CHAR_CACHE_TTL);
        result = accountData.accountName;
        return true; // Stop iteration
      }
    } catch {
      // Skip malformed account files
    }
    return false;
  });

  return result;
}

/**
 * Search accounts for autocomplete
 * Searches account files in the MUD Accounts directory (fast filesystem lookup)
 */
export async function searchAccounts(query: string, limit: number = 10): Promise<string[]> {
  const lowerQuery = query.toLowerCase();
  const results: string[] = [];

  // Determine letter filter for optimization
  const letterFilter = lowerQuery.length > 0 && /[a-z]/.test(lowerQuery.charAt(0))
    ? lowerQuery.charAt(0)
    : undefined;

  // If query starts with non-letter, return empty
  if (lowerQuery.length > 0 && !letterFilter) {
    return [];
  }

  await forEachAccountFile(async (accountName) => {
    // For prefix queries, check if account name matches
    if (lowerQuery && !accountName.toLowerCase().startsWith(lowerQuery)) {
      return false; // Continue to next
    }

    results.push(accountName);

    // Stop if we've reached the limit
    if (results.length >= limit) {
      return true; // Stop iteration
    }
    return false;
  }, letterFilter);

  return results.sort();
}

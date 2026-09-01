import { isIP } from 'net';
import { Tail } from 'tail';
import type { RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import { isHookEnabledSync } from '../hooks/hookGate.js';
import { markFlatfileUnavailable, recordDroppedFlatfileInput } from '../hooks/flatfileHookState.js';
import logger from '../utils/logger.js';
import { analyzeAndFlagAccount } from './multiAccountDetectionService.js';
import { broadcastConnectionEvent } from '../index.js';
import {
  FlatfileAccessError,
  getReadableMudPath,
  probeFlatfileHook,
  readMudTextFile,
  registerFlatfileRecoveryHandler,
  unregisterFlatfileRecoveryHandler,
} from './flatfileAccess.js';

/**
 * MUD Connection Log Parser
 *
 * Parses the DurisMUD comm log to extract player login/logout events
 * and store them in account_login_history table.
 *
 * Log Format Examples:
 * Login:    "Wed Nov  5 00:15:03 2025::Ubak [127.0.0.1] has connected."
 * Legacy:   "Wed Nov  5 00:15:04 2025::Ariz [ ? @127.0.0.1] has reconnected."
 * Logout:   "Wed Nov  5 00:14:35 2025::Losing player: Rizz [127.0.0.1]."
 * Logout:   "Sun Nov  9 02:44:53 2025::Closing link to: Ubak [127.0.0.1]."
 */

const CONNECTION_LOG_RELATIVE_PATH = 'logs/log/comm';
const MAX_CONNECTION_LOG_BYTES = 64 * 1024 * 1024;

export interface ConnectionEvent {
  timestamp: Date;
  characterName: string;
  ipAddress: string;
  status: 'login' | 'logout';
}

export type ConnectionParseResult =
  | { readonly kind: 'event'; readonly event: ConnectionEvent }
  | { readonly kind: 'ignored' }
  | {
      readonly kind: 'malformed';
      readonly reason: 'format' | 'timestamp' | 'character_name' | 'ip_address';
    };

const TIMESTAMP_SOURCE =
  '([A-Z][a-z]{2}) ([A-Z][a-z]{2}) ([ 0-9][0-9]) ' + '([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})';
const LOGIN_PATTERN = new RegExp(
  `^${TIMESTAMP_SOURCE}::(.+?) \\[(?: \\? @)?([^\\]]+?)\\] has (connected|reconnected)\\.$`,
);
const LOGOUT_PATTERN_1 = new RegExp(
  `^${TIMESTAMP_SOURCE}::Losing player: (.+?) \\[([^\\]]+?)\\]\\.$`,
);
const LOGOUT_PATTERN_2 = new RegExp(
  `^${TIMESTAMP_SOURCE}::Closing link to: (.+?) \\[([^\\]]+?)\\]\\.$`,
);
// DurisMUD stores player names in MAX_NAME_LENGTH (12) plus the terminator.
const CHARACTER_NAME_PATTERN = /^[A-Za-z]{1,12}$/;
const CONNECTION_CANDIDATE_PATTERN =
  /::(?:Losing player:|Closing link to:)|\] has (?:connected|reconnected)(?:\.|$)/;

const MONTH_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
});
const WEEKDAY_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
});

// Module-level Tail instance for cleanup
let tailInstance: Tail | null = null;
let tailStartPromise: Promise<boolean> | null = null;
let lineProcessing: Promise<void> = Promise.resolve();
let tailLifecycleGeneration = 0;

function parseTimestamp(match: RegExpMatchArray): Date | null {
  const weekday = match[1];
  const month = MONTH_INDEX[match[2]];
  const day = Number(match[3].trim());
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const year = Number(match[7]);
  if (
    month === undefined ||
    WEEKDAY_INDEX[weekday] === undefined ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    year < 1970
  ) {
    return null;
  }

  const date = new Date(year, month, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second ||
    date.getDay() !== WEEKDAY_INDEX[weekday]
  ) {
    return null;
  }
  return date;
}

function resultFromMatch(
  match: RegExpMatchArray,
  status: ConnectionEvent['status'],
): ConnectionParseResult {
  const timestamp = parseTimestamp(match);
  if (!timestamp) {
    return { kind: 'malformed', reason: 'timestamp' };
  }
  const characterName = match[8].trim();
  if (!CHARACTER_NAME_PATTERN.test(characterName)) {
    return { kind: 'malformed', reason: 'character_name' };
  }
  const ipAddress = match[9].trim();
  if (isIP(ipAddress) === 0) {
    return { kind: 'malformed', reason: 'ip_address' };
  }
  return {
    kind: 'event',
    event: { timestamp, characterName, ipAddress, status },
  };
}

/** Parse one comm-log line without logging or mutating ingestion state. */
export function parseConnectionLogLine(line: string): ConnectionParseResult {
  const loginMatch = line.match(LOGIN_PATTERN);
  if (loginMatch) {
    return resultFromMatch(loginMatch, 'login');
  }
  const losingMatch = line.match(LOGOUT_PATTERN_1);
  if (losingMatch) {
    return resultFromMatch(losingMatch, 'logout');
  }
  const closingMatch = line.match(LOGOUT_PATTERN_2);
  if (closingMatch) {
    return resultFromMatch(closingMatch, 'logout');
  }
  return CONNECTION_CANDIDATE_PATTERN.test(line)
    ? { kind: 'malformed', reason: 'format' }
    : { kind: 'ignored' };
}

/**
 * Get account name for a character from database
 */
interface AccountRow extends RowDataPacket {
  account_name: string;
}

async function getAccountForCharacter(characterName: string): Promise<string | null> {
  try {
    const [result] = await db.query<AccountRow[]>(
      'SELECT account_name FROM account_characters WHERE char_name = ? AND deleted_at IS NULL LIMIT 1',
      [characterName],
    );

    return result[0]?.account_name || null;
  } catch (error) {
    logger.error(`Error fetching account for character ${characterName}:`, error);
    return null;
  }
}

/**
 * Store connection event in database
 */
async function storeConnectionEvent(event: ConnectionEvent): Promise<string | null> {
  try {
    // Get account name from character name
    const accountName = await getAccountForCharacter(event.characterName);

    if (!accountName) {
      logger.warn(`[MudLogSync] Could not find account for character: ${event.characterName}`);
      return null;
    }

    // Insert into account_login_history (IGNORE duplicates due to UNIQUE constraint)
    await db.query(
      'INSERT IGNORE INTO account_login_history (account_name, character_name, ip_address, status, timestamp, hostname) VALUES (?, ?, ?, ?, ?, ?)',
      [accountName, event.characterName, event.ipAddress, event.status, event.timestamp, null],
    );

    logger.info(`[MudLogSync] Logged ${event.status}: ${event.characterName} (${accountName})`);
    return accountName;
  } catch (error) {
    logger.error('Error storing connection event:', error);
    return null;
  }
}

export interface HistoricalImportResult {
  readonly imported: number;
  readonly skippedOld: number;
  readonly droppedMalformed: number;
  readonly unavailable: boolean;
}

/**
 * Parse historical log file and populate database
 */
export async function importHistoricalLogs(daysBack: number = 30): Promise<HistoricalImportResult> {
  if (!isHookEnabledSync('connection_log')) {
    return { imported: 0, skippedOld: 0, droppedMalformed: 0, unavailable: false };
  }
  logger.info(`[MudLogSync] Importing historical connection logs (last ${daysBack} days)...`);

  try {
    const logContent = await readMudTextFile('connection_log', CONNECTION_LOG_RELATIVE_PATH, {
      maxBytes: MAX_CONNECTION_LOG_BYTES,
    });
    const lines = logContent.split('\n');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    let importedCount = 0;
    let skippedCount = 0;
    let droppedCount = 0;

    for (const line of lines) {
      const parsed = parseConnectionLogLine(line);
      if (parsed.kind === 'malformed') {
        recordDroppedFlatfileInput('connection_log');
        droppedCount += 1;
        continue;
      }
      if (parsed.kind !== 'event') {
        continue;
      }
      if (parsed.event.timestamp < cutoffDate) {
        skippedCount += 1;
        continue;
      }
      if (await storeConnectionEvent(parsed.event)) {
        importedCount += 1;
      }
    }

    logger.info(
      `[MudLogSync] Historical import complete: ${importedCount} imported, ` +
        `${skippedCount} old, ${droppedCount} malformed candidates dropped`,
    );
    return {
      imported: importedCount,
      skippedOld: skippedCount,
      droppedMalformed: droppedCount,
      unavailable: false,
    };
  } catch (error) {
    if (error instanceof FlatfileAccessError) {
      logger.warn(`[MudLogSync] Historical import unavailable: ${error.message}`);
    } else {
      logger.error('Error importing historical logs');
    }
    return { imported: 0, skippedOld: 0, droppedMalformed: 0, unavailable: true };
  }
}

async function processRealtimeLine(line: string): Promise<void> {
  if (!isHookEnabledSync('connection_log')) {
    return;
  }
  const parsed = parseConnectionLogLine(line);
  if (parsed.kind === 'ignored') {
    return;
  }
  if (parsed.kind === 'malformed') {
    recordDroppedFlatfileInput('connection_log');
    logger.warn(`[MudLogSync] Dropped malformed connection candidate (${parsed.reason})`);
    return;
  }

  const accountName = await storeConnectionEvent(parsed.event);
  if (parsed.event.status === 'login' && accountName) {
    await analyzeAndFlagAccount(accountName);
  }
  broadcastConnectionEvent(parsed.event);
}

function handleTailError(): void {
  if (tailInstance) {
    try {
      tailInstance.unwatch();
    } catch {
      logger.warn('[MudLogSync] Connection log watcher cleanup failed');
    }
    tailInstance = null;
  }
  markFlatfileUnavailable(
    'connection_log',
    'Connection log monitoring lost access to the MUD filesystem.',
  );
  logger.warn('[MudLogSync] Connection log monitoring unavailable; retry scheduled');
}

async function startTail(generation: number): Promise<boolean> {
  if (tailInstance) {
    return true;
  }
  if (!isHookEnabledSync('connection_log')) {
    return false;
  }

  registerFlatfileRecoveryHandler('connection_log', async () => {
    await probeFlatfileHook('connection_log');
    if (isHookEnabledSync('connection_log') && !(await startRealtimeMonitoring())) {
      throw new Error('Connection log tail did not restart.');
    }
  });

  try {
    const logPath = await getReadableMudPath('connection_log', CONNECTION_LOG_RELATIVE_PATH);
    if (generation !== tailLifecycleGeneration || !isHookEnabledSync('connection_log')) {
      return false;
    }
    const nextTail = new Tail(logPath, {
      fromBeginning: false,
      follow: true,
      useWatchFile: true,
    });
    tailInstance = nextTail;

    nextTail.on('line', (line: string) => {
      lineProcessing = lineProcessing
        .then(() => processRealtimeLine(line))
        .catch(() => {
          logger.error('[MudLogSync] Failed to process a connection event');
        });
    });
    nextTail.on('error', () => {
      if (tailInstance === nextTail) {
        handleTailError();
      }
    });

    logger.info('[MudLogSync] Real-time monitoring started');
    return true;
  } catch (error) {
    if (error instanceof FlatfileAccessError) {
      logger.warn(`[MudLogSync] Real-time monitoring unavailable: ${error.message}`);
    } else {
      markFlatfileUnavailable('connection_log', 'Connection log monitoring could not be started.');
      logger.error('[MudLogSync] Real-time monitoring could not be started');
    }
    return false;
  }
}

/** Start real-time monitoring without allowing overlapping watcher creation. */
export function startRealtimeMonitoring(): Promise<boolean> {
  if (tailStartPromise) {
    return tailStartPromise;
  }
  const generation = tailLifecycleGeneration;
  const start = startTail(generation);
  tailStartPromise = start;
  void start.finally(() => {
    if (tailStartPromise === start) {
      tailStartPromise = null;
    }
  });
  return start;
}

/**
 * Check if database already has connection log data
 */
async function hasExistingData(): Promise<boolean> {
  try {
    const [rows] = await db.query<Array<RowDataPacket & { count: number }>>(
      'SELECT COUNT(*) as count FROM account_login_history',
    );
    const count = rows[0]?.count ?? 0;
    return count > 0;
  } catch (error) {
    logger.error('Error checking for existing data:', error);
    return false; // Import on error to be safe
  }
}

/**
 * Initialize connection log sync service
 */
export async function initializeMudConnectionSync(): Promise<void> {
  logger.info('[MudLogSync] Initializing MUD connection log sync service...');

  // Check if we already have data in database
  const hasData = await hasExistingData();

  if (hasData) {
    logger.info('[MudLogSync] Skipping historical import (data already exists in database)');
  } else {
    logger.info('[MudLogSync] No existing data found, importing historical logs...');
    await importHistoricalLogs(30);
  }

  // Start real-time monitoring
  await startRealtimeMonitoring();

  logger.info('[MudLogSync] MUD connection log sync service initialized');
}

/**
 * Stop real-time log monitoring (for graceful shutdown)
 */
export function stopRealtimeMonitoring(): void {
  tailLifecycleGeneration += 1;
  tailStartPromise = null;
  unregisterFlatfileRecoveryHandler('connection_log');
  if (tailInstance) {
    try {
      tailInstance.unwatch();
    } catch {
      logger.warn('[MudLogSync] Connection log watcher cleanup failed');
    }
    tailInstance = null;
    logger.info('[MudLogSync] Real-time monitoring stopped');
  }
  lineProcessing = Promise.resolve();
}

import fs from 'fs';
import { Tail } from 'tail';
import { pool as db } from '../db/connection.js';
import logger from '../utils/logger.js';
import { analyzeAndFlagAccount } from './multiAccountDetectionService.js';
import { broadcastConnectionEvent } from '../index.js';

/**
 * MUD Connection Log Parser
 *
 * Parses the DurisMUD comm log to extract player login/logout events
 * and store them in account_login_history table.
 *
 * Log Format Examples:
 * Login:    "Wed Nov  5 00:15:03 2025::Ubak [ ? @127.0.0.1] has connected."
 * Login:    "Wed Nov  5 00:15:04 2025::Ariz [ ? @127.0.0.1] has reconnected."
 * Logout:   "Wed Nov  5 00:14:35 2025::Losing player: Rizz [127.0.0.1]."
 * Logout:   "Sun Nov  9 02:44:53 2025::Closing link to: Ubak [127.0.0.1]."
 */

const MUD_DIR = process.env.MUD_DIR!;
const MUD_COMM_LOG_PATH = `${MUD_DIR}/logs/log/comm`;

interface ConnectionEvent {
  timestamp: Date;
  characterName: string;
  ipAddress: string;
  status: 'login' | 'logout';
}

// Regex patterns for parsing log lines
const LOGIN_PATTERN = /^(.+?)::(.+?) \[ \? @(.+?)\] has (connected|reconnected)\./;
const LOGOUT_PATTERN_1 = /^(.+?)::Losing player: (.+?) \[(.+?)\]\./;
const LOGOUT_PATTERN_2 = /^(.+?)::Closing link to: (.+?) \[(.+?)\]\./;

// Module-level Tail instance for cleanup
let tailInstance: Tail | null = null;

/**
 * Parse a single log line and extract connection event data
 */
function parseLogLine(line: string): ConnectionEvent | null {
  // Try login pattern (has connected / has reconnected)
  let match = line.match(LOGIN_PATTERN);
  if (match) {
    const [, timestampStr, characterName, ipAddress] = match;
    return {
      timestamp: parseTimestamp(timestampStr),
      characterName: characterName.trim(),
      ipAddress: ipAddress.trim(),
      status: 'login'
    };
  }

  // Try logout pattern 1 (Losing player)
  match = line.match(LOGOUT_PATTERN_1);
  if (match) {
    const [, timestampStr, characterName, ipAddress] = match;
    return {
      timestamp: parseTimestamp(timestampStr),
      characterName: characterName.trim(),
      ipAddress: ipAddress.trim(),
      status: 'logout'
    };
  }

  // Try logout pattern 2 (Closing link to)
  match = line.match(LOGOUT_PATTERN_2);
  if (match) {
    const [, timestampStr, characterName, ipAddress] = match;
    return {
      timestamp: parseTimestamp(timestampStr),
      characterName: characterName.trim(),
      ipAddress: ipAddress.trim(),
      status: 'logout'
    };
  }

  return null;
}

/**
 * Parse MUD log timestamp to Date object
 * Format: "Wed Nov  5 00:15:03 2025"
 */
function parseTimestamp(timestampStr: string): Date {
  const date = new Date(timestampStr.trim());
  if (isNaN(date.getTime())) {
    logger.error(`Failed to parse timestamp: ${timestampStr}`);
    return new Date(); // Fallback to current time
  }
  return date;
}

/**
 * Get account name for a character from database
 */
async function getAccountForCharacter(characterName: string): Promise<string | null> {
  try {
    const [result] = await db.query(
      'SELECT account_name FROM account_characters WHERE char_name = ? AND deleted_at IS NULL LIMIT 1',
      [characterName]
    );

    return (result as any[])[0]?.account_name || null;
  } catch (error) {
    logger.error(`Error fetching account for character ${characterName}:`, error);
    return null;
  }
}

/**
 * Store connection event in database
 */
async function storeConnectionEvent(event: ConnectionEvent): Promise<void> {
  try {
    // Get account name from character name
    const accountName = await getAccountForCharacter(event.characterName);

    if (!accountName) {
      logger.warn(`[MudLogSync] Could not find account for character: ${event.characterName}`);
      return;
    }

    // Insert into account_login_history (IGNORE duplicates due to UNIQUE constraint)
    await db.query(
      'INSERT IGNORE INTO account_login_history (account_name, character_name, ip_address, status, timestamp, hostname) VALUES (?, ?, ?, ?, ?, ?)',
      [accountName, event.characterName, event.ipAddress, event.status, event.timestamp, null]
    );

    logger.info(`[MudLogSync] Logged ${event.status}: ${event.characterName} (${accountName}) from ${event.ipAddress}`);
  } catch (error) {
    logger.error('Error storing connection event:', error);
  }
}

/**
 * Parse historical log file and populate database
 */
export async function importHistoricalLogs(daysBack: number = 30): Promise<void> {
  logger.info(`[MudLogSync] Importing historical connection logs (last ${daysBack} days)...`);

  try {
    const logContent = fs.readFileSync(MUD_COMM_LOG_PATH, 'utf-8');
    const lines = logContent.split('\n');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    let importedCount = 0;
    let skippedCount = 0;

    for (const line of lines) {
      const event = parseLogLine(line);
      if (event) {
        // Only import recent events
        if (event.timestamp >= cutoffDate) {
          await storeConnectionEvent(event);
          importedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    logger.info(`[MudLogSync] Historical import complete: ${importedCount} events imported, ${skippedCount} old events skipped`);
  } catch (error) {
    logger.error('Error importing historical logs:', error);
  }
}

/**
 * Start real-time log monitoring using tail
 */
export function startRealtimeMonitoring(): void {
  logger.info('[MudLogSync] Starting real-time MUD connection log monitoring...');

  try {
    // Check if log file exists
    if (!fs.existsSync(MUD_COMM_LOG_PATH)) {
      logger.error(`[MudLogSync] Log file not found: ${MUD_COMM_LOG_PATH}`);
      return;
    }

    // Create tail instance and store for cleanup
    tailInstance = new Tail(MUD_COMM_LOG_PATH, {
      fromBeginning: false, // Only new lines
      follow: true,
      useWatchFile: true // Better compatibility
    });

    // Handle new log lines
    tailInstance.on('line', async (line: string) => {
      const event = parseLogLine(line);
      if (event) {
        await storeConnectionEvent(event);

        // Check for suspicious activity on login events
        if (event.status === 'login') {
          const accountName = await getAccountForCharacter(event.characterName);
          if (accountName) {
            // Trigger async analysis (don't await to avoid blocking)
            analyzeAndFlagAccount(accountName)
              .catch(err => logger.error('Error analyzing account:', err));
          }
        }

        // Trigger WebSocket event for real-time updates
        broadcastConnectionEvent(event);
      }
    });

    // Handle errors
    tailInstance.on('error', (error: Error) => {
      logger.error('Error tailing MUD log:', error);
    });

    logger.info('[MudLogSync] Real-time monitoring started');
  } catch (error) {
    logger.error('Error starting real-time monitoring:', error);
  }
}

/**
 * Check if database already has connection log data
 */
async function hasExistingData(): Promise<boolean> {
  try {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM account_login_history');
    const count = (rows as any)[0].count;
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
  startRealtimeMonitoring();

  logger.info('[MudLogSync] MUD connection log sync service initialized');
}

/**
 * Stop real-time log monitoring (for graceful shutdown)
 */
export function stopRealtimeMonitoring(): void {
  if (tailInstance) {
    tailInstance.unwatch();
    tailInstance = null;
    logger.info('[MudLogSync] Real-time monitoring stopped');
  }
}

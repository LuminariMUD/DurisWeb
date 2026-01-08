import { pool } from '../db/connection.js';
import { parseAccountFile, forEachAccountFile } from './mudAccountParser.js';
import logger from '../utils/logger.js';

/**
 * Sync account_characters table from MUD account flatfiles
 * This should be run periodically to keep the database in sync
 */
export async function syncAccountCharacters(): Promise<void> {
  logger.info('[AccountSync] Starting account-character sync...');

  let totalSynced = 0;

  await forEachAccountFile(async (accountName) => {
    try {
      const accountData = await parseAccountFile(accountName);

      // Insert/update each character for this account
      for (const char of accountData.characters) {
        // Get PID from players_core
        const [rows] = await pool.query(
          'SELECT pid FROM players_core WHERE name = ? LIMIT 1',
          [char.name]
        );

        const rowsArray = rows as any[];
        if (rowsArray.length > 0) {
          const pid = rowsArray[0].pid;

          // Upsert into account_characters (including email and last_ip)
          await pool.query(
            `INSERT INTO account_characters (account_name, pid, char_name, email, last_ip, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               account_name = VALUES(account_name),
               char_name = VALUES(char_name),
               email = VALUES(email),
               last_ip = VALUES(last_ip)`,
            [accountData.accountName, pid, char.name, accountData.email, accountData.lastIp]
          );

          totalSynced++;
        }
      }
    } catch (error) {
      logger.error(`[AccountSync] Error syncing account ${accountName}:`, error);
    }
  });

  logger.info(`[AccountSync] Sync complete. Synced ${totalSynced} character-account mappings.`);
}

// Module-level interval ID for cleanup
let syncIntervalId: NodeJS.Timeout | null = null;

/**
 * Start background sync service
 */
export function startAccountSyncService(intervalSeconds: number = 300): void {
  // Run immediately on startup
  syncAccountCharacters().catch(err => {
    logger.error('[AccountSync] Initial sync failed:', err);
  });

  // Then run periodically - store interval ID for cleanup
  syncIntervalId = setInterval(() => {
    syncAccountCharacters().catch(err => {
      logger.error('[AccountSync] Periodic sync failed:', err);
    });
  }, intervalSeconds * 1000);

  logger.info(`[AccountSync] Background service started (interval: ${intervalSeconds}s)`);
}

/**
 * Stop background sync service (for graceful shutdown)
 */
export function stopAccountSyncService(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    logger.info('[AccountSync] Background service stopped');
  }
}

import { pool } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cron from 'node-cron';
import { getWebSettings } from './webSettingsService.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

// Configuration
const MUD_BASE = process.env.MUD_DIR || '';
const BACKUP_DIR = path.join(MUD_BASE, 'backup');
const MAX_MANUAL_BACKUPS = 5;
// MAX_HOURLY_BACKUPS is now dynamic - fetched from web_settings

export interface BackupInfo {
  id: number;
  filename: string;
  backupType: 'manual' | 'hourly';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentStep: string | null;
  fileSize: number | null;
  errorMessage: string | null;
  createdBy: string;
  ipAddress: string;
  startedAt: string;
  completedAt: string | null;
}

export interface BackupContents {
  accounts: string[];
  characters: { pid: number; name: string }[];
}

export interface RestoreCategories {
  coreData: boolean;
  inventory: boolean;
  skills: boolean;
  progression: boolean;
  auction: boolean;
  guild: boolean;
  pvpHistory: boolean;
  misc: boolean;
}

export interface RestoreRequest {
  backupId: number;
  restoreType: 'full' | 'account' | 'character';
  accounts?: string[];
  characters?: { pid: number; name: string }[];
  categories?: RestoreCategories;
}

export interface RestoreInfo {
  id: number;
  backupId: number;
  restoreType: 'full' | 'account' | 'character';
  accounts: string[] | null;
  characters: { pid: number; name: string }[] | null;
  categories: RestoreCategories | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  createdBy: string;
  ipAddress: string;
  startedAt: string;
  completedAt: string | null;
}

interface BackupRow extends RowDataPacket {
  id: number;
  filename: string;
  backup_type: string;
  status: string;
  progress: number;
  current_step: string | null;
  file_size: number | null;
  error_message: string | null;
  created_by: string;
  ip_address: string;
  started_at: string;
  completed_at: string | null;
}

interface RestoreRow extends RowDataPacket {
  id: number;
  backup_id: number;
  restore_type: string;
  accounts: string | null;
  characters: string | null;
  categories: string | null;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  created_by: string;
  ip_address: string;
  started_at: string;
  completed_at: string | null;
}

// Progress broadcast function (will be set by index.ts)
let progressBroadcaster: ((data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
  filename: string;
}) => void) | null = null;

export function setProgressBroadcaster(fn: typeof progressBroadcaster) {
  progressBroadcaster = fn;
}

function broadcastProgress(data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
  filename: string;
}) {
  if (progressBroadcaster) {
    progressBroadcaster(data);
  }
}

function mapRowToBackupInfo(row: BackupRow): BackupInfo {
  return {
    id: row.id,
    filename: row.filename,
    backupType: (row.backup_type || 'manual') as BackupInfo['backupType'],
    status: row.status as BackupInfo['status'],
    progress: row.progress,
    currentStep: row.current_step,
    fileSize: row.file_size,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    ipAddress: row.ip_address,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapRowToRestoreInfo(row: RestoreRow): RestoreInfo {
  return {
    id: row.id,
    backupId: row.backup_id,
    restoreType: row.restore_type as RestoreInfo['restoreType'],
    accounts: row.accounts ? JSON.parse(row.accounts) : null,
    characters: row.characters ? JSON.parse(row.characters) : null,
    categories: row.categories ? JSON.parse(row.categories) : null,
    status: row.status as RestoreInfo['status'],
    progress: row.progress,
    currentStep: row.current_step,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    ipAddress: row.ip_address,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Create a new backup (async - returns immediately with backup ID)
 */
export async function createBackup(
  accountName: string,
  ipAddress: string,
  backupType: 'manual' | 'hourly' = 'manual'
): Promise<{ id: number; filename: string }> {
  // Generate filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .slice(0, 17);
  const prefix = backupType === 'hourly' ? 'duris-hourly' : 'duris-mud';
  const filename = `${prefix}-${timestamp}.zip`;

  // Ensure backup directory exists
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

  // Insert pending backup record
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_backups (filename, backup_type, status, progress, current_step, created_by, ip_address, started_at)
     VALUES (?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW())`,
    [filename, backupType, accountName, ipAddress]
  );

  const backupId = result.insertId;

  // Start the backup process asynchronously
  runBackup(backupId, filename, backupType).catch((error) => {
    logger.error(`Backup ${backupId} failed:`, error);
  });

  return { id: backupId, filename };
}

/**
 * Run the actual backup process
 */
async function runBackup(
  backupId: number,
  filename: string,
  backupType: 'manual' | 'hourly' = 'manual'
): Promise<void> {
  const zipPath = path.join(BACKUP_DIR, filename);
  const tempSqlPath = path.join(BACKUP_DIR, `temp_${backupId}.sql`);

  try {
    // Update status to in_progress
    await updateBackupStatus(backupId, 'in_progress', 5, 'Starting backup...');
    broadcastProgress({ id: backupId, progress: 5, currentStep: 'Starting backup...', status: 'in_progress', filename });

    // Step 1: Dump database (0-40%)
    await updateBackupStatus(backupId, 'in_progress', 10, 'Dumping database...');
    broadcastProgress({ id: backupId, progress: 10, currentStep: 'Dumping database...', status: 'in_progress', filename });

    const dbName = process.env.DB_NAME || 'duris_dev';
    const dbUser = process.env.DB_USER || 'duris';
    const dbPassword = process.env.DB_PASSWORD || 'duris';
    const dbHost = process.env.DB_HOST || '127.0.0.1';

    await execAsync(
      `mysqldump -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} > "${tempSqlPath}"`,
      { maxBuffer: 100 * 1024 * 1024 } // 100MB buffer
    );

    await updateBackupStatus(backupId, 'in_progress', 40, 'Database dump complete');
    broadcastProgress({ id: backupId, progress: 40, currentStep: 'Database dump complete', status: 'in_progress', filename });

    // Step 2: Create zip archive (40-100%)
    await updateBackupStatus(backupId, 'in_progress', 45, 'Creating zip archive...');
    broadcastProgress({ id: backupId, progress: 45, currentStep: 'Creating zip archive...', status: 'in_progress', filename });

    await createZipArchive(backupId, filename, zipPath, tempSqlPath);

    // Get final file size
    const stats = await fs.promises.stat(zipPath);
    const fileSize = stats.size;

    // Mark as completed
    await pool.execute(
      `UPDATE mud_backups SET status = 'completed', progress = 100, current_step = 'Backup complete',
       file_size = ?, completed_at = NOW() WHERE id = ?`,
      [fileSize, backupId]
    );
    broadcastProgress({ id: backupId, progress: 100, currentStep: 'Backup complete', status: 'completed', filename });

    // Cleanup temp SQL file
    await fs.promises.unlink(tempSqlPath).catch(() => {});

    // Cleanup old backups
    await cleanupOldBackups(backupType);

    logger.info(`Backup ${backupId} completed successfully: ${filename} (${formatBytes(fileSize)})`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Backup ${backupId} failed:`, errorMessage);

    await pool.execute(
      `UPDATE mud_backups SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [errorMessage, backupId]
    );
    broadcastProgress({ id: backupId, progress: 0, currentStep: `Failed: ${errorMessage}`, status: 'failed', filename });

    // Cleanup partial files
    await fs.promises.unlink(zipPath).catch(() => {});
    await fs.promises.unlink(tempSqlPath).catch(() => {});
  }
}

/**
 * Create the zip archive with database dump only
 */
async function createZipArchive(
  backupId: number,
  filename: string,
  zipPath: string,
  sqlPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        logger.warn('Archiver warning:', err);
      }
    });

    // Track progress
    archive.on('progress', () => {
      updateBackupStatus(backupId, 'in_progress', 80, 'Zipping database...').catch(() => {});
      broadcastProgress({ id: backupId, progress: 80, currentStep: 'Zipping database...', status: 'in_progress', filename });
    });

    archive.pipe(output);

    // Add database dump only
    archive.file(sqlPath, { name: `database/${process.env.DB_NAME || 'duris_dev'}.sql` });

    archive.finalize();
  });
}

/**
 * Update backup status in database
 */
async function updateBackupStatus(
  backupId: number,
  status: string,
  progress: number,
  currentStep: string
): Promise<void> {
  await pool.execute(
    `UPDATE mud_backups SET status = ?, progress = ?, current_step = ? WHERE id = ?`,
    [status, progress, currentStep, backupId]
  );
}

/**
 * Get list of all backups (also cleans up stale data)
 */
export async function getBackupList(): Promise<BackupInfo[]> {
  // 1. Mark stuck backups as failed (in_progress/pending for more than 30 minutes)
  await pool.execute(
    `UPDATE mud_backups
     SET status = 'failed',
         error_message = 'Backup timed out (stuck for over 30 minutes)',
         completed_at = NOW()
     WHERE status IN ('in_progress', 'pending')
       AND started_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
  );

  // 2. Get all completed backups and check if files exist
  const [completedRows] = await pool.execute<BackupRow[]>(
    `SELECT id, filename FROM mud_backups WHERE status = 'completed'`
  );

  // Remove records where backup file no longer exists
  for (const row of completedRows) {
    const filePath = path.join(BACKUP_DIR, row.filename);
    if (!fs.existsSync(filePath)) {
      await pool.execute(`DELETE FROM mud_backups WHERE id = ?`, [row.id]);
      logger.info(`[Backup] Removed orphaned record: ${row.filename} (file not found)`);
    }
  }

  // 3. Return the cleaned list
  const [rows] = await pool.execute<BackupRow[]>(
    `SELECT * FROM mud_backups ORDER BY started_at DESC`
  );
  return rows.map(mapRowToBackupInfo);
}

/**
 * Get a single backup by ID
 */
export async function getBackupById(id: number): Promise<BackupInfo | null> {
  const [rows] = await pool.execute<BackupRow[]>(
    `SELECT * FROM mud_backups WHERE id = ?`,
    [id]
  );
  return rows.length > 0 ? mapRowToBackupInfo(rows[0]) : null;
}

/**
 * Get the file path for a completed backup
 */
export async function getBackupFilePath(id: number): Promise<string | null> {
  const backup = await getBackupById(id);
  if (!backup || backup.status !== 'completed') {
    return null;
  }

  const filePath = path.join(BACKUP_DIR, backup.filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return filePath;
}

/**
 * Delete a backup by ID
 */
export async function deleteBackup(id: number): Promise<boolean> {
  const backup = await getBackupById(id);
  if (!backup) {
    return false;
  }

  // Delete the file if it exists
  const filePath = path.join(BACKUP_DIR, backup.filename);
  await fs.promises.unlink(filePath).catch(() => {});

  // Delete the database record
  await pool.execute(`DELETE FROM mud_backups WHERE id = ?`, [id]);

  return true;
}

/**
 * Delete all failed backups
 */
export async function deleteFailedBackups(): Promise<number> {
  const [rows] = await pool.execute<BackupRow[]>(
    `SELECT * FROM mud_backups WHERE status = 'failed'`
  );

  let deletedCount = 0;
  for (const backup of rows) {
    // Delete the file if it exists
    const filePath = path.join(BACKUP_DIR, backup.filename);
    await fs.promises.unlink(filePath).catch(() => {});

    // Delete the database record
    await pool.execute(`DELETE FROM mud_backups WHERE id = ?`, [backup.id]);
    deletedCount++;
  }

  return deletedCount;
}

/**
 * Cleanup old backups, keeping only MAX_BACKUPS completed ones per type
 */
async function cleanupOldBackups(backupType: 'manual' | 'hourly'): Promise<void> {
  let maxBackups: number;
  if (backupType === 'hourly') {
    const settings = await getWebSettings();
    maxBackups = settings.maxHourlyBackups;
  } else {
    maxBackups = MAX_MANUAL_BACKUPS;
  }

  const [rows] = await pool.execute<BackupRow[]>(
    `SELECT * FROM mud_backups WHERE status = 'completed' AND backup_type = ? ORDER BY started_at DESC`,
    [backupType]
  );

  if (rows.length <= maxBackups) {
    return;
  }

  // Delete excess backups (oldest first)
  const toDelete = rows.slice(maxBackups);
  for (const backup of toDelete) {
    logger.info(`Cleaning up old ${backupType} backup: ${backup.filename}`);
    await deleteBackup(backup.id);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// HOURLY BACKUP SCHEDULER
// ============================================================================

let schedulerStarted = false;

/**
 * Start the hourly backup scheduler
 * Runs at minute 0 of every hour
 */
export function startHourlyBackupScheduler(): void {
  if (schedulerStarted) {
    logger.info('Hourly backup scheduler already running');
    return;
  }

  // Run at minute 0 of every hour: '0 * * * *'
  cron.schedule('0 * * * *', async () => {
    logger.info('Starting scheduled hourly backup...');
    try {
      await createBackup('SYSTEM', '127.0.0.1', 'hourly');
      logger.info('Hourly backup initiated successfully');
    } catch (error) {
      logger.error('Failed to initiate hourly backup:', error);
    }
  });

  schedulerStarted = true;
  logger.info('Hourly backup scheduler started (runs at minute 0 of every hour)');
}

// ============================================================================
// BACKUP CONTENTS LISTING
// ============================================================================

/**
 * List accounts and characters contained in a backup by parsing SQL dump
 */
export async function listBackupContents(backupId: number): Promise<BackupContents | null> {
  const backup = await getBackupById(backupId);
  if (!backup || backup.status !== 'completed') {
    return null;
  }

  const filePath = path.join(BACKUP_DIR, backup.filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const accounts = new Set<string>();
  const characters: { pid: number; name: string }[] = [];

  const directory = await unzipper.Open.file(filePath);

  // find SQL file
  const sqlFile = directory.files.find(f =>
    f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
  );

  if (!sqlFile) {
    return { accounts: [], characters: [] };
  }

  const content = (await sqlFile.buffer()).toString('utf-8');

  // parse account_characters - format: (id,'account_name',pid,'char_name',...)
  // the regex matches each row in VALUES
  const accountCharsMatch = content.match(/INSERT INTO `account_characters` VALUES[\s\S]*?;/g);
  if (accountCharsMatch) {
    for (const insertBlock of accountCharsMatch) {
      // match (id,'account_name',pid,'char_name',...) - extract account_name (second field)
      const rowRegex = /\(\d+,'([^']+)',\d+,'[^']+'/g;
      let match;
      while ((match = rowRegex.exec(insertBlock)) !== null) {
        accounts.add(match[1]);
      }
    }
  }

  // parse player_data - format: (pid,'name',...)
  const playerDataMatch = content.match(/INSERT INTO `player_data` VALUES[\s\S]*?;/g);
  if (playerDataMatch) {
    for (const insertBlock of playerDataMatch) {
      // match (pid,'name',...) - extract pid and name
      const rowRegex = /\((\d+),'([^']+)'/g;
      let match;
      while ((match = rowRegex.exec(insertBlock)) !== null) {
        const pid = parseInt(match[1]);
        const name = match[2];
        if (!characters.some(c => c.pid === pid)) {
          characters.push({ pid, name });
        }
      }
    }
  }

  return {
    accounts: Array.from(accounts).sort(),
    characters: characters.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ============================================================================
// RESTORE FUNCTIONS
// ============================================================================

// category to tables mapping
const CATEGORY_TABLES: Record<keyof RestoreCategories, string[]> = {
  coreData: ['player_data'],
  inventory: ['player_items', 'player_item_affects'],
  skills: ['player_skills', 'player_spellbooks', 'player_affects', 'player_timers'],
  progression: [
    'progress', 'epic_gain', 'epic_bonus', 'boons', 'boons_progress'
  ],
  auction: ['auction_money_pickups', 'auction_item_pickups'],
  guild: ['guild_members'],
  pvpHistory: ['pkill_info', 'frag_leaderboard'],
  misc: ['player_pets', 'player_pet_items', 'player_pet_item_affects', 'offline_messages'],
};

// all tables that can be restored (for full restore)
const ALL_RESTORE_TABLES = [
  // core
  'player_data', 'account_characters', 'account_banks',
  // items (inventory + equipment in same table)
  'player_items', 'player_item_affects',
  // skills
  'player_skills', 'player_spellbooks', 'player_affects', 'player_timers',
  // progression
  'progress', 'epic_gain', 'epic_bonus', 'boons', 'boons_progress',
  // auction
  'auction_money_pickups', 'auction_item_pickups',
  // guild
  'guild_members',
  // pvp
  'pkill_info', 'pkill_event', 'frag_leaderboard',
  // misc
  'player_pets', 'player_pet_items', 'player_pet_item_affects', 'offline_messages',
];

// default categories for character restore (inventory pre-checked)
export const DEFAULT_RESTORE_CATEGORIES: RestoreCategories = {
  coreData: false,
  inventory: true,
  skills: false,
  progression: false,
  auction: false,
  guild: false,
  pvpHistory: false,
  misc: false,
};

// Restore progress broadcaster (separate from backup progress)
let restoreProgressBroadcaster: ((data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
}) => void) | null = null;

export function setRestoreProgressBroadcaster(fn: typeof restoreProgressBroadcaster) {
  restoreProgressBroadcaster = fn;
}

function broadcastRestoreProgress(data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
}) {
  if (restoreProgressBroadcaster) {
    restoreProgressBroadcaster(data);
  }
}

/**
 * Check if MUD is currently running
 */
export function isMudRunning(): boolean {
  const pidFile = path.join(MUD_BASE, 'cycle_mud.pid');
  return fs.existsSync(pidFile);
}

/**
 * Create a restore operation (async - returns immediately with restore ID)
 */
export async function createRestore(
  request: RestoreRequest,
  accountName: string,
  ipAddress: string
): Promise<{ id: number }> {
  const { backupId, restoreType, accounts, characters, categories } = request;

  // Insert pending restore record
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_restores (backup_id, restore_type, accounts, characters, categories, status, progress, current_step, created_by, ip_address, started_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW())`,
    [
      backupId,
      restoreType,
      accounts && accounts.length > 0 ? JSON.stringify(accounts) : null,
      characters && characters.length > 0 ? JSON.stringify(characters) : null,
      categories ? JSON.stringify(categories) : null,
      accountName,
      ipAddress
    ]
  );

  const restoreId = result.insertId;

  // Start the restore process asynchronously
  runRestore(restoreId, request).catch((error) => {
    logger.error(`Restore ${restoreId} failed:`, error);
  });

  return { id: restoreId };
}

/**
 * Update restore status in database
 */
async function updateRestoreStatus(
  restoreId: number,
  status: string,
  progress: number,
  currentStep: string
): Promise<void> {
  await pool.execute(
    `UPDATE mud_restores SET status = ?, progress = ?, current_step = ? WHERE id = ?`,
    [status, progress, currentStep, restoreId]
  );
}

/**
 * Run the actual restore process
 */
async function runRestore(
  restoreId: number,
  request: RestoreRequest
): Promise<void> {
  const { backupId, restoreType, accounts, characters, categories } = request;

  try {
    await updateRestoreStatus(restoreId, 'in_progress', 5, 'Starting restore...');
    broadcastRestoreProgress({ id: restoreId, progress: 5, currentStep: 'Starting restore...', status: 'in_progress' });

    const backup = await getBackupById(backupId);
    if (!backup || backup.status !== 'completed') {
      throw new Error('Backup not found or not completed');
    }

    const zipPath = path.join(BACKUP_DIR, backup.filename);
    if (!fs.existsSync(zipPath)) {
      throw new Error('Backup file not found');
    }

    if (restoreType === 'full') {
      await runFullRestore(restoreId, zipPath);
    } else if (restoreType === 'account') {
      await runAccountRestore(restoreId, zipPath, accounts || []);
    } else {
      await runCharacterRestore(restoreId, zipPath, characters || [], categories || DEFAULT_RESTORE_CATEGORIES);
    }

    // Mark as completed
    await pool.execute(
      `UPDATE mud_restores SET status = 'completed', progress = 100, current_step = 'Restore complete', completed_at = NOW() WHERE id = ?`,
      [restoreId]
    );
    broadcastRestoreProgress({ id: restoreId, progress: 100, currentStep: 'Restore complete', status: 'completed' });

    logger.info(`Restore ${restoreId} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Restore ${restoreId} failed:`, errorMessage);

    await pool.execute(
      `UPDATE mud_restores SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [errorMessage, restoreId]
    );
    broadcastRestoreProgress({ id: restoreId, progress: 0, currentStep: `Failed: ${errorMessage}`, status: 'failed' });
  }
}

// ============================================================================
// DATABASE RESTORE FUNCTIONS
// ============================================================================

/**
 * Get SQL file from backup ZIP
 */
async function getSqlFileFromBackup(zipPath: string): Promise<{ content: string; lines: string[] } | null> {
  const directory = await unzipper.Open.file(zipPath);
  const sqlFile = directory.files.find(f =>
    f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
  );

  if (!sqlFile) {
    logger.info('No database SQL file found in backup');
    return null;
  }

  logger.info(`Found database file: ${sqlFile.path}`);
  const content = (await sqlFile.buffer()).toString('utf-8');
  return { content, lines: content.split('\n') };
}

/**
 * Extract all INSERT blocks for a given table from SQL content
 * Handles multi-line VALUES
 */
export function extractInsertBlocks(sqlContent: string, tableName: string): string[] {
  const blocks: string[] = [];
  const regex = new RegExp(`INSERT INTO \`${tableName}\` VALUES[\\s\\S]*?;`, 'g');
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

/**
 * Get column names for a table from database
 */
async function getTableColumns(tableName: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME || 'duris_dev', tableName]
  );
  return rows.map(r => r.COLUMN_NAME);
}

/**
 * Count values in a SQL row string like "(1,2,'text',NULL,...)"
 */
function countRowValues(row: string): number {
  let count = 0;
  let inString = false;
  let escapeNext = false;
  let depth = 0;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === "'" && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '(') {
        depth++;
        if (depth === 1) count = 1; // first value starts
      } else if (char === ')') {
        depth--;
      } else if (char === ',' && depth === 1) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Execute SQL statements via mysql command
 */
async function executeSqlStatements(statements: string[], label: string): Promise<void> {
  if (statements.length <= 2) {
    logger.info(`No matching tables found for ${label}`);
    return;
  }

  const tempSqlPath = path.join(os.tmpdir(), `restore-${label}-${Date.now()}.sql`);
  await fs.promises.writeFile(tempSqlPath, statements.join('\n'));

  try {
    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbUser = process.env.DB_USER || 'duris';
    const dbPassword = process.env.DB_PASSWORD || 'duris';
    const dbName = process.env.DB_NAME || 'duris_dev';

    await execAsync(
      `mysql -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} < "${tempSqlPath}"`
    );
    logger.info(`${label} restore completed`);
  } finally {
    await fs.promises.unlink(tempSqlPath).catch(() => {});
  }
}

/**
 * Restore database for full restore - all MUD tables
 */
async function restoreFullDatabase(zipPath: string): Promise<void> {
  const sqlData = await getSqlFileFromBackup(zipPath);
  if (!sqlData) return;

  const filteredStatements: string[] = ['SET FOREIGN_KEY_CHECKS=0;'];

  for (const tableName of ALL_RESTORE_TABLES) {
    const insertBlocks = extractInsertBlocks(sqlData.content, tableName);
    for (const block of insertBlocks) {
      const rows = parseMultiValueInsert(block.replace(/^INSERT INTO `[^`]+` VALUES\s*/i, '').replace(/;$/, ''));
      if (rows.length > 0) {
        // handle schema changes - use explicit column names matching backup value count
        const backupColCount = countRowValues(rows[0]);
        const tableColumns = await getTableColumns(tableName);
        if (backupColCount > 0 && backupColCount < tableColumns.length) {
          const columnsToUse = tableColumns.slice(0, backupColCount);
          const columnList = columnsToUse.map(c => `\`${c}\``).join(',');
          filteredStatements.push(`REPLACE INTO \`${tableName}\` (${columnList}) VALUES ${rows.join(',')};`);
        } else {
          filteredStatements.push(`REPLACE INTO \`${tableName}\` VALUES ${rows.join(',')};`);
        }
      }
    }
  }

  filteredStatements.push('SET FOREIGN_KEY_CHECKS=1;');
  await executeSqlStatements(filteredStatements, 'full');
}

/**
 * Restore database for account restore - all data for accounts and their characters
 */
async function restoreAccountDatabase(zipPath: string, accountNames: string[]): Promise<void> {
  const sqlData = await getSqlFileFromBackup(zipPath);
  if (!sqlData) return;

  const accountSet = new Set(accountNames.map(a => a.toLowerCase()));
  const characterPids = new Set<number>();

  // first pass: find all pids for characters belonging to selected accounts
  // format: (id,'account_name',pid,'char_name',...)
  const accountCharsBlocks = extractInsertBlocks(sqlData.content, 'account_characters');
  for (const block of accountCharsBlocks) {
    const rowRegex = /\(\d+,'([^']+)',(\d+),'[^']+'/g;
    let match;
    while ((match = rowRegex.exec(block)) !== null) {
      if (accountSet.has(match[1].toLowerCase())) {
        characterPids.add(parseInt(match[2]));
      }
    }
  }

  logger.info(`Found ${characterPids.size} characters for accounts: ${accountNames.join(', ')}`);

  const filteredStatements: string[] = ['SET FOREIGN_KEY_CHECKS=0;'];

  for (const tableName of ALL_RESTORE_TABLES) {
    const insertBlocks = extractInsertBlocks(sqlData.content, tableName);

    for (const block of insertBlocks) {
      const rows = parseMultiValueInsert(block.replace(/^INSERT INTO `[^`]+` VALUES\s*/i, '').replace(/;$/, ''));
      const filteredRows: string[] = [];

      for (const row of rows) {
        let shouldInclude = false;

        // tables with (id, pid, ...) format - pid is second column
        const pidInSecondCol = [
          'player_items', 'player_skills', 'player_spellbooks', 'player_affects',
          'player_timers', 'player_forged_items', 'player_granted_cmds', 'player_intros',
          'player_languages', 'player_recipes', 'player_shapechanges', 'player_undead_slots',
          'player_witnesses'
        ];

        if (tableName === 'account_characters' || tableName === 'account_banks') {
          // format: (id,'account_name',...) - match by account_name (second field)
          const accountMatch = row.match(/^\(\d+,'([^']+)'/);
          if (accountMatch && accountSet.has(accountMatch[1].toLowerCase())) {
            shouldInclude = true;
          }
        } else if (pidInSecondCol.includes(tableName)) {
          // (id, pid, ...) - pid is second column
          const pidMatch = row.match(/^\(\d+,(\d+),/);
          if (pidMatch && characterPids.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          }
        } else {
          // match by pid (first column)
          const pidMatch = row.match(/^\((\d+)/);
          if (pidMatch && characterPids.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          }
        }

        if (shouldInclude) {
          filteredRows.push(row);
        }
      }

      if (filteredRows.length > 0) {
        // handle schema changes - use explicit column names matching backup value count
        const backupColCount = countRowValues(filteredRows[0]);
        const tableColumns = await getTableColumns(tableName);
        if (backupColCount > 0 && backupColCount < tableColumns.length) {
          // backup has fewer columns than current table - use explicit column list
          const columnsToUse = tableColumns.slice(0, backupColCount);
          const columnList = columnsToUse.map(c => `\`${c}\``).join(',');
          filteredStatements.push(`REPLACE INTO \`${tableName}\` (${columnList}) VALUES ${filteredRows.join(',')};`);
        } else {
          filteredStatements.push(`REPLACE INTO \`${tableName}\` VALUES ${filteredRows.join(',')};`);
        }
      }
    }
  }

  filteredStatements.push('SET FOREIGN_KEY_CHECKS=1;');
  await executeSqlStatements(filteredStatements, 'account');
}

/**
 * Restore database for character restore - selected characters with category filtering
 */
async function restoreCharacterDatabase(
  zipPath: string,
  characters: { pid: number; name: string }[],
  categories: RestoreCategories
): Promise<void> {
  const sqlData = await getSqlFileFromBackup(zipPath);
  if (!sqlData) return;

  // build set of pids and names
  const pidSet = new Set(characters.map(c => c.pid));
  const nameSet = new Set(characters.map(c => c.name.toLowerCase()));

  // build list of tables to restore based on selected categories
  const tablesToRestore = new Set<string>();
  for (const [category, enabled] of Object.entries(categories)) {
    if (enabled && category in CATEGORY_TABLES) {
      for (const table of CATEGORY_TABLES[category as keyof RestoreCategories]) {
        tablesToRestore.add(table);
      }
    }
  }

  if (tablesToRestore.size === 0) {
    logger.info('No categories selected for restore');
    return;
  }

  logger.info(`Restoring ${characters.length} characters, tables: ${Array.from(tablesToRestore).join(', ')}`);
  logger.info(`Looking for pids: ${Array.from(pidSet).join(', ')}, names: ${Array.from(nameSet).join(', ')}`);

  const filteredStatements: string[] = ['SET FOREIGN_KEY_CHECKS=0;'];

  for (const tableName of tablesToRestore) {
    const insertBlocks = extractInsertBlocks(sqlData.content, tableName);
    logger.info(`Table ${tableName}: found ${insertBlocks.length} insert blocks`);

    for (const block of insertBlocks) {
      const valuesStr = block.replace(/^INSERT INTO `[^`]+` VALUES\s*/i, '').replace(/;$/, '');
      const rows = parseMultiValueInsert(valuesStr);
      const filteredRows: string[] = [];

      for (const row of rows) {
        let shouldInclude = false;

        if (tableName === 'player_data') {
          // match by pid (first column) or name (second column)
          const pidMatch = row.match(/^\((\d+)/);
          const nameMatch = row.match(/^\(\d+,'([^']+)'/);
          if (pidMatch && pidSet.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          } else if (nameMatch && nameSet.has(nameMatch[1].toLowerCase())) {
            shouldInclude = true;
          }
        } else if (tableName === 'frag_leaderboard') {
          // has pid and char_name
          const pidMatch = row.match(/^\(\d+,(\d+),/);
          const nameMatch = row.match(/'([^']+)'/);
          if (pidMatch && pidSet.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          } else if (nameMatch && nameSet.has(nameMatch[1].toLowerCase())) {
            shouldInclude = true;
          }
        } else if (tableName === 'guild_members') {
          // has player_name and player_pid
          const nameMatch = row.match(/'([^']+)'/);
          if (nameMatch && nameSet.has(nameMatch[1].toLowerCase())) {
            shouldInclude = true;
          }
        } else if (tableName === 'player_items') {
          // player_items: (id, pid, ...) - pid is second column
          const pidMatch = row.match(/^\(\d+,(\d+),/);
          if (pidMatch && pidSet.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          }
        } else if (tableName === 'player_item_affects') {
          // player_item_affects uses item_id, not pid
          // we need to match against item_ids from player_items for our pids
          // for now, skip this table in character restore - it's complex
          // the items themselves will be restored, affects can be regenerated
          shouldInclude = false;
        } else if (tableName === 'offline_messages') {
          // format: (id, date, pid, message) - pid is third column
          const pidMatch = row.match(/,(\d+),'/);
          if (pidMatch && pidSet.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          }
        } else {
          // most tables have pid as first column
          const pidMatch = row.match(/^\((\d+)/);
          if (pidMatch && pidSet.has(parseInt(pidMatch[1]))) {
            shouldInclude = true;
          }
        }

        if (shouldInclude) {
          filteredRows.push(row);
        }
      }

      logger.info(`Table ${tableName}: ${rows.length} rows parsed, ${filteredRows.length} matched`);
      if (filteredRows.length > 0) {
        // handle schema changes - use explicit column names matching backup value count
        const backupColCount = countRowValues(filteredRows[0]);
        const tableColumns = await getTableColumns(tableName);
        if (backupColCount > 0 && backupColCount < tableColumns.length) {
          const columnsToUse = tableColumns.slice(0, backupColCount);
          const columnList = columnsToUse.map(c => `\`${c}\``).join(',');
          filteredStatements.push(`REPLACE INTO \`${tableName}\` (${columnList}) VALUES ${filteredRows.join(',')};`);
        } else {
          filteredStatements.push(`REPLACE INTO \`${tableName}\` VALUES ${filteredRows.join(',')};`);
        }
      }
    }
  }

  filteredStatements.push('SET FOREIGN_KEY_CHECKS=1;');
  logger.info(`Total statements to execute: ${filteredStatements.length}`);
  await executeSqlStatements(filteredStatements, 'character');
}


/**
 * Parse multi-value INSERT VALUES section into individual row strings
 * Handles nested parentheses and quoted strings with commas
 */
export function parseMultiValueInsert(valuesStr: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let currentRow = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (escapeNext) {
      currentRow += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      currentRow += char;
      escapeNext = true;
      continue;
    }

    if (char === "'" && !escapeNext) {
      inString = !inString;
      currentRow += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth++;
        if (depth === 1) {
          currentRow = '(';
          continue;
        }
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          currentRow += ')';
          rows.push(currentRow);
          currentRow = '';
          continue;
        }
      } else if (char === ',' && depth === 0) {
        continue; // Skip comma between rows
      }
    }

    if (depth > 0) {
      currentRow += char;
    }
  }

  return rows;
}

/**
 * Run a full restore (database only)
 */
async function runFullRestore(restoreId: number, zipPath: string): Promise<void> {
  await updateRestoreStatus(restoreId, 'in_progress', 10, 'Restoring database...');
  broadcastRestoreProgress({ id: restoreId, progress: 10, currentStep: 'Restoring database...', status: 'in_progress' });

  await restoreFullDatabase(zipPath);

  await updateRestoreStatus(restoreId, 'in_progress', 95, 'Finalizing restore...');
  broadcastRestoreProgress({ id: restoreId, progress: 95, currentStep: 'Finalizing restore...', status: 'in_progress' });
}

/**
 * Run an account restore (all characters under account)
 */
async function runAccountRestore(
  restoreId: number,
  zipPath: string,
  accounts: string[]
): Promise<void> {
  await updateRestoreStatus(restoreId, 'in_progress', 10, `Restoring ${accounts.length} account(s)...`);
  broadcastRestoreProgress({ id: restoreId, progress: 10, currentStep: `Restoring ${accounts.length} account(s)...`, status: 'in_progress' });

  await restoreAccountDatabase(zipPath, accounts);

  await updateRestoreStatus(restoreId, 'in_progress', 95, 'Finalizing restore...');
  broadcastRestoreProgress({ id: restoreId, progress: 95, currentStep: 'Finalizing restore...', status: 'in_progress' });
}

/**
 * Run a character restore (selected characters with category filtering)
 */
async function runCharacterRestore(
  restoreId: number,
  zipPath: string,
  characters: { pid: number; name: string }[],
  categories: RestoreCategories
): Promise<void> {
  const enabledCategories = Object.entries(categories)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  await updateRestoreStatus(restoreId, 'in_progress', 10, `Restoring ${characters.length} character(s)...`);
  broadcastRestoreProgress({ id: restoreId, progress: 10, currentStep: `Restoring ${characters.length} character(s)...`, status: 'in_progress' });

  logger.info(`Character restore: ${characters.map(c => c.name).join(', ')}, categories: ${enabledCategories.join(', ')}`);

  await restoreCharacterDatabase(zipPath, characters, categories);

  await updateRestoreStatus(restoreId, 'in_progress', 95, 'Finalizing restore...');
  broadcastRestoreProgress({ id: restoreId, progress: 95, currentStep: 'Finalizing restore...', status: 'in_progress' });
}

// ============================================================================
// UPLOAD BACKUP FUNCTIONS
// ============================================================================

export interface UploadedBackupInfo {
  tempPath: string;
  contents: BackupContents;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validate and get contents of an uploaded backup file
 * Returns the contents if valid, or error message if not
 */
export async function validateUploadedBackup(filePath: string): Promise<UploadedBackupInfo> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        tempPath: filePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'File not found',
      };
    }

    const directory = await unzipper.Open.file(filePath);

    // check for SQL file
    const sqlFile = directory.files.find(f =>
      f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
    );

    if (!sqlFile) {
      return {
        tempPath: filePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'Invalid backup: no database SQL file found',
      };
    }

    // parse SQL to get accounts and characters
    const accounts = new Set<string>();
    const characters: { pid: number; name: string }[] = [];

    const content = (await sqlFile.buffer()).toString('utf-8');

    // parse account_characters - format: (id,'account_name',pid,'char_name',...)
    const accountCharsMatch = content.match(/INSERT INTO `account_characters` VALUES[\s\S]*?;/g);
    if (accountCharsMatch) {
      for (const insertBlock of accountCharsMatch) {
        const rowRegex = /\(\d+,'([^']+)',\d+,'[^']+'/g;
        let match;
        while ((match = rowRegex.exec(insertBlock)) !== null) {
          accounts.add(match[1]);
        }
      }
    }

    // parse player_data - format: (pid,'name',...)
    const playerDataMatch = content.match(/INSERT INTO `player_data` VALUES[\s\S]*?;/g);
    if (playerDataMatch) {
      for (const insertBlock of playerDataMatch) {
        const rowRegex = /\((\d+),'([^']+)'/g;
        let match;
        while ((match = rowRegex.exec(insertBlock)) !== null) {
          const pid = parseInt(match[1]);
          const name = match[2];
          if (!characters.some(c => c.pid === pid)) {
            characters.push({ pid, name });
          }
        }
      }
    }

    return {
      tempPath: filePath,
      contents: {
        accounts: Array.from(accounts).sort(),
        characters: characters.sort((a, b) => a.name.localeCompare(b.name)),
      },
      isValid: true,
    };
  } catch (error) {
    return {
      tempPath: filePath,
      contents: { accounts: [], characters: [] },
      isValid: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to read backup file',
    };
  }
}

/**
 * Create a restore from an uploaded backup file
 */
export async function createRestoreFromUpload(
  filePath: string,
  request: Omit<RestoreRequest, 'backupId'>,
  accountName: string,
  ipAddress: string
): Promise<{ id: number }> {
  const { restoreType, accounts, characters, categories } = request;

  // Insert pending restore record with backup_id = 0 (uploaded file)
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_restores (backup_id, restore_type, accounts, characters, categories, status, progress, current_step, created_by, ip_address, started_at)
     VALUES (0, ?, ?, ?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW())`,
    [
      restoreType,
      accounts && accounts.length > 0 ? JSON.stringify(accounts) : null,
      characters && characters.length > 0 ? JSON.stringify(characters) : null,
      categories ? JSON.stringify(categories) : null,
      accountName,
      ipAddress
    ]
  );

  const restoreId = result.insertId;

  // Start the restore process asynchronously
  runRestoreFromUpload(restoreId, filePath, request).catch((error) => {
    const msg = error instanceof Error ? error.stack || error.message : String(error);
    logger.error(`Restore ${restoreId} from upload failed: ${msg}`);
  });

  return { id: restoreId };
}

/**
 * Run restore from an uploaded file
 */
async function runRestoreFromUpload(
  restoreId: number,
  filePath: string,
  request: Omit<RestoreRequest, 'backupId'>
): Promise<void> {
  const { restoreType, accounts, characters, categories } = request;

  try {
    await updateRestoreStatus(restoreId, 'in_progress', 5, 'Starting restore from uploaded file...');
    broadcastRestoreProgress({ id: restoreId, progress: 5, currentStep: 'Starting restore from uploaded file...', status: 'in_progress' });

    if (!fs.existsSync(filePath)) {
      throw new Error('Uploaded backup file not found');
    }

    if (restoreType === 'full') {
      await runFullRestore(restoreId, filePath);
    } else if (restoreType === 'account') {
      await runAccountRestore(restoreId, filePath, accounts || []);
    } else {
      await runCharacterRestore(restoreId, filePath, characters || [], categories || DEFAULT_RESTORE_CATEGORIES);
    }

    // Mark as completed
    await pool.execute(
      `UPDATE mud_restores SET status = 'completed', progress = 100, current_step = 'Restore complete', completed_at = NOW() WHERE id = ?`,
      [restoreId]
    );
    broadcastRestoreProgress({ id: restoreId, progress: 100, currentStep: 'Restore complete', status: 'completed' });

    logger.info(`Restore ${restoreId} from upload completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : String(error);
    logger.error(`Restore ${restoreId} from upload failed: ${errorMessage}`);
    logger.error(`Stack trace: ${errorStack}`);

    await pool.execute(
      `UPDATE mud_restores SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [errorMessage, restoreId]
    );
    broadcastRestoreProgress({ id: restoreId, progress: 0, currentStep: `Failed: ${errorMessage}`, status: 'failed' });
  } finally {
    // Cleanup uploaded file after restore completes (success or failure)
    await fs.promises.unlink(filePath).catch(() => {});
    logger.info(`Cleaned up uploaded backup file: ${filePath}`);
  }
}

/**
 * Delete an uploaded backup file (for cleanup on cancel)
 */
export async function deleteUploadedBackup(filePath: string): Promise<void> {
  if (filePath && fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

/**
 * Get a restore by ID
 */
export async function getRestoreById(id: number): Promise<RestoreInfo | null> {
  const [rows] = await pool.execute<RestoreRow[]>(
    `SELECT * FROM mud_restores WHERE id = ?`,
    [id]
  );
  return rows.length > 0 ? mapRowToRestoreInfo(rows[0]) : null;
}

/**
 * Get list of all restores
 */
export async function getRestoreList(): Promise<RestoreInfo[]> {
  const [rows] = await pool.execute<RestoreRow[]>(
    `SELECT * FROM mud_restores ORDER BY started_at DESC`
  );
  return rows.map(mapRowToRestoreInfo);
}

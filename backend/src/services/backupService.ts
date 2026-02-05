import { pool } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { exec } from 'child_process';
import { promisify } from 'util';
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
  characters: string[];
}

export interface RestoreTarget {
  type: 'account' | 'character';
  name: string;
}

export interface RestoreInfo {
  id: number;
  backupId: number;
  restoreType: 'full' | 'selective';
  targets: RestoreTarget[] | null;
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
  targets: string | null;
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
    targets: row.targets ? JSON.parse(row.targets) : null,
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
 * Create the zip archive with database dump and MUD folders
 * Uses system zip command instead of archiver library for reliability
 */
async function createZipArchive(
  backupId: number,
  filename: string,
  zipPath: string,
  sqlPath: string
): Promise<void> {
  const tempDir = path.join(BACKUP_DIR, `temp_staging_${backupId}`);

  try {
    // create temp staging directory with database subfolder
    const dbDir = path.join(tempDir, 'database');
    await fs.promises.mkdir(dbDir, { recursive: true });

    // copy sql file to staging
    const dbName = process.env.DB_NAME || 'duris_dev';
    await fs.promises.copyFile(sqlPath, path.join(dbDir, `${dbName}.sql`));

    await updateBackupStatus(backupId, 'in_progress', 50, 'Zipping database...');
    broadcastProgress({ id: backupId, progress: 50, currentStep: 'Zipping database...', status: 'in_progress', filename });

    // build zip command - start with database folder
    const zipParts: string[] = [];
    zipParts.push(`cd "${tempDir}" && zip -r "${zipPath}" database`);

    // add Accounts directory if exists
    const accountsPath = path.join(MUD_BASE, 'Accounts');
    if (fs.existsSync(accountsPath)) {
      await updateBackupStatus(backupId, 'in_progress', 60, 'Zipping Accounts...');
      broadcastProgress({ id: backupId, progress: 60, currentStep: 'Zipping Accounts...', status: 'in_progress', filename });
      zipParts.push(`cd "${MUD_BASE}" && zip -r "${zipPath}" Accounts`);
    }

    // add Players directory if exists
    const playersPath = path.join(MUD_BASE, 'Players');
    if (fs.existsSync(playersPath)) {
      await updateBackupStatus(backupId, 'in_progress', 75, 'Zipping Players...');
      broadcastProgress({ id: backupId, progress: 75, currentStep: 'Zipping Players...', status: 'in_progress', filename });
      zipParts.push(`cd "${MUD_BASE}" && zip -r "${zipPath}" Players`);
    }

    // execute zip commands
    for (const cmd of zipParts) {
      await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    }

    await updateBackupStatus(backupId, 'in_progress', 95, 'Finalizing...');
    broadcastProgress({ id: backupId, progress: 95, currentStep: 'Finalizing...', status: 'in_progress', filename });

  } finally {
    // cleanup temp staging directory
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
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
 * List accounts and characters contained in a backup
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

  const accounts: string[] = [];
  const characters: string[] = [];

  const directory = await unzipper.Open.file(filePath);

  for (const file of directory.files) {
    // Match Accounts/{letter}/{name} pattern (not subdirs or .backup files)
    const accountMatch = file.path.match(/^Accounts\/([a-z])\/([^\/\.]+)$/);
    if (accountMatch) {
      accounts.push(accountMatch[2]);
    }

    // Match Players/{letter}/{name} pattern (not subdirs, .old, .preconvert, etc.)
    const playerMatch = file.path.match(/^Players\/([a-z])\/([^\/\.]+)$/);
    if (playerMatch) {
      characters.push(playerMatch[2]);
    }
  }

  return {
    accounts: accounts.sort(),
    characters: characters.sort(),
  };
}

// ============================================================================
// RESTORE FUNCTIONS
// ============================================================================

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
  backupId: number,
  restoreType: 'full' | 'selective',
  targets: RestoreTarget[] | null,
  accountName: string,
  ipAddress: string
): Promise<{ id: number }> {
  // Insert pending restore record
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_restores (backup_id, restore_type, targets, status, progress, current_step, created_by, ip_address, started_at)
     VALUES (?, ?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW())`,
    [backupId, restoreType, targets ? JSON.stringify(targets) : null, accountName, ipAddress]
  );

  const restoreId = result.insertId;

  // Start the restore process asynchronously
  runRestore(restoreId, backupId, restoreType, targets).catch((error) => {
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
  backupId: number,
  restoreType: 'full' | 'selective',
  targets: RestoreTarget[] | null
): Promise<void> {
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
    } else {
      await runSelectiveRestore(restoreId, zipPath, targets || []);
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

// Tables allowed to be restored (MUD game data only)
const ALLOWED_RESTORE_TABLES = [
  'players_core',
  'pkill_info',
  'pkill_event',
  'frag_leaderboard',
];

/**
 * Restore database for full restore - only MUD tables
 * Filters SQL to only include allowed tables, uses REPLACE INTO
 */
async function restoreFullDatabase(zipPath: string): Promise<void> {
  const directory = await unzipper.Open.file(zipPath);
  // Look for SQL file in database/ directory or at root
  const sqlFile = directory.files.find(f =>
    f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
  );

  if (!sqlFile) {
    logger.info('No database SQL file found in backup, skipping database restore');
    return;
  }

  logger.info(`Found database file: ${sqlFile.path}`);

  const content = (await sqlFile.buffer()).toString('utf-8');
  const filteredStatements: string[] = ['SET FOREIGN_KEY_CHECKS=0;'];

  // Parse line by line
  const lines = content.split('\n');
  for (const line of lines) {
    // Only process INSERT statements for allowed tables
    if (line.startsWith('INSERT INTO')) {
      const tableMatch = line.match(/INSERT INTO `([^`]+)`/);
      if (tableMatch && ALLOWED_RESTORE_TABLES.includes(tableMatch[1])) {
        // Change INSERT to REPLACE to handle existing rows
        const replaceLine = line.replace(/^INSERT INTO/, 'REPLACE INTO');
        filteredStatements.push(replaceLine);
      }
    }
  }

  filteredStatements.push('SET FOREIGN_KEY_CHECKS=1;');

  if (filteredStatements.length <= 2) {
    logger.info('No matching MUD tables found in database.sql');
    return;
  }

  // Write filtered SQL and execute
  const tempSqlPath = path.join(os.tmpdir(), `restore-full-${Date.now()}.sql`);
  await fs.promises.writeFile(tempSqlPath, filteredStatements.join('\n'));

  try {
    const dbHost = process.env.DURIS_DB_HOST || '127.0.0.1';
    const dbUser = process.env.DURIS_DB_USER || 'duris';
    const dbPassword = process.env.DURIS_DB_PASSWORD || 'duris';
    const dbName = process.env.DURIS_DB_NAME || 'duris_dev';

    await execAsync(
      `mysql -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} < "${tempSqlPath}"`
    );
    logger.info('Full database restore completed');
  } finally {
    await fs.promises.unlink(tempSqlPath).catch(() => {});
  }
}

/**
 * Restore database for selective restore - only rows matching selected characters
 * Filters SQL to only include rows for selected characters, uses REPLACE INTO
 */
async function restoreSelectiveDatabase(
  zipPath: string,
  targets: RestoreTarget[]
): Promise<void> {
  const directory = await unzipper.Open.file(zipPath);
  // Look for SQL file in database/ directory or at root
  const sqlFile = directory.files.find(f =>
    f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
  );

  if (!sqlFile) {
    logger.info('No database SQL file found in backup, skipping database restore');
    return;
  }

  logger.info(`Found database file: ${sqlFile.path}`);

  const content = (await sqlFile.buffer()).toString('utf-8');

  // Get character names from targets
  const characterNames = targets
    .filter(t => t.type === 'character')
    .map(t => t.name.toLowerCase());

  if (characterNames.length === 0) {
    logger.info('No characters selected for restore, skipping database restore');
    return;
  }

  // First pass: extract PIDs for selected characters from players_core
  const pidMap = new Map<string, number>();
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.includes('`players_core`') && line.startsWith('INSERT INTO')) {
      // Parse multi-value INSERT: INSERT INTO `players_core` VALUES (pid,'name',...),(pid,'name',...)
      const valuesMatch = line.match(/VALUES\s*(.+)$/i);
      if (valuesMatch) {
        // Split by '),(' to get individual rows
        const valuesStr = valuesMatch[1];
        // Match each (pid,'name',...) group
        const rowRegex = /\((\d+),'([^']+)'/g;
        let match;
        while ((match = rowRegex.exec(valuesStr)) !== null) {
          const pid = parseInt(match[1]);
          const name = match[2].toLowerCase();
          if (characterNames.includes(name)) {
            pidMap.set(name, pid);
          }
        }
      }
    }
  }

  const selectedPids = Array.from(pidMap.values());
  logger.info(`Found ${selectedPids.length} PIDs for selected characters:`, pidMap);

  // Second pass: filter rows for selected characters
  const filteredStatements: string[] = ['SET FOREIGN_KEY_CHECKS=0;'];

  for (const line of lines) {
    if (!line.startsWith('INSERT INTO')) continue;

    const tableMatch = line.match(/INSERT INTO `([^`]+)`/);
    if (!tableMatch || !ALLOWED_RESTORE_TABLES.includes(tableMatch[1])) continue;

    const tableName = tableMatch[1];
    const valuesMatch = line.match(/VALUES\s*(.+)$/i);
    if (!valuesMatch) continue;

    // Parse the VALUES section and filter rows
    const filteredRows: string[] = [];
    const valuesStr = valuesMatch[1];

    // Split multi-value INSERT into individual rows
    // This is complex because values can contain commas and parentheses in strings
    const rows = parseMultiValueInsert(valuesStr);

    for (const row of rows) {
      let shouldInclude = false;

      if (tableName === 'players_core') {
        // Match by name (second column)
        const nameMatch = row.match(/^\((\d+),'([^']+)'/);
        if (nameMatch && characterNames.includes(nameMatch[2].toLowerCase())) {
          shouldInclude = true;
        }
      } else if (tableName === 'pkill_info') {
        // Match by pid (third column after id and event_id)
        const pidMatch = row.match(/^\(\d+,\d+,(\d+),/);
        if (pidMatch && selectedPids.includes(parseInt(pidMatch[1]))) {
          shouldInclude = true;
        }
      } else if (tableName === 'pkill_event') {
        // For pkill_event, include all events (they're linked to pkill_info)
        // A more precise approach would be to pre-scan pkill_info for event_ids
        shouldInclude = true;
      } else if (tableName === 'frag_leaderboard') {
        // Match by pid or char_name
        const pidMatch = row.match(/^\(\d+,(\d+),/);
        const nameMatch = row.match(/'([^']+)'/);
        if (pidMatch && selectedPids.includes(parseInt(pidMatch[1]))) {
          shouldInclude = true;
        } else if (nameMatch && characterNames.includes(nameMatch[1].toLowerCase())) {
          shouldInclude = true;
        }
      }

      if (shouldInclude) {
        filteredRows.push(row);
      }
    }

    if (filteredRows.length > 0) {
      const columnsPart = line.match(/INSERT INTO `[^`]+`\s*(\([^)]+\))?\s*VALUES/i);
      const columnsStr = columnsPart && columnsPart[1] ? columnsPart[1] + ' ' : '';
      const stmt = `REPLACE INTO \`${tableName}\` ${columnsStr}VALUES ${filteredRows.join(',')};`;
      filteredStatements.push(stmt);
    }
  }

  filteredStatements.push('SET FOREIGN_KEY_CHECKS=1;');

  if (filteredStatements.length <= 2) {
    logger.info('No matching database rows for selected characters');
    return;
  }

  // Write filtered SQL and execute
  const tempSqlPath = path.join(os.tmpdir(), `restore-selective-${Date.now()}.sql`);
  await fs.promises.writeFile(tempSqlPath, filteredStatements.join('\n'));

  try {
    const dbHost = process.env.DURIS_DB_HOST || '127.0.0.1';
    const dbUser = process.env.DURIS_DB_USER || 'duris';
    const dbPassword = process.env.DURIS_DB_PASSWORD || 'duris';
    const dbName = process.env.DURIS_DB_NAME || 'duris_dev';

    await execAsync(
      `mysql -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} < "${tempSqlPath}"`
    );
    logger.info('Selective database restore completed');
  } finally {
    await fs.promises.unlink(tempSqlPath).catch(() => {});
  }
}

/**
 * Parse multi-value INSERT VALUES section into individual row strings
 * Handles nested parentheses and quoted strings with commas
 */
function parseMultiValueInsert(valuesStr: string): string[] {
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
 * Run a full restore (all files + database)
 */
async function runFullRestore(restoreId: number, zipPath: string): Promise<void> {
  const timestamp = Date.now();

  // Step 1: Restore database
  await updateRestoreStatus(restoreId, 'in_progress', 5, 'Restoring database...');
  broadcastRestoreProgress({ id: restoreId, progress: 5, currentStep: 'Restoring database...', status: 'in_progress' });

  await restoreFullDatabase(zipPath);

  // Step 2: Extract backup files
  await updateRestoreStatus(restoreId, 'in_progress', 20, 'Extracting backup...');
  broadcastRestoreProgress({ id: restoreId, progress: 20, currentStep: 'Extracting backup...', status: 'in_progress' });

  const directory = await unzipper.Open.file(zipPath);

  // Backup current files before overwriting
  await updateRestoreStatus(restoreId, 'in_progress', 20, 'Backing up current files...');
  broadcastRestoreProgress({ id: restoreId, progress: 20, currentStep: 'Backing up current files...', status: 'in_progress' });

  // Extract and restore files
  let progress = 30;
  const totalFiles = directory.files.length;
  let processedFiles = 0;

  for (const file of directory.files) {
    if (file.type === 'Directory') continue;

    // Handle Accounts and Players directories
    if (file.path.startsWith('Accounts/') || file.path.startsWith('Players/')) {
      const targetPath = path.join(MUD_BASE, file.path);
      const targetDir = path.dirname(targetPath);

      // Backup existing file if it exists
      if (fs.existsSync(targetPath)) {
        const backupPath = `${targetPath}.pre-restore.${timestamp}`;
        await fs.promises.rename(targetPath, backupPath);
      }

      // Ensure directory exists
      await fs.promises.mkdir(targetDir, { recursive: true });

      // Extract file
      const content = await file.buffer();
      await fs.promises.writeFile(targetPath, content);
    }

    processedFiles++;
    const newProgress = Math.min(90, 30 + Math.floor((processedFiles / totalFiles) * 60));
    if (newProgress > progress) {
      progress = newProgress;
      await updateRestoreStatus(restoreId, 'in_progress', progress, `Restoring files... (${processedFiles}/${totalFiles})`);
      broadcastRestoreProgress({ id: restoreId, progress, currentStep: `Restoring files... (${processedFiles}/${totalFiles})`, status: 'in_progress' });
    }
  }

  await updateRestoreStatus(restoreId, 'in_progress', 95, 'Finalizing restore...');
  broadcastRestoreProgress({ id: restoreId, progress: 95, currentStep: 'Finalizing restore...', status: 'in_progress' });
}

/**
 * Run a selective restore (specific accounts/characters)
 */
async function runSelectiveRestore(
  restoreId: number,
  zipPath: string,
  targets: RestoreTarget[]
): Promise<void> {
  const timestamp = Date.now();

  await updateRestoreStatus(restoreId, 'in_progress', 10, 'Opening backup...');
  broadcastRestoreProgress({ id: restoreId, progress: 10, currentStep: 'Opening backup...', status: 'in_progress' });

  const directory = await unzipper.Open.file(zipPath);

  // Build list of paths to restore
  const pathsToRestore: string[] = [];
  for (const target of targets) {
    const firstLetter = target.name.charAt(0).toLowerCase();
    if (target.type === 'account') {
      pathsToRestore.push(`Accounts/${firstLetter}/${target.name}`);
    } else {
      pathsToRestore.push(`Players/${firstLetter}/${target.name}`);
    }
  }

  await updateRestoreStatus(restoreId, 'in_progress', 20, `Restoring ${targets.length} items...`);
  broadcastRestoreProgress({ id: restoreId, progress: 20, currentStep: `Restoring ${targets.length} items...`, status: 'in_progress' });

  let progress = 20;
  let restored = 0;

  for (const file of directory.files) {
    if (file.type === 'Directory') continue;

    // Check if this file matches any of our targets
    const shouldRestore = pathsToRestore.some(p => file.path === p || file.path.startsWith(p + '/'));

    if (shouldRestore) {
      const targetPath = path.join(MUD_BASE, file.path);
      const targetDir = path.dirname(targetPath);

      // Backup existing file if it exists
      if (fs.existsSync(targetPath)) {
        const backupPath = `${targetPath}.pre-restore.${timestamp}`;
        await fs.promises.rename(targetPath, backupPath);
      }

      // Ensure directory exists
      await fs.promises.mkdir(targetDir, { recursive: true });

      // Extract file
      const content = await file.buffer();
      await fs.promises.writeFile(targetPath, content);

      restored++;
      const newProgress = Math.min(90, 20 + Math.floor((restored / pathsToRestore.length) * 70));
      if (newProgress > progress) {
        progress = newProgress;
        await updateRestoreStatus(restoreId, 'in_progress', progress, `Restored ${restored}/${pathsToRestore.length} items`);
        broadcastRestoreProgress({ id: restoreId, progress, currentStep: `Restored ${restored}/${pathsToRestore.length} items`, status: 'in_progress' });
      }
    }
  }

  // Restore database rows for selected characters
  await updateRestoreStatus(restoreId, 'in_progress', 92, 'Restoring database records...');
  broadcastRestoreProgress({ id: restoreId, progress: 92, currentStep: 'Restoring database records...', status: 'in_progress' });

  await restoreSelectiveDatabase(zipPath, targets);

  await updateRestoreStatus(restoreId, 'in_progress', 95, 'Finalizing...');
  broadcastRestoreProgress({ id: restoreId, progress: 95, currentStep: 'Finalizing...', status: 'in_progress' });
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

    // Check for required structure
    let hasAccounts = false;
    let hasPlayers = false;

    const accounts: string[] = [];
    const characters: string[] = [];

    for (const file of directory.files) {
      // Check for Accounts directory
      if (file.path.startsWith('Accounts/')) {
        hasAccounts = true;
        // Match Accounts/{letter}/{name} pattern
        const accountMatch = file.path.match(/^Accounts\/([a-z])\/([^\/\.]+)$/);
        if (accountMatch) {
          accounts.push(accountMatch[2]);
        }
      }

      // Check for Players directory
      if (file.path.startsWith('Players/')) {
        hasPlayers = true;
        // Match Players/{letter}/{name} pattern
        const playerMatch = file.path.match(/^Players\/([a-z])\/([^\/\.]+)$/);
        if (playerMatch) {
          characters.push(playerMatch[2]);
        }
      }

    }

    // Must have at least Accounts or Players directory
    if (!hasAccounts && !hasPlayers) {
      return {
        tempPath: filePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'Invalid backup: missing Accounts and Players directories',
      };
    }

    return {
      tempPath: filePath,
      contents: {
        accounts: accounts.sort(),
        characters: characters.sort(),
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
  restoreType: 'full' | 'selective',
  targets: RestoreTarget[] | null,
  accountName: string,
  ipAddress: string
): Promise<{ id: number }> {
  // Insert pending restore record with backup_id = 0 (uploaded file)
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_restores (backup_id, restore_type, targets, status, progress, current_step, created_by, ip_address, started_at)
     VALUES (0, ?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW())`,
    [restoreType, targets ? JSON.stringify(targets) : null, accountName, ipAddress]
  );

  const restoreId = result.insertId;

  // Start the restore process asynchronously
  runRestoreFromUpload(restoreId, filePath, restoreType, targets).catch((error) => {
    logger.error(`Restore ${restoreId} from upload failed:`, error);
  });

  return { id: restoreId };
}

/**
 * Run restore from an uploaded file
 */
async function runRestoreFromUpload(
  restoreId: number,
  filePath: string,
  restoreType: 'full' | 'selective',
  targets: RestoreTarget[] | null
): Promise<void> {
  try {
    await updateRestoreStatus(restoreId, 'in_progress', 5, 'Starting restore from uploaded file...');
    broadcastRestoreProgress({ id: restoreId, progress: 5, currentStep: 'Starting restore from uploaded file...', status: 'in_progress' });

    if (!fs.existsSync(filePath)) {
      throw new Error('Uploaded backup file not found');
    }

    if (restoreType === 'full') {
      await runFullRestore(restoreId, filePath);
    } else {
      await runSelectiveRestore(restoreId, filePath, targets || []);
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
    logger.error(`Restore ${restoreId} from upload failed:`, errorMessage);

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

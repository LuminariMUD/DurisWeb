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
import {
  resolveSafeBackupFilePath,
  resolveSafeUploadedBackupPath,
} from '../utils/safeBackupPath.js';

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

export interface RestoreCategories {
  coreData: boolean;
  inventory: boolean;
  lockers: boolean;
  skills: boolean;
  progression: boolean;
  auction: boolean;
  guild: boolean;
  pvpHistory: boolean;
  pets: boolean;
  ships: boolean;
  corpses: boolean;
  mail: boolean;
}

export const CATEGORY_TABLES: Readonly<Record<keyof RestoreCategories, readonly string[]>> = {
  coreData: ['player_data', 'account_characters', 'player_affects', 'player_timers',
             'player_languages', 'player_intros', 'player_undead_slots', 'player_granted_cmds'],
  inventory: ['player_items', 'player_item_affects', 'player_item_extra_descr',
              'player_forged_items', 'artifact_bind'],
  lockers: ['lockers', 'locker_items', 'locker_item_affects',
            'private_chests', 'private_chest_log'],
  skills: ['player_skills', 'player_spellbooks', 'player_recipes',
           'player_shapechanges', 'player_witnesses'],
  progression: ['progress', 'epic_gain', 'epic_bonus', 'boons', 'boons_progress',
                'world_quest_accomplished'],
  auction: ['auction_money_pickups', 'auction_item_pickups', 'auction_bid_history'],
  guild: ['guild_members'],
  pvpHistory: ['pkill_info', 'pkill_event', 'frag_leaderboard'],
  pets: ['player_pets', 'player_pet_items', 'player_pet_item_affects',
         'player_pet_item_extra_descr'],
  ships: ['ships', 'ship_armor', 'ship_crew', 'ship_slots'],
  corpses: ['corpses', 'corpse_items', 'corpse_item_affects'],
  mail: ['offline_messages'],
};

export const PER_ACCOUNT_TABLES: readonly string[] = ['accounts', 'account_ips', 'account_banks'];

export const ALL_RESTORE_TABLES: readonly string[] = [
  ...Object.values(CATEGORY_TABLES).flat(),
  ...PER_ACCOUNT_TABLES,
];

// for each restore table, the column used to filter rows.
// columns whose name is a pid-ish number (e.g. 'pid', 'owner_pid'): match against pidSet.
// columns whose name contains 'name': match against name set (accountSet or character-name set).
// cascade-child tables use their FK column (e.g. 'item_id', 'locker_id').
export const FILTER_COLUMN_MAP: Readonly<Record<string, string>> = {
  // direct per-character, keyed by pid
  player_data: 'id',
  account_characters: 'pid',
  player_affects: 'pid',
  player_timers: 'pid',
  player_skills: 'pid',
  player_spellbooks: 'pid',
  player_recipes: 'pid',
  player_shapechanges: 'pid',
  player_witnesses: 'pid',
  player_languages: 'pid',
  player_intros: 'pid',
  player_undead_slots: 'pid',
  player_granted_cmds: 'pid',
  player_forged_items: 'pid',
  player_items: 'pid',
  progress: 'pid',
  epic_gain: 'pid',
  epic_bonus: 'pid',
  boons: 'pid',
  boons_progress: 'pid',
  world_quest_accomplished: 'pid',
  auction_money_pickups: 'pid',
  auction_item_pickups: 'pid',
  auction_bid_history: 'bidder_pid',
  frag_leaderboard: 'pid',
  offline_messages: 'pid',
  player_pets: 'pid',
  pkill_info: 'pid',
  artifact_bind: 'owner_pid',
  guild_members: 'player_pid',
  lockers: 'owner_pid',
  // keyed by character name
  corpses: 'player_name',
  ships: 'owner_name',
  // cascade-child tables (filter key set is resolved at runtime from parent)
  player_item_affects: 'item_id',
  player_item_extra_descr: 'item_id',
  player_pet_items: 'pet_id',
  player_pet_item_affects: 'item_id',
  player_pet_item_extra_descr: 'item_id',
  locker_items: 'locker_id',
  locker_item_affects: 'item_id',
  private_chests: 'locker_id',
  private_chest_log: 'chest_id',
  corpse_items: 'corpse_id',
  corpse_item_affects: 'item_id',
  ship_armor: 'ship_id',
  ship_crew: 'ship_id',
  ship_slots: 'ship_id',
  pkill_event: 'id',
  // per-account
  accounts: 'name',
  account_ips: 'account_name',
  account_banks: 'account_name',
};

export interface CascadeEdge {
  parentTable: string;
  parentKeyCol: string;   // column in parent whose values form the key set for children
  childTable: string;
  childFilterCol: string; // column in child to match against the key set
}

// topological order: parents before children
export const CASCADE_EDGES: readonly CascadeEdge[] = [
  { parentTable: 'player_items', parentKeyCol: 'id',
    childTable: 'player_item_affects', childFilterCol: 'item_id' },
  { parentTable: 'player_items', parentKeyCol: 'id',
    childTable: 'player_item_extra_descr', childFilterCol: 'item_id' },
  { parentTable: 'player_pets', parentKeyCol: 'id',
    childTable: 'player_pet_items', childFilterCol: 'pet_id' },
  { parentTable: 'player_pet_items', parentKeyCol: 'id',
    childTable: 'player_pet_item_affects', childFilterCol: 'item_id' },
  { parentTable: 'player_pet_items', parentKeyCol: 'id',
    childTable: 'player_pet_item_extra_descr', childFilterCol: 'item_id' },
  { parentTable: 'lockers', parentKeyCol: 'id',
    childTable: 'locker_items', childFilterCol: 'locker_id' },
  { parentTable: 'locker_items', parentKeyCol: 'id',
    childTable: 'locker_item_affects', childFilterCol: 'item_id' },
  { parentTable: 'lockers', parentKeyCol: 'id',
    childTable: 'private_chests', childFilterCol: 'locker_id' },
  { parentTable: 'private_chests', parentKeyCol: 'id',
    childTable: 'private_chest_log', childFilterCol: 'chest_id' },
  { parentTable: 'corpses', parentKeyCol: 'id',
    childTable: 'corpse_items', childFilterCol: 'corpse_id' },
  { parentTable: 'corpse_items', parentKeyCol: 'id',
    childTable: 'corpse_item_affects', childFilterCol: 'item_id' },
  { parentTable: 'ships', parentKeyCol: 'id',
    childTable: 'ship_armor', childFilterCol: 'ship_id' },
  { parentTable: 'ships', parentKeyCol: 'id',
    childTable: 'ship_crew', childFilterCol: 'ship_id' },
  { parentTable: 'ships', parentKeyCol: 'id',
    childTable: 'ship_slots', childFilterCol: 'ship_id' },
  // special: pkill_info.event_id (not id) -> pkill_event.id
  { parentTable: 'pkill_info', parentKeyCol: 'event_id',
    childTable: 'pkill_event', childFilterCol: 'id' },
];

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

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function mapRowToRestoreInfo(row: RestoreRow): RestoreInfo {
  return {
    id: row.id,
    backupId: row.backup_id,
    restoreType: row.restore_type as RestoreInfo['restoreType'],
    accounts: safeJsonParse<string[]>(row.accounts),
    characters: safeJsonParse<{ pid: number; name: string }[]>(row.characters),
    categories: safeJsonParse<RestoreCategories>(row.categories),
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

    // skip views entirely: they can reference tables dropped by past migrations,
    // which makes mysqldump fail with "references invalid table(s)". our restore
    // pipeline only processes INSERT rows on real tables (ALL_RESTORE_TABLES), so
    // dumping views adds fragility without value. migrations are the source of
    // truth for views.
    const [viewRows] = await pool.execute<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.tables
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'`,
      [dbName]
    );
    const ignoreFlags = (viewRows as { TABLE_NAME: string }[])
      .map(r => `--ignore-table=${dbName}.${r.TABLE_NAME}`)
      .join(' ');

    // --single-transaction: innodb-consistent snapshot without LOCK TABLES
    // (avoids needing the LOCK TABLES privilege).
    // --no-tablespaces: skip tablespace metadata dump
    // (avoids needing the PROCESS privilege, required by default in mysql 8.0+).
    await execAsync(
      `mysqldump --single-transaction --no-tablespaces ${ignoreFlags} -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} > "${tempSqlPath}"`,
      { maxBuffer: 100 * 1024 * 1024 }
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

    // build zip command - database folder only (player data lives in db now)
    const zipParts: string[] = [];
    zipParts.push(`cd "${tempDir}" && zip -r "${zipPath}" database`);

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
    let filePath: string;
    try {
      filePath = resolveSafeBackupFilePath(BACKUP_DIR, row.filename);
    } catch {
      logger.warn(`[Backup] Skipping unsafe backup filename: ${row.filename}`);
      continue;
    }
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

  let filePath: string;
  try {
    filePath = resolveSafeBackupFilePath(BACKUP_DIR, backup.filename);
  } catch {
    return null;
  }
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
  let filePath: string;
  try {
    filePath = resolveSafeBackupFilePath(BACKUP_DIR, backup.filename);
  } catch {
    logger.warn(`[Backup] Refusing to delete unsafe backup filename: ${backup.filename}`);
    return false;
  }
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
    try {
      const filePath = resolveSafeBackupFilePath(BACKUP_DIR, backup.filename);
      await fs.promises.unlink(filePath).catch(() => {});
    } catch {
      logger.warn(`[Backup] Skipping unsafe failed-backup filename: ${backup.filename}`);
    }

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
 * extract the accounts + characters lists from a sql dump by parsing the
 * account_characters table's INSERT blocks. exported for unit testing.
 */
export function parseBackupContentsFromSql(sqlContent: string): BackupContents {
  const accountsSet = new Set<string>();
  const chars: { pid: number; name: string }[] = [];

  const columns = parseCreateTableColumns(sqlContent, 'account_characters');
  if (columns.length === 0) return { accounts: [], characters: [] };
  const accIdx = columns.indexOf('account_name');
  const nameIdx = columns.indexOf('char_name');
  const pidIdx = columns.indexOf('pid');
  if (accIdx === -1 || nameIdx === -1 || pidIdx === -1) {
    return { accounts: [], characters: [] };
  }

  const blocks = extractInsertBlocks(sqlContent, 'account_characters');
  for (const block of blocks) {
    for (const row of parseMultiValueInsert(block)) {
      const acc = extractColValue(row, accIdx);
      const name = extractColValue(row, nameIdx);
      const pidStr = extractColValue(row, pidIdx);
      if (acc) accountsSet.add(acc);
      if (name && pidStr) {
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) chars.push({ pid, name });
      }
    }
  }

  return {
    accounts: [...accountsSet].sort(),
    characters: chars.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * list accounts and characters contained in a backup by reading its sql dump.
 */
export async function listBackupContents(backupId: number): Promise<BackupContents | null> {
  const backup = await getBackupById(backupId);
  if (!backup || backup.status !== 'completed') return null;

  let filePath: string;
  try {
    filePath = resolveSafeBackupFilePath(BACKUP_DIR, backup.filename);
  } catch {
    return null;
  }
  if (!fs.existsSync(filePath)) return null;

  const directory = await unzipper.Open.file(filePath);
  const sqlFile = directory.files.find(f =>
    f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
  );
  if (!sqlFile) return { accounts: [], characters: [] };

  const content = (await sqlFile.buffer()).toString('utf-8');
  return parseBackupContentsFromSql(content);
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
 * shape of the restore request body sent by the admin routes into the service layer.
 */
export interface RestoreRequest {
  restoreType: 'full' | 'account' | 'character';
  accounts?: string[];
  characters?: { pid: number; name: string }[];
  categories?: RestoreCategories;
}

export interface CreateRestoreRequest extends RestoreRequest {
  backupId: number;
}

/**
 * core restore pipeline shared by createRestore (backup id) and
 * createRestoreFromUpload (direct file path). atomically inserts the mud_restores
 * row only if no other pending/in_progress restore exists in the last 30 minutes —
 * the route-level guard is best-effort, this insert is the race-safe check.
 * kicks off the async pipeline, wires broadcasts. returns { id }.
 */
async function runRestoreInternal(
  req: RestoreRequest,
  filePath: string,
  backupId: number,
  accountName: string,
  ipAddress: string,
): Promise<{ id: number }> {
  // atomic: insert only if no active restore exists. closes the TOCTOU gap
  // between route-level assertRestorePreconditions and the insert below.
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO mud_restores
      (backup_id, restore_type, accounts, characters, categories,
       status, progress, current_step, created_by, ip_address, started_at)
     SELECT ?, ?, ?, ?, ?, 'pending', 0, 'Initializing...', ?, ?, NOW()
     FROM (SELECT 1) AS _
     WHERE NOT EXISTS (
       SELECT 1 FROM mud_restores
       WHERE status IN ('pending', 'in_progress')
         AND started_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
     )`,
    [
      backupId,
      req.restoreType,
      req.accounts ? JSON.stringify(req.accounts) : null,
      req.characters ? JSON.stringify(req.characters) : null,
      req.categories ? JSON.stringify(req.categories) : null,
      accountName,
      ipAddress,
    ],
  );
  if (result.affectedRows === 0) {
    throw new Error('Another restore is already in progress');
  }
  const restoreId = result.insertId;

  executeRestorePipeline(restoreId, filePath, req).catch(err => {
    logger.error(`restore ${restoreId} failed:`, err);
  });

  return { id: restoreId };
}

/**
 * load dump, filter, write temp sql, execute via mysql CLI.
 */
async function executeRestorePipeline(
  restoreId: number,
  filePath: string,
  req: RestoreRequest,
): Promise<void> {
  const bump = async (progress: number, step: string, status = 'in_progress') => {
    await updateRestoreStatus(restoreId, status, progress, step);
    broadcastRestoreProgress({ id: restoreId, progress, currentStep: step, status });
  };

  const tempSqlPath = path.join(os.tmpdir(), `restore-${restoreId}-${Date.now()}.sql`);

  try {
    await bump(5, 'Loading backup...');
    if (!fs.existsSync(filePath)) throw new Error('Backup file not found');
    const directory = await unzipper.Open.file(filePath);
    const sqlFile = directory.files.find(f =>
      f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
    );
    if (!sqlFile) throw new Error('No database/*.sql inside backup');

    await bump(15, 'Reading SQL dump...');
    const sqlContent = (await sqlFile.buffer()).toString('utf-8');

    await bump(30, 'Filtering rows...');
    let filtered: Record<string, string[]>;
    if (req.restoreType === 'full') {
      filtered = filterDumpForFullRestore(sqlContent);
    } else if (req.restoreType === 'account') {
      filtered = filterDumpForAccountRestore(sqlContent, new Set(req.accounts || []));
    } else {
      const pidSet = new Set((req.characters || []).map(c => String(c.pid)));
      const nameSet = new Set((req.characters || []).map(c => c.name));
      filtered = filterDumpForCharacterRestore(sqlContent, pidSet, req.categories || {}, nameSet);
    }

    await bump(60, 'Writing restore SQL...');
    await fs.promises.writeFile(tempSqlPath, buildRestoreSql(filtered));

    await bump(80, 'Executing restore...');
    const dbHost = process.env.DURIS_DB_HOST || '127.0.0.1';
    const dbUser = process.env.DURIS_DB_USER || 'duris';
    const dbPassword = process.env.DURIS_DB_PASSWORD || 'duris';
    const dbName = process.env.DURIS_DB_NAME || 'duris_dev';
    // 30-minute hard timeout: matches the concurrency-guard window. if mysql cli
    // hangs (deadlock, lost connection, oom-killed), the timeout kills the child
    // process so the catch+finally below can mark the restore as failed and
    // unlink the temp file.
    await execAsync(
      `mysql -h ${dbHost} -u ${dbUser} -p'${dbPassword}' ${dbName} < "${tempSqlPath}"`,
      {
        maxBuffer: 100 * 1024 * 1024,
        timeout: 30 * 60 * 1000,
        killSignal: 'SIGKILL',
      },
    );

    await pool.execute(
      `UPDATE mud_restores SET status = 'completed', progress = 100,
       current_step = 'Restore complete', completed_at = NOW() WHERE id = ?`,
      [restoreId],
    );
    broadcastRestoreProgress({ id: restoreId, progress: 100, currentStep: 'Restore complete', status: 'completed' });
    logger.info(`restore ${restoreId} completed`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`restore ${restoreId} failed:`, msg);
    await pool.execute(
      `UPDATE mud_restores SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [msg, restoreId],
    );
    broadcastRestoreProgress({ id: restoreId, progress: 0, currentStep: `Failed: ${msg}`, status: 'failed' });
  } finally {
    await fs.promises.unlink(tempSqlPath).catch(() => {});
  }
}

export async function createRestore(
  req: CreateRestoreRequest,
  accountName: string,
  ipAddress: string,
): Promise<{ id: number }> {
  const backup = await getBackupById(req.backupId);
  if (!backup || backup.status !== 'completed') {
    throw new Error('Backup not found or not completed');
  }
  const filePath = resolveSafeBackupFilePath(BACKUP_DIR, backup.filename);
  return runRestoreInternal(req, filePath, req.backupId, accountName, ipAddress);
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
 * extract every INSERT INTO `tableName` ... VALUES (...); statement for a specific table
 * from a sql dump string. returns the VALUES payload of each statement (without the
 * INSERT prefix or trailing semicolon). handles multiline statements, single-quoted
 * strings that contain parens/semicolons, and escaped quotes.
 * mysqldump always emits sql keywords in uppercase, so we do not need a case-insensitive
 * search for VALUES (which would cost a full dump copy per call).
 */
export function extractInsertBlocks(sqlContent: string, tableName: string): string[] {
  const blocks: string[] = [];
  const prefix = "INSERT INTO `" + tableName + "`";
  let i = 0;

  while (i < sqlContent.length) {
    const start = sqlContent.indexOf(prefix, i);
    if (start === -1) break;

    // must match the whole table name — reject `player_data_backup` when looking for `player_data`
    const nextChar = sqlContent[start + prefix.length];
    if (nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\n' && nextChar !== '(') {
      i = start + prefix.length;
      continue;
    }

    // find VALUES (mysqldump always emits keywords uppercase)
    const valuesIdx = sqlContent.indexOf('VALUES', start + prefix.length);
    if (valuesIdx === -1) break;

    let j = valuesIdx + 'VALUES'.length;
    while (j < sqlContent.length && /\s/.test(sqlContent[j])) j++;

    let depth = 0;
    let inString = false;
    let escapeNext = false;
    const valuesStart = j;

    while (j < sqlContent.length) {
      const c = sqlContent[j];
      if (escapeNext) { escapeNext = false; j++; continue; }
      if (c === '\\') { escapeNext = true; j++; continue; }
      if (c === "'") { inString = !inString; j++; continue; }
      if (!inString) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth === 0) {
          blocks.push(sqlContent.slice(valuesStart, j).trimEnd());
          j++;
          break;
        }
      }
      j++;
    }

    i = j;
  }

  return blocks;
}

/**
 * extract ordered column names from a CREATE TABLE block in a sql dump.
 * returns [] if the table's CREATE block isn't present.
 * ignores constraint-only lines (PRIMARY KEY, UNIQUE KEY, KEY, FOREIGN KEY, CONSTRAINT).
 */
export function parseCreateTableColumns(sqlContent: string, tableName: string): string[] {
  const marker = "CREATE TABLE `" + tableName + "`";
  const start = sqlContent.indexOf(marker);
  if (start === -1) return [];

  const openParen = sqlContent.indexOf('(', start);
  if (openParen === -1) return [];

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let closeParen = -1;

  for (let i = openParen; i < sqlContent.length; i++) {
    const c = sqlContent[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (c === "'") { inString = !inString; continue; }
    if (!inString) {
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { closeParen = i; break; }
      }
    }
  }

  if (closeParen === -1) return [];

  const body = sqlContent.slice(openParen + 1, closeParen);

  // split the body by top-level commas (ignore commas inside parens like int(11)
  // or inside quoted default values). this handles both multi-line mysqldump
  // output and single-line CREATE TABLEs.
  const pieces: string[] = [];
  let current = '';
  let parenDepth = 0;
  inString = false;
  escapeNext = false;
  for (const c of body) {
    if (escapeNext) { current += c; escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; current += c; continue; }
    if (c === "'") { inString = !inString; current += c; continue; }
    if (!inString) {
      if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === ',' && parenDepth === 0) {
        if (current.trim()) pieces.push(current.trim());
        current = '';
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) pieces.push(current.trim());

  const columns: string[] = [];
  const constraintPrefixes = ['PRIMARY KEY', 'UNIQUE KEY', 'UNIQUE INDEX', 'KEY ', 'INDEX ',
                               'FOREIGN KEY', 'CONSTRAINT', 'FULLTEXT', 'SPATIAL'];

  for (const piece of pieces) {
    const upper = piece.toUpperCase();
    if (constraintPrefixes.some(p => upper.startsWith(p))) continue;
    const m = piece.match(/^`([^`]+)`/);
    if (m) columns.push(m[1]);
  }

  return columns;
}

export interface TableColumnInfo {
  columns: string[];
  filterColIndex: number;
}

export type FilterColumnIndex = Record<string, TableColumnInfo>;

/**
 * build the runtime table→column-index map by parsing CREATE TABLE blocks
 * from a sql dump. a missing CREATE TABLE leaves that entry undefined (restore
 * will log-and-skip for those tables).
 */
export function buildFilterColumnIndex(sqlContent: string): FilterColumnIndex {
  const idx: FilterColumnIndex = {};
  for (const tbl of ALL_RESTORE_TABLES) {
    const columns = parseCreateTableColumns(sqlContent, tbl);
    if (columns.length === 0) continue;
    const filterCol = FILTER_COLUMN_MAP[tbl];
    const filterColIndex = columns.indexOf(filterCol);
    if (filterColIndex === -1) continue;
    idx[tbl] = { columns, filterColIndex };
  }
  return idx;
}

/**
 * one-pass parse of the sql dump: for each restore table, collect every row
 * across all its INSERT blocks. tables not in ALL_RESTORE_TABLES are ignored.
 */
export function parseDumpIntoRowMap(sqlContent: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const tbl of ALL_RESTORE_TABLES) {
    const blocks = extractInsertBlocks(sqlContent, tbl);
    if (blocks.length === 0) continue;
    const rows: string[] = [];
    for (const block of blocks) {
      for (const row of parseMultiValueInsert(block)) rows.push(row);
    }
    out[tbl] = rows;
  }
  return out;
}

/**
 * unescape mysql's backslash-escaped string literal back to the raw string.
 * mysqldump emits e.g. O'Brien as 'O\'Brien' — so after stripping the outer
 * quotes we must convert '\\'' back to "'" so equality checks against raw
 * user input (sets of account/character names) match.
 */
function unescapeMysqlString(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === "'") { out += "'"; i++; }
      else if (next === '"') { out += '"'; i++; }
      else if (next === '\\') { out += '\\'; i++; }
      else if (next === 'n') { out += '\n'; i++; }
      else if (next === 'r') { out += '\r'; i++; }
      else if (next === '0') { out += '\0'; i++; }
      else if (next === 'Z') { out += '\x1A'; i++; }
      else { out += s[i]; }
    } else {
      out += s[i];
    }
  }
  return out;
}

/**
 * parse the filter-col value out of one row-string and return it as a plain string.
 * numeric values stay as digit strings ('42'); quoted values have their outer quotes
 * stripped and mysql-escape sequences unescaped so equality checks against raw user
 * input match.
 */
function extractColValue(rowStr: string, colIndex: number): string | null {
  if (!rowStr.startsWith('(') || !rowStr.endsWith(')')) return null;
  const inner = rowStr.slice(1, -1);
  let currentStart = 0;
  let col = 0;
  let inString = false;
  let escapeNext = false;
  let depth = 0;

  for (let i = 0; i <= inner.length; i++) {
    const c = i < inner.length ? inner[i] : ',';
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (c === "'") { inString = !inString; continue; }
    if (!inString) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        if (col === colIndex) {
          let val = inner.slice(currentStart, i).trim();
          if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
            val = unescapeMysqlString(val.slice(1, -1));
          }
          return val;
        }
        col++;
        currentStart = i + 1;
      }
    }
  }
  return null;
}

export function filterTableRows(
  rows: string[],
  info: TableColumnInfo,
  keySet: Set<string>,
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = extractColValue(row, info.filterColIndex);
    if (v !== null && keySet.has(v)) out.push(row);
  }
  return out;
}

/**
 * from a set of parent rows + info, keep only rows matching `keySet` on filterCol,
 * then collect the values of `outColName` from surviving rows. used for cascade
 * filtering: parent rows feed the key set for child filtering.
 */
export function resolveCascadeKeys(
  parentRows: string[],
  parentInfo: TableColumnInfo,
  parentKeySet: Set<string>,
  outColName: string,
): Set<string> {
  const outIdx = parentInfo.columns.indexOf(outColName);
  if (outIdx === -1) return new Set();
  const surviving = filterTableRows(parentRows, parentInfo, parentKeySet);
  const out = new Set<string>();
  for (const row of surviving) {
    const v = extractColValue(row, outIdx);
    if (v !== null) out.add(v);
  }
  return out;
}

/**
 * assemble the final restore sql from per-table filtered row arrays.
 * wraps in FOREIGN_KEY_CHECKS toggle and a transaction so partial failure rolls back.
 */
function splitRestoreRowValues(row: string): string[] {
  if (!row.startsWith('(') || !row.endsWith(')')) return [];

  const inner = row.slice(1, -1);
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString && character === '\\') {
      escapeNext = true;
      continue;
    }
    if (character === "'") {
      if (inString && inner[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (character === ',' && depth === 0) {
        values.push(inner.slice(start, index).trim());
        start = index + 1;
      }
    }
  }

  if (inString || depth !== 0) return [];
  values.push(inner.slice(start).trim());
  return values;
}

function isSafeRestoreLiteral(value: string): boolean {
  if (value === 'NULL' || value === 'TRUE' || value === 'FALSE') return true;
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return true;
  if (/^0x[0-9A-Fa-f]+$/.test(value)) return true;
  if (/^[bB]'[01]*'$/.test(value) || /^[xX]'[0-9A-Fa-f]*'$/.test(value)) return true;
  return /^(?:_[A-Za-z0-9]+|N)?'(?:[^'\\]|\\[\s\S]|'')*'$/.test(value);
}

function isSafeRestoreRow(row: string): boolean {
  const values = splitRestoreRowValues(row);
  return values.length > 0 && values.every(isSafeRestoreLiteral);
}

export function buildRestoreSql(filtered: Record<string, string[]>): string {
  const parts: string[] = [];
  parts.push('SET FOREIGN_KEY_CHECKS=0;');
  parts.push('START TRANSACTION;');
  for (const [tbl, rows] of Object.entries(filtered)) {
    if (rows.length === 0) continue;
    if (!(ALL_RESTORE_TABLES as readonly string[]).includes(tbl)) {
      throw new Error(`Unsafe restore table: ${tbl}`);
    }
    if (rows.some((row) => !isSafeRestoreRow(row))) {
      throw new Error(`Unsafe SQL literal in restore table: ${tbl}`);
    }
    parts.push('REPLACE INTO `' + tbl + '` VALUES ' + rows.join(',') + ';');
  }
  parts.push('COMMIT;');
  parts.push('SET FOREIGN_KEY_CHECKS=1;');
  return parts.join('\n');
}

/**
 * expand the set of tables selected by checked categories.
 */
function tablesForCategories(categories: Partial<RestoreCategories>): string[] {
  const out: string[] = [];
  for (const [cat, tables] of Object.entries(CATEGORY_TABLES)) {
    if (categories[cat as keyof RestoreCategories]) out.push(...tables);
  }
  return out;
}

/**
 * filter a parsed dump into the set of rows to restore for a character (or set of pids),
 * honoring the checked categories and cascade chains.
 */
export function filterDumpForCharacterRestore(
  sqlContent: string,
  pidSet: Set<string>,
  categories: Partial<RestoreCategories>,
  nameSet: Set<string> = new Set(),
): Record<string, string[]> {
  const columnIndex = buildFilterColumnIndex(sqlContent);
  const rowMap = parseDumpIntoRowMap(sqlContent);
  const selected = new Set(tablesForCategories(categories));
  const filtered: Record<string, string[]> = {};

  const cascadeChildren = new Set(CASCADE_EDGES.map(e => e.childTable));

  for (const tbl of selected) {
    if (cascadeChildren.has(tbl)) continue;
    const info = columnIndex[tbl];
    const rows = rowMap[tbl];
    if (!info || !rows) continue;
    const filterCol = FILTER_COLUMN_MAP[tbl];
    const keySet = (filterCol === 'player_name' || filterCol === 'owner_name') ? nameSet : pidSet;
    filtered[tbl] = filterTableRows(rows, info, keySet);
  }

  for (const edge of CASCADE_EDGES) {
    if (!selected.has(edge.parentTable) || !selected.has(edge.childTable)) continue;
    const parentInfo = columnIndex[edge.parentTable];
    // use pre-filtered parent rows. for level-1 cascade parents (lockers, player_pets,
    // etc), these come from the direct pass above. for level-2+ parents (locker_items,
    // private_chests, corpse_items, player_pet_items), they come from an earlier edge
    // in this loop. CASCADE_EDGES is in topological order so parents are always filled
    // by the time their children are processed. the rowMap fallback is a safety net —
    // shouldn't fire in practice because `selected.has(parent)` above implies the parent
    // was eligible for direct or cascade filtering.
    const parentRows = filtered[edge.parentTable] ?? rowMap[edge.parentTable];
    const childInfo = columnIndex[edge.childTable];
    const childRows = rowMap[edge.childTable];
    if (!parentInfo || !parentRows || !childInfo || !childRows) continue;

    // parent rows are already filtered to the current character/account scope, so
    // collect outColName (usually 'id') values directly. no need to re-filter.
    const outIdx = parentInfo.columns.indexOf(edge.parentKeyCol);
    if (outIdx === -1) continue;
    const childKeySet = new Set<string>();
    for (const row of parentRows) {
      const v = extractColValue(row, outIdx);
      if (v !== null) childKeySet.add(v);
    }
    filtered[edge.childTable] = filterTableRows(childRows, childInfo, childKeySet);
  }

  return filtered;
}

/**
 * full restore: every row of every restore table.
 */
export function filterDumpForFullRestore(sqlContent: string): Record<string, string[]> {
  return parseDumpIntoRowMap(sqlContent);
}

/**
 * account restore: all per-account tables for selected account names, plus all per-character
 * tables for every pid owned by those accounts.
 */
export function filterDumpForAccountRestore(
  sqlContent: string,
  accountSet: Set<string>,
): Record<string, string[]> {
  const columnIndex = buildFilterColumnIndex(sqlContent);
  const rowMap = parseDumpIntoRowMap(sqlContent);

  const filtered: Record<string, string[]> = {};
  for (const tbl of PER_ACCOUNT_TABLES) {
    const info = columnIndex[tbl];
    const rows = rowMap[tbl];
    if (!info || !rows) continue;
    filtered[tbl] = filterTableRows(rows, info, accountSet);
  }

  const acInfo = columnIndex.account_characters;
  const acRows = rowMap.account_characters;
  const pidSet = new Set<string>();
  const nameSet = new Set<string>();
  if (acInfo && acRows) {
    const accIdx = acInfo.columns.indexOf('account_name');
    const pidIdx = acInfo.columns.indexOf('pid');
    const nameIdx = acInfo.columns.indexOf('char_name');
    for (const row of acRows) {
      const acc = extractColValue(row, accIdx);
      if (acc && accountSet.has(acc)) {
        const pid = extractColValue(row, pidIdx);
        const name = extractColValue(row, nameIdx);
        if (pid) pidSet.add(pid);
        if (name) nameSet.add(name);
      }
    }
  }

  const allCategoriesChecked: RestoreCategories = {
    coreData: true, inventory: true, lockers: true, skills: true,
    progression: true, auction: true, guild: true, pvpHistory: true,
    pets: true, ships: true, corpses: true, mail: true,
  };
  const perChar = filterDumpForCharacterRestore(sqlContent, pidSet, allCategoriesChecked, nameSet);
  return { ...filtered, ...perChar };
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
  let safeFilePath = '';
  try {
    safeFilePath = resolveSafeUploadedBackupPath(filePath);
    if (!fs.existsSync(safeFilePath)) {
      return {
        tempPath: safeFilePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'File not found',
      };
    }
    const directory = await unzipper.Open.file(safeFilePath);
    const sqlFile = directory.files.find(f =>
      f.path.endsWith('.sql') && (f.path.startsWith('database/') || f.path === 'database.sql')
    );
    if (!sqlFile) {
      return {
        tempPath: safeFilePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'Invalid backup: no database/*.sql file found',
      };
    }

    const content = (await sqlFile.buffer()).toString('utf-8');

    if (!content.includes('CREATE TABLE `account_characters`') ||
        !content.includes('CREATE TABLE `player_data`')) {
      return {
        tempPath: safeFilePath,
        contents: { accounts: [], characters: [] },
        isValid: false,
        errorMessage: 'Invalid backup: missing account_characters or player_data table definition',
      };
    }

    const contents = parseBackupContentsFromSql(content);
    return { tempPath: safeFilePath, contents, isValid: true };
  } catch (error) {
    return {
      tempPath: safeFilePath,
      contents: { accounts: [], characters: [] },
      isValid: false,
      errorMessage: safeFilePath
        ? error instanceof Error ? error.message : 'Failed to read backup file'
        : 'Invalid backup upload path',
    };
  }
}

/**
 * Create a restore from an uploaded backup file
 */
export async function createRestoreFromUpload(
  filePath: string,
  req: RestoreRequest,
  accountName: string,
  ipAddress: string,
): Promise<{ id: number }> {
  const safeFilePath = resolveSafeUploadedBackupPath(filePath);
  return runRestoreInternal(req, safeFilePath, 0, accountName, ipAddress);
}

/**
 * Delete an uploaded backup file (for cleanup on cancel)
 */
export async function deleteUploadedBackup(filePath: string): Promise<void> {
  let safeFilePath: string;
  try {
    safeFilePath = resolveSafeUploadedBackupPath(filePath);
  } catch {
    return;
  }

  if (fs.existsSync(safeFilePath)) {
    await fs.promises.unlink(safeFilePath);
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
 * Get list of all restores (also cleans up stuck rows)
 */
export async function getRestoreList(): Promise<RestoreInfo[]> {
  // mark stuck restores as failed (in_progress/pending for more than 30 minutes).
  // mirrors the same cleanup in getBackupList. covers node-crash-mid-restore and
  // mysql-cli-killed-by-timeout scenarios so the row doesn't sit at in_progress forever.
  await pool.execute(
    `UPDATE mud_restores
     SET status = 'failed',
         error_message = 'Restore timed out (stuck for over 30 minutes)',
         completed_at = NOW()
     WHERE status IN ('in_progress', 'pending')
       AND started_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
  );

  const [rows] = await pool.execute<RestoreRow[]>(
    `SELECT * FROM mud_restores ORDER BY started_at DESC`
  );
  return rows.map(mapRowToRestoreInfo);
}

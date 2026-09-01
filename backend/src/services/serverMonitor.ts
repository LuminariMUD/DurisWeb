import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

export interface DiskSpaceInfo {
  used: number; // bytes
  total: number; // bytes
  percent: number;
}

export interface MemoryUsageInfo {
  used: number; // bytes
  total: number; // bytes
  percent: number;
}

export interface DatabaseHealth {
  connected: boolean;
  poolActive: number;
  poolIdle: number;
  avgQueryTime: number; // milliseconds
}

export interface TableSizeInfo {
  tableName: string;
  sizeBytes: number;
  rowCount: number;
}

export interface ServerHealthInfo {
  diskSpace: DiskSpaceInfo;
  memoryUsage: MemoryUsageInfo;
  uptimeMs: number;
  nodeVersion: string;
  platform: string;
  databaseStatus: DatabaseHealth;
  tableSizes: TableSizeInfo[];
}

/**
 * Get disk space information for the root partition
 */
export async function getDiskSpace(): Promise<DiskSpaceInfo> {
  try {
    // Use df command to get disk usage
    const { stdout } = await execAsync('df -k /');
    const lines = stdout.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('Unexpected df output');
    }

    // Parse df output: Filesystem 1K-blocks Used Available Use% Mounted
    const parts = lines[1].split(/\s+/);
    const totalKB = parseInt(parts[1], 10);
    const usedKB = parseInt(parts[2], 10);

    const totalBytes = totalKB * 1024;
    const usedBytes = usedKB * 1024;
    const percent = Math.round((usedBytes / totalBytes) * 100);

    return {
      used: usedBytes,
      total: totalBytes,
      percent,
    };
  } catch (error) {
    logger.error('Error getting disk space:', error);
    // Return fallback values
    return {
      used: 0,
      total: 0,
      percent: 0,
    };
  }
}

/**
 * Get Node.js process memory usage
 */
export function getMemoryUsage(): MemoryUsageInfo {
  const usage = process.memoryUsage();
  const totalSystemMemory = os.totalmem();
  const usedBytes = usage.heapUsed;
  const percent = Math.round((usedBytes / totalSystemMemory) * 100);

  return {
    used: usedBytes,
    total: totalSystemMemory,
    percent,
  };
}

/**
 * Get MUD server uptime (dms process)
 */
export async function getServerUptime(): Promise<number> {
  try {
    // Get dms process start time
    const { stdout } = await execAsync('ps -eo pid,etime,cmd | grep -E "[d]ms|[.]/dms" | head -1');

    if (!stdout.trim()) {
      return 0; // MUD server not running
    }

    // Parse elapsed time (format: [[dd-]hh:]mm:ss or seconds)
    const parts = stdout.trim().split(/\s+/);
    const etime = parts[1]; // elapsed time

    // Convert etime to milliseconds
    let totalSeconds = 0;
    const timeParts = etime.split(/[-:]/);

    if (timeParts.length === 1) {
      // Just seconds
      totalSeconds = parseInt(timeParts[0], 10);
    } else if (timeParts.length === 2) {
      // mm:ss
      totalSeconds = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
    } else if (timeParts.length === 3) {
      // hh:mm:ss
      totalSeconds =
        parseInt(timeParts[0], 10) * 3600 +
        parseInt(timeParts[1], 10) * 60 +
        parseInt(timeParts[2], 10);
    } else if (timeParts.length === 4) {
      // dd-hh:mm:ss
      totalSeconds =
        parseInt(timeParts[0], 10) * 86400 +
        parseInt(timeParts[1], 10) * 3600 +
        parseInt(timeParts[2], 10) * 60 +
        parseInt(timeParts[3], 10);
    }

    return totalSeconds * 1000;
  } catch (error) {
    logger.error('Error getting MUD server uptime:', error);
    return 0;
  }
}

/**
 * Get database connection pool status
 */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const queryTime = Date.now() - start;

    // Get pool stats (mysql2 doesn't expose pool stats directly, so we'll use defaults)
    // In a real implementation, you'd need to access the pool's internal state
    return {
      connected: true,
      poolActive: 0, // mysql2 doesn't easily expose this
      poolIdle: 0, // mysql2 doesn't easily expose this
      avgQueryTime: queryTime,
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      connected: false,
      poolActive: 0,
      poolIdle: 0,
      avgQueryTime: 0,
    };
  }
}

/**
 * Get sizes of all forum and game tables
 */
export async function getTableSizes(): Promise<TableSizeInfo[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         table_name AS tableName,
         (data_length + index_length) AS sizeBytes,
         table_rows AS rowCount
       FROM information_schema.TABLES
       WHERE table_schema = DATABASE()
         AND table_name IN (
           'forum_threads', 'forum_posts', 'forum_categories', 'forum_reactions',
           'forum_notifications', 'forum_moderation_log', 'forum_polls', 'poll_options', 'poll_votes',
           'pkill_event', 'pkill_info', 'player_data', 'web_sessions', 'statistics',
           'ip_info', 'guildhalls', 'frag_leaderboard'
         )
       ORDER BY sizeBytes DESC`,
    );

    return rows as TableSizeInfo[];
  } catch (error) {
    logger.error('Error fetching table sizes:', error);
    return [];
  }
}

/**
 * Get complete server health information
 */
export async function getServerHealth(): Promise<ServerHealthInfo> {
  const [diskSpace, memoryUsage, databaseStatus, tableSizes, uptime] = await Promise.all([
    getDiskSpace(),
    Promise.resolve(getMemoryUsage()),
    getDatabaseHealth(),
    getTableSizes(),
    getServerUptime(),
  ]);

  return {
    diskSpace,
    memoryUsage,
    uptimeMs: uptime,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()}`,
    databaseStatus,
    tableSizes,
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format milliseconds to human-readable uptime
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

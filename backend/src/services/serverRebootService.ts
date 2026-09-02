import { pool } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import fs from 'fs/promises';
import logger from '../utils/logger.js';

interface ServerReboot {
  id: number;
  bootTime: number;
  shutdownTime: number;
  uptimeSeconds: number;
  shutdownType?:
    | 'shutdown'
    | 'reboot'
    | 'copyover'
    | 'autoreboot'
    | 'pwipe'
    | 'hung'
    | 'autoreboot_copyover'
    | 'crash'
    | 'unknown';
  initiatedBy?: string | null;
  reason?: string | null;
  createdAt: string;
}

interface UptimeStats {
  currentUptime: number | null;
  averageUptime: number | null;
  longestUptime: number | null;
  totalReboots: number;
  rebootsLast30Days: number;
}

interface CurrentReboot {
  bootTime: number;
  uptime: number;
  bootDate: string;
}

interface RebootHistory {
  reboots: ServerReboot[];
  total: number;
  page: number;
  limit: number;
}

const HOST_MONITOR_ACTOR = 'durisweb-host-monitor';

/**
 * Get the current server boot time by reading /proc/uptime
 * This gives us the actual Linux system boot time
 */
export async function getCurrentBootTime(): Promise<number | null> {
  try {
    const uptimeData = await fs.readFile('/proc/uptime', 'utf-8');
    const uptimeSeconds = parseFloat(uptimeData.split(' ')[0]);

    // Calculate boot time: current time - uptime
    const bootTime = Math.floor(Date.now() / 1000 - uptimeSeconds);

    return bootTime;
  } catch (error) {
    logger.error('Error reading system uptime:', error);
    return null;
  }
}

/**
 * Get current server reboot information including uptime
 */
export async function getLastReboot(): Promise<CurrentReboot | null> {
  try {
    const bootTime = await getCurrentBootTime();

    if (!bootTime) {
      return null;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const uptime = currentTime - bootTime;
    const bootDate = new Date(bootTime * 1000).toISOString();

    return {
      bootTime,
      uptime,
      bootDate,
    };
  } catch (error) {
    logger.error('Error getting last reboot:', error);
    return null;
  }
}

/**
 * Get paginated reboot history from server_reboots table
 */
export async function getRebootHistory(
  page: number = 1,
  limit: number = 20,
): Promise<RebootHistory> {
  try {
    const offset = (page - 1) * limit;

    // Host reboot observations share the canonical MUD lifecycle table but
    // use a reserved actor and an allowed shutdown type.
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM server_reboots
       WHERE shutdown_type = 'unknown' AND initiated_by = ?`,
      [HOST_MONITOR_ACTOR],
    );
    const total = countRows[0].total;

    // Get paginated reboots (only server reboots, not MUD reboots)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        record_id as id,
        boot_time as bootTime,
        shutdown_time as shutdownTime,
        uptime_seconds as uptimeSeconds,
        FROM_UNIXTIME(shutdown_time) as createdAt
       FROM server_reboots
       WHERE shutdown_type = 'unknown' AND initiated_by = ?
       ORDER BY boot_time DESC
       LIMIT ? OFFSET ?`,
      [HOST_MONITOR_ACTOR, limit, offset],
    );

    return {
      reboots: rows as ServerReboot[],
      total,
      page,
      limit,
    };
  } catch (error) {
    logger.error('Error fetching reboot history:', error);
    return {
      reboots: [],
      total: 0,
      page,
      limit,
    };
  }
}

/**
 * Calculate uptime statistics
 */
export async function getUptimeStats(): Promise<UptimeStats> {
  try {
    const currentReboot = await getLastReboot();
    const currentUptime = currentReboot?.uptime || null;

    const [statsRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        AVG(uptime_seconds) as avgUptime,
        MAX(uptime_seconds) as maxUptime,
        COUNT(*) as totalReboots,
        SUM(CASE WHEN shutdown_time >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 DAY)) THEN 1 ELSE 0 END) as rebootsLast30Days
       FROM server_reboots
       WHERE shutdown_type = 'unknown' AND initiated_by = ?`,
      [HOST_MONITOR_ACTOR],
    );

    const stats = statsRows[0];

    return {
      currentUptime,
      averageUptime: stats.avgUptime ? Math.round(stats.avgUptime) : null,
      longestUptime: stats.maxUptime || null,
      totalReboots: stats.totalReboots || 0,
      rebootsLast30Days: stats.rebootsLast30Days || 0,
    };
  } catch (error) {
    logger.error('Error calculating uptime stats:', error);
    return {
      currentUptime: null,
      averageUptime: null,
      longestUptime: null,
      totalReboots: 0,
      rebootsLast30Days: 0,
    };
  }
}

/**
 * Record a new reboot to the database
 * This should be called when a boot_time change is detected
 */
export async function recordReboot(bootTime: number, shutdownTime: number): Promise<number> {
  try {
    const uptimeSeconds = Math.max(shutdownTime - bootTime, 0);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO server_reboots
        (boot_time, shutdown_time, uptime_seconds, shutdown_type, initiated_by)
       VALUES (?, ?, ?, 'unknown', ?)`,
      [bootTime, shutdownTime, uptimeSeconds, HOST_MONITOR_ACTOR],
    );

    return result.insertId;
  } catch (error) {
    logger.error('Error recording reboot:', error);
    throw error;
  }
}

/**
 * Check if a reboot with the given boot_time already exists
 */
export async function rebootExists(bootTime: number): Promise<boolean> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM server_reboots WHERE boot_time = ?',
      [bootTime],
    );

    return rows[0].count > 0;
  } catch (error) {
    logger.error('Error checking reboot existence:', error);
    return false;
  }
}

/**
 * Get the most recent MUD boot time from server_reboots
 * Used to calculate uptime when recording web-initiated shutdowns
 */
export async function getMostRecentMudBootTime(): Promise<number | null> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT boot_time FROM server_reboots
       WHERE COALESCE(initiated_by, '') <> ?
       ORDER BY boot_time DESC
       LIMIT 1`,
      [HOST_MONITOR_ACTOR],
    );

    if (rows.length > 0) {
      return rows[0].boot_time;
    }
    return null;
  } catch (error) {
    logger.error('Error getting most recent MUD boot time:', error);
    return null;
  }
}

/**
 * Record a MUD shutdown initiated by the web interface
 * Called BEFORE killing cycle_mud.sh so the shutdown is recorded
 */
export async function recordMudShutdown(
  bootTime: number,
  shutdownType: 'web_stop' | 'web_restart',
  initiatedBy: string,
  reason: string,
): Promise<number> {
  try {
    const shutdownTime = Math.floor(Date.now() / 1000);
    const uptimeSeconds = Math.max(shutdownTime - bootTime, 0);
    const canonicalShutdownType = shutdownType === 'web_stop' ? 'shutdown' : 'reboot';
    const auditedReason = `[${shutdownType}] ${reason}`;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO server_reboots
       (boot_time, shutdown_time, uptime_seconds, shutdown_type, initiated_by, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bootTime, shutdownTime, uptimeSeconds, canonicalShutdownType, initiatedBy, auditedReason],
    );

    logger.info(
      `Recorded MUD shutdown: type=${shutdownType}, by=${initiatedBy}, uptime=${uptimeSeconds}s`,
    );
    return result.insertId;
  } catch (error) {
    logger.error('Error recording MUD shutdown:', error);
    throw error;
  }
}

/**
 * Get MUD reboot history from server_reboots table
 * MUD reboots have shutdown_type set (manual, autoreboot, copyover, crash)
 */
export async function getMudRebootHistory(limit: number = 20): Promise<
  Array<{
    rebootTime: number;
    uptimeBeforeReboot: number;
    shutdownType: string;
    initiatedBy: string | null;
    reason: string | null;
  }>
> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        boot_time as rebootTime,
        uptime_seconds as uptimeBeforeReboot,
        shutdown_type as shutdownType,
        initiated_by as initiatedBy,
        reason
       FROM server_reboots
       WHERE COALESCE(initiated_by, '') <> ?
       ORDER BY boot_time DESC
       LIMIT ?`,
      [HOST_MONITOR_ACTOR, limit],
    );

    return rows.map((row) => ({
      rebootTime: row.rebootTime || 0,
      uptimeBeforeReboot: row.uptimeBeforeReboot || 0,
      shutdownType: row.shutdownType || 'unknown',
      initiatedBy: row.initiatedBy || null,
      reason: row.reason || null,
    }));
  } catch (error) {
    logger.error('Error fetching MUD reboot history:', error);
    return [];
  }
}

/**
 * Poll for boot_time changes and record new reboots
 * This function should be called periodically (e.g., every 60 seconds)
 */
let lastKnownBootTime: number | null = null;

export async function pollBootTime(): Promise<void> {
  try {
    const currentBootTime = await getCurrentBootTime();

    if (!currentBootTime) {
      return;
    }

    // First run - initialize
    if (lastKnownBootTime === null) {
      lastKnownBootTime = currentBootTime;
      return;
    }

    // Boot time changed - server rebooted
    if (currentBootTime !== lastKnownBootTime) {
      const shutdownTime = Math.floor(Date.now() / 1000);

      // The canonical lifecycle table only accepts complete intervals.
      await recordReboot(lastKnownBootTime, shutdownTime);

      logger.info(
        `Server reboot detected! Old boot: ${lastKnownBootTime}, New boot: ${currentBootTime}`,
      );
      lastKnownBootTime = currentBootTime;
    }
  } catch (error) {
    logger.error('Error polling boot time:', error);
  }
}

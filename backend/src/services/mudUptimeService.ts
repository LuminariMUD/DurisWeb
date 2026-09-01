import { pool } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import logger from '../utils/logger.js';

interface MudUptimeStats {
  currentUptime: number | null;
  averageUptime: number | null;
  longestUptime: number | null;
  totalReboots: number;
  rebootsLast30Days: number;
}

/**
 * Calculate MUD uptime statistics from server_reboots table
 * MUD reboots have shutdown_type set (not NULL)
 */
export async function getMudUptimeStats(): Promise<MudUptimeStats> {
  try {
    // Get current MUD uptime from health metrics
    const [currentRows] = await pool.query<RowDataPacket[]>(
      `SELECT mud_uptime_seconds
       FROM server_health_metrics
       WHERE mud_is_running = 1
       ORDER BY recorded_at DESC
       LIMIT 1`,
    );

    const currentUptime = currentRows.length > 0 ? currentRows[0].mud_uptime_seconds : null;

    // Get MUD reboot stats from server_reboots table
    const [statsRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        AVG(
          CASE
            WHEN uptime_seconds IS NOT NULL THEN uptime_seconds
            ELSE 0
          END
        ) as avgUptime,
        MAX(uptime_seconds) as maxUptime,
        COUNT(*) as totalReboots,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as rebootsLast30Days
       FROM server_reboots
       WHERE shutdown_type IS NOT NULL`,
    );

    const stats = statsRows[0];

    // Calculate average including current session
    let totalUptime = (stats.avgUptime || 0) * (stats.totalReboots || 0);
    let sessionCount = stats.totalReboots || 0;

    if (currentUptime) {
      totalUptime += currentUptime;
      sessionCount += 1;
    }

    const averageUptime = sessionCount > 0 ? Math.round(totalUptime / sessionCount) : null;
    const longestUptime = Math.max(stats.maxUptime || 0, currentUptime || 0);

    return {
      currentUptime,
      averageUptime,
      longestUptime: longestUptime > 0 ? longestUptime : null,
      totalReboots: stats.totalReboots || 0,
      rebootsLast30Days: stats.rebootsLast30Days || 0,
    };
  } catch (error) {
    logger.error('Error calculating MUD uptime stats:', error);
    return {
      currentUptime: null,
      averageUptime: null,
      longestUptime: null,
      totalReboots: 0,
      rebootsLast30Days: 0,
    };
  }
}

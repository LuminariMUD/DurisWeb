import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { pool as db } from '../db/connection.js';
import { getDmsProcessStats } from './processMonitor.js';
import { getOnlineCount } from './mudAuctionClient.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

const MUD_DIR = process.env.MUD_DIR!;

// Module-level interval ID for cleanup
let healthMonitorIntervalId: NodeJS.Timeout | null = null;

export interface ServerHealth {
  // MUD Server
  mudIsRunning: boolean;
  mudPid: number | null;
  mudUptimeSeconds: number;
  mudCpuPercent: number;
  mudMemoryMb: number;

  // Player Activity
  onlinePlayers: number;

  // Database
  dbConnected: boolean;
  dbQueryTimeMs: number;
  dbConnectionPoolUsed: number;
  dbConnectionPoolTotal: number;

  // System Resources
  systemLoad1m: number;
  systemLoad5m: number;
  systemLoad15m: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskPercent: number;

  // WebSocket
  websocketConnections: number;

  // Incidents
  crashesLastHour: number;
  crashesLast24h: number;
}

export interface HealthStatus {
  status: 'operational' | 'degraded' | 'offline' | 'maintenance';
  message: string;
}

/**
 * Get disk usage for MUD directory
 */
async function getDiskUsage(): Promise<{ used: number; total: number; percent: number }> {
  try {
    const { stdout } = await execAsync(`df -BG ${MUD_DIR} | tail -1`);
    const parts = stdout.trim().split(/\s+/);

    const total = parseInt(parts[1].replace('G', ''), 10);
    const used = parseInt(parts[2].replace('G', ''), 10);
    const percent = parseInt(parts[4].replace('%', ''), 10);

    return { used, total, percent };
  } catch {
    return { used: 0, total: 0, percent: 0 };
  }
}

/**
 * Get system load averages
 */
function getSystemLoad(): { load1m: number; load5m: number; load15m: number } {
  const loads = os.loadavg();
  return {
    load1m: Math.round(loads[0] * 100) / 100,
    load5m: Math.round(loads[1] * 100) / 100,
    load15m: Math.round(loads[2] * 100) / 100,
  };
}

/**
 * get online player count from mud websocket state
 */
export function getOnlinePlayerCount(): number {
  return getOnlineCount();
}

/**
 * Test database connection and query time
 */
async function testDatabaseHealth(): Promise<{
  connected: boolean;
  queryTimeMs: number;
}> {
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    const queryTime = Date.now() - start;

    return {
      connected: true,
      queryTimeMs: queryTime,
    };
  } catch {
    return {
      connected: false,
      queryTimeMs: 0,
    };
  }
}

/**
 * Get database connection pool stats
 */
function getDatabasePoolStats(): { used: number; total: number } {
  // MySQL2 pool stats
  try {
    const pool = db.pool;
    return {
      used: (pool as any)._allConnections?.length || 0,
      total: (pool as any).config?.connectionLimit || 10,
    };
  } catch {
    return { used: 0, total: 10 };
  }
}

/**
 * Get crash count for time window
 */
async function getCrashCount(hours: number): Promise<number> {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) as count FROM server_incidents WHERE incident_type = 'crash' AND started_at >= NOW() - INTERVAL ${hours} HOUR AND resolved = 0`
    );
    const result = (rows as any[])[0];

    return result?.count || 0;
  } catch {
    return 0;
  }
}

/**
 * Get current WebSocket connection count (will be injected)
 */
let websocketConnectionCount = 0;

export function updateWebSocketCount(count: number): void {
  websocketConnectionCount = count;
}

/**
 * Get complete server health metrics
 */
export async function getServerHealth(): Promise<ServerHealth> {
  const [processStats, diskUsage, dbHealth, poolStats] = await Promise.all([
    getDmsProcessStats(),
    getDiskUsage(),
    testDatabaseHealth(),
    Promise.resolve(getDatabasePoolStats()),
  ]);
  const onlinePlayers = getOnlinePlayerCount();

  const systemLoad = getSystemLoad();

  const [crashesLastHour, crashesLast24h] = await Promise.all([
    getCrashCount(1),
    getCrashCount(24),
  ]);

  return {
    mudIsRunning: processStats.isRunning,
    mudPid: processStats.pid,
    mudUptimeSeconds: processStats.uptime,
    mudCpuPercent: processStats.cpu,
    mudMemoryMb: processStats.memory,

    onlinePlayers,

    dbConnected: dbHealth.connected,
    dbQueryTimeMs: dbHealth.queryTimeMs,
    dbConnectionPoolUsed: poolStats.used,
    dbConnectionPoolTotal: poolStats.total,

    systemLoad1m: systemLoad.load1m,
    systemLoad5m: systemLoad.load5m,
    systemLoad15m: systemLoad.load15m,
    diskUsedGb: diskUsage.used,
    diskTotalGb: diskUsage.total,
    diskPercent: diskUsage.percent,

    websocketConnections: websocketConnectionCount,

    crashesLastHour,
    crashesLast24h,
  };
}

/**
 * Determine overall system status
 */
export function getHealthStatus(health: ServerHealth): HealthStatus {
  // Critical: MUD offline
  if (!health.mudIsRunning) {
    return {
      status: 'offline',
      message: 'MUD Server is offline',
    };
  }

  // Critical: Database offline
  if (!health.dbConnected) {
    return {
      status: 'offline',
      message: 'Database connection failed',
    };
  }

  // Degraded: Recent crashes
  if (health.crashesLastHour > 0) {
    return {
      status: 'degraded',
      message: `${health.crashesLastHour} crash(es) in the last hour`,
    };
  }

  // Degraded: High CPU
  if (health.mudCpuPercent > 80) {
    return {
      status: 'degraded',
      message: 'High CPU usage',
    };
  }

  // Degraded: High memory (80% of 2GB production RAM)
  if (health.mudMemoryMb > 1600) {
    return {
      status: 'degraded',
      message: 'High memory usage',
    };
  }

  // Degraded: Disk space low
  if (health.diskPercent > 90) {
    return {
      status: 'degraded',
      message: 'Low disk space',
    };
  }

  // All good!
  return {
    status: 'operational',
    message: 'All systems operational',
  };
}

/**
 * Store health metrics to database
 */
export async function recordHealthMetrics(health: ServerHealth): Promise<void> {
  try {
    await db.query(
      `INSERT INTO server_health_metrics (
        recorded_at, mud_is_running, mud_pid, mud_uptime_seconds, mud_cpu_percent, mud_memory_mb,
        online_players, db_connected, db_query_time_ms, db_connection_pool_used, db_connection_pool_total,
        system_load_1m, system_load_5m, system_load_15m, disk_used_gb, disk_total_gb, disk_percent,
        websocket_connections, crashes_last_hour, crashes_last_24h
      ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        health.mudIsRunning ? 1 : 0,
        health.mudPid,
        health.mudUptimeSeconds,
        health.mudCpuPercent,
        health.mudMemoryMb,
        health.onlinePlayers,
        health.dbConnected ? 1 : 0,
        health.dbQueryTimeMs,
        health.dbConnectionPoolUsed,
        health.dbConnectionPoolTotal,
        health.systemLoad1m,
        health.systemLoad5m,
        health.systemLoad15m,
        health.diskUsedGb,
        health.diskTotalGb,
        health.diskPercent,
        health.websocketConnections,
        health.crashesLastHour,
        health.crashesLast24h
      ]
    );
  } catch (error) {
    logger.error('Error recording health metrics:', error);
  }
}

/**
 * Get historical health metrics with intelligent aggregation
 * - <= 24 hours: Return raw data (every 30 seconds)
 * - > 24 hours and <= 168 hours (7 days): Aggregate by 5 minutes
 * - > 168 hours: Aggregate by 1 hour
 */
export async function getHealthHistory(hours: number = 24): Promise<any[]> {
  try {
    let query: string;

    if (hours <= 24) {
      // Raw data for last 24 hours
      query = `SELECT * FROM server_health_metrics
               WHERE recorded_at >= NOW() - INTERVAL ${hours} HOUR
               ORDER BY recorded_at ASC`;
    } else if (hours <= 168) {
      // 5-minute aggregation for 24h - 7 days
      const interval = 300;
      query = `SELECT
                 FROM_UNIXTIME(time_bucket * ${interval}) as recorded_at,
                 MAX(mud_is_running) as mud_is_running,
                 AVG(mud_cpu_percent) as mud_cpu_percent,
                 AVG(mud_memory_mb) as mud_memory_mb,
                 AVG(online_players) as online_players,
                 AVG(db_query_time_ms) as db_query_time_ms,
                 AVG(disk_percent) as disk_percent,
                 AVG(system_load_1m) as system_load_1m
               FROM (
                 SELECT
                   FLOOR(UNIX_TIMESTAMP(recorded_at) / ${interval}) as time_bucket,
                   mud_is_running,
                   mud_cpu_percent,
                   mud_memory_mb,
                   online_players,
                   db_query_time_ms,
                   disk_percent,
                   system_load_1m
                 FROM server_health_metrics
                 WHERE recorded_at >= NOW() - INTERVAL ${hours} HOUR
               ) as bucketed
               GROUP BY time_bucket
               ORDER BY time_bucket ASC`;
    } else {
      // 1-hour aggregation for > 7 days
      const interval = 3600;
      query = `SELECT
                 FROM_UNIXTIME(time_bucket * ${interval}) as recorded_at,
                 MAX(mud_is_running) as mud_is_running,
                 AVG(mud_cpu_percent) as mud_cpu_percent,
                 AVG(mud_memory_mb) as mud_memory_mb,
                 AVG(online_players) as online_players,
                 AVG(db_query_time_ms) as db_query_time_ms,
                 AVG(disk_percent) as disk_percent,
                 AVG(system_load_1m) as system_load_1m
               FROM (
                 SELECT
                   FLOOR(UNIX_TIMESTAMP(recorded_at) / ${interval}) as time_bucket,
                   mud_is_running,
                   mud_cpu_percent,
                   mud_memory_mb,
                   online_players,
                   db_query_time_ms,
                   disk_percent,
                   system_load_1m
                 FROM server_health_metrics
                 WHERE recorded_at >= NOW() - INTERVAL ${hours} HOUR
               ) as bucketed
               GROUP BY time_bucket
               ORDER BY time_bucket ASC`;
    }

    const [rows] = await db.query(query);
    return rows as any[];
  } catch (error) {
    logger.error('Error fetching health history:', error);
    return [];
  }
}

/**
 * Get uptime percentage for a time period
 */
export async function getUptimePercentage(days: number = 30): Promise<number> {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) as total_checks, SUM(mud_is_running) as running_checks
       FROM server_health_metrics
       WHERE recorded_at >= NOW() - INTERVAL ${days} DAY`
    );
    const result = (rows as any[])[0];

    if (!result || result.total_checks === 0) {
      return 100;
    }

    const uptime = (result.running_checks / result.total_checks) * 100;
    return Math.round(uptime * 100) / 100;
  } catch {
    return 100;
  }
}

/**
 * Start health monitoring interval
 */
export function startHealthMonitoring(): void {
  logger.info('Starting server health monitoring...');

  // Record metrics every 5 minutes - store interval ID for cleanup
  healthMonitorIntervalId = setInterval(async () => {
    try {
      const health = await getServerHealth();
      await recordHealthMetrics(health);
    } catch (error) {
      logger.error('Error in health monitoring:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Also record initial metrics
  (async () => {
    try {
      const health = await getServerHealth();
      await recordHealthMetrics(health);
    } catch (error) {
      logger.error('Error recording initial health metrics:', error);
    }
  })();
}

/**
 * Stop health monitoring (for graceful shutdown)
 */
export function stopHealthMonitoring(): void {
  if (healthMonitorIntervalId) {
    clearInterval(healthMonitorIntervalId);
    healthMonitorIntervalId = null;
    logger.info('Server health monitoring stopped');
  }
}

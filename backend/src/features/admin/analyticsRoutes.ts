import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth, requireOverlord } from '../../middleware/auth.js';
import {
  getOverviewStats,
  getForumStats,
  getPvPStats,
  getPlayerStats,
  getPlayerActivity,
  getWhoList,
} from '../../services/analyticsService.js';
import { getServerHealth } from '../../services/serverMonitor.js';
import { getPeakPlayerCount } from '../../services/statisticsParser.js';
import { getDmsProcessStats } from '../../services/processMonitor.js';
import { pool as db } from '../../db/connection.js';
import { requestWhoList, isMudConnected, getMudBootTime } from '../../services/mudAuctionClient.js';
import { getOnlinePlayers as getOnlinePlayersFromRedis } from '../../services/onlinePlayersService.js';

export const adminAnalyticsRoutes: IRouter = Router();

// ============================================================================
// Analytics Dashboard Routes
// ============================================================================

/**
 * GET /api/admin/analytics/overview
 * Get overview statistics for dashboard
 */
adminAnalyticsRoutes.get(
  '/analytics/overview',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const stats = await getOverviewStats();

      // Also get peak from flatfiles if database has no data
      if (stats.peakPlayerCount === 0) {
        const peakData = await getPeakPlayerCount();
        stats.peakPlayerCount = peakData.count;
        stats.peakPlayerTimestamp = peakData.timestamp?.toISOString() || null;
      }

      return res.json({ stats });
    } catch (error) {
      logger.error('Get overview stats error:', error);
      return res.status(500).json({ error: 'Failed to get overview statistics' });
    }
  },
);

adminAnalyticsRoutes.get('/mud-boot-time', requireAuth, async (_req: Request, res: Response) => {
  try {
    const bootTime = await getMudBootTime();
    return res.json({ bootTime });
  } catch (error) {
    logger.error('Get mud boot time error:', error);
    return res.status(500).json({ error: 'Failed to get MUD boot time' });
  }
});

/**
 * GET /api/admin/analytics/forum
 * Get forum analytics
 */
adminAnalyticsRoutes.get(
  '/analytics/forum',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const stats = await getForumStats();
      return res.json({ stats });
    } catch (error) {
      logger.error('Get forum stats error:', error);
      return res.status(500).json({ error: 'Failed to get forum statistics' });
    }
  },
);

/**
 * GET /api/admin/analytics/pvp
 * Get PvP analytics
 */
adminAnalyticsRoutes.get(
  '/analytics/pvp',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const stats = await getPvPStats();
      return res.json({ stats });
    } catch (error) {
      logger.error('Get PvP stats error:', error);
      return res.status(500).json({ error: 'Failed to get PvP statistics' });
    }
  },
);

/**
 * GET /api/admin/analytics/players
 * Get player demographics and statistics
 */
adminAnalyticsRoutes.get(
  '/analytics/players',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const stats = await getPlayerStats();
      return res.json({ stats });
    } catch (error) {
      logger.error('Get player stats error:', error);
      return res.status(500).json({ error: 'Failed to get player statistics' });
    }
  },
);

/**
 * GET /api/admin/analytics/activity
 * Get player activity over time
 */
adminAnalyticsRoutes.get(
  '/analytics/activity',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const activity = await getPlayerActivity(hours);
      return res.json({ activity });
    } catch (error) {
      logger.error('Get player activity error:', error);
      return res.status(500).json({ error: 'Failed to get player activity' });
    }
  },
);

/**
 * GET /api/admin/analytics/server
 * Get server health and resource usage
 */
adminAnalyticsRoutes.get(
  '/analytics/server',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const [serverHealth, dmsProcess] = await Promise.all([
        getServerHealth(),
        getDmsProcessStats(),
      ]);

      // Transform to match frontend expectations
      const health = {
        diskSpace: {
          used: serverHealth.diskSpace.used,
          total: serverHealth.diskSpace.total,
          available: serverHealth.diskSpace.total - serverHealth.diskSpace.used,
        },
        memory: {
          used: serverHealth.memoryUsage.used,
          total: serverHealth.memoryUsage.total,
          free: serverHealth.memoryUsage.total - serverHealth.memoryUsage.used,
        },
        uptime: serverHealth.uptimeMs,
        database: {
          status: serverHealth.databaseStatus.connected ? 'healthy' : 'disconnected',
          connected: serverHealth.databaseStatus.connected,
          tables: serverHealth.tableSizes.map((t) => ({
            name: t.tableName,
            size: t.sizeBytes,
            rows: t.rowCount,
          })),
        },
        dmsProcess: {
          cpu: dmsProcess.cpu,
          memory: dmsProcess.memory,
          memoryPercent: dmsProcess.memoryPercent,
          uptime: dmsProcess.uptime,
          pid: dmsProcess.pid,
          isRunning: dmsProcess.isRunning,
        },
      };

      return res.json({ health });
    } catch (error) {
      logger.error('Get server health error:', error);
      return res.status(500).json({ error: 'Failed to get server health' });
    }
  },
);

/**
 * GET /api/admin/who
 * Get WHO list (currently online players) from the MUD's namespaced presence snapshot
 */
adminAnalyticsRoutes.get(
  '/who',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const redisPlayers = await getOnlinePlayersFromRedis();
      const now = Date.now();

      if (redisPlayers.length > 0) {
        const players = redisPlayers.map((p) => ({
          char_name: p.name,
          account: p.account,
          last_ip: p.ip,
          level: p.level,
          race: p.race,
          class: p.class,
          faction: p.racewar,
          client: p.client,
          clientVersion: p.clientVersion,
          uptime_seconds: p.loginTime > 0 ? Math.floor((now - p.loginTime * 1000) / 1000) : 0,
        }));
        return res.json({ players, source: 'redis' });
      }

      // fallback to database if redis is empty
      const players = await getWhoList();
      return res.json({ players, source: 'database' });
    } catch (error) {
      logger.error('Get WHO list error:', error);
      return res.status(500).json({ error: 'Failed to get WHO list' });
    }
  },
);

/**
 * POST /api/admin/analytics/cleanup-connections
 * Clean up stale ip_info records and return updated WHO list
 */
adminAnalyticsRoutes.post(
  '/analytics/cleanup-connections',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      // Step 1: Clean up stale connections (connected >1 hour ago, no disconnect)
      const [cleanupResult] = await db.query(
        `UPDATE ip_info
       SET last_disconnect = NOW()
       WHERE last_disconnect IS NULL
         AND last_connect < DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      );

      const rowsAffected = (cleanupResult as any).affectedRows;

      // Step 2: Request fresh wholist from MUD via websocket (optional, for login history tracking)
      const mudConnected = isMudConnected();
      if (mudConnected) {
        requestWhoList();
      }

      // Step 3: Return current state from redis
      const whoList = await getOnlinePlayersFromRedis();

      return res.json({
        success: true,
        message: `Cleaned up ${rowsAffected} stale connection(s)${mudConnected ? ', requested fresh wholist from MUD' : ' (MUD not connected)'}`,
        whoList,
      });
    } catch (error) {
      logger.error('Cleanup connections error:', error);
      return res.status(500).json({ error: 'Failed to cleanup connections' });
    }
  },
);

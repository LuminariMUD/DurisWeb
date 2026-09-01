import { Router, Request, Response, type IRouter } from 'express';
import { pool as db } from '../db/connection.js';
import logger from '../utils/logger.js';

const router: IRouter = Router();

/**
 * GET /api/status
 * Public endpoint for server status (no auth required)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { getServerHealth, getHealthStatus } = await import('../services/serverHealthService.js');

    const health = await getServerHealth();
    const status = getHealthStatus(health);

    // Return limited public information
    return res.json({
      status: status.status,
      message: status.message,
      mudIsRunning: health.mudIsRunning,
      onlinePlayers: health.onlinePlayers,
      uptimeSeconds: health.mudUptimeSeconds,
      lastUpdated: new Date(),
    });
  } catch (error) {
    logger.error('Get public status error:', error);
    return res.status(500).json({
      status: 'offline',
      message: 'Unable to determine server status',
      mudIsRunning: false,
      onlinePlayers: 0,
      uptimeSeconds: 0,
      lastUpdated: new Date(),
    });
  }
});

/**
 * GET /api/status/uptime
 * Public uptime percentage (last 90 days)
 */
router.get('/uptime', async (_req: Request, res: Response) => {
  try {
    const { getUptimePercentage } = await import('../services/serverHealthService.js');

    const [last30Days, last90Days] = await Promise.all([
      getUptimePercentage(30),
      getUptimePercentage(90),
    ]);

    return res.json({
      last30Days,
      last90Days,
    });
  } catch (error) {
    logger.error('Get uptime error:', error);
    return res.status(500).json({ error: 'Failed to get uptime' });
  }
});

/**
 * GET /api/status/incidents
 * Public incident list (last 90 days)
 */
router.get('/incidents', async (_req: Request, res: Response) => {
  try {
    const [incidents] = await db.query(
      `SELECT id, started_at, ended_at, duration_seconds, incident_type, severity, title, description, resolved
       FROM server_incidents
       WHERE started_at >= NOW() - INTERVAL 90 DAY
       AND public_visible = 1
       ORDER BY started_at DESC`,
    );

    return res.json({ incidents });
  } catch (error) {
    logger.error('Get public incidents error:', error);
    return res.status(500).json({ error: 'Failed to get incidents' });
  }
});

/**
 * GET /api/status/history
 * Uptime history for status calendar (last 90 days)
 */
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const [history] = await db.query(
      `SELECT
        DATE(recorded_at) as date,
        COUNT(*) as total_checks,
        SUM(mud_is_running) as running_checks,
        ROUND((SUM(mud_is_running) / COUNT(*)) * 100, 2) as uptime_percent
       FROM server_health_metrics
       WHERE recorded_at >= NOW() - INTERVAL 90 DAY
       GROUP BY DATE(recorded_at)
       ORDER BY date ASC`,
    );

    return res.json({ history });
  } catch (error) {
    logger.error('Get status history error:', error);
    return res.status(500).json({ error: 'Failed to get status history' });
  }
});

export default router;

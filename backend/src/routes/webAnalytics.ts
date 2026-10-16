import { Router, Request, Response } from 'express';
import { requireAuth, requireOverlord } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import {
  getWebOverviewStats,
  getTopPages,
  getReferrerStats,
  getDeviceStats,
  getBrowserStats,
  getOSStats,
  getGeoStats,
  getTrafficOverTime,
  getRealtimeVisitors,
  getActiveVisitorCount,
  getRecentVisitors,
} from '../services/webAnalyticsService.js';

const router: Router = Router();

/**
 * Retire ungated collection for both router mounts and cached older clients.
 * Optional analytics must remain closed until the versioned choice flow is ready.
 */
router.post('/track', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Optional website analytics collection is unavailable' });
});

/**
 * GET /api/admin/analytics/web/overview
 * Get overview statistics (Overlord only)
 */
router.get('/admin/overview', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const stats = await getWebOverviewStats(days);
    const activeVisitors = await getActiveVisitorCount();

    return res.json({
      ...stats,
      activeVisitors,
    });
  } catch (error) {
    logger.error('Error fetching web overview stats:', error);
    return res.status(500).json({ error: 'Failed to fetch overview stats' });
  }
});

/**
 * GET /api/admin/analytics/web/pages
 * Get top pages (Overlord only)
 */
router.get('/admin/pages', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 20;
    const pages = await getTopPages(days, limit);

    return res.json({ data: pages });
  } catch (error) {
    logger.error('Error fetching top pages:', error);
    return res.status(500).json({ error: 'Failed to fetch top pages' });
  }
});

/**
 * GET /api/admin/analytics/web/referrers
 * Get traffic sources (Overlord only)
 */
router.get(
  '/admin/referrers',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const referrers = await getReferrerStats(days);

      return res.json({ data: referrers });
    } catch (error) {
      logger.error('Error fetching referrer stats:', error);
      return res.status(500).json({ error: 'Failed to fetch referrer stats' });
    }
  },
);

/**
 * GET /api/admin/analytics/web/devices
 * Get device/browser/OS breakdown (Overlord only)
 */
router.get('/admin/devices', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const [devices, browsers, osStats] = await Promise.all([
      getDeviceStats(days),
      getBrowserStats(days),
      getOSStats(days),
    ]);

    return res.json({
      devices,
      browsers,
      os: osStats,
    });
  } catch (error) {
    logger.error('Error fetching device stats:', error);
    return res.status(500).json({ error: 'Failed to fetch device stats' });
  }
});

/**
 * GET /api/admin/analytics/web/geo
 * Get geographic distribution (Overlord only)
 */
router.get('/admin/geo', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const geoStats = await getGeoStats(days);

    return res.json({ data: geoStats });
  } catch (error) {
    logger.error('Error fetching geo stats:', error);
    return res.status(500).json({ error: 'Failed to fetch geo stats' });
  }
});

/**
 * GET /api/admin/analytics/web/traffic
 * Get traffic over time for charts (Overlord only)
 */
router.get('/admin/traffic', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const interval = (req.query.interval as 'hour' | 'day') || 'day';
    const traffic = await getTrafficOverTime(days, interval);

    return res.json({ data: traffic });
  } catch (error) {
    logger.error('Error fetching traffic data:', error);
    return res.status(500).json({ error: 'Failed to fetch traffic data' });
  }
});

/**
 * GET /api/admin/analytics/web/realtime
 * Get real-time visitors (Overlord only)
 */
router.get(
  '/admin/realtime',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const visitors = await getRealtimeVisitors();
      const count = await getActiveVisitorCount();

      return res.json({
        count,
        visitors,
      });
    } catch (error) {
      logger.error('Error fetching realtime visitors:', error);
      return res.status(500).json({ error: 'Failed to fetch realtime visitors' });
    }
  },
);

/**
 * GET /api/admin/analytics/web/visitors
 * Get recent visitors list with pagination (Overlord only)
 */
router.get('/admin/visitors', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await getRecentVisitors(days, page, limit);

    return res.json({
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Error fetching recent visitors:', error);
    return res.status(500).json({ error: 'Failed to fetch recent visitors' });
  }
});

export default router;

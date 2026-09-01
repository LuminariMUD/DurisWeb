import express, { Router } from 'express';
import {
  getLastReboot,
  getRebootHistory,
  getUptimeStats,
  getMudRebootHistory,
} from '../services/serverRebootService.js';
import { getMudUptimeStats } from '../services/mudUptimeService.js';

const router: Router = express.Router();

/**
 * GET /api/server/reboot/current
 * Get current server boot time and uptime
 */
router.get('/current', async (_req, res, next) => {
  try {
    const reboot = await getLastReboot();

    if (!reboot) {
      return res.status(404).json({
        error: 'No reboot data available',
      });
    }

    return res.json(reboot);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/server/reboot/history
 * Get paginated reboot history
 *
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Results per page (default: 20, max: 100)
 */
router.get('/history', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const history = await getRebootHistory(page, limit);

    res.json(history);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/server/reboot/stats
 * Get uptime statistics
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await getUptimeStats();

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/server/reboot/mud-stats
 * Get MUD uptime statistics
 */
router.get('/mud-stats', async (_req, res, next) => {
  try {
    const mudStats = await getMudUptimeStats();

    res.json(mudStats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/server/reboot/mud-history
 * Get MUD reboot history
 */
router.get('/mud-history', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const mudHistory = await getMudRebootHistory(limit);

    res.json(mudHistory);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { getFactionActivity, getAvailableDates } from '../services/publicStatisticsService.js';
import logger from '../utils/logger.js';

const router: RouterType = Router();

/**
 * GET /api/public/statistics/faction-activity
 * get faction activity for a specific date (must be at least 1 day old)
 */
router.get('/faction-activity', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
    }

    // validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'invalid date format, use YYYY-MM-DD' });
    }

    const data = await getFactionActivity(date);
    return res.json({ data, date });
  } catch (error) {
    logger.error('get faction activity error:', error);
    return res.status(500).json({ error: 'failed to get faction activity' });
  }
});

/**
 * GET /api/public/statistics/available-dates
 * get list of dates that have statistics data
 */
router.get('/available-dates', async (_req: Request, res: Response) => {
  try {
    const dates = await getAvailableDates();
    return res.json({ dates });
  } catch (error) {
    logger.error('get available dates error:', error);
    return res.status(500).json({ error: 'failed to get available dates' });
  }
});

export default router;

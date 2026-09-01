import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import logger from '../utils/logger.js';
import {
  parsePagination,
  parseIntSafe,
  parseFloatSafe,
  parseBooleanSafe,
  sanitizeSearchString,
  validateEnum,
} from '../utils/validation.js';
import {
  getFragLeaderboard,
  getTopGainers,
  getFragRaces,
  getFragClasses,
  getCharacterFragStats,
  getAccountFragStats,
} from '../services/fragService.js';
import type {
  FragLeaderboardFilters,
  FragLeaderboardResponse,
  TopGainersResponse,
} from '../types/index.js';

const router: IRouter = Router();

/**
 * GET /api/frag/leaderboard
 * Get frag leaderboard with optional filters
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePagination(
      req.query.page as string,
      req.query.limit as string,
      50,
      100,
    );

    const filters: FragLeaderboardFilters = {
      racewar: req.query.racewar
        ? parseIntSafe(req.query.racewar as string, 0, 1, 2) || undefined
        : undefined,
      race: sanitizeSearchString(req.query.race as string, 50) || undefined,
      class: sanitizeSearchString(req.query.class as string, 50) || undefined,
      level_min: req.query.level_min
        ? parseIntSafe(req.query.level_min as string, 1, 1, 56)
        : undefined,
      level_max: req.query.level_max
        ? parseIntSafe(req.query.level_max as string, 56, 1, 56)
        : undefined,
      account_name: sanitizeSearchString(req.query.account_name as string, 50) || undefined,
      char_name: sanitizeSearchString(req.query.char_name as string, 50) || undefined,
      min_frags: req.query.min_frags
        ? parseFloatSafe(req.query.min_frags as string, 0, 0, 10000)
        : undefined,
      include_deleted: parseBooleanSafe(req.query.include_deleted as string),
      page,
      limit,
    };

    const { entries, total } = await getFragLeaderboard(filters);

    const totalPages = Math.ceil(total / limit);

    const response: FragLeaderboardResponse = {
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching frag leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch frag leaderboard' });
  }
});

/**
 * GET /api/frag/top-gainers
 * Get top frag gainers over a time period
 */
router.get('/top-gainers', async (req: Request, res: Response): Promise<void> => {
  try {
    const period = validateEnum(req.query.period as string, ['7d', '30d', '90d'] as const, '30d');
    const limit = parseIntSafe(req.query.limit as string, 50, 1, 100);

    const gainers = await getTopGainers(period, limit);

    const response: TopGainersResponse = {
      data: gainers,
      period,
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching top gainers:', error);
    res.status(500).json({ error: 'Failed to fetch top gainers' });
  }
});

/**
 * GET /api/frag/races
 * Get available races for autocomplete
 */
router.get('/races', async (_req: Request, res: Response) => {
  try {
    const races = await getFragRaces();
    res.json(races);
  } catch (error) {
    logger.error('Error fetching races:', error);
    res.status(500).json({ error: 'Failed to fetch races' });
  }
});

/**
 * GET /api/frag/classes
 * Get available classes for autocomplete
 */
router.get('/classes', async (_req: Request, res: Response) => {
  try {
    const classes = await getFragClasses();
    res.json(classes);
  } catch (error) {
    logger.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

/**
 * GET /api/frag/player/:char_name
 * Get frag statistics for a specific character
 */
router.get('/player/:char_name', async (req: Request, res: Response): Promise<void> => {
  try {
    const charName = req.params.char_name;
    const stats = await getCharacterFragStats(charName);

    if (!stats) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching character frag stats:', error);
    res.status(500).json({ error: 'Failed to fetch character frag stats' });
  }
});

/**
 * GET /api/frag/account/:account_name
 * Get all characters and their frag stats for an account
 */
router.get('/account/:account_name', async (req: Request, res: Response) => {
  try {
    const accountName = req.params.account_name;
    const characters = await getAccountFragStats(accountName);

    res.json(characters);
  } catch (error) {
    logger.error('Error fetching account frag stats:', error);
    res.status(500).json({ error: 'Failed to fetch account frag stats' });
  }
});

export default router;

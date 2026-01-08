import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import logger from '../utils/logger.js';
import {
  getUserList,
  banUser,
  unbanUser,
  getUserBanHistory,
  getUniqueRaces,
  getUniqueClasses,
  deleteCharacter
} from '../services/userManagementService.js';
import { requireAuth, requireOverlord } from '../middleware/auth.js';
import type { UserManagementFilters } from '../types/index.js';

const router: Router = Router();

// All user management routes require Overlord status (Level 62)
router.use(requireAuth, requireOverlord);

/**
 * GET /api/admin/users
 * Get paginated list of users with filters
 */
router.get(
  '/',
  [
    query('search').optional().isString().trim(),
    query('race').optional().isString().trim(),
    query('class').optional().isString().trim(),
    query('alignment').optional().isInt({ min: 1, max: 4 }).toInt(),
    query('ban_status').optional().isIn(['all', 'active', 'banned']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sort_by').optional().isIn(['account_name', 'character_name', 'race', 'class', 'email', 'last_login']),
    query('sort_order').optional().isIn(['asc', 'desc'])
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const filters: UserManagementFilters = {
        search: req.query.search as string,
        race: req.query.race as string,
        class: req.query.class as string,
        alignment: req.query.alignment ? parseInt(req.query.alignment as string) : undefined,
        ban_status: (req.query.ban_status as 'all' | 'active' | 'banned') || 'all',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        sort_by: (req.query.sort_by as any) || 'last_login',
        sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
      };

      const result = await getUserList(filters);
      return res.json(result);
    } catch (error) {
      logger.error('Error fetching user list:', error);
      return res.status(500).json({ error: 'Failed to fetch user list' });
    }
  }
);

/**
 * GET /api/admin/users/filters/races
 * Get list of unique races for filter dropdown
 */
router.get('/filters/races', async (_req: Request, res: Response) => {
  try {
    const races = await getUniqueRaces();
    return res.json(races);
  } catch (error) {
    logger.error('Error fetching races:', error);
    return res.status(500).json({ error: 'Failed to fetch races' });
  }
});

/**
 * GET /api/admin/users/filters/classes
 * Get list of unique classes for filter dropdown
 */
router.get('/filters/classes', async (_req: Request, res: Response) => {
  try {
    const classes = await getUniqueClasses();
    return res.json(classes);
  } catch (error) {
    logger.error('Error fetching classes:', error);
    return res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

/**
 * POST /api/admin/users/:accountName/ban
 * Ban a user
 */
router.post(
  '/:accountName/ban',
  [
    param('accountName').isString().trim().notEmpty(),
    body('reason').isString().trim().isLength({ min: 1, max: 1000 })
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { accountName } = req.params;
      const { reason } = req.body;
      const bannedBy = req.user!.accountName;

      await banUser(accountName, reason, bannedBy);

      return res.json({
        success: true,
        message: `User ${accountName} has been banned`
      });
    } catch (error) {
      logger.error('Error banning user:', error);
      return res.status(500).json({ error: 'Failed to ban user' });
    }
  }
);

/**
 * POST /api/admin/users/:accountName/unban
 * Unban a user
 */
router.post(
  '/:accountName/unban',
  [
    param('accountName').isString().trim().notEmpty()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { accountName } = req.params;
      const unbannedBy = req.user!.accountName;

      await unbanUser(accountName, unbannedBy);

      return res.json({
        success: true,
        message: `User ${accountName} has been unbanned`
      });
    } catch (error) {
      logger.error('Error unbanning user:', error);
      return res.status(500).json({ error: 'Failed to unban user' });
    }
  }
);

/**
 * GET /api/admin/users/:accountName/ban-history
 * Get user's ban history
 */
router.get(
  '/:accountName/ban-history',
  [
    param('accountName').isString().trim().notEmpty()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { accountName } = req.params;
      const history = await getUserBanHistory(accountName);

      return res.json(history);
    } catch (error) {
      logger.error('Error fetching ban history:', error);
      return res.status(500).json({ error: 'Failed to fetch ban history' });
    }
  }
);

/**
 * DELETE /api/admin/users/:accountName/characters/:characterName
 * Delete a character from an account
 */
router.delete(
  '/:accountName/characters/:characterName',
  [
    param('accountName').isString().trim().notEmpty(),
    param('characterName').isString().trim().notEmpty()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { accountName, characterName } = req.params;
      const deletedBy = req.user!.accountName;

      const result = await deleteCharacter(accountName, characterName, deletedBy);

      if (!result.success) {
        return res.status(404).json({ error: result.message });
      }

      return res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      logger.error('Error deleting character:', error);
      return res.status(500).json({ error: 'Failed to delete character' });
    }
  }
);

export default router;

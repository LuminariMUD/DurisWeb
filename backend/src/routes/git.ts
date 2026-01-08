import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import logger, { getErrorMessage } from '../utils/logger.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getCommits, getGitStatus } from '../services/gitService.js';

const router: RouterType = Router();

/**
 * GET /api/admin/git/commits
 * Get paginated list of git commits
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 50, max 100)
 * - refresh: boolean (force cache refresh)
 */
router.get('/commits', requireAuth, requirePermission('view_git_history'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const forceRefresh = req.query.refresh === 'true';

    const result = await getCommits(page, limit, forceRefresh);

    res.json(result);
  } catch (error) {
    logger.error('Error fetching git commits:', error);
    res.status(500).json({ error: 'Failed to fetch git commits', message: getErrorMessage(error) });
  }
});

/**
 * GET /api/admin/git/status
 * Get current deployment status
 */
router.get('/status', requireAuth, requirePermission('view_git_history'), async (_req: Request, res: Response) => {
  try {
    const status = await getGitStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error fetching git status:', error);
    res.status(500).json({ error: 'Failed to fetch git status', message: getErrorMessage(error) });
  }
});

export default router;

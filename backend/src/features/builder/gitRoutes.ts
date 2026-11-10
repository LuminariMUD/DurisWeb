import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { getZoneGitStatus, commitZoneFiles } from '../../services/gitService.js';
import { logBuilderActivity } from './shared.js';

export const builderGitRoutes: IRouter = Router();

// ========== Git Integration ==========

// GET /api/builder/zones/:id/git/status - Get git status for a zone
builderGitRoutes.get('/zones/:id/git/status', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const status = await getZoneGitStatus(zoneId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting zone git status:', error);
    res.status(500).json({ error: 'Failed to get git status', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/git/commit - Commit zone files to git
builderGitRoutes.post(
  '/zones/:id/git/commit',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const zoneId = req.params.id;
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'Commit message is required' });
        return;
      }

      const result = await commitZoneFiles(zoneId, message.trim());

      if (result.success) {
        // Log the action
        await logBuilderActivity(
          req.user?.accountName || 'unknown',
          'git_commit',
          zoneId,
          null,
          'zone',
          null,
          message.trim(),
          req.ip || req.socket.remoteAddress || null,
        );
      }

      res.json(result);
    } catch (error) {
      logger.error('Error committing zone files:', error);
      res.status(500).json({ error: 'Failed to commit', message: getErrorMessage(error) });
    }
  },
);

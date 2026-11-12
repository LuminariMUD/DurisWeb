import { Router, Request, Response, type IRouter } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getZoneGitStatus, commitZoneFiles } from '../../services/gitService.js';
import { logBuilderActivity } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderGitRoutes: IRouter = Router();

// ========== Git Integration ==========

// GET /api/builder/zones/:id/git/status - Get git status for a zone
builderGitRoutes.get('/zones/:id/git/status', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const status = await getZoneGitStatus(zoneId);
    res.json(status);
  } catch (error) {
    sendRouteError(res, error, 'Failed to get git status', 'Failed to get git status');
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
      sendRouteError(res, error, 'Failed to commit', 'Failed to commit');
    }
  },
);

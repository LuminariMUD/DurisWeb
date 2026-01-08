import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  getMudState,
  startMud,
  stopMud,
  restartMud,
} from '../services/mudControlService.js';

const router: IRouter = Router();

/**
 * GET /api/mud/status
 * Get current MUD state (public endpoint)
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const state = await getMudState();
    res.json({
      state: state.state,
      cycleMudPid: state.cycleMudPid,
      dmsPid: state.dmsPid,
      uptime: state.uptime,
      cpu: state.cpu,
      memory: state.memory,
      lastStartTime: state.lastStartTime?.toISOString() || null,
      lastStopTime: state.lastStopTime?.toISOString() || null,
      startedBy: state.startedBy,
    });
  } catch (error) {
    logger.error('Error getting MUD status:', error);
    res.status(500).json({ error: 'Failed to get MUD status' });
  }
});

/**
 * POST /api/mud/start
 * Start the MUD server
 */
router.post(
  '/start',
  requireAuth,
  requirePermission('mud_control'),
  async (req: Request, res: Response) => {
    try {
      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      const result = await startMud(accountName, ipAddress);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error starting MUD:', error);
      res.status(500).json({ error: 'Failed to start MUD' });
    }
  }
);

/**
 * POST /api/mud/stop
 * Stop the MUD server (reason required)
 */
router.post(
  '/stop',
  requireAuth,
  requirePermission('mud_control'),
  body('reason').notEmpty().withMessage('Reason is required'),
  async (req: Request, res: Response) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: errors.array()[0].msg });
      return;
    }

    try {
      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const { reason } = req.body;

      const result = await stopMud(accountName, ipAddress, reason);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error stopping MUD:', error);
      res.status(500).json({ error: 'Failed to stop MUD' });
    }
  }
);

/**
 * POST /api/mud/restart
 * Restart the MUD server (reason required)
 */
router.post(
  '/restart',
  requireAuth,
  requirePermission('mud_control'),
  body('reason').notEmpty().withMessage('Reason is required'),
  async (req: Request, res: Response) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: errors.array()[0].msg });
      return;
    }

    try {
      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const { reason } = req.body;

      const result = await restartMud(accountName, ipAddress, reason);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error restarting MUD:', error);
      res.status(500).json({ error: 'Failed to restart MUD' });
    }
  }
);

export default router;

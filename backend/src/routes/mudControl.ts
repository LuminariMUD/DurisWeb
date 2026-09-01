import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import logger from '../utils/logger.js';
import rateLimit from 'express-rate-limit';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validateMudControlReasonPayload } from '../utils/mudControlValidation.js';
import { getMudState, startMud, stopMud, restartMud } from '../services/mudControlService.js';

const router: IRouter = Router();

const mudControlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many MUD control requests; please try again later' },
});

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
  mudControlLimiter,
  async (req: Request, res: Response) => {
    try {
      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      const result = await startMud(accountName, ipAddress);

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error starting MUD:', error);
      return res.status(500).json({ error: 'Failed to start MUD' });
    }
  },
);

/**
 * POST /api/mud/stop
 * Stop the MUD server (reason required)
 */
router.post(
  '/stop',
  requireAuth,
  requirePermission('mud_control'),
  mudControlLimiter,
  async (req: Request, res: Response) => {
    try {
      const validationError = validateMudControlReasonPayload(req.body);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const { reason } = req.body;

      const result = await stopMud(accountName, ipAddress, reason);

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error stopping MUD:', error);
      return res.status(500).json({ error: 'Failed to stop MUD' });
    }
  },
);

/**
 * POST /api/mud/restart
 * Restart the MUD server (reason required)
 */
router.post(
  '/restart',
  requireAuth,
  requirePermission('mud_control'),
  mudControlLimiter,
  async (req: Request, res: Response) => {
    try {
      const validationError = validateMudControlReasonPayload(req.body);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const accountName = req.user!.accountName;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const { reason } = req.body;

      const result = await restartMud(accountName, ipAddress, reason);

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error('Error restarting MUD:', error);
      return res.status(500).json({ error: 'Failed to restart MUD' });
    }
  },
);

export default router;

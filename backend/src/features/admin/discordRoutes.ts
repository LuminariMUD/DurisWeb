import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validateIdParam } from '../../utils/validation.js';
import { testDiscordBot } from '../../services/discordService.js';
import {
  manualPostBattle,
  getDiscordDeliveryStatus,
  retryFailedDiscordDeliveries,
} from '../../services/pvpDiscordDelivery.js';

export const adminDiscordRoutes: IRouter = Router();

// ============================================
// Discord Integration
// ============================================

adminDiscordRoutes.get(
  '/discord/delivery',
  requireAuth,
  requirePermission('manage_front_page'),
  async (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await getDiscordDeliveryStatus());
    } catch {
      logger.error('[Discord] delivery_status_unavailable');
      return res.status(503).json({ error: 'Discord delivery status is unavailable' });
    }
  },
);

adminDiscordRoutes.post(
  '/discord/delivery/retry',
  requireAuth,
  requirePermission('manage_front_page'),
  async (_req: Request, res: Response) => {
    try {
      if (!(await retryFailedDiscordDeliveries())) {
        return res
          .status(409)
          .json({ error: 'Discord is unconfigured or busy; refresh status and try again' });
      }
      logger.info('[Discord] operator requested retry of failed deliveries');
      return res.json({ success: true });
    } catch {
      logger.error('[Discord] delivery_retry_unavailable');
      return res
        .status(503)
        .json({ error: 'Unable to queue failed deliveries; refresh status before retrying' });
    }
  },
);

/**
 * POST /api/admin/discord/test
 * test the configured Discord bot by sending a test message
 */
adminDiscordRoutes.post(
  '/discord/test',
  requireAuth,
  requirePermission('manage_front_page'),
  async (_req: Request, res: Response) => {
    try {
      const result = await testDiscordBot();
      return res.json(result);
    } catch (error) {
      logger.error('Discord bot test error:', error);
      return res.status(500).json({ success: false, error: 'failed to test Discord bot' });
    }
  },
);

/**
 * POST /api/admin/pvp/events/:id/discord
 * manually post a battle to discord
 */
adminDiscordRoutes.post(
  '/pvp/events/:id/discord',
  requireAuth,
  requirePermission('manage_front_page'),
  async (req: Request, res: Response) => {
    try {
      const eventId = validateIdParam(req.params.id);

      if (eventId === null) {
        return res.status(400).json({ error: 'invalid event id' });
      }

      const result = await manualPostBattle(eventId);

      if (result.success) {
        return res.json({ success: true, message: 'battle posted to discord' });
      }

      return res.status(400).json({ success: false, error: result.error });
    } catch (error) {
      logger.error('Discord manual post error:', error);
      return res.status(500).json({ success: false, error: 'failed to post to discord' });
    }
  },
);

import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as notificationService from '../services/unifiedNotificationService.js';
import { getErrorMessage } from '../utils/logger.js';
import { validateIdParam } from '../utils/validation.js';

const router: ExpressRouter = Router();

// ============================================================================
// GET /api/notifications - Get all notifications
// ============================================================================

router.get('/', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 100);
    const unreadOnly = req.query.unread_only === 'true';
    const offset = (page - 1) * limit;

    const { notifications, total } = await notificationService.getNotifications(accountName, {
      unreadOnly,
      limit,
      offset,
    });

    const unreadCount = await notificationService.getUnreadCount(accountName);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// GET /api/notifications/unread-count - Get unread count
// ============================================================================

router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const count = await notificationService.getUnreadCount(accountName);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// POST /api/notifications/:id/read - Mark notification as read
// ============================================================================

router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const id = validateIdParam(req.params.id);

    if (id === null) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await notificationService.markAsRead(id, accountName);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// POST /api/notifications/read-all - Mark all notifications as read
// ============================================================================

router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    await notificationService.markAllAsRead(accountName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// DELETE /api/notifications/:id - Delete notification
// ============================================================================

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const id = validateIdParam(req.params.id);

    if (id === null) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await notificationService.deleteNotification(id, accountName);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// Legacy routes for backwards compatibility (deprecated)
// ============================================================================

router.post('/:source/:id/read', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const id = validateIdParam(req.params.id);

    if (id === null) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await notificationService.markAsRead(id, accountName);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.delete('/:source/:id', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const id = validateIdParam(req.params.id);

    if (id === null) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await notificationService.deleteNotification(id, accountName);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;

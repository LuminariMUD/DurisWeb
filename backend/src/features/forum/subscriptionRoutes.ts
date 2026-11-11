import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { body, param, validationResult } from 'express-validator';
import {
  getCategoryById,
  subscribeToThread,
  subscribeToCategory,
  unsubscribeFromThread,
  unsubscribeFromCategory,
  isSubscribedToThread,
  isSubscribedToCategory,
  getUserSubscriptions,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  deleteNotification,
} from '../../services/forumService.js';
import { requireAuth } from '../../middleware/auth.js';
import { getAuthorizedThread } from './shared.js';

export const forumSubscriptionRoutes: IRouter = Router();

// ============================================================================
// Subscription Routes
// ============================================================================

/**
 * GET /api/forum/subscriptions
 * Get user's thread and category subscriptions
 */
forumSubscriptionRoutes.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const subscriptions = await getUserSubscriptions(req.user.accountName);

    return res.json({ subscriptions });
  } catch (error) {
    logger.error('Get subscriptions error:', error);
    return res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

/**
 * POST /api/forum/threads/:id/subscribe
 * Subscribe to a thread
 */
forumSubscriptionRoutes.post(
  '/threads/:id/subscribe',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('notifyOnReply').optional().isBoolean().withMessage('notifyOnReply must be boolean'),
    body('notificationPreference').optional().isIn(['all', 'mentions', 'none']),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'view');
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this thread' });
      }
      const notificationPreference = req.body.notificationPreference || 'all';

      await subscribeToThread(req.user.accountName, threadId, notificationPreference);

      return res.json({ success: true, message: 'Successfully subscribed to thread' });
    } catch (error) {
      logger.error('Subscribe to thread error:', error);
      if (getErrorMessage(error) === 'Thread not found') {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.status(500).json({ error: 'Failed to subscribe to thread' });
    }
  },
);

/**
 * DELETE /api/forum/threads/:id/subscribe
 * Unsubscribe from a thread
 */
forumSubscriptionRoutes.delete(
  '/threads/:id/subscribe',
  requireAuth,
  [param('id').isInt().withMessage('Thread ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'view');
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this thread' });
      }

      await unsubscribeFromThread(req.user.accountName, threadId);

      return res.json({ success: true, message: 'Successfully unsubscribed from thread' });
    } catch (error) {
      logger.error('Unsubscribe from thread error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe from thread' });
    }
  },
);

/**
 * GET /api/forum/threads/:id/is-subscribed
 * Check if user is subscribed to a thread
 */
forumSubscriptionRoutes.get(
  '/threads/:id/is-subscribed',

  [param('id').isInt().withMessage('Thread ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'view');
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this thread' });
      }

      const isSubscribed = await isSubscribedToThread(req.user.accountName, threadId);

      return res.json({ isSubscribed });
    } catch (error) {
      logger.error('Check subscription error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  },
);

/**
 * POST /api/forum/categories/:id/subscribe
 * Subscribe to a category
 */
forumSubscriptionRoutes.post(
  '/categories/:id/subscribe',
  requireAuth,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('notificationPreference').optional().isIn(['all', 'mentions', 'none']),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const categoryId = parseInt(req.params.id);
      const category = await getCategoryById(categoryId, req.user.permissions);
      if (!category) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }
      const notificationPreference = req.body.notificationPreference || 'all';

      await subscribeToCategory(req.user.accountName, categoryId, notificationPreference);

      return res.json({ success: true, message: 'Successfully subscribed to category' });
    } catch (error) {
      logger.error('Subscribe to category error:', error);
      if (getErrorMessage(error) === 'Category not found') {
        return res.status(404).json({ error: 'Category not found' });
      }
      return res.status(500).json({ error: 'Failed to subscribe to category' });
    }
  },
);

/**
 * DELETE /api/forum/categories/:id/subscribe
 * Unsubscribe from a category
 */
forumSubscriptionRoutes.delete(
  '/categories/:id/subscribe',
  requireAuth,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const categoryId = parseInt(req.params.id);
      const category = await getCategoryById(categoryId, req.user.permissions);
      if (!category) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      await unsubscribeFromCategory(req.user.accountName, categoryId);

      return res.json({ success: true, message: 'Successfully unsubscribed from category' });
    } catch (error) {
      logger.error('Unsubscribe from category error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe from category' });
    }
  },
);

/**
 * GET /api/forum/categories/:id/is-subscribed
 * Check if user is subscribed to a category
 */
forumSubscriptionRoutes.get(
  '/categories/:id/is-subscribed',

  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const categoryId = parseInt(req.params.id);
      const category = await getCategoryById(categoryId, req.user.permissions);
      if (!category) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const isSubscribed = await isSubscribedToCategory(req.user.accountName, categoryId);

      return res.json({ isSubscribed });
    } catch (error) {
      logger.error('Check subscription error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  },
);

// ============================================================================
// Notification Routes
// ============================================================================

/**
 * GET /api/forum/notifications
 * Get user notifications with pagination
 */
forumSubscriptionRoutes.get('/notifications', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await getUserNotifications(req.user.accountName, page, limit, unreadOnly);
    const unreadCount = await getUnreadNotificationCount(req.user.accountName);

    return res.json({
      notifications: result.notifications,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * GET /api/forum/notifications/unread-count
 * Get unread notification count
 */
forumSubscriptionRoutes.get('/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const count = await getUnreadNotificationCount(req.user.accountName);

    return res.json({ unreadCount: count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * POST /api/forum/notifications/:id/read
 * Mark notification as read
 */
forumSubscriptionRoutes.post(
  '/notifications/:id/read',
  requireAuth,
  [param('id').isInt().withMessage('Notification ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const notificationId = parseInt(req.params.id);

      await markNotificationAsRead(notificationId, req.user.accountName);

      return res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      logger.error('Mark notification read error:', error);
      return res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  },
);

/**
 * POST /api/forum/notifications/read-all
 * Mark all notifications as read
 */
forumSubscriptionRoutes.post(
  '/notifications/read-all',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      await markAllNotificationsAsRead(req.user.accountName);

      return res.json({
        success: true,
        message: 'All notifications marked as read',
      });
    } catch (error) {
      logger.error('Mark all notifications read error:', error);
      return res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  },
);

/**
 * DELETE /api/forum/notifications/:id
 * Delete notification
 */
forumSubscriptionRoutes.delete(
  '/notifications/:id',
  requireAuth,
  [param('id').isInt().withMessage('Notification ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const notificationId = parseInt(req.params.id);

      await deleteNotification(notificationId, req.user.accountName);

      return res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      logger.error('Delete notification error:', error);
      return res.status(500).json({ error: 'Failed to delete notification' });
    }
  },
);

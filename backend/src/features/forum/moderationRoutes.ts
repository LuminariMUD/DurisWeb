import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { body, param, query, validationResult } from 'express-validator';
import {
  getPostById,
  moderatorDeletePost,
  restorePost,
  moderatorDeleteThread,
  restoreThread,
  moveThread,
  getModerationLog,
} from '../../services/forumService.js';
import { requireAuth, requireModerator } from '../../middleware/auth.js';
import { getCategoryAccessForAccount } from '../../services/categoryService.js';
import { getAuthorizedThread } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const forumModerationRoutes: IRouter = Router();

// ============================================================================
// Moderation Routes (Moderator Only)
// ============================================================================

/**
 * DELETE /api/forum/moderation/posts/:id
 * Soft-delete a post (moderator action)
 */
forumModerationRoutes.delete(
  '/moderation/posts/:id',
  requireModerator,
  [param('id').isInt().withMessage('Post ID must be a number')],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const postId = parseInt(req.params.id);
      const post = await getPostById(postId, req.user.accountName);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const authorizedThread = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'view',
      );
      if (!authorizedThread?.canModerate) {
        return res.status(403).json({ error: 'Category moderator access required' });
      }
      const reason = req.body.reason || null;

      await moderatorDeletePost(postId, req.user.accountName, reason);

      return res.json({ message: 'Post deleted successfully' });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to delete post', 'Failed to delete post');
    }
  },
);

/**
 * POST /api/forum/moderation/posts/:id/restore
 * Restore a soft-deleted post
 */
forumModerationRoutes.post(
  '/moderation/posts/:id/restore',
  requireAuth,
  requireModerator,
  [param('id').isInt().withMessage('Post ID must be a number')],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const postId = parseInt(req.params.id);
      const post = await getPostById(postId, req.user.accountName, undefined, {
        includeDeleted: true,
      });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const authorizedThread = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'view',
        true,
      );
      if (!authorizedThread?.canModerate) {
        return res.status(403).json({ error: 'Category moderator access required' });
      }

      await restorePost(postId, req.user.accountName);

      return res.json({ message: 'Post restored successfully' });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to restore post', 'Failed to restore post');
    }
  },
);

/**
 * DELETE /api/forum/moderation/threads/:id
 * Soft-delete a thread (moderator action)
 */
forumModerationRoutes.delete(
  '/moderation/threads/:id',
  requireModerator,
  [param('id').isInt().withMessage('Thread ID must be a number')],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'view');
      if (!authorizedThread?.canModerate) {
        return res.status(403).json({ error: 'Category moderator access required' });
      }
      const reason = req.body.reason || null;

      await moderatorDeleteThread(threadId, req.user.accountName, reason);

      return res.json({ message: 'Thread deleted successfully' });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to delete thread', 'Failed to delete thread');
    }
  },
);

/**
 * POST /api/forum/moderation/threads/:id/restore
 * Restore a soft-deleted thread
 */
forumModerationRoutes.post(
  '/moderation/threads/:id/restore',
  requireAuth,
  requireModerator,
  [param('id').isInt().withMessage('Thread ID must be a number')],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const authorizedThread = await getAuthorizedThread(
        threadId,
        req.user.permissions,
        'view',
        true,
      );
      if (!authorizedThread?.canModerate) {
        return res.status(403).json({ error: 'Category moderator access required' });
      }

      await restoreThread(threadId, req.user.accountName);

      return res.json({ message: 'Thread restored successfully' });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to restore thread', 'Failed to restore thread');
    }
  },
);

/**
 * POST /api/forum/moderation/threads/:id/move
 * Move a thread to a different category
 */
forumModerationRoutes.post(
  '/moderation/threads/:id/move',
  requireModerator,
  [
    param('id').isInt().withMessage('Thread ID must be a number'),
    body('categoryId').isInt().withMessage('Category ID must be a number'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
  ],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const newCategoryId = parseInt(req.body.categoryId);
      const sourceAccess = await getAuthorizedThread(threadId, req.user.permissions, 'view');
      const destinationAccess = await getCategoryAccessForAccount(
        newCategoryId,
        req.user.permissions,
      );
      if (!sourceAccess?.canModerate || !destinationAccess.canModerate) {
        return res
          .status(403)
          .json({ error: 'Category moderator access required for source and destination' });
      }
      const reason = req.body.reason || null;

      await moveThread(threadId, newCategoryId, req.user.accountName, reason);

      return res.json({ message: 'Thread moved successfully' });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to move thread', 'Failed to move thread');
    }
  },
);

/**
 * GET /api/forum/moderation/logs
 * Get moderation log (paginated, with filters)
 */
forumModerationRoutes.get(
  '/moderation/logs',

  requireModerator,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('moderator').optional().isString().withMessage('Moderator must be a string'),
    query('actionType').optional().isString().withMessage('Action type must be a string'),
    query('categoryId').optional().isInt().withMessage('Category ID must be a number'),
  ],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const filters = {
        moderator: req.query.moderator as string | undefined,
        actionType: req.query.actionType as string | undefined,
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
      };

      const { logs, total } = await getModerationLog(limit, offset, filters);

      return res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get moderation log error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get moderation log' });
    }
  },
);

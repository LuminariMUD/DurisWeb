import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { body, param, validationResult } from 'express-validator';
import {
  getThreadById,
  getPostById,
  addReaction,
  removeReaction,
} from '../../services/forumService.js';
import {
  createPoll,
  getPollByThreadId,
  getPollById,
  castVote,
  removeVote,
  closePoll,
  deletePoll,
  isPollCreator,
} from '../../services/pollService.js';
import { requireAuth } from '../../middleware/auth.js';
import { getCategoryAccessForAccount } from '../../services/categoryService.js';
import { ANONYMOUS_PERMISSIONS, getAuthorizedThread, postLimiter } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const forumReactionPollRoutes: IRouter = Router();

// ============================================================================
// Reaction Routes
// ============================================================================

/**
 * POST /api/forum/posts/:id/reactions
 * Add emoji reaction to post
 */
forumReactionPollRoutes.post(
  '/posts/:id/reactions',
  requireAuth,
  [
    param('id').isInt().withMessage('Post ID must be an integer'),
    body('emoji').trim().isLength({ min: 1, max: 10 }).withMessage('Emoji must be 1-10 characters'),
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

      const postId = parseInt(req.params.id);
      const { emoji } = req.body;
      const post = await getPostById(postId, req.user.accountName);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const authorizedThread = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'post',
      );
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const success = await addReaction(postId, req.user.accountName, emoji);

      if (!success) {
        return res.status(400).json({ error: 'You already reacted with this emoji' });
      }

      return res.json({ success: true, message: 'Reaction added' });
    } catch (error) {
      logger.error('Add reaction error:', error);
      return res.status(500).json({ error: 'Failed to add reaction' });
    }
  },
);

/**
 * DELETE /api/forum/posts/:id/reactions/:emoji
 * Remove emoji reaction from post
 */
forumReactionPollRoutes.delete(
  '/posts/:id/reactions/:emoji',
  requireAuth,
  [
    param('id').isInt().withMessage('Post ID must be an integer'),
    param('emoji').trim().isLength({ min: 1, max: 10 }).withMessage('Invalid emoji'),
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

      const postId = parseInt(req.params.id);
      const emoji = req.params.emoji;
      const post = await getPostById(postId, req.user.accountName);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const authorizedThread = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'post',
      );
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const success = await removeReaction(postId, req.user.accountName, emoji);

      if (!success) {
        return res.status(404).json({ error: 'Reaction not found' });
      }

      return res.json({ success: true, message: 'Reaction removed' });
    } catch (error) {
      logger.error('Remove reaction error:', error);
      return res.status(500).json({ error: 'Failed to remove reaction' });
    }
  },
);

/**
 * POST /api/forum/threads/:id/reactions
 * Add emoji reaction to thread
 */
forumReactionPollRoutes.post(
  '/threads/:id/reactions',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('emoji').trim().isLength({ min: 1, max: 10 }).withMessage('Emoji must be 1-10 characters'),
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
      const { emoji } = req.body;
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'post');
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const success = await addReaction(null, req.user.accountName, emoji, threadId);

      if (!success) {
        return res.status(400).json({ error: 'You already reacted with this emoji' });
      }

      return res.json({ success: true, message: 'Reaction added' });
    } catch (error) {
      logger.error('Add thread reaction error:', error);
      return res.status(500).json({ error: 'Failed to add reaction' });
    }
  },
);

/**
 * DELETE /api/forum/threads/:id/reactions/:emoji
 * Remove emoji reaction from thread
 */
forumReactionPollRoutes.delete(
  '/threads/:id/reactions/:emoji',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    param('emoji').trim().isLength({ min: 1, max: 10 }).withMessage('Invalid emoji'),
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
      const emoji = req.params.emoji;
      const authorizedThread = await getAuthorizedThread(threadId, req.user.permissions, 'post');
      if (!authorizedThread) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const success = await removeReaction(null, req.user.accountName, emoji, threadId);

      if (!success) {
        return res.status(404).json({ error: 'Reaction not found' });
      }

      return res.json({ success: true, message: 'Reaction removed' });
    } catch (error) {
      logger.error('Remove thread reaction error:', error);
      return res.status(500).json({ error: 'Failed to remove reaction' });
    }
  },
);

// ============================================================================
// Poll Routes
// ============================================================================

// Create a poll for a thread (thread creator only, must be done at thread creation)
forumReactionPollRoutes.post(
  '/threads/:threadId/poll',
  requireAuth,
  [
    param('threadId').isInt().toInt(),
    body('question').isString().trim().isLength({ min: 5, max: 500 }),
    body('options').isArray({ min: 2, max: 10 }),
    body('options.*').isString().trim().isLength({ min: 1, max: 200 }),
    body('isMultipleChoice').isBoolean(),
    body('minChoices').isInt({ min: 1 }),
    body('maxChoices').isInt({ min: 1 }),
    body('isAnonymous').isBoolean(),
    body('resultsVisibility').isIn(['always', 'after_voting', 'after_expiration']),
    body('expiresAt').optional().isISO8601().toDate(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { threadId } = req.params;
      const accountName = req.user!.accountName;

      // Verify thread exists and user is the creator
      const thread = await getThreadById(parseInt(threadId), req.user!.permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found or access denied' });
      }

      const categoryAccess = await getCategoryAccessForAccount(
        thread.category_id,
        req.user!.permissions,
      );
      if (!categoryAccess.canPost) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to post in this category' });
      }

      if (thread.author_account_name !== accountName) {
        return res.status(403).json({ error: 'Only thread creator can add a poll' });
      }

      // Create poll
      const pollId = await createPoll(
        parseInt(threadId),
        req.body,
        accountName,
        req.user!.permissions,
      );

      return res.status(201).json({
        message: 'Poll created successfully',
        pollId,
      });
    } catch (error) {
      logger.error('Create poll error:', error);
      if (safeFailureCode(error) === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'This thread already has a poll' });
      }
      return sendRouteError(res, error, 'Failed to create poll', 'Failed to create poll');
    }
  },
);

// Get poll for a thread
forumReactionPollRoutes.get('/threads/:threadId/poll', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
    const thread = await getThreadById(parseInt(threadId), permissions);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found or access denied' });
    }

    const voterAccount = req.user?.accountName;

    const pollData = await getPollByThreadId(parseInt(threadId), voterAccount, permissions);

    if (!pollData) {
      return res.status(404).json({ error: 'No poll found for this thread' });
    }

    return res.json(pollData);
  } catch (error) {
    logger.error('Get poll error:', error);
    return res.status(500).json({ error: 'Failed to get poll' });
  }
});

// Check if thread has a poll (lightweight endpoint)
forumReactionPollRoutes.get('/threads/:threadId/has-poll', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
    const thread = await getThreadById(parseInt(threadId), permissions);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found or access denied' });
    }

    const pollData = await getPollByThreadId(parseInt(threadId), undefined, permissions);

    return res.json({ hasPoll: pollData !== null });
  } catch (error) {
    logger.error('Check poll error:', error);
    return res.status(500).json({ error: 'Failed to check poll' });
  }
});

// Cast or update vote on a poll
forumReactionPollRoutes.post(
  '/polls/:pollId/vote',
  requireAuth,
  postLimiter, // Rate limit voting
  [
    param('pollId').isInt().toInt(),
    body('optionIds').isArray({ min: 1 }),
    body('optionIds.*').isInt(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { pollId } = req.params;
      const { optionIds } = req.body;
      const voterAccount = req.user!.accountName;
      const poll = await getPollById(parseInt(pollId), req.user!.permissions);
      if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
      }
      const thread = await getThreadById(poll.thread_id, req.user!.permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Poll not found or access denied' });
      }

      await castVote(parseInt(pollId), optionIds, voterAccount, req.user!.permissions);

      return res.json({ message: 'Vote recorded successfully' });
    } catch (error) {
      logger.error('Vote error:', error);
      return sendRouteError(res, error, 'Failed to vote', 'Vote failed');
    }
  },
);

// Remove vote from a poll
forumReactionPollRoutes.delete(
  '/polls/:pollId/vote',
  requireAuth,
  param('pollId').isInt().toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { pollId } = req.params;
      const voterAccount = req.user!.accountName;
      const poll = await getPollById(parseInt(pollId), req.user!.permissions);
      if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
      }
      const thread = await getThreadById(poll.thread_id, req.user!.permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Poll not found or access denied' });
      }

      await removeVote(parseInt(pollId), voterAccount, req.user!.permissions);

      return res.json({ message: 'Vote removed successfully' });
    } catch (error) {
      logger.error('Remove vote error:', error);
      return sendRouteError(res, error, 'Failed to remove vote', 'Remove vote failed');
    }
  },
);

// Close a poll (creator or moderator)
forumReactionPollRoutes.patch(
  '/polls/:pollId/close',
  requireAuth,
  param('pollId').isInt().toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { pollId } = req.params;
      const accountName = req.user!.accountName;
      const permissions = req.user!.permissions;
      const poll = await getPollById(parseInt(pollId), req.user!.permissions);
      if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
      }
      const thread = await getThreadById(poll.thread_id, permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Poll not found or access denied' });
      }
      const categoryAccess = await getCategoryAccessForAccount(thread.category_id, permissions);

      // Check if user is poll creator or moderator, including category ACLs.
      const isCreator = await isPollCreator(parseInt(pollId), accountName);
      const canManage = (isCreator && categoryAccess.canPost) || categoryAccess.canModerate;
      if (!canManage) {
        return res
          .status(403)
          .json({ error: 'Only an authorized poll creator or category moderator can close polls' });
      }

      await closePoll(parseInt(pollId), accountName, permissions);

      return res.json({ message: 'Poll closed successfully' });
    } catch (error) {
      logger.error('Close poll error:', error);
      return sendRouteError(res, error, 'Failed to close poll', 'Close poll failed');
    }
  },
);

// Delete a poll (creator or moderator)
forumReactionPollRoutes.delete(
  '/polls/:pollId',
  requireAuth,
  param('pollId').isInt().toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { pollId } = req.params;
      const accountName = req.user!.accountName;
      const permissions = req.user!.permissions;
      const poll = await getPollById(parseInt(pollId), req.user!.permissions);
      if (!poll) {
        return res.status(404).json({ error: 'Poll not found' });
      }
      const thread = await getThreadById(poll.thread_id, permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Poll not found or access denied' });
      }
      const categoryAccess = await getCategoryAccessForAccount(thread.category_id, permissions);

      // Check if user is poll creator or moderator, including category ACLs.
      const isCreator = await isPollCreator(parseInt(pollId), accountName);
      const canManage = (isCreator && categoryAccess.canPost) || categoryAccess.canModerate;
      if (!canManage) {
        return res.status(403).json({
          error: 'Only an authorized poll creator or category moderator can delete polls',
        });
      }

      await deletePoll(parseInt(pollId), accountName, permissions);

      return res.json({ message: 'Poll deleted successfully' });
    } catch (error) {
      logger.error('Delete poll error:', error);
      return sendRouteError(res, error, 'Failed to delete poll', 'Delete poll failed');
    }
  },
);

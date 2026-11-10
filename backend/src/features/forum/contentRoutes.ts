import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import { randomUUID } from 'node:crypto';
import logger from '../../utils/logger.js';
import { body, param, query, validationResult } from 'express-validator';
import {
  getCategories,
  getCategoryById,
  getChildCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  getThreadsByCategory,
  getThreadById,
  createThread,
  updateThread,
  deleteThread,
  togglePinThread,
  toggleLockThread,
  incrementThreadViews,
  getPostsByThread,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  canEditPost,
  subscribeToThread,
  isSubscribedToThread,
  getLatestThreads,
  getPopularThreads,
} from '../../services/forumService.js';
import { requireAuth, requireModerator, optionalAuth } from '../../middleware/auth.js';
import { getCharacterInfo } from '../../services/permissionService.js';
import { getCategoryAccessForAccount } from '../../services/categoryService.js';
import { parseAccountFile } from '../../services/accountService.js';
import { extractClientIP } from '../../utils/ipExtractor.js';
import { broadcastForumPost } from '../../realtime/broadcasts.js';
import { PostImageAttachmentError } from '../../services/postImageService.js';
import { ANONYMOUS_PERMISSIONS, getAuthorizedThread, postLimiter } from './shared.js';

export const forumContentRoutes: IRouter = Router();

// ============================================================================
// Category Routes
// ============================================================================

/**
 * GET /api/forum/categories
 * List all categories with access control filtering
 */
forumContentRoutes.get('/categories', async (req: Request, res: Response) => {
  try {
    // Allow anonymous users - they'll only see public categories
    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

    const categories = await getCategories(permissions);

    return res.json({ categories });
  } catch (error) {
    logger.error('Get categories error:', error);
    return res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * GET /api/forum/categories/:id
 * Get single category by ID
 */
forumContentRoutes.get(
  '/categories/:id',

  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Allow anonymous users - they can only see public categories
      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

      const categoryId = parseInt(req.params.id);
      const category = await getCategoryById(categoryId, permissions);

      if (!category) {
        return res.status(404).json({ error: 'Category not found or access denied' });
      }

      return res.json({ category });
    } catch (error) {
      logger.error('Get category error:', error);
      return res.status(500).json({ error: 'Failed to get category' });
    }
  },
);

/**
 * GET /api/forum/categories/:id/children
 * Get child categories of a parent category
 */
forumContentRoutes.get(
  '/categories/:id/children',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid category ID')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Allow anonymous users - they can only see public categories
      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

      const categoryId = parseInt(req.params.id);

      // First check if parent category exists and user has access
      const parentCategory = await getCategoryById(categoryId, permissions);
      if (!parentCategory) {
        return res.status(404).json({ error: 'Category not found or access denied' });
      }

      // Get child categories
      const children = await getChildCategories(categoryId, permissions);

      return res.json({ children });
    } catch (error) {
      logger.error('Get child categories error:', error);
      return res.status(500).json({ error: 'Failed to get child categories' });
    }
  },
);

/**
 * POST /api/forum/categories
 * Create new category (moderator only)
 */
forumContentRoutes.post(
  '/categories',
  requireAuth,
  [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be 1-100 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('icon').optional({ nullable: true }).isString().withMessage('Icon must be a string'),
    body('accessType')
      .optional()
      .isIn(['public', 'authenticated', 'guild', 'immortal', 'god', 'role_based', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('guildName')
      .optional({ nullable: true })
      .isString()
      .withMessage('Guild name must be a string'),
    body('minLevel')
      .optional({ nullable: true })
      .isInt({ min: 57, max: 62 })
      .withMessage('Min level must be 57-62'),
    body('sortOrder').optional().isInt().withMessage('Sort order must be an integer'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions?.canModerate) {
        return res.status(403).json({ error: 'Moderator access required' });
      }

      const { name, description, icon, accessType, guildName, minLevel, sortOrder } = req.body;

      const categoryId = await createCategory(
        name,
        description || null,
        icon || null,
        accessType || 'public',
        guildName || null,
        minLevel || null,
        sortOrder || 100,
      );

      return res.status(201).json({ id: categoryId, message: 'Category created' });
    } catch (error) {
      logger.error('Create category error:', error);
      return res.status(500).json({ error: 'Failed to create category' });
    }
  },
);

/**
 * PATCH /api/forum/categories/:id
 * Update category (moderator only)
 */
forumContentRoutes.patch(
  '/categories/:id',
  requireAuth,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be 1-100 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('icon').optional({ nullable: true }).isString().withMessage('Icon must be a string'),
    body('accessType')
      .optional()
      .isIn(['public', 'authenticated', 'guild', 'immortal', 'god', 'role_based', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('guildName')
      .optional({ nullable: true })
      .isString()
      .withMessage('Guild name must be a string'),
    body('minLevel')
      .optional({ nullable: true })
      .isInt({ min: 57, max: 62 })
      .withMessage('Min level must be 57-62'),
    body('sortOrder').optional().isInt().withMessage('Sort order must be an integer'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions?.canModerate) {
        return res.status(403).json({ error: 'Moderator access required' });
      }

      const categoryId = parseInt(req.params.id);
      const { name, description, icon, accessType, guildName, minLevel, sortOrder } = req.body;

      const updated = await updateCategory(categoryId, {
        name,
        description,
        icon,
        accessType,
        guildName,
        minLevel,
        sortOrder,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Category not found or no changes made' });
      }

      return res.json({ message: 'Category updated' });
    } catch (error) {
      logger.error('Update category error:', error);
      return res.status(500).json({ error: 'Failed to update category' });
    }
  },
);

/**
 * DELETE /api/forum/categories/:id
 * Archive/delete category (moderator only)
 */
forumContentRoutes.delete(
  '/categories/:id',
  requireAuth,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions?.canModerate) {
        return res.status(403).json({ error: 'Moderator access required' });
      }

      const categoryId = parseInt(req.params.id);

      const archived = await archiveCategory(categoryId);

      if (!archived) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.json({ message: 'Category archived' });
    } catch (error) {
      logger.error('Archive category error:', error);
      return res.status(500).json({ error: 'Failed to archive category' });
    }
  },
);

// ============================================================================
// Thread Routes
// ============================================================================

/**
 * GET /api/forum/categories/:categoryId/threads
 * List threads in a category (paginated)
 */
forumContentRoutes.get(
  '/categories/:categoryId/threads',

  [
    param('categoryId').isInt().withMessage('Category ID must be an integer'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Allow anonymous users - they'll only see public categories
      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

      const categoryId = parseInt(req.params.categoryId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Check category access
      const category = await getCategoryById(categoryId, permissions);
      if (!category) {
        return res.status(404).json({ error: 'Category not found or access denied' });
      }

      const result = await getThreadsByCategory(categoryId, page, limit, permissions);

      return res.json({
        data: result.threads,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      logger.error('Get threads error:', error);
      return res.status(500).json({ error: 'Failed to get threads' });
    }
  },
);

/**
 * GET /api/forum/threads/:id
 * Get thread by ID with posts
 */
forumContentRoutes.get(
  '/threads/:id',

  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('postId').optional().isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Allow anonymous users - they'll only see public threads
      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

      const threadId = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const thread = await getThreadById(threadId, permissions);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Check category access
      const category = await getCategoryById(thread.category_id, permissions);
      if (!category) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      // Get posts
      const accountName = req.user?.accountName || '';
      const postsResult = await getPostsByThread(threadId, accountName, page, limit, permissions, {
        targetPostId: req.query.postId === undefined ? undefined : Number(req.query.postId),
      });

      // Check subscription status (anonymous users are never subscribed)
      const isSubscribed = req.user
        ? await isSubscribedToThread(req.user.accountName, threadId)
        : false;

      // Increment view count
      await incrementThreadViews(threadId);

      return res.json({
        thread,
        category: {
          id: category.id,
          name: category.name,
        },
        posts: postsResult.posts,
        isSubscribed,
        pagination: {
          page: postsResult.page,
          limit,
          total: postsResult.total,
          pages: Math.ceil(postsResult.total / limit),
        },
      });
    } catch (error) {
      logger.error('Get thread error:', error);
      return res.status(500).json({ error: 'Failed to get thread' });
    }
  },
);

/**
 * POST /api/forum/threads
 * Create new thread
 */
forumContentRoutes.post(
  '/threads',
  requireAuth,
  postLimiter,
  [
    body('categoryId').isInt().withMessage('Category ID is required'),
    body('characterPid').optional().isInt().withMessage('Character PID must be an integer'),
    body('title')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be 3-200 characters'),
    body('content')
      .trim()
      .isLength({ min: 10, max: 50000 })
      .withMessage('Content must be 10-50000 characters'),
  ],
  async (req: Request, res: Response) => {
    let stage = 'authorization';
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { categoryId, characterPid, title, content } = req.body;

      // Check category access
      const category = await getCategoryById(categoryId, req.user.permissions);
      if (!category) {
        return res.status(403).json({ error: 'Category not found or access denied' });
      }

      const categoryAccess = await getCategoryAccessForAccount(categoryId, req.user.permissions);
      if (!categoryAccess.canPost) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to post in this category' });
      }

      // Validate character ownership if characterPid is provided
      let validatedCharacterPid: bigint | null = null;
      if (characterPid) {
        // Get account data to retrieve character names
        const accountData = await parseAccountFile(req.user.accountName);
        if (!accountData) {
          return res.status(500).json({ error: 'Failed to load account data' });
        }

        // Extract character names from account data
        const characterNames = accountData.characters.map((c) => c.name);

        // Get character info from database using character names
        const characterInfo = await getCharacterInfo(characterNames);
        // IMPORTANT: Use String() comparison because req.body sends numbers as strings
        // Using Number() can cause precision loss or type mismatch failures
        const userCharacters = characterInfo.filter((c) => String(c.pid) === String(characterPid));

        if (userCharacters.length === 0) {
          return res.status(403).json({ error: 'Character does not belong to your account' });
        }

        validatedCharacterPid = BigInt(characterPid);
      }

      // Extract client IP address
      const ipAddress = extractClientIP(req);

      stage = 'publication';
      // Create thread
      const threadId = await createThread(
        categoryId,
        req.user.accountName,
        validatedCharacterPid,
        title,
        content,
        ipAddress,
        req.user.permissions,
      );

      stage = 'subscription';
      // Auto-subscribe to own thread
      await subscribeToThread(req.user.accountName, threadId, 'all');

      return res.status(201).json({
        success: true,
        threadId,
        message: 'Thread created successfully',
      });
    } catch (error) {
      if (error instanceof PostImageAttachmentError)
        return res.status(409).json({ error: error.message });
      const reference = randomUUID();
      logger.error('Create thread failed', { reference, stage, code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to create thread', reference });
    }
  },
);

/**
 * PATCH /api/forum/threads/:id
 * Update thread (author only)
 */
forumContentRoutes.patch(
  '/threads/:id',
  requireAuth,
  postLimiter,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be 3-200 characters'),
    body('content')
      .optional()
      .trim()
      .isLength({ min: 10, max: 50000 })
      .withMessage('Content must be 10-50000 characters'),
  ],
  async (req: Request, res: Response) => {
    let stage = 'authorization';
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);
      const { title, content } = req.body;

      const thread = await getThreadById(threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const categoryAccess = await getCategoryAccessForAccount(
        thread.category_id,
        req.user.permissions,
      );
      if (!categoryAccess.canPost) {
        return res.status(403).json({ error: 'You do not have permission to edit this category' });
      }

      // Check ownership
      if (thread.author_account_name !== req.user.accountName) {
        return res.status(403).json({ error: 'You can only edit your own threads' });
      }

      stage = 'publication';
      // Update thread
      const success = await updateThread(
        threadId,
        title || thread.title,
        content || thread.content,
        req.user.accountName,
      );

      if (!success) {
        return res.status(500).json({ error: 'Failed to update thread' });
      }

      return res.json({ success: true, message: 'Thread updated successfully' });
    } catch (error) {
      if (error instanceof PostImageAttachmentError)
        return res.status(409).json({ error: error.message });
      const reference = randomUUID();
      logger.error('Update thread failed', { reference, stage, code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to update thread', reference });
    }
  },
);

/**
 * DELETE /api/forum/threads/:id
 * Soft delete thread (author or moderator)
 */
forumContentRoutes.delete(
  '/threads/:id',
  requireAuth,
  [param('id').isInt().withMessage('Thread ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.id);

      const thread = await getThreadById(threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const categoryAccess = await getCategoryAccessForAccount(
        thread.category_id,
        req.user.permissions,
      );
      const isModerator = req.user.permissions.canModerate;
      const isAuthor = thread.author_account_name === req.user.accountName;
      const canDelete =
        (isAuthor && categoryAccess.canPost) || (isModerator && categoryAccess.canModerate);
      if (!canDelete) {
        return res.status(403).json({ error: 'Not authorized to delete this thread' });
      }

      const success = await deleteThread(threadId);

      if (!success) {
        return res.status(500).json({ error: 'Failed to delete thread' });
      }

      return res.json({ success: true, message: 'Thread deleted successfully' });
    } catch (error) {
      logger.error('Delete thread error:', error);
      return res.status(500).json({ error: 'Failed to delete thread' });
    }
  },
);

/**
 * POST /api/forum/threads/:id/pin
 * Pin/unpin thread (moderator only)
 */
forumContentRoutes.post(
  '/threads/:id/pin',
  requireAuth,
  requireModerator,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('isPinned').isBoolean().withMessage('isPinned must be boolean'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const threadId = parseInt(req.params.id);
      const { isPinned } = req.body;
      const authorizedThread = await getAuthorizedThread(threadId, req.user!.permissions, 'view');
      if (!authorizedThread?.canModerate || !req.user!.permissions.canPinThreads) {
        return res.status(403).json({ error: 'Category pin permission required' });
      }

      const success = await togglePinThread(threadId, isPinned);

      if (!success) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        success: true,
        message: isPinned ? 'Thread pinned' : 'Thread unpinned',
      });
    } catch (error) {
      logger.error('Pin thread error:', error);
      return res.status(500).json({ error: 'Failed to pin thread' });
    }
  },
);

/**
 * POST /api/forum/threads/:id/lock
 * Lock/unlock thread (moderator only)
 */
forumContentRoutes.post(
  '/threads/:id/lock',
  requireAuth,
  requireModerator,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('isLocked').isBoolean().withMessage('isLocked must be boolean'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const threadId = parseInt(req.params.id);
      const { isLocked } = req.body;
      const authorizedThread = await getAuthorizedThread(threadId, req.user!.permissions, 'view');
      if (!authorizedThread?.canModerate || !req.user!.permissions.canLockThreads) {
        return res.status(403).json({ error: 'Category lock permission required' });
      }

      const success = await toggleLockThread(threadId, isLocked);

      if (!success) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        success: true,
        message: isLocked ? 'Thread locked' : 'Thread unlocked',
      });
    } catch (error) {
      logger.error('Lock thread error:', error);
      return res.status(500).json({ error: 'Failed to lock thread' });
    }
  },
);

// ============================================================================
// Post Routes
// ============================================================================

/**
 * POST /api/forum/threads/:threadId/posts
 * Create reply to thread
 */
forumContentRoutes.post(
  '/threads/:threadId/posts',
  requireAuth,
  postLimiter,
  [
    param('threadId').isInt().withMessage('Thread ID must be an integer'),
    body('characterPid').optional().isInt().withMessage('Character PID must be an integer'),
    body('content')
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('Content must be 1-50000 characters'),
    body('parentPostId').optional().isInt().withMessage('Parent post ID must be an integer'),
  ],
  async (req: Request, res: Response) => {
    let stage = 'authorization';
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const threadId = parseInt(req.params.threadId);
      const { characterPid, content, parentPostId } = req.body;

      const thread = await getThreadById(threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Check if thread is locked
      if (thread.is_locked && !req.user.permissions.canModerate) {
        return res.status(403).json({ error: 'Thread is locked' });
      }

      // Check category access
      const category = await getCategoryById(thread.category_id, req.user.permissions);
      if (!category) {
        return res.status(403).json({ error: 'Access denied to this category' });
      }

      const categoryAccess = await getCategoryAccessForAccount(
        thread.category_id,
        req.user.permissions,
      );
      if (!categoryAccess.canPost) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to post in this category' });
      }

      // Validate character ownership if characterPid is provided
      let validatedCharacterPid: bigint | null = null;
      if (characterPid) {
        // Get account data to retrieve character names
        const accountData = await parseAccountFile(req.user.accountName);
        if (!accountData) {
          return res.status(500).json({ error: 'Failed to load account data' });
        }

        // Extract character names from account data
        const characterNames = accountData.characters.map((c) => c.name);

        // Get character info from database using character names
        const characterInfo = await getCharacterInfo(characterNames);

        // IMPORTANT: Use String() comparison because req.body sends numbers as strings
        // Using Number() can cause precision loss or type mismatch failures
        const userCharacters = characterInfo.filter((c) => String(c.pid) === String(characterPid));

        if (userCharacters.length === 0) {
          return res.status(403).json({ error: 'Character does not belong to your account' });
        }

        validatedCharacterPid = BigInt(characterPid);
      }

      // Extract client IP address
      const ipAddress = extractClientIP(req);

      stage = 'publication';
      // Create post
      const postId = await createPost(
        threadId,
        req.user.accountName,
        validatedCharacterPid,
        content,
        parentPostId || null,
        ipAddress,
        req.user.permissions,
      );

      // Notifications are now handled automatically within createPost

      stage = 'read_result';
      // Fetch the full post to return to frontend
      const post = await getPostById(postId, req.user.accountName, req.user.permissions);

      // Broadcast new post to all WebSocket clients for real-time notifications
      if (post) {
        broadcastForumPost(threadId, post, req.user.accountName, thread.category_id);
      }

      return res.status(201).json({
        success: true,
        postId,
        post,
        message: 'Post created successfully',
      });
    } catch (error) {
      if (error instanceof PostImageAttachmentError)
        return res.status(409).json({ error: error.message });
      const reference = randomUUID();
      logger.error('Create post failed', { reference, stage, code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to create post', reference });
    }
  },
);

/**
 * PATCH /api/forum/posts/:id
 * Update post (author only, no time limit)
 */
forumContentRoutes.patch(
  '/posts/:id',
  requireAuth,
  postLimiter,
  [
    param('id').isInt().withMessage('Post ID must be an integer'),
    body('content')
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('Content must be 1-50000 characters'),
  ],
  async (req: Request, res: Response) => {
    let stage = 'authorization';
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const postId = parseInt(req.params.id);
      const { content } = req.body;
      const post = await getPostById(postId, req.user.accountName);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const categoryAccess = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'post',
      );
      if (!categoryAccess) {
        return res.status(403).json({ error: 'You do not have permission to edit this category' });
      }

      // Check if user can edit (author only)
      const canEdit = await canEditPost(postId, req.user.accountName);
      if (!canEdit) {
        return res.status(403).json({
          error: 'You can only edit your own posts',
        });
      }

      stage = 'publication';
      const success = await updatePost(postId, content, req.user.accountName);

      if (!success) {
        return res.status(500).json({ error: 'Failed to update post' });
      }

      return res.json({ success: true, message: 'Post updated successfully' });
    } catch (error) {
      if (error instanceof PostImageAttachmentError)
        return res.status(409).json({ error: error.message });
      const reference = randomUUID();
      logger.error('Update post failed', { reference, stage, code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to update post', reference });
    }
  },
);

/**
 * DELETE /api/forum/posts/:id
 * Soft delete post (author or moderator)
 */
forumContentRoutes.delete(
  '/posts/:id',
  requireAuth,
  [param('id').isInt().withMessage('Post ID must be an integer')],
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
      const post = await getPostById(postId, req.user.accountName);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const authorizedThread = await getAuthorizedThread(
        post.thread_id,
        req.user.permissions,
        'view',
      );
      const isModerator = req.user.permissions.canModerate;
      const isAuthor = post.author_account_name === req.user.accountName;
      const canDelete =
        authorizedThread !== null &&
        ((isAuthor && authorizedThread.canPost) || (isModerator && authorizedThread.canModerate));

      if (!canDelete) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
      }

      const success = await deletePost(postId);

      if (!success) {
        return res.status(500).json({ error: 'Failed to delete post' });
      }

      return res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
      logger.error('Delete post error:', error);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  },
);

// ============================================================================
// Activity Routes
// ============================================================================

/**
 * GET /api/forum/activity/latest
 * Get latest threads across all accessible categories
 */
forumContentRoutes.get('/activity/latest', async (req: Request, res: Response) => {
  try {
    // Allow anonymous users - they'll only see public content
    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

    const limit = parseInt(req.query.limit as string) || 10;
    const threads = await getLatestThreads(permissions, limit);

    return res.json(threads);
  } catch (error) {
    logger.error('Get latest threads error:', error);
    return res.status(500).json({ error: 'Failed to get latest threads' });
  }
});

/**
 * GET /api/forum/activity/popular
 * Get popular threads across all accessible categories
 */
forumContentRoutes.get('/activity/popular', async (req: Request, res: Response) => {
  try {
    // Allow anonymous users - they'll only see public content
    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;

    const limit = parseInt(req.query.limit as string) || 10;
    const threads = await getPopularThreads(permissions, limit);

    return res.json(threads);
  } catch (error) {
    logger.error('Get popular threads error:', error);
    return res.status(500).json({ error: 'Failed to get popular threads' });
  }
});

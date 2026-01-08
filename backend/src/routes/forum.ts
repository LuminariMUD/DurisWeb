import { Router, Request, Response, type IRouter } from 'express';
import { pool as db } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import logger, { getErrorMessage, isErrorWithCode } from '../utils/logger.js';
import { body, param, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
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
  addReaction,
  removeReaction,
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
  searchForum,
  // Moderation functions
  moderatorDeletePost,
  restorePost,
  moderatorDeleteThread,
  restoreThread,
  moveThread,
  getModerationLog,
  // User profile functions
  getUserProfile,
  updateUserProfile,
  getUserPosts,
  getUserThreads,
  getAccountCharacters,
  // Mention functions
  searchAccounts,
  // Character profile functions
  getCharacterProfile,
  getCharacterPosts,
  getCharacterPvPEvents,
  // Guild profile functions
  getGuildProfile,
  getGuildForumActivity,
  // Activity functions
  getLatestThreads,
  getPopularThreads
} from '../services/forumService.js';
import {
  createPoll,
  getPollByThreadId,
  castVote,
  removeVote,
  closePoll,
  deletePoll,
  isPollCreator
} from '../services/pollService.js';
import { requireAuth, requireModerator, optionalAuth, requirePermission } from '../middleware/auth.js';
import { getCharacterInfo, type UserPermissions } from '../services/permissionService.js';
import { parseAccountFile, findAccountByCharacter } from '../services/mudAccountParser.js';
import { extractClientIP } from '../utils/ipExtractor.js';
import { uploadAvatar, deleteAllAvatars, validateAvatarFile, isR2Configured } from '../services/r2Service.js';
import { broadcastForumPost } from '../index.js';
import {
  uploadPostImage,
  deletePostImage,
  validatePostImage,
  canUploadMoreImages,
  getOrphanImageCount,
  MAX_IMAGES_PER_POST,
  MAX_IMAGE_SIZE,
  isR2Configured as isPostImageR2Configured
} from '../services/postImageService.js';

const router: IRouter = Router();

// Anonymous user permissions (no access to restricted content)
const ANONYMOUS_PERMISSIONS: UserPermissions = {
  accountName: '',
  role: 'player',
  immortalLevel: null,
  maxLevel: 0,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: []
};

// Apply optional authentication to all forum routes (anonymous users can view public content)
router.use(optionalAuth);

// Rate limiting for forum posts
const postLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 posts per minute
  message: 'Too many posts, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for avatar uploads (stricter)
const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  message: 'Too many avatar uploads, please wait before trying again',
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for avatar uploads (memory storage)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

// Rate limiting for post image uploads
const postImageUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: 'Too many image uploads, please wait before trying again',
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for post image uploads (memory storage, 350KB limit)
const postImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE, // 350KB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

// ============================================================================
// Category Routes
// ============================================================================

/**
 * GET /api/forum/categories
 * List all categories with access control filtering
 */
router.get('/categories', async (req: Request, res: Response) => {
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
router.get(
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
  }
);

/**
 * GET /api/forum/categories/:id/children
 * Get child categories of a parent category
 */
router.get(
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
  }
);

/**
 * POST /api/forum/categories
 * Create new category (moderator only)
 */
router.post(
  '/categories',
  requireAuth,
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('description').optional({ nullable: true }).isString().withMessage('Description must be a string'),
    body('icon').optional({ nullable: true }).isString().withMessage('Icon must be a string'),
    body('accessType').optional().isIn(['public', 'authenticated', 'guild', 'immortal', 'god', 'role_based', 'custom_acl']).withMessage('Invalid access type'),
    body('guildName').optional({ nullable: true }).isString().withMessage('Guild name must be a string'),
    body('minLevel').optional({ nullable: true }).isInt({ min: 57, max: 62 }).withMessage('Min level must be 57-62'),
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
        sortOrder || 100
      );

      return res.status(201).json({ id: categoryId, message: 'Category created' });
    } catch (error) {
      logger.error('Create category error:', error);
      return res.status(500).json({ error: 'Failed to create category' });
    }
  }
);

/**
 * PATCH /api/forum/categories/:id
 * Update category (moderator only)
 */
router.patch(
  '/categories/:id',
  requireAuth,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('description').optional({ nullable: true }).isString().withMessage('Description must be a string'),
    body('icon').optional({ nullable: true }).isString().withMessage('Icon must be a string'),
    body('accessType').optional().isIn(['public', 'authenticated', 'guild', 'immortal', 'god', 'role_based', 'custom_acl']).withMessage('Invalid access type'),
    body('guildName').optional({ nullable: true }).isString().withMessage('Guild name must be a string'),
    body('minLevel').optional({ nullable: true }).isInt({ min: 57, max: 62 }).withMessage('Min level must be 57-62'),
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
  }
);

/**
 * DELETE /api/forum/categories/:id
 * Archive/delete category (moderator only)
 */
router.delete(
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
  }
);

// ============================================================================
// Thread Routes
// ============================================================================

/**
 * GET /api/forum/categories/:categoryId/threads
 * List threads in a category (paginated)
 */
router.get(
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

      const result = await getThreadsByCategory(categoryId, page, limit);

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
  }
);

/**
 * GET /api/forum/threads/:id
 * Get thread by ID with posts
 */
router.get(
  '/threads/:id',

  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
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
      const postsResult = await getPostsByThread(threadId, accountName, page, limit, permissions);

      // Check subscription status (anonymous users are never subscribed)
      const isSubscribed = req.user ? await isSubscribedToThread(req.user.accountName, threadId) : false;

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
          page,
          limit,
          total: postsResult.total,
          pages: Math.ceil(postsResult.total / limit),
        },
      });
    } catch (error) {
      logger.error('Get thread error:', error);
      return res.status(500).json({ error: 'Failed to get thread' });
    }
  }
);

/**
 * POST /api/forum/threads
 * Create new thread
 */
router.post(
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

      // Validate character ownership if characterPid is provided
      let validatedCharacterPid: bigint | null = null;
      if (characterPid) {
        // Get account data to retrieve character names
        const accountData = await parseAccountFile(req.user.accountName);
        if (!accountData) {
          return res.status(500).json({ error: 'Failed to load account data' });
        }

        // Extract character names from account data
        const characterNames = accountData.characters.map(c => c.name);

        // Get character info from database using character names
        const characterInfo = await getCharacterInfo(characterNames);
        // IMPORTANT: Use String() comparison because req.body sends numbers as strings
        // Using Number() can cause precision loss or type mismatch failures
        const userCharacters = characterInfo.filter(c => String(c.pid) === String(characterPid));

        if (userCharacters.length === 0) {
          return res.status(403).json({ error: 'Character does not belong to your account' });
        }

        validatedCharacterPid = BigInt(characterPid);
      }

      // Extract client IP address
      const ipAddress = extractClientIP(req);

      // Create thread
      const threadId = await createThread(
        categoryId,
        req.user.accountName,
        validatedCharacterPid,
        title,
        content,
        ipAddress
      );

      // Auto-subscribe to own thread
      await subscribeToThread(req.user.accountName, threadId, 'all');

      return res.status(201).json({
        success: true,
        threadId,
        message: 'Thread created successfully',
      });
    } catch (error) {
      logger.error('Create thread error:', error);
      return res.status(500).json({ error: 'Failed to create thread' });
    }
  }
);

/**
 * PATCH /api/forum/threads/:id
 * Update thread (author only)
 */
router.patch(
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

      // Check ownership
      if (thread.author_account_name !== req.user.accountName) {
        return res.status(403).json({ error: 'You can only edit your own threads' });
      }

      // Update thread
      const success = await updateThread(
        threadId,
        title || thread.title,
        content || thread.content
      );

      if (!success) {
        return res.status(500).json({ error: 'Failed to update thread' });
      }

      return res.json({ success: true, message: 'Thread updated successfully' });
    } catch (error) {
      logger.error('Update thread error:', error);
      return res.status(500).json({ error: 'Failed to update thread' });
    }
  }
);

/**
 * DELETE /api/forum/threads/:id
 * Soft delete thread (author or moderator)
 */
router.delete(
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

      // Check ownership or moderator status
      const isModerator = req.user.permissions.canModerate;
      const isAuthor = thread.author_account_name === req.user.accountName;

      if (!isAuthor && !isModerator) {
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
  }
);

/**
 * POST /api/forum/threads/:id/pin
 * Pin/unpin thread (moderator only)
 */
router.post(
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
  }
);

/**
 * POST /api/forum/threads/:id/lock
 * Lock/unlock thread (moderator only)
 */
router.post(
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
  }
);

// ============================================================================
// Post Routes
// ============================================================================

/**
 * POST /api/forum/threads/:threadId/posts
 * Create reply to thread
 */
router.post(
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

      // Validate character ownership if characterPid is provided
      let validatedCharacterPid: bigint | null = null;
      if (characterPid) {
        // Get account data to retrieve character names
        const accountData = await parseAccountFile(req.user.accountName);
        if (!accountData) {
          return res.status(500).json({ error: 'Failed to load account data' });
        }

        // Extract character names from account data
        const characterNames = accountData.characters.map(c => c.name);

        // Get character info from database using character names
        const characterInfo = await getCharacterInfo(characterNames);

        // IMPORTANT: Use String() comparison because req.body sends numbers as strings
        // Using Number() can cause precision loss or type mismatch failures
        const userCharacters = characterInfo.filter(c => String(c.pid) === String(characterPid));

        if (userCharacters.length === 0) {
          return res.status(403).json({ error: 'Character does not belong to your account' });
        }

        validatedCharacterPid = BigInt(characterPid);
      }

      // Extract client IP address
      const ipAddress = extractClientIP(req);

      // Create post
      const postId = await createPost(
        threadId,
        req.user.accountName,
        validatedCharacterPid,
        content,
        parentPostId || null,
        ipAddress
      );

      // Notifications are now handled automatically within createPost

      // Fetch the full post to return to frontend
      const post = await getPostById(postId, req.user.accountName, req.user.permissions);

      // Broadcast new post to all WebSocket clients for real-time notifications
      if (post) {
        broadcastForumPost(threadId, post, req.user.accountName);
      }

      return res.status(201).json({
        success: true,
        postId,
        post,
        message: 'Post created successfully',
      });
    } catch (error) {
      logger.error('Create post error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }
);

/**
 * PATCH /api/forum/posts/:id
 * Update post (author only, no time limit)
 */
router.patch(
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

      // Check if user can edit (author only)
      const canEdit = await canEditPost(postId, req.user.accountName);
      if (!canEdit) {
        return res.status(403).json({
          error: 'You can only edit your own posts',
        });
      }

      const success = await updatePost(postId, content);

      if (!success) {
        return res.status(500).json({ error: 'Failed to update post' });
      }

      return res.json({ success: true, message: 'Post updated successfully' });
    } catch (error) {
      logger.error('Update post error:', error);
      return res.status(500).json({ error: 'Failed to update post' });
    }
  }
);

/**
 * DELETE /api/forum/posts/:id
 * Soft delete post (author or moderator)
 */
router.delete(
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

      // Check if moderator (can delete any post) or check ownership
      const canDelete =
        req.user.permissions?.canModerate ||
        (await canEditPost(postId, req.user.accountName));

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
  }
);

// ============================================================================
// Reaction Routes
// ============================================================================

/**
 * POST /api/forum/posts/:id/reactions
 * Add emoji reaction to post
 */
router.post(
  '/posts/:id/reactions',
  requireAuth,
  [
    param('id').isInt().withMessage('Post ID must be an integer'),
    body('emoji')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Emoji must be 1-10 characters'),
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

      const success = await addReaction(postId, req.user.accountName, emoji);

      if (!success) {
        return res.status(400).json({ error: 'You already reacted with this emoji' });
      }

      return res.json({ success: true, message: 'Reaction added' });
    } catch (error) {
      logger.error('Add reaction error:', error);
      return res.status(500).json({ error: 'Failed to add reaction' });
    }
  }
);

/**
 * DELETE /api/forum/posts/:id/reactions/:emoji
 * Remove emoji reaction from post
 */
router.delete(
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

      const success = await removeReaction(postId, req.user.accountName, emoji);

      if (!success) {
        return res.status(404).json({ error: 'Reaction not found' });
      }

      return res.json({ success: true, message: 'Reaction removed' });
    } catch (error) {
      logger.error('Remove reaction error:', error);
      return res.status(500).json({ error: 'Failed to remove reaction' });
    }
  }
);

/**
 * POST /api/forum/threads/:id/reactions
 * Add emoji reaction to thread
 */
router.post(
  '/threads/:id/reactions',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('emoji')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Emoji must be 1-10 characters'),
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

      const success = await addReaction(null, req.user.accountName, emoji, threadId);

      if (!success) {
        return res.status(400).json({ error: 'You already reacted with this emoji' });
      }

      return res.json({ success: true, message: 'Reaction added' });
    } catch (error) {
      logger.error('Add thread reaction error:', error);
      return res.status(500).json({ error: 'Failed to add reaction' });
    }
  }
);

/**
 * DELETE /api/forum/threads/:id/reactions/:emoji
 * Remove emoji reaction from thread
 */
router.delete(
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

      const success = await removeReaction(null, req.user.accountName, emoji, threadId);

      if (!success) {
        return res.status(404).json({ error: 'Reaction not found' });
      }

      return res.json({ success: true, message: 'Reaction removed' });
    } catch (error) {
      logger.error('Remove thread reaction error:', error);
      return res.status(500).json({ error: 'Failed to remove reaction' });
    }
  }
);

// ============================================================================
// Subscription Routes
// ============================================================================

/**
 * POST /api/forum/threads/:id/subscribe
 * Subscribe to thread notifications
 */
router.post(
  '/threads/:id/subscribe',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('notifyOnReply')
      .optional()
      .isBoolean()
      .withMessage('notifyOnReply must be boolean'),
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
      const notificationPreference = req.body.notificationPreference || 'all';

      await subscribeToThread(req.user.accountName, threadId, notificationPreference);

      return res.json({ success: true, message: 'Subscribed to thread' });
    } catch (error) {
      logger.error('Subscribe error:', error);
      return res.status(500).json({ error: 'Failed to subscribe' });
    }
  }
);

/**
 * DELETE /api/forum/threads/:id/subscribe
 * Unsubscribe from thread notifications
 */
router.delete(
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

      await unsubscribeFromThread(req.user.accountName, threadId);

      return res.json({ success: true, message: 'Unsubscribed from thread' });
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe' });
    }
  }
);

/**
 * GET /api/forum/subscriptions
 * Get user's thread and category subscriptions
 */
router.get('/subscriptions', async (req: Request, res: Response) => {
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
router.post(
  '/threads/:id/subscribe',
  requireAuth,
  [
    param('id').isInt().withMessage('Thread ID must be an integer'),
    body('notificationPreference').optional().isIn(['all', 'mentions', 'none'])
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
  }
);

/**
 * DELETE /api/forum/threads/:id/subscribe
 * Unsubscribe from a thread
 */
router.delete(
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

      await unsubscribeFromThread(req.user.accountName, threadId);

      return res.json({ success: true, message: 'Successfully unsubscribed from thread' });
    } catch (error) {
      logger.error('Unsubscribe from thread error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe from thread' });
    }
  }
);

/**
 * GET /api/forum/threads/:id/is-subscribed
 * Check if user is subscribed to a thread
 */
router.get(
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

      const isSubscribed = await isSubscribedToThread(req.user.accountName, threadId);

      return res.json({ isSubscribed });
    } catch (error) {
      logger.error('Check subscription error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  }
);

/**
 * POST /api/forum/categories/:id/subscribe
 * Subscribe to a category
 */
router.post(
  '/categories/:id/subscribe',
  requireAuth,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('notificationPreference').optional().isIn(['all', 'mentions', 'none'])
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
  }
);

/**
 * DELETE /api/forum/categories/:id/subscribe
 * Unsubscribe from a category
 */
router.delete(
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

      await unsubscribeFromCategory(req.user.accountName, categoryId);

      return res.json({ success: true, message: 'Successfully unsubscribed from category' });
    } catch (error) {
      logger.error('Unsubscribe from category error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe from category' });
    }
  }
);

/**
 * GET /api/forum/categories/:id/is-subscribed
 * Check if user is subscribed to a category
 */
router.get(
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

      const isSubscribed = await isSubscribedToCategory(req.user.accountName, categoryId);

      return res.json({ isSubscribed });
    } catch (error) {
      logger.error('Check subscription error:', error);
      return res.status(500).json({ error: 'Failed to check subscription status' });
    }
  }
);

// ============================================================================
// Notification Routes
// ============================================================================

/**
 * GET /api/forum/notifications
 * Get user notifications with pagination
 */
router.get('/notifications', async (req: Request, res: Response) => {
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
        totalPages: Math.ceil(result.total / limit)
      },
      unreadCount
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
router.get('/notifications/unread-count', async (req: Request, res: Response) => {
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
router.post(
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
  }
);

/**
 * POST /api/forum/notifications/read-all
 * Mark all notifications as read
 */
router.post('/notifications/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await markAllNotificationsAsRead(req.user.accountName);

    return res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    logger.error('Mark all notifications read error:', error);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * DELETE /api/forum/notifications/:id
 * Delete notification
 */
router.delete(
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
  }
);

// ============================================================================
// Search Routes
// ============================================================================

/**
 * GET /api/forum/search
 * Search forum threads and posts
 */
router.get(
  '/search',
  
  [
    query('query').trim().isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
    query('scope').optional().isIn(['titles', 'content', 'both']).withMessage('Invalid scope'),
    query('author').optional().trim(),
    query('categoryId').optional().isInt().withMessage('Category ID must be an integer'),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format for dateFrom'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format for dateTo'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const filters = {
        query: req.query.query as string,
        scope: req.query.scope as 'titles' | 'content' | 'both' | undefined,
        author: req.query.author as string | undefined,
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };

      const { results, total } = await searchForum(
        filters,
        req.user.permissions,
        page,
        limit
      );

      return res.json({
        results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Search error:', error);
      return res.status(500).json({ error: 'Failed to perform search' });
    }
  }
);

// ============================================================================
// Moderation Routes (Moderator Only)
// ============================================================================

/**
 * DELETE /api/forum/moderation/posts/:id
 * Soft-delete a post (moderator action)
 */
router.delete(
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
      const reason = req.body.reason || null;

      await moderatorDeletePost(postId, req.user.accountName, reason);

      return res.json({ message: 'Post deleted successfully' });
    } catch (error) {
      logger.error('Moderator delete post error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to delete post' });
    }
  }
);

/**
 * POST /api/forum/moderation/posts/:id/restore
 * Restore a soft-deleted post
 */
router.post(
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

      await restorePost(postId, req.user.accountName);

      return res.json({ message: 'Post restored successfully' });
    } catch (error) {
      logger.error('Restore post error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to restore post' });
    }
  }
);

/**
 * DELETE /api/forum/moderation/threads/:id
 * Soft-delete a thread (moderator action)
 */
router.delete(
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
      const reason = req.body.reason || null;

      await moderatorDeleteThread(threadId, req.user.accountName, reason);

      return res.json({ message: 'Thread deleted successfully' });
    } catch (error) {
      logger.error('Moderator delete thread error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to delete thread' });
    }
  }
);

/**
 * POST /api/forum/moderation/threads/:id/restore
 * Restore a soft-deleted thread
 */
router.post(
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

      await restoreThread(threadId, req.user.accountName);

      return res.json({ message: 'Thread restored successfully' });
    } catch (error) {
      logger.error('Restore thread error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to restore thread' });
    }
  }
);

/**
 * POST /api/forum/moderation/threads/:id/move
 * Move a thread to a different category
 */
router.post(
  '/moderation/threads/:id/move',
  requireModerator,
  [
    param('id').isInt().withMessage('Thread ID must be a number'),
    body('categoryId').isInt().withMessage('Category ID must be a number'),
    body('reason').optional().isString().withMessage('Reason must be a string')
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
      const reason = req.body.reason || null;

      await moveThread(threadId, newCategoryId, req.user.accountName, reason);

      return res.json({ message: 'Thread moved successfully' });
    } catch (error) {
      logger.error('Move thread error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to move thread' });
    }
  }
);

/**
 * GET /api/forum/moderation/logs
 * Get moderation log (paginated, with filters)
 */
router.get(
  '/moderation/logs',
  
  requireModerator,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('moderator').optional().isString().withMessage('Moderator must be a string'),
    query('actionType').optional().isString().withMessage('Action type must be a string'),
    query('categoryId').optional().isInt().withMessage('Category ID must be a number')
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
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined
      };

      const { logs, total } = await getModerationLog(limit, offset, filters);

      return res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get moderation log error:', error);
      return res.status(500).json({ error: 'Failed to get moderation log' });
    }
  }
);

// ============================================================================
// User Profile Routes
// ============================================================================

// Get user profile with stats
router.get('/users/:accountName/profile', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const profile = await getUserProfile(accountName);

    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(profile);
  } catch (error) {
    logger.error('Get user profile error:', error);
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update own profile
router.patch(
  '/users/me/profile',
  requireAuth,
  [
    body('bio').optional().isLength({ max: 5000 }).trim(),
    body('website').optional({ values: 'falsy' }).isURL().trim(),
    body('location').optional().isLength({ max: 100 }).trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const accountName = req.user!.accountName;
      const { bio, website, location } = req.body;

      await updateUserProfile(accountName, { bio, website, location });

      return res.json({ success: true });
    } catch (error) {
      logger.error('Update user profile error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// Get user's posts
router.get('/users/:accountName/posts', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const { posts: rawPosts, total } = await getUserPosts(accountName, page, limit);

    // Map snake_case from database to camelCase for frontend
    const posts = rawPosts.map((post: any) => ({
      id: post.id,
      threadId: post.thread_id,
      threadTitle: post.thread_title,
      categoryId: post.category_id,
      categoryName: post.category_name,
      characterName: post.character_name,
      content: post.content,
      createdAt: post.created_at,
      editedAt: post.edited_at
    }));

    return res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get user posts error:', error);
    return res.status(500).json({ error: 'Failed to get user posts' });
  }
});

// Get user's threads
router.get('/users/:accountName/threads', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const { threads: rawThreads, total } = await getUserThreads(accountName, page, limit);

    // Map snake_case from database to camelCase for frontend
    const threads = rawThreads.map((thread: any) => ({
      id: thread.id,
      categoryId: thread.category_id,
      categoryName: thread.category_name,
      title: thread.title,
      content: thread.content,
      characterName: thread.character_name,
      createdAt: thread.created_at,
      viewCount: thread.view_count || 0,
      replyCount: thread.reply_count || 0,
      isPinned: !!thread.is_pinned,
      isLocked: !!thread.is_locked
    }));

    return res.json({
      threads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get user threads error:', error);
    return res.status(500).json({ error: 'Failed to get user threads' });
  }
});

// Get user's characters with stats
router.get('/users/:accountName/characters', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const result = await getAccountCharacters(accountName);
    return res.json(result);
  } catch (error) {
    logger.error('Get account characters error:', error);
    return res.status(500).json({ error: 'Failed to get account characters' });
  }
});

// Get account name for a character
router.get('/characters/:characterName/account', async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const accountName = await findAccountByCharacter(characterName);

    if (!accountName) {
      return res.status(404).json({ error: 'Character not found' });
    }

    return res.json({ accountName });
  } catch (error) {
    logger.error('Get character account error:', error);
    return res.status(500).json({ error: 'Failed to get character account' });
  }
});

// ============================================================================
// Avatar Upload Routes
// ============================================================================

/**
 * POST /api/forum/users/me/avatar
 * Upload own avatar
 */
router.post(
  '/users/me/avatar',
  requireAuth,
  avatarUploadLimiter,
  avatarUpload.single('avatar'),
  async (req: Request, res: Response) => {
    try {
      // Check if R2 is configured
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Avatar upload is not available' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Validate file
      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const accountName = req.user!.accountName;

      // Upload to R2
      const avatarUrl = await uploadAvatar(file.buffer, accountName, file.mimetype);

      // Update profile with new avatar URL
      await updateUserProfile(accountName, { avatarUrl });

      return res.json({ avatarUrl });
    } catch (error) {
      logger.error('Upload avatar error:', error);
      if (getErrorMessage(error).includes('Only JPG')) {
        return res.status(400).json({ error: getErrorMessage(error) });
      }
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }
  }
);

/**
 * POST /api/forum/users/:accountName/avatar
 * Upload avatar for another user (admin only)
 */
router.post(
  '/users/:accountName/avatar',
  requireAuth,
  requirePermission('manage_user_profiles'),
  avatarUploadLimiter,
  avatarUpload.single('avatar'),
  async (req: Request, res: Response) => {
    try {
      // Check if R2 is configured
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Avatar upload is not available' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Validate file
      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { accountName } = req.params;

      // Upload to R2
      const avatarUrl = await uploadAvatar(file.buffer, accountName, file.mimetype);

      // Update profile with new avatar URL
      await updateUserProfile(accountName, { avatarUrl });

      return res.json({ avatarUrl });
    } catch (error) {
      logger.error('Upload avatar error:', error);
      if (getErrorMessage(error).includes('Only JPG')) {
        return res.status(400).json({ error: getErrorMessage(error) });
      }
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }
  }
);

/**
 * DELETE /api/forum/users/me/avatar
 * Delete own avatar
 */
router.delete(
  '/users/me/avatar',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      // Check if R2 is configured
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Avatar deletion is not available' });
      }

      const accountName = req.user!.accountName;

      // Delete from R2
      await deleteAllAvatars(accountName);

      // Update profile to remove avatar URL
      await updateUserProfile(accountName, { avatarUrl: null });

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete avatar error:', error);
      return res.status(500).json({ error: 'Failed to delete avatar' });
    }
  }
);

/**
 * DELETE /api/forum/users/:accountName/avatar
 * Delete avatar for another user (admin only)
 */
router.delete(
  '/users/:accountName/avatar',
  requireAuth,
  requirePermission('manage_user_profiles'),
  async (req: Request, res: Response) => {
    try {
      // Check if R2 is configured
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Avatar deletion is not available' });
      }

      const { accountName } = req.params;

      // Delete from R2
      await deleteAllAvatars(accountName);

      // Update profile to remove avatar URL
      await updateUserProfile(accountName, { avatarUrl: null });

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete avatar error:', error);
      return res.status(500).json({ error: 'Failed to delete avatar' });
    }
  }
);

// ============================================================================
// Banner Upload Routes
// ============================================================================

/**
 * POST /api/forum/users/me/banner
 * Upload own banner
 */
router.post(
  '/users/me/banner',
  requireAuth,
  avatarUploadLimiter, // Reuse same rate limiter
  avatarUpload.single('banner'),
  async (req: Request, res: Response) => {
    try {
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Banner upload is not available' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const user = (req as any).user;
      const accountName = user.accountName;

      // Delete existing banners first
      await deleteAllAvatars(accountName, 'banner');

      // Upload new banner
      const bannerUrl = await uploadAvatar(file.buffer, accountName, file.mimetype, 'banner');

      // Update user profile with new banner URL
      await updateUserProfile(accountName, { bannerUrl });

      return res.json({ bannerUrl });
    } catch (error) {
      logger.error('Upload banner error:', error);
      return res.status(500).json({ error: 'Failed to upload banner' });
    }
  }
);

/**
 * POST /api/forum/users/:accountName/banner
 * Upload banner for another user (admin only)
 */
router.post(
  '/users/:accountName/banner',
  requireAuth,
  requirePermission('manage_user_profiles'),
  avatarUploadLimiter,
  avatarUpload.single('banner'),
  async (req: Request, res: Response) => {
    try {
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Banner upload is not available' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { accountName } = req.params;

      // Delete existing banners first
      await deleteAllAvatars(accountName, 'banner');

      // Upload new banner
      const bannerUrl = await uploadAvatar(file.buffer, accountName, file.mimetype, 'banner');

      // Update user profile with new banner URL
      await updateUserProfile(accountName, { bannerUrl });

      return res.json({ bannerUrl });
    } catch (error) {
      logger.error('Upload user banner error:', error);
      return res.status(500).json({ error: 'Failed to upload banner' });
    }
  }
);

/**
 * DELETE /api/forum/users/me/banner
 * Delete own banner
 */
router.delete(
  '/users/me/banner',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const accountName = user.accountName;

      // Delete all banners for this user
      await deleteAllAvatars(accountName, 'banner');

      // Update profile to clear banner URL
      await updateUserProfile(accountName, { bannerUrl: null });

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete banner error:', error);
      return res.status(500).json({ error: 'Failed to delete banner' });
    }
  }
);

/**
 * DELETE /api/forum/users/:accountName/banner
 * Delete another user's banner (admin only)
 */
router.delete(
  '/users/:accountName/banner',
  requireAuth,
  requirePermission('manage_user_profiles'),
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;

      // Delete all banners for this user
      await deleteAllAvatars(accountName, 'banner');

      // Update profile to clear banner URL
      await updateUserProfile(accountName, { bannerUrl: null });

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete user banner error:', error);
      return res.status(500).json({ error: 'Failed to delete banner' });
    }
  }
);

// ============================================================================
// Character Profile Routes
// ============================================================================

// Get character profile with stats
router.get('/characters/:characterName/profile', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const profile = await getCharacterProfile(characterName);

    if (!profile) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if the viewer owns this character
    const ownerAccount = await findAccountByCharacter(characterName);
    const isOwner = req.user?.accountName && ownerAccount &&
      req.user.accountName.toLowerCase() === ownerAccount.toLowerCase();

    // Hide money/balance/playtime from non-owners
    if (!isOwner) {
      profile.money = null;
      profile.balance = null;
      profile.playtime = null;
    }

    return res.json({
      ...profile,
      isOwner
    });
  } catch (error) {
    logger.error('Get character profile error:', error);
    return res.status(500).json({ error: 'Failed to get character profile' });
  }
});

// Get character's forum posts
router.get('/characters/:characterName/posts', async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await getCharacterPosts(characterName, page, limit);

    return res.json({
      posts: result.posts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    logger.error('Get character posts error:', error);
    return res.status(500).json({ error: 'Failed to get character posts' });
  }
});

// Get character's PvP events
router.get('/characters/:characterName/pvp', async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await getCharacterPvPEvents(characterName, page, limit);

    return res.json({
      events: result.events,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    logger.error('Get character PvP events error:', error);
    return res.status(500).json({ error: 'Failed to get character PvP events' });
  }
});

// ============================================================================
// Guild Profile Routes
// ============================================================================

// Get guild profile with stats
router.get('/guilds/:guildName/profile', async (req: Request, res: Response) => {
  try {
    const { guildName } = req.params;
    const profile = await getGuildProfile(decodeURIComponent(guildName));

    if (!profile) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    return res.json(profile);
  } catch (error) {
    logger.error('Get guild profile error:', error);
    return res.status(500).json({ error: 'Failed to get guild profile' });
  }
});

// Get guild's forum activity
router.get('/guilds/:guildName/activity', async (req: Request, res: Response) => {
  try {
    const { guildName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await getGuildForumActivity(decodeURIComponent(guildName), page, limit);

    return res.json({
      posts: result.posts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    logger.error('Get guild forum activity error:', error);
    return res.status(500).json({ error: 'Failed to get guild forum activity' });
  }
});

// ============================================================================
// Mention Routes
// ============================================================================

// Search accounts for mention autocomplete
router.get('/accounts/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json({ accounts: [] });
    }

    const accounts = await searchAccounts(query, 10);
    return res.json({ accounts });
  } catch (error) {
    logger.error('Search accounts error:', error);
    return res.status(500).json({ error: 'Failed to search accounts' });
  }
});

// Search guilds
router.get('/guilds/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const { searchGuilds } = await import('../services/mudGuildParser.js');

    const guilds = await searchGuilds(query, 20);
    return res.json({ guilds });
  } catch (error) {
    logger.error('Search guilds error:', error);
    return res.status(500).json({ error: 'Failed to search guilds' });
  }
});

// ============================================================================
// Poll Routes
// ============================================================================

// Create a poll for a thread (thread creator only, must be done at thread creation)
router.post(
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
      const thread = await getThreadById(parseInt(threadId));
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if (thread.author_account_name !== accountName) {
        return res.status(403).json({ error: 'Only thread creator can add a poll' });
      }

      // Create poll
      const pollId = await createPoll(parseInt(threadId), req.body, accountName);

      return res.status(201).json({
        message: 'Poll created successfully',
        pollId,
      });
    } catch (error) {
      logger.error('Create poll error:', error);
      if (getErrorMessage(error).includes('Duplicate entry')) {
        return res.status(409).json({ error: 'This thread already has a poll' });
      }
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to create poll' });
    }
  }
);

// Get poll for a thread
router.get('/threads/:threadId/poll', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const voterAccount = req.user?.accountName;

    const pollData = await getPollByThreadId(parseInt(threadId), voterAccount);

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
router.get('/threads/:threadId/has-poll', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const pollData = await getPollByThreadId(parseInt(threadId));

    return res.json({ hasPoll: pollData !== null });
  } catch (error) {
    logger.error('Check poll error:', error);
    return res.status(500).json({ error: 'Failed to check poll' });
  }
});

// Cast or update vote on a poll
router.post(
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

      await castVote(parseInt(pollId), optionIds, voterAccount);

      return res.json({ message: 'Vote recorded successfully' });
    } catch (error) {
      logger.error('Vote error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to vote' });
    }
  }
);

// Remove vote from a poll
router.delete(
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

      await removeVote(parseInt(pollId), voterAccount);

      return res.json({ message: 'Vote removed successfully' });
    } catch (error) {
      logger.error('Remove vote error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to remove vote' });
    }
  }
);

// Close a poll (creator or moderator)
router.patch(
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

      // Check if user is poll creator or moderator
      const isCreator = await isPollCreator(parseInt(pollId), accountName);
      if (!isCreator && !permissions?.canModerate) {
        return res.status(403).json({ error: 'Only poll creator or moderators can close polls' });
      }

      await closePoll(parseInt(pollId));

      return res.json({ message: 'Poll closed successfully' });
    } catch (error) {
      logger.error('Close poll error:', error);
      return res.status(500).json({ error: 'Failed to close poll' });
    }
  }
);

// Delete a poll (creator or moderator)
router.delete(
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

      // Check if user is poll creator or moderator
      const isCreator = await isPollCreator(parseInt(pollId), accountName);
      if (!isCreator && !permissions?.canModerate) {
        return res.status(403).json({ error: 'Only poll creator or moderators can delete polls' });
      }

      await deletePoll(parseInt(pollId));

      return res.json({ message: 'Poll deleted successfully' });
    } catch (error) {
      logger.error('Delete poll error:', error);
      return res.status(500).json({ error: 'Failed to delete poll' });
    }
  }
);

// ============================================================================
// Activity Routes
// ============================================================================

/**
 * GET /api/forum/activity/latest
 * Get latest threads across all accessible categories
 */
router.get('/activity/latest', async (req: Request, res: Response) => {
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
router.get('/activity/popular', async (req: Request, res: Response) => {
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

// ============================================================================
// Post Image Routes
// ============================================================================

/**
 * POST /api/forum/images/upload
 * Upload an image for use in forum posts
 * Returns { success: true, imageId, imageUrl }
 */
router.post(
  '/images/upload',
  requireAuth,
  postImageUploadLimiter,
  postImageUpload.single('image'),
  async (req: Request, res: Response) => {
    try {
      const accountName = req.user!.accountName;
      const file = req.file;

      // Check if R2 is configured
      if (!isPostImageR2Configured()) {
        return res.status(503).json({ error: 'Image upload service not available' });
      }

      // Validate file
      if (!file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const validation = validatePostImage(file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Check if user can upload more images (max pending orphans)
      const canUpload = await canUploadMoreImages(accountName);
      if (!canUpload) {
        const orphanCount = await getOrphanImageCount(accountName);
        return res.status(400).json({
          error: `You have ${orphanCount} pending images. Please use them in a post or wait for cleanup before uploading more. Maximum ${MAX_IMAGES_PER_POST} pending images allowed.`
        });
      }

      // Upload the image
      const result = await uploadPostImage(
        accountName,
        file.buffer,
        file.mimetype,
        file.originalname
      );

      return res.json({
        success: true,
        imageId: result.id,
        imageUrl: result.imageUrl
      });
    } catch (error) {
      logger.error('Post image upload error:', error);

      // Handle multer errors
      if (isErrorWithCode(error) && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Image must be under ${MAX_IMAGE_SIZE / 1024}KB` });
      }

      return res.status(500).json({ error: 'Failed to upload image' });
    }
  }
);

/**
 * GET /api/forum/images/status
 * Get current upload status (pending orphan count)
 */
router.get('/images/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;
    const orphanCount = await getOrphanImageCount(accountName);

    return res.json({
      pendingImages: orphanCount,
      maxImages: MAX_IMAGES_PER_POST,
      canUpload: orphanCount < MAX_IMAGES_PER_POST
    });
  } catch (error) {
    logger.error('Get image status error:', error);
    return res.status(500).json({ error: 'Failed to get image status' });
  }
});

/**
 * GET /api/forum/images/orphans
 * List all orphan images for current user
 */
router.get('/images/orphans', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, image_url, created_at FROM forum_post_images
       WHERE account_name = ? AND is_orphan = TRUE
       ORDER BY created_at DESC`,
      [accountName]
    );
    return res.json({ orphans: rows });
  } catch (error) {
    logger.error('Get orphan images error:', error);
    return res.status(500).json({ error: 'Failed to get orphan images' });
  }
});

/**
 * DELETE /api/forum/images/orphans
 * Delete all orphan images for current user
 */
router.delete('/images/orphans', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;

    // Get orphan images to delete
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, image_url FROM forum_post_images
       WHERE account_name = ? AND is_orphan = TRUE`,
      [accountName]
    );

    // Delete each one (handles R2 + database)
    let deleted = 0;
    for (const row of rows) {
      try {
        await deletePostImage(row.id, accountName);
        deleted++;
      } catch (err) {
        logger.error(`Failed to delete orphan image ${row.id}:`, err);
      }
    }

    return res.json({ deleted });
  } catch (error) {
    logger.error('Clear orphan images error:', error);
    return res.status(500).json({ error: 'Failed to clear orphan images' });
  }
});

/**
 * DELETE /api/forum/images/:id
 * Delete an orphan image (only own images that haven't been linked to a post)
 */
router.delete(
  '/images/:id',
  requireAuth,
  [param('id').isInt().withMessage('Image ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const accountName = req.user!.accountName;
      const imageId = parseInt(req.params.id);

      const deleted = await deletePostImage(imageId, accountName);

      if (!deleted) {
        return res.status(404).json({
          error: 'Image not found, already linked to a post, or not owned by you'
        });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete post image error:', error);
      return res.status(500).json({ error: 'Failed to delete image' });
    }
  }
);

export default router;

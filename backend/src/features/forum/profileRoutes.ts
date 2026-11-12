import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { AppError } from '../../middleware/errorHandler.js';
import {
  getUserProfile,
  updateUserProfile,
  getUserPosts,
  getUserThreads,
  getAccountCharacters,
  searchAccounts,
  getCharacterProfile,
  getCharacterPosts,
  getCharacterPvPEvents,
  getGuildProfile,
  getGuildForumActivity,
} from '../../services/forumService.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { isAccountOwner, privateProfileResponse } from '../../middleware/profilePrivacy.js';
import { findAccountByCharacter } from '../../services/accountService.js';
import {
  uploadAvatar,
  deleteAvatarByUrl,
  validateAvatarFile,
  isR2Configured,
} from '../../services/r2Service.js';
import { ANONYMOUS_PERMISSIONS } from './shared.js';
import { parsePagination } from '../../utils/validation.js';

export const forumProfileRoutes: IRouter = Router();

// Rate limiting for avatar uploads (stricter)
const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  message: 'Too many avatar uploads, please wait before trying again',
  standardHeaders: true,
  legacyHeaders: false,
});

const accountSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many account searches, please try again shortly' },
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
      cb(new AppError('Only JPG, PNG, WebP, and GIF images are allowed', 400));
    }
  },
});

// ============================================================================
// User Profile Routes
// ============================================================================

// Get user profile with stats
forumProfileRoutes.get(
  '/users/:accountName/profile',
  privateProfileResponse,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const profile = await getUserProfile(accountName);

      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isOwner = isAccountOwner(req, accountName);
      return res.json({
        ...profile,
        stats: {
          ...profile.stats,
          characterCount: isOwner ? profile.stats.characterCount : null,
          totalFrags: isOwner ? profile.stats.totalFrags : null,
          totalDeaths: isOwner ? profile.stats.totalDeaths : null,
          totalWealth: isOwner ? profile.stats.totalWealth : null,
        },
      });
    } catch (error) {
      logger.error('Get user profile error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get user profile' });
    }
  },
);

// Update own profile
forumProfileRoutes.patch(
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
      logger.error('Update user profile error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to update profile' });
    }
  },
);

// Get user's posts
forumProfileRoutes.get(
  '/users/:accountName/posts',
  privateProfileResponse,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { page, limit } = parsePagination(
        typeof req.query.page === 'string' ? req.query.page : undefined,
        typeof req.query.limit === 'string' ? req.query.limit : undefined,
      );

      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
      const { posts: rawPosts, total } = await getUserPosts(accountName, page, limit, permissions);
      const isOwner = isAccountOwner(req, accountName);

      // Map snake_case from database to camelCase for frontend
      const posts = rawPosts.map((post: any) => ({
        id: post.id,
        threadId: post.thread_id,
        threadTitle: post.thread_title,
        categoryId: post.category_id,
        categoryName: post.category_name,
        characterName: isOwner ? post.character_name : null,
        content: post.content,
        createdAt: post.created_at,
        editedAt: post.edited_at,
      }));

      return res.json({
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get user posts error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get user posts' });
    }
  },
);

// Get user's threads
forumProfileRoutes.get(
  '/users/:accountName/threads',
  privateProfileResponse,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { page, limit } = parsePagination(
        typeof req.query.page === 'string' ? req.query.page : undefined,
        typeof req.query.limit === 'string' ? req.query.limit : undefined,
      );

      const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
      const { threads: rawThreads, total } = await getUserThreads(
        accountName,
        page,
        limit,
        permissions,
      );
      const isOwner = isAccountOwner(req, accountName);

      // Map snake_case from database to camelCase for frontend
      const threads = rawThreads.map((thread: any) => ({
        id: thread.id,
        categoryId: thread.category_id,
        categoryName: thread.category_name,
        title: thread.title,
        content: thread.content,
        characterName: isOwner ? thread.character_name : null,
        createdAt: thread.created_at,
        viewCount: thread.view_count || 0,
        replyCount: thread.reply_count || 0,
        isPinned: !!thread.is_pinned,
        isLocked: !!thread.is_locked,
      }));

      return res.json({
        threads,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get user threads error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get user threads' });
    }
  },
);

// Get user's characters with stats
forumProfileRoutes.get(
  '/users/:accountName/characters',
  privateProfileResponse,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const isOwner = isAccountOwner(req, accountName);
      if (!isOwner) return res.status(403).json({ error: 'Character roster is private' });
      const result = await getAccountCharacters(accountName);
      return res.json(result);
    } catch (error) {
      logger.error('Get account characters error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get account characters' });
    }
  },
);

// ============================================================================
// Avatar Upload Routes
// ============================================================================

/**
 * POST /api/forum/users/me/avatar
 * Upload own avatar
 */
forumProfileRoutes.post(
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
      const previousProfile = await getUserProfile(accountName);
      const avatarUrl = await uploadAvatar(file.buffer, accountName, file.mimetype);

      // Update profile with new avatar URL
      await updateUserProfile(accountName, { avatarUrl });
      if (previousProfile?.avatarUrl)
        await deleteAvatarByUrl(previousProfile.avatarUrl, accountName, 'avatar');

      return res.json({ avatarUrl });
    } catch (error) {
      logger.error('Upload avatar error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }
  },
);

/**
 * POST /api/forum/users/:accountName/avatar
 * Upload avatar for another user (admin only)
 */
forumProfileRoutes.post(
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
      const previousProfile = await getUserProfile(accountName);
      const avatarUrl = await uploadAvatar(file.buffer, accountName, file.mimetype);

      // Update profile with new avatar URL
      await updateUserProfile(accountName, { avatarUrl });
      if (previousProfile?.avatarUrl)
        await deleteAvatarByUrl(previousProfile.avatarUrl, accountName, 'avatar');

      return res.json({ avatarUrl });
    } catch (error) {
      logger.error('Upload avatar error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }
  },
);

/**
 * DELETE /api/forum/users/me/avatar
 * Delete own avatar
 */
forumProfileRoutes.delete('/users/me/avatar', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if R2 is configured
    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Avatar deletion is not available' });
    }

    const accountName = req.user!.accountName;

    // Update profile to remove avatar URL
    const previousProfile = await getUserProfile(accountName);
    await updateUserProfile(accountName, { avatarUrl: null });
    if (previousProfile?.avatarUrl)
      await deleteAvatarByUrl(previousProfile.avatarUrl, accountName, 'avatar');

    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete avatar error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

/**
 * DELETE /api/forum/users/:accountName/avatar
 * Delete avatar for another user (admin only)
 */
forumProfileRoutes.delete(
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

      // Update profile to remove avatar URL
      const previousProfile = await getUserProfile(accountName);
      await updateUserProfile(accountName, { avatarUrl: null });
      if (previousProfile?.avatarUrl)
        await deleteAvatarByUrl(previousProfile.avatarUrl, accountName, 'avatar');

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete avatar error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to delete avatar' });
    }
  },
);

// ============================================================================
// Banner Upload Routes
// ============================================================================

/**
 * POST /api/forum/users/me/banner
 * Upload own banner
 */
forumProfileRoutes.post(
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

      const accountName = req.user!.accountName;

      // Upload new banner
      const previousProfile = await getUserProfile(accountName);
      const bannerUrl = await uploadAvatar(file.buffer, accountName, file.mimetype, 'banner');

      // Update user profile with new banner URL
      await updateUserProfile(accountName, { bannerUrl });
      if (previousProfile?.bannerUrl)
        await deleteAvatarByUrl(previousProfile.bannerUrl, accountName, 'banner');

      return res.json({ bannerUrl });
    } catch (error) {
      logger.error('Upload banner error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to upload banner' });
    }
  },
);

/**
 * POST /api/forum/users/:accountName/banner
 * Upload banner for another user (admin only)
 */
forumProfileRoutes.post(
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

      // Upload new banner
      const previousProfile = await getUserProfile(accountName);
      const bannerUrl = await uploadAvatar(file.buffer, accountName, file.mimetype, 'banner');

      // Update user profile with new banner URL
      await updateUserProfile(accountName, { bannerUrl });
      if (previousProfile?.bannerUrl)
        await deleteAvatarByUrl(previousProfile.bannerUrl, accountName, 'banner');

      return res.json({ bannerUrl });
    } catch (error) {
      logger.error('Upload user banner error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to upload banner' });
    }
  },
);

/**
 * DELETE /api/forum/users/me/banner
 * Delete own banner
 */
forumProfileRoutes.delete('/users/me/banner', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isR2Configured())
      return res.status(503).json({ error: 'Banner deletion is not available' });
    const accountName = req.user!.accountName;

    // Update profile to clear banner URL
    const previousProfile = await getUserProfile(accountName);
    await updateUserProfile(accountName, { bannerUrl: null });
    if (previousProfile?.bannerUrl)
      await deleteAvatarByUrl(previousProfile.bannerUrl, accountName, 'banner');

    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete banner error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to delete banner' });
  }
});

/**
 * DELETE /api/forum/users/:accountName/banner
 * Delete another user's banner (admin only)
 */
forumProfileRoutes.delete(
  '/users/:accountName/banner',
  requireAuth,
  requirePermission('manage_user_profiles'),
  async (req: Request, res: Response) => {
    try {
      if (!isR2Configured())
        return res.status(503).json({ error: 'Banner deletion is not available' });
      const { accountName } = req.params;

      // Update profile to clear banner URL
      const previousProfile = await getUserProfile(accountName);
      await updateUserProfile(accountName, { bannerUrl: null });
      if (previousProfile?.bannerUrl)
        await deleteAvatarByUrl(previousProfile.bannerUrl, accountName, 'banner');

      return res.json({ success: true });
    } catch (error) {
      logger.error('Delete user banner error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to delete banner' });
    }
  },
);

// ============================================================================
// Character Profile Routes
// ============================================================================

// Get character profile with stats
forumProfileRoutes.get(
  '/characters/:characterName/profile',
  privateProfileResponse,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { characterName } = req.params;
      const ownerAccount = await findAccountByCharacter(characterName);
      const isOwner = isAccountOwner(req, ownerAccount);

      if (!isOwner) return res.status(404).json({ error: 'Character not found' });
      const profile = await getCharacterProfile(characterName);
      if (!profile) return res.status(404).json({ error: 'Character not found' });

      return res.json({
        ...profile,
        isOwner,
      });
    } catch (error) {
      logger.error('Get character profile error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to get character profile' });
    }
  },
);

// Get character's forum posts
forumProfileRoutes.get('/characters/:characterName/posts', async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const { page, limit } = parsePagination(
      typeof req.query.page === 'string' ? req.query.page : undefined,
      typeof req.query.limit === 'string' ? req.query.limit : undefined,
      20,
    );

    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
    const result = await getCharacterPosts(characterName, page, limit, permissions);

    return res.json({
      posts: result.posts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Get character posts error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to get character posts' });
  }
});

// Get character's PvP events
forumProfileRoutes.get('/characters/:characterName/pvp', async (req: Request, res: Response) => {
  try {
    const { characterName } = req.params;
    const { page, limit } = parsePagination(
      typeof req.query.page === 'string' ? req.query.page : undefined,
      typeof req.query.limit === 'string' ? req.query.limit : undefined,
      20,
    );

    const result = await getCharacterPvPEvents(characterName, page, limit);

    return res.json({
      events: result.events,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Get character PvP events error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to get character PvP events' });
  }
});

// ============================================================================
// Guild Profile Routes
// ============================================================================

// Get guild profile with stats
forumProfileRoutes.get('/guilds/:guildName/profile', async (req: Request, res: Response) => {
  try {
    const { guildName } = req.params;
    const profile = await getGuildProfile(guildName);

    if (!profile) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    return res.json(profile);
  } catch (error) {
    logger.error('Get guild profile error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to get guild profile' });
  }
});

// Get guild's forum activity
forumProfileRoutes.get('/guilds/:guildName/activity', async (req: Request, res: Response) => {
  try {
    const { guildName } = req.params;
    const { page, limit } = parsePagination(
      typeof req.query.page === 'string' ? req.query.page : undefined,
      typeof req.query.limit === 'string' ? req.query.limit : undefined,
      20,
    );

    const permissions = req.user?.permissions || ANONYMOUS_PERMISSIONS;
    const result = await getGuildForumActivity(guildName, page, limit, permissions);

    return res.json({
      posts: result.posts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Get guild forum activity error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to get guild forum activity' });
  }
});

// ============================================================================
// Mention Routes
// ============================================================================

// Search accounts for mention autocomplete
forumProfileRoutes.get(
  '/accounts/search',
  accountSearchLimiter,
  async (req: Request, res: Response) => {
    try {
      const query = req.query.q;
      if (query !== undefined && (typeof query !== 'string' || query.length > 50)) {
        return res.status(400).json({ error: 'q must be a string of at most 50 characters' });
      }
      if (!query || query.length < 2) {
        return res.json({ accounts: [] });
      }

      const accounts = await searchAccounts(query, 10);
      return res.json({ accounts });
    } catch (error) {
      logger.error('Search accounts error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to search accounts' });
    }
  },
);

// Search guilds
forumProfileRoutes.get('/guilds/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const { searchGuilds } = await import('../../services/mudGuildParser.js');

    const guilds = await searchGuilds(query, 20);
    return res.json({ guilds });
  } catch (error) {
    logger.error('Search guilds error:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to search guilds' });
  }
});

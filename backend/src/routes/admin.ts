import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../utils/logger.js';
import { createNotification } from '../services/unifiedNotificationService.js';
import { body, param, validationResult } from 'express-validator';
import {
  getForumSettings,
  updateForumSetting,
  getCategoryPermissions,
  updateCategoryPermissions,
  getPermissionAuditLog
} from '../services/forumSettingsService.js';
import {
  getWebSettingsRaw,
  updateWebSetting,
  uploadSiteLogo,
  deleteSiteLogo,
  validateLogoFile,
  uploadHeroImage,
  deleteHeroImage,
  validateHeroFile
} from '../services/webSettingsService.js';
import {
  getAllCategoriesAdmin,
  getCategoryByIdAdmin,
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
  deleteCategoryPermanent,
  reorderCategories,
  addPermission,
  removePermission,
  getCategoryPermissions as getCategoryACLPermissions,
  getArchivedCategories
} from '../services/categoryService.js';
import {
  getDeletedThreads,
  getDeletedPosts
} from '../services/forumService.js';
import { requireAuth, requireOverlord, requirePermission } from '../middleware/auth.js';
import {
  getOverviewStats,
  getForumStats,
  getPvPStats,
  getPlayerStats,
  getPlayerActivity,
  getWhoList
} from '../services/analyticsService.js';
import { getServerHealth } from '../services/serverMonitor.js';
import { getPeakPlayerCount } from '../services/statisticsParser.js';
import { getDmsProcessStats } from '../services/processMonitor.js';
import { getMudState } from '../services/mudControlService.js';
import {
  listLogs,
  readLogPaginated,
  tailLog,
  getLogFilePath
} from '../services/logService.js';
import { createReadStream } from 'fs';
import { pool as db } from '../db/connection.js';
import { requestWhoList, isMudConnected, getMudBootTime } from '../services/mudAuctionClient.js';
import { getOnlinePlayers as getOnlinePlayersFromRedis } from '../services/onlinePlayersService.js';
import { getCategorizedProperties, searchProperties, updateProperty, validatePropertyValue, getPropertyHistory } from '../services/propertiesParser.js';
import { RowDataPacket } from 'mysql2';
import {
  createBackup,
  getBackupList,
  getBackupById,
  getBackupFilePath,
  deleteBackup,
  deleteFailedBackups,
  listBackupContents,
  createRestore,
  getRestoreById,
  getRestoreList,
  isMudRunning,
  validateUploadedBackup,
  createRestoreFromUpload,
  deleteUploadedBackup
} from '../services/backupService.js';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { getCurrentMudTime, formatMudTime, getMudTimeDescription } from '../services/mudTimeService.js';
import {
  getAllPermissions,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getAccountPermissions,
  getUserPermissions,
  assignRole,
  revokeRole,
  grantPermission,
  revokePermission
} from '../services/adminPermissionService.js';
import { searchAccounts, accountExists, updateAccountPassword } from '../services/accountService.js';
import bcrypt from 'bcrypt';
import { getGodLevelFromCharacterLevel } from '../services/permissionService.js';
import {
  getDupedItems,
  getDupeDetails,
  getDupeSummary,
  deletePlayerItem,
  deleteLockerItem,
  deletePlayerItems,
  deleteAllDupesForUid
} from '../services/dupeDetectionService.js';
import { testWebhook, manualPostBattle } from '../services/discordService.js';

const router: IRouter = Router();

// All admin routes require Overlord status (Level 62)

/**
 * GET /api/admin/forum/settings
 * Get all forum settings
 */
router.get('/forum/settings', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const settings = await getForumSettings();
    return res.json({ settings });
  } catch (error) {
    logger.error('Get forum settings error:', error);
    return res.status(500).json({ error: 'Failed to get forum settings' });
  }
});

/**
 * PUT /api/admin/forum/settings/:key
 * Update a single forum setting
 */
router.put(
  '/forum/settings/:key',
  requireAuth,
  requireOverlord,
  [
    param('key').trim().isLength({ min: 1, max: 100 }).withMessage('Invalid setting key'),
    body('value').trim().isLength({ min: 1, max: 255 }).withMessage('Value must be 1-255 characters'),
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

      const { key } = req.params;
      const { value } = req.body;

      // Validate that the key is a known setting
      const validKeys = [
        'min_level_to_moderate',
        'min_level_to_ban',
        'min_level_to_pin',
        'min_level_to_lock',
        'min_level_to_delete_any_post',
        'min_level_immortal_forum',
        'min_level_god_forum',
        'allow_mortal_posts',
        'post_rate_limit',
        'thread_rate_limit',
      ];

      if (!validKeys.includes(key)) {
        return res.status(400).json({ error: 'Invalid setting key' });
      }

      // Validate value format based on key
      if (key.startsWith('min_level_')) {
        const level = parseInt(value, 10);
        if (isNaN(level) || level < 0 || level > 62) {
          return res.status(400).json({ error: 'Level must be between 0 and 62' });
        }
      } else if (key === 'allow_mortal_posts') {
        if (value !== '0' && value !== '1') {
          return res.status(400).json({ error: 'Value must be 0 or 1' });
        }
      } else if (key.endsWith('_limit')) {
        const limit = parseInt(value, 10);
        if (isNaN(limit) || limit < 1) {
          return res.status(400).json({ error: 'Limit must be a positive integer' });
        }
      }

      await updateForumSetting(key, value, req.user.accountName);

      return res.json({
        success: true,
        message: `Setting '${key}' updated to '${value}'`,
      });
    } catch (error) {
      logger.error('Update forum setting error:', error);
      return res.status(500).json({ error: 'Failed to update setting' });
    }
  }
);

/**
 * GET /api/admin/forum/categories/:id/permissions
 * Get category-specific permission overrides
 */
router.get(
  '/forum/categories/:id/permissions',
  requireAuth,
  requireOverlord,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const permissions = await getCategoryPermissions(categoryId);

      return res.json({ permissions });
    } catch (error) {
      logger.error('Get category permissions error:', error);
      return res.status(500).json({ error: 'Failed to get category permissions' });
    }
  }
);

/**
 * PATCH /api/admin/forum/categories/:id/permissions
 * Update category-specific permission overrides
 */
router.patch(
  '/forum/categories/:id/permissions',
  requireAuth,
  requireOverlord,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('min_level_to_view')
      .optional()
      .custom((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 62))
      .withMessage('min_level_to_view must be null or 0-62'),
    body('min_level_to_post')
      .optional()
      .custom((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 62))
      .withMessage('min_level_to_post must be null or 0-62'),
    body('min_level_to_moderate')
      .optional()
      .custom((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 62))
      .withMessage('min_level_to_moderate must be null or 0-62'),
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
      const { min_level_to_view, min_level_to_post, min_level_to_moderate } = req.body;

      await updateCategoryPermissions(
        categoryId,
        { min_level_to_view, min_level_to_post, min_level_to_moderate },
        req.user.accountName
      );

      return res.json({
        success: true,
        message: 'Category permissions updated',
      });
    } catch (error) {
      logger.error('Update category permissions error:', error);
      return res.status(500).json({ error: 'Failed to update category permissions' });
    }
  }
);

/**
 * GET /api/admin/forum/audit-log
 * Get permission change audit log with filters and pagination
 */
router.get('/forum/audit-log', requireAuth, requirePermission('view_audit_log'), async (req: Request, res: Response) => {
  try {
    const filters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      changedBy: req.query.changedBy as string,
      changeType: req.query.changeType as 'property_change' | 'level_cap_change' | 'wipe' | 'timer_reset' | 'setting' | 'category_permission' | 'all',
      targetKey: req.query.targetKey as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string
    };

    const result = await getPermissionAuditLog(filters);

    return res.json(result);
  } catch (error) {
    logger.error('Get audit log error:', error);
    return res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ============================================================================
// Category Management Routes (New - Full CRUD + ACL)
// ============================================================================

/**
 * GET /api/admin/forum/categories/all
 * Get all categories including archived (admin view)
 */
router.get('/forum/categories/all', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.include_archived === 'true';
    const categories = await getAllCategoriesAdmin(includeArchived);
    return res.json({ categories });
  } catch (error) {
    logger.error('Get all categories error:', error);
    return res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * GET /api/admin/forum/categories/:id/details
 * Get single category with ACL permissions (admin view)
 */
router.get(
  '/forum/categories/:id/details',
  requireAuth,
  requireOverlord,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const category = await getCategoryByIdAdmin(categoryId);

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.json({ category });
    } catch (error) {
      logger.error('Get category details error:', error);
      return res.status(500).json({ error: 'Failed to get category details' });
    }
  }
);

/**
 * POST /api/admin/forum/categories
 * Create new category
 */
router.post(
  '/forum/categories',
  requireAuth,
  requireOverlord,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('accessType')
      .isIn(['public', 'authenticated', 'role_based', 'guild', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('minLevel')
      .optional()
      .isInt({ min: 57, max: 62 })
      .withMessage('Min level must be 57-62'),
    body('guildName').optional().isString().withMessage('Guild name must be a string'),
    body('parentId').optional().isInt().withMessage('Parent ID must be an integer'),
    body('sortOrder').optional().isInt().withMessage('Sort order must be an integer'),
    body('icon').optional().isString().withMessage('Icon must be a string'),
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

      const { name, description, accessType, minLevel, guildName, parentId, sortOrder, icon } = req.body;

      const categoryId = await createCategory(
        name,
        description || null,
        accessType,
        req.user.accountName,
        { minLevel, guildName, parentId, sortOrder, icon }
      );

      return res.status(201).json({
        success: true,
        message: 'Category created successfully',
        categoryId,
      });
    } catch (error) {
      logger.error('Create category error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to create category' });
    }
  }
);

/**
 * PATCH /api/admin/forum/categories/:id
 * Update category
 */
router.patch(
  '/forum/categories/:id',
  requireAuth,
  requireOverlord,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('description').optional({ nullable: true }).isString().withMessage('Description must be a string'),
    body('accessType')
      .optional()
      .isIn(['public', 'authenticated', 'role_based', 'guild', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('minLevel')
      .optional({ nullable: true })
      .custom((value) => value === null || (Number.isInteger(value) && value >= 57 && value <= 62))
      .withMessage('Min level must be null or 57-62'),
    body('guildName').optional({ nullable: true }).isString().withMessage('Guild name must be a string'),
    body('parentId')
      .optional({ nullable: true })
      .custom((value) => value === null || Number.isInteger(value))
      .withMessage('Parent ID must be null or an integer'),
    body('sortOrder').optional().isInt().withMessage('Sort order must be an integer'),
    body('icon').optional({ nullable: true }).isString().withMessage('Icon must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const updates = req.body;

      const success = await updateCategory(categoryId, updates);

      if (!success) {
        return res.status(404).json({ error: 'Category not found or no changes made' });
      }

      return res.json({
        success: true,
        message: 'Category updated successfully',
      });
    } catch (error) {
      logger.error('Update category error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to update category' });
    }
  }
);

/**
 * POST /api/admin/forum/categories/:id/archive
 * Archive category (soft delete)
 */
router.post(
  '/forum/categories/:id/archive',
  requireAuth,
  requireOverlord,
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
      await archiveCategory(categoryId, req.user.accountName);

      return res.json({
        success: true,
        message: 'Category archived successfully',
      });
    } catch (error) {
      logger.error('Archive category error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to archive category' });
    }
  }
);

/**
 * POST /api/admin/forum/categories/:id/restore
 * Restore archived category
 */
router.post(
  '/forum/categories/:id/restore',
  requireAuth,
  requireOverlord,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const success = await restoreCategory(categoryId);

      if (!success) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.json({
        success: true,
        message: 'Category restored successfully',
      });
    } catch (error) {
      logger.error('Restore category error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to restore category' });
    }
  }
);

/**
 * DELETE /api/admin/forum/categories/:id
 * Permanently delete category (dangerous!)
 */
router.delete(
  '/forum/categories/:id',
  requireAuth,
  requireOverlord,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const success = await deleteCategoryPermanent(categoryId);

      if (!success) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.json({
        success: true,
        message: 'Category permanently deleted',
      });
    } catch (error) {
      logger.error('Delete category error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to delete category' });
    }
  }
);

/**
 * POST /api/admin/forum/categories/reorder
 * Reorder categories
 */
router.post(
  '/forum/categories/reorder',
  requireAuth,
  requireOverlord,
  [
    body('orders')
      .isArray()
      .withMessage('Orders must be an array')
      .custom((orders) => {
        return orders.every(
          (order: any) =>
            typeof order === 'object' &&
            Number.isInteger(order.id) &&
            Number.isInteger(order.sortOrder)
        );
      })
      .withMessage('Each order must have id and sortOrder as integers'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { orders } = req.body;
      await reorderCategories(orders);

      return res.json({
        success: true,
        message: 'Categories reordered successfully',
      });
    } catch (error) {
      logger.error('Reorder categories error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to reorder categories' });
    }
  }
);

// ============================================================================
// ACL Permission Routes
// ============================================================================

/**
 * GET /api/admin/forum/categories/:id/acl
 * Get ACL permissions for a category
 */
router.get(
  '/forum/categories/:id/acl',
  requireAuth,
  requireOverlord,
  [param('id').isInt().withMessage('Category ID must be an integer')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const categoryId = parseInt(req.params.id);
      const permissions = await getCategoryACLPermissions(categoryId);

      return res.json({ permissions });
    } catch (error) {
      logger.error('Get ACL permissions error:', error);
      return res.status(500).json({ error: 'Failed to get ACL permissions' });
    }
  }
);

/**
 * POST /api/admin/forum/categories/:id/acl
 * Add ACL permission rule
 */
router.post(
  '/forum/categories/:id/acl',
  requireAuth,
  requireOverlord,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('permissionType').isIn(['allow', 'deny']).withMessage('Permission type must be allow or deny'),
    body('target').isObject().withMessage('Target must be an object'),
    body('target.minImmortalLevel')
      .optional()
      .isInt({ min: 57, max: 62 })
      .withMessage('Min immortal level must be 57-62'),
    body('target.guildName').optional().isString().withMessage('Guild name must be a string'),
    body('target.accountName').optional().isString().withMessage('Account name must be a string'),
    body('target.characterPid').optional().isString().withMessage('Character PID must be a string'),
    body('permissions').isObject().withMessage('Permissions must be an object'),
    body('permissions.canView').optional().isBoolean().withMessage('canView must be boolean'),
    body('permissions.canPost').optional().isBoolean().withMessage('canPost must be boolean'),
    body('permissions.canModerate').optional().isBoolean().withMessage('canModerate must be boolean'),
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
      const { permissionType, target, permissions } = req.body;

      // Convert characterPid from string to bigint if provided
      if (target.characterPid) {
        target.characterPid = BigInt(target.characterPid);
      }

      const permissionId = await addPermission(
        categoryId,
        req.user.accountName,
        permissionType,
        target,
        permissions
      );

      return res.status(201).json({
        success: true,
        message: 'ACL permission added successfully',
        permissionId,
      });
    } catch (error) {
      logger.error('Add ACL permission error:', error);
      return res.status(400).json({ error: getErrorMessage(error) || 'Failed to add ACL permission' });
    }
  }
);

/**
 * DELETE /api/admin/forum/categories/:categoryId/acl/:permissionId
 * Remove ACL permission rule
 */
router.delete(
  '/forum/categories/:categoryId/acl/:permissionId',
  requireAuth,
  requireOverlord,
  [
    param('categoryId').isInt().withMessage('Category ID must be an integer'),
    param('permissionId').isInt().withMessage('Permission ID must be an integer'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const permissionId = parseInt(req.params.permissionId);
      const success = await removePermission(permissionId);

      if (!success) {
        return res.status(404).json({ error: 'Permission not found' });
      }

      return res.json({
        success: true,
        message: 'ACL permission removed successfully',
      });
    } catch (error) {
      logger.error('Remove ACL permission error:', error);
      return res.status(500).json({ error: 'Failed to remove ACL permission' });
    }
  }
);

// ============================================================================
// Analytics Dashboard Routes
// ============================================================================

/**
 * GET /api/admin/analytics/overview
 * Get overview statistics for dashboard
 */
router.get('/analytics/overview', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const stats = await getOverviewStats();

    // Also get peak from flatfiles if database has no data
    if (stats.peakPlayerCount === 0) {
      const peakData = await getPeakPlayerCount();
      stats.peakPlayerCount = peakData.count;
      stats.peakPlayerTimestamp = peakData.timestamp?.toISOString() || null;
    }

    return res.json({ stats });
  } catch (error) {
    logger.error('Get overview stats error:', error);
    return res.status(500).json({ error: 'Failed to get overview statistics' });
  }
});

router.get('/mud-boot-time', requireAuth, async (_req: Request, res: Response) => {
  try {
    const bootTime = await getMudBootTime();
    return res.json({ bootTime });
  } catch (error) {
    logger.error('Get mud boot time error:', error);
    return res.status(500).json({ error: 'Failed to get MUD boot time' });
  }
});

/**
 * GET /api/admin/analytics/forum
 * Get forum analytics
 */
router.get('/analytics/forum', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const stats = await getForumStats();
    return res.json({ stats });
  } catch (error) {
    logger.error('Get forum stats error:', error);
    return res.status(500).json({ error: 'Failed to get forum statistics' });
  }
});

/**
 * GET /api/admin/analytics/pvp
 * Get PvP analytics
 */
router.get('/analytics/pvp', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const stats = await getPvPStats();
    return res.json({ stats });
  } catch (error) {
    logger.error('Get PvP stats error:', error);
    return res.status(500).json({ error: 'Failed to get PvP statistics' });
  }
});

/**
 * GET /api/admin/analytics/players
 * Get player demographics and statistics
 */
router.get('/analytics/players', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const stats = await getPlayerStats();
    return res.json({ stats });
  } catch (error) {
    logger.error('Get player stats error:', error);
    return res.status(500).json({ error: 'Failed to get player statistics' });
  }
});

/**
 * GET /api/admin/analytics/activity
 * Get player activity over time
 */
router.get('/analytics/activity', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const activity = await getPlayerActivity(hours);
    return res.json({ activity });
  } catch (error) {
    logger.error('Get player activity error:', error);
    return res.status(500).json({ error: 'Failed to get player activity' });
  }
});

/**
 * GET /api/admin/analytics/server
 * Get server health and resource usage
 */
router.get('/analytics/server', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const [serverHealth, dmsProcess] = await Promise.all([
      getServerHealth(),
      getDmsProcessStats()
    ]);

    // Transform to match frontend expectations
    const health = {
      diskSpace: {
        used: serverHealth.diskSpace.used,
        total: serverHealth.diskSpace.total,
        available: serverHealth.diskSpace.total - serverHealth.diskSpace.used,
      },
      memory: {
        used: serverHealth.memoryUsage.used,
        total: serverHealth.memoryUsage.total,
        free: serverHealth.memoryUsage.total - serverHealth.memoryUsage.used,
      },
      uptime: serverHealth.uptimeMs,
      database: {
        status: serverHealth.databaseStatus.connected ? 'healthy' : 'disconnected',
        connected: serverHealth.databaseStatus.connected,
        tables: serverHealth.tableSizes.map(t => ({
          name: t.tableName,
          size: t.sizeBytes,
          rows: t.rowCount,
        })),
      },
      dmsProcess: {
        cpu: dmsProcess.cpu,
        memory: dmsProcess.memory,
        memoryPercent: dmsProcess.memoryPercent,
        uptime: dmsProcess.uptime,
        pid: dmsProcess.pid,
        isRunning: dmsProcess.isRunning,
      },
    };

    return res.json({ health });
  } catch (error) {
    logger.error('Get server health error:', error);
    return res.status(500).json({ error: 'Failed to get server health' });
  }
});

/**
 * GET /api/admin/who
 * Get WHO list (currently online players) from mud:online redis key
 */
router.get('/who', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const redisPlayers = await getOnlinePlayersFromRedis();
    const now = Date.now();

    if (redisPlayers.length > 0) {
      const players = redisPlayers.map(p => ({
        char_name: p.name,
        account: p.account,
        last_ip: p.ip,
        level: p.level,
        race: p.race,
        class: p.class,
        faction: p.racewar,
        client: p.client,
        clientVersion: p.clientVersion,
        uptime_seconds: p.loginTime > 0 ? Math.floor((now - p.loginTime * 1000) / 1000) : 0,
      }));
      return res.json({ players, source: 'redis' });
    }

    // fallback to database if redis is empty
    const players = await getWhoList();
    return res.json({ players, source: 'database' });
  } catch (error) {
    logger.error('Get WHO list error:', error);
    return res.status(500).json({ error: 'Failed to get WHO list' });
  }
});

/**
 * POST /api/admin/analytics/cleanup-connections
 * Clean up stale ip_info records and return updated WHO list
 */
router.post('/analytics/cleanup-connections', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    // Step 1: Clean up stale connections (connected >1 hour ago, no disconnect)
    const [cleanupResult] = await db.query(
      `UPDATE ip_info
       SET last_disconnect = NOW()
       WHERE last_disconnect IS NULL
         AND last_connect < DATE_SUB(NOW(), INTERVAL 1 HOUR)`
    );

    const rowsAffected = (cleanupResult as any).affectedRows;

    // Step 2: Request fresh wholist from MUD via websocket (optional, for login history tracking)
    const mudConnected = isMudConnected();
    if (mudConnected) {
      requestWhoList();
    }

    // Step 3: Return current state from redis
    const whoList = await getOnlinePlayersFromRedis();

    return res.json({
      success: true,
      message: `Cleaned up ${rowsAffected} stale connection(s)${mudConnected ? ', requested fresh wholist from MUD' : ' (MUD not connected)'}`,
      whoList
    });
  } catch (error) {
    logger.error('Cleanup connections error:', error);
    return res.status(500).json({ error: 'Failed to cleanup connections' });
  }
});

// ============================================================================
// Archive Management Routes
// ============================================================================

/**
 * GET /api/admin/archives/categories
 * Get all archived categories
 */
router.get('/archives/categories', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const categories = await getArchivedCategories();
    return res.json({ categories });
  } catch (error) {
    logger.error('Get archived categories error:', error);
    return res.status(500).json({ error: 'Failed to get archived categories' });
  }
});

/**
 * GET /api/admin/archives/threads
 * Get deleted threads with pagination and filters
 * Query params: page, limit, categoryId
 */
router.get('/archives/threads', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;

    const result = await getDeletedThreads({ page, limit, categoryId });
    return res.json(result);
  } catch (error) {
    logger.error('Get deleted threads error:', error);
    return res.status(500).json({ error: 'Failed to get deleted threads' });
  }
});

/**
 * GET /api/admin/archives/posts
 * Get deleted posts with pagination and filters
 * Query params: page, limit, threadId
 */
router.get('/archives/posts', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const threadId = req.query.threadId ? parseInt(req.query.threadId as string) : undefined;

    const result = await getDeletedPosts({ page, limit, threadId });
    return res.json(result);
  } catch (error) {
    logger.error('Get deleted posts error:', error);
    return res.status(500).json({ error: 'Failed to get deleted posts' });
  }
});

// ============================================================================
// Server Logs Routes
// ============================================================================

/**
 * GET /api/admin/logs
 * List all available log files
 */
router.get('/logs', requireAuth, requirePermission('view_server_logs'), async (_req: Request, res: Response) => {
  try {
    const logs = await listLogs();
    return res.json({ logs });
  } catch (error) {
    logger.error('List logs error:', error);
    return res.status(500).json({ error: 'Failed to list log files' });
  }
});

/**
 * GET /api/admin/logs/:category/:logName
 * Get paginated log content
 * Query params: page, pageSize, search, startDate, endDate
 */
router.get(
  '/logs/:category/:logName',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 100;
      const searchText = req.query.search as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await readLogPaginated(
        category,
        logName,
        page,
        pageSize,
        searchText,
        startDate,
        endDate
      );

      return res.json(result);
    } catch (error) {
      logger.error('Read log error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to read log file' });
    }
  }
);

/**
 * GET /api/admin/logs/:category/:logName/tail
 * Get the last N lines of a log file
 * Query params: lines (default 100)
 */
router.get(
  '/logs/:category/:logName/tail',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const lines = req.query.lines ? parseInt(req.query.lines as string) : 100;

      const result = await tailLog(category, logName, lines);

      return res.json({ lines: result });
    } catch (error) {
      logger.error('Tail log error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to tail log file' });
    }
  }
);

/**
 * GET /api/admin/logs/:category/:logName/download
 * Download raw log file
 */
router.get(
  '/logs/:category/:logName/download',
  requireAuth,
  requirePermission('view_server_logs'),
  [
    param('category').isIn(['runtime', 'player']).withMessage('Category must be runtime or player'),
    param('logName').trim().isLength({ min: 1 }).withMessage('Log name is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const category = req.params.category as 'runtime' | 'player';
      const logName = req.params.logName;
      const logPath = getLogFilePath(category, logName);

      // Set headers for file download
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${category}-${logName}"`);

      // Stream the file
      const fileStream = createReadStream(logPath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        logger.error('Download log error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download log file' });
        }
      });
    } catch (error) {
      logger.error('Download log error:', error);
      res.status(500).json({ error: getErrorMessage(error) || 'Failed to download log file' });
    }
  }
);

// ============================================================================
// Connection Logs & Multi-Account Detection Routes
// ============================================================================

/**
 * GET /api/admin/connections/logs
 * Get paginated connection logs with filters
 */
router.get(
  '/connections/logs',
  requireAuth,
  requirePermission('view_connection_logs'),
  async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        limit = '50',
        account,
        character,
        ip,
        status,
        startDate,
        endDate
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100);
      const offset = (pageNum - 1) * limitNum;

      // Import services
      const { geolocateIP } = await import('../utils/geoip.js');

      // Build WHERE clauses
      const whereClauses: string[] = [];
      const params: any[] = [];

      if (account) {
        whereClauses.push('alh.account_name LIKE ?');
        params.push(`%${account}%`);
      }
      if (character) {
        whereClauses.push('alh.character_name LIKE ?');
        params.push(`%${character}%`);
      }
      if (ip) {
        whereClauses.push('alh.ip_address LIKE ?');
        params.push(`%${ip}%`);
      }
      if (status) {
        whereClauses.push('alh.status = ?');
        params.push(status);
      }
      if (startDate) {
        whereClauses.push('alh.timestamp >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereClauses.push('alh.timestamp <= ?');
        params.push(endDate);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM account_login_history alh ${whereClause}`;
      const [countRows] = await db.query(countQuery, params);
      const totalCount = (countRows as any)[0].count;

      // Get paginated results with suspicious scores
      const dataQuery = `
        SELECT alh.*, sa.suspicion_score
        FROM account_login_history alh
        LEFT JOIN suspicious_accounts sa ON alh.account_name = sa.account_name AND sa.is_resolved = FALSE
        ${whereClause}
        ORDER BY alh.timestamp DESC
        LIMIT ? OFFSET ?
      `;
      const [logs] = await db.query(dataQuery, [...params, limitNum, offset]);

      // Enrich with GeoIP data (batch lookup unique IPs)
      const logsArray = logs as any[];
      const uniqueIPs = [...new Set(logsArray.map(log => log.ip_address).filter(Boolean))];
      const geoData = new Map<string, any>();

      // Geolocate IPs (will use cache for previously seen IPs)
      for (const ip of uniqueIPs) {
        const geo = await geolocateIP(ip);
        if (geo) {
          geoData.set(ip, geo);
        }
      }

      // Format response
      const enrichedLogs = logsArray.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        accountName: log.account_name,
        characterName: log.character_name,
        ipAddress: log.ip_address,
        hostname: log.hostname,
        status: log.status,
        geoLocation: log.ip_address ? geoData.get(log.ip_address) || null : null
      }));

      return res.json({
        data: enrichedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      });
    } catch (error) {
      logger.error('Get connection logs error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to get connection logs' });
    }
  }
);

/**
 * GET /api/admin/connections/account/:accountName
 * Get connection history for a specific account
 */
router.get(
  '/connections/account/:accountName',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { days = '30' } = req.query;

      const daysBack = parseInt(days as string);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const { getConnectionTimeline } = await import('../services/multiAccountDetectionService.js');
      const timeline = await getConnectionTimeline(accountName, daysBack);

      return res.json({ data: timeline });
    } catch (error) {
      logger.error('Get account connections error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to get account connections' });
    }
  }
);

/**
 * GET /api/admin/connections/ip/:ip
 * Get all accounts that logged in from a specific IP
 */
router.get(
  '/connections/ip/:ip',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { ip } = req.params;

      const [accounts] = await db.query(
        'SELECT DISTINCT account_name FROM account_login_history WHERE ip_address = ? ORDER BY account_name',
        [ip]
      );

      // Get connection counts per account
      const accountDetails = await Promise.all(
        (accounts as any[]).map(async (acc) => {
          const [connections] = await db.query(
            'SELECT COUNT(*) as count FROM account_login_history WHERE account_name = ? AND ip_address = ?',
            [acc.account_name, ip]
          );

          const [lastSeen] = await db.query(
            'SELECT timestamp FROM account_login_history WHERE account_name = ? AND ip_address = ? ORDER BY timestamp DESC LIMIT 1',
            [acc.account_name, ip]
          );

          return {
            accountName: acc.account_name,
            connectionCount: parseInt((connections as any)[0].count),
            lastSeen: (lastSeen as any)[0]?.timestamp || null
          };
        })
      );

      return res.json({ data: accountDetails });
    } catch (error) {
      logger.error('Get IP connections error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to get IP connections' });
    }
  }
);

/**
 * GET /api/admin/connections/suspicious
 * Get list of flagged suspicious accounts
 */
router.get(
  '/connections/suspicious',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { includeResolved = 'false' } = req.query;

      const { getSuspiciousAccounts } = await import('../services/multiAccountDetectionService.js');
      const accounts = await getSuspiciousAccounts(includeResolved === 'true');

      return res.json({ data: accounts });
    } catch (error) {
      logger.error('Get suspicious accounts error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to get suspicious accounts' });
    }
  }
);

/**
 * POST /api/admin/connections/resolve/:accountName
 * Mark a suspicious account flag as reviewed/resolved
 */
router.post(
  '/connections/resolve/:accountName',
  requireAuth,
  requireOverlord,
  [
    body('notes').optional().isString()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { accountName } = req.params;
      const { notes } = req.body;
      const reviewedBy = req.user?.accountName || 'Unknown';

      const { resolveAccountFlag } = await import('../services/multiAccountDetectionService.js');
      const success = await resolveAccountFlag(accountName, reviewedBy, notes);

      if (!success) {
        return res.status(404).json({ error: 'No unresolved flag found for this account' });
      }

      return res.json({
        success: true,
        message: 'Account flag resolved'
      });
    } catch (error) {
      logger.error('Resolve account flag error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to resolve account flag' });
    }
  }
);

/**
 * GET /api/admin/connections/stats
 * Get connection log statistics for dashboard
 */
router.get(
  '/connections/stats',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const { findAccountsBySharedIP } = await import('../services/multiAccountDetectionService.js');

      // Get shared IP accounts
      const sharedIPAccounts = await findAccountsBySharedIP(2);

      // Get total connection count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [loginCountRows] = await db.query(
        "SELECT COUNT(*) as count FROM account_login_history WHERE status = 'login' AND timestamp >= ?",
        [thirtyDaysAgo]
      );

      const [uniqueAccountsRows] = await db.query(
        'SELECT COUNT(DISTINCT account_name) as count FROM account_login_history WHERE timestamp >= ?',
        [thirtyDaysAgo]
      );

      const [uniqueIPsRows] = await db.query(
        'SELECT COUNT(DISTINCT ip_address) as count FROM account_login_history WHERE ip_address IS NOT NULL AND timestamp >= ?',
        [thirtyDaysAgo]
      );

      const [suspiciousCountRows] = await db.query(
        'SELECT COUNT(*) as count FROM suspicious_accounts WHERE is_resolved = FALSE'
      );

      return res.json({
        data: {
          totalLogins: parseInt((loginCountRows as any)[0].count),
          uniqueAccounts: parseInt((uniqueAccountsRows as any)[0].count),
          uniqueIPs: parseInt((uniqueIPsRows as any)[0].count),
          sharedIPCount: sharedIPAccounts.length,
          suspiciousAccountCount: parseInt((suspiciousCountRows as any)[0].count)
        }
      });
    } catch (error) {
      logger.error('Get connection stats error:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to get connection stats' });
    }
  }
);

// ============================================================================
// MUD Settings Routes (Phase 1: Read-Only)
// ============================================================================

/**
 * GET /api/admin/mud/dashboard
 * Get overview statistics for MUD settings dashboard
 */
router.get('/mud/dashboard', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    // Get level cap data
    const [levelCapRows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM level_cap LIMIT 1'
    );
    const levelCap = levelCapRows[0] || null;

    // Get global timers (convert Unix timestamp to ISO string)
    const [timerRows] = await db.query<RowDataPacket[]>(
      'SELECT name, date FROM timers ORDER BY name'
    );

    // Get last wipe date (from wipe_history if exists, otherwise null)
    let lastWipeDate = null;
    try {
      const [wipeRows] = await db.query<RowDataPacket[]>(
        'SELECT executed_at FROM wipe_history ORDER BY executed_at DESC LIMIT 1'
      );
      lastWipeDate = wipeRows[0]?.executed_at || null;
    } catch (_error) {
      // Table might not exist yet - that's okay for Phase 1
      logger.info('wipe_history table not found (expected for Phase 1)');
    }

    // Parse properties file to get key settings
    const properties = await getCategorizedProperties();

    // Extract key properties for dashboard
    const levelingCategory = properties.find(cat => cat.name === 'Leveling');
    const epicCategory = properties.find(cat => cat.name === 'Epic');

    const keySettings = {
      maxExpLevel: levelingCategory?.properties.find(p => p.key === 'exp.maxExpLevel')?.value ?? null,
      globalXpRate: levelingCategory?.properties.find(p => p.key === 'exp.factor.global')?.value ?? null,
      goodXpRate: levelingCategory?.properties.find(p => p.key === 'exp.factor.racewar.good')?.value ?? null,
      evilXpRate: levelingCategory?.properties.find(p => p.key === 'exp.factor.racewar.evil')?.value ?? null,
      maxEpicLevel: epicCategory?.properties.find(p => p.key === 'epic.maxFreeLevel')?.value ?? null,
      epicErrandStep: epicCategory?.properties.find(p => p.key === 'epic.errandStep')?.value ?? null,
    };

    return res.json({
      levelCap: levelCap ? {
        level: levelCap.level,
        mostFrags: levelCap.most_frags,
        racewarLeader: levelCap.racewar_leader, // 1 = Good, 2 = Evil
        nextUpdate: levelCap.next_update
      } : null,
      timers: timerRows.map(row => ({
        name: row.name,
        date: new Date(row.date * 1000).toISOString() // Convert Unix timestamp to ISO string
      })),
      lastWipeDate,
      keySettings
    });
  } catch (error) {
    logger.error('Error fetching MUD dashboard data:', error);
    return res.status(500).json({ error: 'Failed to fetch MUD dashboard data' });
  }
});

/**
 * GET /api/admin/mud/time
 * Get current MUD time
 * No authentication required - public endpoint
 */
router.get('/mud/time', async (_req: Request, res: Response) => {
  try {
    const mudTime = getCurrentMudTime();

    return res.json({
      time: mudTime,
      formatted: formatMudTime(mudTime),
      description: getMudTimeDescription(mudTime),
    });
  } catch (error) {
    logger.error('Error calculating MUD time:', error);
    return res.status(500).json({ error: 'Failed to calculate MUD time' });
  }
});

/**
 * GET /api/admin/mud/properties
 * Get all properties grouped by category
 * Query params:
 *   - search: Filter by property key (optional)
 */
router.get('/mud/properties', requireAuth, requirePermission('manage_mud_properties'), async (req: Request, res: Response) => {
  try {
    const searchQuery = req.query.search as string | undefined;

    if (searchQuery) {
      const results = await searchProperties(searchQuery);
      return res.json({
        search: searchQuery,
        results
      });
    } else {
      const categories = await getCategorizedProperties();
      return res.json({ categories });
    }
  } catch (error) {
    logger.error('Error fetching properties:', error);
    return res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

/**
 * GET /api/admin/mud/level-cap
 * Get current level cap data from database
 */
router.get('/mud/level-cap', requireAuth, requirePermission('manage_level_cap'), async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM level_cap LIMIT 1'
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Level cap data not found' });
    }

    const row = rows[0];
    return res.json({
      level: row.level,
      mostFrags: row.most_frags,
      racewarLeader: row.racewar_leader, // 1 = Good, 2 = Evil
      nextUpdate: row.next_update
    });
  } catch (error) {
    logger.error('Error fetching level cap:', error);
    return res.status(500).json({ error: 'Failed to fetch level cap data' });
  }
});

/**
 * GET /api/admin/mud/timers
 * Get all global game timers
 */
router.get('/mud/timers', requireAuth, requirePermission('manage_timers'), async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT name, date FROM timers ORDER BY name'
    );

    return res.json({
      timers: rows.map(row => ({
        name: row.name,
        date: row.date,
        timestamp: new Date(row.date).getTime()
      }))
    });
  } catch (error) {
    logger.error('Error fetching timers:', error);
    return res.status(500).json({ error: 'Failed to fetch timers' });
  }
});

/**
 * PUT /api/admin/mud/properties/:key
 * Update a single property value (Phase 2)
 */
router.put(
  '/mud/properties/:key',
  requireAuth,
  requirePermission('manage_mud_properties'),
  [
    param('key').trim().isLength({ min: 1, max: 200 }).withMessage('Property key is required'),
    body('value').isNumeric().withMessage('Value must be a number'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
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

      const { key } = req.params;
      const { value, notes } = req.body;
      const numericValue = parseFloat(value);

      // Validate property value
      const validation = validatePropertyValue(key, numericValue);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Update property file (creates backup automatically)
      const { oldValue } = await updateProperty(key, numericValue);

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'property_change', ?, ?, ?, ?, ?)`,
        [
          req.user.accountName,
          key,
          oldValue.toString(),
          numericValue.toString(),
          notes || null,
          req.ip || null
        ]
      );

      return res.json({
        success: true,
        message: `Property '${key}' updated from ${oldValue} to ${numericValue}. Restart MUD to apply changes.`,
        oldValue,
        newValue: numericValue
      });
    } catch (error) {
      logger.error('Error updating property:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to update property' });
    }
  }
);

/**
 * GET /api/admin/mud/properties/:key/history
 * Get change history for a specific property
 */
router.get(
  '/mud/properties/:key/history',
  requireAuth,
  requirePermission('manage_mud_properties'),
  [param('key').trim().isLength({ min: 1, max: 200 }).withMessage('Property key is required')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { key } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const history = await getPropertyHistory(key, limit);

      return res.json({ history });
    } catch (error) {
      logger.error('Error fetching property history:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch property history' });
    }
  }
);

/**
 * PUT /api/admin/mud/level-cap
 * Manually update the level cap
 */
router.put(
  '/mud/level-cap',
  requireAuth,
  requirePermission('manage_level_cap'),
  [
    body('level').isInt({ min: 25, max: 60 }).withMessage('Level must be between 25 and 60'),
    body('racewarLeader').optional().isInt({ min: 0, max: 2 }).withMessage('Racewar leader must be 0 (neutral), 1 (Good), or 2 (Evil)'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
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

      const { level, racewarLeader, notes } = req.body;

      // Get current level cap
      const [currentRows] = await db.query<any[]>('SELECT level, racewar_leader, most_frags FROM level_cap LIMIT 1');
      if (!currentRows || currentRows.length === 0) {
        return res.status(500).json({ error: 'Level cap not found in database' });
      }

      const oldLevel = currentRows[0].level;
      const oldRacewar = currentRows[0].racewar_leader;

      // Update level cap
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      updateFields.push('level = ?');
      updateValues.push(level);

      if (racewarLeader !== undefined) {
        updateFields.push('racewar_leader = ?');
        updateValues.push(racewarLeader);
      }

      await db.query(
        `UPDATE level_cap SET ${updateFields.join(', ')}`,
        updateValues
      );

      // Log to audit trail
      const oldValue = `Level: ${oldLevel}, Racewar: ${oldRacewar === 1 ? 'Good' : oldRacewar === 2 ? 'Evil' : 'Neutral'}`;
      const newValue = `Level: ${level}, Racewar: ${racewarLeader !== undefined ? (racewarLeader === 1 ? 'Good' : racewarLeader === 2 ? 'Evil' : 'Neutral') : (oldRacewar === 1 ? 'Good' : oldRacewar === 2 ? 'Evil' : 'Neutral')}`;

      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'level_cap_change', 'level_cap', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValue,
          newValue,
          notes || 'Manual level cap override',
          req.ip || null
        ]
      );

      return res.json({
        success: true,
        message: `Level cap updated to ${level}. Players can now level up to this new cap.`,
        level,
        racewarLeader: racewarLeader !== undefined ? racewarLeader : oldRacewar
      });
    } catch (error) {
      logger.error('Error updating level cap:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to update level cap' });
    }
  }
);

/**
 * POST /api/admin/mud/level-cap/reset
 * Reset level cap to defaults (25, 0 frags, neutral)
 */
router.post(
  '/mud/level-cap/reset',
  requireAuth,
  requirePermission('manage_level_cap'),
  [body('notes').optional().isString().withMessage('Notes must be a string')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { notes } = req.body;

      // Get current level cap for logging
      const [currentRows] = await db.query<any[]>('SELECT level, racewar_leader, most_frags FROM level_cap LIMIT 1');
      const oldValue = currentRows && currentRows.length > 0
        ? `Level: ${currentRows[0].level}, Racewar: ${currentRows[0].racewar_leader === 1 ? 'Good' : currentRows[0].racewar_leader === 2 ? 'Evil' : 'Neutral'}, Frags: ${currentRows[0].most_frags}`
        : 'Unknown';

      // Reset to defaults
      await db.query(
        'UPDATE level_cap SET most_frags=0, racewar_leader=0, level=25, next_update=NOW()'
      );

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'level_cap_change', 'level_cap_reset', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValue,
          'Level: 25, Racewar: Neutral, Frags: 0',
          notes || 'Level cap reset to defaults',
          req.ip || null
        ]
      );

      return res.json({
        success: true,
        message: 'Level cap reset to defaults: Level 25, 0 frags, neutral racewar.'
      });
    } catch (error) {
      logger.error('Error resetting level cap:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to reset level cap' });
    }
  }
);

/**
 * POST /api/admin/mud/timers/reset
 * Reset one or multiple timers to current time
 */
router.post(
  '/mud/timers/reset',
  requireAuth,
  requirePermission('manage_timers'),
  [
    body('timerNames').isArray({ min: 1 }).withMessage('Timer names must be a non-empty array'),
    body('timerNames.*').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Invalid timer name'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
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

      const { timerNames, notes } = req.body;

      // Get current values for logging
      const [currentTimers] = await db.query<any[]>(
        'SELECT name, FROM_UNIXTIME(date) as date FROM timers WHERE name IN (?)',
        [timerNames]
      );

      const oldValues = currentTimers.map((t: any) => `${t.name}: ${t.date}`).join(', ');

      // Reset timers to current time
      await db.query(
        'UPDATE timers SET date = UNIX_TIMESTAMP() WHERE name IN (?)',
        [timerNames]
      );

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'timer_reset', ?, ?, ?, ?, ?)`,
        [
          req.user.accountName,
          timerNames.join(', '),
          oldValues,
          `Reset to NOW() at ${new Date().toISOString()}`,
          notes || `Manual timer reset: ${timerNames.join(', ')}`,
          req.ip || null
        ]
      );

      return res.json({
        success: true,
        message: `Reset ${timerNames.length} timer(s) successfully.`,
        count: timerNames.length
      });
    } catch (error) {
      logger.error('Error resetting timers:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to reset timers' });
    }
  }
);

/**
 * POST /api/admin/mud/timers/reset-all
 * Reset ALL timers to current time
 */
router.post(
  '/mud/timers/reset-all',
  requireAuth,
  requireOverlord,
  [body('notes').optional().isString().withMessage('Notes must be a string')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { notes } = req.body;

      // Get current values for logging
      const [currentTimers] = await db.query<any[]>(
        'SELECT name, FROM_UNIXTIME(date) as date FROM timers'
      );

      const oldValues = currentTimers.map((t: any) => `${t.name}: ${t.date}`).join(', ');
      const timerCount = currentTimers.length;

      // Reset all timers
      await db.query('UPDATE timers SET date = UNIX_TIMESTAMP()');

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'timer_reset', 'ALL_TIMERS', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValues,
          `All timers reset to NOW() at ${new Date().toISOString()}`,
          notes || 'Bulk timer reset - all timers',
          req.ip || null
        ]
      );

      return res.json({
        success: true,
        message: `Reset all ${timerCount} timers successfully.`,
        count: timerCount
      });
    } catch (error) {
      logger.error('Error resetting all timers:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to reset all timers' });
    }
  }
);

// ============================================================================
// Player Wipe Management
// ============================================================================

/**
 * GET /api/admin/mud/wipe/status
 * Check if wipe is on cooldown and return last wipe information
 * Requires: Overlord (Level 61+)
 */
router.get('/mud/wipe/status',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      // Get last wipe from history
      const [lastWipeRows] = await db.query<any[]>(
        `SELECT executed_at, executed_by, reason, success, tables_affected, rows_affected
         FROM wipe_history
         ORDER BY executed_at DESC
         LIMIT 1`
      );

      const lastWipe = lastWipeRows.length > 0 ? lastWipeRows[0] : null;

      // Calculate cooldown (7 days)
      const cooldownDays = 7;
      let isOnCooldown = false;
      let cooldownEndsAt = null;

      if (lastWipe && lastWipe.success) {
        const lastWipeDate = new Date(lastWipe.executed_at);
        const cooldownEnd = new Date(lastWipeDate.getTime() + (cooldownDays * 24 * 60 * 60 * 1000));
        const now = new Date();

        isOnCooldown = now < cooldownEnd;
        cooldownEndsAt = cooldownEnd.toISOString();
      }

      // use getMudState() - detects actual process state, not stale cache
      const mud = await getMudState();
      const mudState = mud.state;
      const mudRunning = mudState !== 'stopped';

      return res.json({
        success: true,
        isOnCooldown,
        cooldownEndsAt,
        mudRunning,
        mudState,
        lastWipe: lastWipe ? {
          executedAt: lastWipe.executed_at,
          executedBy: lastWipe.executed_by,
          reason: lastWipe.reason,
          success: lastWipe.success,
          tablesAffected: lastWipe.tables_affected,
          rowsAffected: lastWipe.rows_affected
        } : null
      });
    } catch (error) {
      logger.error('Error fetching wipe status:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch wipe status' });
    }
  }
);

/**
 * GET /api/admin/mud/wipe/players
 * Get list of all active players for exclusion selector
 * Requires: Overlord (Level 61+)
 */
router.get('/mud/wipe/players',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const [playerRows] = await db.query<any[]>(
        `SELECT fl.pid, fl.char_name as name, fl.level, fl.class as classname, pd.spec, fl.race,
                COALESCE(a.name, '') as guild,
                pd.copper + pd.silver * 10 + pd.gold * 100 + pd.platinum * 1000 as money,
                pd.bank_copper + pd.bank_silver * 10 + pd.bank_gold * 100 + pd.bank_platinum * 1000 as balance
         FROM frag_leaderboard fl
         JOIN player_data pd ON fl.pid = pd.pid
         LEFT JOIN associations a ON pd.assoc_id = a.id
         WHERE pd.active = 1 AND fl.deleted_at IS NULL
         ORDER BY fl.level DESC, fl.char_name ASC`
      );

      const players = playerRows.map(row => ({
        pid: row.pid,
        name: row.name,
        level: row.level,
        class: row.classname || 'Unknown',
        spec: row.spec || '',
        race: row.race || 'Unknown',
        guild: row.guild || 'None',
        wealth: (row.money || 0) + (row.balance || 0)
      }));

      return res.json({
        success: true,
        players
      });
    } catch (error) {
      logger.error('Error fetching players for wipe:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch players' });
    }
  }
);

/**
 * GET /api/admin/mud/wipe/history
 * Get wipe history with pagination
 * Requires: Overlord (Level 61+)
 */
router.get('/mud/wipe/history',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get total count
      const [countRows] = await db.query<any[]>(
        'SELECT COUNT(*) as total FROM wipe_history'
      );
      const total = countRows[0].total;

      // Get history records
      const [historyRows] = await db.query<any[]>(
        `SELECT id, executed_by, executed_at, reason, excluded_players,
                tables_affected, rows_affected, duration_seconds, success,
                error_message, backup_path, ip_address
         FROM wipe_history
         ORDER BY executed_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const history = historyRows.map(row => ({
        id: row.id,
        executedBy: row.executed_by,
        executedAt: row.executed_at,
        reason: row.reason,
        excludedPlayers: row.excluded_players ? JSON.parse(row.excluded_players) : [],
        tablesAffected: row.tables_affected,
        rowsAffected: row.rows_affected,
        durationSeconds: row.duration_seconds,
        success: Boolean(row.success),
        errorMessage: row.error_message,
        backupPath: row.backup_path,
        ipAddress: row.ip_address
      }));

      return res.json({
        success: true,
        history,
        total,
        limit,
        offset
      });
    } catch (error) {
      logger.error('Error fetching wipe history:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch wipe history' });
    }
  }
);

/**
 * POST /api/admin/mud/wipe/execute
 * execute player wipe with optional exclusions
 * requires: Overlord
 * body: { reason: string, excludedPids: number[], confirmation: string }
 */
router.post('/mud/wipe/execute',
  requireAuth,
  requireOverlord,
  [
    body('reason').isString().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters'),
    body('excludedPids').optional().isArray(),
    body('excludedPids.*').optional().isInt({ min: 1 }).withMessage('excludedPids must be positive integers'),
    body('confirmation').equals('WIPE PLAYERS').withMessage('Confirmation text must be "WIPE PLAYERS"'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    // mud must be stopped - connected chars would re-save after wipe
    const mud = await getMudState();
    if (mud.state !== 'stopped') {
      return res.status(409).json({
        error: 'mud_running',
        message: `MUD must be stopped before wipe (current state: ${mud.state})`,
      });
    }

    // 7-day cooldown enforced server-side (not just in status UI)
    const [lastOkRows] = await db.query<any[]>(
      `SELECT executed_at FROM wipe_history WHERE success = 1 ORDER BY executed_at DESC LIMIT 1`
    );
    if (lastOkRows[0]) {
      const end = new Date(lastOkRows[0].executed_at).getTime() + 7 * 24 * 60 * 60 * 1000;
      if (Date.now() < end) {
        return res.status(429).json({
          error: 'cooldown_active',
          message: `Wipe cooldown in effect until ${new Date(end).toISOString()}`,
        });
      }
    }

    const { reason, excludedPids = [] } = req.body;
    const startTime = Date.now();
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const safeExcluded = (excludedPids as any[])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      const excludedClause = safeExcluded.length > 0
        ? `WHERE pid NOT IN (${safeExcluded.join(',')})`
        : '';

      const [targetRows] = await connection.query<any[]>(
        `SELECT pid, name FROM player_data ${excludedClause}`
      );
      const wipedPids: number[] = targetRows.map((r: any) => Number(r.pid));
      const wipedNames: string[] = targetRows.map((r: any) => r.name);

      if (wipedPids.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'no_targets',
          message: 'No players would be wiped with the current exclusion set',
        });
      }

      const pidList = wipedPids.join(',');
      const wipedPidStrings = wipedPids.map((n) => `'${n}'`).join(',');

      let excludedPlayers: { pid: number; name: string }[] = [];
      if (safeExcluded.length > 0) {
        const [excludedRows] = await connection.query<any[]>(
          `SELECT pid, name FROM player_data WHERE pid IN (${safeExcluded.join(',')})`
        );
        excludedPlayers = excludedRows.map((r: any) => ({ pid: Number(r.pid), name: r.name }));
      }

      let totalRowsAffected = 0;
      const tablesAffected: string[] = [];

      const runDelete = async (table: string, sql: string, params?: any[]) => {
        const [result] = await connection!.query(sql, params) as any;
        const n = result.affectedRows ?? 0;
        totalRowsAffected += n;
        if (n > 0) tablesAffected.push(table);
      };

      // personal lockers - guild lockers (owner_assoc_id > 0) untouched
      await runDelete(
        'locker_items',
        `DELETE FROM locker_items WHERE locker_id IN (
           SELECT id FROM lockers WHERE owner_pid IN (${pidList}) AND owner_assoc_id = 0
         )`
      );
      await runDelete(
        'lockers',
        `DELETE FROM lockers WHERE owner_pid IN (${pidList}) AND owner_assoc_id = 0`
      );

      if (wipedNames.length > 0) {
        await runDelete('corpses', `DELETE FROM corpses WHERE player_name IN (?)`, [wipedNames]);
      }

      const pidTables: Array<[string, string]> = [
        ['pkill_info',               `DELETE FROM pkill_info               WHERE pid IN (${pidList})`],
        ['player_recipes',           `DELETE FROM player_recipes           WHERE pid IN (${pidList})`],
        ['player_shapechanges',      `DELETE FROM player_shapechanges      WHERE pid IN (${pidList})`],
        ['account_characters',       `DELETE FROM account_characters       WHERE pid IN (${pidList})`],
        ['frag_leaderboard',         `DELETE FROM frag_leaderboard         WHERE pid IN (${pidList})`],
        ['artifact_bind',            `DELETE FROM artifact_bind            WHERE owner_pid IN (${pidList})`],
        ['auction_item_pickups',     `DELETE FROM auction_item_pickups     WHERE pid IN (${pidList})`],
        ['auction_money_pickups',    `DELETE FROM auction_money_pickups    WHERE pid IN (${pidList})`],
        ['boons_progress',           `DELETE FROM boons_progress           WHERE pid IN (${pidList})`],
        ['boons_shop',               `DELETE FROM boons_shop               WHERE pid IN (${pidList})`],
        ['log_entries',              `DELETE FROM log_entries              WHERE pid IN (${pidList})`],
        ['ctf_data',                 `DELETE FROM ctf_data                 WHERE pid IN (${pidList})`],
        ['epic_bonus',               `DELETE FROM epic_bonus               WHERE pid IN (${pidList})`],
        ['epic_gain',                `DELETE FROM epic_gain                WHERE pid IN (${pidList})`],
        ['guild_members',            `DELETE FROM guild_members            WHERE player_pid IN (${pidList})`],
        ['ip_info',                  `DELETE FROM ip_info                  WHERE pid IN (${pidList})`],
        ['offline_messages',         `DELETE FROM offline_messages         WHERE pid IN (${pidList})`],
        ['progress',                 `DELETE FROM progress                 WHERE pid IN (${pidList})`],
        ['zone_trophy',              `DELETE FROM zone_trophy              WHERE pid IN (${pidList})`],
        // world_quest_accomplished.pid is varchar(45) - quote the pid list
        ['world_quest_accomplished', `DELETE FROM world_quest_accomplished WHERE pid IN (${wipedPidStrings})`],
      ];

      for (const [table, sql] of pidTables) {
        await runDelete(table, sql);
      }

      // boons is season-scoped global config (all rows pid=0, admin-authored).
      // with the season ending, these go with it - admins can reauthor.
      await runDelete('boons', `DELETE FROM boons`);

      // players_core is myisam - not part of the txn, best-effort
      try {
        await runDelete('players_core', `DELETE FROM players_core WHERE pid IN (${pidList})`);
      } catch (pcErr) {
        logger.warn('players_core wipe failed (non-fatal):', pcErr);
      }

      // pre-count cascaded children for accurate audit
      // (affectedRows on the parent DELETE does not include cascaded rows)
      const cascadedTables = [
        'player_affects', 'player_forged_items', 'player_granted_cmds',
        'player_intros', 'player_items', 'player_item_affects', 'player_item_extra_descr',
        'player_languages', 'player_pets', 'player_pet_items',
        'player_pet_item_affects', 'player_pet_item_extra_descr',
        'player_skills', 'player_spellbooks', 'player_timers',
        'player_undead_slots', 'player_witnesses',
      ];
      for (const t of cascadedTables) {
        let countSql: string;
        if (t === 'player_item_affects' || t === 'player_item_extra_descr') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE item_id IN (SELECT id FROM player_items WHERE pid IN (${pidList}))`;
        } else if (t === 'player_pet_items') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE pet_id IN (SELECT id FROM player_pets WHERE owner_pid IN (${pidList}))`;
        } else if (t === 'player_pet_item_affects' || t === 'player_pet_item_extra_descr') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE item_id IN (SELECT id FROM player_pet_items WHERE pet_id IN (SELECT id FROM player_pets WHERE owner_pid IN (${pidList})))`;
        } else if (t === 'player_pets') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE owner_pid IN (${pidList})`;
        } else {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE pid IN (${pidList})`;
        }
        const [cntRows] = await connection.query<any[]>(countSql);
        const n = Number(cntRows[0]?.n ?? 0);
        if (n > 0) {
          totalRowsAffected += n;
          tablesAffected.push(t);
        }
      }

      // the actual cascade trigger
      await runDelete('player_data', `DELETE FROM player_data WHERE pid IN (${pidList})`);

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const excludedPlayersJson = JSON.stringify(excludedPlayers);

      await connection.query(
        `INSERT INTO wipe_history
           (executed_by, reason, excluded_players, tables_affected, rows_affected, duration_seconds, success, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          req.user!.accountName,
          reason,
          excludedPlayersJson,
          tablesAffected.length,
          totalRowsAffected,
          durationSeconds,
          req.ip,
        ]
      );

      await connection.query(
        `INSERT INTO admin_action_log
           (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'player_wipe', 'all_players', ?, ?, ?, ?)`,
        [
          req.user!.accountName,
          `${totalRowsAffected} rows`,
          `${tablesAffected.length} tables`,
          reason,
          req.ip,
        ]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: `Player wipe completed. ${totalRowsAffected} rows across ${tablesAffected.length} tables.`,
        tablesAffected: tablesAffected.length,
        rowsAffected: totalRowsAffected,
        durationSeconds,
        excludedCount: excludedPlayers.length,
      });
    } catch (error) {
      if (connection) await connection.rollback();

      try {
        await db.query(
          `INSERT INTO wipe_history (executed_by, reason, success, error_message, ip_address)
           VALUES (?, ?, 0, ?, ?)`,
          [req.user!.accountName, reason, getErrorMessage(error), req.ip]
        );
      } catch (logError) {
        logger.error('Failed to log wipe error:', logError);
      }

      logger.error('Error executing player wipe:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to execute player wipe' });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * POST /api/admin/mud/wipe/guilds
 * Delete all guild forum categories. GuildSync will recreate them on next tick.
 * Requires: Overlord (Level 61+)
 */
router.post('/mud/wipe/guilds',
  requireAuth,
  requireOverlord,
  [
    body('reason').isString().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters'),
    body('confirmation').equals('WIPE').withMessage('Confirmation text must be "WIPE"'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { reason } = req.body;

    try {
      const [result] = await db.query<any>(
        `DELETE FROM forum_categories WHERE access_type = 'guild'`
      );
      const rowsDeleted = result.affectedRows || 0;

      await db.query(
        `INSERT INTO admin_action_log
         (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'guild_wipe', 'forum_categories', ?, ?, ?, ?)`,
        [
          req.user!.accountName,
          `${rowsDeleted} rows`,
          'deleted',
          reason,
          req.ip
        ]
      );

      return res.json({
        success: true,
        message: `Deleted ${rowsDeleted} guild categories. Guild sync will recreate them shortly.`,
        rowsDeleted
      });
    } catch (error) {
      logger.error('Error executing guild wipe:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to execute guild wipe' });
    }
  }
);

/**
 * POST /api/admin/ai-analysis/run
 * Run Gemini AI analysis on login data (async - notifies via websocket when done)
 */
router.post(
  '/ai-analysis/run',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    const { daysBack = 30 } = req.body;
    const accountName = req.user!.accountName;

    // return immediately, run analysis in background
    res.json({
      success: true,
      message: 'Analysis started. You will be notified when complete.'
    });

    // run analysis async
    (async () => {
      try {
        const { analyzeWithGemini, storeAnalysis } = await import('../services/geminiSuspicionAnalyzer.js');
        const analysis = await analyzeWithGemini(Number(daysBack));
        await storeAnalysis(analysis);

        // notify the requesting user
        try {
          await createNotification({
            accountName,
            source: 'ai_analysis',
            notificationType: 'ai_analysis_complete',
            message: `AI analysis complete: found ${analysis.suspicious_accounts?.length || 0} suspicious accounts`,
            link: '/admin/ai-analysis',
          });
          logger.info(`Notification sent to ${accountName} for AI analysis complete`);
        } catch (notifError) {
          logger.error('Failed to send AI analysis complete notification:', notifError);
        }
      } catch (error) {
        logger.error('AI analysis error:', error);
        try {
          await createNotification({
            accountName,
            source: 'ai_analysis',
            notificationType: 'ai_analysis_error',
            message: `AI analysis failed: ${getErrorMessage(error) || 'Unknown error'}`,
            link: '/admin/ai-analysis',
          });
          logger.info(`Notification sent to ${accountName} for AI analysis error`);
        } catch (notifError) {
          logger.error('Failed to send AI analysis error notification:', notifError);
        }
      }
    })();
  }
);

/**
 * GET /api/admin/ai-analysis/history
 * Get past AI analysis results
 */
router.get(
  '/ai-analysis/history',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    try {
      const { limit = 10 } = req.query;

      const [analyses] = await db.query<any[]>(
        `SELECT id, analysis_timestamp, suspicious_count, patterns_count, summary, created_at
         FROM gemini_analysis_log
         ORDER BY created_at DESC
         LIMIT ?`,
        [Number(limit)]
      );

      // convert mysql datetime strings to iso format with utc timezone
      const data = analyses.map((row: any) => ({
        ...row,
        analysis_timestamp: row.analysis_timestamp ? String(row.analysis_timestamp).replace(' ', 'T') + 'Z' : null,
        created_at: row.created_at ? String(row.created_at).replace(' ', 'T') + 'Z' : null,
      }));

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Get AI history error:', error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error) || 'Failed to get analysis history'
      });
    }
  }
);

/**
 * GET /api/admin/ai-analysis/:id
 * Get detailed AI analysis by ID
 */
router.get(
  '/ai-analysis/:id',
  requireAuth,
  requirePermission('use_ai_analysis'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [analyses]: any = await db.query(
        'SELECT * FROM gemini_analysis_log WHERE id = ?',
        [id]
      );

      if (analyses.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Analysis not found'
        });
      }

      // convert mysql datetime strings to iso format with utc timezone
      const row = analyses[0];
      const data = {
        ...row,
        analysis_timestamp: row.analysis_timestamp ? String(row.analysis_timestamp).replace(' ', 'T') + 'Z' : null,
        created_at: row.created_at ? String(row.created_at).replace(' ', 'T') + 'Z' : null,
      };

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('Get AI analysis error:', error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error) || 'Failed to get analysis'
      });
    }
  }
);

/**
 * GET /api/admin/crashes
 * Get crash logs with pagination and filtering
 */
router.get('/crashes', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const analyzed = req.query.analyzed === 'true' ? 1 : req.query.analyzed === 'false' ? 0 : undefined;
    const offset = (page - 1) * limit;

    const params: any[] = [];
    let whereClause = '';

    if (analyzed !== undefined) {
      whereClause = ' WHERE analyzed = ?';
      params.push(analyzed);
    }

    const [countRows] = await db.query(`SELECT COUNT(*) as total FROM crash_log${whereClause}`, params);
    const total = (countRows as any)[0].total;

    const [crashes] = await db.query<any[]>(
      `SELECT * FROM crash_log${whereClause} ORDER BY crash_timestamp DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // convert mysql datetime strings to iso format with utc timezone
    const crashesWithTz = crashes.map((row: any) => ({
      ...row,
      crash_timestamp: row.crash_timestamp ? String(row.crash_timestamp).replace(' ', 'T') + 'Z' : null,
      analyzed_at: row.analyzed_at ? String(row.analyzed_at).replace(' ', 'T') + 'Z' : null,
    }));

    return res.json({
      crashes: crashesWithTz,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get crashes error:', error);
    return res.status(500).json({ error: 'Failed to get crash logs' });
  }
});

/**
 * GET /api/admin/crashes/:id
 * Get crash details by ID
 */
router.get('/crashes/:id', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [crashes] = await db.query('SELECT * FROM crash_log WHERE id = ?', [id]);
    const row = (crashes as any[])[0];

    if (!row) {
      return res.status(404).json({ error: 'Crash not found' });
    }

    // convert mysql datetime strings to iso format with utc timezone
    const crash = {
      ...row,
      crash_timestamp: row.crash_timestamp ? String(row.crash_timestamp).replace(' ', 'T') + 'Z' : null,
      analyzed_at: row.analyzed_at ? String(row.analyzed_at).replace(' ', 'T') + 'Z' : null,
    };

    return res.json({ crash });
  } catch (error) {
    logger.error('Get crash details error:', error);
    return res.status(500).json({ error: 'Failed to get crash details' });
  }
});

/**
 * PATCH /api/admin/crashes/:id
 * Update crash (mark as analyzed, add notes)
 */
router.patch('/crashes/:id', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { analyzed, notes } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (typeof analyzed === 'boolean') {
      updates.push('analyzed = ?');
      params.push(analyzed ? 1 : 0);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      params.push(id);
      await db.query(
        `UPDATE crash_log SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error('Update crash error:', error);
    return res.status(500).json({ error: 'Failed to update crash' });
  }
});

/**
 * GET /api/admin/server-health
 * Get current server health metrics
 */
router.get('/server-health', requireAuth, requirePermission('view_server_health'), async (_req: Request, res: Response) => {
  try {
    const { getServerHealth: getHealth, getHealthStatus } = await import('../services/serverHealthService.js');

    const health = await getHealth();
    const status = getHealthStatus(health);

    return res.json({ health, status });
  } catch (error) {
    logger.error('Get server health error:', error);
    return res.status(500).json({ error: 'Failed to get server health' });
  }
});

/**
 * GET /api/admin/server-health/history
 * Get historical health metrics
 */
router.get('/server-health/history', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const { getHealthHistory } = await import('../services/serverHealthService.js');

    const history = await getHealthHistory(hours);

    return res.json({ history });
  } catch (error) {
    logger.error('Get health history error:', error);
    return res.status(500).json({ error: 'Failed to get health history' });
  }
});

/**
 * GET /api/admin/server-health/incidents
 * Get recent server incidents
 */
router.get('/server-health/incidents', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const [incidents] = await db.query(
      'SELECT * FROM server_incidents ORDER BY started_at DESC LIMIT ?',
      [limit]
    );

    return res.json({ incidents });
  } catch (error) {
    logger.error('Get incidents error:', error);
    return res.status(500).json({ error: 'Failed to get incidents' });
  }
});

/**
 * GET /api/admin/server-health/uptime
 * Get uptime percentage
 */
router.get('/server-health/uptime', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const { getUptimePercentage } = await import('../services/serverHealthService.js');

    const uptime = await getUptimePercentage(days);

    return res.json({ uptime, days });
  } catch (error) {
    logger.error('Get uptime error:', error);
    return res.status(500).json({ error: 'Failed to get uptime' });
  }
});

/**
 * GET /api/admin/incidents
 * Get all incidents (admin view with full details)
 */
router.get('/incidents', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;

    let whereClause = '';
    const params: any[] = [];

    if (dateFrom && dateTo) {
      whereClause = 'WHERE started_at >= ? AND started_at <= ?';
      params.push(dateFrom, dateTo + ' 23:59:59');
    }

    const [incidents] = await db.query(
      `SELECT * FROM server_incidents ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM server_incidents ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    return res.json({
      incidents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Get incidents error:', error);
    return res.status(500).json({ error: 'Failed to get incidents' });
  }
});

/**
 * POST /api/admin/incidents
 * Create new incident
 */
router.post('/incidents', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const { incident_type, severity, title, description, started_at, ended_at, resolved, public_visible } = req.body;

    if (!incident_type || !severity || !title || !started_at) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const duration_seconds = ended_at
      ? Math.floor((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000)
      : null;

    const [result] = await db.query(
      `INSERT INTO server_incidents (
        incident_type, severity, title, description, started_at, ended_at, duration_seconds, resolved, public_visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incident_type,
        severity,
        title,
        description || null,
        started_at,
        ended_at || null,
        duration_seconds,
        resolved ? 1 : 0,
        public_visible ? 1 : 0,
      ]
    );

    return res.status(201).json({
      success: true,
      id: (result as any).insertId,
    });
  } catch (error) {
    logger.error('Create incident error:', error);
    return res.status(500).json({ error: 'Failed to create incident' });
  }
});

/**
 * PATCH /api/admin/incidents/:id
 * Update incident
 */
router.patch('/incidents/:id', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { incident_type, severity, title, description, started_at, ended_at, resolved, resolution_notes, public_visible, analyzed, notes } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (incident_type !== undefined) {
      updates.push('incident_type = ?');
      values.push(incident_type);
    }
    if (severity !== undefined) {
      updates.push('severity = ?');
      values.push(severity);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (started_at !== undefined) {
      updates.push('started_at = ?');
      values.push(started_at);
    }
    if (ended_at !== undefined) {
      updates.push('ended_at = ?');
      values.push(ended_at || null);

      // Recalculate duration if ended_at is provided
      if (ended_at) {
        const [incident] = await db.query('SELECT started_at FROM server_incidents WHERE id = ?', [id]);
        if ((incident as any[]).length > 0) {
          const startedAt = new Date((incident as any[])[0].started_at);
          const endedAtDate = new Date(ended_at);
          const duration = Math.floor((endedAtDate.getTime() - startedAt.getTime()) / 1000);
          updates.push('duration_seconds = ?');
          values.push(duration);
        }
      }
    }
    if (resolved !== undefined) {
      updates.push('resolved = ?');
      values.push(resolved ? 1 : 0);
    }
    if (resolution_notes !== undefined) {
      updates.push('resolution_notes = ?');
      values.push(resolution_notes);
    }
    if (public_visible !== undefined) {
      updates.push('public_visible = ?');
      values.push(public_visible ? 1 : 0);
    }
    if (analyzed !== undefined) {
      updates.push('analyzed = ?');
      values.push(analyzed ? 1 : 0);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    await db.query(
      `UPDATE server_incidents SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return res.json({ success: true });
  } catch (error) {
    logger.error('Update incident error:', error);
    return res.status(500).json({ error: 'Failed to update incident' });
  }
});

/**
 * DELETE /api/admin/incidents/:id
 * Delete incident
 */
router.delete('/incidents/:id', requireAuth, requirePermission('view_server_health'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    await db.query('DELETE FROM server_incidents WHERE id = ?', [id]);

    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete incident error:', error);
    return res.status(500).json({ error: 'Failed to delete incident' });
  }
});

/**
 * ========================================
 * PERMISSION MANAGEMENT ROUTES (Phase 2)
 * ========================================
 */

/**
 * GET /api/admin/permissions
 * List all available permissions
 */
router.get('/permissions', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const permissions = await getAllPermissions();
    return res.json(permissions);
  } catch (error) {
    logger.error('Get permissions error:', error);
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * GET /api/admin/roles
 * List all roles with permission counts
 */
router.get('/roles', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const roles = await getAllRoles();
    return res.json(roles);
  } catch (error) {
    logger.error('Get roles error:', error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * GET /api/admin/roles/:id
 * Get role details with permissions
 */
router.get('/roles/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id);

    if (isNaN(roleId)) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    const role = await getRoleById(roleId);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    return res.json(role);
  } catch (error) {
    logger.error('Get role error:', error);
    return res.status(500).json({ error: 'Failed to fetch role' });
  }
});

/**
 * POST /api/admin/roles
 * Create new role
 */
router.post('/roles', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { name, description, permissionIds } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'Permission IDs must be an array' });
    }

    const accountName = req.user?.accountName;
    if (!accountName) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const roleId = await createRole(name, description || null, permissionIds, accountName);

    return res.status(201).json({
      success: true,
      roleId,
      message: 'Role created successfully'
    });
  } catch (error) {
    logger.error('Create role error:', error);
    return res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * PUT /api/admin/roles/:id
 * Update role
 */
router.put('/roles/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id);
    const { name, description, permissionIds } = req.body;

    if (isNaN(roleId)) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'Permission IDs must be an array' });
    }

    await updateRole(roleId, name, description || null, permissionIds);

    return res.json({
      success: true,
      message: 'Role updated successfully'
    });
  } catch (error) {
    logger.error('Update role error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/admin/roles/:id
 * Delete role
 */
router.delete('/roles/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.id);

    if (isNaN(roleId)) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    await deleteRole(roleId);

    return res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    logger.error('Delete role error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete role';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/accounts
 * Get all accounts with assigned roles, permissions, or god-level characters
 * Returns full permission data to avoid N+1 queries
 */
router.get('/accounts', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
        a.account_name,
        MAX(pd.level) as max_level,
        GROUP_CONCAT(DISTINCT CONCAT(r.id, ':', r.role_name) SEPARATOR '|') as roles,
        GROUP_CONCAT(DISTINCT CONCAT(p.id, ':', p.permission_name) SEPARATOR '|') as permissions
      FROM (
        SELECT account_name FROM admin_account_roles
        UNION
        SELECT account_name FROM admin_account_permissions
        UNION
        SELECT DISTINCT ac.account_name
        FROM account_characters ac
        INNER JOIN player_data pd ON ac.pid = pd.pid
        WHERE pd.level >= 57 AND ac.deleted_at IS NULL
      ) AS a
      LEFT JOIN account_characters ac ON a.account_name = ac.account_name AND ac.deleted_at IS NULL
      LEFT JOIN player_data pd ON ac.pid = pd.pid
      LEFT JOIN admin_account_roles ar ON a.account_name = ar.account_name
      LEFT JOIN admin_roles r ON ar.role_id = r.id
      LEFT JOIN admin_account_permissions ap ON a.account_name = ap.account_name
      LEFT JOIN admin_permissions p ON ap.permission_id = p.id
      GROUP BY a.account_name
      ORDER BY max_level DESC, a.account_name`
    );

    // Parse the concatenated strings into structured data
    const accounts = rows.map((row: any) => {
      const maxLevel = row.max_level || 0;
      const { role: godLevel, immortalLevel } = getGodLevelFromCharacterLevel(maxLevel);

      // Parse roles from "id:name|id:name" format
      const roles = row.roles
        ? row.roles.split('|').map((r: string) => {
            const [id, name] = r.split(':');
            return { id: parseInt(id), name };
          })
        : [];

      // Parse permissions from "id:name|id:name" format
      const individualPermissions = row.permissions
        ? row.permissions.split('|').map((p: string) => {
            const [id, name] = p.split(':');
            return { id: parseInt(id), name };
          })
        : [];

      return {
        accountName: row.account_name,
        godLevel,
        immortalLevel,
        roles,
        individualPermissions
      };
    });

    return res.json(accounts);
  } catch (error) {
    logger.error('Get accounts with permissions error:', error);
    return res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

/**
 * GET /api/admin/accounts/search
 * Search for accounts by name prefix
 */
router.get('/accounts/search', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const query = (req.query.query as string) || '';
    const limit = parseInt(req.query.limit as string) || 9999;

    // Allow empty query to fetch all accounts
    const accounts = await searchAccounts(query, limit);
    return res.json(accounts);
  } catch (error) {
    logger.error('Search accounts error:', error);
    return res.status(500).json({ error: 'Failed to search accounts' });
  }
});

/**
 * GET /api/admin/accounts/:accountName/permissions
 * Get account's effective permissions
 */
router.get('/accounts/:accountName/permissions', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;

    const effectivePermissions = await getUserPermissions(accountName);
    const accountDetails = await getAccountPermissions(accountName);

    // Get god level from permission service
    const { parseAccountFile } = await import('../services/mudAccountParser.js');
    const { getUserPermissions: getPermissions } = await import('../services/permissionService.js');

    const mudAccount = await parseAccountFile(accountName);
    const userPermissions = await getPermissions(accountName, mudAccount.characters);

    return res.json({
      accountName,
      godLevel: userPermissions.role,
      immortalLevel: userPermissions.immortalLevel || null,
      effectivePermissions: Array.from(effectivePermissions),
      roles: accountDetails.roles,
      individualPermissions: accountDetails.individual_permissions
    });
  } catch (error) {
    logger.error('Get account permissions error:', error);
    return res.status(500).json({ error: 'Failed to fetch account permissions' });
  }
});

/**
 * POST /api/admin/accounts/:accountName/roles
 * Assign role to account
 */
router.post('/accounts/:accountName/roles', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const { roleId } = req.body;

    if (!roleId || isNaN(parseInt(roleId))) {
      return res.status(400).json({ error: 'Valid role ID is required' });
    }

    const grantedBy = req.user?.accountName;
    if (!grantedBy) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    await assignRole(accountName, parseInt(roleId), grantedBy, ipAddress);

    return res.json({
      success: true,
      message: 'Role assigned successfully'
    });
  } catch (error) {
    logger.error('Assign role error:', error);
    const message = error instanceof Error ? error.message : 'Failed to assign role';
    return res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/admin/accounts/:accountName/roles/:roleId
 * Revoke role from account
 */
router.delete('/accounts/:accountName/roles/:roleId', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { accountName, roleId } = req.params;

    if (isNaN(parseInt(roleId))) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    const revokedBy = req.user?.accountName || 'system';
    const ipAddress = req.ip || req.socket.remoteAddress;
    await revokeRole(accountName, parseInt(roleId), revokedBy, ipAddress);

    return res.json({
      success: true,
      message: 'Role revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke role error:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke role';
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/accounts/:accountName/permissions
 * Grant individual permission to account
 */
router.post('/accounts/:accountName/permissions', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const { permissionId } = req.body;

    if (!permissionId || isNaN(parseInt(permissionId))) {
      return res.status(400).json({ error: 'Valid permission ID is required' });
    }

    const grantedBy = req.user?.accountName;
    if (!grantedBy) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    await grantPermission(accountName, parseInt(permissionId), grantedBy, ipAddress);

    return res.json({
      success: true,
      message: 'Permission granted successfully'
    });
  } catch (error) {
    logger.error('Grant permission error:', error);
    const message = error instanceof Error ? error.message : 'Failed to grant permission';
    return res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/admin/accounts/:accountName/permissions/:permissionId
 * Revoke individual permission from account
 */
router.delete('/accounts/:accountName/permissions/:permissionId', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { accountName, permissionId } = req.params;

    if (isNaN(parseInt(permissionId))) {
      return res.status(400).json({ error: 'Invalid permission ID' });
    }

    const revokedBy = req.user?.accountName || 'system';
    const ipAddress = req.ip || req.socket.remoteAddress;
    await revokePermission(accountName, parseInt(permissionId), revokedBy, ipAddress);

    return res.json({
      success: true,
      message: 'Permission revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke permission error:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke permission';
    return res.status(500).json({ error: message });
  }
});

// ============================================================================
// MUD Backup Routes
// ============================================================================

/**
 * GET /api/admin/backup/list
 * List all backups
 */
router.get('/backup/list', requireAuth, requirePermission('manage_mud_backup'), async (_req: Request, res: Response) => {
  try {
    const backups = await getBackupList();
    return res.json({ backups });
  } catch (error) {
    logger.error('List backups error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list backups';
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/backup/create
 * Start a new backup
 */
router.post('/backup/create', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName || 'unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const result = await createBackup(accountName, ipAddress);
    return res.json({
      success: true,
      message: 'Backup started',
      ...result
    });
  } catch (error) {
    logger.error('Create backup error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start backup';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/backup/status/:id
 * Get backup status (fallback for polling)
 */
router.get('/backup/status/:id', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid backup ID' });
    }

    const backup = await getBackupById(id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    return res.json({ backup });
  } catch (error) {
    logger.error('Get backup status error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get backup status';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/backup/download/:id
 * Download a completed backup
 */
router.get('/backup/download/:id', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid backup ID' });
      return;
    }

    const backup = await getBackupById(id);
    if (!backup) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    if (backup.status !== 'completed') {
      res.status(400).json({ error: 'Backup is not ready for download' });
      return;
    }

    const filePath = await getBackupFilePath(id);
    if (!filePath) {
      res.status(404).json({ error: 'Backup file not found' });
      return;
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    if (backup.fileSize) {
      res.setHeader('Content-Length', backup.fileSize.toString());
    }

    // Stream the file
    const fileStream = createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('Download backup error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download backup file' });
      }
    });
  } catch (error) {
    logger.error('Download backup error:', error);
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : 'Failed to download backup';
      res.status(500).json({ error: message });
    }
  }
});

/**
 * DELETE /api/admin/backup/failed
 * Delete all failed backups (overlord only)
 */
router.delete('/backup/failed', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const deletedCount = await deleteFailedBackups();
    return res.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} failed backup(s)`
    });
  } catch (error) {
    logger.error('Delete failed backups error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete failed backups';
    return res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/admin/backup/:id
 * Delete a backup (overlord only)
 */
router.delete('/backup/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid backup ID' });
    }

    const deleted = await deleteBackup(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    return res.json({
      success: true,
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    logger.error('Delete backup error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete backup';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/backup/:id/contents
 * List accounts and characters in a backup
 */
router.get('/backup/:id/contents', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid backup ID' });
    }

    const contents = await listBackupContents(id);
    if (!contents) {
      return res.status(404).json({ error: 'Backup not found or not completed' });
    }

    return res.json(contents);
  } catch (error) {
    logger.error('List backup contents error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list backup contents';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/backup/mud-status
 * Check if MUD is currently running
 */
router.get('/backup/mud-status', requireAuth, requirePermission('manage_mud_backup'), async (_req: Request, res: Response) => {
  try {
    const running = isMudRunning();
    return res.json({ running });
  } catch (error) {
    logger.error('Check MUD status error:', error);
    return res.status(500).json({ error: 'Failed to check MUD status' });
  }
});

/**
 * POST /api/admin/backup/restore
 * Create a new restore operation
 *
 * Request body:
 * - backupId: number (required)
 * - restoreType: 'full' | 'account' | 'character' (required)
 * - accounts: string[] (required for account restore)
 * - characters: { pid: number; name: string }[] (required for character restore)
 * - categories: RestoreCategories (optional for character restore, defaults applied)
 */
router.post('/backup/restore', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const { backupId, restoreType, accounts, characters, categories } = req.body;

    if (!backupId || !restoreType) {
      return res.status(400).json({ error: 'backupId and restoreType are required' });
    }

    if (!['full', 'account', 'character'].includes(restoreType)) {
      return res.status(400).json({ error: 'restoreType must be "full", "account", or "character"' });
    }

    if (restoreType === 'account' && (!accounts || !Array.isArray(accounts) || accounts.length === 0)) {
      return res.status(400).json({ error: 'accounts array is required for account restore' });
    }

    if (restoreType === 'character' && (!characters || !Array.isArray(characters) || characters.length === 0)) {
      return res.status(400).json({ error: 'characters array is required for character restore' });
    }

    // validate characters format
    if (characters) {
      for (const char of characters) {
        if (typeof char.pid !== 'number' || typeof char.name !== 'string') {
          return res.status(400).json({ error: 'Each character must have pid (number) and name (string)' });
        }
      }
    }

    const accountName = req.user?.accountName || 'unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const result = await createRestore(
      { backupId, restoreType, accounts, characters, categories },
      accountName,
      ipAddress
    );

    return res.json({
      success: true,
      id: result.id,
      message: 'Restore operation started'
    });
  } catch (error) {
    logger.error('Create restore error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start restore';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/restore/list
 * Get list of all restore operations
 */
router.get('/restore/list', requireAuth, requirePermission('manage_mud_backup'), async (_req: Request, res: Response) => {
  try {
    const restores = await getRestoreList();
    return res.json(restores);
  } catch (error) {
    logger.error('Get restore list error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get restore list';
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/restore/status/:id
 * Get status of a specific restore operation
 */
router.get('/restore/status/:id', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid restore ID' });
    }

    const restore = await getRestoreById(id);
    if (!restore) {
      return res.status(404).json({ error: 'Restore not found' });
    }

    return res.json(restore);
  } catch (error) {
    logger.error('Get restore status error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get restore status';
    return res.status(500).json({ error: message });
  }
});

// ============================================================================
// BACKUP UPLOAD ENDPOINTS
// ============================================================================

// Multer configuration for backup uploads (disk storage in temp directory)
const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'backup-upload-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  },
});

/**
 * POST /api/admin/backup/upload
 * Upload a backup file and validate it
 * Returns the backup contents if valid
 */
router.post('/backup/upload', requireAuth, requirePermission('manage_mud_backup'), backupUpload.single('backup'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const result = await validateUploadedBackup(filePath);

    if (!result.isValid) {
      // Cleanup invalid file
      await deleteUploadedBackup(filePath);
      return res.status(400).json({ error: result.errorMessage || 'Invalid backup file' });
    }

    return res.json({
      success: true,
      tempPath: result.tempPath,
      contents: result.contents,
    });
  } catch (error) {
    logger.error('Backup upload error:', error);

    // Cleanup file on error
    if (req.file) {
      await deleteUploadedBackup(req.file.path);
    }

    // Handle multer errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
    }

    const message = getErrorMessage(error) || 'Failed to upload backup';
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/backup/upload/restore
 * Restore from an uploaded backup file
 *
 * Request body:
 * - tempPath: string (required)
 * - restoreType: 'full' | 'account' | 'character' (required)
 * - accounts: string[] (required for account restore)
 * - characters: { pid: number; name: string }[] (required for character restore)
 * - categories: RestoreCategories (optional for character restore)
 */
router.post('/backup/upload/restore', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const { tempPath, restoreType, accounts, characters, categories } = req.body;

    if (!tempPath || !restoreType) {
      return res.status(400).json({ error: 'tempPath and restoreType are required' });
    }

    if (!['full', 'account', 'character'].includes(restoreType)) {
      return res.status(400).json({ error: 'restoreType must be "full", "account", or "character"' });
    }

    if (restoreType === 'account' && (!accounts || !Array.isArray(accounts) || accounts.length === 0)) {
      return res.status(400).json({ error: 'accounts array is required for account restore' });
    }

    if (restoreType === 'character' && (!characters || !Array.isArray(characters) || characters.length === 0)) {
      return res.status(400).json({ error: 'characters array is required for character restore' });
    }

    // validate characters format
    if (characters) {
      for (const char of characters) {
        if (typeof char.pid !== 'number' || typeof char.name !== 'string') {
          return res.status(400).json({ error: 'Each character must have pid (number) and name (string)' });
        }
      }
    }

    const accountName = req.user?.accountName || 'unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const result = await createRestoreFromUpload(
      tempPath,
      { restoreType, accounts, characters, categories },
      accountName,
      ipAddress
    );

    return res.json({
      success: true,
      id: result.id,
      message: 'Restore from upload started'
    });
  } catch (error) {
    logger.error('Restore from upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start restore from upload';
    return res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/admin/backup/upload/cancel
 * Cancel an upload and cleanup the temp file
 */
router.delete('/backup/upload/cancel', requireAuth, requirePermission('manage_mud_backup'), async (req: Request, res: Response) => {
  try {
    const { tempPath } = req.body;

    if (!tempPath) {
      return res.status(400).json({ error: 'tempPath is required' });
    }

    await deleteUploadedBackup(tempPath);

    return res.json({ success: true, message: 'Upload cancelled and file cleaned up' });
  } catch (error) {
    logger.error('Cancel upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel upload';
    return res.status(500).json({ error: message });
  }
});

// ============================================================================
// WEB SETTINGS ENDPOINTS
// ============================================================================

// Multer configuration for logo uploads (memory storage)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP, and SVG images are allowed'));
    }
  },
});

// Multer configuration for hero image uploads (memory storage)
const heroUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    }
  },
});

/**
 * GET /api/admin/web/settings
 * Get all web settings (for admin page)
 */
router.get('/web/settings', requireAuth, requirePermission('manage_front_page'), async (_req: Request, res: Response) => {
  try {
    const settings = await getWebSettingsRaw();
    return res.json({ settings });
  } catch (error) {
    logger.error('Get web settings error:', error);
    return res.status(500).json({ error: 'Failed to get web settings' });
  }
});

/**
 * PUT /api/admin/web/settings/:key
 * Update a single web setting
 */
router.put(
  '/web/settings/:key',
  requireAuth,
  requirePermission('manage_front_page'),
  [
    param('key').trim().isLength({ min: 1, max: 100 }).withMessage('Invalid setting key'),
    body('value').trim().isLength({ max: 100000 }).withMessage('Value too long'),
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

      const { key } = req.params;
      const { value } = req.body;

      await updateWebSetting(key, value, req.user.accountName);

      return res.json({
        success: true,
        message: `Setting '${key}' updated`,
      });
    } catch (error) {
      logger.error('Update web setting error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update setting';
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/admin/web/logo
 * Upload site logo
 */
router.post(
  '/web/logo',
  requireAuth,
  requirePermission('manage_front_page'),
  logoUpload.single('logo'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const validation = validateLogoFile(req.file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const logoUrl = await uploadSiteLogo(
        req.file.buffer,
        req.file.mimetype,
        req.user.accountName
      );

      return res.json({
        success: true,
        logoUrl,
        message: 'Site logo uploaded successfully',
      });
    } catch (error) {
      logger.error('Upload logo error:', error);
      const message = error instanceof Error ? error.message : 'Failed to upload logo';
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * DELETE /api/admin/web/logo
 * Delete site logo
 */
router.delete('/web/logo', requireAuth, requirePermission('manage_front_page'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await deleteSiteLogo(req.user.accountName);

    return res.json({
      success: true,
      message: 'Site logo deleted',
    });
  } catch (error) {
    logger.error('Delete logo error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete logo';
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/web/hero-image
 * Upload hero banner background image
 */
router.post(
  '/web/hero-image',
  requireAuth,
  requirePermission('manage_front_page'),
  heroUpload.single('hero'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const validation = validateHeroFile(req.file);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const heroUrl = await uploadHeroImage(
        req.file.buffer,
        req.file.mimetype,
        req.user.accountName
      );

      return res.json({
        success: true,
        heroUrl,
        message: 'Hero image uploaded successfully',
      });
    } catch (error) {
      logger.error('Upload hero image error:', error);
      const message = error instanceof Error ? error.message : 'Failed to upload hero image';
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * DELETE /api/admin/web/hero-image
 * Delete hero banner background image
 */
router.delete('/web/hero-image', requireAuth, requirePermission('manage_front_page'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await deleteHeroImage(req.user.accountName);

    return res.json({
      success: true,
      message: 'Hero image deleted',
    });
  } catch (error) {
    logger.error('Delete hero image error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete hero image';
    return res.status(500).json({ error: message });
  }
});

// ============================================
// Discord Integration
// ============================================

/**
 * POST /api/admin/discord/test
 * test discord webhook by sending a test message
 */
router.post('/discord/test', requireAuth, requirePermission('manage_front_page'), async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhook url is required' });
    }

    const result = await testWebhook(webhookUrl);
    return res.json(result);
  } catch (error) {
    logger.error('Discord test webhook error:', error);
    return res.status(500).json({ success: false, error: 'failed to test webhook' });
  }
});

/**
 * POST /api/admin/pvp/events/:id/discord
 * manually post a battle to discord
 */
router.post('/pvp/events/:id/discord', requireAuth, requirePermission('manage_front_page'), async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id, 10);

    if (isNaN(eventId)) {
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
});

// ============================================
// God Command Support (Level 60+)
// ============================================

/**
 * Search accounts for god commands (Level 60+ only)
 * Simpler version of /accounts/search for god command palette
 */
router.get('/god/accounts/search', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check user's level from permissions (already loaded by requireAuth)
    const userLevel = req.user.permissions.maxLevel;
    if (userLevel < 60) {
      return res.status(403).json({ error: 'Requires level 60+ character' });
    }

    const query = (req.query.query as string) || '';
    const limit = parseInt(req.query.limit as string) || 15;

    const accounts = await searchAccounts(query, limit);
    return res.json(accounts);
  } catch (error) {
    logger.error('God command account search error:', error);
    return res.status(500).json({ error: 'Failed to search accounts' });
  }
});

/**
 * Reset account password (Level 60+ only)
 * Used by god command palette setpass command
 */
router.post(
  '/god/reset-password',
  requireAuth,
  [
    body('accountName').isString().trim().notEmpty().withMessage('Account name is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
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

      // Check user's level from permissions (already loaded by requireAuth)
      const userLevel = req.user.permissions.maxLevel;
      if (userLevel < 60) {
        return res.status(403).json({ error: 'Insufficient level. Requires level 60 (Greater God) or higher.' });
      }

      const { accountName, newPassword } = req.body;
      const targetAccount = accountName.toLowerCase();

      // Check if target account exists
      const exists = await accountExists(targetAccount);
      if (!exists) {
        return res.status(404).json({ error: `Account '${targetAccount}' not found` });
      }

      // Hash the new password
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update the account file
      await updateAccountPassword(targetAccount, newPasswordHash);

      // Log the action (never log the password)
      logger.info(`[ADMIN] Password reset: ${req.user.accountName} (L${userLevel}) changed password for account '${targetAccount}'`);

      return res.json({
        success: true,
        message: `Password changed for account '${targetAccount}'`,
      });
    } catch (error) {
      logger.error('Admin password reset error:', error);
      const message = error instanceof Error ? error.message : 'Failed to reset password';
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/admin/dupes
 * Get list of all duplicated items
 */
router.get('/dupes', requireAuth, requireOverlord, async (_req: Request, res: Response) => {
  try {
    const items = await getDupedItems();
    const summary = await getDupeSummary();
    return res.json({ items, summary });
  } catch (error) {
    logger.error('Get duped items error:', error);
    return res.status(500).json({ error: 'Failed to get duplicated items' });
  }
});

/**
 * GET /api/admin/dupes/:objUid
 * Get details for a specific duped item uid
 */
router.get('/dupes/:objUid', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const objUid = parseInt(req.params.objUid, 10);
    if (isNaN(objUid)) {
      return res.status(400).json({ error: 'Invalid obj_uid' });
    }
    const details = await getDupeDetails(objUid);
    return res.json({ details });
  } catch (error) {
    logger.error('Get dupe details error:', error);
    return res.status(500).json({ error: 'Failed to get dupe details' });
  }
});

/**
 * DELETE /api/admin/dupes/item/:id
 * Delete a specific item by its id
 */
router.delete('/dupes/item/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }
    const deleted = await deletePlayerItem(itemId);
    if (!deleted) {
      return res.status(404).json({ error: 'Item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete item error:', error);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * DELETE /api/admin/dupes/locker-item/:id
 * Delete a specific locker item by its id
 */
router.delete('/dupes/locker-item/:id', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }
    const deleted = await deleteLockerItem(itemId);
    if (!deleted) {
      return res.status(404).json({ error: 'Locker item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete locker item error:', error);
    return res.status(500).json({ error: 'Failed to delete locker item' });
  }
});

/**
 * DELETE /api/admin/dupes/uid/:objUid/:vnum
 * Delete all duplicate copies of an item (keeps original)
 */
router.delete('/dupes/uid/:objUid/:vnum', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const objUid = parseInt(req.params.objUid, 10);
    const vnum = parseInt(req.params.vnum, 10);
    if (isNaN(objUid) || isNaN(vnum)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const deletedCount = await deleteAllDupesForUid(objUid, vnum);
    return res.json({ success: true, deletedCount });
  } catch (error) {
    logger.error('Delete dupes for uid error:', error);
    return res.status(500).json({ error: 'Failed to delete duplicates' });
  }
});

/**
 * POST /api/admin/dupes/bulk-delete
 * Delete multiple items by their ids
 */
router.post('/dupes/bulk-delete', requireAuth, requireOverlord, async (req: Request, res: Response) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }
    const ids = itemIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid item ids provided' });
    }
    const deletedCount = await deletePlayerItems(ids);
    return res.json({ success: true, deletedCount });
  } catch (error) {
    logger.error('Bulk delete items error:', error);
    return res.status(500).json({ error: 'Failed to delete items' });
  }
});

export default router;

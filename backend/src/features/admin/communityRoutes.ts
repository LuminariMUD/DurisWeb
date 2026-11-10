import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { body, param, validationResult } from 'express-validator';
import {
  getForumSettings,
  updateForumSetting,
  getCategoryPermissions,
  updateCategoryPermissions,
  getPermissionAuditLog,
} from '../../services/forumSettingsService.js';
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
  getArchivedCategories,
} from '../../services/categoryService.js';
import { getDeletedThreads, getDeletedPosts } from '../../services/forumService.js';
import { requireAuth, requireOverlord, requirePermission } from '../../middleware/auth.js';
import { validateIdParam } from '../../utils/validation.js';

export const adminCommunityRoutes: IRouter = Router();

/**
 * GET /api/admin/forum/settings
 * Get all forum settings
 */
adminCommunityRoutes.get(
  '/forum/settings',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const settings = await getForumSettings();
      return res.json({ settings });
    } catch (error) {
      logger.error('Get forum settings error:', error);
      return res.status(500).json({ error: 'Failed to get forum settings' });
    }
  },
);

/**
 * PUT /api/admin/forum/settings/:key
 * Update a single forum setting
 */
adminCommunityRoutes.put(
  '/forum/settings/:key',
  requireAuth,
  requireOverlord,
  [
    param('key').trim().isLength({ min: 1, max: 100 }).withMessage('Invalid setting key'),
    body('value')
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Value must be 1-255 characters'),
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
  },
);

/**
 * GET /api/admin/forum/categories/:id/permissions
 * Get category-specific permission overrides
 */
adminCommunityRoutes.get(
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
  },
);

/**
 * PATCH /api/admin/forum/categories/:id/permissions
 * Update category-specific permission overrides
 */
adminCommunityRoutes.patch(
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
        req.user.accountName,
      );

      return res.json({
        success: true,
        message: 'Category permissions updated',
      });
    } catch (error) {
      logger.error('Update category permissions error:', error);
      return res.status(500).json({ error: 'Failed to update category permissions' });
    }
  },
);

/**
 * GET /api/admin/forum/audit-log
 * Get permission change audit log with filters and pagination
 */
adminCommunityRoutes.get(
  '/forum/audit-log',
  requireAuth,
  requirePermission('view_audit_log'),
  async (req: Request, res: Response) => {
    try {
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        changedBy: req.query.changedBy as string,
        changeType: req.query.changeType as
          | 'property_change'
          | 'level_cap_change'
          | 'wipe'
          | 'timer_reset'
          | 'setting'
          | 'category_permission'
          | 'all',
        targetKey: req.query.targetKey as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        search: req.query.search as string,
      };

      const result = await getPermissionAuditLog(filters);

      return res.json(result);
    } catch (error) {
      logger.error('Get audit log error:', error);
      return res.status(500).json({ error: 'Failed to get audit log' });
    }
  },
);

// ============================================================================
// Category Management Routes (New - Full CRUD + ACL)
// ============================================================================

/**
 * GET /api/admin/forum/categories/all
 * Get all categories including archived (admin view)
 */
adminCommunityRoutes.get(
  '/forum/categories/all',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const includeArchived = req.query.include_archived === 'true';
      const categories = await getAllCategoriesAdmin(includeArchived);
      return res.json({ categories });
    } catch (error) {
      logger.error('Get all categories error:', error);
      return res.status(500).json({ error: 'Failed to get categories' });
    }
  },
);

/**
 * GET /api/admin/forum/categories/:id/details
 * Get single category with ACL permissions (admin view)
 */
adminCommunityRoutes.get(
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
  },
);

/**
 * POST /api/admin/forum/categories
 * Create new category
 */
adminCommunityRoutes.post(
  '/forum/categories',
  requireAuth,
  requireOverlord,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('accessType')
      .isIn(['public', 'authenticated', 'role_based', 'guild', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('minLevel').optional().isInt({ min: 57, max: 62 }).withMessage('Min level must be 57-62'),
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

      const { name, description, accessType, minLevel, guildName, parentId, sortOrder, icon } =
        req.body;

      const categoryId = await createCategory(
        name,
        description || null,
        accessType,
        req.user.accountName,
        { minLevel, guildName, parentId, sortOrder, icon },
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
  },
);

/**
 * PATCH /api/admin/forum/categories/:id
 * Update category
 */
adminCommunityRoutes.patch(
  '/forum/categories/:id',
  requireAuth,
  requireOverlord,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be 1-100 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('accessType')
      .optional()
      .isIn(['public', 'authenticated', 'role_based', 'guild', 'custom_acl'])
      .withMessage('Invalid access type'),
    body('minLevel')
      .optional({ nullable: true })
      .custom((value) => value === null || (Number.isInteger(value) && value >= 57 && value <= 62))
      .withMessage('Min level must be null or 57-62'),
    body('guildName')
      .optional({ nullable: true })
      .isString()
      .withMessage('Guild name must be a string'),
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
  },
);

/**
 * POST /api/admin/forum/categories/:id/archive
 * Archive category (soft delete)
 */
adminCommunityRoutes.post(
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
      return res
        .status(400)
        .json({ error: getErrorMessage(error) || 'Failed to archive category' });
    }
  },
);

/**
 * POST /api/admin/forum/categories/:id/restore
 * Restore archived category
 */
adminCommunityRoutes.post(
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
      return res
        .status(400)
        .json({ error: getErrorMessage(error) || 'Failed to restore category' });
    }
  },
);

/**
 * DELETE /api/admin/forum/categories/:id
 * Permanently delete category (dangerous!)
 */
adminCommunityRoutes.delete(
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
  },
);

/**
 * POST /api/admin/forum/categories/reorder
 * Reorder categories
 */
adminCommunityRoutes.post(
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
            Number.isInteger(order.sortOrder),
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
      return res
        .status(400)
        .json({ error: getErrorMessage(error) || 'Failed to reorder categories' });
    }
  },
);

// ============================================================================
// ACL Permission Routes
// ============================================================================

/**
 * GET /api/admin/forum/categories/:id/acl
 * Get ACL permissions for a category
 */
adminCommunityRoutes.get(
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
  },
);

/**
 * POST /api/admin/forum/categories/:id/acl
 * Add ACL permission rule
 */
adminCommunityRoutes.post(
  '/forum/categories/:id/acl',
  requireAuth,
  requireOverlord,
  [
    param('id').isInt().withMessage('Category ID must be an integer'),
    body('permissionType')
      .isIn(['allow', 'deny'])
      .withMessage('Permission type must be allow or deny'),
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
    body('permissions.canModerate')
      .optional()
      .isBoolean()
      .withMessage('canModerate must be boolean'),
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
        permissions,
      );

      return res.status(201).json({
        success: true,
        message: 'ACL permission added successfully',
        permissionId,
      });
    } catch (error) {
      logger.error('Add ACL permission error:', error);
      return res
        .status(400)
        .json({ error: getErrorMessage(error) || 'Failed to add ACL permission' });
    }
  },
);

/**
 * DELETE /api/admin/forum/categories/:categoryId/acl/:permissionId
 * Remove ACL permission rule
 */
adminCommunityRoutes.delete(
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

      const permissionId = validateIdParam(req.params.permissionId);
      if (permissionId === null) {
        return res.status(400).json({ error: 'Invalid permission ID' });
      }
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
  },
);

// ============================================================================
// Archive Management Routes
// ============================================================================

/**
 * GET /api/admin/archives/categories
 * Get all archived categories
 */
adminCommunityRoutes.get(
  '/archives/categories',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const categories = await getArchivedCategories();
      return res.json({ categories });
    } catch (error) {
      logger.error('Get archived categories error:', error);
      return res.status(500).json({ error: 'Failed to get archived categories' });
    }
  },
);

/**
 * GET /api/admin/archives/threads
 * Get deleted threads with pagination and filters
 * Query params: page, limit, categoryId
 */
adminCommunityRoutes.get(
  '/archives/threads',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;

      const result = await getDeletedThreads({ page, limit, categoryId });
      return res.json(result);
    } catch (error) {
      logger.error('Get deleted threads error:', error);
      return res.status(500).json({ error: 'Failed to get deleted threads' });
    }
  },
);

/**
 * GET /api/admin/archives/posts
 * Get deleted posts with pagination and filters
 * Query params: page, limit, threadId
 */
adminCommunityRoutes.get(
  '/archives/posts',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
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
  },
);

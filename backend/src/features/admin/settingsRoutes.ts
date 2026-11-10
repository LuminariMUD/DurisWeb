import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { body, param, validationResult } from 'express-validator';
import {
  getWebSettingsRaw,
  updateWebSetting,
  uploadSiteLogo,
  deleteSiteLogo,
  validateLogoFile,
  uploadHeroImage,
  deleteHeroImage,
  validateHeroFile,
} from '../../services/webSettingsService.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { requireWebSettingAuthorization } from '../../middleware/webSettingsAuthorization.js';
import multer from 'multer';

export const adminSettingsRoutes: IRouter = Router();

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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
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
adminSettingsRoutes.get(
  '/web/settings',
  requireAuth,
  requirePermission('manage_front_page'),
  async (_req: Request, res: Response) => {
    try {
      const settings = await getWebSettingsRaw();
      return res.json({ settings });
    } catch (error) {
      logger.error('Get web settings error:', error);
      return res.status(500).json({ error: 'Failed to get web settings' });
    }
  },
);

/**
 * PUT /api/admin/web/settings/:key
 * Update a single web setting
 */
adminSettingsRoutes.put(
  '/web/settings/:key',
  requireAuth,
  requirePermission('manage_front_page'),
  requireWebSettingAuthorization,
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
  },
);

/**
 * POST /api/admin/web/logo
 * Upload site logo
 */
adminSettingsRoutes.post(
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
        req.user.accountName,
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
  },
);

/**
 * DELETE /api/admin/web/logo
 * Delete site logo
 */
adminSettingsRoutes.delete(
  '/web/logo',
  requireAuth,
  requirePermission('manage_front_page'),
  async (req: Request, res: Response) => {
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
  },
);

/**
 * POST /api/admin/web/hero-image
 * Upload hero banner background image
 */
adminSettingsRoutes.post(
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
        req.user.accountName,
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
  },
);

/**
 * DELETE /api/admin/web/hero-image
 * Delete hero banner background image
 */
adminSettingsRoutes.delete(
  '/web/hero-image',
  requireAuth,
  requirePermission('manage_front_page'),
  async (req: Request, res: Response) => {
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
  },
);

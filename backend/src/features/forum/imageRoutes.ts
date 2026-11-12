import { Router, Request, Response, type IRouter } from 'express';
import { randomUUID } from 'node:crypto';
import { pool as db } from '../../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import logger, { isErrorWithCode } from '../../utils/logger.js';
import { param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  uploadPostImage,
  deletePostImage,
  clearOrphanImagesForAccount,
  getPendingImageRemovalCount,
  PostImageDeletionError,
  validatePostImage,
  canUploadMoreImages,
  getOrphanImageCount,
  MAX_IMAGES_PER_POST,
  MAX_IMAGE_SIZE,
  isR2Configured as isPostImageR2Configured,
} from '../../services/postImageService.js';

export const forumImageRoutes: IRouter = Router();

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
      cb(new AppError('Only JPG, PNG, WebP, and GIF images are allowed', 400));
    }
  },
});

// ============================================================================
// Post Image Routes
// ============================================================================

/**
 * POST /api/forum/images/upload
 * Upload an image for use in forum posts
 * Returns { success: true, imageId, imageUrl }
 */
forumImageRoutes.post(
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
          error: `You have ${orphanCount} pending images. Please use them in a post or wait for cleanup before uploading more. Maximum ${MAX_IMAGES_PER_POST} pending images allowed.`,
        });
      }

      // Upload the image
      const result = await uploadPostImage(
        accountName,
        file.buffer,
        file.mimetype,
        file.originalname,
      );

      return res.json({
        success: true,
        imageId: result.id,
        imageUrl: result.imageUrl,
      });
    } catch (error) {
      logger.error('Post image upload error:', error);

      // Handle multer errors
      if (isErrorWithCode(error) && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Image must be under ${MAX_IMAGE_SIZE / 1024}KB` });
      }

      return res.status(500).json({ error: 'Failed to upload image' });
    }
  },
);

/**
 * GET /api/forum/images/status
 * Get current upload status (pending orphan count)
 */
forumImageRoutes.get('/images/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;
    const orphanCount = await getOrphanImageCount(accountName);
    const pendingRemovals = await getPendingImageRemovalCount(accountName);

    return res.json({
      pendingImages: orphanCount,
      pendingRemovals,
      maxImages: MAX_IMAGES_PER_POST,
      canUpload: orphanCount < MAX_IMAGES_PER_POST,
    });
  } catch {
    logger.warn('post_image_status_unavailable', { reference: randomUUID() });
    return res.status(500).json({ error: 'Failed to get image status' });
  }
});

/**
 * GET /api/forum/images/orphans
 * List all orphan images for current user
 */
forumImageRoutes.get('/images/orphans', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, image_url, created_at FROM forum_post_images
       WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)
       ORDER BY created_at DESC`,
      [accountName],
    );
    return res.json({ orphans: rows });
  } catch {
    logger.warn('post_image_list_unavailable', { reference: randomUUID() });
    return res.status(500).json({ error: 'Failed to get orphan images' });
  }
});

/**
 * DELETE /api/forum/images/orphans
 * Delete all orphan images for current user
 */
forumImageRoutes.delete('/images/orphans', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountName = req.user!.accountName;

    return res.json(await clearOrphanImagesForAccount(accountName));
  } catch (error) {
    const reference = error instanceof PostImageDeletionError ? error.reference : randomUUID();
    logger.warn('post_image_batch_removal_incomplete', { reference });
    return res.status(503).json({
      error:
        error instanceof PostImageDeletionError
          ? error.message
          : 'Image removal is temporarily unavailable',
      reference,
    });
  }
});

/**
 * DELETE /api/forum/images/:id
 * Delete an orphan image (only own images that haven't been linked to a post)
 */
forumImageRoutes.delete(
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
          error: 'Image not found, already linked to a post, or not owned by you',
        });
      }

      return res.json({ success: true });
    } catch (error) {
      const reference = error instanceof PostImageDeletionError ? error.reference : randomUUID();
      logger.warn('post_image_removal_incomplete', { reference });
      if (error instanceof PostImageDeletionError)
        return res.status(503).json({ error: error.message, reference });
      return res.status(503).json({ error: 'Image removal is temporarily unavailable', reference });
    }
  },
);

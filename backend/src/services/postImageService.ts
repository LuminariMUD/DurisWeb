import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { pool as db } from '../db/connection.js';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import logger from '../utils/logger.js';

// R2 Configuration from environment
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'durisweb';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://static2.resakse.com';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Constants
export const MAX_IMAGES_PER_POST = 5;
export const MAX_IMAGE_SIZE = 350 * 1024; // 350KB
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Max dimensions for resizing (preserve aspect ratio)
const MAX_IMAGE_DIMENSION = 1200;

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Validate uploaded image file
 */
export function validatePostImage(
  file: Express.Multer.File
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Only JPG, PNG, WebP, and GIF images are allowed',
    };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: `Image must be under ${MAX_IMAGE_SIZE / 1024}KB` };
  }

  return { valid: true };
}

/**
 * Check if user can upload more images (max 5 pending orphan images)
 */
export async function canUploadMoreImages(accountName: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM forum_post_images
     WHERE account_name = ? AND is_orphan = TRUE`,
    [accountName]
  );

  return rows[0].count < MAX_IMAGES_PER_POST;
}

/**
 * Get count of pending orphan images for user
 */
export async function getOrphanImageCount(accountName: string): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM forum_post_images
     WHERE account_name = ? AND is_orphan = TRUE`,
    [accountName]
  );

  return rows[0].count;
}

/**
 * Process image before upload (resize if needed, optimize)
 */
async function processPostImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; extension: string; contentType: string; width: number; height: number }> {
  // Get image metadata first
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Determine if resize is needed
  const needsResize = originalWidth > MAX_IMAGE_DIMENSION || originalHeight > MAX_IMAGE_DIMENSION;

  // For GIFs, preserve animation
  if (mimeType === 'image/gif') {
    let processedBuffer = buffer;
    let width = originalWidth;
    let height = originalHeight;

    if (needsResize) {
      const processed = await sharp(buffer, { animated: true })
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .gif()
        .toBuffer({ resolveWithObject: true });

      processedBuffer = processed.data;
      width = processed.info.width;
      height = processed.info.height;
    }

    return {
      buffer: processedBuffer,
      extension: 'gif',
      contentType: 'image/gif',
      width,
      height,
    };
  }

  // Convert other formats to WebP for optimal size
  const sharpInstance = sharp(buffer);

  if (needsResize) {
    sharpInstance.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const processed = await sharpInstance
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    extension: 'webp',
    contentType: 'image/webp',
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Upload post image to R2 and create database record
 * Returns the image record with URL
 */
export async function uploadPostImage(
  accountName: string,
  fileBuffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<{ id: number; imageUrl: string }> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Process the image
  const { buffer, extension, contentType, width, height } = await processPostImage(fileBuffer, mimeType);

  // Generate unique filename
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const key = `duris/forum-images/${accountName.toLowerCase()}/${timestamp}_${randomSuffix}.${extension}`;

  // Upload to R2
  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    })
  );

  const imageUrl = `${R2_PUBLIC_URL}/${key}`;

  // Insert database record as orphan
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_post_images
     (account_name, image_key, image_url, original_filename, mime_type, file_size, width, height, is_orphan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [accountName, key, imageUrl, originalFilename, contentType, buffer.length, width, height]
  );

  return {
    id: result.insertId,
    imageUrl,
  };
}

/**
 * Extract image URLs from HTML content that match our R2 domain
 */
export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];

  // Match img tags with src attribute containing our R2 URL
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  for (const match of content.matchAll(imgRegex)) {
    const url = match[1];
    // Only include URLs from our R2 storage
    if (url.startsWith(R2_PUBLIC_URL) && url.includes('/duris/forum-images/')) {
      urls.push(url);
    }
  }

  // Also extract from carousel data-images attributes
  const carouselRegex = /data-images=["']([^"']+)["']/gi;
  for (const match of content.matchAll(carouselRegex)) {
    try {
      // data-images contains JSON array, may be HTML-encoded
      const jsonStr = match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const images = JSON.parse(jsonStr) as Array<{ src: string; alt?: string }>;
      for (const img of images) {
        if (img.src && img.src.startsWith(R2_PUBLIC_URL) && img.src.includes('/duris/forum-images/')) {
          urls.push(img.src);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return urls;
}

/**
 * Link orphan images to a post
 * Updates the database records and marks them as non-orphan
 */
export async function linkImagesToPost(
  postId: number,
  imageUrls: string[],
  accountName: string
): Promise<void> {
  if (imageUrls.length === 0) return;

  // Update images that belong to this user and are still orphans
  await db.query(
    `UPDATE forum_post_images
     SET post_id = ?, is_orphan = FALSE, linked_at = NOW()
     WHERE image_url IN (?) AND account_name = ? AND is_orphan = TRUE`,
    [postId, imageUrls, accountName]
  );
}

/**
 * Link orphan images to a thread (for opening post)
 * Updates the database records and marks them as non-orphan
 */
export async function linkImagesToThread(
  threadId: number,
  imageUrls: string[],
  accountName: string
): Promise<void> {
  if (imageUrls.length === 0) return;

  // Update images that belong to this user and are still orphans
  await db.query(
    `UPDATE forum_post_images
     SET thread_id = ?, is_orphan = FALSE, linked_at = NOW()
     WHERE image_url IN (?) AND account_name = ? AND is_orphan = TRUE`,
    [threadId, imageUrls, accountName]
  );
}

/**
 * Delete a post image from R2 and database
 * Only allows deleting own orphan images
 */
export async function deletePostImage(
  imageId: number,
  accountName: string
): Promise<boolean> {
  // Get the image record
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, image_key, is_orphan, account_name
     FROM forum_post_images
     WHERE id = ?`,
    [imageId]
  );

  if (rows.length === 0) {
    return false;
  }

  const image = rows[0];

  // Only allow deleting own orphan images
  if (image.account_name !== accountName || !image.is_orphan) {
    return false;
  }

  // Delete from R2
  if (isR2Configured()) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: image.image_key,
        })
      );
    } catch (error) {
      logger.warn('Failed to delete image from R2:', error);
    }
  }

  // Delete from database
  await db.query('DELETE FROM forum_post_images WHERE id = ?', [imageId]);

  return true;
}

/**
 * Cleanup orphan images older than 1 hour
 * Should be called periodically via setInterval
 */
export async function cleanupOrphanImages(): Promise<number> {
  // Get orphan images older than 1 hour
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, image_key FROM forum_post_images
     WHERE is_orphan = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)`
  );

  if (rows.length === 0) {
    return 0;
  }

  let deletedCount = 0;

  for (const image of rows) {
    // Delete from R2
    if (isR2Configured()) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: image.image_key,
          })
        );
      } catch (error) {
        logger.warn('Failed to delete orphan image from R2:', error);
      }
    }

    // Delete from database
    await db.query('DELETE FROM forum_post_images WHERE id = ?', [image.id]);
    deletedCount++;
  }

  if (deletedCount > 0) {
    logger.info(`Cleaned up ${deletedCount} orphan forum images`);
  }

  return deletedCount;
}

/**
 * Get images for a post
 */
export async function getImagesForPost(postId: number): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, image_url, original_filename, mime_type, file_size, width, height, created_at
     FROM forum_post_images
     WHERE post_id = ?
     ORDER BY created_at ASC`,
    [postId]
  );

  return rows;
}

/**
 * Get images for a thread
 */
export async function getImagesForThread(threadId: number): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, image_url, original_filename, mime_type, file_size, width, height, created_at
     FROM forum_post_images
     WHERE thread_id = ?
     ORDER BY created_at ASC`,
    [threadId]
  );

  return rows;
}

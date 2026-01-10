import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import sharp from 'sharp';
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

// Allowed MIME types for avatars
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Max file size before processing (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Avatar dimensions
const AVATAR_SIZE = 256;

// Banner dimensions
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 300;

// Image type for R2 upload paths
export type ImageUploadType = 'avatar' | 'banner';

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Validate uploaded file
 */
export function validateAvatarFile(
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

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Image must be under 5MB' };
  }

  return { valid: true };
}

/**
 * Process avatar image (resize, compress, convert to WebP)
 * GIFs are kept as-is to preserve animation
 */
async function processImage(
  buffer: Buffer,
  mimeType: string,
  type: ImageUploadType = 'avatar'
): Promise<{ buffer: Buffer; extension: string; contentType: string }> {
  const width = type === 'banner' ? BANNER_WIDTH : AVATAR_SIZE;
  const height = type === 'banner' ? BANNER_HEIGHT : AVATAR_SIZE;

  // Keep GIFs as-is to preserve animation
  if (mimeType === 'image/gif') {
    // Still resize GIF but keep format
    const processed = await sharp(buffer, { animated: true })
      .resize(width, height, {
        fit: 'cover',
        position: 'center',
      })
      .gif()
      .toBuffer();

    return {
      buffer: processed,
      extension: 'gif',
      contentType: 'image/gif',
    };
  }

  // Convert other formats to WebP for optimal size
  const processed = await sharp(buffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: type === 'banner' ? 85 : 80 })
    .toBuffer();

  return {
    buffer: processed,
    extension: 'webp',
    contentType: 'image/webp',
  };
}

/**
 * Upload avatar or banner to R2
 * Returns the public URL of the uploaded image
 */
export async function uploadAvatar(
  fileBuffer: Buffer,
  accountName: string,
  mimeType: string,
  type: ImageUploadType = 'avatar'
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Process the image
  const { buffer, extension, contentType } = await processImage(fileBuffer, mimeType, type);

  // Generate unique filename with timestamp to bust cache
  const timestamp = Date.now();
  const folder = type === 'banner' ? 'banners' : 'avatars';
  const key = `duris/${folder}/${accountName.toLowerCase()}_${timestamp}.${extension}`;

  // Delete old images for this user first
  await deleteOldImages(accountName, type);

  // Upload to R2
  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year (URL changes on update)
    })
  );

  // Return public URL
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Delete old images for a user (cleanup before uploading new one)
 */
async function deleteOldImages(accountName: string, type: ImageUploadType = 'avatar'): Promise<void> {
  try {
    // List objects with the user's prefix
    const folder = type === 'banner' ? 'banners' : 'avatars';
    const prefix = `duris/${folder}/${accountName.toLowerCase()}_`;
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
      })
    );

    // Delete each old avatar
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: obj.Key,
            })
          );
        }
      }
    }
  } catch (error) {
    // Log but don't fail - old images will just remain
    logger.warn(`Failed to delete old ${type}s:`, error);
  }
}

/**
 * Delete image from R2 by URL
 */
export async function deleteAvatarByUrl(imageUrl: string): Promise<void> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  if (!imageUrl || !imageUrl.startsWith(R2_PUBLIC_URL)) {
    return; // Not an R2 URL, nothing to delete
  }

  // Extract key from URL
  const key = imageUrl.replace(`${R2_PUBLIC_URL}/`, '');

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Delete all avatars/banners for an account
 */
export async function deleteAllAvatars(accountName: string, type: ImageUploadType = 'avatar'): Promise<void> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  await deleteOldImages(accountName, type);
}

/**
 * Upload a static map image to R2
 * Returns the public URL
 */
export async function uploadMapImage(pngBuffer: Buffer, layer: number): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  const key = `duris/maps/layer-${layer}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: pngBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=604800', // 7 days
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

import { randomUUID } from 'node:crypto';
import { safeFailureCode } from '../utils/safeFailureCode.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import logger from '../utils/logger.js';
import { isR2Enabled, requireR2Storage } from './r2Client.js';

// Allowed MIME types for avatars
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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
  return isR2Enabled();
}

/**
 * Validate uploaded file
 */
export function validateAvatarFile(file: Express.Multer.File): { valid: boolean; error?: string } {
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
  type: ImageUploadType = 'avatar',
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
  type: ImageUploadType = 'avatar',
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Process the image
  const { buffer, extension, contentType } = await processImage(fileBuffer, mimeType, type);

  // Each publication owns an immutable object, including concurrent uploads.
  const folder = type === 'banner' ? 'banners' : 'avatars';
  const key = `duris/${folder}/${accountName.toLowerCase()}_${randomUUID()}.${extension}`;

  // Upload to R2
  const r2 = requireR2Storage();
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.configuration.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year (URL changes on update)
    }),
  );

  // Return public URL
  return `${r2.configuration.publicUrl}/${key}`;
}

/** Best-effort cleanup of one previously published image owned by this account and type. */
export async function deleteAvatarByUrl(
  imageUrl: string,
  accountName: string,
  type: ImageUploadType = 'avatar',
): Promise<void> {
  if (!isR2Configured()) return;
  try {
    const r2 = requireR2Storage();
    const base = r2.configuration.publicUrl + '/';
    const folder = type === 'banner' ? 'banners' : 'avatars';
    const prefix = 'duris/' + folder + '/' + accountName.toLowerCase() + '_';
    if (!imageUrl.startsWith(base + prefix)) return;
    const key = imageUrl.slice(base.length);
    const suffix = key.slice(prefix.length);
    if (!/^[a-zA-Z0-9-]+[.](webp|gif|png|jpg|jpeg)$/.test(suffix)) return;
    await r2.client.send(
      new DeleteObjectCommand({ Bucket: r2.configuration.bucketName, Key: key }),
    );
  } catch (error) {
    logger.warn('Previous profile image cleanup failed', { code: safeFailureCode(error) });
  }
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

  const r2 = requireR2Storage();
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.configuration.bucketName,
      Key: key,
      Body: pngBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=604800', // 7 days
    }),
  );

  return `${r2.configuration.publicUrl}/${key}`;
}

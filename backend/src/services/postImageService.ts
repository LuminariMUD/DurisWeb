import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { pool as db } from '../db/connection.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getBackendConfiguration } from '../config/environment.js';
import { JSDOM } from 'jsdom';
import logger from '../utils/logger.js';
import { isR2Enabled, requireR2Storage } from './r2Client.js';

// Constants
export const MAX_IMAGES_PER_POST = 5;
export const MAX_IMAGE_SIZE = 350 * 1024; // 350KB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Max dimensions for resizing (preserve aspect ratio)
const MAX_IMAGE_DIMENSION = 1200;

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return isR2Enabled();
}

/**
 * Validate uploaded image file
 */
export function validatePostImage(file: Express.Multer.File): { valid: boolean; error?: string } {
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
     WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)`,
    [accountName],
  );

  return rows[0].count < MAX_IMAGES_PER_POST;
}

/**
 * Get count of pending orphan images for user
 */
export async function getOrphanImageCount(accountName: string): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM forum_post_images
     WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)`,
    [accountName],
  );

  return rows[0].count;
}

/** Removal requests count as pending even though they can no longer be attached. */
export async function getPendingImageRemovalCount(accountName: string): Promise<number> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT COUNT(*) AS count FROM forum_post_images WHERE account_name = ? AND removal_requested_at_epoch IS NOT NULL',
    [accountName],
  );
  return Number(rows[0].count);
}

/**
 * Process image before upload (resize if needed, optimize)
 */
async function processPostImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{
  buffer: Buffer;
  extension: string;
  contentType: string;
  width: number;
  height: number;
}> {
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

  const processed = await sharpInstance.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });

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
  originalFilename: string,
): Promise<{ id: number; imageUrl: string }> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Process the image
  const { buffer, extension, contentType, width, height } = await processPostImage(
    fileBuffer,
    mimeType,
  );

  // Generate unique filename
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const key = `duris/forum-images/${accountName.toLowerCase()}/${timestamp}_${randomSuffix}.${extension}`;

  // Upload to R2
  const r2 = requireR2Storage();
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.configuration.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    }),
  );

  const imageUrl = `${r2.configuration.publicUrl}/${key}`;

  // Insert database record as orphan
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_post_images
     (account_name, image_key, image_url, original_filename, mime_type, file_size, width, height, is_orphan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [accountName, key, imageUrl, originalFilename, contentType, buffer.length, width, height],
  );

  return {
    id: result.insertId,
    imageUrl,
  };
}

/** Parse only source strings; provider configuration must not bypass attachment safety. */
function htmlImageSources(content: string): string[] {
  const urls: string[] = [];
  const fragment = JSDOM.fragment(content);
  for (const image of fragment.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src');
    if (source) urls.push(source);
  }
  for (const element of fragment.querySelectorAll('[data-images]')) {
    try {
      const parsed: unknown = JSON.parse(element.getAttribute('data-images') ?? '');
      if (Array.isArray(parsed))
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'src' in item && typeof item.src === 'string')
            urls.push(item.src);
        }
    } catch {
      /* Malformed editor attributes supply no image references. */
    }
  }
  return urls;
}
function canonicalImageSource(value: string): string | null {
  try {
    const url = new URL(value, getBackendConfiguration().siteUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin + decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}
/** Keep the existing configured-domain filter for CMS callers. */
export function extractImageUrls(content: string): string[] {
  if (!isR2Configured()) return [];
  const publicUrl = requireR2Storage().configuration.publicUrl;
  return htmlImageSources(content).filter(
    (url) => url.startsWith(publicUrl) && url.includes('/duris/forum-images/'),
  );
}
/** Known managed references must be checked even while object storage is disabled. */
export function extractForumImageSources(content: string): string[] {
  return [
    ...new Set(
      htmlImageSources(content)
        .map(canonicalImageSource)
        .filter((url): url is string => url !== null),
    ),
  ];
}
export class PostImageAttachmentError extends Error {
  constructor() {
    super('One or more images are awaiting removal. Remove them from the draft and try again.');
    this.name = 'PostImageAttachmentError';
  }
}
async function attachImageRows(
  connection: PoolConnection,
  parent: 'post' | 'thread',
  parentId: number,
  sources: string[],
  accountName: string,
): Promise<void> {
  const [rows] = await connection.execute<ImageRemovalRow[]>(
    {
      sql: `SELECT id, image_url, is_orphan, post_id, thread_id, removal_requested_at_epoch
      FROM forum_post_images WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)
      ORDER BY id FOR UPDATE`,
      timeout: 5000,
    },
    [accountName],
  );
  const known = rows.filter((row) => sources.includes(canonicalImageSource(row.image_url) ?? ''));
  if (known.length) await assertImageStorage(connection);
  if (
    known.some(
      (row) =>
        row.removal_requested_at_epoch !== null || row.post_id !== null || row.thread_id !== null,
    )
  )
    throw new PostImageAttachmentError();
  for (const row of known) {
    const sql =
      parent === 'post'
        ? 'UPDATE forum_post_images SET post_id = ?, is_orphan = FALSE, linked_at = NOW() WHERE id = ? AND removal_requested_at_epoch IS NULL AND is_orphan = TRUE'
        : 'UPDATE forum_post_images SET thread_id = ?, is_orphan = FALSE, linked_at = NOW() WHERE id = ? AND removal_requested_at_epoch IS NULL AND is_orphan = TRUE';
    const [updated] = await connection.execute<ResultSetHeader>({ sql, timeout: 5000 }, [
      parentId,
      row.id,
    ]);
    if (updated.affectedRows !== 1) throw new PostImageAttachmentError();
  }
}
async function attachImages(
  parent: 'post' | 'thread',
  parentId: number,
  imageUrls: string[],
  accountName: string,
  provided?: PoolConnection,
): Promise<void> {
  if (!imageUrls.length) return;
  const sources = imageUrls.map(canonicalImageSource).filter((url): url is string => url !== null);
  if (!sources.length) return;
  if (provided) return attachImageRows(provided, parent, parentId, sources, accountName);
  const connection = await db.getConnection();
  let reusable = true;
  try {
    await connection.beginTransaction();
    await attachImageRows(connection, parent, parentId, sources, accountName);
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      reusable = false;
    }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}
export async function linkImagesToPost(
  postId: number,
  imageUrls: string[],
  accountName: string,
  connection?: PoolConnection,
): Promise<void> {
  await attachImages('post', postId, imageUrls, accountName, connection);
}
export async function linkImagesToThread(
  threadId: number,
  imageUrls: string[],
  accountName: string,
  connection?: PoolConnection,
): Promise<void> {
  await attachImages('thread', threadId, imageUrls, accountName, connection);
}

const DELETE_TIMEOUT_MS = 5000;
const CLEANUP_BATCH_LIMIT = 100;
const CLEANUP_BUDGET_MS = 2000;
let cleanupCursor = 0;
let cleanupPromise: Promise<number> | null = null;

type DeletionFailure =
  | 'storage_disabled'
  | 'provider_failure'
  | 'provider_timeout'
  | 'provider_unconfirmed'
  | 'invalid_reference'
  | 'database_unavailable'
  | 'operation_in_progress';

/** No driver/provider payload is retained in an exception or ordinary diagnostic. */
export class PostImageDeletionError extends Error {
  readonly reference = randomUUID();
  constructor(readonly reason: DeletionFailure) {
    super('Image removal could not be confirmed. Please try again later.');
    this.name = 'PostImageDeletionError';
  }
}
function deletionFailure(error: unknown): PostImageDeletionError {
  const failure =
    error instanceof PostImageDeletionError
      ? error
      : new PostImageDeletionError('database_unavailable');
  logger.warn('post_image_removal_incomplete', {
    reason: failure.reason,
    reference: failure.reference,
  });
  return failure;
}
interface ImageRemovalRow extends RowDataPacket {
  id: number;
  image_key: string;
  image_url: string;
  account_name: string;
  is_orphan: number;
  post_id: number | null;
  thread_id: number | null;
  created_epoch: number | string | null;
  removal_requested_at_epoch: number | string | null;
}
async function assertImageStorage(connection: PoolConnection): Promise<void> {
  const [engines] = await connection.query<RowDataPacket[]>({
    sql: "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='forum_post_images'",
    timeout: 5000,
  });
  if (engines.length !== 1 || engines[0].ENGINE !== 'InnoDB')
    throw new Error('image_storage_not_transactional');
}
function removableImage(
  image: ImageRemovalRow | undefined,
  accountName: string,
  cutoff?: number,
): boolean {
  if (
    !image ||
    image.account_name !== accountName ||
    image.post_id !== null ||
    image.thread_id !== null
  )
    return false;
  const pending = image.removal_requested_at_epoch !== null;
  if (
    pending &&
    (!Number.isSafeInteger(Number(image.removal_requested_at_epoch)) ||
      Number(image.removal_requested_at_epoch) <= 0)
  )
    throw new PostImageDeletionError('invalid_reference');
  if (!pending && Number(image.is_orphan) !== 1) return false;
  return (
    pending ||
    cutoff === undefined ||
    (image.created_epoch !== null &&
      Number.isFinite(Number(image.created_epoch)) &&
      Number(image.created_epoch) < cutoff)
  );
}
async function readRemovalImage(
  connection: PoolConnection,
  imageId: number,
  lock = false,
): Promise<ImageRemovalRow | undefined> {
  const [rows] = await connection.execute<ImageRemovalRow[]>(
    {
      sql: `SELECT id, image_key, image_url, account_name, is_orphan, post_id, thread_id, removal_requested_at_epoch, UNIX_TIMESTAMP(created_at) AS created_epoch
      FROM forum_post_images WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
      timeout: 5000,
    },
    [imageId],
  );
  return rows[0];
}
async function removeOrphanImage(
  imageId: number,
  accountName: string,
  cutoff?: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(imageId) || imageId <= 0) return false;
  let connection: PoolConnection | undefined;
  let reusable = true,
    leased = false,
    leaseUncertain = false,
    inTransaction = false;
  try {
    connection = await db.getConnection();
    if (!removableImage(await readRemovalImage(connection, imageId), accountName, cutoff))
      return false;
    leaseUncertain = true;
    const [lease] = await connection.execute<RowDataPacket[]>(
      {
        sql: "SELECT GET_LOCK(SHA2(CONCAT('post_image_removal:',DATABASE(),':',?),256),0) AS acquired",
        timeout: 5000,
      },
      [imageId],
    );
    leaseUncertain = false;
    if (Number(lease[0]?.acquired) !== 1) throw new PostImageDeletionError('operation_in_progress');
    leased = true;
    await connection.beginTransaction();
    inTransaction = true;
    const image = await readRemovalImage(connection, imageId, true);
    if (!removableImage(image, accountName, cutoff)) {
      await connection.rollback();
      inTransaction = false;
      return false;
    }
    await assertImageStorage(connection);
    if (
      typeof image!.image_key !== 'string' ||
      !image!.image_key ||
      image!.image_key.includes('\0')
    )
      throw new PostImageDeletionError('invalid_reference');
    const key = image!.image_key;
    await connection.execute<ResultSetHeader>(
      {
        sql: 'UPDATE forum_post_images SET removal_requested_at_epoch=COALESCE(removal_requested_at_epoch,UNIX_TIMESTAMP()),is_orphan=FALSE WHERE id = ?',
        timeout: 5000,
      },
      [imageId],
    );
    // A crash, timeout or uncertain response must never make this image reusable.
    await connection.commit();
    inTransaction = false;
    if (!isR2Configured()) throw new PostImageDeletionError('storage_disabled');
    const signal = AbortSignal.timeout(DELETE_TIMEOUT_MS);
    let acknowledgement;
    try {
      const r2 = requireR2Storage();
      acknowledgement = await r2.client.send(
        new DeleteObjectCommand({ Bucket: r2.configuration.bucketName, Key: key }),
        { abortSignal: signal },
      );
    } catch {
      throw new PostImageDeletionError(signal.aborted ? 'provider_timeout' : 'provider_failure');
    }
    if (
      acknowledgement?.$metadata?.httpStatusCode !== 204 ||
      acknowledgement.DeleteMarker === true ||
      acknowledgement.VersionId !== undefined
    )
      throw new PostImageDeletionError('provider_unconfirmed');
    await connection.beginTransaction();
    inTransaction = true;
    const current = await readRemovalImage(connection, imageId, true);
    if (current) {
      if (
        !removableImage(current, accountName) ||
        current.image_key !== key ||
        current.removal_requested_at_epoch === null
      )
        throw new PostImageDeletionError('invalid_reference');
      const [deleted] = await connection.execute<ResultSetHeader>(
        {
          sql: 'DELETE FROM forum_post_images WHERE id = ? AND account_name = ? AND BINARY image_key = ? AND removal_requested_at_epoch IS NOT NULL AND post_id IS NULL AND thread_id IS NULL',
          timeout: 5000,
        },
        [imageId, accountName, key],
      );
      if (deleted.affectedRows !== 1) throw new Error('image_metadata_removal_unconfirmed');
    }
    await connection.commit();
    inTransaction = false;
    return true;
  } catch (error) {
    if (connection && inTransaction) {
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
    }
    if (leaseUncertain) reusable = false;
    throw deletionFailure(error);
  } finally {
    if (connection) {
      if (leased) {
        try {
          const [released] = await connection.execute<RowDataPacket[]>(
            {
              sql: "SELECT RELEASE_LOCK(SHA2(CONCAT('post_image_removal:',DATABASE(),':',?),256)) AS released",
              timeout: 5000,
            },
            [imageId],
          );
          if (Number(released[0]?.released) !== 1) reusable = false;
        } catch {
          reusable = false;
        }
      }
      if (reusable) connection.release();
      else connection.destroy();
    }
  }
}

/** Delete only an owned, still-unattached image after acknowledged origin removal. */
export async function deletePostImage(imageId: number, accountName: string): Promise<boolean> {
  return removeOrphanImage(imageId, accountName);
}
export interface OrphanImageClearResult {
  deleted: number;
  failed: number;
  remaining: number;
  unavailableImageUrls: string[];
}
/** Process a bounded explicit user batch; report remaining work instead of asserting all-copies erasure. */
export async function clearOrphanImagesForAccount(
  accountName: string,
): Promise<OrphanImageClearResult> {
  try {
    const connection = await db.getConnection();
    let rows: ImageRemovalRow[] = [],
      reusable = true;
    try {
      await connection.beginTransaction();
      [rows] = await connection.execute<ImageRemovalRow[]>(
        {
          sql: `SELECT id,image_url FROM forum_post_images WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)
          AND post_id IS NULL AND thread_id IS NULL ORDER BY id LIMIT 100 FOR UPDATE`,
          timeout: 5000,
        },
        [accountName],
      );
      await assertImageStorage(connection);
      for (const image of rows)
        await connection.execute<ResultSetHeader>(
          {
            sql: 'UPDATE forum_post_images SET removal_requested_at_epoch=COALESCE(removal_requested_at_epoch,UNIX_TIMESTAMP()),is_orphan=FALSE WHERE id = ?',
            timeout: 5000,
          },
          [image.id],
        );
      // Every chosen object is durably unavailable before any external request.
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
      throw error;
    } finally {
      if (reusable) connection.release();
      else connection.destroy();
    }
    const result: OrphanImageClearResult = {
      deleted: 0,
      failed: 0,
      remaining: 0,
      unavailableImageUrls: rows.map((image) => image.image_url),
    };
    const deadline = performance.now() + CLEANUP_BUDGET_MS;
    for (const image of rows) {
      if (performance.now() >= deadline) break;
      try {
        if (await removeOrphanImage(image.id, accountName)) {
          result.deleted++;
        }
      } catch {
        result.failed++;
      }
    }
    const [count] = await db.execute<RowDataPacket[]>(
      {
        sql: 'SELECT COUNT(*) AS count FROM forum_post_images WHERE account_name = ? AND (is_orphan = TRUE OR removal_requested_at_epoch IS NOT NULL)',
        timeout: 5000,
      },
      [accountName],
    );
    result.remaining = Number(count[0].count);
    return result;
  } catch (error) {
    throw deletionFailure(error);
  }
}
async function runOrphanCleanup(): Promise<number> {
  if (!isR2Configured()) return 0;
  try {
    const [clock] = await db.query<RowDataPacket[]>({
      sql: 'SELECT UNIX_TIMESTAMP()-3600 AS cutoff',
      timeout: 5000,
    });
    const cutoff = Number(clock[0].cutoff);
    if (!Number.isSafeInteger(cutoff) || cutoff <= 0) throw new Error('invalid_cleanup_clock');
    const [after] = await db.execute<ImageRemovalRow[]>(
      {
        sql: `SELECT id, account_name FROM forum_post_images WHERE id > ? AND (removal_requested_at_epoch IS NOT NULL OR (is_orphan = TRUE AND created_at < FROM_UNIXTIME(?)))
        AND post_id IS NULL AND thread_id IS NULL ORDER BY id LIMIT 100`,
        timeout: 5000,
      },
      [cleanupCursor, cutoff],
    );
    const rows = [...after];
    if (cleanupCursor > 0 && rows.length < CLEANUP_BATCH_LIMIT) {
      const [wrapped] = await db.execute<ImageRemovalRow[]>(
        {
          sql: `SELECT id, account_name FROM forum_post_images WHERE id <= ? AND (removal_requested_at_epoch IS NOT NULL OR (is_orphan = TRUE AND created_at < FROM_UNIXTIME(?)))
          AND post_id IS NULL AND thread_id IS NULL ORDER BY id LIMIT ?`,
          timeout: 5000,
        },
        [cleanupCursor, cutoff, CLEANUP_BATCH_LIMIT - rows.length],
      );
      rows.push(...wrapped);
    }
    let deleted = 0,
      failed = 0,
      attempted = 0;
    const deadline = performance.now() + CLEANUP_BUDGET_MS;
    for (const image of rows) {
      if (performance.now() >= deadline) break;
      cleanupCursor = image.id;
      attempted++;
      try {
        if (await removeOrphanImage(image.id, image.account_name, cutoff)) deleted++;
      } catch {
        failed++;
      }
    }
    if (attempted)
      logger.info('post_image_cleanup', { deleted, failed, attempted, reference: randomUUID() });
    return deleted;
  } catch (error) {
    throw deletionFailure(error);
  }
}
/** Reuse the hourly cleanup, with bounded fair batches and no overlapping local runs. */
export async function cleanupOrphanImages(): Promise<number> {
  if (cleanupPromise) return cleanupPromise;
  const running = runOrphanCleanup();
  cleanupPromise = running;
  try {
    return await running;
  } finally {
    if (cleanupPromise === running) cleanupPromise = null;
  }
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
    [postId],
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
    [threadId],
  );

  return rows;
}

import { RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import logger from '../utils/logger.js';
import { extractImageUrls } from './postImageService.js';
import { isR2Enabled, requireR2Storage } from './r2Client.js';

export interface WebSettings {
  pvpDelayMinutes: number;
  mudHost: string;
  mudPort: string;
  mudPortTls: string;
  mudWsUrl: string;
  siteTitle: string;
  siteLogoUrl: string;
  supportUrl: string;
  // Front page settings
  frontPageHeroEnabled: boolean;
  frontPageHeroTitle: string;
  frontPageHeroSubtitle: string;
  frontPageHeroImageUrl: string;
  frontPageContent: string;
  // Backup settings
  maxHourlyBackups: number;
  // Privacy settings
  respectWebinfoToggle: boolean;
  // Discord settings
  discordWebhookUrl: string;
  discordWebhookEnabled: boolean;
}

export interface WebSettingRow {
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

// Cache for settings (5 minute TTL)
let settingsCache: { settings: WebSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Max logo file size (2MB)
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

// Logo dimensions (max height, preserve aspect ratio)
const LOGO_MAX_HEIGHT = 200;

// Allowed MIME types for logo
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Check if R2 is configured
 */
function isR2Configured(): boolean {
  return isR2Enabled();
}

/** Reports invalid database-backed settings without falling back to application literals. */
export class WebSettingsConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid web_settings configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'WebSettingsConfigurationError';
  }
}

const REQUIRED_SETTING_KEYS = [
  'pvp_delay_minutes',
  'mud_host',
  'mud_port',
  'mud_port_tls',
  'mud_ws_url',
  'site_title',
  'site_logo_url',
  'support_url',
  'front_page_hero_enabled',
  'front_page_hero_title',
  'front_page_hero_subtitle',
  'front_page_hero_image_url',
  'front_page_content',
  'max_hourly_backups',
  'respect_webinfo_toggle',
  'discord_webhook_url',
  'discord_webhook_enabled',
] as const;

/** Parses a required or explicitly optional TCP port from stored settings. */
function parsePortSetting(
  settings: ReadonlyMap<string, string>,
  key: string,
  issues: string[],
  optional = false,
): string {
  const value = settings.get(key) ?? '';
  if (optional && value === '') return value;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    issues.push(`${key} must be an integer between 1 and 65535`);
  }
  return value;
}

/** Parses a bounded integer without accepting partial numeric strings. */
function parseIntegerSetting(
  settings: ReadonlyMap<string, string>,
  key: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  const value = settings.get(key) ?? '';
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${key} must be an integer between ${minimum} and ${maximum}`);
    return minimum;
  }
  return parsed;
}

/** Parses the exact boolean strings persisted by the settings UI. */
function parseBooleanSetting(
  settings: ReadonlyMap<string, string>,
  key: string,
  issues: string[],
): boolean {
  const value = settings.get(key);
  if (value !== 'true' && value !== 'false') {
    issues.push(`${key} must be true or false`);
    return false;
  }
  return value === 'true';
}

/** Restricts public MUD hosts to bare hostnames rather than URLs or paths. */
function validateHostname(value: string, key: string, issues: string[]): void {
  if (
    !value ||
    value.length > 253 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      value,
    )
  ) {
    issues.push(`${key} must be a hostname without a scheme, port, or path`);
  }
}

/** Validates optional public HTTP URLs and rejects embedded credentials. */
function validateOptionalHttpUrl(value: string, key: string, issues: string[]): void {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      issues.push(`${key} must use http: or https:`);
    }
    if (parsed.username || parsed.password) {
      issues.push(`${key} must not contain credentials`);
    }
  } catch {
    issues.push(`${key} must be a valid URL`);
  }
}

/** Requires a credential-free TLS WebSocket URL suitable for browser login traffic. */
function validateWebSocketUrl(value: string, key: string, issues: string[]): void {
  if (!value) {
    issues.push(`${key} must not be empty`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'wss:') {
      issues.push(`${key} must use wss:`);
    }
    if (parsed.username || parsed.password) {
      issues.push(`${key} must not contain credentials`);
    }
    if (parsed.hash) {
      issues.push(`${key} must not contain a fragment`);
    }
  } catch {
    issues.push(`${key} must be a valid URL`);
  }
}

/** Converts the complete authoritative row set into browser and server settings. */
export function parseWebSettingsRows(
  rows: readonly { setting_key: unknown; setting_value: unknown }[],
): WebSettings {
  const values = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.setting_key === 'string' && typeof row.setting_value === 'string') {
      values.set(row.setting_key, row.setting_value);
    }
  }

  const issues = REQUIRED_SETTING_KEYS.filter((key) => !values.has(key)).map(
    (key) => `${key} is missing`,
  );
  const mudHost = values.get('mud_host') ?? '';
  const mudWsUrl = values.get('mud_ws_url') ?? '';
  const siteTitle = values.get('site_title') ?? '';
  const heroTitle = values.get('front_page_hero_title') ?? '';
  const heroSubtitle = values.get('front_page_hero_subtitle') ?? '';
  validateHostname(mudHost, 'mud_host', issues);
  validateWebSocketUrl(mudWsUrl, 'mud_ws_url', issues);
  if (!siteTitle.trim()) issues.push('site_title must not be empty');
  if (!heroTitle.trim()) issues.push('front_page_hero_title must not be empty');
  if (!heroSubtitle.trim()) issues.push('front_page_hero_subtitle must not be empty');
  validateOptionalHttpUrl(values.get('site_logo_url') ?? '', 'site_logo_url', issues);
  validateOptionalHttpUrl(values.get('support_url') ?? '', 'support_url', issues);
  validateOptionalHttpUrl(
    values.get('front_page_hero_image_url') ?? '',
    'front_page_hero_image_url',
    issues,
  );

  const discordWebhookEnabled = parseBooleanSetting(values, 'discord_webhook_enabled', issues);
  const discordWebhookUrl = values.get('discord_webhook_url') ?? '';
  if (discordWebhookEnabled && !discordWebhookUrl) {
    issues.push('discord_webhook_url is required when discord_webhook_enabled is true');
  }
  if (discordWebhookUrl && !discordWebhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    issues.push('discord_webhook_url must be a Discord HTTPS webhook URL');
  }

  const settings: WebSettings = {
    pvpDelayMinutes: parseIntegerSetting(values, 'pvp_delay_minutes', 0, 1440, issues),
    mudHost,
    mudPort: parsePortSetting(values, 'mud_port', issues),
    mudPortTls: parsePortSetting(values, 'mud_port_tls', issues, true),
    mudWsUrl,
    siteTitle,
    siteLogoUrl: values.get('site_logo_url') ?? '',
    supportUrl: values.get('support_url') ?? '',
    frontPageHeroEnabled: parseBooleanSetting(values, 'front_page_hero_enabled', issues),
    frontPageHeroTitle: heroTitle,
    frontPageHeroSubtitle: heroSubtitle,
    frontPageHeroImageUrl: values.get('front_page_hero_image_url') ?? '',
    frontPageContent: values.get('front_page_content') ?? '',
    maxHourlyBackups: parseIntegerSetting(values, 'max_hourly_backups', 1, 168, issues),
    respectWebinfoToggle: parseBooleanSetting(values, 'respect_webinfo_toggle', issues),
    discordWebhookUrl,
    discordWebhookEnabled,
  };

  if (issues.length > 0) throw new WebSettingsConfigurationError(issues);
  return settings;
}

/**
 * Get all web settings
 */
export async function getWebSettings(): Promise<WebSettings> {
  // Check cache
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.settings;
  }

  const [rows] = await db.query<
    Array<RowDataPacket & { setting_key: string; setting_value: string }>
  >('SELECT setting_key, setting_value FROM web_settings');

  const settings = parseWebSettingsRows(rows);

  // Cache the settings
  settingsCache = {
    settings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return settings;
}

/**
 * Get a single web setting value
 */
export async function getWebSetting(key: string): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT setting_value FROM web_settings WHERE setting_key = ?',
    [key],
  );

  return rows.length > 0 ? rows[0].setting_value : null;
}

/**
 * Get all web settings as raw rows (for admin page)
 */
export async function getWebSettingsRaw(): Promise<WebSettingRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT setting_key, setting_value, description, updated_at, updated_by FROM web_settings ORDER BY setting_key',
  );

  return rows.map((row) => ({
    setting_key: row.setting_key,
    setting_value: row.setting_value,
    description: row.description,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : `${String(row.updated_at).replace(' ', 'T')}Z`,
    updated_by: row.updated_by,
  }));
}

/**
 * Update a web setting (Overlord only)
 */
export async function updateWebSetting(
  key: string,
  value: string,
  updatedBy: string,
): Promise<void> {
  // Validate key exists
  const validKeys = [
    'pvp_delay_minutes',
    'mud_host',
    'mud_port',
    'mud_port_tls',
    'mud_ws_url',
    'site_title',
    'site_logo_url',
    'support_url',
    'front_page_hero_enabled',
    'front_page_hero_title',
    'front_page_hero_subtitle',
    'front_page_hero_image_url',
    'front_page_content',
    'max_hourly_backups',
    'respect_webinfo_toggle',
    'discord_webhook_url',
    'discord_webhook_enabled',
  ];
  if (!validKeys.includes(key)) {
    throw new Error(`Invalid setting key: ${key}`);
  }

  // Validate front_page_hero_enabled is boolean string
  if (key === 'front_page_hero_enabled') {
    if (value !== 'true' && value !== 'false') {
      throw new Error('Hero enabled must be "true" or "false"');
    }
  }

  // Validate respect_webinfo_toggle is boolean string
  if (key === 'respect_webinfo_toggle') {
    if (value !== 'true' && value !== 'false') {
      throw new Error('Respect webinfo toggle must be "true" or "false"');
    }
  }

  // Validate discord_webhook_enabled is boolean string
  if (key === 'discord_webhook_enabled') {
    if (value !== 'true' && value !== 'false') {
      throw new Error('Discord webhook enabled must be "true" or "false"');
    }
  }

  // Validate discord_webhook_url format (allow empty or valid discord webhook url)
  if (key === 'discord_webhook_url') {
    if (value && !value.startsWith('https://discord.com/api/webhooks/')) {
      throw new Error('Invalid discord webhook url format');
    }
    if (value && value.length > 200) {
      throw new Error('Discord webhook url too long');
    }
  }

  if (key === 'support_url') {
    try {
      if (value) {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
          throw new Error('invalid URL');
        }
      }
    } catch {
      throw new Error('Support URL must be a valid HTTP or HTTPS URL');
    }
  }

  if (key === 'mud_ws_url') {
    const validationIssues: string[] = [];
    validateWebSocketUrl(value, key, validationIssues);
    if (validationIssues.length > 0) throw new Error(validationIssues.join('; '));
  }

  if (key === 'mud_host') {
    if (
      !value ||
      value.length > 253 ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
        value,
      )
    ) {
      throw new Error('MUD host must be a hostname without a scheme, port, or path');
    }
  }

  // Validate title/subtitle length
  if (key === 'front_page_hero_title' || key === 'front_page_hero_subtitle') {
    if (value.length > 200) {
      throw new Error('Title/subtitle must be under 200 characters');
    }
  }

  // Validate pvp_delay_minutes is a valid number
  if (key === 'pvp_delay_minutes') {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0 || numValue > 1440) {
      throw new Error('PvP delay must be between 0 and 1440 minutes (24 hours)');
    }
  }

  // Validate mud_port is a valid port number
  if ((key === 'mud_port' || key === 'mud_port_tls') && !(key === 'mud_port_tls' && value === '')) {
    const portValue = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isInteger(portValue) ||
      portValue < 1 ||
      portValue > 65535
    ) {
      throw new Error('MUD port must be between 1 and 65535');
    }
  }

  // Validate max_hourly_backups is a valid number (1-168, 1 week max)
  if (key === 'max_hourly_backups') {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1 || numValue > 168) {
      throw new Error('Max hourly backups must be between 1 and 168 (1 week)');
    }
  }

  // Upsert setting (insert if not exists, update if exists)
  await db.query(
    `INSERT INTO web_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, value, updatedBy],
  );

  // Link images used in front page content (mark as non-orphan)
  if (key === 'front_page_content') {
    const imageUrls = extractImageUrls(value);
    if (imageUrls.length > 0) {
      try {
        await db.query(
          `UPDATE forum_post_images
           SET is_orphan = FALSE, linked_at = NOW()
           WHERE image_url IN (?) AND is_orphan = TRUE`,
          [imageUrls],
        );
        logger.info(`Linked ${imageUrls.length} images to front page content`);
      } catch (err) {
        logger.error('Failed to link images to front page:', err);
      }
    }
  }

  // Invalidate cache
  settingsCache = null;
}

/**
 * Validate logo file
 */
export function validateLogoFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Only JPG, PNG, and WebP images are allowed for logo',
    };
  }

  if (file.size > MAX_LOGO_SIZE) {
    return { valid: false, error: 'Logo must be under 2MB' };
  }

  return { valid: true };
}

/**
 * Process logo image (resize, preserve aspect ratio)
 */
async function processLogo(
  buffer: Buffer,
): Promise<{ buffer: Buffer; extension: string; contentType: string }> {
  // Resize other formats, preserving aspect ratio
  const processed = await sharp(buffer)
    .resize({
      height: LOGO_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 90 })
    .toBuffer();

  return {
    buffer: processed,
    extension: 'webp',
    contentType: 'image/webp',
  };
}

/**
 * Delete old site logos from R2
 */
async function deleteOldLogos(): Promise<void> {
  try {
    const prefix = 'duris/site/logo_';
    const r2 = requireR2Storage();
    const listResponse = await r2.client.send(
      new ListObjectsV2Command({
        Bucket: r2.configuration.bucketName,
        Prefix: prefix,
      }),
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          await r2.client.send(
            new DeleteObjectCommand({
              Bucket: r2.configuration.bucketName,
              Key: obj.Key,
            }),
          );
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to delete old logos:', error);
  }
}

/**
 * Upload site logo to R2 and update setting
 */
export async function uploadSiteLogo(
  fileBuffer: Buffer,
  mimeType: string,
  updatedBy: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }
  if (!ALLOWED_LOGO_TYPES.includes(mimeType)) {
    throw new Error('Only JPG, PNG, and WebP images are allowed for logo');
  }
  if (fileBuffer.length > MAX_LOGO_SIZE) {
    throw new Error('Logo must be under 2MB');
  }

  // Process the logo
  const { buffer, extension, contentType } = await processLogo(fileBuffer);

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const key = `duris/site/logo_${timestamp}.${extension}`;

  // Delete old logos first
  await deleteOldLogos();

  // Upload to R2
  const r2 = requireR2Storage();
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.configuration.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    }),
  );

  // Build public URL
  const logoUrl = `${r2.configuration.publicUrl}/${key}`;

  // Update the setting in database
  await updateWebSetting('site_logo_url', logoUrl, updatedBy);

  return logoUrl;
}

/**
 * Delete site logo from R2 and clear setting
 */
export async function deleteSiteLogo(updatedBy: string): Promise<void> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Delete from R2
  await deleteOldLogos();

  // Clear the setting
  await updateWebSetting('site_logo_url', '', updatedBy);
}

/**
 * Clear settings cache (called after updates)
 */
export function clearWebSettingsCache(): void {
  settingsCache = null;
}

// Hero image constants
const MAX_HERO_SIZE = 5 * 1024 * 1024; // 5MB
const HERO_MAX_WIDTH = 1920;

// Allowed MIME types for hero image
const ALLOWED_HERO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate hero image file
 */
export function validateHeroFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_HERO_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Only JPG, PNG, and WebP images are allowed for hero banner',
    };
  }

  if (file.size > MAX_HERO_SIZE) {
    return { valid: false, error: 'Hero image must be under 5MB' };
  }

  return { valid: true };
}

/**
 * Process hero image (resize to max width, convert to webp)
 */
async function processHeroImage(
  buffer: Buffer,
): Promise<{ buffer: Buffer; extension: string; contentType: string }> {
  const processed = await sharp(buffer)
    .resize({
      width: HERO_MAX_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  return {
    buffer: processed,
    extension: 'webp',
    contentType: 'image/webp',
  };
}

/**
 * Delete old hero images from R2
 */
async function deleteOldHeroImages(): Promise<void> {
  try {
    const prefix = 'duris/site/hero_';
    const r2 = requireR2Storage();
    const listResponse = await r2.client.send(
      new ListObjectsV2Command({
        Bucket: r2.configuration.bucketName,
        Prefix: prefix,
      }),
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      for (const obj of listResponse.Contents) {
        if (obj.Key) {
          await r2.client.send(
            new DeleteObjectCommand({
              Bucket: r2.configuration.bucketName,
              Key: obj.Key,
            }),
          );
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to delete old hero images:', error);
  }
}

/**
 * Upload hero image to R2 and update setting
 */
export async function uploadHeroImage(
  fileBuffer: Buffer,
  _mimeType: string,
  updatedBy: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Process the hero image
  const { buffer, extension, contentType } = await processHeroImage(fileBuffer);

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const key = `duris/site/hero_${timestamp}.${extension}`;

  // Delete old hero images first
  await deleteOldHeroImages();

  // Upload to R2
  const r2 = requireR2Storage();
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.configuration.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    }),
  );

  // Build public URL
  const heroUrl = `${r2.configuration.publicUrl}/${key}`;

  // Update the setting in database
  await updateWebSetting('front_page_hero_image_url', heroUrl, updatedBy);

  return heroUrl;
}

/**
 * Delete hero image from R2 and clear setting
 */
export async function deleteHeroImage(updatedBy: string): Promise<void> {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Delete from R2
  await deleteOldHeroImages();

  // Clear the setting
  await updateWebSetting('front_page_hero_image_url', '', updatedBy);
}

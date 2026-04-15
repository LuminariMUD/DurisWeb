import { RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import type { MudAccountCharacter } from './accountService.js';
import { getForumSettings } from './forumSettingsService.js';
import { getUserPermissions as getAdminPermissions } from './adminPermissionService.js';
import { getCache, setCache, deleteCache } from '../db/redis.js';
import logger from '../utils/logger.js';

const PERMISSIONS_CACHE_TTL = 300; // 5 minutes

export interface CharacterInfo {
  pid: number;
  name: string;
  level: number;
  guild: string;
  race: string;
  classname: string;
  racewar: number; // 1=good, 2=evil, 0=neutral
  active: boolean;
  money: number; // copper on hand
}

export interface UserPermissions {
  // Account name
  accountName: string;

  // Role based on MUD immortal levels (config.h lines 105-114)
  role: 'player' | 'avatar' | 'immortal' | 'lesser_god' | 'greater_god' | 'forger' | 'overlord';

  // Numeric level (57-62 for immortals, null for mortals)
  immortalLevel: 57 | 58 | 59 | 60 | 61 | 62 | null;

  // Highest character level
  maxLevel: number;

  // Forum permissions
  canAccessImmortalForum: boolean; // Level 57+
  canAccessGodForum: boolean;      // Level 59+ (Lesser God+)
  guilds: string[];                // Auto-granted guild forum access

  // Moderation permissions
  canModerate: boolean;    // Level 59+ (Lesser God+)
  canBan: boolean;         // Level 61+ (Forger+)
  canEditPosts: boolean;   // Level 59+
  canDeletePosts: boolean; // Level 59+
  canPinThreads: boolean;  // Level 59+
  canLockThreads: boolean; // Level 59+

  // Admin permissions (granular permission system)
  adminPermissions: string[];  // Array of permission keys (e.g., 'manage_help_files', 'manage_news')
}

export interface FullUserContext {
  accountName: string;
  email: string;
  avatarUrl: string | null;
  characters: CharacterInfo[];
  permissions: UserPermissions;
}

/**
 * Determine god level from character's max level
 * MUD Immortal Levels (from config.h):
 * - Level 56: MAXLVLMORTAL (highest mortal)
 * - Level 57: AVATAR (lowest immortal)
 * - Level 58: IMMORTAL
 * - Level 59: LESSER_G (Lesser God)
 * - Level 60: GREATER_G (Greater God)
 * - Level 61: FORGER
 * - Level 62: OVERLORD (highest)
 */
export function getGodLevelFromCharacterLevel(maxLevel: number): {
  role: 'player' | 'avatar' | 'immortal' | 'lesser_god' | 'greater_god' | 'forger' | 'overlord';
  immortalLevel: 57 | 58 | 59 | 60 | 61 | 62 | null;
} {
  if (maxLevel >= 62) return { role: 'overlord', immortalLevel: 62 };
  if (maxLevel === 61) return { role: 'forger', immortalLevel: 61 };
  if (maxLevel === 60) return { role: 'greater_god', immortalLevel: 60 };
  if (maxLevel === 59) return { role: 'lesser_god', immortalLevel: 59 };
  if (maxLevel === 58) return { role: 'immortal', immortalLevel: 58 };
  if (maxLevel === 57) return { role: 'avatar', immortalLevel: 57 };
  return { role: 'player', immortalLevel: null };
}

// Redis key prefix for permission cache invalidation
const REDIS_KEY_PREFIX = 'perm:user:';

/**
 * Get character details from database
 */
export async function getCharacterInfo(characterNames: string[]): Promise<CharacterInfo[]> {
  if (characterNames.length === 0) {
    return [];
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT pd.pid, pd.name, pd.level,
              COALESCE(a.name, '') as guild,
              COALESCE(fl.race, '') as race, COALESCE(fl.class, '') as classname,
              pd.racewar,
              pd.copper + pd.silver * 10 + pd.gold * 100 + pd.platinum * 1000 as money
       FROM player_data pd
       LEFT JOIN frag_leaderboard fl ON pd.pid = fl.pid
       LEFT JOIN associations a ON pd.assoc_id = a.id
       WHERE pd.name IN (?)`,
      [characterNames]
    );

    const result = rows.map((row: RowDataPacket) => ({
      pid: row.pid,
      name: row.name,
      level: row.level,
      guild: row.guild || '',
      race: row.race,
      classname: row.classname,
      racewar: row.racewar,
      active: true,
      money: row.money || 0
    }));

    return result;
  } catch (error) {
    logger.error('[Permissions] Error fetching character info:', error);
    logger.error(`[Permissions] Requested characters: ${characterNames.join(', ')}`);
    // Re-throw to see the actual error instead of silently returning empty
    throw error;
  }
}

/**
 * Determine user permissions based on characters and dynamic forum settings
 *
 * MUD Immortal Levels (from config.h):
 * - Level 56: MAXLVLMORTAL (highest mortal)
 * - Level 57: AVATAR (lowest immortal)
 * - Level 58: IMMORTAL
 * - Level 59: LESSER_G (Lesser God)
 * - Level 60: GREATER_G (Greater God)
 * - Level 61: FORGER
 * - Level 62: OVERLORD (highest)
 */
export async function calculatePermissions(accountName: string, characters: CharacterInfo[]): Promise<UserPermissions> {
  // Find highest level character
  const maxLevel = characters.length > 0 ? Math.max(...characters.map(c => c.level)) : 0;

  // Extract unique guilds (filter out empty strings)
  const guilds = [...new Set(characters.map(c => c.guild).filter(Boolean))];

  // Determine role based on highest character level
  const { role, immortalLevel } = getGodLevelFromCharacterLevel(maxLevel);

  // Get dynamic forum settings from database
  const settings = await getForumSettings();

  // Get admin permissions (granular permission system)
  const adminPermissionsSet = await getAdminPermissions(accountName);
  const adminPermissions = Array.from(adminPermissionsSet);

  // Permission flags based on dynamic settings
  return {
    accountName,
    role,
    immortalLevel,
    maxLevel,

    // Forum access (from settings)
    canAccessImmortalForum: maxLevel >= settings.min_level_immortal_forum,
    canAccessGodForum: maxLevel >= settings.min_level_god_forum,
    guilds,

    // Moderation permissions (from settings)
    canModerate: maxLevel >= settings.min_level_to_moderate,
    canBan: maxLevel >= settings.min_level_to_ban,
    canEditPosts: maxLevel >= settings.min_level_to_delete_any_post,
    canDeletePosts: maxLevel >= settings.min_level_to_delete_any_post,
    canPinThreads: maxLevel >= settings.min_level_to_pin,
    canLockThreads: maxLevel >= settings.min_level_to_lock,

    // Admin permissions (granular permission system)
    adminPermissions
  };
}

/**
 * Get full user permissions (cached for 5 minutes)
 */
export async function getUserPermissions(
  accountName: string,
  mudCharacters: MudAccountCharacter[]
): Promise<UserPermissions> {
  const cacheKey = `perms:${accountName}`;

  // check cache first
  const cached = await getCache<UserPermissions>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get character names from MUD account
  const characterNames = mudCharacters.map(c => c.name);

  // Query database for character details
  const characters = await getCharacterInfo(characterNames);

  // Calculate permissions (reads from database settings)
  const permissions = await calculatePermissions(accountName, characters);

  // cache for 5 minutes
  await setCache(cacheKey, permissions, PERMISSIONS_CACHE_TTL);

  return permissions;
}

/**
 * Invalidate permissions cache for an account
 */
export async function invalidatePermissionsCache(accountName: string): Promise<void> {
  await deleteCache(`perms:${accountName}`);
}

/**
 * Get full user context (account + characters + permissions)
 */
export async function getFullUserContext(
  accountName: string,
  email: string,
  mudCharacters: MudAccountCharacter[]
): Promise<FullUserContext> {
  // Get character names
  const characterNames = mudCharacters.map(c => c.name);

  // Query database for character details
  const characters = await getCharacterInfo(characterNames);

  // Calculate permissions (now async)
  const permissions = await calculatePermissions(accountName, characters);

  // Get avatar URL from user_profiles
  let avatarUrl: string | null = null;
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT avatar_url FROM user_profiles WHERE account_name = ?',
      [accountName]
    );
    if (rows.length > 0 && rows[0].avatar_url) {
      avatarUrl = rows[0].avatar_url;
    }
  } catch {
    // Ignore errors - avatar is optional
  }

  return {
    accountName,
    email,
    avatarUrl,
    characters,
    permissions
  };
}

/**
 * Clear cached permissions (useful when character data changes)
 */
export async function clearPermissionCache(accountName?: string): Promise<void> {
  if (accountName) {
    await deleteCache(`${REDIS_KEY_PREFIX}${accountName.toLowerCase()}`);
  } else {
    await deleteCache(`${REDIS_KEY_PREFIX}*`);
  }
}

/**
 * Check if user has access to a specific guild forum
 */
export function hasGuildAccess(permissions: UserPermissions, guildName: string): boolean {
  return permissions.guilds.includes(guildName);
}

/**
 * Check if user can access a category based on access type
 */
export function canAccessCategory(
  permissions: UserPermissions,
  accessType: 'public' | 'authenticated' | 'guild' | 'immortal' | 'god',
  guildName?: string
): boolean {
  switch (accessType) {
    case 'public':
      return true;
    case 'authenticated':
      return true; // If they're logged in, they can access
    case 'guild':
      return guildName ? hasGuildAccess(permissions, guildName) : false;
    case 'immortal':
      return permissions.canAccessImmortalForum;
    case 'god':
      return permissions.canAccessGodForum;
    default:
      return false;
  }
}

import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import logger from '../utils/logger.js';
import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordHookActivity } from '../hooks/hookActivity.js';

/**
 * Guild Auto-Access Background Service
 *
 * Automatically creates forum categories for guilds when members access the forum.
 * Polls the database every 5 minutes to detect new guilds.
 */

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
let syncIntervalId: NodeJS.Timeout | null = null;

/**
 * Get all unique guild names via associations table
 */
async function getAllGuilds(): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT a.name as guild
     FROM player_data pd
     JOIN associations a ON pd.assoc_id = a.id
     WHERE a.name IS NOT NULL
       AND a.name != ''
       AND a.name NOT LIKE '%backup%'
     ORDER BY a.name`,
  );

  return rows.map((row) => row.guild);
}

/**
 * Get existing guild categories from forum
 */
async function getExistingGuildCategories(): Promise<Set<string>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT guild_name
     FROM forum_categories
     WHERE access_type = 'guild'
       AND guild_name IS NOT NULL`,
  );

  return new Set(rows.map((row) => row.guild_name));
}

/**
 * Get the "Guild Halls" parent category ID
 * Creates it if it doesn't exist
 */
async function getGuildHallsParentId(): Promise<number> {
  // Try to find existing "Guild Halls" category
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM forum_categories WHERE name = 'Guild Halls'`,
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  // Create "Guild Halls" parent category if it doesn't exist
  const [_result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_categories
     (name, description, access_type, icon, sort_order, parent_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Guild Halls',
      'Private guild forums - auto-created for each guild',
      'authenticated',
      '\u{1F3F0}',
      3,
      null,
    ],
  );

  return _result.insertId;
}

/**
 * Create a guild category
 */
async function createGuildCategory(guildName: string, parentId: number): Promise<void> {
  // Assign icon based on guild name (can be customized)
  const icon = getGuildIcon(guildName);

  const [_result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_categories
     (name, description, access_type, guild_name, icon, parent_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guildName, `Private forum for ${guildName} members`, 'guild', guildName, icon, parentId, 0],
  );
}

/**
 * Get icon for guild based on name/alignment
 * Can be customized based on guild characteristics
 */
function getGuildIcon(guildName: string): string {
  // Default guild icons - can be customized based on guild alignment or name
  const lowerName = guildName.toLowerCase();

  // Evil guilds
  if (lowerName.includes('lloth') || lowerName.includes('drow')) {
    return '\u{1F577}\u{FE0F}';
  }
  if (lowerName.includes('defilers') || lowerName.includes('tiamat')) {
    return '\u{1F409}';
  }
  if (lowerName.includes('shokara')) {
    return '\u{1F480}';
  }

  // Good guilds
  if (lowerName.includes('har') || lowerName.includes('temple')) {
    return '\u{26EA}';
  }
  if (lowerName.includes('silverite') || lowerName.includes('mielikki')) {
    return '\u{1F332}';
  }
  if (lowerName.includes('netheril')) {
    return '\u{1F52E}';
  }

  // Neutral/default
  return '\u{2694}\u{FE0F}';
}

/**
 * Sync guilds - create categories for new guilds
 */
export async function syncGuilds(): Promise<void> {
  if (!isHookEnabledSync('guild_parsing')) {
    return;
  }
  try {
    // Get all guilds from database
    const allGuilds = await getAllGuilds();
    recordHookActivity('guild_parsing');

    // Get existing guild categories
    const existingCategories = await getExistingGuildCategories();

    // Find guilds that don't have categories yet
    const newGuilds = allGuilds.filter((guild) => !existingCategories.has(guild));

    if (newGuilds.length === 0) {
      return;
    }

    // Get or create parent category
    const parentId = await getGuildHallsParentId();

    // Create categories for new guilds
    for (const guildName of newGuilds) {
      try {
        await createGuildCategory(guildName, parentId);
      } catch (err) {
        logger.error(`[GuildSync] Failed to create category for ${guildName}:`, err);
      }
    }
  } catch (err) {
    logger.error('[GuildSync] Error during guild sync:', err);
  }
}

/**
 * Start the guild sync background service
 */
export function startGuildSync(): void {
  if (syncIntervalId) {
    logger.warn('[GuildSync] Service already running');
    return;
  }

  logger.info(`[GuildSync] Starting background service (interval: ${SYNC_INTERVAL / 1000}s)`);

  // Run immediately on startup
  syncGuilds().catch((err) => {
    logger.error('[GuildSync] Initial sync failed:', err);
  });

  // Then run periodically
  syncIntervalId = setInterval(() => {
    syncGuilds().catch((err) => {
      logger.error('[GuildSync] Periodic sync failed:', err);
    });
  }, SYNC_INTERVAL);
  syncIntervalId.unref();
}

/**
 * Stop the guild sync background service
 */
export function stopGuildSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

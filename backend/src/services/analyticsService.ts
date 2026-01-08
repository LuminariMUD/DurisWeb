import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getServerUptime } from './serverMonitor.js';
import { getOnlinePlayerCount } from './serverHealthService.js';
import { getCache, setCache } from '../db/redis.js';

// Cache TTL for analytics (in seconds for Redis)
const ANALYTICS_CACHE_TTL = 5 * 60; // 5 minutes

// Redis key prefix for analytics
const REDIS_KEY_PREFIX = 'analytics:';

export interface OverviewStats {
  currentOnlinePlayers: number;
  peakPlayerCount: number;
  peakPlayerTimestamp: string | null;
  totalForumPosts: number;
  totalPvPBattles: number;
  totalPlayerAccounts: number;
  activeGuilds: number;
  serverUptime: number; // milliseconds
}

export interface ForumStats {
  totalThreads: number;
  totalPosts: number;
  activeUsers7Days: number;
  postsToday: number;
  postsThisWeek: number;
  avgPostsPerThread: number;
  topPosters: Array<{ account: string; postCount: number }>;
  postsByCategory: Array<{ categoryName: string; postCount: number }>;
  postsPerDay: Array<{ date: string; count: number }>;
}

export interface PvPStats {
  totalBattles: number;
  battlesToday: number;
  battlesThisWeek: number;
  topKiller: { name: string; kills: number } | null;
  topVictim: { name: string; deaths: number } | null;
  mostActiveLocation: { location: string; battles: number } | null;
  battlesPerDay: Array<{ date: string; count: number }>;
  killsByClass: Array<{ className: string; kills: number }>;
  activityByHour: Array<{ hour: number; battles: number }>;
}

export interface PlayerStats {
  totalAccounts: number;
  maxLevel: number;
  avgLevel: number;
  noneCount: number;
  goodsCount: number;
  evilsCount: number;
  illithidsCount: number;
  undeadsCount: number;
  neutralsCount: number;
  topGuilds: Array<{ guild: string; memberCount: number }>;
  levelDistribution: Array<{ range: string; count: number }>;
}

export interface ServerHealth {
  diskSpace: { used: number; total: number; percent: number };
  memoryUsage: { used: number; total: number; percent: number };
  uptimeMs: number;
  activeWebSocketConnections: number;
  databaseStatus: {
    connected: boolean;
    poolActive: number;
    poolIdle: number;
  };
  tableSizes: Array<{ tableName: string; sizeBytes: number; rowCount: number }>;
}

/**
 * Get current online players - now uses netstat for accurate real-time count
 * Single source of truth - delegates to serverHealthService
 */
export async function getCurrentOnlinePlayers(): Promise<number> {
  return await getOnlinePlayerCount();
}

/**
 * Get overview statistics for dashboard
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const cacheKey = `${REDIS_KEY_PREFIX}overview`;
  const cached = await getCache<OverviewStats>(cacheKey);
  if (cached) return cached;

  const [onlinePlayers, forumPosts, pvpBattles, accounts, guilds, peakStatsResult, uptime] = await Promise.all([
    getCurrentOnlinePlayers(),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM forum_posts WHERE deleted_at IS NULL'),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM pkill_event'),
    pool.query<RowDataPacket[]>('SELECT COUNT(DISTINCT pid) as count FROM players_core'),
    pool.query<RowDataPacket[]>('SELECT COUNT(DISTINCT guild) as count FROM players_core WHERE guild IS NOT NULL AND guild != ""'),
    pool.query<RowDataPacket[]>(
      `SELECT
         (goods_count + evils_count + illithids_count + undeads_count + gods_count) as peak,
         date as timestamp
       FROM statistics
       ORDER BY (goods_count + evils_count + illithids_count + undeads_count + gods_count) DESC
       LIMIT 1`
    ),
    getServerUptime(),
  ]);

  const peakStats = peakStatsResult[0];

  const stats: OverviewStats = {
    currentOnlinePlayers: onlinePlayers,
    peakPlayerCount: peakStats[0]?.peak || 0,
    peakPlayerTimestamp: peakStats[0]?.timestamp || null,
    totalForumPosts: forumPosts[0][0]?.count || 0,
    totalPvPBattles: pvpBattles[0][0]?.count || 0,
    totalPlayerAccounts: accounts[0][0]?.count || 0,
    activeGuilds: guilds[0][0]?.count || 0,
    serverUptime: uptime,
  };

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get forum analytics
 */
export async function getForumStats(): Promise<ForumStats> {
  const cacheKey = `${REDIS_KEY_PREFIX}forum`;
  const cached = await getCache<ForumStats>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    threadsResult,
    postsResult,
    activeUsersResult,
    postsTodayResult,
    postsWeekResult,
    topPostersResult,
    postsByCategoryResult,
    postsPerDayResult,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM forum_threads WHERE deleted_at IS NULL'),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM forum_posts WHERE deleted_at IS NULL'),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(DISTINCT author_account_name) as count FROM forum_posts WHERE created_at >= ? AND deleted_at IS NULL',
      [weekAgo]
    ),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM forum_posts WHERE created_at >= ? AND deleted_at IS NULL',
      [today]
    ),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM forum_posts WHERE created_at >= ? AND deleted_at IS NULL',
      [weekAgo]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT author_account_name as account, COUNT(*) as postCount
       FROM forum_posts
       WHERE deleted_at IS NULL
       GROUP BY author_account_name
       ORDER BY postCount DESC
       LIMIT 10`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT c.name as categoryName, COUNT(p.id) as postCount
       FROM forum_categories c
       LEFT JOIN forum_threads t ON c.id = t.category_id AND t.deleted_at IS NULL
       LEFT JOIN forum_posts p ON t.id = p.thread_id AND p.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY postCount DESC`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM forum_posts
       WHERE created_at >= ? AND deleted_at IS NULL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [thirtyDaysAgo]
    ),
  ]);

  const totalThreads = threadsResult[0][0]?.count || 0;
  const totalPosts = postsResult[0][0]?.count || 0;

  const stats: ForumStats = {
    totalThreads,
    totalPosts,
    activeUsers7Days: activeUsersResult[0][0]?.count || 0,
    postsToday: postsTodayResult[0][0]?.count || 0,
    postsThisWeek: postsWeekResult[0][0]?.count || 0,
    avgPostsPerThread: totalThreads > 0 ? totalPosts / totalThreads : 0,
    topPosters: topPostersResult[0] as any[],
    postsByCategory: postsByCategoryResult[0] as any[],
    postsPerDay: postsPerDayResult[0] as any[],
  };

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get PvP analytics
 */
export async function getPvPStats(): Promise<PvPStats> {
  const cacheKey = `${REDIS_KEY_PREFIX}pvp`;
  const cached = await getCache<PvPStats>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalResult,
    todayResult,
    weekResult,
    topKillerResult,
    topVictimResult,
    locationResult,
    battlesPerDayResult,
    killsByClassResult,
    activityByHourResult,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM pkill_event'),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM pkill_event WHERE stamp >= ?', [today]),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM pkill_event WHERE stamp >= ?', [weekAgo]),
    pool.query<RowDataPacket[]>(
      `SELECT player_description as name, COUNT(*) as kills
       FROM pkill_info
       WHERE pk_type LIKE 'KILLER%'
       GROUP BY player_description
       ORDER BY kills DESC
       LIMIT 1`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT player_description as name, COUNT(*) as deaths
       FROM pkill_info
       WHERE pk_type = 'VICTIM'
       GROUP BY player_description
       ORDER BY deaths DESC
       LIMIT 1`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT room_name as location, COUNT(*) as battles
       FROM pkill_event
       GROUP BY room_name
       ORDER BY battles DESC
       LIMIT 1`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(stamp) as date, COUNT(*) as count
       FROM pkill_event
       WHERE stamp >= ?
       GROUP BY DATE(stamp)
       ORDER BY date ASC`,
      [thirtyDaysAgo]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT
         SUBSTRING_INDEX(SUBSTRING_INDEX(player_description, ']', 1), ' ', -1) as className,
         COUNT(*) as kills
       FROM pkill_info
       WHERE pk_type LIKE 'KILLER%'
       GROUP BY className
       ORDER BY kills DESC
       LIMIT 10`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT HOUR(stamp) as hour, COUNT(*) as battles
       FROM pkill_event
       GROUP BY HOUR(stamp)
       ORDER BY hour ASC`
    ),
  ]);

  const stats: PvPStats = {
    totalBattles: totalResult[0][0]?.count || 0,
    battlesToday: todayResult[0][0]?.count || 0,
    battlesThisWeek: weekResult[0][0]?.count || 0,
    topKiller: (topKillerResult[0][0] as any) || null,
    topVictim: (topVictimResult[0][0] as any) || null,
    mostActiveLocation: (locationResult[0][0] as any) || null,
    battlesPerDay: battlesPerDayResult[0] as any[],
    killsByClass: killsByClassResult[0] as any[],
    activityByHour: activityByHourResult[0] as any[],
  };

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get player demographics
 */
export async function getPlayerStats(): Promise<PlayerStats> {
  const cacheKey = `${REDIS_KEY_PREFIX}player`;
  const cached = await getCache<PlayerStats>(cacheKey);
  if (cached) return cached;

  const [
    accountsResult,
    maxLevelResult,
    avgLevelResult,
    factionsResult,
    guildsResult,
    levelDistResult,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(DISTINCT pid) as count FROM players_core'),
    pool.query<RowDataPacket[]>('SELECT MAX(level) as maxLevel FROM players_core'),
    pool.query<RowDataPacket[]>('SELECT AVG(level) as avgLevel FROM players_core'),
    pool.query<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN racewar = 0 THEN 1 ELSE 0 END) as none,
         SUM(CASE WHEN racewar = 1 THEN 1 ELSE 0 END) as goods,
         SUM(CASE WHEN racewar = 2 THEN 1 ELSE 0 END) as evils,
         SUM(CASE WHEN racewar = 3 THEN 1 ELSE 0 END) as undeads,
         SUM(CASE WHEN racewar = 4 THEN 1 ELSE 0 END) as neutrals
       FROM players_core`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT guild, COUNT(*) as memberCount
       FROM players_core
       WHERE guild IS NOT NULL AND guild != ''
       GROUP BY guild
       ORDER BY memberCount DESC
       LIMIT 10`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT
         CASE
           WHEN level BETWEEN 1 AND 10 THEN '1-10'
           WHEN level BETWEEN 11 AND 20 THEN '11-20'
           WHEN level BETWEEN 21 AND 30 THEN '21-30'
           WHEN level BETWEEN 31 AND 40 THEN '31-40'
           WHEN level BETWEEN 41 AND 50 THEN '41-50'
           WHEN level BETWEEN 51 AND 56 THEN '51-56'
           ELSE '57+'
         END as \`range\`,
         COUNT(*) as count
       FROM players_core
       GROUP BY \`range\`
       ORDER BY MIN(level)`
    ),
  ]);

  const factions = factionsResult[0][0];

  const stats: PlayerStats = {
    totalAccounts: accountsResult[0][0]?.count || 0,
    maxLevel: maxLevelResult[0][0]?.maxLevel || 0,
    avgLevel: parseFloat((Number(avgLevelResult[0][0]?.avgLevel) || 0).toFixed(1)),
    noneCount: factions?.none || 0,
    goodsCount: factions?.goods || 0,
    evilsCount: factions?.evils || 0,
    illithidsCount: factions?.illithids || 0,
    undeadsCount: factions?.undeads || 0,
    neutralsCount: factions?.neutrals || 0,
    topGuilds: guildsResult[0] as any[],
    levelDistribution: levelDistResult[0] as any[],
  };

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get player activity over time for charts
 */
export async function getPlayerActivity(hours: number = 24): Promise<any[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}activity:${hours}h`;
  const cached = await getCache<any[]>(cacheKey);
  if (cached) return cached;

  const startTime = Math.floor(Date.now() / 1000) - (hours * 3600);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       date as timestamp,
       (goods_count + evils_count + illithids_count + undeads_count + gods_count) as playerCount
     FROM statistics
     WHERE date >= ?
     ORDER BY date ASC`,
    [startTime]
  );

  const data = rows.map(row => ({
    timestamp: row.timestamp,
    playerCount: row.playerCount,
  }));

  await setCache(cacheKey, data, ANALYTICS_CACHE_TTL);
  return data;
}

/**
 * Get WHO list (currently online players)
 * Fixed: Now uses TIMESTAMPDIFF for accurate uptime calculation
 * Fixed: Compares last_connect > last_disconnect to handle reconnections properly
 * Uses 24-hour bound to prevent ancient stale records while allowing long sessions
 */
export async function getWhoList(): Promise<any[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      pc.name as char_name,
      pc.level,
      pc.race,
      pc.classname as class,
      pc.racewar,
      ii.last_connect,
      ii.last_ip,
      ac.account_name as account,
      TIMESTAMPDIFF(SECOND, ii.last_connect, NOW()) as uptime_seconds
    FROM players_core pc
    JOIN ip_info ii ON pc.pid = ii.pid
    LEFT JOIN account_characters ac ON pc.pid = ac.pid
    WHERE ii.last_connect > COALESCE(ii.last_disconnect, 0)
      AND ii.last_connect >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      AND ii.last_connect IS NOT NULL
    ORDER BY pc.level DESC, pc.name ASC`
  );

  return rows;
}

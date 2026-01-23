import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache } from '../db/redis.js';
import logger from '../utils/logger.js';

const CACHE_TTL = 10 * 60; // 10 minutes
const CACHE_KEY_PREFIX = 'public_stats:';

export interface FactionActivityPoint {
  timestamp: number;
  goods: number;
  evils: number;
  neutrals: number;
  undeads: number;
}

/**
 * get faction activity data with 1-day delay for security
 * returns hourly data points for the specified date
 */
export async function getFactionActivity(date: string): Promise<FactionActivityPoint[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}faction_activity:${date}`;
  const cached = await getCache<FactionActivityPoint[]>(cacheKey);
  if (cached) return cached;

  // parse date and ensure it's at least 1 day old
  const requestedDate = new Date(date);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  oneDayAgo.setHours(0, 0, 0, 0);

  if (requestedDate >= oneDayAgo) {
    return [];
  }

  // get start and end of the requested day
  const startOfDay = new Date(requestedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(requestedDate);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         date as timestamp,
         goods_count as goods,
         evils_count as evils,
         undeads_count as undeads,
         COALESCE(illithids_count, 0) as neutrals
       FROM statistics
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC`,
      [Math.floor(startOfDay.getTime() / 1000), Math.floor(endOfDay.getTime() / 1000)]
    );

    const data: FactionActivityPoint[] = rows.map(row => ({
      timestamp: row.timestamp,
      goods: row.goods ?? 0,
      evils: row.evils ?? 0,
      neutrals: row.neutrals ?? 0,
      undeads: row.undeads ?? 0,
    }));

    await setCache(cacheKey, data, CACHE_TTL);
    return data;
  } catch (err) {
    logger.error('[PublicStats] failed to get faction activity:', err);
    return [];
  }
}

/**
 * get available dates that have statistics data (at least 1 day old)
 */
export async function getAvailableDates(): Promise<string[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}available_dates`;
  const cached = await getCache<string[]>(cacheKey);
  if (cached) return cached;

  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  oneDayAgo.setHours(23, 59, 59, 999);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT DATE(FROM_UNIXTIME(date)) as stat_date
       FROM statistics
       WHERE date <= ?
       ORDER BY stat_date DESC
       LIMIT 30`,
      [Math.floor(oneDayAgo.getTime() / 1000)]
    );

    const dates = rows.map(row => row.stat_date);
    await setCache(cacheKey, dates, CACHE_TTL);
    return dates;
  } catch (err) {
    logger.error('[PublicStats] failed to get available dates:', err);
    return [];
  }
}

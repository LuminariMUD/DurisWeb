import { mudPool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache } from '../db/redis.js';

const CACHE_TTL = 10 * 60; // 10 minutes
const CACHE_KEY_PREFIX = 'public_stats:v2:';
const DAY_SECONDS = 24 * 60 * 60;

// Publish only complete UTC days whose final sample is at least 24 hours old.
function publicationCutoff(): number {
  return (Math.floor(Date.now() / (DAY_SECONDS * 1000)) - 1) * DAY_SECONDS;
}

export interface FactionActivityPoint {
  timestamp: number;
  goods: number;
  evils: number;
  neutrals: number;
  undeads: number;
}

/** Read recorded faction samples for one eligible UTC day. */
export async function getFactionActivity(date: string): Promise<FactionActivityPoint[]> {
  const start = Date.parse(`${date}T00:00:00Z`) / 1000;
  // Enforce the publication boundary before reading cache as well as SQL.
  if (!Number.isFinite(start) || start >= publicationCutoff()) return [];

  const cacheKey = `${CACHE_KEY_PREFIX}faction_activity:${date}`;
  const cached = await getCache<FactionActivityPoint[]>(cacheKey);
  if (cached) return cached;

  const [rows] = await mudPool.query<RowDataPacket[]>(
    `SELECT
       date as timestamp,
       goods_count as goods,
       evils_count as evils,
       undeads_count as undeads,
       COALESCE(illithids_count, 0) as neutrals
     FROM statistics
     WHERE date >= ? AND date < ?
     ORDER BY date ASC`,
    [start, start + DAY_SECONDS],
  );

  const data: FactionActivityPoint[] = rows.map((row) => ({
    timestamp: row.timestamp,
    goods: row.goods ?? 0,
    evils: row.evils ?? 0,
    neutrals: row.neutrals ?? 0,
    undeads: row.undeads ?? 0,
  }));

  await setCache(cacheKey, data, CACHE_TTL);
  return data;
}

/** List the newest 30 recorded days using the same publication boundary. */
export async function getAvailableDates(): Promise<string[]> {
  const cutoff = publicationCutoff();
  // A new UTC day must not reuse yesterday's list across the release boundary.
  const cacheKey = `${CACHE_KEY_PREFIX}available_dates:${cutoff}`;
  const cached = await getCache<string[]>(cacheKey);
  if (cached) return cached;

  // Epoch arithmetic avoids database/session timezone-dependent calendar dates.
  const [rows] = await mudPool.query<RowDataPacket[]>(
    `SELECT DISTINCT FLOOR(date / 86400) as utc_day
     FROM statistics
     WHERE date < ?
     ORDER BY utc_day DESC
     LIMIT 30`,
    [cutoff],
  );

  const dates = rows.map((row) =>
    new Date(Number(row.utc_day) * DAY_SECONDS * 1000).toISOString().slice(0, 10),
  );
  await setCache(cacheKey, dates, CACHE_TTL);
  return dates;
}

import { mudPool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache } from '../db/redis.js';
import { getBackendConfiguration } from '../config/environment.js';
import logger from '../utils/logger.js';

const CACHE_TTL = 10 * 60; // 10 minutes
const CACHE_KEY_PREFIX = 'public_stats:v2:';
const DAY_SECONDS = 24 * 60 * 60;

export interface PublicPopulation {
  estimate: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  delayHours: 3 | 6;
  label: string;
}

export function unavailablePopulation(): PublicPopulation {
  const delayHours = getBackendConfiguration().publicPopulationDelayHours;
  return {
    estimate: null,
    windowStart: null,
    windowEnd: null,
    delayHours,
    label: `Population — ${delayHours}-hour delayed estimate`,
  };
}

/** Reuse recorded faction totals without publishing the individual factions. */
export async function getPublicPopulation(): Promise<PublicPopulation> {
  const population = unavailablePopulation();
  const end = (Math.floor(Date.now() / 3_600_000) - population.delayHours) * 3600;
  const start = end - 3600;
  const windowStart = new Date(start * 1000).toISOString();
  const windowEnd = new Date(end * 1000).toISOString();
  // Include policy and epoch, so an offset increase or clock rollback cannot reuse
  // a fresher result. Never read the old live status/staff presence caches.
  const key = `public_population:v1:${population.delayHours}:${end}`;
  try {
    const cached = await getCache<PublicPopulation>(key);
    if (end > Date.now() / 1000 - population.delayHours * 3600) return population;
    if (
      cached &&
      cached.delayHours === population.delayHours &&
      cached.windowStart === windowStart &&
      cached.windowEnd === windowEnd &&
      typeof cached.estimate === 'number' &&
      Number.isSafeInteger(cached.estimate) &&
      cached.estimate >= 0
    ) {
      return { ...population, estimate: cached.estimate, windowStart, windowEnd };
    }

    const [rows] = await mudPool.query<RowDataPacket[]>(
      `SELECT AVG(goods_count + evils_count + undeads_count + illithids_count) AS average,
              COUNT(*) AS samples,
              SUM(goods_count IS NULL OR goods_count < 0 OR
                  evils_count IS NULL OR evils_count < 0 OR
                  undeads_count IS NULL OR undeads_count < 0 OR
                  illithids_count IS NULL OR illithids_count < 0) AS invalid_samples
       FROM statistics WHERE date >= ? AND date < ?`,
      [start, end],
    );
    const row = rows[0];
    if (
      !row ||
      !Number.isSafeInteger(Number(row.samples)) ||
      Number(row.samples) <= 0 ||
      Number(row.invalid_samples) !== 0 ||
      row.average == null
    ) {
      return population;
    }
    const average = Number(row.average);
    if (!Number.isFinite(average) || average < 0 || !Number.isSafeInteger(Math.round(average))) {
      return population;
    }
    // Recheck after I/O in case the clock moved backwards while awaiting the data.
    if (end > Date.now() / 1000 - population.delayHours * 3600) return population;
    const result = { ...population, estimate: Math.round(average), windowStart, windowEnd };
    await setCache(key, result, CACHE_TTL);
    if (end > Date.now() / 1000 - population.delayHours * 3600) return population;
    return result;
  } catch {
    logger.warn('Public population history unavailable');
    return population;
  }
}

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

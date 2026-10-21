import { mudPool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache } from '../db/redis.js';
import { getBackendConfiguration } from '../config/environment.js';
import logger from '../utils/logger.js';

const CACHE_TTL = 10 * 60; // 10 minutes
const CACHE_KEY_PREFIX = 'public_stats:v2:';
const DAY_SECONDS = 24 * 60 * 60;
const UNAVAILABLE_POPULATION_TTL = 60;
const POPULATION_TIMEOUT_MS = 2000;
const populationClock = { wall: Date.now(), monotonic: process.hrtime.bigint() };
let pendingPopulation: Promise<PublicPopulation> | undefined;

// Never re-anchor to a jumped wall clock. Startup requires synchronized time;
// after a forward step, withhold history until wall time agrees again.
function populationTime(): number | null {
  const wall = Date.now();
  const elapsed = Number(process.hrtime.bigint() - populationClock.monotonic) / 1_000_000;
  const expected = populationClock.wall + elapsed;
  if (wall > expected + 1000) return null;
  // Even tolerated sub-second drift must not advance a publication boundary.
  return Math.min(wall, expected);
}

function eligiblePopulationWindow(end: number, delayHours: number): boolean {
  const now = populationTime();
  return now !== null && end <= now / 1000 - delayHours * 3600;
}

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

/** Recheck at serialization, including time spent waiting for current health. */
export function publicPopulationForResponse(population: PublicPopulation): PublicPopulation {
  if (
    population.estimate === null ||
    population.delayHours !== getBackendConfiguration().publicPopulationDelayHours ||
    !eligiblePopulationWindow(Date.parse(population.windowEnd ?? '') / 1000, population.delayHours)
  ) {
    return unavailablePopulation();
  }
  return population;
}

/** Bound optional history I/O without queuing more work behind a stalled read. */
export async function getPublicPopulation(): Promise<PublicPopulation> {
  if (!pendingPopulation) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = readPublicPopulation().finally(() => {
      clearTimeout(timer);
      pendingPopulation = undefined;
    });
    // Keep the settled timeout shared until the underlying I/O finishes. New
    // polls return null immediately without accumulating waiters on a hung read.
    pendingPopulation = Promise.race([
      read,
      new Promise<PublicPopulation>((resolve) => {
        timer = setTimeout(() => resolve(unavailablePopulation()), POPULATION_TIMEOUT_MS);
      }),
    ]);
  }
  return publicPopulationForResponse(await pendingPopulation);
}

/** Reuse recorded faction totals without publishing the individual factions. */
async function readPublicPopulation(): Promise<PublicPopulation> {
  const population = unavailablePopulation();
  const now = populationTime();
  if (now === null) return population;
  const end = (Math.floor(now / 3_600_000) - population.delayHours) * 3600;
  const start = end - 3600;
  const windowStart = new Date(start * 1000).toISOString();
  const windowEnd = new Date(end * 1000).toISOString();
  // Include policy and epoch, so an offset increase or clock rollback cannot reuse
  // a fresher result. Never read the old live status/staff presence caches.
  const key = `public_population:v1:${population.delayHours}:${end}`;
  try {
    const cached = await getCache<PublicPopulation>(key);
    if (!eligiblePopulationWindow(end, population.delayHours)) return population;
    if (
      cached &&
      cached.delayHours === population.delayHours &&
      cached.windowStart === windowStart &&
      cached.windowEnd === windowEnd &&
      (cached.estimate === null ||
        (typeof cached.estimate === 'number' &&
          Number.isSafeInteger(cached.estimate) &&
          cached.estimate >= 0))
    ) {
      return cached.estimate === null
        ? population
        : { ...population, estimate: cached.estimate, windowStart, windowEnd };
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
    const average = Number(row?.average);
    const estimate =
      row &&
      Number.isSafeInteger(Number(row.samples)) &&
      Number(row.samples) > 0 &&
      Number(row.invalid_samples) === 0 &&
      row.average != null &&
      Number.isFinite(average) &&
      average >= 0 &&
      Number.isSafeInteger(Math.round(average))
        ? Math.round(average)
        : null;
    if (!eligiblePopulationWindow(end, population.delayHours)) return population;
    // Keep the queried window on the private sentinel, but return null public
    // timestamps for unavailable history. Retry soon enough to see late backfills.
    const result = { ...population, estimate, windowStart, windowEnd };
    await setCache(key, result, estimate === null ? UNAVAILABLE_POPULATION_TTL : CACHE_TTL);
    if (!eligiblePopulationWindow(end, population.delayHours)) return population;
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

/** Allowed overlap windows, in published UTC days. */
export const FACTION_OVERLAP_DAYS = [7, 14, 30] as const;
export type FactionOverlapDays = (typeof FACTION_OVERLAP_DAYS)[number];

export interface FactionOverlapHour {
  /** UTC hour of day (0-23) the bucket starts at. */
  utcHour: number;
  samples: number;
  /** Samples with at least one goods and one evils player online. */
  bothSamples: number;
  goodsPeak: number;
  goodsAverage: number;
  evilsPeak: number;
  evilsAverage: number;
  /** Averages over only the samples where both sides were online; 0 when none. */
  goodsAverageWhileBoth: number;
  evilsAverageWhileBoth: number;
}

export interface FactionOverlap {
  days: FactionOverlapDays;
  /** First and last UTC day with samples in the window, or null when empty. */
  firstDate: string | null;
  lastDate: string | null;
  samples: number;
  hours: FactionOverlapHour[];
}

function toCount(value: unknown, column: string): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`invalid faction overlap ${column}`);
  }
  return number;
}

function toAverage(value: unknown, column: string): number {
  if (value == null) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`invalid faction overlap ${column}`);
  }
  return Math.round(number * 100) / 100;
}

function utcDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Summarize when goods and evils are online together, by UTC hour of day,
 * over the newest published days. Uses the same publication cutoff as the
 * daily activity, so it never reveals anything fresher than that page.
 */
export async function getFactionOverlap(days: FactionOverlapDays): Promise<FactionOverlap> {
  const cutoff = publicationCutoff();
  const start = cutoff - days * DAY_SECONDS;
  const cacheKey = `${CACHE_KEY_PREFIX}faction_overlap:${days}:${cutoff}`;
  const cached = await getCache<FactionOverlap>(cacheKey);
  if (cached) return cached;

  // Epoch arithmetic keeps buckets independent of the database session timezone.
  const [rows] = await mudPool.query<RowDataPacket[]>(
    `SELECT
       FLOOR(MOD(date, 86400) / 3600) AS utc_hour,
       COUNT(*) AS samples,
       SUM(COALESCE(goods_count, 0) > 0 AND COALESCE(evils_count, 0) > 0) AS both_samples,
       MAX(COALESCE(goods_count, 0)) AS goods_peak,
       AVG(COALESCE(goods_count, 0)) AS goods_average,
       MAX(COALESCE(evils_count, 0)) AS evils_peak,
       AVG(COALESCE(evils_count, 0)) AS evils_average,
       AVG(CASE WHEN goods_count > 0 AND evils_count > 0 THEN goods_count END) AS goods_average_while_both,
       AVG(CASE WHEN goods_count > 0 AND evils_count > 0 THEN evils_count END) AS evils_average_while_both,
       MIN(date) AS first_sample,
       MAX(date) AS last_sample
     FROM statistics
     WHERE date >= ? AND date < ?
     GROUP BY utc_hour
     ORDER BY utc_hour ASC`,
    [start, cutoff],
  );

  const hours: FactionOverlapHour[] = Array.from({ length: 24 }, (_, utcHour) => ({
    utcHour,
    samples: 0,
    bothSamples: 0,
    goodsPeak: 0,
    goodsAverage: 0,
    evilsPeak: 0,
    evilsAverage: 0,
    goodsAverageWhileBoth: 0,
    evilsAverageWhileBoth: 0,
  }));
  let samples = 0;
  let firstSample: number | null = null;
  let lastSample: number | null = null;

  for (const row of rows) {
    const utcHour = toCount(row.utc_hour, 'utc_hour');
    if (utcHour > 23) throw new Error('invalid faction overlap utc_hour');
    const hour: FactionOverlapHour = {
      utcHour,
      samples: toCount(row.samples, 'samples'),
      bothSamples: toCount(row.both_samples, 'both_samples'),
      goodsPeak: toCount(row.goods_peak, 'goods_peak'),
      goodsAverage: toAverage(row.goods_average, 'goods_average'),
      evilsPeak: toCount(row.evils_peak, 'evils_peak'),
      evilsAverage: toAverage(row.evils_average, 'evils_average'),
      goodsAverageWhileBoth: toAverage(row.goods_average_while_both, 'goods_average_while_both'),
      evilsAverageWhileBoth: toAverage(row.evils_average_while_both, 'evils_average_while_both'),
    };
    if (hour.bothSamples > hour.samples) throw new Error('invalid faction overlap both_samples');
    hours[utcHour] = hour;
    samples += hour.samples;
    const first = toCount(row.first_sample, 'first_sample');
    const last = toCount(row.last_sample, 'last_sample');
    firstSample = firstSample === null ? first : Math.min(firstSample, first);
    lastSample = lastSample === null ? last : Math.max(lastSample, last);
  }

  const result: FactionOverlap = {
    days,
    firstDate: firstSample === null ? null : utcDate(firstSample),
    lastDate: lastSample === null ? null : utcDate(lastSample),
    samples,
    hours,
  };
  await setCache(cacheKey, result, CACHE_TTL);
  return result;
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

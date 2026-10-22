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
function publicationCutoff(): number | null {
  const now = populationTime();
  return now === null ? null : (Math.floor(now / (DAY_SECONDS * 1000)) - 1) * DAY_SECONDS;
}

export class PublicStatisticsUnavailableError extends Error {}

function assertPublicationEligible(cutoff: number): void {
  const current = publicationCutoff();
  if (current === null || cutoff > current) throw new PublicStatisticsUnavailableError();
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
  const cutoff = publicationCutoff();
  if (!Number.isFinite(start) || cutoff === null || start >= cutoff) return [];

  const cacheKey = `${CACHE_KEY_PREFIX}faction_activity:${date}`;
  const cached = await getCache<FactionActivityPoint[]>(cacheKey);
  assertPublicationEligible(start + DAY_SECONDS);
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

  assertPublicationEligible(start + DAY_SECONDS);
  await setCache(cacheKey, data, CACHE_TTL);
  assertPublicationEligible(start + DAY_SECONDS);
  return data;
}

/** Allowed overlap windows, in published UTC days. */
export const FACTION_OVERLAP_DAYS = [7, 14, 30] as const;
export type FactionOverlapDays = (typeof FACTION_OVERLAP_DAYS)[number];

export interface FactionOverlapHour {
  /** Start of this dated UTC hour, in epoch seconds. */
  timestamp: number;
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
  const number = Number(value);
  if (value == null || !Number.isSafeInteger(number) || number < 0) {
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
  return number;
}

function utcDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Summarize when goods and evils are online together, by dated UTC hour,
 * over the newest published days. Uses the same publication cutoff as the
 * daily activity, so it never reveals anything fresher than that page.
 */
export async function getFactionOverlap(days: FactionOverlapDays): Promise<FactionOverlap> {
  const cutoff = publicationCutoff();
  if (cutoff === null) throw new PublicStatisticsUnavailableError();
  const key = `${days}:${cutoff}`;
  let pending = pendingOverlap.get(key);
  if (!pending) {
    pending = readFactionOverlap(days, cutoff).finally(() => pendingOverlap.delete(key));
    pendingOverlap.set(key, pending);
  }
  const result = await pending;
  assertPublicationEligible(cutoff);
  return result;
}

const pendingOverlap = new Map<string, Promise<FactionOverlap>>();

async function readFactionOverlap(
  days: FactionOverlapDays,
  cutoff: number,
): Promise<FactionOverlap> {
  const start = cutoff - days * DAY_SECONDS;
  const cacheKey = `${CACHE_KEY_PREFIX}faction_overlap:v2:${days}:${cutoff}`;
  const cached = await getCache<FactionOverlap>(cacheKey);
  assertPublicationEligible(cutoff);
  if (cached) return cached;

  // Epoch arithmetic keeps buckets independent of the database session timezone.
  const connection = await mudPool.getConnection();
  let rows: RowDataPacket[];
  try {
    // Each engine executes its own statement limit and ignores the other's
    // syntax. Bound server work as well as the client's wait, without changing
    // session settings on a pooled connection.
    [rows] = await connection.query<RowDataPacket[]>({
      timeout: 2500,
      sql: `/*M!100100 SET STATEMENT max_statement_time=2 FOR */
     SELECT /*+ MAX_EXECUTION_TIME(2000) */
       FLOOR(date / 3600) * 3600 AS hour_start,
       COUNT(*) AS samples,
       SUM(goods_count IS NULL OR goods_count < 0 OR goods_count != FLOOR(goods_count) OR
           evils_count IS NULL OR evils_count < 0 OR evils_count != FLOOR(evils_count)) AS invalid_samples,
       SUM(goods_count > 0 AND evils_count > 0) AS both_samples,
       MAX(goods_count) AS goods_peak,
       AVG(goods_count) AS goods_average,
       MAX(evils_count) AS evils_peak,
       AVG(evils_count) AS evils_average,
       AVG(CASE WHEN goods_count > 0 AND evils_count > 0 THEN goods_count END) AS goods_average_while_both,
       AVG(CASE WHEN goods_count > 0 AND evils_count > 0 THEN evils_count END) AS evils_average_while_both,
       MIN(date) AS first_sample,
       MAX(date) AS last_sample
     FROM statistics
     WHERE date >= ? AND date < ?
     GROUP BY hour_start
     ORDER BY hour_start ASC`,
      values: [start, cutoff],
    });
  } catch (error) {
    // Discard a failed or timed-out connection rather than returning unfinished
    // protocol work to another request.
    connection.destroy();
    throw error;
  }
  connection.release();
  assertPublicationEligible(cutoff);

  const hours: FactionOverlapHour[] = [];
  let samples = 0;
  let firstSample: number | null = null;
  let lastSample: number | null = null;

  for (const row of rows) {
    const timestamp = toCount(row.hour_start, 'hour_start');
    if (timestamp % 3600 !== 0 || timestamp < start || timestamp >= cutoff) {
      throw new Error('invalid faction overlap hour_start');
    }
    if (toCount(row.invalid_samples, 'invalid_samples') !== 0) {
      throw new Error('invalid faction overlap source samples');
    }
    const hour: FactionOverlapHour = {
      timestamp,
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
    hours.push(hour);
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
  assertPublicationEligible(cutoff);
  await setCache(cacheKey, result, CACHE_TTL);
  assertPublicationEligible(cutoff);
  return result;
}

/** List the newest 30 recorded days using the same publication boundary. */
export async function getAvailableDates(): Promise<string[]> {
  const cutoff = publicationCutoff();
  if (cutoff === null) return [];
  // A new UTC day must not reuse yesterday's list across the release boundary.
  const cacheKey = `${CACHE_KEY_PREFIX}available_dates:${cutoff}`;
  const cached = await getCache<string[]>(cacheKey);
  assertPublicationEligible(cutoff);
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
  assertPublicationEligible(cutoff);
  await setCache(cacheKey, dates, CACHE_TTL);
  assertPublicationEligible(cutoff);
  return dates;
}

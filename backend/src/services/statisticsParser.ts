import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db/connection.js';
import logger, { isErrorWithCode } from '../utils/logger.js';

const MUD_DIR = process.env.MUD_DIR!;
const STATISTICS_DIR = path.join(MUD_DIR, 'lib/statistics');

// cache for peak player count (avoid reading 30 files on every player connect)
let peakPlayerCache: { count: number; timestamp: Date | null; cachedAt: number } | null = null;
const PEAK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface HourlyStats {
  hour: number;
  goods: number;
  evils: number;
  illithids: number;
  undeads: number;
  gods: number;
  inGuildhall: number;
  goodsLevels: number;
  evilsLevels: number;
  illithidsLevels: number;
  undeadsLevels: number;
  uniqueIPs: number;
}

interface DailyStatsSummary {
  date: string;
  peakPlayers: number;
  peakHour: number;
  avgPlayers: number;
  totalUniqueIPs: number;
}

/**
 * Parse a statistics file line
 * Format: hour goods evils illithids undeads gods guildhall goods_levels evils_levels illithids_levels undeads_levels unique_ips
 */
function parseStatLine(line: string): HourlyStats | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 12) return null;

  const [
    hour,
    goods,
    evils,
    illithids,
    undeads,
    gods,
    guildhall,
    goodsLevels,
    evilsLevels,
    illithidsLevels,
    undeadsLevels,
    uniqueIPs,
  ] = parts.map(Number);

  // Skip if all zeros (unpopulated)
  if (goods === 0 && evils === 0 && illithids === 0 && undeads === 0 && gods === 0) {
    return null;
  }

  return {
    hour,
    goods,
    evils,
    illithids,
    undeads,
    gods,
    inGuildhall: guildhall,
    goodsLevels,
    evilsLevels,
    illithidsLevels,
    undeadsLevels,
    uniqueIPs,
  };
}

/**
 * Parse a statistics file for a specific date
 * Filename format: statistics_generalYYYYMMDD
 */
async function parseStatisticsFile(date: Date): Promise<HourlyStats[]> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const filename = `statistics_general${year}${month}${day}`;
  const filepath = path.join(STATISTICS_DIR, filename);

  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const lines = content.split('\n');
    const stats: HourlyStats[] = [];

    for (const line of lines) {
      const parsed = parseStatLine(line);
      if (parsed) {
        stats.push(parsed);
      }
    }

    return stats;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

/**
 * Get peak player count from statistics files
 * Searches last 30 days of statistics files
 * Results are cached for 5 minutes to avoid reading 30 files on every call
 */
export async function getPeakPlayerCount(): Promise<{ count: number; timestamp: Date | null }> {
  // check cache first
  if (peakPlayerCache && Date.now() - peakPlayerCache.cachedAt < PEAK_CACHE_TTL) {
    return { count: peakPlayerCache.count, timestamp: peakPlayerCache.timestamp };
  }

  const today = new Date();
  let maxPlayers = 0;
  let maxTimestamp: Date | null = null;

  // Search last 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    try {
      const stats = await parseStatisticsFile(date);

      for (const hourStat of stats) {
        const total =
          hourStat.goods + hourStat.evils + hourStat.illithids + hourStat.undeads + hourStat.gods;
        if (total > maxPlayers) {
          maxPlayers = total;
          // Create timestamp for this hour
          maxTimestamp = new Date(date);
          maxTimestamp.setHours(hourStat.hour, 0, 0, 0);
        }
      }
    } catch (_error) {
      // Skip this day if file can't be read
      continue;
    }
  }

  // update cache
  peakPlayerCache = { count: maxPlayers, timestamp: maxTimestamp, cachedAt: Date.now() };

  return { count: maxPlayers, timestamp: maxTimestamp };
}

/**
 * Get daily summaries from statistics files
 * Returns last N days of data
 */
export async function getDailySummaries(days: number = 30): Promise<DailyStatsSummary[]> {
  const today = new Date();
  const summaries: DailyStatsSummary[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    try {
      const stats = await parseStatisticsFile(date);

      if (stats.length === 0) continue;

      let peakPlayers = 0;
      let peakHour = 0;
      let totalPlayers = 0;
      const uniqueIPsSet = new Set<number>();

      for (const hourStat of stats) {
        const total =
          hourStat.goods + hourStat.evils + hourStat.illithids + hourStat.undeads + hourStat.gods;
        totalPlayers += total;

        if (total > peakPlayers) {
          peakPlayers = total;
          peakHour = hourStat.hour;
        }

        if (hourStat.uniqueIPs > 0) {
          uniqueIPsSet.add(hourStat.uniqueIPs);
        }
      }

      summaries.push({
        date: date.toISOString().split('T')[0],
        peakPlayers,
        peakHour,
        avgPlayers: stats.length > 0 ? Math.round(totalPlayers / stats.length) : 0,
        totalUniqueIPs: uniqueIPsSet.size,
      });
    } catch (_error) {
      // Skip this day
      continue;
    }
  }

  return summaries.reverse(); // Oldest to newest
}

/**
 * Sync statistics from flatfiles to database
 * This can be run periodically to populate the statistics table
 */
export async function syncStatisticsToDatabase(date: Date): Promise<number> {
  const stats = await parseStatisticsFile(date);
  if (stats.length === 0) return 0;

  let inserted = 0;

  for (const hourStat of stats) {
    const timestamp = new Date(date);
    timestamp.setHours(hourStat.hour, 0, 0, 0);

    try {
      await pool.query(
        `INSERT INTO statistics (
          date, goods_count, evils_count, illithids_count, undeads_count, gods_count,
          in_guildhall_count, sum_goods_levels, sum_evils_levels, sum_illithids_levels,
          sum_undeads_levels, unique_ips_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          goods_count = VALUES(goods_count),
          evils_count = VALUES(evils_count),
          illithids_count = VALUES(illithids_count),
          undeads_count = VALUES(undeads_count),
          gods_count = VALUES(gods_count),
          in_guildhall_count = VALUES(in_guildhall_count),
          sum_goods_levels = VALUES(sum_goods_levels),
          sum_evils_levels = VALUES(sum_evils_levels),
          sum_illithids_levels = VALUES(sum_illithids_levels),
          sum_undeads_levels = VALUES(sum_undeads_levels),
          unique_ips_count = VALUES(unique_ips_count)`,
        [
          Math.floor(timestamp.getTime() / 1000),
          hourStat.goods,
          hourStat.evils,
          hourStat.illithids,
          hourStat.undeads,
          hourStat.gods,
          hourStat.inGuildhall,
          hourStat.goodsLevels,
          hourStat.evilsLevels,
          hourStat.illithidsLevels,
          hourStat.undeadsLevels,
          hourStat.uniqueIPs,
        ],
      );
      inserted++;
    } catch (error) {
      logger.error(`Error inserting stats for ${timestamp}:`, error);
    }
  }

  return inserted;
}

/**
 * Get player count trend from statistics (last 7 days)
 */
export async function getPlayerCountTrend(): Promise<Array<{ date: string; count: number }>> {
  const summaries = await getDailySummaries(7);
  return summaries.map((s) => ({
    date: s.date,
    count: s.peakPlayers,
  }));
}

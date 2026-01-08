import { pool } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import type {
  FragLeaderboardEntry,
  FragLeaderboardFilters,
  TopGainer,
  AutocompleteItem,
} from '../types/index.js';

/**
 * Strip ANSI color codes from MUD strings for filtering
 */
function stripAnsiCodes(str: string): string {
  return str.replace(/&[+nNL]?[a-zA-Z]/g, '');
}

/**
 * Get frag leaderboard with comprehensive filtering
 */
export async function getFragLeaderboard(
  filters: FragLeaderboardFilters
): Promise<{ entries: FragLeaderboardEntry[]; total: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  const whereConditions: string[] = [];
  const queryParams: any[] = [];

  // Always filter out deleted characters by default
  if (!filters.include_deleted) {
    whereConditions.push('deleted_at IS NULL');
  }

  // Always filter out characters with 0 frags
  whereConditions.push('total_frags > 0');

  // Alignment filter (racewar)
  if (filters.racewar !== undefined && filters.racewar !== null) {
    whereConditions.push('racewar = ?');
    queryParams.push(filters.racewar);
  }

  // Race filter (compare without ANSI codes)
  if (filters.race) {
    whereConditions.push('race = ?');
    queryParams.push(filters.race);
  }

  // Class filter (compare without ANSI codes)
  if (filters.class) {
    whereConditions.push('class = ?');
    queryParams.push(filters.class);
  }

  // Level range filters
  if (filters.level_min !== undefined && filters.level_min !== null) {
    whereConditions.push('level >= ?');
    queryParams.push(filters.level_min);
  }

  if (filters.level_max !== undefined && filters.level_max !== null) {
    whereConditions.push('level <= ?');
    queryParams.push(filters.level_max);
  }

  // Account name filter
  if (filters.account_name) {
    whereConditions.push('account_name = ?');
    queryParams.push(filters.account_name);
  }

  // Character name search (partial match)
  if (filters.char_name) {
    whereConditions.push('char_name LIKE ?');
    queryParams.push(`%${filters.char_name}%`);
  }

  // Minimum frags filter
  if (filters.min_frags !== undefined && filters.min_frags !== null) {
    whereConditions.push('total_frags >= ?');
    queryParams.push(filters.min_frags * 100); // Convert to stored format (frags * 100)
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM frag_leaderboard
    ${whereClause}
  `;

  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total;

  // Main data query - join with players_core to get ANSI-colored race/class
  const query = `
    SELECT
      fl.char_name,
      fl.account_name,
      fl.total_frags / 100.0 AS total_frags,
      fl.racewar,
      COALESCE(pc.race, fl.race) AS race,
      COALESCE(pc.classname, fl.class) AS class,
      fl.level,
      fl.last_updated
    FROM frag_leaderboard fl
    LEFT JOIN players_core pc ON fl.char_name = pc.name
    ${whereClause.replace(/race =/g, 'fl.race =').replace(/class =/g, 'fl.class =').replace(/racewar/g, 'fl.racewar').replace(/level/g, 'fl.level').replace(/deleted_at/g, 'fl.deleted_at').replace(/total_frags/g, 'fl.total_frags').replace(/account_name/g, 'fl.account_name').replace(/char_name/g, 'fl.char_name')}
    ORDER BY fl.total_frags DESC
    LIMIT ? OFFSET ?
  `;

  const dataParams = [...queryParams, limit, offset];
  const [rows] = await pool.query<RowDataPacket[]>(query, dataParams);

  const entries: FragLeaderboardEntry[] = rows.map((row, index) => ({
    rank: offset + index + 1,
    char_name: row.char_name,
    account_name: row.account_name,
    total_frags: Number(row.total_frags),
    racewar: row.racewar,
    race: row.race || '',
    class: row.class || '',
    level: row.level,
    last_updated: row.last_updated,
  }));

  return { entries, total };
}

/**
 * Get top frag gainers over a time period
 */
export async function getTopGainers(
  period: '7d' | '30d' | '90d' = '30d',
  limit: number = 50
): Promise<TopGainer[]> {
  // Calculate date threshold
  const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[period];

  const query = `
    SELECT
      fl.char_name,
      fl.account_name,
      SUM(p.delta) / 100.0 AS frags_gained,
      COALESCE(pc.race, fl.race) AS race,
      COALESCE(pc.classname, fl.class) AS class,
      fl.level
    FROM progress p
    JOIN frag_leaderboard fl ON p.pid = fl.pid
    LEFT JOIN players_core pc ON fl.char_name = pc.name
    WHERE p.var_type = 'FRAGS'
      AND p.stamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND fl.deleted_at IS NULL
    GROUP BY p.pid, fl.char_name, fl.account_name, pc.race, fl.race, pc.classname, fl.class, fl.level
    HAVING frags_gained > 0
    ORDER BY frags_gained DESC
    LIMIT ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [days, limit]);

  const gainers: TopGainer[] = rows.map((row: RowDataPacket, index: number) => ({
    rank: index + 1,
    char_name: row.char_name as string,
    account_name: row.account_name as string,
    frags_gained: Number(row.frags_gained),
    race: (row.race as string) || '',
    class: (row.class as string) || '',
    level: row.level as number,
  }));

  return gainers;
}

/**
 * Get available races for autocomplete (distinct, stripped of ANSI)
 */
export async function getFragRaces(): Promise<AutocompleteItem[]> {
  const query = `
    SELECT DISTINCT race
    FROM frag_leaderboard
    WHERE deleted_at IS NULL
      AND race IS NOT NULL
      AND race != ''
    ORDER BY race
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query);

  const races: AutocompleteItem[] = rows.map((row: RowDataPacket) => {
    const raceWithAnsi = row.race as string;
    const raceStripped = stripAnsiCodes(raceWithAnsi);
    return {
      value: raceWithAnsi,  // Store original with ANSI codes
      label: raceStripped,  // Display without ANSI codes
    };
  });

  return races;
}

/**
 * Get available classes for autocomplete (distinct, stripped of ANSI)
 */
export async function getFragClasses(): Promise<AutocompleteItem[]> {
  const query = `
    SELECT DISTINCT class
    FROM frag_leaderboard
    WHERE deleted_at IS NULL
      AND class IS NOT NULL
      AND class != ''
    ORDER BY class
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query);

  const classes: AutocompleteItem[] = rows.map((row: RowDataPacket) => {
    const classWithAnsi = row.class as string;
    const classStripped = stripAnsiCodes(classWithAnsi);
    return {
      value: classWithAnsi,  // Store original with ANSI codes
      label: classStripped,  // Display without ANSI codes
    };
  });

  return classes;
}

/**
 * Get frag statistics for a specific character
 * Uses RANK() window function to calculate rank in a single query
 */
export async function getCharacterFragStats(charName: string): Promise<FragLeaderboardEntry | null> {
  // Single query using RANK() window function to include rank
  const query = `
    SELECT
      char_name,
      account_name,
      total_frags / 100.0 AS total_frags,
      racewar,
      race,
      class,
      level,
      last_updated,
      global_rank
    FROM (
      SELECT
        fl.char_name,
        fl.account_name,
        fl.total_frags,
        fl.racewar,
        COALESCE(pc.race, fl.race) AS race,
        COALESCE(pc.classname, fl.class) AS class,
        fl.level,
        fl.last_updated,
        RANK() OVER (ORDER BY fl.total_frags DESC) AS global_rank
      FROM frag_leaderboard fl
      LEFT JOIN players_core pc ON fl.char_name = pc.name
      WHERE fl.deleted_at IS NULL
    ) ranked
    WHERE char_name = ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [charName]);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    rank: row.global_rank,
    char_name: row.char_name,
    account_name: row.account_name,
    total_frags: Number(row.total_frags),
    racewar: row.racewar,
    race: row.race || '',
    class: row.class || '',
    level: row.level,
    last_updated: row.last_updated,
  };
}

/**
 * Get all characters for an account (sorted by frags)
 * Uses RANK() window function to calculate ranks in a single query
 */
export async function getAccountFragStats(accountName: string): Promise<FragLeaderboardEntry[]> {
  // Single query using RANK() window function to calculate all ranks at once
  const query = `
    SELECT
      char_name,
      account_name,
      total_frags / 100.0 AS total_frags,
      racewar,
      race,
      class,
      level,
      last_updated,
      deleted_at,
      global_rank
    FROM (
      SELECT
        fl.char_name,
        fl.account_name,
        fl.total_frags,
        fl.racewar,
        COALESCE(pc.race, fl.race) AS race,
        COALESCE(pc.classname, fl.class) AS class,
        fl.level,
        fl.last_updated,
        fl.deleted_at,
        CASE
          WHEN fl.deleted_at IS NULL THEN RANK() OVER (ORDER BY fl.total_frags DESC)
          ELSE 0
        END AS global_rank
      FROM frag_leaderboard fl
      LEFT JOIN players_core pc ON fl.char_name = pc.name
      WHERE fl.deleted_at IS NULL OR fl.account_name = ?
    ) ranked
    WHERE account_name = ?
    ORDER BY total_frags DESC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [accountName, accountName]);

  return rows.map((row: RowDataPacket) => ({
    rank: row.global_rank,
    char_name: row.char_name,
    account_name: row.account_name,
    total_frags: Number(row.total_frags),
    racewar: row.racewar,
    race: row.race || '',
    class: row.class || '',
    level: row.level,
    last_updated: row.last_updated,
  }));
}

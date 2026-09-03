import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import logger, { isErrorWithCode } from '../utils/logger.js';
import {
  PvPEventListItem,
  PvPEventDetail,
  ParticipantInfo,
  PlayerStats,
  LeaderboardEntry,
  RecentBattle,
  OpponentStat,
  EventFilters,
  SearchFilters,
  PvPBattleComment,
  PvPBattleStats,
  PvPFavorite,
} from '../types/index.js';
import { extractPlayerName } from '../utils/stringUtils.js';
import { getWebSettings } from './webSettingsService.js';

/**
 * Get paginated list of PvP events
 */
export async function getPvPEvents(
  filters: EventFilters,
): Promise<{ events: PvPEventListItem[]; total: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  const whereConditions: string[] = [];
  const queryParams: any[] = [];

  // Get PvP delay setting
  const webSettings = await getWebSettings();
  const pvpDelayMinutes = webSettings.pvpDelayMinutes || 0;

  // Apply PvP delay filter (hide events newer than the delay)
  if (pvpDelayMinutes > 0) {
    whereConditions.push('e.stamp <= DATE_SUB(NOW(), INTERVAL ? MINUTE)');
    queryParams.push(pvpDelayMinutes);
  }

  // Apply filters
  if (filters.player) {
    whereConditions.push('p.player_description LIKE ?');
    queryParams.push(`%${filters.player}%`);
  }

  if (filters.location) {
    whereConditions.push('e.room_name LIKE ?');
    queryParams.push(`%${filters.location}%`);
  }

  if (filters.date_from) {
    whereConditions.push('e.stamp >= ?');
    queryParams.push(filters.date_from);
  }

  if (filters.date_to) {
    whereConditions.push('e.stamp <= ?');
    queryParams.push(filters.date_to);
  }

  // Hour of day filter (0-23)
  if (filters.hour !== undefined && filters.hour >= 0 && filters.hour <= 23) {
    whereConditions.push('HOUR(e.stamp) = ?');
    queryParams.push(filters.hour);
  }

  // Helper to strip ANSI codes in SQL: &+c, &-c, &n, &N, &L, etc.
  // Note: use {0,1} instead of ? to avoid mysql2 treating ? as placeholder
  const stripAnsiSQL = (col: string) => `REGEXP_REPLACE(${col}, '&[+nNL-]{0,1}[a-zA-Z]', '')`;
  const strippedDesc = stripAnsiSQL('p.player_description');

  // Class filter - searches within player_description like "[56 Warrior]"
  // Cast to SearchFilters to access advanced filter properties
  const searchFilters = filters as SearchFilters;
  if (searchFilters.class) {
    const classes = searchFilters.class
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (classes.length > 0) {
      const classConditions = classes.map(() => `${strippedDesc} LIKE ?`);
      whereConditions.push(`(${classConditions.join(' OR ')})`);
      classes.forEach((cls) => {
        // Match class name after level number in brackets, e.g., "[56 Warrior]"
        queryParams.push(`%[% ${cls}]%`);
      });
    }
  }

  // Race filter - searches within player_description like "(Githzerai)"
  if (searchFilters.race) {
    const races = searchFilters.race
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    if (races.length > 0) {
      const raceConditions = races.map(() => `${strippedDesc} LIKE ?`);
      whereConditions.push(`(${raceConditions.join(' OR ')})`);
      races.forEach((race) => {
        // Match race name in parentheses, e.g., "(Githzerai)"
        queryParams.push(`%(${race})%`);
      });
    }
  }

  // Level range filter - extract level from player_description (level is before ANSI, no need to strip)
  if (searchFilters.level_min !== undefined && searchFilters.level_min > 1) {
    whereConditions.push(
      'CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(p.player_description, " ", 1), "[", -1) AS UNSIGNED) >= ?',
    );
    queryParams.push(searchFilters.level_min);
  }
  if (searchFilters.level_max !== undefined && searchFilters.level_max < 56) {
    whereConditions.push(
      'CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(p.player_description, " ", 1), "[", -1) AS UNSIGNED) <= ?',
    );
    queryParams.push(searchFilters.level_max);
  }

  // Alignment filter - based on race (use stripped desc)
  if (searchFilters.alignment) {
    const goodRaces = [
      'Human',
      'Grey Elf',
      'Dwarf',
      'Halfling',
      'Gnome',
      'Githzerai',
      'Centaur',
      'Firbolg',
      'Barbarian',
    ];
    const evilRaces = [
      'Drow Elf',
      'Orc',
      'Ogre',
      'Troll',
      'Githyanki',
      'Goblin',
      'Kobold',
      'Duergar',
      'Minotaur',
      'Illithid',
      'Thri-Kreen',
      'Tiefling',
      'Revenant',
    ];

    const racesToMatch =
      searchFilters.alignment === 'good'
        ? goodRaces
        : searchFilters.alignment === 'evil'
          ? evilRaces
          : [];

    if (racesToMatch.length > 0) {
      const alignConditions = racesToMatch.map(() => `${strippedDesc} LIKE ?`);
      whereConditions.push(`(${alignConditions.join(' OR ')})`);
      racesToMatch.forEach((race) => {
        queryParams.push(`%(${race})%`);
      });
    }
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(DISTINCT e.id) as total
    FROM pkill_event e
    LEFT JOIN pkill_info p ON e.id = p.event_id
    ${whereClause}
  `;

  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total;

  // Determine sort order
  const orderBy = filters.sort_by === 'likes' ? 'e.like_count DESC, e.stamp DESC' : 'e.stamp DESC';

  // Get paginated events
  const query = `
    SELECT
      e.id,
      e.stamp,
      e.room_name,
      e.room_vnum,
      e.like_count,
      e.comment_count,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'KILLER%'
        THEN CONCAT(p.player_description, '<<>>', IF(p.leader, '1', '0')) END
        SEPARATOR '|||'
      ) as killers,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'VICTIM%'
        THEN CONCAT(p.player_description, '<<>>', IF(p.leader, '1', '0'), '<<>>', IF(p.pk_type = 'VICTIM', '1', '0')) END
        SEPARATOR '|||'
      ) as victims
    FROM pkill_event e
    LEFT JOIN pkill_info p ON e.id = p.event_id AND p.inroom = 1
    ${whereClause}
    GROUP BY e.id, e.stamp, e.room_name, e.room_vnum, e.like_count, e.comment_count
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);
  const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);

  const parseKillers = (data: string | null) => {
    if (!data) return [];
    return data
      .split('|||')
      .filter(Boolean)
      .map((entry) => {
        const [description, leaderFlag] = entry.split('<<>>');
        return { description, isLeader: leaderFlag === '1' };
      });
  };

  const parseVictims = (data: string | null) => {
    if (!data) return [];
    return data
      .split('|||')
      .filter(Boolean)
      .map((entry) => {
        const [description, leaderFlag, diedFlag] = entry.split('<<>>');
        return { description, isLeader: leaderFlag === '1', died: diedFlag === '1' };
      });
  };

  const events: PvPEventListItem[] = rows.map((row) => ({
    id: row.id,
    stamp: row.stamp,
    room_name: row.room_name,
    room_vnum: row.room_vnum,
    killers: parseKillers(row.killers),
    victims: parseVictims(row.victims),
    killer_count: row.killers ? row.killers.split('|||').filter(Boolean).length : 0,
    victim_count: row.victims ? row.victims.split('|||').filter(Boolean).length : 0,
    like_count: row.like_count || 0,
    comment_count: row.comment_count || 0,
  }));

  return { events, total };
}

/**
 * Get detailed information for a single PvP event
 */
export async function getPvPEventDetail(eventId: number): Promise<PvPEventDetail | null> {
  // Get settings
  const webSettings = await getWebSettings();
  const pvpDelayMinutes = webSettings.pvpDelayMinutes || 0;
  const respectWebinfo = webSettings.respectWebinfoToggle;

  // Build WHERE clause with delay filter
  const whereConditions = ['e.id = ?'];
  const queryParams: any[] = [eventId];

  if (pvpDelayMinutes > 0) {
    whereConditions.push('e.stamp <= DATE_SUB(NOW(), INTERVAL ? MINUTE)');
    queryParams.push(pvpDelayMinutes);
  }

  // If respectWebinfoToggle is enabled, hide equipment when player's webinfo is off
  // webinfo is stored as bit 28 (134217728) in act2 column
  const PLR2_WEBINFO = 134217728;
  const equipSelect = respectWebinfo
    ? `CASE WHEN (pd.act2 & ${PLR2_WEBINFO}) != 0 THEN p.equip ELSE NULL END as equip`
    : 'p.equip';

  const query = `
    SELECT
      e.id,
      e.stamp,
      e.room_name,
      e.room_vnum,
      p.player_description,
      p.pk_type,
      p.level,
      ${equipSelect},
      p.log,
      p.inroom,
      p.leader,
      p.pid
    FROM pkill_event e
    LEFT JOIN pkill_info p ON e.id = p.event_id AND p.inroom = 1
    LEFT JOIN player_data pd ON p.pid = pd.pid
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY
      CASE p.pk_type
        WHEN 'KILLER' THEN 1
        WHEN 'KILLER-GROUP' THEN 2
        WHEN 'VICTIM' THEN 3
        WHEN 'VICTIM-GROUP' THEN 4
      END,
      p.leader DESC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);

  if (rows.length === 0) {
    return null;
  }

  const firstRow = rows[0];

  const participants: ParticipantInfo[] = rows
    .filter((row) => row.player_description)
    .map((row, index) => ({
      id: row.pid || index, // Use pid or fallback to index
      event_id: firstRow.id,
      pid: row.pid,
      level: row.level,
      pk_type: row.pk_type,
      player_description: row.player_description,
      equip: row.equip,
      log: row.log,
      inroom: row.inroom,
      leader: row.leader,
    }));

  return {
    event: {
      id: firstRow.id,
      stamp: firstRow.stamp,
      room_name: firstRow.room_name,
      room_vnum: firstRow.room_vnum,
      tweeted: false,
    },
    participants,
  };
}

/**
 * Get leaderboard data
 */
export async function getLeaderboard(
  type: 'kills' | 'deaths' | 'kd',
  period: '7d' | '30d' | 'all',
): Promise<LeaderboardEntry[]> {
  let dateFilter = '';

  if (period === '7d') {
    dateFilter = 'AND e.stamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  } else if (period === '30d') {
    dateFilter = 'AND e.stamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
  }

  // Build HAVING clause based on type
  let havingClause = '';
  if (type === 'kills') {
    havingClause = 'HAVING kills > 0';
  } else if (type === 'deaths') {
    havingClause = 'HAVING deaths > 0';
  } else {
    // For K/D ratio, include players with kills (even if they have 0 deaths)
    havingClause = 'HAVING kills > 0';
  }

  const query = `
    SELECT
      p.player_description,
      SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) as kills,
      SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) as deaths,
      CASE
        WHEN SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) = 0
        THEN SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END)
        ELSE SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) /
             SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END)
      END as kd_ratio
    FROM pkill_info p
    JOIN pkill_event e ON p.event_id = e.id
    WHERE 1=1 ${dateFilter}
    GROUP BY p.player_description
    ${havingClause}
    ORDER BY ${type === 'kills' ? 'kills' : type === 'deaths' ? 'deaths' : 'kd_ratio'} DESC
    LIMIT 100
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query);

  return rows.map((row, index) => {
    const kills = Number(row.kills);
    const deaths = Number(row.deaths);
    const kdRatio = Number(row.kd_ratio) || 0;

    // Determine value based on leaderboard type
    let value: number;
    if (type === 'kills') {
      value = kills;
    } else if (type === 'deaths') {
      value = deaths;
    } else {
      value = kdRatio;
    }

    // Extract level, class, and race from player_description
    // Format: "[26 &+cCleric&n&n] Ubak &n &n(&+LOrc&n&n)"
    const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');
    const cleanDesc = stripAnsi(row.player_description);

    // Extract level (strip ANSI)
    const levelMatch = cleanDesc.match(/\[(\d+)/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;

    // Extract class WITH ANSI codes: &+cCleric&n&n
    const classMatch = row.player_description.match(/\[\d+\s+([^\]]+)\]/);
    const charClass = classMatch ? classMatch[1].trim() : '';

    // Extract race WITH ANSI codes: &+LOrc&n&n
    const raceMatch = row.player_description.match(/\(([^)]+)\)/);
    const race = raceMatch ? raceMatch[1].trim() : '';

    return {
      playerName: extractPlayerName(row.player_description),
      level,
      class: charClass,
      race,
      kills,
      deaths,
      kdRatio,
      value,
      rank: index + 1,
    };
  });
}

/**
 * Get player statistics
 */
export async function getPlayerStats(playerName: string): Promise<PlayerStats | null> {
  // Find player by name in player_description and get their latest info
  const statsQuery = `
    SELECT
      SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) as kills,
      SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) as deaths,
      CASE
        WHEN SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) = 0
        THEN SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END)
        ELSE SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) /
             SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END)
      END as kd_ratio,
      (SELECT player_description
       FROM pkill_info p2
       WHERE p2.player_description LIKE ?
       ORDER BY p2.id DESC
       LIMIT 1) as latest_description
    FROM pkill_info p
    WHERE p.player_description LIKE ?
  `;

  const [statsRows] = await pool.query<RowDataPacket[]>(statsQuery, [
    `%] ${playerName}%`,
    `%] ${playerName}%`,
  ]);

  if (statsRows.length === 0 || (statsRows[0].kills === 0 && statsRows[0].deaths === 0)) {
    return null;
  }

  const stats = statsRows[0];

  // Extract level, class, and race from latest player_description
  const playerDesc = stats.latest_description || '';
  const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');
  const cleanDesc = stripAnsi(playerDesc);

  // Extract level
  const levelMatch = cleanDesc.match(/\[(\d+)/);
  const level = levelMatch ? parseInt(levelMatch[1]) : 0;

  // Extract class WITH ANSI codes
  const classMatch = playerDesc.match(/\[\d+\s+([^\]]+)\]/);
  const charClass = classMatch ? classMatch[1].trim() : '';

  // Extract race WITH ANSI codes
  const raceMatch = playerDesc.match(/\(([^)]+)\)/);
  const race = raceMatch ? raceMatch[1].trim() : '';

  // Get recent battles
  const recentQuery = `
    SELECT
      e.id as event_id,
      e.stamp,
      e.room_name,
      p.pk_type,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p2.pk_type != p.pk_type
        THEN p2.player_description END
        SEPARATOR '|||'
      ) as opponents
    FROM pkill_event e
    JOIN pkill_info p ON e.id = p.event_id
    LEFT JOIN pkill_info p2 ON e.id = p2.event_id AND p2.player_description != p.player_description
    WHERE p.player_description LIKE ?
    GROUP BY e.id, e.stamp, e.room_name, p.pk_type
    ORDER BY e.stamp DESC
    LIMIT 10
  `;

  const [recentRows] = await pool.query<RowDataPacket[]>(recentQuery, [`%] ${playerName}%`]);

  const recentBattles: RecentBattle[] = recentRows.map((row) => ({
    event_id: row.event_id,
    stamp: row.stamp,
    room_name: row.room_name,
    result: row.pk_type.includes('KILLER') ? 'KILLER' : 'VICTIM',
    opponents: row.opponents
      ? row.opponents.split('|||').filter(Boolean).map(extractPlayerName)
      : [],
  }));

  // Get most killed by
  const killedByQuery = `
    SELECT
      p2.player_description,
      COUNT(*) as count
    FROM pkill_event e
    JOIN pkill_info p ON e.id = p.event_id AND p.pk_type = 'VICTIM'
    JOIN pkill_info p2 ON e.id = p2.event_id AND p2.pk_type LIKE 'KILLER%'
    WHERE p.player_description LIKE ?
    GROUP BY p2.player_description
    ORDER BY count DESC
    LIMIT 5
  `;

  const [killedByRows] = await pool.query<RowDataPacket[]>(killedByQuery, [`%] ${playerName}%`]);

  const mostKilledBy: OpponentStat[] = killedByRows.map((row) => ({
    opponent_name: extractPlayerName(row.player_description),
    count: row.count,
  }));

  // Get most killed
  const mostKilledQuery = `
    SELECT
      p2.player_description,
      COUNT(*) as count
    FROM pkill_event e
    JOIN pkill_info p ON e.id = p.event_id AND p.pk_type LIKE 'KILLER%'
    JOIN pkill_info p2 ON e.id = p2.event_id AND p2.pk_type = 'VICTIM'
    WHERE p.player_description LIKE ?
    GROUP BY p2.player_description
    ORDER BY count DESC
    LIMIT 5
  `;

  const [mostKilledRows] = await pool.query<RowDataPacket[]>(mostKilledQuery, [
    `%] ${playerName}%`,
  ]);

  const mostKilled: OpponentStat[] = mostKilledRows.map((row) => ({
    opponent_name: extractPlayerName(row.player_description),
    count: row.count,
  }));

  // Capitalize player name
  const capitalizedName = playerName.charAt(0).toUpperCase() + playerName.slice(1).toLowerCase();

  return {
    playerName: capitalizedName,
    level,
    class: charClass,
    race,
    kills: Number(stats.kills) || 0,
    deaths: Number(stats.deaths) || 0,
    kdRatio: Number(stats.kd_ratio) || 0,
    recentBattles: recentBattles,
    mostKilledBy: mostKilledBy,
    mostKilled: mostKilled,
  };
}

/**
 * Search PvP events with advanced filters
 */
export async function searchPvPEvents(
  filters: SearchFilters,
): Promise<{ events: PvPEventListItem[]; total: number }> {
  // For now, use the same implementation as getPvPEvents
  // Can be extended to support additional filters (class, race, level, etc.)
  return getPvPEvents(filters);
}

/**
 * Get location autocomplete suggestions
 */
export async function getLocationAutocomplete(
  query: string,
  page: number = 1,
  limit: number = 20,
): Promise<any[]> {
  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      room_vnum,
      room_name,
      COUNT(*) as battle_count
    FROM pkill_event
    WHERE room_name LIKE ?
    GROUP BY room_vnum, room_name
    ORDER BY battle_count DESC, room_name
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [`%${query}%`, limit, offset]);

  return rows.map((row) => ({
    room_vnum: row.room_vnum,
    room_name: row.room_name,
    battle_count: Number(row.battle_count),
  }));
}

/**
 * Get player autocomplete suggestions
 */
export async function getPlayerAutocomplete(
  query: string,
  page: number = 1,
  limit: number = 20,
): Promise<any[]> {
  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      player_description,
      COUNT(*) as battle_count
    FROM pkill_info
    WHERE player_description LIKE ?
    GROUP BY player_description
    ORDER BY battle_count DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [`%${query}%`, limit, offset]);

  const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');
  const uniquePlayers = new Map<string, any>();

  rows.forEach((row) => {
    const name = extractPlayerName(row.player_description);
    if (name && !uniquePlayers.has(name)) {
      const cleanDesc = stripAnsi(row.player_description);

      // Extract level
      const levelMatch = cleanDesc.match(/\[(\d+)/);
      const level = levelMatch ? parseInt(levelMatch[1]) : 0;

      // Extract class WITH ANSI codes
      const classMatch = row.player_description.match(/\[\d+\s+([^\]]+)\]/);
      const charClass = classMatch ? classMatch[1].trim() : '';

      // Extract race WITH ANSI codes
      const raceMatch = row.player_description.match(/\(([^)]+)\)/);
      const race = raceMatch ? raceMatch[1].trim() : '';

      // Extract name WITH ANSI codes
      const nameWithAnsi = row.player_description.match(
        /\]\s+([^&\s]+(?:\s+[^&(]+)?)\s*(?:&|$|\()/,
      );
      const displayName = nameWithAnsi ? nameWithAnsi[1].trim() : name;

      uniquePlayers.set(name, {
        name: name, // Clean name for filtering
        displayName: displayName, // Name with potential ANSI
        level: level,
        class: charClass, // Class with ANSI
        race: race, // Race with ANSI
      });
    }
  });

  return Array.from(uniquePlayers.values());
}

/**
 * Get latest PvP events (for WebSocket polling)
 */
export async function getLatestEvents(
  limit: number,
  _offset: number,
): Promise<{ events: PvPEventListItem[]; total: number }> {
  return getPvPEvents({ page: 1, limit, date_from: undefined, date_to: undefined });
}

/**
 * Get kill timeline data (daily kill counts)
 */
export async function getKillTimeline(
  period: '7d' | '30d' | '90d' | 'all' = '30d',
): Promise<Array<{ date: string; kills: number }>> {
  // Convert period to days
  const periodDays: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    all: null,
  };

  const days = periodDays[period];

  const sql = days
    ? `
      SELECT
        DATE(stamp) as date,
        COUNT(*) as kills
      FROM pkill_event
      WHERE stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(stamp)
      ORDER BY date ASC
    `
    : `
      SELECT
        DATE(stamp) as date,
        COUNT(*) as kills
      FROM pkill_event
      GROUP BY DATE(stamp)
      ORDER BY date ASC
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [days])
    : await pool.query<RowDataPacket[]>(sql);

  return rows.map((row) => ({
    date: row.date,
    kills: row.kills,
  }));
}

/**
 * Get active hours heatmap (hour of day kill distribution)
 */
export async function getActiveHours(
  period: '7d' | '30d' | '90d' | 'all' = 'all',
): Promise<Array<{ hour: number; kills: number }>> {
  // Convert period to days
  const periodDays: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    all: null,
  };

  const days = periodDays[period];

  const sql = days
    ? `
      SELECT
        HOUR(stamp) as hour,
        COUNT(*) as kills
      FROM pkill_event
      WHERE stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY HOUR(stamp)
      ORDER BY hour ASC
    `
    : `
      SELECT
        HOUR(stamp) as hour,
        COUNT(*) as kills
      FROM pkill_event
      GROUP BY HOUR(stamp)
      ORDER BY hour ASC
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [days])
    : await pool.query<RowDataPacket[]>(sql);

  // Fill in missing hours with 0
  const hourMap = new Map<number, number>();
  rows.forEach((row) => {
    hourMap.set(row.hour, row.kills);
  });

  const result: Array<{ hour: number; kills: number }> = [];
  for (let hour = 0; hour < 24; hour++) {
    result.push({
      hour,
      kills: hourMap.get(hour) || 0,
    });
  }

  return result;
}

/**
 * Get popular locations
 */
export async function getPopularLocations(
  limit: number = 10,
  period: '7d' | '30d' | '90d' | 'all' = 'all',
): Promise<Array<{ location: string; kills: number }>> {
  // Convert period to days
  const periodDays: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    all: null,
  };

  const days = periodDays[period];

  const sql = days
    ? `
      SELECT
        room_name as location,
        COUNT(*) as kills
      FROM pkill_event
      WHERE stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY room_name
      ORDER BY kills DESC
      LIMIT ?
    `
    : `
      SELECT
        room_name as location,
        COUNT(*) as kills
      FROM pkill_event
      GROUP BY room_name
      ORDER BY kills DESC
      LIMIT ?
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [days, limit])
    : await pool.query<RowDataPacket[]>(sql, [limit]);

  return rows.map((row) => ({
    location: row.location,
    kills: row.kills,
  }));
}

/**
 * Get class matchup matrix (simplified version - can be enhanced)
 */
export async function getClassMatchups(period: '7d' | '30d' | '90d' | 'all' = 'all'): Promise<
  Array<{
    killer_class: string;
    victim_class: string;
    wins: number;
  }>
> {
  // Convert period to days
  const periodDays: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    all: null,
  };

  const days = periodDays[period];

  // Get all killer vs victim matchups
  const sql = days
    ? `
      SELECT
        k.player_description as killer_desc,
        v.player_description as victim_desc
      FROM pkill_info k
      JOIN pkill_info v ON k.event_id = v.event_id
      JOIN pkill_event e ON k.event_id = e.id
      WHERE k.pk_type = 'KILLER'
        AND v.pk_type = 'VICTIM'
        AND e.stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      LIMIT 1000
    `
    : `
      SELECT
        k.player_description as killer_desc,
        v.player_description as victim_desc
      FROM pkill_info k
      JOIN pkill_info v ON k.event_id = v.event_id
      WHERE k.pk_type = 'KILLER'
        AND v.pk_type = 'VICTIM'
      LIMIT 1000
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [days])
    : await pool.query<RowDataPacket[]>(sql);

  // Extract class names using JavaScript regex
  const matchups = new Map<string, number>();

  for (const row of rows) {
    // Match pattern like "[56 Crusader] Name" with ANSI codes
    // First strip ANSI codes, then extract class
    const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');

    const killerClean = stripAnsi(row.killer_desc);
    const victimClean = stripAnsi(row.victim_desc);

    const killerMatch = killerClean.match(/\[[\d\s]+([A-Za-z\s]+)\]/);
    const victimMatch = victimClean.match(/\[[\d\s]+([A-Za-z\s]+)\]/);

    if (killerMatch && victimMatch) {
      const killerClass = killerMatch[1].trim();
      const victimClass = victimMatch[1].trim();
      const key = `${killerClass}|${victimClass}`;
      matchups.set(key, (matchups.get(key) || 0) + 1);
    }
  }

  // Convert to array and sort by wins
  const result: Array<{ killer_class: string; victim_class: string; wins: number }> = [];

  for (const [key, wins] of matchups.entries()) {
    const [killerClass, victimClass] = key.split('|');
    result.push({
      killer_class: killerClass,
      victim_class: victimClass,
      wins: wins,
    });
  }

  return result.sort((a, b) => b.wins - a.wins);
}

/**
 * Get MUD client usage statistics
 */
export async function getClientStats(period: '7d' | '30d' | '90d' | 'all' = '30d'): Promise<{
  clients: Array<{
    name: string;
    count: number;
    percentage: number;
    versions: Array<{ version: string; count: number }>;
  }>;
  total: number;
  period: string;
}> {
  const periodDays: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    all: null,
  };

  const days = periodDays[period];

  const sql = days
    ? `
      SELECT client, client_version, COUNT(*) as count
      FROM account_login_history
      WHERE status = 'login'
        AND client IS NOT NULL
        AND client != ''
        AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY client, client_version
      ORDER BY client, count DESC
    `
    : `
      SELECT client, client_version, COUNT(*) as count
      FROM account_login_history
      WHERE status = 'login'
        AND client IS NOT NULL
        AND client != ''
      GROUP BY client, client_version
      ORDER BY client, count DESC
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [days])
    : await pool.query<RowDataPacket[]>(sql);

  // group by client, with versions nested
  const clientMap = new Map<
    string,
    { count: number; versions: Array<{ version: string; count: number }> }
  >();

  for (const row of rows) {
    const client = row.client as string;
    const version = (row.client_version as string) || 'unknown';
    const count = Number(row.count);

    if (!clientMap.has(client)) {
      clientMap.set(client, { count: 0, versions: [] });
    }
    const entry = clientMap.get(client)!;
    entry.count += count;
    entry.versions.push({ version, count });
  }

  const total = Array.from(clientMap.values()).reduce((sum, c) => sum + c.count, 0);

  // sort by total count desc, versions already sorted by count desc from sql
  const clients = Array.from(clientMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => ({
      name,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 1000) / 10 : 0,
      versions: data.versions,
    }));

  return { clients, total, period };
}

// ==================== BATTLE INTERACTIONS ====================

/**
 * Runs a battle-interaction transaction that must tolerate the legacy
 * `pkill_event.stamp` zero-date default.
 *
 * SQL mode is session scoped, so relaxing it and releasing the connection
 * leaks the relaxed mode to unrelated later queries. This captures the exact
 * session value, restores it before release, and discards the connection if
 * restoration fails so a relaxed session is never returned to the pool.
 *
 * Remove once the MUD normalizes the column default. See
 * docs/ARCHITECTURE.md#pooled-session-invariants.
 */
async function withRelaxedSqlMode<T>(run: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  let relaxed = false;

  try {
    const [modeRows] = await connection.query<RowDataPacket[]>(
      'SELECT @@SESSION.sql_mode AS sqlMode',
    );
    const previousSqlMode = String(modeRows[0]?.sqlMode ?? '');

    try {
      await connection.query('SET SESSION sql_mode = ?', ['']);
      relaxed = true;
      return await run(connection);
    } finally {
      if (relaxed) {
        try {
          await connection.query('SET SESSION sql_mode = ?', [previousSqlMode]);
          relaxed = false;
        } catch (error) {
          logger.error('Failed to restore session sql_mode; discarding connection:', error);
        }
      }
    }
  } finally {
    if (relaxed) {
      connection.destroy();
    } else {
      connection.release();
    }
  }
}

/**
 * Add a like to a battle
 */
export async function addBattleLike(eventId: number, accountName: string): Promise<boolean> {
  return withRelaxedSqlMode(async (connection) => {
    try {
      await connection.beginTransaction();

      // Try to insert the like
      await connection.query(
        'INSERT INTO pvp_battle_likes (event_id, account_name) VALUES (?, ?)',
        [eventId, accountName],
      );

      await connection.query('UPDATE pkill_event SET like_count = like_count + 1 WHERE id = ?', [
        eventId,
      ]);

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      if (isErrorWithCode(error) && error.code === 'ER_DUP_ENTRY') {
        return false; // Already liked
      }
      throw error;
    }
  });
}

/**
 * Remove a like from a battle
 */
export async function removeBattleLike(eventId: number, accountName: string): Promise<boolean> {
  return withRelaxedSqlMode(async (connection) => {
    try {
      await connection.beginTransaction();

      // Delete the like
      const [result] = await connection.query<any>(
        'DELETE FROM pvp_battle_likes WHERE event_id = ? AND account_name = ?',
        [eventId, accountName],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return false; // Wasn't liked
      }

      // Decrement like_count
      await connection.query(
        'UPDATE pkill_event SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?',
        [eventId],
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

/**
 * Check if user has liked a battle
 */
export async function hasUserLiked(eventId: number, accountName: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM pvp_battle_likes WHERE event_id = ? AND account_name = ?',
    [eventId, accountName],
  );
  return rows.length > 0;
}

/**
 * Add a favorite to a battle
 */
export async function addBattleFavorite(eventId: number, accountName: string): Promise<boolean> {
  try {
    await pool.query('INSERT INTO pvp_battle_favorites (event_id, account_name) VALUES (?, ?)', [
      eventId,
      accountName,
    ]);
    return true;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ER_DUP_ENTRY') {
      return false; // Already favorited
    }
    throw error;
  }
}

/**
 * Remove a favorite from a battle
 */
export async function removeBattleFavorite(eventId: number, accountName: string): Promise<boolean> {
  const [result] = await pool.query<any>(
    'DELETE FROM pvp_battle_favorites WHERE event_id = ? AND account_name = ?',
    [eventId, accountName],
  );
  return result.affectedRows > 0;
}

/**
 * Check if user has favorited a battle
 */
export async function hasUserFavorited(eventId: number, accountName: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM pvp_battle_favorites WHERE event_id = ? AND account_name = ?',
    [eventId, accountName],
  );
  return rows.length > 0;
}

/**
 * Get battle interaction stats
 */
export async function getBattleInteractionStats(
  eventId: number,
  accountName?: string,
): Promise<PvPBattleStats> {
  // Get like and comment counts from the event table
  const [eventRows] = await pool.query<RowDataPacket[]>(
    'SELECT like_count, comment_count FROM pkill_event WHERE id = ?',
    [eventId],
  );

  const likeCount = eventRows[0]?.like_count || 0;
  const commentCount = eventRows[0]?.comment_count || 0;

  let userLiked = false;
  let userFavorited = false;

  if (accountName) {
    userLiked = await hasUserLiked(eventId, accountName);
    userFavorited = await hasUserFavorited(eventId, accountName);
  }

  return {
    likeCount,
    commentCount,
    userLiked,
    userFavorited,
  };
}

/**
 * Get user's favorited battles
 */
export async function getUserFavorites(
  accountName: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ data: PvPFavorite[]; total: number }> {
  const offset = (page - 1) * limit;

  // Get total count
  const [countRows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as total FROM pvp_battle_favorites WHERE account_name = ?',
    [accountName],
  );
  const total = countRows[0].total;

  // Get favorites with battle details
  const query = `
    SELECT
      f.event_id,
      f.created_at as favorited_at,
      e.stamp,
      e.room_name,
      e.room_vnum,
      e.like_count,
      e.comment_count,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'KILLER%'
        THEN p.player_description END
        SEPARATOR '|||'
      ) as killers,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'VICTIM%'
        THEN p.player_description END
        SEPARATOR '|||'
      ) as victims
    FROM pvp_battle_favorites f
    JOIN pkill_event e ON f.event_id = e.id
    LEFT JOIN pkill_info p ON e.id = p.event_id
    WHERE f.account_name = ?
    GROUP BY f.event_id, f.created_at, e.stamp, e.room_name, e.room_vnum, e.like_count, e.comment_count
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [accountName, limit, offset]);

  const data: PvPFavorite[] = rows.map((row) => ({
    eventId: row.event_id,
    stamp: row.stamp,
    roomName: row.room_name,
    roomVnum: row.room_vnum,
    killers: row.killers ? row.killers.split('|||').filter(Boolean) : [],
    victims: row.victims ? row.victims.split('|||').filter(Boolean) : [],
    likeCount: row.like_count,
    commentCount: row.comment_count,
    favoritedAt: row.favorited_at,
  }));

  return { data, total };
}

// ==================== BATTLE COMMENTS ====================

/**
 * Get comments for a battle
 */
export async function getBattleComments(eventId: number): Promise<PvPBattleComment[]> {
  const query = `
    SELECT
      c.id,
      c.event_id,
      c.account_name,
      c.character_pid,
      c.content,
      c.parent_id,
      c.is_deleted,
      c.created_at,
      c.updated_at,
      c.quoted_text,
      c.line_number,
      c.participant_id,
      fl.char_name as character_name,
      fl.race as character_race,
      fl.class as character_class,
      fl.level as character_level
    FROM pvp_battle_comments c
    LEFT JOIN frag_leaderboard fl ON c.character_pid = fl.pid
    WHERE c.event_id = ?
    ORDER BY c.created_at ASC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [eventId]);

  // Build threaded structure
  const commentsMap = new Map<number, PvPBattleComment>();
  const topLevelComments: PvPBattleComment[] = [];

  for (const row of rows) {
    const comment: PvPBattleComment = {
      id: row.id,
      eventId: row.event_id,
      accountName: row.account_name,
      characterPid: row.character_pid,
      characterName: row.character_name,
      characterRace: row.character_race,
      characterClass: row.character_class,
      characterLevel: row.character_level,
      content: row.is_deleted ? '[deleted]' : row.content,
      parentId: row.parent_id,
      isDeleted: row.is_deleted,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : `${String(row.created_at).replace(' ', 'T')}Z`,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : `${String(row.updated_at).replace(' ', 'T')}Z`,
      quotedText: row.quoted_text,
      lineNumber: row.line_number,
      participantId: row.participant_id,
      replies: [],
    };

    commentsMap.set(comment.id, comment);

    if (comment.parentId === null) {
      topLevelComments.push(comment);
    }
  }

  // Attach replies to their parents (single level only)
  for (const row of rows) {
    if (row.parent_id !== null) {
      const parent = commentsMap.get(row.parent_id);
      const comment = commentsMap.get(row.id);
      if (parent && comment) {
        parent.replies!.push(comment);
      }
    }
  }

  return topLevelComments;
}

/**
 * Create a comment on a battle
 */
export async function createBattleComment(
  eventId: number,
  accountName: string,
  content: string,
  characterPid?: number,
  parentId?: number,
  quotedText?: string,
  lineNumber?: number,
  participantId?: number,
): Promise<PvPBattleComment> {
  return withRelaxedSqlMode(async (connection) => {
    let committed = false;
    try {
      await connection.beginTransaction();

      // Insert the comment
      const [result] = await connection.query<any>(
        `INSERT INTO pvp_battle_comments (event_id, account_name, character_pid, content, parent_id, quoted_text, line_number, participant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          accountName,
          characterPid || null,
          content,
          parentId || null,
          quotedText || null,
          lineNumber || null,
          participantId || null,
        ],
      );

      const commentId = result.insertId;

      // Increment comment_count
      await connection.query(
        'UPDATE pkill_event SET comment_count = comment_count + 1 WHERE id = ?',
        [eventId],
      );

      await connection.commit();
      committed = true;

      // Fetch the created comment with character info using the same connection
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT
            c.id, c.event_id, c.account_name, c.character_pid, c.content, c.parent_id,
            c.is_deleted, c.created_at, c.updated_at, c.quoted_text, c.line_number, c.participant_id,
            fl.char_name as character_name, fl.race as character_race,
            fl.class as character_class, fl.level as character_level
          FROM pvp_battle_comments c
          LEFT JOIN frag_leaderboard fl ON c.character_pid = fl.pid
          WHERE c.id = ?`,
        [commentId],
      );

      const row = rows[0];
      return {
        id: row.id,
        eventId: row.event_id,
        accountName: row.account_name,
        characterPid: row.character_pid,
        characterName: row.character_name,
        characterRace: row.character_race,
        characterClass: row.character_class,
        characterLevel: row.character_level,
        content: row.content,
        parentId: row.parent_id,
        isDeleted: row.is_deleted,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : `${String(row.created_at).replace(' ', 'T')}Z`,
        updatedAt:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : `${String(row.updated_at).replace(' ', 'T')}Z`,
        quotedText: row.quoted_text,
        lineNumber: row.line_number,
        participantId: row.participant_id,
        replies: [],
      };
    } catch (error) {
      if (!committed) {
        await connection.rollback();
      }
      throw error;
    }
  });
}

/**
 * Update a comment
 */
export async function updateBattleComment(
  commentId: number,
  accountName: string,
  content: string,
): Promise<boolean> {
  const [result] = await pool.query<any>(
    `UPDATE pvp_battle_comments
     SET content = ?, updated_at = NOW()
     WHERE id = ? AND account_name = ? AND is_deleted = FALSE`,
    [content, commentId, accountName],
  );
  return result.affectedRows > 0;
}

/**
 * Soft delete a comment
 */
export async function deleteBattleComment(
  commentId: number,
  accountName: string,
  isModerator: boolean,
): Promise<boolean> {
  let query: string;
  let params: any[];

  if (isModerator) {
    // Moderators can delete any comment
    query = `UPDATE pvp_battle_comments SET is_deleted = TRUE, updated_at = NOW() WHERE id = ?`;
    params = [commentId];
  } else {
    // Regular users can only delete their own comments
    query = `UPDATE pvp_battle_comments SET is_deleted = TRUE, updated_at = NOW()
             WHERE id = ? AND account_name = ?`;
    params = [commentId, accountName];
  }

  const [result] = await pool.query<any>(query, params);
  return result.affectedRows > 0;
}

/**
 * Get comment by ID (for authorization checks)
 */
export async function getBattleCommentById(
  commentId: number,
): Promise<{ eventId: number; accountName: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT event_id, account_name FROM pvp_battle_comments WHERE id = ?',
    [commentId],
  );
  if (rows.length === 0) return null;
  return {
    eventId: rows[0].event_id,
    accountName: rows[0].account_name,
  };
}

import type { PvpCursor } from './pvpPolling.js';
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
import { extractPlayerName, stripAnsiCodes } from '../utils/stringUtils.js';
import { AppError } from '../middleware/errorHandler.js';
import { getWebSettings } from './webSettingsService.js';
import {
  getPvpDelayMinutes,
  pvpVisibilitySql,
  requireVisiblePvpEvent,
  pvpTimestamp,
} from './pvpVisibility.js';

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
  const queryParams: (string | number)[] = [];
  const participantConditions: string[] = [];
  const participantParams: (string | number)[] = [];

  // Get PvP delay setting
  const webSettings = await getWebSettings();
  const pvpDelayMinutes = webSettings.pvpDelayMinutes || 0;

  whereConditions.push(pvpVisibilitySql());
  queryParams.push(pvpDelayMinutes);

  // Apply filters
  if (filters.player) {
    participantConditions.push('matched.player_description LIKE ?');
    participantParams.push(`%${filters.player}%`);
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
    whereConditions.push('e.stamp < DATE_ADD(?, INTERVAL 1 DAY)');
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
  const strippedDesc = stripAnsiSQL('matched.player_description');

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
      participantConditions.push(`(${classConditions.join(' OR ')})`);
      classes.forEach((cls) => {
        // Match class name after level number in brackets, e.g., "[56 Warrior]"
        participantParams.push(`%[% ${cls}]%`);
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
      participantConditions.push(`(${raceConditions.join(' OR ')})`);
      races.forEach((race) => {
        // Match race name in parentheses, e.g., "(Githzerai)"
        participantParams.push(`%(${race})%`);
      });
    }
  }

  // The numeric snapshot also exists on historical name-only records.
  if (searchFilters.level_min !== undefined && searchFilters.level_min > 1) {
    participantConditions.push('matched.level >= ?');
    participantParams.push(searchFilters.level_min);
  }
  if (searchFilters.level_max !== undefined && searchFilters.level_max < 56) {
    participantConditions.push('matched.level <= ?');
    participantParams.push(searchFilters.level_max);
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
      participantConditions.push(`(${alignConditions.join(' OR ')})`);
      racesToMatch.forEach((race) => {
        participantParams.push(`%(${race})%`);
      });
    }
  }

  if (participantConditions.length) {
    whereConditions.push(`EXISTS (SELECT 1 FROM pkill_info matched
      WHERE matched.event_id = e.id AND matched.inroom = 1
      AND ${participantConditions.join(' AND ')})`);
    queryParams.push(...participantParams);
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(DISTINCT e.id) as total
    FROM pkill_event e
    ${whereClause}
  `;

  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total;

  const orderBy =
    filters.sort_by === 'likes'
      ? 'e.like_count DESC, e.stamp DESC, e.id DESC'
      : 'e.stamp DESC, e.id DESC';
  return {
    events: await readEventSummaries(whereClause, queryParams, orderBy, limit, offset),
    total,
  };
}

/** Shared projection without the public pagination count query. */
async function readEventSummaries(
  whereClause: string,
  queryParams: (string | number)[],
  orderBy:
    | 'e.stamp DESC, e.id DESC'
    | 'e.stamp ASC, e.id ASC'
    | 'e.like_count DESC, e.stamp DESC, e.id DESC',
  limit: number,
  offset = 0,
): Promise<PvPEventListItem[]> {
  // Get paginated events
  const query = `
    SELECT
      e.id,
      e.stamp,
      UNIX_TIMESTAMP(e.stamp) AS stamp_epoch,
      e.room_name,
      e.room_vnum,
      e.like_count,
      e.comment_count,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'KILLER%'
        THEN CONCAT(p.player_description, '<<>>', IF(p.leader, '1', '0'), '<<>>', p.level) END
        SEPARATOR '|||'
      ) as killers,
      GROUP_CONCAT(
        DISTINCT CASE WHEN p.pk_type LIKE 'VICTIM%'
        THEN CONCAT(p.player_description, '<<>>', IF(p.leader, '1', '0'), '<<>>', IF(p.pk_type = 'VICTIM', '1', '0'), '<<>>', p.level) END
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
        const [description, leaderFlag, level] = entry.split('<<>>');
        return { description, isLeader: leaderFlag === '1', level: Number(level) || 0 };
      });
  };

  const parseVictims = (data: string | null) => {
    if (!data) return [];
    return data
      .split('|||')
      .filter(Boolean)
      .map((entry) => {
        const [description, leaderFlag, diedFlag, level] = entry.split('<<>>');
        return {
          description,
          isLeader: leaderFlag === '1',
          died: diedFlag === '1',
          level: Number(level) || 0,
        };
      });
  };

  const events: PvPEventListItem[] = rows.map((row) => ({
    id: row.id,
    stamp: pvpTimestamp(row.stamp_epoch),
    room_name: row.room_name,
    room_vnum: row.room_vnum,
    killers: parseKillers(row.killers),
    victims: parseVictims(row.victims),
    killer_count: row.killers ? row.killers.split('|||').filter(Boolean).length : 0,
    victim_count: row.victims ? row.victims.split('|||').filter(Boolean).length : 0,
    like_count: row.like_count || 0,
    comment_count: row.comment_count || 0,
  }));

  return events;
}

/** Shared by snapshots and stored quotes. A legacy schema never grants publication. */
async function pvpPublicationSql(respectWebinfo: boolean): Promise<string> {
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pkill_info'
       AND COLUMN_NAME = 'webinfo_at_capture'`,
  );
  if (columns.length === 0) return "'unavailable'";

  return `CASE
    WHEN p.webinfo_at_capture = 0 THEN 'private'
    WHEN p.webinfo_at_capture IS NULL OR p.webinfo_at_capture != 1 THEN 'unavailable'
    ${
      respectWebinfo
        ? `WHEN pd.act2 IS NULL THEN 'unavailable'
    WHEN (pd.act2 & 134217728) = 0 THEN 'private'`
        : ''
    }
    ELSE 'public' END`;
}

async function pvpQuoteSelectSql(): Promise<string> {
  const settings = await getWebSettings();
  const publication = await pvpPublicationSql(settings.respectWebinfoToggle);
  const permitted = `c.is_deleted = 0 AND EXISTS (
    SELECT 1 FROM pkill_info p LEFT JOIN player_data pd ON pd.pid = p.pid
    WHERE p.event_id = c.event_id AND p.pid = c.participant_id AND p.inroom = 1
      AND (${publication}) = 'public'
  )`;
  return ['quoted_text', 'line_number', 'participant_id']
    .map((field) => `CASE WHEN ${permitted} THEN c.${field} ELSE NULL END AS ${field}`)
    .join(', ');
}

/** Get battle metadata and only those snapshots eligible for publication. */
export async function getPvPEventDetail(eventId: number): Promise<PvPEventDetail | null> {
  // Get settings
  const webSettings = await getWebSettings();
  const pvpDelayMinutes = webSettings.pvpDelayMinutes || 0;
  const publication = await pvpPublicationSql(webSettings.respectWebinfoToggle);

  // Build WHERE clause with delay filter
  const whereConditions = ['e.id = ?'];
  const queryParams = [eventId, pvpDelayMinutes];
  whereConditions.push(pvpVisibilitySql());

  const query = `
    SELECT
      e.id,
      e.stamp,
      UNIX_TIMESTAMP(e.stamp) AS stamp_epoch,
      e.room_name,
      e.room_vnum,
      p.player_description,
      p.pk_type,
      p.level,
      ${publication} AS pov_status,
      CASE WHEN (${publication}) = 'public' THEN p.equip ELSE NULL END AS equip,
      CASE WHEN (${publication}) = 'public' THEN p.log ELSE NULL END AS log,
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
      pov_status: row.pov_status,
      equip: row.equip,
      log: row.log,
      inroom: row.inroom,
      leader: row.leader,
    }));

  return {
    event: {
      id: firstRow.id,
      stamp: pvpTimestamp(firstRow.stamp_epoch),
      room_name: firstRow.room_name,
      room_vnum: firstRow.room_vnum,
      tweeted: false,
    },
    participants,
  };
}

/** Extract the exact snapshot name, including legacy name-only records. */
function playerNameSql(alias: 'p' | 'p2'): string {
  const plain = `TRIM(REGEXP_REPLACE(${alias}.player_description, '&=[a-zA-Z]{2}|&[+-][a-zA-Z*]|&[nN]', ''))`;
  return `REGEXP_SUBSTR(TRIM(SUBSTRING_INDEX(${plain}, ']', -1)), '^[[:alnum:]_]+')`;
}

function playerIdentitySql(alias: 'p' | 'p2'): string {
  return `CASE WHEN ${alias}.pid > 0 THEN CONCAT('pid:', ${alias}.pid)
    ELSE CONCAT('name:', LOWER(${playerNameSql(alias)})) END`;
}

/**
 * Get leaderboard data
 */
export async function getLeaderboard(
  type: 'kills' | 'deaths' | 'kd',
  period: '7d' | '30d' | 'all',
): Promise<LeaderboardEntry[]> {
  const delay = await getPvpDelayMinutes();
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
    WITH visible AS (
      SELECT p.*, ${playerIdentitySql('p')} AS identity_key,
        ROW_NUMBER() OVER (PARTITION BY ${playerIdentitySql('p')} ORDER BY e.stamp DESC, p.id DESC) AS snapshot_rank
      FROM pkill_info p JOIN pkill_event e ON p.event_id = e.id
      WHERE ${pvpVisibilitySql()} ${dateFilter}
    )
    SELECT
      MAX(CASE WHEN p.snapshot_rank = 1 THEN p.player_description END) AS player_description,
      MAX(CASE WHEN p.snapshot_rank = 1 THEN p.level END) AS level,
      SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) as kills,
      SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) as deaths,
      CASE
        WHEN SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END) = 0
        THEN SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END)
        ELSE SUM(CASE WHEN p.pk_type LIKE 'KILLER%' THEN 1 ELSE 0 END) /
             SUM(CASE WHEN p.pk_type = 'VICTIM' THEN 1 ELSE 0 END)
      END as kd_ratio
    FROM visible p
    GROUP BY p.identity_key
    ${havingClause}
    ORDER BY ${type === 'kills' ? 'kills' : type === 'deaths' ? 'deaths' : 'kd_ratio'} DESC, p.identity_key
    LIMIT 100
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [delay]);

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
    const levelMatch = cleanDesc.match(/\[\s*(\d+)/);
    const level = Number(row.level) || (levelMatch ? parseInt(levelMatch[1]) : 0);

    // Extract class WITH ANSI codes: &+cCleric&n&n
    const classMatch = row.player_description.match(/\[\s*\d+\s+([^\]]+)\]/);
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
  const delay = await getPvpDelayMinutes();
  const [identities] = await pool.query<RowDataPacket[]>(
    `SELECT p.pid, p.player_description, p.level FROM pkill_info p
     JOIN pkill_event e ON p.event_id = e.id
     WHERE ${playerNameSql('p')} = ? AND ${pvpVisibilitySql()}
     ORDER BY e.stamp DESC, p.id DESC LIMIT 1`,
    [playerName, delay],
  );
  if (!identities.length) return null;
  const identity = identities[0];
  const playerPredicate = Number(identity.pid) > 0 ? 'p.pid = ?' : `${playerNameSql('p')} = ?`;
  const nameParams = [Number(identity.pid) > 0 ? Number(identity.pid) : playerName];
  const [statsRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       SUM(p.pk_type LIKE 'KILLER%') AS kills,
       SUM(p.pk_type = 'VICTIM') AS deaths,
       SUM(p.pk_type LIKE 'KILLER%') / GREATEST(SUM(p.pk_type = 'VICTIM'), 1) AS kd_ratio
     FROM pkill_info p JOIN pkill_event e ON p.event_id = e.id
     WHERE ${playerPredicate} AND ${pvpVisibilitySql()}`,
    [...nameParams, delay],
  );

  if (statsRows.length === 0 || (!Number(statsRows[0].kills) && !Number(statsRows[0].deaths))) {
    return null;
  }

  const stats = statsRows[0];

  // Extract level, class, and race from latest player_description
  const playerDesc = identity.player_description || '';
  const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');
  const cleanDesc = stripAnsi(playerDesc);

  // Extract level
  const levelMatch = cleanDesc.match(/\[\s*(\d+)/);
  const level = Number(identity.level) || (levelMatch ? parseInt(levelMatch[1]) : 0);

  // Extract class WITH ANSI codes
  const classMatch = playerDesc.match(/\[\s*\d+\s+([^\]]+)\]/);
  const charClass = classMatch ? classMatch[1].trim() : '';

  // Extract race WITH ANSI codes
  const raceMatch = playerDesc.match(/\(([^)]+)\)/);
  const race = raceMatch ? raceMatch[1].trim() : '';

  // Get recent battles
  const recentQuery = `
    SELECT
      e.id as event_id,
      e.stamp,
      UNIX_TIMESTAMP(e.stamp) AS stamp_epoch,
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
    WHERE ${playerPredicate} AND ${pvpVisibilitySql()}
    GROUP BY e.id, e.stamp, e.room_name, p.pk_type
    ORDER BY e.stamp DESC
    LIMIT 10
  `;

  const [recentRows] = await pool.query<RowDataPacket[]>(recentQuery, [...nameParams, delay]);

  const recentBattles: RecentBattle[] = recentRows.map((row) => ({
    event_id: row.event_id,
    stamp: pvpTimestamp(row.stamp_epoch),
    room_name: row.room_name,
    result: row.pk_type.includes('KILLER') ? 'KILLER' : 'VICTIM',
    opponents: row.opponents
      ? row.opponents.split('|||').filter(Boolean).map(extractPlayerName)
      : [],
  }));

  // Get most killed by
  const killedByQuery = `
    SELECT
      MAX(p2.player_description) AS player_description,
      COUNT(*) as count
    FROM pkill_event e
    JOIN pkill_info p ON e.id = p.event_id AND p.pk_type = 'VICTIM'
    JOIN pkill_info p2 ON e.id = p2.event_id AND p2.pk_type LIKE 'KILLER%'
    WHERE ${playerPredicate} AND ${pvpVisibilitySql()}
    GROUP BY ${playerIdentitySql('p2')}
    ORDER BY count DESC
    LIMIT 5
  `;

  const [killedByRows] = await pool.query<RowDataPacket[]>(killedByQuery, [...nameParams, delay]);

  const mostKilledBy: OpponentStat[] = killedByRows.map((row) => ({
    opponent_name: extractPlayerName(row.player_description),
    count: row.count,
  }));

  // Get most killed
  const mostKilledQuery = `
    SELECT
      MAX(p2.player_description) AS player_description,
      COUNT(*) as count
    FROM pkill_event e
    JOIN pkill_info p ON e.id = p.event_id AND p.pk_type LIKE 'KILLER%'
    JOIN pkill_info p2 ON e.id = p2.event_id AND p2.pk_type = 'VICTIM'
    WHERE ${playerPredicate} AND ${pvpVisibilitySql()}
    GROUP BY ${playerIdentitySql('p2')}
    ORDER BY count DESC
    LIMIT 5
  `;

  const [mostKilledRows] = await pool.query<RowDataPacket[]>(mostKilledQuery, [
    ...nameParams,
    delay,
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
  const delay = await getPvpDelayMinutes();
  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      room_vnum,
      room_name,
      COUNT(*) as battle_count
    FROM pkill_event e
    WHERE room_name LIKE ? AND ${pvpVisibilitySql()}
    GROUP BY room_vnum, room_name
    ORDER BY battle_count DESC, room_name
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [`%${query}%`, delay, limit, offset]);

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
  const delay = await getPvpDelayMinutes();
  const offset = (page - 1) * limit;

  const sql = `
    WITH visible AS (
      SELECT p.*, ${playerIdentitySql('p')} AS identity_key,
        ROW_NUMBER() OVER (PARTITION BY ${playerIdentitySql('p')} ORDER BY e.stamp DESC, p.id DESC) AS snapshot_rank
      FROM pkill_info p JOIN pkill_event e ON p.event_id = e.id
      WHERE ${playerNameSql('p')} LIKE ? AND ${pvpVisibilitySql()}
    )
    SELECT MAX(CASE WHEN snapshot_rank = 1 THEN player_description END) AS player_description,
      MAX(CASE WHEN snapshot_rank = 1 THEN level END) AS level,
      COUNT(*) AS battle_count
    FROM visible
    GROUP BY identity_key
    ORDER BY battle_count DESC, identity_key
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [`%${query}%`, delay, limit, offset]);

  const stripAnsi = (str: string) => str.replace(/&[+nNL]?[a-zA-Z]/g, '');
  const uniquePlayers = new Map<string, any>();

  rows.forEach((row) => {
    const name = extractPlayerName(row.player_description);
    if (name && !uniquePlayers.has(name)) {
      const cleanDesc = stripAnsi(row.player_description);

      // Extract level
      const levelMatch = cleanDesc.match(/\[\s*(\d+)/);
      const level = Number(row.level) || (levelMatch ? parseInt(levelMatch[1]) : 0);

      // Extract class WITH ANSI codes
      const classMatch = row.player_description.match(/\[\s*\d+\s+([^\]]+)\]/);
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

/** Startup cursor for live browser notifications; Discord uses durable delivery state. */
export async function getLatestReleasedEvent(): Promise<PvPEventListItem | undefined> {
  return (
    await readEventSummaries(
      `WHERE ${pvpVisibilitySql()}`,
      [await getPvpDelayMinutes()],
      'e.stamp DESC, e.id DESC',
      1,
    )
  )[0];
}

/** Read every newly released event without computing the full pagination count. */
export async function getReleasedEventsAfter(
  cursor: PvpCursor,
  limit: number,
): Promise<PvPEventListItem[]> {
  const epoch = new Date(cursor.stamp).getTime() / 1000;
  return readEventSummaries(
    `WHERE ${pvpVisibilitySql()} AND (e.stamp > FROM_UNIXTIME(?) OR (e.stamp = FROM_UNIXTIME(?) AND e.id > ?))`,
    [await getPvpDelayMinutes(), epoch, epoch, cursor.id],
    'e.stamp ASC, e.id ASC',
    Math.min(100, Math.max(1, limit)),
  );
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
  const delay = await getPvpDelayMinutes();

  const sql = days
    ? `
      SELECT
        DATE(stamp) as date,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()} AND stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(stamp)
      ORDER BY date ASC
    `
    : `
      SELECT
        DATE(stamp) as date,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()}
      GROUP BY DATE(stamp)
      ORDER BY date ASC
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [delay, days])
    : await pool.query<RowDataPacket[]>(sql, [delay]);

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
  const delay = await getPvpDelayMinutes();

  const sql = days
    ? `
      SELECT
        HOUR(stamp) as hour,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()} AND stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY HOUR(stamp)
      ORDER BY hour ASC
    `
    : `
      SELECT
        HOUR(stamp) as hour,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()}
      GROUP BY HOUR(stamp)
      ORDER BY hour ASC
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [delay, days])
    : await pool.query<RowDataPacket[]>(sql, [delay]);

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
  const delay = await getPvpDelayMinutes();

  const sql = days
    ? `
      SELECT
        room_name as location,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()} AND stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY room_name
      ORDER BY kills DESC
      LIMIT ?
    `
    : `
      SELECT
        room_name as location,
        COUNT(*) as kills
      FROM pkill_event e
      WHERE ${pvpVisibilitySql()}
      GROUP BY room_name
      ORDER BY kills DESC
      LIMIT ?
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [delay, days, limit])
    : await pool.query<RowDataPacket[]>(sql, [delay, limit]);

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
  const delay = await getPvpDelayMinutes();

  // Get all killer vs victim matchups
  const sql = days
    ? `
      SELECT
        k.player_description as killer_desc,
        v.player_description as victim_desc
      FROM pkill_info k
      JOIN pkill_info v ON k.event_id = v.event_id
      JOIN pkill_event e ON k.event_id = e.id
      WHERE ${pvpVisibilitySql()} AND k.pk_type = 'KILLER'
        AND v.pk_type = 'VICTIM'
        AND e.stamp >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `
    : `
      SELECT
        k.player_description as killer_desc,
        v.player_description as victim_desc
      FROM pkill_info k
      JOIN pkill_info v ON k.event_id = v.event_id
      JOIN pkill_event e ON k.event_id = e.id
      WHERE ${pvpVisibilitySql()} AND k.pk_type = 'KILLER'
        AND v.pk_type = 'VICTIM'
    `;

  const [rows] = days
    ? await pool.query<RowDataPacket[]>(sql, [delay, days])
    : await pool.query<RowDataPacket[]>(sql, [delay]);

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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  await requireVisiblePvpEvent(eventId);
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
  const delay = await getPvpDelayMinutes();
  const offset = (page - 1) * limit;

  // Get total count
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM pvp_battle_favorites f
     JOIN pkill_event e ON f.event_id = e.id
     WHERE f.account_name = ? AND ${pvpVisibilitySql()}`,
    [accountName, delay],
  );
  const total = countRows[0].total;

  // Get favorites with battle details
  const query = `
    SELECT
      f.event_id,
      f.created_at as favorited_at,
      e.stamp,
      UNIX_TIMESTAMP(e.stamp) AS stamp_epoch,
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
    WHERE f.account_name = ? AND ${pvpVisibilitySql()}
    GROUP BY f.event_id, f.created_at, e.stamp, e.room_name, e.room_vnum, e.like_count, e.comment_count
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [accountName, delay, limit, offset]);

  const data: PvPFavorite[] = rows.map((row) => ({
    eventId: row.event_id,
    stamp: pvpTimestamp(row.stamp_epoch),
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
  await requireVisiblePvpEvent(eventId);
  const quoteSelect = await pvpQuoteSelectSql();
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
      ${quoteSelect},
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
  await requireVisiblePvpEvent(eventId);
  if (quotedText !== undefined || lineNumber !== undefined || participantId !== undefined) {
    const battle = await getPvPEventDetail(eventId);
    const participant = battle?.participants.find((p) => p.id === participantId);
    if (participant?.pov_status !== 'public' || !participant.log) {
      throw new AppError('This point of view is not available for quoting', 400);
    }
    const line =
      typeof lineNumber === 'number' && Number.isSafeInteger(lineNumber) && lineNumber > 0
        ? participant.log.replace(/\r/g, '').split('\n')[lineNumber - 1]
        : undefined;
    if (line === undefined) throw new AppError('Invalid quoted line', 400);
    // The client supplies a location, never authoritative log text.
    quotedText = stripAnsiCodes(line).slice(0, 500);
  }
  const quoteSelect = await pvpQuoteSelectSql();
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
            c.is_deleted, c.created_at, c.updated_at, ${quoteSelect},
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
  if (!(await getBattleCommentById(commentId))) return false;
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
  if (!(await getBattleCommentById(commentId))) return false;
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
  const delay = await getPvpDelayMinutes();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.event_id, c.account_name FROM pvp_battle_comments c
     JOIN pkill_event e ON c.event_id = e.id
     WHERE c.id = ? AND ${pvpVisibilitySql()}`,
    [commentId, delay],
  );
  if (rows.length === 0) return null;
  return {
    eventId: rows[0].event_id,
    accountName: rows[0].account_name,
  };
}

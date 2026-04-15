/**
 * database-backed guild service
 * replaces flat-file parsing with mysql queries
 */
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';
import type { RowDataPacket } from 'mysql2';

// interfaces for backwards compatibility with mudGuildParser
export interface GuildData {
  guildId: number;
  name: string;
  racewar: number;
  frags: number;
  rankTitles: {
    enemy: string;
    onParole: string;
    member: string;
    senior: string;
    officer: string;
    deputy: string;
    leader: string;
    king: string;
  };
  members: Array<{
    name: string;
    rank: number;
    bits: number;
    debt: number;
  }>;
}

export interface CharacterGuildInfo {
  guildId: number;
  guildName: string;
  rankTitle: string;
  rankNumber: number;
}

// rank index to field name mapping (guild_ranks uses rank_index 0-7)
const RANK_INDEX_MAP = ['enemy', 'onParole', 'member', 'senior', 'officer', 'deputy', 'leader', 'king'] as const;

// db row interfaces
interface GuildRow extends RowDataPacket {
  id: number;
  name: string;
  racewar: number;
  frags: number;
}

interface GuildRankRow extends RowDataPacket {
  rank_index: number;
  title: string;
}

interface GuildMemberRow extends RowDataPacket {
  player_name: string;
  bits: number;
  debt: number;
}

interface GuildListRow extends RowDataPacket {
  id: number;
  name: string;
}

interface GuildSearchRow extends RowDataPacket {
  guild: string;
}

interface MemberGuildRow extends RowDataPacket {
  id: number;
  name: string;
  bits: number;
}

// bit mask for extracting rank from member bits
const A_RK_MASK = 0x1C;

/**
 * get guild data from database
 * takes the guild id from guilds.id
 * returns null if guild doesn't exist
 */
export async function getGuild(guildId: number): Promise<GuildData | null> {
  try {
    // fetch guild row by id
    const [guildRows] = await pool.query<GuildRow[]>(
      'SELECT id, name, racewar, frags FROM guilds WHERE id = ?',
      [guildId]
    );

    if (guildRows.length === 0) {
      return null;
    }

    const guild = guildRows[0];

    // fetch rank titles for this guild
    const [rankRows] = await pool.query<GuildRankRow[]>(
      'SELECT rank_index, title FROM guild_ranks WHERE guild_id = ? ORDER BY rank_index ASC',
      [guildId]
    );

    // build rank titles object with defaults
    const rankTitles: GuildData['rankTitles'] = {
      enemy: '',
      onParole: '',
      member: '',
      senior: '',
      officer: '',
      deputy: '',
      leader: '',
      king: '',
    };

    for (const row of rankRows) {
      const rankName = RANK_INDEX_MAP[row.rank_index];
      if (rankName) {
        rankTitles[rankName] = row.title;
      }
    }

    // fetch members for this guild
    const [memberRows] = await pool.query<GuildMemberRow[]>(
      'SELECT player_name, bits, debt FROM guild_members WHERE guild_id = ?',
      [guildId]
    );

    // map members to interface, extracting rank from bits
    const members = memberRows.map((row) => {
      const rankLevel = (row.bits & A_RK_MASK) >> 2;
      return {
        name: row.player_name,
        rank: rankLevel,
        bits: row.bits,
        debt: row.debt,
      };
    });

    return {
      guildId: guild.id,
      name: guild.name,
      racewar: guild.racewar,
      frags: guild.frags,
      rankTitles,
      members,
    };
  } catch (error) {
    logger.error(`error fetching guild ${guildId}:`, error);
    return null;
  }
}

/**
 * find guild info for a character by searching all guilds
 * returns null if character is not in any guild
 */
export async function findCharacterGuild(characterName: string): Promise<CharacterGuildInfo | null> {
  const lowerName = characterName.toLowerCase();

  try {
    // directly query for the member and join to get guild info
    const [rows] = await pool.query<MemberGuildRow[]>(
      `SELECT g.id, g.name, gm.bits
       FROM guild_members gm
       JOIN guilds g ON gm.guild_id = g.id
       WHERE LOWER(gm.player_name) = ?
       LIMIT 1`,
      [lowerName]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    // fetch rank titles for this guild
    const guildData = await getGuild(row.id);
    if (!guildData) {
      return null;
    }

    // extract rank level from bits
    const rankLevel = (row.bits & A_RK_MASK) >> 2;
    const rankTitles = [
      guildData.rankTitles.enemy,
      guildData.rankTitles.onParole,
      guildData.rankTitles.member,
      guildData.rankTitles.senior,
      guildData.rankTitles.officer,
      guildData.rankTitles.deputy,
      guildData.rankTitles.leader,
      guildData.rankTitles.king,
    ];
    const rankTitle = rankTitles[rankLevel] || rankTitles[2]; // default to member

    return {
      guildId: row.id,
      guildName: row.name,
      rankTitle,
      rankNumber: rankLevel,
    };
  } catch (error) {
    logger.error(`error finding guild for character '${characterName}':`, error);
    return null;
  }
}

/**
 * get guild information for a specific character from a specific guild
 * backwards compatibility helper
 */
export async function getCharacterGuildInfoFromGuild(
  characterName: string,
  guildId: number
): Promise<CharacterGuildInfo | null> {
  const guildData = await getGuild(guildId);
  if (!guildData) {
    return null;
  }

  // find the character in the member list
  const member = guildData.members.find(
    (m) => m.name.toLowerCase() === characterName.toLowerCase()
  );

  if (!member) {
    return null;
  }

  // map rank number to rank title
  const rankTitles = [
    guildData.rankTitles.enemy,
    guildData.rankTitles.onParole,
    guildData.rankTitles.member,
    guildData.rankTitles.senior,
    guildData.rankTitles.officer,
    guildData.rankTitles.deputy,
    guildData.rankTitles.leader,
    guildData.rankTitles.king,
  ];
  const rankTitle = rankTitles[member.rank] || rankTitles[2]; // default to member

  return {
    guildId: guildData.guildId,
    guildName: guildData.name,
    rankTitle,
    rankNumber: member.rank,
  };
}

/**
 * get all guilds
 * returns array of {id, name}
 */
export async function getAllGuilds(): Promise<Array<{ id: number; name: string }>> {
  try {
    const [rows] = await pool.query<GuildListRow[]>(
      'SELECT id, name FROM guilds ORDER BY name ASC'
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
    }));
  } catch (error) {
    logger.error('error fetching all guilds:', error);
    return [];
  }
}

/**
 * backwards compatibility alias for getGuild
 * matches old function signature
 */
export async function parseGuildFile(guildId: number): Promise<GuildData | null> {
  return getGuild(guildId);
}

/**
 * search guilds for autocomplete
 * queries distinct guild names via associations table
 */
export async function searchGuilds(query: string, limit: number = 20): Promise<string[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  try {
    const [rows] = await pool.execute<GuildSearchRow[]>(
      `SELECT DISTINCT a.name as guild
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       WHERE a.name IS NOT NULL
         AND a.name != ''
         AND a.name LIKE ?
       ORDER BY a.name
       LIMIT ?`,
      [`%${query || ''}%`, safeLimit]
    );

    return rows.map((row) => row.guild);
  } catch (error) {
    logger.error('error searching guilds:', error);
    return [];
  }
}

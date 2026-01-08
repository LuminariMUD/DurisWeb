import fs from 'fs/promises';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import logger, { isErrorWithCode } from '../utils/logger.js';

const MUD_DIR = process.env.MUD_DIR!;
const GUILD_DIR = path.join(MUD_DIR, 'Players', 'Assocs');

export interface GuildData {
  guildId: number;
  name: string; // With ANSI color codes
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
  guildName: string; // With ANSI color codes
  rankTitle: string; // e.g., "Lieutenant", "Leader of"
  rankNumber: number; // 0-7
}

/**
 * Parse a guild file from Players/Assocs/asc.<guild_id>
 */
export async function parseGuildFile(guildId: number): Promise<GuildData | null> {
  try {
    const filePath = path.join(GUILD_DIR, `asc.${guildId}`);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length < 12) {
      logger.error(`Guild file ${filePath} has insufficient lines`);
      return null;
    }

    // Line 1: Guild name (with ANSI codes)
    const name = lines[0].trim();

    // Line 2: guild_id racewar frags
    const [_guildIdStr, racewarStr, fragsStr] = lines[1].trim().split(' ');
    const racewar = parseInt(racewarStr) || 0;
    const frags = parseInt(fragsStr) || 0;

    // Lines 3-10: Rank titles (8 ranks)
    const rankTitles = {
      enemy: lines[2].trim(),       // Enemy of
      onParole: lines[3].trim(),    // On parole,
      member: lines[4].trim(),      // Member of
      senior: lines[5].trim(),      // Senior of
      officer: lines[6].trim(),     // Officer of
      deputy: lines[7].trim(),      // Deputy of
      leader: lines[8].trim(),      // Leader of
      king: lines[9].trim(),        // King of
    };

    // Parse members (after line 12+)
    const members: Array<{ name: string; rank: number; bits: number; debt: number }> = [];
    for (let i = 12; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(' ');
      if (parts.length >= 3) {
        members.push({
          name: parts[0],
          rank: parseInt(parts[1]) || 0,
          bits: parseInt(parts[2]) || 0,
          debt: parseInt(parts[3]) || 0,
        });
      }
    }

    return {
      guildId,
      name,
      racewar,
      frags,
      rankTitles,
      members,
    };
  } catch (error) {
    if (isErrorWithCode(error) && error.code !== 'ENOENT') {
      logger.error(`Error parsing guild file for guild ${guildId}:`, error);
    }
    return null;
  }
}

/**
 * Get guild information for a specific character by searching all guilds
 */
export async function findCharacterGuild(
  characterName: string
): Promise<CharacterGuildInfo | null> {
  try {
    const files = await fs.readdir(GUILD_DIR);
    const guildFiles = files.filter(f => f.startsWith('asc.'));

    for (const file of guildFiles) {
      const guildId = parseInt(file.replace('asc.', ''));
      if (isNaN(guildId)) continue;

      const guildInfo = await getCharacterGuildInfoFromGuild(characterName, guildId);
      if (guildInfo) {
        return guildInfo;
      }
    }

    return null;
  } catch (error) {
    logger.error('Error finding character guild:', error);
    return null;
  }
}

/**
 * Get guild information for a specific character from a specific guild
 */
export async function getCharacterGuildInfoFromGuild(
  characterName: string,
  guildId: number
): Promise<CharacterGuildInfo | null> {
  const guildData = await parseGuildFile(guildId);
  if (!guildData) {
    return null;
  }

  // Find the character in the member list
  const member = guildData.members.find(
    m => m.name.toLowerCase() === characterName.toLowerCase()
  );

  if (!member) {
    return null;
  }

  // Map rank number to rank title
  const rankTitles = [
    guildData.rankTitles.enemy,       // 0
    guildData.rankTitles.onParole,    // 1
    guildData.rankTitles.member,      // 2
    guildData.rankTitles.senior,      // 3
    guildData.rankTitles.officer,     // 4
    guildData.rankTitles.deputy,      // 5
    guildData.rankTitles.leader,      // 6
    guildData.rankTitles.king,        // 7
  ];

  // Rank is stored in bits 2-4 (A_RK1=BIT_3, A_RK2=BIT_4, A_RK3=BIT_5)
  // A_RK_MASK = 0x1C (binary: 11100) extracts bits 2-4
  // Then shift right by 2 to get rank level 0-7
  const A_RK_MASK = 0x1C; // Bits 2-4
  const rankBits = member.rank & A_RK_MASK;
  const rankLevel = rankBits >> 2;
  const rankTitle = rankTitles[rankLevel] || rankTitles[2]; // Default to Member

  return {
    guildId: guildData.guildId,
    guildName: guildData.name,
    rankTitle,
    rankNumber: rankLevel,
  };
}

/**
 * Get all guilds (useful for future guild list page)
 */
export async function getAllGuilds(): Promise<Array<{ id: number; name: string }>> {
  try {
    const files = await fs.readdir(GUILD_DIR);
    const guildFiles = files.filter(f => f.startsWith('asc.'));

    const guilds: Array<{ id: number; name: string }> = [];

    for (const file of guildFiles) {
      const guildId = parseInt(file.replace('asc.', ''));
      if (isNaN(guildId)) continue;

      const guildData = await parseGuildFile(guildId);
      if (guildData) {
        guilds.push({
          id: guildData.guildId,
          name: guildData.name,
        });
      }
    }

    return guilds;
  } catch (error) {
    logger.error('Error reading guild directory:', error);
    return [];
  }
}

/**
 * Search guilds for autocomplete
 * Searches distinct guild names from players_core table
 */
export async function searchGuilds(query: string, limit: number = 20): Promise<string[]> {
  const db = await import('../db/connection.js');
  const pool = db.pool;

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT guild
       FROM players_core
       WHERE guild IS NOT NULL
         AND guild != ''
         AND guild LIKE ?
       ORDER BY guild
       LIMIT ${limit}`,
      [`%${query || ''}%`]
    );

    // Return guilds with ANSI color codes intact
    return rows.map((row: any) => row.guild);
  } catch (error) {
    logger.error('Error searching guilds:', error);
    return [];
  }
}

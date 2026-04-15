/**
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';

import {
  getGuild,
  findCharacterGuild,
  getAllGuilds,
  parseGuildFile,
  getCharacterGuildInfoFromGuild,
  searchGuilds,
} from '../guildService.js';

describe('guildService', () => {
  let testGuildId: number;
  let testGuildName: string;
  let testMemberName: string;

  beforeAll(async () => {
    // find a real guild in the database for testing
    const [rows] = await pool.query(
      'SELECT id, name FROM guilds LIMIT 1'
    ) as any;

    if (rows.length === 0) {
      throw new Error('no guilds found in database for testing');
    }

    testGuildId = rows[0].id;
    testGuildName = rows[0].name;

    // find a member for this guild
    const [memberRows] = await pool.query(
      `SELECT gm.player_name FROM guild_members gm
       WHERE gm.guild_id = ? LIMIT 1`,
      [testGuildId]
    ) as any;

    if (memberRows.length > 0) {
      testMemberName = memberRows[0].player_name;
    }
  });

  afterAll(async () => {
    // close connections after tests
    await pool.end();
    await redis.quit();
  });

  describe('getGuild', () => {
    it('should return guild data for existing guild', async () => {
      const guild = await getGuild(testGuildId);

      expect(guild).not.toBeNull();
      expect(guild!.guildId).toBe(testGuildId);
      expect(guild!.name).toBe(testGuildName);
      expect(guild).toHaveProperty('racewar');
      expect(guild).toHaveProperty('frags');
      expect(guild).toHaveProperty('rankTitles');
      expect(guild).toHaveProperty('members');
      expect(Array.isArray(guild!.members)).toBe(true);
    });

    it('should return null for non-existent guild', async () => {
      const guild = await getGuild(999999);
      expect(guild).toBeNull();
    });

    it('should have correct rank titles structure', async () => {
      const guild = await getGuild(testGuildId);

      expect(guild).not.toBeNull();
      expect(guild!.rankTitles).toHaveProperty('enemy');
      expect(guild!.rankTitles).toHaveProperty('onParole');
      expect(guild!.rankTitles).toHaveProperty('member');
      expect(guild!.rankTitles).toHaveProperty('senior');
      expect(guild!.rankTitles).toHaveProperty('officer');
      expect(guild!.rankTitles).toHaveProperty('deputy');
      expect(guild!.rankTitles).toHaveProperty('leader');
      expect(guild!.rankTitles).toHaveProperty('king');
    });

    it('should have correct member structure', async () => {
      const guild = await getGuild(testGuildId);

      expect(guild).not.toBeNull();
      if (guild!.members.length > 0) {
        const member = guild!.members[0];
        expect(typeof member.name).toBe('string');
        expect(typeof member.rank).toBe('number');
        expect(typeof member.bits).toBe('number');
        expect(typeof member.debt).toBe('number');
      }
    });
  });

  describe('findCharacterGuild', () => {
    it('should find guild for member character', async () => {
      if (!testMemberName) {
        console.warn('no guild members found, skipping test');
        return;
      }

      const guildInfo = await findCharacterGuild(testMemberName);

      expect(guildInfo).not.toBeNull();
      expect(guildInfo!.guildId).toBe(testGuildId);
      expect(guildInfo!.guildName).toBe(testGuildName);
      expect(typeof guildInfo!.rankTitle).toBe('string');
      expect(typeof guildInfo!.rankNumber).toBe('number');
      expect(guildInfo!.rankNumber).toBeGreaterThanOrEqual(0);
      expect(guildInfo!.rankNumber).toBeLessThanOrEqual(7);
    });

    it('should return null for non-member character', async () => {
      const guildInfo = await findCharacterGuild('nonexistent_character_xyz_123');
      expect(guildInfo).toBeNull();
    });

    it('should be case-insensitive', async () => {
      if (!testMemberName) {
        console.warn('no guild members found, skipping test');
        return;
      }

      const infoLower = await findCharacterGuild(testMemberName.toLowerCase());
      const infoUpper = await findCharacterGuild(testMemberName.toUpperCase());

      expect(infoLower).not.toBeNull();
      expect(infoUpper).not.toBeNull();
      expect(infoLower!.guildId).toBe(infoUpper!.guildId);
    });
  });

  describe('getAllGuilds', () => {
    it('should return array of guilds', async () => {
      const guilds = await getAllGuilds();

      expect(Array.isArray(guilds)).toBe(true);
      expect(guilds.length).toBeGreaterThan(0);
    });

    it('should have correct structure', async () => {
      const guilds = await getAllGuilds();

      if (guilds.length > 0) {
        const guild = guilds[0];
        expect(typeof guild.id).toBe('number');
        expect(typeof guild.name).toBe('string');
      }
    });

    it('should include test guild', async () => {
      const guilds = await getAllGuilds();

      const found = guilds.find(g => g.id === testGuildId);
      expect(found).toBeDefined();
      expect(found!.name).toBe(testGuildName);
    });
  });

  describe('parseGuildFile (backwards compat alias)', () => {
    it('should work like getGuild for existing guild', async () => {
      const guild = await parseGuildFile(testGuildId);

      expect(guild).not.toBeNull();
      expect(guild!.guildId).toBe(testGuildId);
    });

    it('should return null for non-existent guild', async () => {
      const guild = await parseGuildFile(999999);
      expect(guild).toBeNull();
    });
  });

  describe('getCharacterGuildInfoFromGuild', () => {
    it('should return guild info for member in specific guild', async () => {
      if (!testMemberName) {
        console.warn('no guild members found, skipping test');
        return;
      }

      const guildInfo = await getCharacterGuildInfoFromGuild(testMemberName, testGuildId);

      expect(guildInfo).not.toBeNull();
      expect(guildInfo!.guildId).toBe(testGuildId);
      expect(guildInfo!.guildName).toBe(testGuildName);
    });

    it('should return null for non-member in guild', async () => {
      const guildInfo = await getCharacterGuildInfoFromGuild('nonexistent_xyz', testGuildId);
      expect(guildInfo).toBeNull();
    });

    it('should return null for non-existent guild', async () => {
      const guildInfo = await getCharacterGuildInfoFromGuild('anyname', 999999);
      expect(guildInfo).toBeNull();
    });
  });

  describe('searchGuilds', () => {
    it('should return guilds matching query', async () => {
      // use first char of test guild name (stripped of ansi codes)
      const plainName = testGuildName.replace(/\x1b\[[0-9;]*m/g, '');
      const prefix = plainName.charAt(0);

      const results = await searchGuilds(prefix, 10);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const results = await searchGuilds('', 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for no matches', async () => {
      const results = await searchGuilds('zzzznonexistent', 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('GuildData interface compliance', () => {
    it('should return data matching GuildData interface', async () => {
      const guild = await getGuild(testGuildId);

      expect(guild).not.toBeNull();
      expect(typeof guild!.guildId).toBe('number');
      expect(typeof guild!.name).toBe('string');
      expect(typeof guild!.racewar).toBe('number');
      expect(typeof guild!.frags).toBe('number');
      expect(typeof guild!.rankTitles).toBe('object');
      expect(Array.isArray(guild!.members)).toBe(true);
    });
  });

  describe('CharacterGuildInfo interface compliance', () => {
    it('should return data matching CharacterGuildInfo interface', async () => {
      if (!testMemberName) {
        console.warn('no guild members found, skipping test');
        return;
      }

      const guildInfo = await findCharacterGuild(testMemberName);

      expect(guildInfo).not.toBeNull();
      expect(typeof guildInfo!.guildId).toBe('number');
      expect(typeof guildInfo!.guildName).toBe('string');
      expect(typeof guildInfo!.rankTitle).toBe('string');
      expect(typeof guildInfo!.rankNumber).toBe('number');
    });
  });
});

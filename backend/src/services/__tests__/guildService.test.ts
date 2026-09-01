/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const GUILD = { id: 7, name: 'Keepers of the Gate', racewar: 2, frags: 41 };
const OTHER_GUILD = { id: 8, name: 'Wardens' };
const MEMBER = { player_name: 'Cwial', bits: 24, debt: 125 };
const RANKS = [
  'Enemy',
  'On Parole',
  'Member',
  'Senior',
  'Officer',
  'Deputy',
  'Leader',
  'King',
].map((title, rank_index) => ({ rank_index, title }));

type DatabaseResult = Promise<[unknown[], unknown]>;

const query = jest.fn<(sql: string, params?: unknown[]) => DatabaseResult>(
  async (sql, params = []) => {
    if (sql.includes('FROM guilds WHERE id = ?')) {
      return [params[0] === GUILD.id ? [GUILD] : [], []];
    }
    if (sql.includes('FROM guild_ranks')) {
      return [params[0] === GUILD.id ? RANKS : [], []];
    }
    if (sql.includes('FROM guild_members WHERE guild_id = ?')) {
      return [params[0] === GUILD.id ? [MEMBER] : [], []];
    }
    if (sql.includes('JOIN guilds g ON gm.guild_id = g.id')) {
      return [
        params[0] === MEMBER.player_name.toLowerCase()
          ? [{ id: GUILD.id, name: GUILD.name, bits: MEMBER.bits }]
          : [],
        [],
      ];
    }
    if (sql.includes('SELECT id, name FROM guilds ORDER BY name ASC')) {
      return [[GUILD, OTHER_GUILD], []];
    }
    throw new Error(`Unexpected guild query: ${sql}`);
  },
);

const execute = jest.fn<(sql: string, params?: unknown[]) => DatabaseResult>(
  async (sql, params = []) => {
    if (!sql.includes('SELECT DISTINCT a.name as guild')) {
      throw new Error(`Unexpected guild execute: ${sql}`);
    }
    const pattern = String(params[0] ?? '%%').slice(1, -1).toLowerCase();
    const limit = Number(params[1] ?? 20);
    const rows = [GUILD.name, OTHER_GUILD.name]
      .filter((name) => name.toLowerCase().includes(pattern))
      .slice(0, limit)
      .map((guild) => ({ guild }));
    return [rows, []];
  },
);

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, execute },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn() },
}));

const {
  findCharacterGuild,
  getAllGuilds,
  getCharacterGuildInfoFromGuild,
  getGuild,
  parseGuildFile,
  searchGuilds,
} = await import('../guildService.js');

describe('guildService', () => {
  beforeEach(() => {
    query.mockClear();
    execute.mockClear();
  });

  describe('getGuild', () => {
    it('returns mapped guild data for an existing guild', async () => {
      await expect(getGuild(GUILD.id)).resolves.toMatchObject({
        guildId: GUILD.id,
        name: GUILD.name,
        racewar: GUILD.racewar,
        frags: GUILD.frags,
      });
    });

    it('returns null for a non-existent guild', async () => {
      await expect(getGuild(999_999)).resolves.toBeNull();
    });

    it('maps all eight rank titles by rank index', async () => {
      const guild = await getGuild(GUILD.id);
      expect(guild?.rankTitles).toEqual({
        enemy: 'Enemy',
        onParole: 'On Parole',
        member: 'Member',
        senior: 'Senior',
        officer: 'Officer',
        deputy: 'Deputy',
        leader: 'Leader',
        king: 'King',
      });
    });

    it('extracts member rank from the stored bit mask', async () => {
      const guild = await getGuild(GUILD.id);
      expect(guild?.members).toEqual([
        { name: 'Cwial', rank: 6, bits: 24, debt: 125 },
      ]);
    });
  });

  describe('findCharacterGuild', () => {
    it('finds guild and rank information for a member', async () => {
      await expect(findCharacterGuild('Cwial')).resolves.toEqual({
        guildId: GUILD.id,
        guildName: GUILD.name,
        rankTitle: 'Leader',
        rankNumber: 6,
      });
    });

    it('returns null for a non-member character', async () => {
      await expect(findCharacterGuild('Nobody')).resolves.toBeNull();
    });

    it('normalizes character lookup to lowercase', async () => {
      await findCharacterGuild('CWIAL');
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE LOWER(gm.player_name) = ?'),
        ['cwial'],
      );
    });
  });

  describe('getAllGuilds', () => {
    it('returns an array of guilds', async () => {
      await expect(getAllGuilds()).resolves.toHaveLength(2);
    });

    it('returns only id and name fields', async () => {
      await expect(getAllGuilds()).resolves.toEqual([
        { id: GUILD.id, name: GUILD.name },
        OTHER_GUILD,
      ]);
    });

    it('includes the representative guild', async () => {
      expect(await getAllGuilds()).toContainEqual({ id: GUILD.id, name: GUILD.name });
    });
  });

  describe('parseGuildFile compatibility alias', () => {
    it('delegates existing guild lookup to the database service', async () => {
      expect((await parseGuildFile(GUILD.id))?.guildId).toBe(GUILD.id);
    });

    it('returns null for a non-existent guild', async () => {
      await expect(parseGuildFile(999_999)).resolves.toBeNull();
    });
  });

  describe('getCharacterGuildInfoFromGuild', () => {
    it('returns guild information for a member of the requested guild', async () => {
      await expect(
        getCharacterGuildInfoFromGuild('cwial', GUILD.id),
      ).resolves.toMatchObject({ guildId: GUILD.id, rankTitle: 'Leader' });
    });

    it('returns null for a non-member in the guild', async () => {
      await expect(
        getCharacterGuildInfoFromGuild('Nobody', GUILD.id),
      ).resolves.toBeNull();
    });

    it('returns null for a non-existent guild', async () => {
      await expect(
        getCharacterGuildInfoFromGuild('Cwial', 999_999),
      ).resolves.toBeNull();
    });
  });

  describe('searchGuilds', () => {
    it('returns guild names matching the requested substring', async () => {
      await expect(searchGuilds('gate', 10)).resolves.toEqual([GUILD.name]);
    });

    it('clamps and passes the limit parameter', async () => {
      await searchGuilds('', 500);
      expect(execute).toHaveBeenCalledWith(expect.any(String), ['%%', 100]);
    });

    it('returns an empty array when no names match', async () => {
      await expect(searchGuilds('zzzznonexistent', 10)).resolves.toEqual([]);
    });
  });

  describe('interface compliance', () => {
    it('returns the complete GuildData shape', async () => {
      const guild = await getGuild(GUILD.id);
      expect(guild).toEqual(expect.objectContaining({
        guildId: expect.any(Number),
        name: expect.any(String),
        racewar: expect.any(Number),
        frags: expect.any(Number),
        rankTitles: expect.any(Object),
        members: expect.any(Array),
      }));
    });

    it('returns the complete CharacterGuildInfo shape', async () => {
      const info = await findCharacterGuild('Cwial');
      expect(info).toEqual({
        guildId: expect.any(Number),
        guildName: expect.any(String),
        rankTitle: expect.any(String),
        rankNumber: expect.any(Number),
      });
    });
  });
});

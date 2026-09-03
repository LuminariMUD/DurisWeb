import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const release = jest.fn();
const connection = { query, release };
const getConnection = jest.fn<() => Promise<typeof connection>>().mockResolvedValue(connection);

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { getConnection },
}));
jest.unstable_mockModule('../../db/redis.js', () => ({
  deleteCache: jest.fn(),
  getCache: jest.fn(),
  setCache: jest.fn(),
}));
jest.unstable_mockModule('../permissionService.js', () => ({}));
jest.unstable_mockModule('../categoryService.js', () => ({
  getCategoryAccessForAccount: jest.fn(),
}));
jest.unstable_mockModule('../guildService.js', () => ({ findCharacterGuild: jest.fn() }));
jest.unstable_mockModule('../../utils/contentParser.js', () => ({
  processForumContent: jest.fn(),
}));
jest.unstable_mockModule('../postImageService.js', () => ({
  extractImageUrls: jest.fn(),
  linkImagesToPost: jest.fn(),
  linkImagesToThread: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  isErrorWithCode: jest.fn(),
}));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({}));
jest.unstable_mockModule('../pushNotificationService.js', () => ({
  sendForumReplyNotification: jest.fn(),
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));

const { getUserProfile } = await import('../forumService.js');

describe('user profile statistics', () => {
  beforeEach(() => {
    query.mockReset();
    release.mockClear();
    getConnection.mockClear();
  });

  it('returns independent character, frag, wealth, and death aggregates', async () => {
    query
      .mockResolvedValueOnce([
        [
          {
            account_name: 'Player',
            bio: 'Bio',
            avatar_url: null,
            banner_url: null,
            website: null,
            location: null,
            created_at: '2026-01-01',
            last_seen_at: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total_posts: 3, first_post_at: null, last_post_at: null }]])
      .mockResolvedValueOnce([[{ total_threads: 2 }]])
      .mockResolvedValueOnce([[{ character_count: 2 }]])
      .mockResolvedValueOnce([[{ total_frags: 17 }]])
      .mockResolvedValueOnce([[{ total_wealth: '9007199254740991' }]])
      .mockResolvedValueOnce([[{ total_deaths: 4 }]]);

    const profile = await getUserProfile('Player');

    expect(profile?.stats).toMatchObject({
      characterCount: 2,
      totalFrags: 17,
      totalDeaths: 4,
      totalWealth: Number.MAX_SAFE_INTEGER,
    });
    expect(String(query.mock.calls[3]?.[0])).toContain('FROM account_characters ac');
    expect(String(query.mock.calls[4]?.[0])).toContain('FROM frag_leaderboard fl');
    expect(String(query.mock.calls[5]?.[0])).toContain('FROM player_data pd');
    expect(String(query.mock.calls[5]?.[0])).not.toContain('frag_leaderboard');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns defaults for an account without a customization row or characters', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{}]]);

    const profile = await getUserProfile('NewPlayer');

    expect(profile).toMatchObject({
      accountName: 'NewPlayer',
      bio: null,
      stats: {
        characterCount: 0,
        totalFrags: 0,
        totalDeaths: 0,
        totalWealth: 0,
      },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
});

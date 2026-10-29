import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import type { UserPermissions } from '../../services/permissionService.js';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const release = jest.fn();
const hasActiveWebSession = jest.fn<() => Promise<boolean>>();
let staff = false;

jest.unstable_mockModule('../../db/connection.js', () => {
  const database = { query, getConnection: async () => ({ query, release }) };
  return { pool: database, mudPool: database };
});
jest.unstable_mockModule('../../db/redis.js', () => ({
  default: {},
  getCache: async () => null,
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}));
jest.unstable_mockModule('../../services/sessionService.js', () => ({ hasActiveWebSession }));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
  findAccountByCharacter: async () => 'Player',
  searchAccounts: jest.fn(),
}));
jest.unstable_mockModule('../../services/permissionService.js', () => ({
  getCharacterInfo: jest.fn(),
  getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
    accountName,
    role: staff ? 'overlord' : 'player',
    immortalLevel: staff ? 62 : null,
    maxLevel: staff ? 62 : 56,
    canAccessImmortalForum: staff,
    canAccessGodForum: staff,
    guilds: [],
    canModerate: staff,
    canBan: staff,
    canEditPosts: staff,
    canDeletePosts: staff,
    canPinThreads: staff,
    canLockThreads: staff,
    adminPermissions: staff ? ['manage_user_profiles'] : [],
  }),
}));
jest.unstable_mockModule('../../services/adminPermissionService.js', () => ({
  getUserPermissions: async () => new Set(staff ? ['manage_user_profiles'] : []),
}));
jest.unstable_mockModule('../../services/categoryService.js', () => ({
  getCategoryAccessForAccount: async () => ({ canView: true }),
}));
jest.unstable_mockModule('../../services/webSettingsService.js', () => ({
  getWebSettings: async () => ({ pvpDelayMinutes: 15, respectWebinfoToggle: false }),
}));
jest.unstable_mockModule('../../index.js', () => ({ broadcastForumPost: jest.fn() }));
jest.unstable_mockModule('../../services/pushNotificationService.js', () => ({
  broadcastPush: jest.fn(),
  sendAuctionOutbidNotification: jest.fn(),
  sendAuctionWonNotification: jest.fn(),
  sendForumReplyNotification: jest.fn(),
  sendItemSoldNotification: jest.fn(),
}));

const { generateAccessToken, generateRefreshToken } = await import('../../middleware/auth.js');
const { default: forumRoutes } = await import('../forum.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/forum', forumRoutes);

const character = {
  pid: 1,
  name: 'Hero',
  char_name: 'Hero',
  race: 'Human',
  classname: 'Warrior',
  level: 50,
  guild: '',
  money: 12345,
  balance: 67890,
  playtime: 20003600,
  epics: 7,
  active: 1,
  webinfo_enabled: 1,
};

type ProfileKind = 'account' | 'characters' | 'character' | 'posts' | 'threads';

function prepareQueries(kind: ProfileKind): void {
  if (kind === 'account') {
    query
      .mockResolvedValueOnce([[{ account_name: 'Player', bio: 'Public bio' }]])
      .mockResolvedValueOnce([[{ total_posts: 3 }]])
      .mockResolvedValueOnce([[{ total_threads: 2 }]])
      .mockResolvedValueOnce([[{ character_count: 2 }]])
      .mockResolvedValueOnce([[{ total_frags: 17 }]])
      .mockResolvedValueOnce([[{ total_wealth: 80735 }]])
      .mockResolvedValueOnce([[{ total_deaths: 4 }]]);
  } else if (kind === 'characters') {
    query.mockResolvedValueOnce([
      [
        character,
        { ...character, pid: 2, char_name: 'Second', money: 200, balance: 300, playtime: 7200 },
      ],
    ]);
    for (let index = 0; index < 2; index++) {
      query
        .mockResolvedValueOnce([[{ total_frags: 1200, frag_rank: 2 }]])
        .mockResolvedValueOnce([[{ deaths: 4 }]])
        .mockResolvedValueOnce([[{ forum_posts: 3, forum_threads: 2 }]]);
    }
  } else if (kind === 'posts' || kind === 'threads') {
    query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            thread_id: 2,
            title: 'Public thread',
            thread_title: 'Public thread',
            category_id: 1,
            category_name: 'Public',
            character_name: 'Hero',
            content: 'Public content',
            created_at: '2026-01-01',
          },
        ],
      ]);
  } else {
    query
      .mockResolvedValueOnce([[character]])
      .mockResolvedValueOnce([[{ post_count: 3 }]])
      .mockResolvedValueOnce([[{ thread_count: 2 }]])
      .mockResolvedValueOnce([[{ kills: 12 }]])
      .mockResolvedValueOnce([[{ deaths: 4 }]]);
  }
}

interface Viewer {
  label: string;
  accountName?: string;
  owns: boolean;
  active?: boolean;
  staff?: boolean;
  tokenType?: 'invalid' | 'refresh';
}

const viewers: Viewer[] = [
  { label: 'anonymous visitor', owns: false },
  { label: 'another account', accountName: 'Other', owns: false },
  { label: 'another staff account', accountName: 'Staff', staff: true, owns: false },
  { label: 'owner with an inactive session', accountName: 'Player', active: false, owns: false },
  {
    label: 'owner with an invalid token',
    accountName: 'Player',
    tokenType: 'invalid',
    owns: false,
  },
  {
    label: 'owner using a refresh token',
    accountName: 'Player',
    tokenType: 'refresh',
    owns: false,
  },
  { label: 'authenticated owner', accountName: 'Player', owns: true },
  { label: 'owner with different account-name casing', accountName: 'pLaYeR', owns: true },
];

describe.each<{ kind: ProfileKind; path: string }>([
  { kind: 'account', path: '/api/forum/users/Player/profile' },
  { kind: 'characters', path: '/api/forum/users/Player/characters' },
  { kind: 'character', path: '/api/forum/characters/Hero/profile' },
  { kind: 'posts', path: '/api/forum/users/Player/posts' },
  { kind: 'threads', path: '/api/forum/users/Player/threads' },
])('$kind profile privacy', ({ kind, path }) => {
  beforeEach(() => {
    query.mockReset().mockRejectedValue(new Error('Unexpected fixture query'));
    release.mockClear();
    hasActiveWebSession.mockReset().mockResolvedValue(true);
    staff = false;
    prepareQueries(kind);
  });

  it.each(viewers)('restricts profile character data to its owner: $label', async (viewer) => {
    staff = viewer.staff ?? false;
    hasActiveWebSession.mockResolvedValue(viewer.active ?? true);
    const pending = request(app).get(path);
    if (viewer.accountName) {
      const token =
        viewer.tokenType === 'invalid'
          ? 'invalid-token'
          : viewer.tokenType === 'refresh'
            ? generateRefreshToken(viewer.accountName, 'fixture@example.invalid', 'fixture-session')
            : generateAccessToken(viewer.accountName, 'fixture@example.invalid', 'fixture-session');
      pending.set('Cookie', `access_token=${token}`);
    }

    const response = await pending;
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Cookie');

    if ((kind === 'characters' || kind === 'character') && !viewer.owns) {
      const authenticated = viewer.accountName && viewer.active !== false && !viewer.tokenType;
      expect(response.status).toBe(authenticated ? (kind === 'characters' ? 403 : 404) : 401);
      expect(response.body).toEqual({ error: expect.any(String) });
      expect(query).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      return;
    }
    expect(response.status).toBe(200);

    if (kind === 'account') {
      expect(response.body).toMatchObject({
        accountName: 'Player',
        bio: 'Public bio',
        stats: {
          totalPosts: 3,
          characterCount: viewer.owns ? 2 : null,
          totalFrags: viewer.owns ? 17 : null,
          totalDeaths: viewer.owns ? 4 : null,
        },
      });
      expect(response.body.stats.totalWealth).toBe(viewer.owns ? 80735 : null);
    } else if (kind === 'characters') {
      expect(response.body.totals.totalWealth).toBe(viewer.owns ? 80735 : null);
      expect(response.body.characters).toHaveLength(2);
      expect(response.body.characters[0]).toMatchObject({
        name: 'Hero',
        level: 50,
        race: 'Human',
        class: 'Warrior',
        stats: { frags: 12, deaths: 4 },
        money: viewer.owns ? 12345 : null,
        balance: viewer.owns ? 67890 : null,
        playtime: viewer.owns ? 3600 : null,
      });
      expect(response.body.characters[1]).toMatchObject({
        name: 'Second',
        money: viewer.owns ? 200 : null,
        balance: viewer.owns ? 300 : null,
        playtime: viewer.owns ? 7200 : null,
      });
    } else if (kind === 'posts' || kind === 'threads') {
      expect(response.body[kind]).toEqual([
        expect.objectContaining({
          characterName: viewer.owns ? 'Hero' : null,
          content: 'Public content',
          categoryName: 'Public',
        }),
      ]);
      expect(response.body.pagination.total).toBe(1);
    } else {
      expect(response.body).toMatchObject({
        name: 'Hero',
        level: 50,
        money: viewer.owns ? 12345 : null,
        balance: viewer.owns ? 67890 : null,
        playtime: viewer.owns ? 20003600 : null,
        stats: { forumPosts: 3, pvpKills: 12, pvpDeaths: 4 },
      });
    }
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('public character-to-account navigation', () => {
  it('continues to resolve the account link without exposing the private roster', async () => {
    const response = await request(app).get('/api/forum/characters/Hero/account');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accountName: 'Player' });
  });

  it('retains the batch links used by published battle pages', async () => {
    const response = await request(app)
      .post('/api/forum/characters/batch/accounts')
      .send({ characterNames: ['Hero'] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Hero: 'Player' });
  });
});

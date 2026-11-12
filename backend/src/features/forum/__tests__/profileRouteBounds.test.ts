import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { stubModule } from '../../../test/stubModule.js';
import type * as ForumService from '../../../services/forumService.js';

for (const specifier of [
  '../../../db/connection.js',
  '../../../db/redis.js',
  '../../../services/accountService.js',
  '../../../services/r2Service.js',
]) {
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url)));
}

const getCharacterPosts = jest.fn<typeof ForumService.getCharacterPosts>();
const getCharacterPvPEvents = jest.fn<typeof ForumService.getCharacterPvPEvents>();
const getGuildForumActivity = jest.fn<typeof ForumService.getGuildForumActivity>();
const getGuildProfile = jest.fn<typeof ForumService.getGuildProfile>();
const getUserPosts = jest.fn<typeof ForumService.getUserPosts>();
const getUserThreads = jest.fn<typeof ForumService.getUserThreads>();
const searchAccounts = jest.fn<typeof ForumService.searchAccounts>();
jest.unstable_mockModule(
  '../../../services/forumService.js',
  stubModule(new URL('../../../services/forumService.js', import.meta.url), {
    getCharacterPosts,
    getCharacterPvPEvents,
    getGuildForumActivity,
    getGuildProfile,
    getUserPosts,
    getUserThreads,
    searchAccounts,
  }),
);

const { forumProfileRoutes } = await import('../profileRoutes.js');
const app = express();
app.set('trust proxy', 1);
app.use('/api/forum', forumProfileRoutes);

beforeEach(() => {
  getCharacterPosts.mockReset().mockResolvedValue({ posts: [], total: 0 });
  getCharacterPvPEvents.mockReset().mockResolvedValue({ events: [], total: 0 });
  getGuildForumActivity.mockReset().mockResolvedValue({ posts: [], total: 0 });
  getGuildProfile.mockReset().mockResolvedValue({ name: 'Synthetic guild' });
  getUserPosts.mockReset().mockResolvedValue({ posts: [], total: 0 });
  getUserThreads.mockReset().mockResolvedValue({ threads: [], total: 0 });
  searchAccounts.mockReset().mockResolvedValue(['Player']);
});

describe.each([
  { path: '/characters/Hero/posts', service: getCharacterPosts, defaultLimit: 20 },
  { path: '/characters/Hero/pvp', service: getCharacterPvPEvents, defaultLimit: 20 },
  { path: '/guilds/Guild/activity', service: getGuildForumActivity, defaultLimit: 20 },
  { path: '/users/Player/posts', service: getUserPosts, defaultLimit: 50 },
  { path: '/users/Player/threads', service: getUserThreads, defaultLimit: 50 },
])('public profile pagination: $path', ({ path, service, defaultLimit }) => {
  it.each([
    { query: 'page=-5&limit=-10', page: 1, limit: 1 },
    { query: 'page=999999&limit=999', page: 10000, limit: 100 },
    { query: 'page=garbage&limit=garbage', page: 1, limit: undefined },
    { query: 'page=2&page=3&limit=4&limit=5', page: 1, limit: undefined },
    { query: 'page=2&limit=30', page: 2, limit: 30 },
  ])('bounds $query before calling persistence', async ({ query, page, limit }) => {
    const response = await request(app).get(`/api/forum${path}?${query}`);
    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ page, limit: limit ?? defaultLimit });
    expect(service.mock.calls[0]?.slice(1, 3)).toEqual([page, limit ?? defaultLimit]);
  });
});

describe('guild path parameter decoding', () => {
  it.each(
    ['Guild%2FHeroes', 'Guild%Heroes'].flatMap((name) => [
      { name, endpoint: 'profile', service: getGuildProfile },
      { name, endpoint: 'activity', service: getGuildForumActivity },
    ]),
  )('passes the once-decoded name $name to $endpoint', async ({ name, endpoint, service }) => {
    const response = await request(app).get(
      '/api/forum/guilds/' + encodeURIComponent(name) + '/' + endpoint,
    );
    expect(response.status).toBe(200);
    expect(service.mock.calls[0]?.[0]).toBe(name);
  });
});

describe('mention search', () => {
  it('rejects malformed and oversized queries before persistence', async () => {
    for (const query of ['q=Pl&q=Ot', `q=${'x'.repeat(51)}`]) {
      const response = await request(app)
        .get(`/api/forum/accounts/search?${query}`)
        .set('X-Forwarded-For', '192.0.2.1');
      expect(response.status).toBe(400);
    }
    expect(searchAccounts).not.toHaveBeenCalled();
  });

  it('retains empty suggestions for short queries', async () => {
    const response = await request(app)
      .get('/api/forum/accounts/search?q=P')
      .set('X-Forwarded-For', '192.0.2.2');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accounts: [] });
    expect(searchAccounts).not.toHaveBeenCalled();
  });

  it('allows mention autocomplete but limits repeated requests before persistence', async () => {
    for (let index = 0; index < 60; index++) {
      const response = await request(app)
        .get('/api/forum/accounts/search?q=Pl')
        .set('X-Forwarded-For', '192.0.2.3');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ accounts: ['Player'] });
    }
    const response = await request(app)
      .get('/api/forum/accounts/search?q=Pl')
      .set('X-Forwarded-For', '192.0.2.3');
    expect(response.status).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(searchAccounts).toHaveBeenCalledTimes(60);
    expect(searchAccounts).toHaveBeenLastCalledWith('Pl', 10);
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { UserPermissions } from '../services/permissionService.js';
import { stubModule } from '../test/stubModule.js';

// The real composition with every router mounted. Database/cache modules connect on
// import, so they and the session/account lookups are replaced with synthetic state.
let grants: string[] = [];
const createChangelogEntry = jest.fn(async (_entry: unknown) => 11);
const unavailable = async () => {
  throw new Error('database unavailable in composition test');
};
const database = { query: unavailable, execute: unavailable, getConnection: unavailable };

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  stubModule(new URL(specifier, import.meta.url), overrides);

jest.unstable_mockModule(
  '../db/connection.js',
  stub('../db/connection.js', {
    pool: database,
    mudPool: database,
  }),
);
jest.unstable_mockModule('../db/redis.js', stub('../db/redis.js', { getCache: async () => null }));
jest.unstable_mockModule(
  '../services/sessionService.js',
  stub('../services/sessionService.js', {
    hasActiveWebSession: async () => true,
  }),
);
jest.unstable_mockModule(
  '../services/accountService.js',
  stub('../services/accountService.js', {
    parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
  }),
);
jest.unstable_mockModule(
  '../services/permissionService.js',
  stub('../services/permissionService.js', {
    getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
      accountName,
      role: 'player',
      immortalLevel: null,
      maxLevel: 50,
      canAccessImmortalForum: false,
      canAccessGodForum: false,
      guilds: [],
      canModerate: false,
      canBan: false,
      canEditPosts: false,
      canDeletePosts: false,
      canPinThreads: false,
      canLockThreads: false,
      adminPermissions: grants,
    }),
  }),
);
jest.unstable_mockModule(
  '../services/adminPermissionService.js',
  stub('../services/adminPermissionService.js', {
    getUserPermissions: async () => new Set(grants),
  }),
);
jest.unstable_mockModule(
  '../features/changelog/service.js',
  stub('../features/changelog/service.js', {
    getChangelogEntries: async () => ({ entries: [], total: 0, page: 1, limit: 20 }),
    createChangelogEntry,
    notifyChangelogPublished: async () => undefined,
  }),
);

const signals = () => ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
const before = signals();
const { createApp } = await import('../app.js');
const { generateAccessToken } = await import('../middleware/auth.js');
const app = createApp();
const csrf = 'synthetic-csrf';
const session = `access_token=${generateAccessToken('FixtureEditor', 'f@example.invalid', 'sid')}`;
const draft = { version: '1.0.0', title: 'Fixture', content: 'Synthetic body' };

describe('createApp composition', () => {
  it('composes without installing signal handlers', () => {
    expect(signals()).toEqual(before);
  });

  it('serves ping, then JSON 404s for unknown API paths', async () => {
    expect((await request(app).get('/api/ping')).text).toBe('pong');
    const missing = await request(app).get('/api/not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'API route not found' });
  });

  it('reaches the mounted changelog router through CSRF and real authentication', async () => {
    const read = await request(app).get('/api/changelog');
    expect(read.status).toBe(200);
    expect(String(read.headers['set-cookie'])).toContain('csrf_token=');

    const noCsrf = await request(app).post('/api/changelog').set('Cookie', session).send(draft);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body).toEqual({ error: 'Invalid CSRF token' });

    const withCsrf = (cookie: string) =>
      request(app)
        .post('/api/changelog')
        .set('Cookie', `csrf_token=${csrf}${cookie}`)
        .set('X-CSRF-Token', csrf)
        .send(draft);
    expect((await withCsrf('')).status).toBe(401);
    expect((await withCsrf(`; ${session}`)).status).toBe(403);
    expect(createChangelogEntry).not.toHaveBeenCalled();

    grants = ['manage_news'];
    const created = await withCsrf(`; ${session}`);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 11 });
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';

// Real auth middleware with synthetic session/account state; only persistence is stubbed.
let grants: string[] = [];
const getChangelogEntries = jest.fn(async (_options: unknown) => ({ entries: [], total: 0 }));
const createChangelogEntry = jest.fn(async (_entry: unknown) => 7);

jest.unstable_mockModule('../../../db/connection.js', () => ({ pool: {}, mudPool: {} }));
jest.unstable_mockModule('../../../services/sessionService.js', () => ({
  hasActiveWebSession: async () => true,
}));
jest.unstable_mockModule('../../../services/accountService.js', () => ({
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
}));
jest.unstable_mockModule('../../../services/permissionService.js', () => ({
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
}));
jest.unstable_mockModule('../../../services/adminPermissionService.js', () => ({
  getUserPermissions: async () => new Set(grants),
}));
jest.unstable_mockModule('../service.js', () => ({
  getChangelogEntries,
  createChangelogEntry,
  notifyChangelogPublished: jest.fn(async () => undefined),
}));

const { generateAccessToken } = await import('../../../middleware/auth.js');
const { changelogRouter } = await import('../routes.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/changelog', changelogRouter);

const cookie = () =>
  `access_token=${generateAccessToken('FixtureEditor', 'fixture@example.invalid', 'fixture-sid')}`;
const draft = { version: '1.0.0', title: 'Fixture', content: 'Synthetic body' };

describe('changelog routes with real authentication middleware', () => {
  beforeEach(() => {
    grants = [];
    jest.clearAllMocks();
  });

  it('serves public reads anonymously', async () => {
    const response = await request(app).get('/api/changelog');
    expect(response.status).toBe(200);
    expect(getChangelogEntries).toHaveBeenCalledWith(
      expect.objectContaining({ includeAdmin: false, accountName: undefined }),
    );
  });

  it('rejects anonymous and unpermitted writes without mutating', async () => {
    expect((await request(app).post('/api/changelog').send(draft)).status).toBe(401);
    const forbidden = await request(app).post('/api/changelog').set('Cookie', cookie()).send(draft);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      error: 'Permission denied: manage_news required',
      required_permission: 'manage_news',
    });
    expect(createChangelogEntry).not.toHaveBeenCalled();
  });

  it('creates an entry for an authorized editor', async () => {
    grants = ['manage_news'];
    const response = await request(app).post('/api/changelog').set('Cookie', cookie()).send(draft);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 7 });
    expect(createChangelogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'FixtureEditor', category: 'public' }),
    );
  });
});

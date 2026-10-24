import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

let mode: 'anonymous' | 'reader' | 'staff' | 'editor' = 'anonymous';
const list = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const adminList = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const identify: RequestHandler = (req, _res, next) => {
  req.user =
    mode === 'anonymous'
      ? undefined
      : {
          accountName: 'FixtureReader',
          email: 'fixture@example.invalid',
          sessionId: 'fixture-session',
          permissions: {
            accountName: 'FixtureReader',
            role: 'player',
          immortalLevel: mode === 'staff' ? 57 : null,
          maxLevel: mode === 'staff' ? 57 : 1,
            canAccessImmortalForum: false,
            canAccessGodForum: false,
            guilds: [],
            canModerate: false,
            canBan: false,
            canEditPosts: false,
            canDeletePosts: false,
            canPinThreads: false,
            canLockThreads: false,
            adminPermissions: [],
          },
          adminPermissions: new Set(mode === 'editor' ? ['manage_news'] : []),
        };
  next();
};
const authenticated: RequestHandler = (req, res, next) => {
  identify(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    next();
  });
};
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  optionalAuth: identify,
  requireAuth: authenticated,
  requirePermission:
    (permission: string): RequestHandler =>
    (req, res, next) => {
      if (!req.user?.adminPermissions.has(permission)) {
        res.status(403).json({ error: 'Permission required' });
        return;
      }
      next();
    },
}));
jest.unstable_mockModule('../../services/changelogService.js', () => ({
  getChangelogEntries: list,
  getAllChangelogEntriesForAdmin: adminList,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: () => 'Unexpected fixture failure',
}));
let app: express.Express;
beforeAll(async () => {
  const { default: routes } = await import('../changelog.js');
  app = express();
  app.use('/api/changelog', routes);
});
beforeEach(() => {
  mode = 'anonymous';
  jest.clearAllMocks();
  list.mockResolvedValue({ entries: [], total: 0 });
  adminList.mockResolvedValue({ entries: [], total: 0 });
});

describe('bounded changelog list pagination', () => {
  it.each(['', '/admin'])('defaults and caps public/admin lists: %s', async (suffix) => {
    mode = suffix ? 'editor' : 'anonymous';
    expect((await request(app).get(`/api/changelog${suffix}`)).status).toBe(200);
    if (suffix) expect(adminList).toHaveBeenLastCalledWith(1, 20);
    else
      expect(list).toHaveBeenLastCalledWith({
        includeAdmin: false,
        accountName: undefined,
        page: 1,
        limit: 20,
      });
    expect(
      (await request(app).get(`/api/changelog${suffix}?page=999999999999999999999&limit=101`))
        .status,
    ).toBe(200);
    if (suffix) expect(adminList).toHaveBeenLastCalledWith(10000, 100);
    else
      expect(list).toHaveBeenLastCalledWith({
        includeAdmin: false,
        accountName: undefined,
        page: 10000,
        limit: 100,
      });
  });

  it.each([
    'page=-1',
    'limit=-20',
    'page=1.5',
    'limit=100tail',
    'page=Infinity',
    'limit=',
    'page=1&page=2',
    'limit=10&limit=20',
  ])('rejects malformed list input before either service: %s', async (query) => {
    mode = 'editor';
    for (const suffix of ['', '/admin'])
      expect((await request(app).get(`/api/changelog${suffix}?${query}`)).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
    expect(adminList).not.toHaveBeenCalled();
  });

  it('clamps zero to the established lower bound and preserves visibility decisions', async () => {
    mode = 'staff';
    expect((await request(app).get('/api/changelog?page=0&limit=0')).status).toBe(200);
    expect(list).toHaveBeenLastCalledWith({
      includeAdmin: true,
      accountName: 'FixtureReader',
      page: 1,
      limit: 1,
    });
    mode = 'reader';
    await request(app).get('/api/changelog?page=2&limit=30');
    expect(list).toHaveBeenLastCalledWith({
      includeAdmin: false,
      accountName: 'FixtureReader',
      page: 2,
      limit: 30,
    });
  });

  it('keeps authentication/management permission ahead of admin pagination', async () => {
    expect((await request(app).get('/api/changelog/admin?limit=-1')).status).toBe(401);
    mode = 'reader';
    expect((await request(app).get('/api/changelog/admin?limit=-1')).status).toBe(403);
    expect(adminList).not.toHaveBeenCalled();
  });
});

import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

let userMode: 'anonymous' | 'regular' | 'admin' = 'regular';
const getChangelogEntry = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve(null));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'changelog-visibility-session',
      permissions: { immortalLevel: 60 },
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  optionalAuth: (req: any, _res: any, next: any) => {
    if (userMode === 'anonymous') {
      req.user = undefined;
    } else {
      req.user = {
        accountName: 'Cwial',
        email: 'cwial@example.invalid',
        sessionId: 'changelog-visibility-session',
        permissions: { immortalLevel: userMode === 'admin' ? 60 : 1 },
        adminPermissions: new Set(),
      };
    }
    next();
  },
}));

jest.unstable_mockModule('../../services/changelogService.js', () => ({
  getChangelogEntry,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('changelog detail visibility route', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: changelogRoutes } = await import('../changelog.js');
    app = express();
    app.use(express.json());
    app.use('/api/changelog', changelogRoutes);
  });

  beforeEach(() => {
    userMode = 'regular';
    jest.clearAllMocks();
  });

  it('hides an unpublished public entry from regular authenticated readers', async () => {
    getChangelogEntry.mockResolvedValueOnce({
      id: 42,
      category: 'public',
      isPublished: false,
    });

    const response = await request(app).get('/api/changelog/42');

    expect(response.status).toBe(404);
    expect(getChangelogEntry).toHaveBeenCalledWith(42, 'Cwial', false);
  });

  it('hides an unpublished public entry from anonymous readers', async () => {
    userMode = 'anonymous';
    getChangelogEntry.mockResolvedValueOnce({
      id: 42,
      category: 'public',
      isPublished: false,
    });

    const response = await request(app).get('/api/changelog/42');

    expect(response.status).toBe(404);
    expect(getChangelogEntry).toHaveBeenCalledWith(42, undefined, false);
  });

  it('passes an explicit admin visibility decision for privileged readers', async () => {
    userMode = 'admin';
    getChangelogEntry.mockResolvedValueOnce({
      id: 42,
      category: 'admin',
      isPublished: false,
    });

    const response = await request(app).get('/api/changelog/42');

    expect(response.status).toBe(200);
    expect(getChangelogEntry).toHaveBeenCalledWith(42, 'Cwial', true);
  });
});

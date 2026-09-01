import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createChangelogEntry = jest.fn((..._args: unknown[]): Promise<number> => Promise.resolve(42));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'changelog-fields-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  optionalAuth: (req: any, _res: any, next: any) => {
    req.user = undefined;
    next();
  },
}));

jest.unstable_mockModule('../../services/changelogService.js', () => ({
  createChangelogEntry,
  notifyChangelogPublished: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('changelog write field validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: changelogRoutes } = await import('../changelog.js');
    app = express();
    app.use(express.json());
    app.use('/api/changelog', changelogRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unknown fields before persistence', async () => {
    const response = await request(app).post('/api/changelog').send({
      version: '1.0.0',
      title: 'Release',
      content: '<p>safe</p>',
      unexpected: 'do-not-store',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unknown field');
    expect(createChangelogEntry).not.toHaveBeenCalled();
  });

  it('rejects an overlong title before persistence', async () => {
    const response = await request(app)
      .post('/api/changelog')
      .send({
        version: '1.0.0',
        title: 'x'.repeat(256),
        content: '<p>safe</p>',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('title');
    expect(createChangelogEntry).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean publication flag before persistence', async () => {
    const response = await request(app).post('/api/changelog').send({
      version: '1.0.0',
      title: 'Release',
      content: '<p>safe</p>',
      isPublished: 'true',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('isPublished');
    expect(createChangelogEntry).not.toHaveBeenCalled();
  });

  it('rejects a non-object request body with a validation error', async () => {
    const response = await request(app)
      .post('/api/changelog')
      .set('Content-Type', 'text/plain')
      .send('null');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Request body must be an object');
    expect(createChangelogEntry).not.toHaveBeenCalled();
  });
});

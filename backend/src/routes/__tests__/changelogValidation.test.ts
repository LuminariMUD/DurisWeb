import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createChangelogEntry = jest.fn();
const updateChangelogEntry = jest.fn();
const getChangelogEntry = jest.fn();
const notifyChangelogPublished = jest.fn();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'changelog-test-session',
      permissions: { immortalLevel: 60 },
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
  updateChangelogEntry,
  getChangelogEntry,
  notifyChangelogPublished,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('changelog route write validation', () => {
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

  it('rejects script-only creates before persistence', async () => {
    const response = await request(app).post('/api/changelog').send({
      version: '1.0.0',
      title: 'Rejected',
      content: '<script>alert(1)</script>',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Content cannot be empty after sanitization');
    expect(createChangelogEntry).not.toHaveBeenCalled();
    expect(notifyChangelogPublished).not.toHaveBeenCalled();
  });

  it('rejects script-only updates before lookup or persistence', async () => {
    const response = await request(app)
      .put('/api/changelog/42')
      .send({ content: '<svg onload="alert(1)">x</svg>' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Content cannot be empty after sanitization');
    expect(getChangelogEntry).not.toHaveBeenCalled();
    expect(updateChangelogEntry).not.toHaveBeenCalled();
  });
});

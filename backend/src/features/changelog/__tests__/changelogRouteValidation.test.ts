import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createChangelogEntry = jest.fn();
const updateChangelogEntry = jest.fn();
const getChangelogEntry = jest.fn();
const notifyChangelogPublished = jest.fn();

jest.unstable_mockModule('../../../middleware/auth.js', () => ({
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

jest.unstable_mockModule('../service.js', () => ({
  createChangelogEntry,
  updateChangelogEntry,
  getChangelogEntry,
  notifyChangelogPublished,
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  getErrorMessage: (error: unknown) => String(error),
}));

describe('changelog route write validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { changelogRouter: changelogRoutes } = await import('../routes.js');
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

  it('notifies once, with the saved fields, only when this request published', async () => {
    const saved = {
      version: '2.0.0',
      title: 'Saved title',
      category: 'public',
    };
    getChangelogEntry.mockImplementation(async () => saved);
    updateChangelogEntry
      .mockImplementationOnce(async () => ({ found: true, published: true }))
      .mockImplementationOnce(async () => ({ found: true, published: false }));

    const [first, second] = await Promise.all([
      request(app).put('/api/changelog/42').send({ isPublished: true }),
      request(app).put('/api/changelog/42').send({ isPublished: true }),
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(notifyChangelogPublished).toHaveBeenCalledTimes(1);
    expect(notifyChangelogPublished).toHaveBeenCalledWith(42, '2.0.0', 'Saved title', 'public');
  });

  it('returns 404 without notifying when the entry does not exist', async () => {
    updateChangelogEntry.mockImplementationOnce(async () => ({
      found: false,
      published: false,
    }));

    const response = await request(app).put('/api/changelog/9').send({ isPublished: true });

    expect(response.status).toBe(404);
    expect(notifyChangelogPublished).not.toHaveBeenCalled();
  });
});

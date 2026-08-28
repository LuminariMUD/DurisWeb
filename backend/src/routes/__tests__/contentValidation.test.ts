import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createHelpPage = jest.fn();
const updateHelpPage = jest.fn();
const setMotd = jest.fn();
const setNews = jest.fn();
const setWizMotd = jest.fn();
const setRules = jest.fn();
const setCredits = jest.fn();
const setWizlist = jest.fn();
const setFaq = jest.fn();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'content-test-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule('../../services/contentService.js', () => ({
  createHelpPage,
  updateHelpPage,
  setMotd,
  setNews,
  setWizMotd,
  setRules,
  setCredits,
  setWizlist,
  setFaq,
}));

jest.unstable_mockModule('../../services/categoryService.js', () => ({}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
jest.unstable_mockModule('../../utils/ipExtractor.js', () => ({
  extractClientIP: () => '127.0.0.1',
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn() },
}));
jest.unstable_mockModule('../../utils/newsParser.js', () => ({
  parseLatestNewsEntry: jest.fn(),
}));
jest.unstable_mockModule('../../services/unifiedNotificationService.js', () => ({
  notifyNewsUpdate: jest.fn(),
}));

describe('content route write validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: contentRoutes } = await import('../content.js');
    app = express();
    app.use(express.json());
    app.use('/api/content', contentRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects script-only help content before calling persistence', async () => {
    const response = await request(app)
      .post('/api/content/help')
      .send({ title: 'Rejected', text: '<script>alert(1)</script>' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Content cannot be empty after sanitization');
    expect(createHelpPage).not.toHaveBeenCalled();
  });

  it('rejects oversized MOTD content before calling persistence', async () => {
    const response = await request(app)
      .put('/api/content/motd')
      .send({ content: 'x'.repeat(50_001) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('maximum length');
    expect(setMotd).not.toHaveBeenCalled();
  });
});

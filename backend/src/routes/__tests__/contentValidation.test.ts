import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createHelpPage = jest.fn(
  (..._args: unknown[]): Promise<{ id: number }> => Promise.resolve({ id: 0 }),
);
const updateHelpPage = jest.fn();
const createCategory = jest.fn(
  (..._args: unknown[]): Promise<{ id: number }> => Promise.resolve({ id: 0 }),
);
const updateCategory = jest.fn();
const setMotd = jest.fn(
  (..._args: unknown[]): Promise<{ content: string }> => Promise.resolve({ content: '' }),
);
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
  createCategory,
  updateCategory,
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

  it('rejects malformed help resource IDs before lookup', async () => {
    const response = await request(app).get('/api/content/help/12abc');

    expect(response.status).toBe(400);
  });

  it('rejects malformed category resource IDs before mutation', async () => {
    const response = await request(app)
      .patch('/api/content/categories/12abc')
      .send({ name: 'Valid category name' });

    expect(response.status).toBe(400);
  });

  it('rejects an overlong help title before calling persistence', async () => {
    const response = await request(app)
      .post('/api/content/help')
      .send({ title: 'x'.repeat(256), text: '<p>safe</p>' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/title/i);
    expect(createHelpPage).not.toHaveBeenCalled();
  });

  it('passes a valid help payload through after validation', async () => {
    createHelpPage.mockResolvedValueOnce({ id: 7 });

    const response = await request(app)
      .post('/api/content/help')
      .send({ title: 'Valid help', text: '<p>safe</p>', category_id: 0 });

    expect(response.status).toBe(201);
    expect(createHelpPage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Valid help',
        text: '<p>safe</p>',
        category_id: 0,
      }),
    );
  });

  it('rejects a non-integer help category id before calling persistence', async () => {
    const response = await request(app)
      .post('/api/content/help')
      .send({ title: 'Help', text: '<p>safe</p>', category_id: '1' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/category_id/i);
    expect(createHelpPage).not.toHaveBeenCalled();
  });

  it('rejects unknown help fields before calling persistence', async () => {
    const response = await request(app)
      .post('/api/content/help')
      .send({ title: 'Help', text: '<p>safe</p>', extra: 'do-not-store' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unknown field');
    expect(createHelpPage).not.toHaveBeenCalled();
  });

  it('rejects an overlong help category name before calling persistence', async () => {
    const response = await request(app)
      .post('/api/content/categories')
      .send({ name: 'x'.repeat(256), desc: 'safe' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/name/i);
    expect(createCategory).not.toHaveBeenCalled();
  });

  it('passes a valid help category payload through after validation', async () => {
    createCategory.mockResolvedValueOnce({ id: 8 });

    const response = await request(app)
      .post('/api/content/categories')
      .send({ name: 'Valid category', desc: 'A valid description' });

    expect(response.status).toBe(201);
    expect(createCategory).toHaveBeenCalledWith({
      name: 'Valid category',
      desc: 'A valid description',
    });
  });

  it('rejects a non-boolean category archive value before calling persistence', async () => {
    const response = await request(app)
      .patch('/api/content/categories/1')
      .send({ isArchived: 'true' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/isArchived/i);
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it('rejects oversized MOTD content before calling persistence', async () => {
    const response = await request(app)
      .put('/api/content/motd')
      .send({ content: 'x'.repeat(50_001) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('maximum length');
    expect(setMotd).not.toHaveBeenCalled();
  });

  it.each([
    ['/motd', setMotd],
    ['/news', setNews],
    ['/wizmotd', setWizMotd],
    ['/rules', setRules],
    ['/credits', setCredits],
    ['/wizlist', setWizlist],
    ['/faq', setFaq],
  ])('rejects unknown fields for %s before persistence', async (path, setter) => {
    const response = await request(app)
      .put(`/api/content${path}`)
      .send({ content: '<p>safe</p>', unexpected: 'do-not-store' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unknown field');
    expect(setter).not.toHaveBeenCalled();
  });

  it('rejects a non-string MUD-info content value before persistence', async () => {
    const response = await request(app).put('/api/content/motd').send({ content: 123 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/content/i);
    expect(setMotd).not.toHaveBeenCalled();
  });

  it('passes a valid MUD-info payload through after validation', async () => {
    setMotd.mockResolvedValueOnce({ content: '<p>safe</p>' });

    const response = await request(app).put('/api/content/motd').send({ content: '<p>safe</p>' });

    expect(response.status).toBe(200);
    expect(setMotd).toHaveBeenCalledWith('<p>safe</p>');
    expect(response.body.motd).toBe('<p>safe</p>');
  });
});

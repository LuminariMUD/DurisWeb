import express, { type RequestHandler } from 'express';
import { configureRequestBodyParsers } from '../../middleware/requestLimits.js';
import { MAX_NEWS_LENGTH } from '../../utils/contentParser.js';
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
const setNews = jest.fn(async (content: string) => ({ content }));
const getNews = jest.fn<() => Promise<{ content: string } | null>>();
const notifyNewsUpdate = jest.fn<(...args: unknown[]) => Promise<void>>();
const setWizMotd = jest.fn();
const setRules = jest.fn();
const setCredits = jest.fn();
const setWizlist = jest.fn();
const setFaq = jest.fn();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: ((req, _res, next) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'content-test-session',
      permissions: {
        accountName: 'Cwial',
        role: 'overlord',
        immortalLevel: 62,
        maxLevel: 62,
        canAccessImmortalForum: true,
        canAccessGodForum: true,
        guilds: [],
        canModerate: true,
        canBan: true,
        canEditPosts: true,
        canDeletePosts: true,
        canPinThreads: true,
        canLockThreads: true,
        adminPermissions: ['manage_news'],
      },
      adminPermissions: new Set(),
    };
    next();
  }) satisfies RequestHandler,
  requirePermission: () => ((_req, _res, next) => next()) satisfies RequestHandler,
}));

jest.unstable_mockModule('../../services/contentService.js', () => ({
  createHelpPage,
  updateHelpPage,
  createCategory,
  updateCategory,
  setMotd,
  setNews,
  getNews,
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
jest.unstable_mockModule('../../services/unifiedNotificationService.js', () => ({
  notifyNewsUpdate,
}));

describe('content route write validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: contentRoutes } = await import('../content.js');
    app = express();
    configureRequestBodyParsers(app);
    app.use('/api/content', contentRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([54_922, 56_066, MAX_NEWS_LENGTH])(
    'saves %i characters of MUD news unchanged',
    async (length) => {
      const content = '&+YNews&n\n  buy <item> & more\n'.padEnd(length, 'x');
      const response = await request(app).put('/api/content/news').send({ content });
      expect(response.status).toBe(200);
      expect(setNews).toHaveBeenCalledWith(content);
      expect(response.body.news).toBe(content);
      expect(notifyNewsUpdate).not.toHaveBeenCalled();
    },
  );

  it.each([null, 123, '', '&n  ', 'x'.repeat(MAX_NEWS_LENGTH + 1)])(
    'rejects invalid news before persistence (%#)',
    async (content) => {
      const response = await request(app).put('/api/content/news').send({ content });
      expect(response.status).toBe(400);
      expect(setNews).not.toHaveBeenCalled();
    },
  );

  it('announces the current range with complete items only', async () => {
    getNews.mockResolvedValueOnce({
      content:
        '&+R09/15/26 - 09/21/26&n - Title\n- First\n  continuation\n- Second\n09/07/26 - 09/14/26 - Old\n- Older',
    });
    const response = await request(app).post('/api/content/news/announce');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, date: '09/15/26 - 09/21/26', itemCount: 2 });
    expect(notifyNewsUpdate).toHaveBeenCalledWith('09/15/26 - 09/21/26', [
      '- First continuation',
      '- Second',
    ]);
  });

  it('still announces a legacy dated entry', async () => {
    getNews.mockResolvedValueOnce({ content: '12/13/25\n- Legacy' });
    expect((await request(app).post('/api/content/news/announce')).status).toBe(200);
    expect(notifyNewsUpdate).toHaveBeenCalledWith('12/13/25', ['- Legacy']);
  });

  it.each([
    null,
    { content: '' },
    { content: 'Unparseable' },
    { content: '09/15/26 - 09/21/26\n12/13/25\n- Old' },
  ])('does not notify for absent or unparseable latest news (%#)', async (news) => {
    getNews.mockResolvedValueOnce(news);
    expect((await request(app).post('/api/content/news/announce')).status).toBe(400);
    expect(notifyNewsUpdate).not.toHaveBeenCalled();
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

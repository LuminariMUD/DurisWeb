import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const serviceMocks = {
  getPvPEvents: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPvPEventDetail: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getLeaderboard: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPlayerStats: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  searchPvPEvents: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getLocationAutocomplete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPlayerAutocomplete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getKillTimeline: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getActiveHours: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPopularLocations: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getClassMatchups: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getClientStats: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  addBattleLike: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  removeBattleLike: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  addBattleFavorite: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  removeBattleFavorite: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getBattleInteractionStats: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getBattleComments: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  createBattleComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateBattleComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteBattleComment: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getBattleCommentById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getUserFavorites: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};

class TestAppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

jest.unstable_mockModule('../../services/pvpService.js', () => serviceMocks);
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'pvp-session',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../middleware/errorHandler.js', () => ({
  AppError: TestAppError,
  asyncHandler: (handler: any) => (req: any, res: any, next: any) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  },
}));

describe('PvP route input validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: pvpRoutes } = await import('../pvp.js');
    app = express();
    app.use(express.json());
    app.use('/api/pvp', pvpRoutes);
    app.use(
      (
        error: TestAppError,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(error.statusCode || 500).json({ error: error.message });
      },
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMocks.getBattleInteractionStats.mockResolvedValue({ likes: 0 });
    serviceMocks.addBattleLike.mockResolvedValue(true);
    serviceMocks.createBattleComment.mockResolvedValue({ id: 1 });
    serviceMocks.getPvPEvents.mockResolvedValue({ events: [], total: 12 });
    serviceMocks.searchPvPEvents.mockResolvedValue({ events: [], total: 12 });
    serviceMocks.getLocationAutocomplete.mockResolvedValue([]);
    serviceMocks.getPlayerAutocomplete.mockResolvedValue([]);
    serviceMocks.getPopularLocations.mockResolvedValue([]);
    serviceMocks.getUserFavorites.mockResolvedValue({ data: [], total: 12 });
  });

  it.each(['/events', '/search'])(
    'forwards validated sorting and dates through %s',
    async (path) => {
      const response = await request(app).get(
        `/api/pvp${path}?sort_by=likes&date_from=2020-01-01&date_to=2020-01-01`,
      );
      expect(response.status).toBe(200);
      const handler = path === '/events' ? serviceMocks.getPvPEvents : serviceMocks.searchPvPEvents;
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'likes',
          date_from: '2020-01-01',
          date_to: '2020-01-01',
        }),
      );
    },
  );

  it.each([
    'level_min=invalid',
    'level_max=57',
    'level_min=55&level_max=50',
    'level_min=2.5',
    'hour=24',
    'hour=1oops',
    'date_from=2020-02-30',
    'date_to=invalid',
    'date_from=2020-01-02&date_to=2020-01-01',
    'sort_by=unsupported',
    'alignment=invalid',
    'player=one&player=two',
  ])('rejects malformed advanced filters without querying: %s', async (query) => {
    const response = await request(app).get(`/api/pvp/search?${query}`);
    expect(response.status).toBe(400);
    expect(serviceMocks.searchPvPEvents).not.toHaveBeenCalled();
  });

  describe.each([
    { query: '', page: 1, limit: undefined },
    { query: '?page=-1&limit=-1', page: 1, limit: 1 },
    { query: '?page=0&limit=0', page: 1, limit: 1 },
    { query: '?page=invalid&limit=invalid', page: 1, limit: undefined },
    { query: '?page=999999999999999999999&limit=999999', page: 10000, limit: 100 },
    { query: '?page=2&limit=7', page: 2, limit: 7 },
  ])('bounded pagination for $query', ({ query, page, limit }) => {
    it.each([
      ['/events', 'getPvPEvents'],
      ['/search', 'searchPvPEvents'],
    ] as const)('keeps %s query bounds and response metadata consistent', async (path, name) => {
      const response = await request(app).get('/api/pvp' + path + query);
      const expectedLimit = limit ?? 50;

      expect(response.status).toBe(200);
      expect(serviceMocks[name]).toHaveBeenCalledWith(
        expect.objectContaining({ page, limit: expectedLimit }),
      );
      expect(response.body.pagination).toEqual({
        page,
        limit: expectedLimit,
        total: 12,
        totalPages: Math.ceil(12 / expectedLimit),
      });
    });

    it.each([
      ['/players', 'getPlayerAutocomplete'],
      ['/locations', 'getLocationAutocomplete'],
    ] as const)('bounds %s before its SQL service', async (path, name) => {
      const response = await request(app).get('/api/pvp' + path + query);

      expect(response.status).toBe(200);
      expect(serviceMocks[name]).toHaveBeenCalledWith('', page, limit ?? 20);
    });

    it('bounds favorite queries and returned pagination together', async () => {
      const response = await request(app).get('/api/pvp/users/Fixture/favorites' + query);
      const expectedLimit = limit ?? 20;

      expect(response.status).toBe(200);
      expect(serviceMocks.getUserFavorites).toHaveBeenCalledWith('Fixture', page, expectedLimit);
      expect(response.body.pagination).toEqual({
        page,
        limit: expectedLimit,
        total: 12,
        totalPages: Math.ceil(12 / expectedLimit),
      });
    });

    it('bounds popular-location results before its SQL service', async () => {
      const response = await request(app).get('/api/pvp/analytics/popular-locations' + query);

      expect(response.status).toBe(200);
      expect(serviceMocks.getPopularLocations).toHaveBeenCalledWith(limit ?? 10, 'all');
    });
  });

  it('rejects malformed event IDs before public interaction lookup', async () => {
    const response = await request(app).get('/api/pvp/events/12abc/stats');

    expect(response.status).toBe(400);
    expect(serviceMocks.getBattleInteractionStats).not.toHaveBeenCalled();
  });

  it('rejects malformed event IDs before authenticated mutations', async () => {
    const response = await request(app).post('/api/pvp/events/12abc/like').send({});

    expect(response.status).toBe(400);
    expect(serviceMocks.addBattleLike).not.toHaveBeenCalled();
  });

  it('rejects malformed optional comment IDs before creating a comment', async () => {
    const response = await request(app)
      .post('/api/pvp/events/12/comments')
      .send({ content: 'valid comment', characterPid: '7oops' });

    expect(response.status).toBe(400);
    expect(serviceMocks.createBattleComment).not.toHaveBeenCalled();
  });

  it('preserves valid event and comment behavior', async () => {
    const stats = await request(app).get('/api/pvp/events/12/stats');
    const comment = await request(app)
      .post('/api/pvp/events/12/comments')
      .send({ content: 'valid comment', characterPid: 7, lineNumber: 3 });

    expect(stats.status).toBe(200);
    expect(serviceMocks.getBattleInteractionStats).toHaveBeenCalledWith(12, undefined);
    expect(comment.status).toBe(201);
    expect(serviceMocks.createBattleComment).toHaveBeenCalledWith(
      12,
      'Cwial',
      'valid comment',
      7,
      undefined,
      undefined,
      3,
      undefined,
    );
  });
});

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

describe('PvP route ID validation', () => {
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

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let count = 1,
  redisLoaded = false;
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => {
  redisLoaded = true;
  return { getCache: jest.fn(), setCache: jest.fn() };
});
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (_req: express.Request, res: express.Response) =>
    res.status(401).json({ error: 'Authentication required' }),
  requireOverlord: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
const analytics = await import('../webAnalyticsService.js');
beforeEach(() => {
  count = 1;
  query.mockReset();
  query.mockImplementation(async (...args) =>
    typeof args[0] === 'string' && args[0].includes('SELECT COUNT(') ? [[{ count }], []] : [[], []],
  );
});
describe('historical analytics cache retirement', () => {
  it('reads fresh database values and keeps every former cache writer retired', async () => {
    expect((await analytics.getWebOverviewStats()).totalPageViews).toBe(1);
    count = 2;
    expect((await analytics.getWebOverviewStats()).totalPageViews).toBe(2);
    await Promise.all([
      analytics.getTopPages(),
      analytics.getReferrerStats(),
      analytics.getDeviceStats(),
      analytics.getBrowserStats(),
      analytics.getOSStats(),
      analytics.getGeoStats(),
      analytics.getTrafficOverTime(),
    ]);
    expect(query.mock.calls.length).toBeGreaterThan(10);
    expect(redisLoaded).toBe(false);
  });
  it('marks both analytics router mounts no-store before authentication', async () => {
    const router = (await import('../../routes/webAnalytics.js')).default;
    const app = express();
    app.use('/api/analytics', router);
    app.use('/api/admin/analytics/web', router);
    for (const prefix of ['/api/analytics', '/api/admin/analytics/web']) {
      const response = await request(app).get(prefix + '/admin/overview');
      expect(response.status).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.vary).toContain('Cookie');
    }
  });
});

import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const trackPageView = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireOverlord: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../services/webAnalyticsService.js', () => ({
  trackPageView,
  getWebOverviewStats: jest.fn(),
  getTopPages: jest.fn(),
  getReferrerStats: jest.fn(),
  getDeviceStats: jest.fn(),
  getBrowserStats: jest.fn(),
  getOSStats: jest.fn(),
  getGeoStats: jest.fn(),
  getTrafficOverTime: jest.fn(),
  getRealtimeVisitors: jest.fn(),
  getActiveVisitorCount: jest.fn(),
  getRecentVisitors: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('web analytics tracking validation', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: webAnalyticsRoutes } = await import('../webAnalytics.js');
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/analytics', webAnalyticsRoutes);
  });

  beforeEach(() => {
    trackPageView.mockReset().mockResolvedValue(undefined);
  });

  it('rejects unknown tracking fields before persistence', async () => {
    const response = await request(app)
      .post('/api/analytics/track')
      .set('X-Forwarded-For', '10.0.0.10')
      .send({ sessionId: 'a'.repeat(64), path: '/', unexpected: 'nope' });

    expect(response.status).toBe(400);
    expect(trackPageView).not.toHaveBeenCalled();
  });

  it('rejects oversized and wrongly typed tracking fields before persistence', async () => {
    const response = await request(app)
      .post('/api/analytics/track')
      .set('X-Forwarded-For', '10.0.0.11')
      .send({
        sessionId: 'a'.repeat(64),
        path: `/${'x'.repeat(2048)}`,
        screenWidth: 'wide',
      });

    expect(response.status).toBe(400);
    expect(trackPageView).not.toHaveBeenCalled();
  });

  it('accepts a bounded tracking event and passes server-derived request metadata', async () => {
    const response = await request(app)
      .post('/api/analytics/track')
      .set('X-Forwarded-For', '10.0.0.12')
      .set('User-Agent', 'T024-test-agent')
      .send({
        sessionId: 'a'.repeat(64),
        path: '/news',
        pageTitle: 'News',
        referrer: 'https://example.test/start',
        utmSource: 'test',
        screenWidth: 390,
        screenHeight: 844,
        loadTimeMs: 120,
      });

    expect(response.status).toBe(200);
    expect(trackPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'a'.repeat(64),
        path: '/news',
        userAgent: 'T024-test-agent',
        ipAddress: '10.0.0.12',
      }),
    );
  });

  it('rate-limits repeated tracking events from one client', async () => {
    const payload = { sessionId: 'b'.repeat(64), path: '/page' };
    let lastResponse;

    for (let attempt = 0; attempt < 61; attempt += 1) {
      lastResponse = await request(app)
        .post('/api/analytics/track')
        .set('X-Forwarded-For', '10.0.0.13')
        .send(payload);
    }

    expect(lastResponse!.status).toBe(429);
    expect(trackPageView).toHaveBeenCalledTimes(60);
  });
});

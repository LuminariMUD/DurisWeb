import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const databaseQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const provider = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const passthrough: RequestHandler = (_req, _res, next) => next();

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  requireAuth: passthrough,
  requireOverlord: passthrough,
}));
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query: databaseQuery } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}));
jest.unstable_mockModule('../../utils/geoip.js', () => ({ geolocateIP: provider }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const mounts = ['/api/analytics', '/api/admin/analytics/web'];
const legacyPayload = {
  sessionId: 'a'.repeat(64),
  path: '/account/private?token=private-sentinel',
  pageTitle: 'Private title sentinel',
  referrer: 'https://example.test/private-sentinel',
  screenWidth: 390,
  screenHeight: 844,
  utmSource: 'private-sentinel',
};

describe('closed optional website analytics collection', () => {
  let app: express.Express;
  let protectedApp: express.Express;

  beforeAll(async () => {
    const { default: routes } = await import('../webAnalytics.js');
    const { verifyCsrfToken } = await import('../../middleware/csrf.js');
    app = express();
    protectedApp = express();
    app.use(express.json());
    protectedApp.use(express.json(), cookieParser(), verifyCsrfToken);
    for (const mount of mounts) {
      app.use(mount, routes);
      protectedApp.use(mount, routes);
    }
  });

  beforeEach(() => {
    databaseQuery.mockReset().mockResolvedValue([[], []]);
    provider.mockReset().mockResolvedValue(null);
  });

  it.each(mounts)(
    'refuses legacy clients at %s without SQL or provider transfers',
    async (mount) => {
      const response = await request(app)
        .post(`${mount}/track`)
        .set('User-Agent', 'private-agent-sentinel')
        .send(legacyPayload);
      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        error: 'Optional website analytics collection is unavailable',
      });
      expect(databaseQuery).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it.each(mounts)('a client consent claim cannot enable collection at %s', async (mount) => {
    const response = await request(app)
      .post(`${mount}/track`)
      .send({ ...legacyPayload, consent: true, policyVersion: 'forged' });
    expect(response.status).toBe(410);
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it.each(mounts)('has no tracking CSRF exemption at %s', async (mount) => {
    const denied = await request(protectedApp).post(`${mount}/track`).send(legacyPayload);
    expect(denied.status).toBe(403);
    const unavailable = await request(protectedApp)
      .post(`${mount}/track`)
      .set('Cookie', 'csrf_token=matching-token')
      .set('x-csrf-token', 'matching-token')
      .send(legacyPayload);
    expect(unavailable.status).toBe(410);
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('preserves the protected read-only dashboard', async () => {
    const response = await request(app).get('/api/admin/analytics/web/admin/pages');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(databaseQuery).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
  });
});

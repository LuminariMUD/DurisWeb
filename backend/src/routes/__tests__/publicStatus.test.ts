import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCache = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const setCache = jest.fn<(...args: unknown[]) => Promise<void>>();
const getServerHealth = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let delayHours = 6;
jest.unstable_mockModule('../../db/connection.js', () => ({ mudPool: { query }, pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({ getCache, setCache }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({ publicPopulationDelayHours: delayHours }),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn: jest.fn() },
}));
jest.unstable_mockModule('../../services/serverHealthService.js', () => ({
  getServerHealth,
  getHealthStatus: () => ({ status: 'operational', message: 'Healthy' }),
}));

let app: express.Express;
beforeAll(async () => {
  const { default: routes } = await import('../status.js');
  app = express();
  app.use('/api/status', routes);
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-10-19T12:30:00Z'));
  delayHours = 6;
  getCache.mockResolvedValue(null);
  setCache.mockResolvedValue(undefined);
  query.mockResolvedValue([[{ average: '3.5', samples: 12, invalid_samples: 0 }]]);
  getServerHealth.mockResolvedValue({
    mudIsRunning: true,
    mudUptimeSeconds: 123,
    onlinePlayers: 999,
  });
});
afterEach(() => {
  jest.useRealTimers();
});

const status = () => request(app).get('/api/status');

describe('public population boundary', () => {
  it('publishes a rounded historical hour independently of live staff health', async () => {
    const response = await status();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toHaveProperty('onlinePlayers');
    expect(response.body).toMatchObject({ mudIsRunning: true, uptimeSeconds: 123 });
    expect(response.body.population).toEqual({
      estimate: 4,
      windowStart: '2026-10-19T05:00:00.000Z',
      windowEnd: '2026-10-19T06:00:00.000Z',
      delayHours: 6,
      label: 'Population — 6-hour delayed estimate',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('date >= ? AND date < ?'), [
      Date.parse('2026-10-19T05:00:00Z') / 1000,
      Date.parse('2026-10-19T06:00:00Z') / 1000,
    ]);
    expect(JSON.stringify(response.body)).not.toContain('999');
  });

  it('uses fixed UTC epochs across polls, source identities and the hour boundary', async () => {
    const first = await status();
    jest.setSystemTime(new Date('2026-10-19T12:59:59.999Z'));
    getServerHealth.mockResolvedValue({
      mudIsRunning: true,
      mudUptimeSeconds: 456,
      onlinePlayers: 1,
    });
    const second = await request(app).get('/api/status').set('X-Forwarded-For', '192.0.2.1');
    expect(second.body.population).toEqual(first.body.population);
    jest.setSystemTime(new Date('2026-10-19T13:00:00Z'));
    expect((await status()).body.population.windowEnd).toBe('2026-10-19T07:00:00.000Z');
  });

  it('reuses only eligible cache entries after policy changes or a backwards clock', async () => {
    delayHours = 3;
    const fresh = (await status()).body.population;
    const key = getCache.mock.calls[0]?.[0];
    getCache.mockResolvedValue(fresh);
    delayHours = 6;
    expect((await status()).body.population.windowEnd).toBe('2026-10-19T06:00:00.000Z');
    expect(getCache.mock.calls[1]?.[0]).not.toBe(key);
    jest.setSystemTime(new Date('2026-10-19T11:30:00Z'));
    expect((await status()).body.population.windowEnd).toBe('2026-10-19T05:00:00.000Z');
    delayHours = 3;
    expect((await status()).body.population.windowEnd).toBe('2026-10-19T08:00:00.000Z');
  });

  it('preserves cached sample times without serializing extra cached fields', async () => {
    const historical = (await status()).body.population;
    getCache.mockResolvedValue({ ...historical, onlinePlayers: 999, wholist: ['secret'] });
    query.mockClear();
    expect((await status()).body.population).toEqual(historical);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [{ average: null, samples: 0, invalid_samples: 0 }],
    [{ average: '2', samples: 5, invalid_samples: 1 }],
    [{ average: '-1', samples: 5, invalid_samples: 0 }],
    [{ average: 'bad', samples: 5, invalid_samples: 0 }],
    [{ average: 2, samples: 'bad', invalid_samples: 0 }],
  ])('withholds missing or corrupt history: %j', async (...rows) => {
    query.mockResolvedValue([rows]);
    expect((await status()).body.population.estimate).toBeNull();
    expect(setCache).not.toHaveBeenCalled();
  });

  it('distinguishes a recorded zero from absent history', async () => {
    query.mockResolvedValue([[{ average: '0', samples: 12, invalid_samples: 0 }]]);
    expect((await status()).body.population.estimate).toBe(0);
  });

  it('keeps health available when history or cache fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await status()).body).toMatchObject({
      mudIsRunning: true,
      population: { estimate: null },
    });
    getCache.mockRejectedValueOnce(new Error('cache unavailable'));
    expect((await status()).body).toMatchObject({
      mudIsRunning: true,
      population: { estimate: null },
    });
  });

  it('withholds population on health errors instead of inventing zero', async () => {
    getServerHealth.mockRejectedValueOnce(new Error('health unavailable'));
    const response = await status();
    expect(response.status).toBe(500);
    expect(response.body.population.estimate).toBeNull();
    expect(response.body).not.toHaveProperty('onlinePlayers');
  });

  it('rechecks the cutoff after asynchronous reads', async () => {
    query.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date('2026-10-19T10:00:00Z'));
      return [[{ average: 4, samples: 12, invalid_samples: 0 }]];
    });
    expect((await status()).body.population.estimate).toBeNull();
  });
});

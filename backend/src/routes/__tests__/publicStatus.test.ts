import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

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
beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-10-19T12:30:00Z'));
  const { default: routes } = await import('../status.js');
  app = express();
  app.use('/api/status', routes);
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
    expect(setCache).toHaveBeenCalledWith(expect.any(String), response.body.population, 600);
  });

  it('uses fixed UTC epochs across polls, source identities and the hour boundary', async () => {
    const first = await status();
    jest.advanceTimersByTime(30 * 60 * 1000 - 1);
    getServerHealth.mockResolvedValue({
      mudIsRunning: true,
      mudUptimeSeconds: 456,
      onlinePlayers: 1,
    });
    const second = await request(app).get('/api/status').set('X-Forwarded-For', '192.0.2.1');
    expect(second.body.population).toEqual(first.body.population);
    jest.advanceTimersByTime(1);
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
    expect(setCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        estimate: null,
        windowStart: '2026-10-19T05:00:00.000Z',
        windowEnd: '2026-10-19T06:00:00.000Z',
      }),
      60,
    );
  });

  it.each([
    { delayHours: 3 },
    { windowStart: '2026-10-19T04:00:00.000Z' },
    { windowEnd: '2026-10-19T07:00:00.000Z' },
    { windowStart: null, windowEnd: null },
  ])('rejects a mismatched unavailable cache sentinel: %j', async (mismatch) => {
    getCache.mockResolvedValue({
      estimate: null,
      delayHours: 6,
      windowStart: '2026-10-19T05:00:00.000Z',
      windowEnd: '2026-10-19T06:00:00.000Z',
      ...mismatch,
    });
    expect((await status()).body.population.estimate).toBe(4);
    expect(query).toHaveBeenCalledTimes(1);
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

  it('withholds a forward clock jump before the first request until the clock is corrected', async () => {
    jest.setSystemTime(new Date('2026-10-19T15:30:00Z'));
    expect((await status()).body.population.estimate).toBeNull();
    expect(getCache).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect((await status()).body.population.estimate).toBeNull();
    jest.setSystemTime(new Date('2026-10-19T12:31:00Z'));
    expect((await status()).body.population.estimate).toBe(4);
  });

  it.each(['cache read', 'history read', 'cache write', 'health read'])(
    'withholds a forward clock jump during %s',
    async (stage) => {
      const jump = () => jest.setSystemTime(new Date('2026-10-19T15:30:00Z'));
      if (stage === 'cache read') {
        const cached = (await status()).body.population;
        getCache.mockImplementationOnce(async () => {
          jump();
          return cached;
        });
      } else if (stage === 'history read') {
        query.mockImplementationOnce(async () => {
          jump();
          return [[{ average: 4, samples: 12, invalid_samples: 0 }]];
        });
      } else if (stage === 'cache write') {
        setCache.mockImplementationOnce(async () => {
          jump();
        });
      } else {
        getServerHealth.mockImplementationOnce(async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          jump();
          return { mudIsRunning: true, mudUptimeSeconds: 123, onlinePlayers: 999 };
        });
      }
      expect((await status()).body.population.estimate).toBeNull();
    },
  );

  it('does not let sub-second forward drift advance the publication hour', async () => {
    jest.advanceTimersByTime(30 * 60 * 1000 - 500);
    jest.setSystemTime(new Date('2026-10-19T13:00:00Z'));
    expect((await status()).body.population.windowEnd).toBe('2026-10-19T06:00:00.000Z');
  });

  it('caches unavailable hours briefly and permits a later backfill', async () => {
    const cache = new Map<string, { value: unknown; expires: number }>();
    getCache.mockImplementation(async (key) => {
      const entry = cache.get(String(key));
      return entry && entry.expires > Date.now() ? entry.value : null;
    });
    setCache.mockImplementation(async (key, value, ttl) => {
      cache.set(String(key), { value, expires: Date.now() + Number(ttl) * 1000 });
    });
    query.mockResolvedValueOnce([[{ average: null, samples: 0, invalid_samples: 0 }]]);
    const missing = (await status()).body.population;
    expect(missing).toMatchObject({ estimate: null, windowStart: null, windowEnd: null });
    expect((await status()).body.population).toEqual(missing);
    expect(query).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect((await status()).body.population.estimate).toBe(4);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(['cache read', 'history read', 'cache write'])(
    'returns current health within two seconds of a stalled %s and bounds pending work',
    async (stage) => {
      let finish: (value: unknown) => void = () => {};
      let started: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const stalled = new Promise<unknown>((resolve) => {
        finish = resolve;
      });
      const dependency =
        stage === 'cache read' ? getCache : stage === 'history read' ? query : setCache;
      const wait = () => {
        started();
        return stalled;
      };
      if (stage === 'cache write')
        setCache.mockImplementationOnce(async () => {
          await wait();
        });
      else if (stage === 'cache read') getCache.mockImplementationOnce(wait);
      else query.mockImplementationOnce(wait);
      const first = status().then((response) => response);
      await entered;
      await jest.advanceTimersByTimeAsync(2000);
      const firstResponse = await first;
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toMatchObject({
        mudIsRunning: true,
        uptimeSeconds: 123,
        population: { estimate: null },
      });
      const healthEntered = new Promise<void>((resolve) => {
        getServerHealth.mockImplementationOnce(async () => {
          resolve();
          return { mudIsRunning: true, mudUptimeSeconds: 456 };
        });
      });
      const second = status().then((response) => response);
      await healthEntered;
      expect(jest.getTimerCount()).toBe(0);
      expect((await second).body).toMatchObject({
        mudIsRunning: true,
        uptimeSeconds: 456,
        population: { estimate: null },
      });
      expect(dependency).toHaveBeenCalledTimes(1);
      // Resolve the original read and prove subsequent requests recover.
      finish(
        stage === 'history read' ? [[{ average: 4, samples: 12, invalid_samples: 0 }]] : undefined,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await status()).body.population.estimate).toBe(4);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('recovers after a timed-out history read eventually rejects', async () => {
    let fail: (reason: Error) => void = () => {};
    let started: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    query.mockImplementationOnce(() => {
      started();
      return new Promise((_, reject) => {
        fail = reject;
      });
    });
    const response = status().then((result) => result);
    await entered;
    await jest.advanceTimersByTimeAsync(2000);
    expect((await response).body.population.estimate).toBeNull();
    fail(new Error('late database failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await status()).body.population.estimate).toBe(4);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rechecks the cutoff after asynchronous reads', async () => {
    query.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date('2026-10-19T10:00:00Z'));
      return [[{ average: 4, samples: 12, invalid_samples: 0 }]];
    });
    expect((await status()).body.population.estimate).toBeNull();
  });
});

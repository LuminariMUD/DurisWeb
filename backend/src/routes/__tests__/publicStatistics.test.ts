import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCache = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const setCache = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule('../../db/connection.js', () => ({ mudPool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({ getCache, setCache }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));

let app: express.Express;
beforeAll(async () => {
  const { default: routes } = await import('../publicStatistics.js');
  app = express();
  app.use('/statistics', routes);
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-10-18T11:00:00Z'));
  getCache.mockResolvedValue(null);
  setCache.mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('public faction activity', () => {
  it('lists only complete UTC days ending at least 24 hours ago and reads the newest offered day', async () => {
    query.mockResolvedValueOnce([[{ utc_day: 20742 }, { utc_day: 20741 }]]);
    const dates = await request(app).get('/statistics/available-dates');
    expect(dates.status).toBe(200);
    expect(dates.body.dates).toEqual(['2026-10-16', '2026-10-15']);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE date < ?'), [1792195200]);
    expect(query.mock.calls[0]?.[0]).not.toContain('FROM_UNIXTIME');

    const points = [{ timestamp: 1792108800, goods: 3, evils: 2, neutrals: 1, undeads: 4 }];
    query.mockResolvedValueOnce([points]);
    const activity = await request(app).get(
      `/statistics/faction-activity?date=${dates.body.dates[0]}`,
    );
    expect(activity.status).toBe(200);
    expect(activity.body.data).toEqual(points);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('date >= ? AND date < ?'),
      [1792108800, 1792195200],
    );
  });

  it.each(['2026-10-17', '2026-10-18', '2026-10-19'])(
    'withholds %s even if a cache entry exists',
    async (date) => {
      getCache.mockResolvedValue([{ timestamp: 1792195200, goods: 10 }]);
      const response = await request(app).get(`/statistics/faction-activity?date=${date}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(query).not.toHaveBeenCalled();
      expect(getCache).not.toHaveBeenCalled();
    },
  );

  it('releases the next day at UTC midnight without reusing the previous date-list cache', async () => {
    query.mockResolvedValue([[]]);
    jest.setSystemTime(new Date('2026-10-18T23:59:59Z'));
    await request(app).get('/statistics/available-dates');
    const oldKey = getCache.mock.calls[0]?.[0];
    jest.setSystemTime(new Date('2026-10-19T00:00:00Z'));
    await request(app).get('/statistics/available-dates');
    expect(getCache.mock.calls[1]?.[0]).not.toBe(oldKey);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [1792281600]);
    await request(app).get('/statistics/faction-activity?date=2026-10-17');
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [1792195200, 1792281600]);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', 'invalid', '2026-10-16&date=2026-10-15'])(
    'rejects invalid calendar date %s',
    async (date) => {
      const response = await request(app).get(`/statistics/faction-activity?date=${date}`);
      expect(response.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(['available-dates', 'faction-activity?date=2026-10-16'])(
    'reports database failure for %s instead of caching an empty result',
    async (path) => {
      query.mockRejectedValueOnce(new Error('database unavailable'));
      const response = await request(app).get(`/statistics/${path}`);
      expect(response.status).toBe(500);
      expect(setCache).not.toHaveBeenCalled();
    },
  );

  it('preserves zero counts and reuses cached historical results', async () => {
    const points = [{ timestamp: 1792108800, goods: 0, evils: 0, neutrals: 0, undeads: 0 }];
    getCache.mockResolvedValueOnce(points);
    const response = await request(app).get('/statistics/faction-activity?date=2026-10-16');
    expect(response.body.data).toEqual(points);
    expect(query).not.toHaveBeenCalled();
  });
});

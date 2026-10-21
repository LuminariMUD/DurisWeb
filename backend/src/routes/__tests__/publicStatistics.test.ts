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

describe('public faction overlap', () => {
  const cutoff = 1792195200; // 2026-10-17T00:00:00Z, the publication cutoff on October 18
  const hourRow = {
    utc_hour: 0,
    samples: 672,
    both_samples: '88',
    goods_peak: 3,
    goods_average: '0.3125',
    evils_peak: 6,
    evils_average: '0.9702',
    goods_average_while_both: '1.5000',
    evils_average_while_both: '2.2727',
    first_sample: 1790985629,
    last_sample: 1792112400,
  };

  it('summarizes the newest 14 published days by UTC hour by default', async () => {
    query.mockResolvedValueOnce([
      [
        hourRow,
        {
          ...hourRow,
          utc_hour: 21,
          both_samples: 0,
          goods_average_while_both: null,
          evils_average_while_both: null,
          first_sample: 1791061200,
          last_sample: 1792184400,
        },
      ],
    ]);
    const response = await request(app).get('/statistics/faction-overlap');
    expect(response.status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('date >= ? AND date < ?'), [
      cutoff - 14 * 86400,
      cutoff,
    ]);
    expect(query.mock.calls[0]?.[0]).not.toContain('FROM_UNIXTIME');
    expect(response.body).toMatchObject({
      days: 14,
      firstDate: '2026-10-03',
      lastDate: '2026-10-16',
      samples: 1344,
    });
    expect(response.body.hours).toHaveLength(24);
    expect(response.body.hours[0]).toEqual({
      utcHour: 0,
      samples: 672,
      bothSamples: 88,
      goodsPeak: 3,
      goodsAverage: 0.31,
      evilsPeak: 6,
      evilsAverage: 0.97,
      goodsAverageWhileBoth: 1.5,
      evilsAverageWhileBoth: 2.27,
    });
    expect(response.body.hours[21]).toMatchObject({ bothSamples: 0, goodsAverageWhileBoth: 0 });
    expect(response.body.hours[5]).toMatchObject({ utcHour: 5, samples: 0, bothSamples: 0 });
    expect(setCache).toHaveBeenCalledWith(
      `public_stats:v2:faction_overlap:14:${cutoff}`,
      response.body,
      600,
    );
  });

  it.each([7, 30])('accepts a %i day window ending at the publication cutoff', async (days) => {
    query.mockResolvedValueOnce([[]]);
    const response = await request(app).get(`/statistics/faction-overlap?days=${days}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ days, firstDate: null, lastDate: null, samples: 0 });
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [cutoff - days * 86400, cutoff]);
  });

  it.each(['15', '0', '-7', '007', 'abc', '7.5', '7&days=14'])(
    'rejects unsupported window %s',
    async (days) => {
      const response = await request(app).get(`/statistics/faction-overlap?days=${days}`);
      expect(response.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('moves to a new cache entry and window at UTC midnight', async () => {
    query.mockResolvedValue([[]]);
    jest.setSystemTime(new Date('2026-10-18T23:59:59Z'));
    await request(app).get('/statistics/faction-overlap?days=7');
    jest.setSystemTime(new Date('2026-10-19T00:00:00Z'));
    await request(app).get('/statistics/faction-overlap?days=7');
    expect(getCache.mock.calls[1]?.[0]).not.toBe(getCache.mock.calls[0]?.[0]);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [
      cutoff + 86400 - 7 * 86400,
      cutoff + 86400,
    ]);
  });

  it('reuses a cached summary without querying', async () => {
    const cached = { days: 14, firstDate: null, lastDate: null, samples: 0, hours: [] };
    getCache.mockResolvedValueOnce(cached);
    const response = await request(app).get('/statistics/faction-overlap');
    expect(response.body).toEqual(cached);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['database failure', () => query.mockRejectedValueOnce(new Error('database unavailable'))],
    ['an out-of-range hour', () => query.mockResolvedValueOnce([[{ ...hourRow, utc_hour: 24 }]])],
    ['a negative count', () => query.mockResolvedValueOnce([[{ ...hourRow, goods_peak: -1 }]])],
    [
      'more overlap than samples',
      () => query.mockResolvedValueOnce([[{ ...hourRow, both_samples: 700 }]]),
    ],
  ])('reports %s instead of caching a summary', async (_label, arrange) => {
    arrange();
    const response = await request(app).get('/statistics/faction-overlap');
    expect(response.status).toBe(500);
    expect(setCache).not.toHaveBeenCalled();
  });
});

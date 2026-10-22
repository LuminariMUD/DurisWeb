import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCache = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const setCache = jest.fn<(...args: unknown[]) => Promise<void>>();
const release = jest.fn();
const destroy = jest.fn();
const getConnection = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../db/connection.js', () => ({ mudPool: { query, getConnection } }));
jest.unstable_mockModule('../../db/redis.js', () => ({ getCache, setCache }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: { error: jest.fn() } }));

let app: express.Express;
beforeEach(async () => {
  jest.resetModules();
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-10-18T11:00:00Z'));
  const { default: routes } = await import('../publicStatistics.js');
  app = express();
  app.use('/statistics', routes);
  getCache.mockResolvedValue(null);
  setCache.mockResolvedValue(undefined);
  getConnection.mockResolvedValue({ query, release, destroy });
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
    jest.advanceTimersByTime(13 * 3600_000 - 1000);
    await request(app).get('/statistics/available-dates');
    const oldKey = getCache.mock.calls[0]?.[0];
    jest.advanceTimersByTime(1000);
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
    hour_start: 1790985600,
    invalid_samples: 0,
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

  it('preserves dated UTC hours over the newest 14 published days by default', async () => {
    query.mockResolvedValueOnce([
      [
        hourRow,
        {
          ...hourRow,
          hour_start: 1792184400,
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
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('date >= ? AND date < ?'),
        values: [cutoff - 14 * 86400, cutoff],
        timeout: 2500,
      }),
    );
    expect(response.body).toMatchObject({
      days: 14,
      firstDate: '2026-10-03',
      lastDate: '2026-10-16',
      samples: 1344,
    });
    expect(response.body.hours).toHaveLength(2);
    expect(response.body.hours[0]).toEqual({
      timestamp: 1790985600,
      samples: 672,
      bothSamples: 88,
      goodsPeak: 3,
      goodsAverage: 0.3125,
      evilsPeak: 6,
      evilsAverage: 0.9702,
      goodsAverageWhileBoth: 1.5,
      evilsAverageWhileBoth: 2.2727,
    });
    expect(response.body.hours[1]).toMatchObject({ bothSamples: 0, goodsAverageWhileBoth: 0 });
    expect(release).toHaveBeenCalledTimes(1);
    expect(setCache).toHaveBeenCalledWith(
      `public_stats:v2:faction_overlap:v2:14:${cutoff}`,
      response.body,
      600,
    );
  });

  it.each([7, 30])('accepts a %i day window ending at the publication cutoff', async (days) => {
    query.mockResolvedValueOnce([[]]);
    const response = await request(app).get(`/statistics/faction-overlap?days=${days}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ days, firstDate: null, lastDate: null, samples: 0 });
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: [cutoff - days * 86400, cutoff] }),
    );
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
    jest.advanceTimersByTime(13 * 3600_000 - 1000);
    await request(app).get('/statistics/faction-overlap?days=7');
    jest.advanceTimersByTime(1000);
    await request(app).get('/statistics/faction-overlap?days=7');
    expect(getCache.mock.calls[1]?.[0]).not.toBe(getCache.mock.calls[0]?.[0]);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: [cutoff + 86400 - 7 * 86400, cutoff + 86400] }),
    );
  });

  it('reuses a cached summary without querying', async () => {
    const cached = { days: 14, firstDate: null, lastDate: null, samples: 0, hours: [] };
    getCache.mockResolvedValueOnce(cached);
    const response = await request(app).get('/statistics/faction-overlap');
    expect(response.body).toEqual(cached);
    expect(query).not.toHaveBeenCalled();
  });

  it('withholds a forward clock jump before reading even an existing cache', async () => {
    jest.setSystemTime(new Date('2026-10-19T11:00:00Z'));
    const response = await request(app).get('/statistics/faction-overlap');
    expect(response.status).toBe(503);
    expect(getCache).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-10-18T11:00:00Z'));
    query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(200);
  });

  it('recovers on conservative monotonic time after a permanent forward clock correction', async () => {
    query.mockResolvedValue([[]]);
    jest.setSystemTime(new Date('2026-10-19T11:00:00Z'));
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(503);
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: [cutoff - 14 * 86400, cutoff] }),
    );
    expect((await request(app).get('/statistics/available-dates')).status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [cutoff]);
    jest.advanceTimersByTime(13 * 3600_000);
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: [cutoff - 13 * 86400, cutoff + 86400] }),
    );
    expect((await request(app).get('/statistics/faction-activity?date=2026-10-17')).status).toBe(
      200,
    );
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [cutoff, cutoff + 86400]);
    query.mockClear();
    expect(
      (await request(app).get('/statistics/faction-activity?date=2026-10-18')).body.data,
    ).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['cache read', 'SQL read', 'cache write'])(
    'withholds a clock jump during %s',
    async (stage) => {
      const jump = () => jest.setSystemTime(new Date('2026-10-19T11:00:00Z'));
      query.mockResolvedValue([[]]);
      if (stage === 'cache read')
        getCache.mockImplementationOnce(async () => {
          jump();
          return { days: 14, samples: 999, hours: [] };
        });
      if (stage === 'SQL read')
        query.mockImplementationOnce(async () => {
          jump();
          return [[]];
        });
      if (stage === 'cache write')
        setCache.mockImplementationOnce(async () => {
          jump();
        });
      const response = await request(app).get('/statistics/faction-overlap');
      expect(response.status).toBe(503);
      expect(response.body).not.toHaveProperty('hours');
      if (stage !== 'cache write') expect(setCache).not.toHaveBeenCalled();
    },
  );

  it('withholds a result that became too fresh during a clock rollback', async () => {
    query.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date('2026-10-17T23:00:00Z'));
      return [[hourRow]];
    });
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(503);
    expect(setCache).not.toHaveBeenCalled();
  });

  it('shares concurrent cache misses by window and recovers after failed SQL', async () => {
    const { getFactionOverlap } = await import('../../services/publicStatisticsService.js');
    let finish: (value: unknown) => void = () => {};
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const reads = Array.from({ length: 20 }, () => getFactionOverlap(30));
    await new Promise(setImmediate);
    expect(query).toHaveBeenCalledTimes(1);
    expect(getCache).toHaveBeenCalledTimes(1);
    finish([[]]);
    expect(await Promise.all(reads)).toHaveLength(20);
    jest.advanceTimersByTime(10 * 60_000);
    query.mockRejectedValueOnce(new Error('Query inactivity timeout'));
    await expect(getFactionOverlap(30)).rejects.toThrow('Query inactivity timeout');
    expect(destroy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    query.mockResolvedValueOnce([[]]);
    await expect(getFactionOverlap(30)).resolves.toMatchObject({ samples: 0 });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('reuses completed summaries when Redis cannot retain cache entries', async () => {
    const { getFactionOverlap } = await import('../../services/publicStatisticsService.js');
    query.mockResolvedValue([[]]);
    for (let index = 0; index < 20; index++) await getFactionOverlap(14);
    expect(query).toHaveBeenCalledTimes(1);
    expect(getCache).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * 60_000);
    await getFactionOverlap(14);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('backs off after failed SQL instead of repeating work for every visitor', async () => {
    const { getFactionOverlap } = await import('../../services/publicStatisticsService.js');
    query.mockRejectedValue(new Error('Query inactivity timeout'));
    for (let index = 0; index < 20; index++) {
      await expect(getFactionOverlap(14)).rejects.toThrow();
    }
    expect(query).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    query.mockResolvedValueOnce([[]]);
    await expect(getFactionOverlap(14)).resolves.toMatchObject({ samples: 0 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(['cache read', 'pool acquisition', 'cache write'])(
    'bounds a stalled %s and does not accumulate replacement reads',
    async (stage) => {
      const { getFactionOverlap, PublicStatisticsUnavailableError } = await import(
        '../../services/publicStatisticsService.js'
      );
      let finish: (value: unknown) => void = () => {};
      const stalled = new Promise((resolve) => {
        finish = resolve;
      });
      query.mockResolvedValue([[]]);
      if (stage === 'cache read') getCache.mockReturnValueOnce(stalled);
      if (stage === 'pool acquisition') getConnection.mockReturnValueOnce(stalled);
      if (stage === 'cache write') setCache.mockReturnValueOnce(stalled.then(() => {}));
      const response = expect(getFactionOverlap(14)).rejects.toBeInstanceOf(
        PublicStatisticsUnavailableError,
      );
      await new Promise(setImmediate);
      jest.advanceTimersByTime(4000);
      await response;
      jest.advanceTimersByTime(60_000);
      for (let index = 0; index < 20; index++) {
        await expect(getFactionOverlap(14)).rejects.toBeInstanceOf(
          PublicStatisticsUnavailableError,
        );
      }
      expect(getCache).toHaveBeenCalledTimes(1);
      expect(getConnection).toHaveBeenCalledTimes(stage === 'cache read' ? 0 : 1);
      finish(stage === 'pool acquisition' ? { query, release, destroy } : null);
      await new Promise(setImmediate);
      expect(query).toHaveBeenCalledTimes(stage === 'cache write' ? 1 : 0);
      expect(release).toHaveBeenCalledTimes(stage === 'cache read' ? 0 : 1);
      jest.advanceTimersByTime(60_000);
      await expect(getFactionOverlap(14)).resolves.toMatchObject({ samples: 0 });
    },
  );

  it('returns 503 and destroys the connection when a query outlives the whole-read deadline', async () => {
    let finish: (value: unknown) => void = () => {};
    let started: () => void = () => {};
    const queryStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    query.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const response = request(app)
      .get('/statistics/faction-overlap')
      .then((value) => value);
    await queryStarted;
    jest.advanceTimersByTime(4000);
    expect((await response).status).toBe(503);
    expect(destroy).toHaveBeenCalledTimes(1);
    finish([[]]);
    await new Promise(setImmediate);
    expect(release).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
  });

  it('keeps at most three stalled reads even across publication-day changes', async () => {
    const { getFactionOverlap, PublicStatisticsUnavailableError } = await import(
      '../../services/publicStatisticsService.js'
    );
    getCache.mockImplementation(() => new Promise(() => {}));
    const responses = ([7, 14, 30] as const).map((days) =>
      expect(getFactionOverlap(days)).rejects.toBeInstanceOf(PublicStatisticsUnavailableError),
    );
    jest.advanceTimersByTime(4000);
    await Promise.all(responses);
    for (let day = 0; day < 3; day++) {
      jest.advanceTimersByTime(24 * 3600_000);
      for (const days of [7, 14, 30] as const) {
        await expect(getFactionOverlap(days)).rejects.toBeInstanceOf(
          PublicStatisticsUnavailableError,
        );
      }
    }
    expect(getCache).toHaveBeenCalledTimes(3);
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('rate limits the public route before another cache or SQL read', async () => {
    query.mockResolvedValue([[]]);
    for (let index = 0; index < 30; index++) {
      expect((await request(app).get('/statistics/faction-overlap')).status).toBe(200);
    }
    expect((await request(app).get('/statistics/faction-overlap')).status).toBe(429);
    expect(getCache).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['database failure', () => query.mockRejectedValueOnce(new Error('database unavailable'))],
    [
      'an unpublished hour',
      () => query.mockResolvedValueOnce([[{ ...hourRow, hour_start: cutoff }]]),
    ],
    [
      'a malformed source sample',
      () => query.mockResolvedValueOnce([[{ ...hourRow, invalid_samples: 1 }]]),
    ],
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

import { afterAll, describe, expect, it, jest } from '@jest/globals';

import { closeRedisConnection } from '../../db/redis.js';
import { getHealthSnapshot, type HealthDependencies } from '../healthService.js';

afterAll(async () => {
  await closeRedisConnection();
});

function dependencies(database: boolean, cache: boolean): HealthDependencies {
  return {
    checkDatabase: jest.fn(async () => database),
    checkCache: jest.fn(async () => cache),
    now: () => new Date('2026-09-01T12:00:00.000Z'),
    uptime: () => 42,
  };
}

describe('health readiness snapshot', () => {
  it('reports ok only when both persistent dependencies answer', async () => {
    await expect(getHealthSnapshot(dependencies(true, true))).resolves.toEqual({
      status: 'ok',
      service: 'durisweb-backend',
      checks: {
        database: 'ok',
        cache: 'ok',
      },
      timestamp: '2026-09-01T12:00:00.000Z',
      uptime: 42,
    });
  });

  it.each([
    [false, true, 'database'],
    [true, false, 'cache'],
    [false, false, 'database and cache'],
  ])('reports degraded when %s/%s leaves %s unavailable', async (database, cache) => {
    const snapshot = await getHealthSnapshot(dependencies(database, cache));

    expect(snapshot.status).toBe('degraded');
    expect(snapshot.checks.database).toBe(database ? 'ok' : 'error');
    expect(snapshot.checks.cache).toBe(cache ? 'ok' : 'error');
  });
});

import { checkDatabaseConnection } from '../db/connection.js';
import { checkRedisConnection } from '../db/redis.js';

export interface HealthDependencies {
  checkDatabase: () => Promise<boolean>;
  checkCache: () => Promise<boolean>;
  now: () => Date;
  uptime: () => number;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  service: 'durisweb-backend';
  checks: {
    database: 'ok' | 'error';
    cache: 'ok' | 'error';
  };
  timestamp: string;
  uptime: number;
}

const defaultDependencies: HealthDependencies = {
  checkDatabase: checkDatabaseConnection,
  checkCache: checkRedisConnection,
  now: () => new Date(),
  uptime: () => process.uptime(),
};

export async function getHealthSnapshot(
  dependencies: HealthDependencies = defaultDependencies,
): Promise<HealthSnapshot> {
  const [databaseHealthy, cacheHealthy] = await Promise.all([
    dependencies.checkDatabase(),
    dependencies.checkCache(),
  ]);

  return {
    status: databaseHealthy && cacheHealthy ? 'ok' : 'degraded',
    service: 'durisweb-backend',
    checks: {
      database: databaseHealthy ? 'ok' : 'error',
      cache: cacheHealthy ? 'ok' : 'error',
    },
    timestamp: dependencies.now().toISOString(),
    uptime: dependencies.uptime(),
  };
}

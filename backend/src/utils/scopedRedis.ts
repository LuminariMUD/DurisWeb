import fs from 'node:fs';
import Redis, { type RedisOptions } from 'ioredis';
import { getBackendConfiguration, type BackendConfiguration } from '../config/environment.js';
import { DonationDeliveryConfigurationError } from './donationEvent.js';
import { validateRedisNamespace } from './donationEvent.js';

export type RedisScope = 'donation' | 'presence' | 'cache';

export interface ScopedRedisConfiguration {
  namespace: string;
  options: RedisOptions;
}

export function getScopedRedisConfiguration(
  scope: RedisScope,
  environment: BackendConfiguration = getBackendConfiguration(),
): ScopedRedisConfiguration {
  const redis = environment.scopedRedis;
  if (!redis) {
    throw new DonationDeliveryConfigurationError('MUD Redis integration is disabled');
  }
  const namespace = redis.namespace;
  validateRedisNamespace(namespace);
  const credentials = redis.credentials[scope];
  if (!credentials) {
    throw new DonationDeliveryConfigurationError(`${scope} Redis integration is disabled`);
  }
  const options: RedisOptions = {
    host: redis.host,
    port: redis.port,
    db: redis.database,
    enableOfflineQueue: false,
    // The least-privilege MUD ACL identities intentionally cannot run INFO,
    // which ioredis otherwise uses for its default readiness probe.
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 10_000,
    commandTimeout: 10_000,
    ...credentials,
    retryStrategy(times: number) {
      return Math.min(times * 1000, 60_000);
    },
  };

  if (redis.tls) {
    options.tls = {
      ca: fs.readFileSync(redis.caCertificatePath!, 'utf8'),
      servername: redis.tlsServerName,
    };
  }

  return { namespace, options };
}

export function createScopedRedisClient(scope: RedisScope): Redis {
  return new Redis(getScopedRedisConfiguration(scope).options);
}

import fs from 'node:fs';
import Redis, { type RedisOptions } from 'ioredis';
import { DonationDeliveryConfigurationError } from './donationEvent.js';
import { validateRedisNamespace } from './donationEvent.js';

export type RedisScope = 'donation' | 'presence' | 'cache';

export interface ScopedRedisConfiguration {
  namespace: string;
  options: RedisOptions;
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DonationDeliveryConfigurationError(
      'Redis configuration contains an invalid numeric value',
    );
  }
  return parsed;
}

function getScopeCredentials(
  scope: RedisScope,
  production: boolean,
): { username?: string; password?: string } {
  const prefix =
    scope === 'donation'
      ? 'REDIS_DONATION'
      : scope === 'presence'
        ? 'REDIS_PRESENCE'
        : 'REDIS_CACHE';
  const username =
    process.env[`${prefix}_USERNAME`] || (production ? undefined : process.env.REDIS_USERNAME);
  const password =
    process.env[`${prefix}_PASSWORD`] || (production ? undefined : process.env.REDIS_PASSWORD);

  if (production && (!username || !password)) {
    throw new DonationDeliveryConfigurationError(
      `Production ${scope} Redis access requires ${prefix}_USERNAME and ${prefix}_PASSWORD`,
    );
  }
  return { username, password };
}

export function getScopedRedisConfiguration(scope: RedisScope): ScopedRedisConfiguration {
  const namespace = process.env.REDIS_NAMESPACE?.trim();
  const production = process.env.NODE_ENV === 'production';
  if (!namespace) {
    throw new DonationDeliveryConfigurationError(
      'REDIS_NAMESPACE is required for scoped Redis access',
    );
  }
  validateRedisNamespace(namespace);

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const tlsValue = process.env.REDIS_TLS?.trim().toUpperCase() || 'FALSE';
  if (tlsValue !== 'TRUE' && tlsValue !== 'FALSE') {
    throw new DonationDeliveryConfigurationError('REDIS_TLS must be TRUE or FALSE');
  }
  const tls = tlsValue === 'TRUE';
  const caPath = process.env.REDIS_CA_CERT?.trim();
  if (tls && !caPath) {
    throw new DonationDeliveryConfigurationError(
      'REDIS_CA_CERT is required when REDIS_TLS is TRUE',
    );
  }

  const credentials = getScopeCredentials(scope, production);
  const options: RedisOptions = {
    host,
    port: parseBoundedInteger(process.env.REDIS_PORT, 6379, 1, 65535),
    db: parseBoundedInteger(process.env.REDIS_DB, 0, 0, 255),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 10_000,
    commandTimeout: 10_000,
    ...credentials,
    retryStrategy(times: number) {
      return Math.min(times * 1000, 60_000);
    },
  };

  if (tls) {
    options.tls = {
      ca: fs.readFileSync(caPath!, 'utf8'),
      servername: process.env.REDIS_TLS_SERVER_NAME || host,
    };
  }

  return { namespace, options };
}

export function createScopedRedisClient(scope: RedisScope): Redis {
  return new Redis(getScopedRedisConfiguration(scope).options);
}

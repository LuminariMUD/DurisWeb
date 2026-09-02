import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resetBackendConfigurationForTests } from '../../config/environment.js';
import { getScopedRedisConfiguration } from '../scopedRedis.js';

const originalEnvironment = { ...process.env };

beforeEach(() => {
  resetBackendConfigurationForTests();
  process.env.MUD_REDIS_ENABLED = 'true';
  process.env.MUD_REDIS_AUTH_MODE = 'acl';
  process.env.MUD_REDIS_HOST = 'redis.test.invalid';
  process.env.MUD_REDIS_PORT = '6379';
  process.env.MUD_REDIS_DB = '1';
  process.env.MUD_REDIS_NAMESPACE = 'duris:local:test';
  process.env.MUD_REDIS_TLS = 'false';
  process.env.MUD_REDIS_PRESENCE_USERNAME = 'presence-reader';
  process.env.MUD_REDIS_PRESENCE_PASSWORD = 'presence-secret';
  process.env.MUD_REDIS_CACHE_USERNAME = 'cache-reader';
  process.env.MUD_REDIS_CACHE_PASSWORD = 'cache-secret';
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
  resetBackendConfigurationForTests();
});

describe('scoped Redis configuration', () => {
  it('uses the explicitly configured scoped identity', () => {
    const configuration = getScopedRedisConfiguration('presence');
    expect(configuration.namespace).toBe('duris:local:test');
    expect(configuration.options).toMatchObject({
      host: 'redis.test.invalid',
      port: 6379,
      db: 1,
      username: 'presence-reader',
      password: 'presence-secret',
    });
  });

  it('requires scoped credentials in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CACHE_REDIS_AUTH_MODE = 'password';
    process.env.CACHE_REDIS_PASSWORD = 'cache-secret';
    process.env.MUD_REDIS_NAMESPACE = 'duris:production:main';
    delete process.env.MUD_REDIS_PRESENCE_USERNAME;
    delete process.env.MUD_REDIS_PRESENCE_PASSWORD;

    expect(() => getScopedRedisConfiguration('presence')).toThrow(
      /MUD_REDIS_PRESENCE_USERNAME is required/,
    );
  });

  it('rejects an invalid namespace before creating a client', () => {
    process.env.MUD_REDIS_NAMESPACE = 'mud:nchat';

    expect(() => getScopedRedisConfiguration('presence')).toThrow(/MUD_REDIS_NAMESPACE/);
  });

  it('requires a CA path when Redis TLS is enabled', () => {
    process.env.MUD_REDIS_TLS = 'true';
    delete process.env.MUD_REDIS_CA_CERT;

    expect(() => getScopedRedisConfiguration('cache')).toThrow(/MUD_REDIS_CA_CERT is required/);
  });
});

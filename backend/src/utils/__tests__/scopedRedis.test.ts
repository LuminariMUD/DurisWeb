import { afterEach, describe, expect, it } from '@jest/globals';
import { getScopedRedisConfiguration } from '../scopedRedis.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
});

describe('scoped Redis configuration', () => {
  it('uses the local fallback identity only outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_NAMESPACE = 'duris:local:test';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_USERNAME = 'local-user';
    process.env.REDIS_PASSWORD = 'local-password';
    process.env.REDIS_PORT = '6379';

    const configuration = getScopedRedisConfiguration('presence');
    expect(configuration.namespace).toBe('duris:local:test');
    expect(configuration.options).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      username: 'local-user',
      password: 'local-password',
    });
  });

  it('requires scoped credentials in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_NAMESPACE = 'duris:production:main';
    delete process.env.REDIS_PRESENCE_USERNAME;
    delete process.env.REDIS_PRESENCE_PASSWORD;

    expect(() => getScopedRedisConfiguration('presence')).toThrow(
      'Production presence Redis access requires REDIS_PRESENCE_USERNAME and REDIS_PRESENCE_PASSWORD'
    );
  });

  it('rejects an invalid namespace before creating a client', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_NAMESPACE = 'mud:nchat';

    expect(() => getScopedRedisConfiguration('donation')).toThrow();
  });

  it('requires a CA path when Redis TLS is enabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_NAMESPACE = 'duris:local:test';
    process.env.REDIS_TLS = 'TRUE';
    delete process.env.REDIS_CA_CERT;

    expect(() => getScopedRedisConfiguration('cache')).toThrow(
      'REDIS_CA_CERT is required when REDIS_TLS is TRUE'
    );
  });
});

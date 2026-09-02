import { describe, expect, it } from '@jest/globals';

import { ConfigurationError, parseBackendEnvironment } from '../environment.js';

/** Builds the complete non-production baseline used by focused parser cases. */
function validEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3001',
    ALLOWED_ORIGINS: 'http://frontend.test.invalid',
    LOG_LEVEL: 'info',
    SITE_URL: 'http://site.test.invalid',
    JWT_SECRET: 'test-jwt-secret-at-least-32-bytes-long',
    DB_HOST: 'database.test.invalid',
    DB_PORT: '3306',
    DB_USER: 'web_test',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'web_test',
    MUD_DATABASE_MODE: 'shared',
    MUD_DIR: '/tmp/durisweb-test-mud',
    MUD_WS_URL: 'ws://127.0.0.1:4050',
    MUD_PROCESS_USER: 'duris-test',
    MUD_PROCESS_HOME: '/tmp/durisweb-test-mud',
    MUD_PROCESS_PATH: '/usr/local/bin:/usr/bin:/bin',
    MUD_PROCESS_LOCALE: 'C.UTF-8',
    MUD_PROCESS_SHELL: '/bin/bash',
    MUD_SETSID_BIN: '/usr/bin/setsid',
    TERMINAL_SANDBOX_BIN: '/usr/bin/bwrap',
    DB_PASSWD: 'mud-test-password',
    DURISWEB_SECRET: 'test-bridge-secret-at-least-32-bytes',
    BACKUP_DIR: '/tmp/durisweb-test-backups',
    ENABLE_GUILD_SYNC: 'false',
    CACHE_REDIS_HOST: 'cache.test.invalid',
    CACHE_REDIS_PORT: '6379',
    CACHE_REDIS_DB: '0',
    CACHE_REDIS_AUTH_MODE: 'none',
    CACHE_REDIS_TLS: 'false',
    MUD_REDIS_ENABLED: 'false',
    DONATIONS_ENABLED: 'false',
    R2_ENABLED: 'false',
    PUSH_ENABLED: 'false',
    GEMINI_ENABLED: 'false',
  };
}

/** Builds a valid production baseline before each rule is invalidated independently. */
function validProductionEnvironment(): Record<string, string> {
  return {
    ...validEnvironment(),
    NODE_ENV: 'production',
    CACHE_REDIS_AUTH_MODE: 'password',
    CACHE_REDIS_PASSWORD: 'cache-production-password',
    CACHE_REDIS_TLS: 'true',
    CACHE_REDIS_CA_CERT: '/etc/durisweb/cache-redis-ca.pem',
    CACHE_REDIS_TLS_SERVER_NAME: 'cache.example.invalid',
    MUD_REDIS_ENABLED: 'true',
    MUD_REDIS_AUTH_MODE: 'acl',
    MUD_REDIS_HOST: 'mud-redis.example.invalid',
    MUD_REDIS_PORT: '6379',
    MUD_REDIS_DB: '1',
    MUD_REDIS_NAMESPACE: 'duris:production:main',
    MUD_REDIS_TLS: 'true',
    MUD_REDIS_CA_CERT: '/etc/durisweb/mud-redis-ca.pem',
    MUD_REDIS_TLS_SERVER_NAME: 'mud-redis.example.invalid',
    MUD_REDIS_PRESENCE_USERNAME: 'presence-reader',
    MUD_REDIS_PRESENCE_PASSWORD: 'presence-password',
    MUD_REDIS_CACHE_USERNAME: 'cache-reader',
    MUD_REDIS_CACHE_PASSWORD: 'mud-cache-password',
  };
}

describe('backend environment configuration', () => {
  it('returns typed values for a complete configuration', () => {
    const configuration = parseBackendEnvironment(validEnvironment());

    expect(configuration.server.port).toBe(3001);
    expect(configuration.database.port).toBe(3306);
    expect(configuration.mudDatabase.mode).toBe('shared');
    expect(configuration.mudDatabase.connection).toBe(configuration.database);
    expect(configuration.features).toMatchObject({
      mudRedis: false,
      donations: false,
      r2: false,
      push: false,
      gemini: false,
    });
  });

  it('reports every missing or invalid required value without exposing secrets', () => {
    const environment = validEnvironment();
    delete environment.DB_PASSWORD;
    environment.PORT = '70000';
    environment.HOST = 'https://invalid.test';
    environment.ALLOWED_ORIGINS = 'not-a-url';
    environment.JWT_SECRET = 'short-secret';

    expect(() => parseBackendEnvironment(environment)).toThrow(ConfigurationError);
    try {
      parseBackendEnvironment(environment);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DB_PASSWORD is required');
      expect(message).toContain('PORT must be an integer between 1 and 65535');
      expect(message).toContain('HOST must be a hostname or IP address');
      expect(message).toContain('ALLOWED_ORIGINS entries must be valid URLs');
      expect(message).toContain('JWT_SECRET must contain at least 32 bytes');
      expect(message).not.toContain('short-secret');
    }
  });

  it('requires every MUD database key in separate mode', () => {
    const environment = validEnvironment();
    environment.MUD_DATABASE_MODE = 'separate';
    environment.MUD_DB_HOST = 'mud-database.test.invalid';

    expect(() => parseBackendEnvironment(environment)).toThrow(/MUD_DB_PORT is required/);

    Object.assign(environment, {
      MUD_DB_PORT: '3307',
      MUD_DB_USER: 'mud_reader',
      MUD_DB_PASSWORD: 'mud-password',
      MUD_DB_NAME: 'mud_test',
    });
    const configuration = parseBackendEnvironment(environment);
    expect(configuration.mudDatabase.connection).toMatchObject({
      host: 'mud-database.test.invalid',
      port: 3307,
      user: 'mud_reader',
      database: 'mud_test',
    });
  });

  it('rejects legacy database and WebSocket aliases', () => {
    const environment = validEnvironment();
    environment.DURIS_DB_HOST = 'legacy.test.invalid';
    environment.MUD_WS_HOST = 'legacy-ws.test.invalid';

    expect(() => parseBackendEnvironment(environment)).toThrow(/legacy DURIS_DB_HOST/);
    expect(() => parseBackendEnvironment(environment)).toThrow(/legacy MUD_WS_HOST/);
  });

  it('rejects insecure remote MUD endpoints and incomplete secret rotation', () => {
    const environment = validEnvironment();
    environment.MUD_WS_URL = 'ws://mud.test.invalid:4050';
    environment.DURISWEB_SECRET_PREVIOUS = 'previous-bridge-secret-at-least-32-bytes';

    expect(() => parseBackendEnvironment(environment)).toThrow(
      /MUD_WS_URL must use wss: for non-loopback hosts/,
    );
    expect(() => parseBackendEnvironment(environment)).toThrow(
      /DURISWEB_SECRET_PREVIOUS and DURISWEB_SECRET_ROTATED_AT must be configured together/,
    );
  });

  it('requires complete optional integration groups only when enabled', () => {
    const environment = validEnvironment();
    environment.R2_ENABLED = 'true';
    environment.PUSH_ENABLED = 'true';
    environment.GEMINI_ENABLED = 'true';

    expect(() => parseBackendEnvironment(environment)).toThrow(/R2_ACCOUNT_ID is required/);

    Object.assign(environment, {
      R2_ACCOUNT_ID: 'account-id',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      R2_BUCKET_NAME: 'bucket-name',
      R2_PUBLIC_URL: 'https://static.test.invalid',
      VAPID_PUBLIC_KEY: 'public-key',
      VAPID_PRIVATE_KEY: 'private-key',
      VAPID_SUBJECT: 'mailto:operator@example.invalid',
      GEMINI_API_KEY: 'gemini-key',
    });
    const configuration = parseBackendEnvironment(environment);
    expect(configuration.r2?.bucketName).toBe('bucket-name');
    expect(configuration.push?.subject).toBe('mailto:operator@example.invalid');
    expect(configuration.geminiApiKey).toBe('gemini-key');
  });

  it('requires explicit scoped Redis configuration for donations', () => {
    const environment = validEnvironment();
    environment.MUD_REDIS_ENABLED = 'true';
    environment.DONATIONS_ENABLED = 'true';
    environment.MUD_REDIS_AUTH_MODE = 'none';
    environment.MUD_REDIS_HOST = 'mud-redis.test.invalid';
    environment.MUD_REDIS_PORT = '6379';
    environment.MUD_REDIS_DB = '1';
    environment.MUD_REDIS_NAMESPACE = 'duris:local:main';
    environment.MUD_REDIS_TLS = 'false';

    expect(() => parseBackendEnvironment(environment)).toThrow(
      /KOFI_VERIFICATION_TOKEN is required/,
    );

    environment.KOFI_VERIFICATION_TOKEN = 'provider-token';
    environment.MUD_REDIS_DONATION_SECRET = 'donation-secret-at-least-32-bytes-long';
    const configuration = parseBackendEnvironment(environment);
    expect(configuration.features.donations).toBe(true);
    expect(configuration.scopedRedis?.namespace).toBe('duris:local:main');
  });

  it('requires TLS for credentialed cache Redis outside loopback', () => {
    const environment = validEnvironment();
    environment.CACHE_REDIS_AUTH_MODE = 'password';
    environment.CACHE_REDIS_PASSWORD = 'cache-password';

    expect(() => parseBackendEnvironment(environment)).toThrow(
      /CACHE_REDIS_TLS must be true for credentialed non-loopback connections/,
    );

    environment.CACHE_REDIS_HOST = '127.0.0.1';
    expect(() => parseBackendEnvironment(environment)).not.toThrow();
  });

  it.each([
    [
      'unauthenticated cache Redis',
      (environment: Record<string, string>) => {
        environment.CACHE_REDIS_AUTH_MODE = 'none';
      },
      /CACHE_REDIS_AUTH_MODE must not be none in production/,
    ],
    [
      'unscoped MUD Redis authentication',
      (environment: Record<string, string>) => {
        environment.MUD_REDIS_AUTH_MODE = 'none';
      },
      /MUD_REDIS_AUTH_MODE must be acl in production/,
    ],
    [
      'a non-production MUD Redis namespace',
      (environment: Record<string, string>) => {
        environment.MUD_REDIS_NAMESPACE = 'duris:local:main';
      },
      /MUD_REDIS_NAMESPACE must use duris:production:/,
    ],
  ])('rejects production configuration with %s', (_label, invalidate, expected) => {
    const environment = validProductionEnvironment();
    invalidate(environment);

    expect(() => parseBackendEnvironment(environment)).toThrow(expected);
  });
});

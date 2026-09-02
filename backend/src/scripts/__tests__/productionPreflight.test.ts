import { afterEach, describe, expect, it } from '@jest/globals';

import {
  ConfigurationError,
  loadPreflightConfiguration,
  parsePreflightMode,
  runProductionPreflight,
} from '../productionPreflight.js';
import { resetBackendConfigurationForTests } from '../../config/environment.js';

const originalEnvironment = { ...process.env };

/** Installs a complete production baseline for isolated preflight cases. */
function setValidEnvironment(): void {
  resetBackendConfigurationForTests();
  process.env.NODE_ENV = 'production';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'duris';
  process.env.DB_PASSWORD = 'secret';
  process.env.DB_NAME = 'duris';
  process.env.CACHE_REDIS_HOST = '127.0.0.1';
  process.env.CACHE_REDIS_AUTH_MODE = 'password';
  process.env.CACHE_REDIS_PASSWORD = 'cache-secret';
  process.env.CACHE_REDIS_TLS = 'false';
  process.env.MUD_REDIS_ENABLED = 'true';
  process.env.MUD_REDIS_AUTH_MODE = 'acl';
  process.env.MUD_REDIS_HOST = '127.0.0.1';
  process.env.MUD_REDIS_PORT = '6379';
  process.env.MUD_REDIS_DB = '0';
  process.env.MUD_REDIS_NAMESPACE = 'duris:production:main';
  process.env.MUD_REDIS_PRESENCE_USERNAME = 'presence-reader';
  process.env.MUD_REDIS_PRESENCE_PASSWORD = 'presence-secret';
  process.env.MUD_REDIS_CACHE_USERNAME = 'cache-reader';
  process.env.MUD_REDIS_CACHE_PASSWORD = 'cache-secret';
  process.env.MUD_REDIS_TLS = 'false';
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
  resetBackendConfigurationForTests();
});

describe('production preflight stages', () => {
  it('accepts only the documented execution modes', () => {
    expect(parsePreflightMode([])).toBe('all');
    expect(parsePreflightMode(['--configuration'])).toBe('configuration');
    expect(parsePreflightMode(['--dependencies'])).toBe('dependencies');
    expect(() => parsePreflightMode(['--unknown'])).toThrow(ConfigurationError);
  });

  it('validates release migrations during the connection-free configuration stage', () => {
    setValidEnvironment();

    const configuration = loadPreflightConfiguration();

    expect(configuration.expectedMigrations.length).toBeGreaterThan(0);
    expect(configuration.expectedMigrations.every((name) => name.endsWith('.ts'))).toBe(true);
  });

  it('uses exit 78 for static configuration failures', async () => {
    setValidEnvironment();
    delete process.env.DB_PASSWORD;

    await expect(runProductionPreflight(['--configuration'])).resolves.toBe(78);
  });

  it('maps failures in the retryable dependency stage to exit 1', async () => {
    setValidEnvironment();
    delete process.env.DB_PASSWORD;

    await expect(runProductionPreflight(['--dependencies'])).resolves.toBe(1);
  });
});

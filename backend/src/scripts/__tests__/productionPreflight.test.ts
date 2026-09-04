import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';

import { resetBackendConfigurationForTests } from '../../config/environment.js';
import {
  ConfigurationError,
  loadPreflightConfiguration,
  parsePreflightMode,
  runProductionPreflight,
  verifySqlArtifactClassification,
} from '../productionPreflight.js';

const originalEnvironment = { ...process.env };
let sandboxDirectory: string | null = null;

function createSandboxFixture(probeExitStatus = 0): string {
  sandboxDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-preflight-'));
  const sandboxPath = path.join(sandboxDirectory, 'bwrap');
  fs.writeFileSync(
    sandboxPath,
    `#!/bin/sh
if test "\${1:-}" = "--version"; then
  printf 'bubblewrap 1.0-test\\n'
  exit 0
fi
exit ${probeExitStatus}
`,
    { mode: 0o700 },
  );
  return sandboxPath;
}

/** Installs a complete production baseline for isolated preflight cases. */
function setValidEnvironment(sandboxProbeExitStatus = 0): void {
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
  process.env.TERMINAL_SANDBOX_BIN = createSandboxFixture(sandboxProbeExitStatus);
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    process.env[key] = value;
  }
  if (sandboxDirectory) fs.rmSync(sandboxDirectory, { recursive: true, force: true });
  sandboxDirectory = null;
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

  it('uses exit 78 when the configured terminal sandbox executable is absent', async () => {
    setValidEnvironment();
    process.env.TERMINAL_SANDBOX_BIN = '/definitely/missing/bwrap';

    await expect(runProductionPreflight(['--configuration'])).resolves.toBe(78);
  });

  it('uses exit 78 when bubblewrap cannot create the required namespaces', async () => {
    setValidEnvironment(1);

    await expect(runProductionPreflight(['--configuration'])).resolves.toBe(78);
  });

  it('maps failures in the retryable dependency stage to exit 1', async () => {
    setValidEnvironment();
    delete process.env.DB_PASSWORD;

    await expect(runProductionPreflight(['--dependencies'])).resolves.toBe(1);
  });

  it('requires every ignored SQL migration artifact to stay classified', () => {
    // knexfile.ts runs only .ts migrations, so an unclassified .sql file would
    // otherwise ship as a silently ignored artifact.
    expect(() => verifySqlArtifactClassification()).not.toThrow();
  });
});

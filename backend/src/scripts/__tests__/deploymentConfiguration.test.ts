import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
const temporaryDirectories: string[] = [];

/** Writes a fully populated deployment input for one isolated render target. */
function writeDeploymentInput(
  temporaryRoot: string,
  outputPath: string,
  enableIngress = false,
): string {
  const inputPath = path.join(temporaryRoot, 'deployment.env');
  let example = fs
    .readFileSync(path.join(PROJECT_ROOT, 'deploy/deployment.env.example'), 'utf8')
    .replaceAll('example', 'portable')
    .replace('RENDER_OUTPUT_DIR=/srv/portable/durisweb-rendered', `RENDER_OUTPUT_DIR=${outputPath}`)
    .replace(
      'DEPLOYMENT_ENV_FILE=/etc/portable-durisweb/deployment.env',
      `DEPLOYMENT_ENV_FILE=${inputPath}`,
    );
  if (enableIngress) {
    example = example
      .replaceAll('replace_with', 'configured')
      .replace('DEPLOY_CLOUDFLARED_ENABLED=false', 'DEPLOY_CLOUDFLARED_ENABLED=true')
      .replace('DEPLOY_NGINX_ENABLED=false', 'DEPLOY_NGINX_ENABLED=true');
  }
  fs.writeFileSync(inputPath, example, { mode: 0o600 });
  return inputPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('deployment configuration renderer', () => {
  it('renders every maintained artifact without unresolved placeholders', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    const generatedFiles = [
      'systemd/durisweb-production.service',
      'systemd/durisweb-redis.service',
      'systemd/durisweb-cloudflared.service',
      'deployment-selection.env',
      'redis/redis.conf',
      'nginx/bootstrap.conf',
      'nginx/production.conf',
    ];
    for (const relativePath of generatedFiles) {
      const content = fs.readFileSync(path.join(outputPath, relativePath), 'utf8');
      expect(content).not.toMatch(/@[A-Z][A-Z0-9_]*@/);
    }
    const selection = fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8');
    expect(selection).toContain('INGRESS_SERVICE=durisweb-cloudflared.service\n');
    expect(selection).toContain('INGRESS_SERVICE_SCOPE=user\n');
    const applicationUnit = fs.readFileSync(
      path.join(outputPath, 'systemd/durisweb-production.service'),
      'utf8',
    );
    expect(applicationUnit).toContain('RestrictNamespaces=user ipc uts cgroup mnt\n');
    expect(applicationUnit).not.toContain('RestrictNamespaces=true\n');

    const rerender = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );
    expect(rerender.status).toBe(0);
  });

  it('does not require or render disabled optional ingress groups', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-production.service'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-redis.service'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-cloudflared.service'))).toBe(
      false,
    );
    expect(fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8')).toContain(
      'INGRESS_SERVICE=\n',
    );
    expect(fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8')).toContain(
      'INGRESS_SERVICE_SCOPE=\n',
    );
    expect(fs.existsSync(path.join(outputPath, 'nginx'))).toBe(false);
  });

  it('rejects public health URI user-info before writing rendered files', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.writeFileSync(
      inputPath,
      fs
        .readFileSync(inputPath, 'utf8')
        .replace(
          'PUBLIC_HEALTH_URL=https://portable.invalid/health',
          'PUBLIC_HEALTH_URL=https://token@portable.invalid/health',
        ),
      { mode: 0o600 },
    );

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/PUBLIC_HEALTH_URL must be an exact HTTPS \/health URL/i);
    expect(fs.readdirSync(outputPath)).toEqual([]);
  });

  it('requires the operator to create a dedicated render output directory', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'missing-rendered');
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/existing non-symlink directory/i);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('rejects a symlinked render output directory', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const actualOutput = path.join(temporaryRoot, 'actual-rendered');
    const outputPath = path.join(temporaryRoot, 'rendered-link');
    fs.mkdirSync(actualOutput);
    fs.symlinkSync(actualOutput, outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/symlink/i);
    expect(fs.readdirSync(actualOutput)).toEqual([]);
  });

  it('rejects a non-empty directory that was not created by the renderer', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'existing-directory');
    fs.mkdirSync(outputPath);
    fs.writeFileSync(path.join(outputPath, 'operator-owned.txt'), 'preserve me');
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/non-empty directory/i);
    expect(fs.readFileSync(path.join(outputPath, 'operator-owned.txt'), 'utf8')).toBe(
      'preserve me',
    );
  });

  it('rejects symlinked generated subdirectories on later renders', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    const redirectedDirectory = path.join(temporaryRoot, 'redirected');
    fs.mkdirSync(outputPath);
    fs.mkdirSync(redirectedDirectory);
    fs.writeFileSync(path.join(outputPath, '.durisweb-render-output'), '', { mode: 0o600 });
    fs.symlinkSync(redirectedDirectory, path.join(outputPath, 'systemd'));
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/invalid render output subdirectory/i);
    expect(fs.readdirSync(redirectedDirectory)).toEqual([]);
  });

  it('writes Redis authentication to a private runtime config instead of process arguments', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-redis-'));
    temporaryDirectories.push(temporaryRoot);
    const runtimeDirectory = path.join(temporaryRoot, 'runtime');
    const sourceConfig = path.join(temporaryRoot, 'redis.conf');
    const capturedConfig = path.join(temporaryRoot, 'captured.conf');
    const capturedEnvironment = path.join(temporaryRoot, 'captured-environment.txt');
    const fakeRedis = path.join(temporaryRoot, 'redis-server');
    fs.mkdirSync(runtimeDirectory, { mode: 0o700 });
    fs.writeFileSync(sourceConfig, 'bind 127.0.0.1\n');
    fs.writeFileSync(
      fakeRedis,
      '#!/usr/bin/env bash\nset -euo pipefail\ncp -- "$1" "$CAPTURE_PATH"\nprintf "%s" "${CACHE_REDIS_PASSWORD-unset}" >"$CAPTURE_ENV_PATH"\n',
      { mode: 0o700 },
    );

    const result = spawnSync(
      path.join(PROJECT_ROOT, 'deploy/scripts/run-durisweb-redis'),
      [fakeRedis, sourceConfig],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CACHE_REDIS_PASSWORD: 'secret with spaces * and "quotes"',
          RUNTIME_DIRECTORY: runtimeDirectory,
          CAPTURE_PATH: capturedConfig,
          CAPTURE_ENV_PATH: capturedEnvironment,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(capturedConfig, 'utf8')).toContain(
      'requirepass "secret with spaces * and \\"quotes\\""',
    );
    expect(fs.readFileSync(capturedEnvironment, 'utf8')).toBe('unset');
    const unit = fs.readFileSync(
      path.join(PROJECT_ROOT, 'deploy/templates/systemd/durisweb-redis.service'),
      'utf8',
    );
    expect(unit).not.toContain('${CACHE_REDIS_PASSWORD}');
    expect(unit).toContain('run-durisweb-redis');
  });
});

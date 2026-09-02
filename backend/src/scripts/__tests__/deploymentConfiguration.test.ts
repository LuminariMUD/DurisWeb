import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('deployment configuration renderer', () => {
  it('renders every maintained artifact without unresolved placeholders', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const inputPath = path.join(temporaryRoot, 'deployment.env');
    const outputPath = path.join(temporaryRoot, 'rendered');
    const example = fs
      .readFileSync(path.join(PROJECT_ROOT, 'deploy/deployment.env.example'), 'utf8')
      .replaceAll('example', 'portable')
      .replaceAll('replace_with', 'configured')
      .replace('DEPLOY_CLOUDFLARED_ENABLED=false', 'DEPLOY_CLOUDFLARED_ENABLED=true')
      .replace('DEPLOY_NGINX_ENABLED=false', 'DEPLOY_NGINX_ENABLED=true')
      .replace(
        'RENDER_OUTPUT_DIR=/srv/portable/durisweb-rendered',
        `RENDER_OUTPUT_DIR=${outputPath}`,
      )
      .replace(
        'DEPLOYMENT_ENV_FILE=/etc/portable-durisweb/deployment.env',
        `DEPLOYMENT_ENV_FILE=${inputPath}`,
      );
    fs.writeFileSync(inputPath, example, { mode: 0o600 });

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
      'redis/redis.conf',
      'nginx/bootstrap.conf',
      'nginx/production.conf',
    ];
    for (const relativePath of generatedFiles) {
      const content = fs.readFileSync(path.join(outputPath, relativePath), 'utf8');
      expect(content).not.toMatch(/@[A-Z][A-Z0-9_]*@/);
    }
  });

  it('does not require or render disabled optional ingress groups', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const inputPath = path.join(temporaryRoot, 'deployment.env');
    const outputPath = path.join(temporaryRoot, 'rendered');
    const example = fs
      .readFileSync(path.join(PROJECT_ROOT, 'deploy/deployment.env.example'), 'utf8')
      .replaceAll('example', 'portable')
      .replace(
        'RENDER_OUTPUT_DIR=/srv/portable/durisweb-rendered',
        `RENDER_OUTPUT_DIR=${outputPath}`,
      );
    fs.writeFileSync(inputPath, example, { mode: 0o600 });

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
    expect(fs.existsSync(path.join(outputPath, 'nginx'))).toBe(false);
  });
});

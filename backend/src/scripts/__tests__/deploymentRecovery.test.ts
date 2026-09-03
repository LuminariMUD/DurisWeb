import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
const temporaryDirectories: string[] = [];

interface RecoveryFixture {
  root: string;
  output: string;
  binaries: string;
  log: string;
}

function createRecoveryFixture(enableIngress: boolean): RecoveryFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-recovery-'));
  temporaryDirectories.push(root);
  const output = path.join(root, 'rendered');
  const binaries = path.join(root, 'bin');
  const log = path.join(root, 'commands.log');
  const input = path.join(root, 'deployment.env');
  fs.mkdirSync(output);
  fs.mkdirSync(binaries);

  let environment = fs
    .readFileSync(path.join(PROJECT_ROOT, 'deploy/deployment.env.example'), 'utf8')
    .replaceAll('example', 'portable')
    .replace('RENDER_OUTPUT_DIR=/srv/portable/durisweb-rendered', `RENDER_OUTPUT_DIR=${output}`)
    .replace('NODE_BIN=/usr/local/bin/node', `NODE_BIN=${process.execPath}`)
    .replace(
      'DEPLOYMENT_ENV_FILE=/etc/portable-durisweb/deployment.env',
      `DEPLOYMENT_ENV_FILE=${input}`,
    );
  if (enableIngress) {
    environment = environment
      .replaceAll('replace_with', 'configured')
      .replace('DEPLOY_CLOUDFLARED_ENABLED=false', 'DEPLOY_CLOUDFLARED_ENABLED=true');
  }
  fs.writeFileSync(input, environment, { mode: 0o600 });

  const render = spawnSync(
    'bash',
    [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), input],
    { encoding: 'utf8' },
  );
  expect(render.status).toBe(0);

  fs.writeFileSync(
    path.join(binaries, 'systemctl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\\n' "$*" >>"$RECOVERY_TEST_LOG"
if [ "\${2:-}" = 'show' ]; then
  if [ "\${RECOVERY_FAIL_INGRESS:-false}" = 'true' ] && [ "\${3:-}" = 'durisweb-cloudflared.service' ]; then
    printf 'inactive\\nfailed\\n0\\n'
  else
    printf 'active\\nsuccess\\n0\\n'
  fi
fi
`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(binaries, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do url=$argument; done
printf 'curl %s\\n' "$url" >>"$RECOVERY_TEST_LOG"
printf '{"status":"ok","checks":{"database":"ok","cache":"ok"}}'
`,
    { mode: 0o700 },
  );

  return { root, output, binaries, log };
}

function runRecovery(
  fixture: RecoveryFixture,
  args: string[] = [],
  failIngress = false,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    path.join(PROJECT_ROOT, 'deploy/scripts/recover-deployment'),
    [...args, fixture.output],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.binaries}:${process.env.PATH ?? ''}`,
        RECOVERY_TEST_LOG: fixture.log,
        RECOVERY_FAIL_INGRESS: String(failIngress),
      },
    },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('complete deployment recovery', () => {
  it('starts and accepts every rendered unit plus local and public health', () => {
    const fixture = createRecoveryFixture(true);

    const result = runRecovery(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/3 units, 2 health probes/);
    const calls = fs.readFileSync(fixture.log, 'utf8');
    expect(calls).toContain(
      'systemctl --user start durisweb-redis.service durisweb-production.service durisweb-cloudflared.service',
    );
    expect(calls).toContain('curl http://127.0.0.1:3001/health');
    expect(calls).toContain('curl https://portable.invalid/health');

    const tunnel = fs.readFileSync(
      path.join(fixture.output, 'systemd/durisweb-cloudflared.service'),
      'utf8',
    );
    expect(tunnel).toContain('BindsTo=durisweb-production.service');
    expect(tunnel).toContain('PartOf=durisweb-production.service');
  });

  it('cannot accept a partial recovery with independently stopped ingress', () => {
    const fixture = createRecoveryFixture(true);

    const result = runRecovery(fixture, ['--accept-only'], true);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/durisweb-cloudflared\.service failed acceptance/);
    expect(fs.readFileSync(fixture.log, 'utf8')).not.toContain('systemctl --user start');
  });

  it('does not invent a tunnel dependency when public ingress is disabled', () => {
    const fixture = createRecoveryFixture(false);

    const result = runRecovery(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/2 units, 1 health probes/);
    const calls = fs.readFileSync(fixture.log, 'utf8');
    expect(calls).toContain(
      'systemctl --user start durisweb-redis.service durisweb-production.service',
    );
    expect(calls).not.toContain('cloudflared');
    expect(calls).not.toContain('https://portable.invalid/health');
  });
});

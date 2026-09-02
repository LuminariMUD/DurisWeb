import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

describe('production review regression contracts', () => {
  it('recovers an interrupted incident rollback before deleting reconstructed data', () => {
    const migration = read('backend/migrations/20251114144642_merge_crash_and_incidents_proper.ts');
    const down = migration.slice(migration.indexOf('export async function down'));

    expect(down.indexOf('finishInterruptedDownMigration')).toBeGreaterThanOrEqual(0);
    expect(down.indexOf('finishInterruptedDownMigration')).toBeLessThan(
      down.indexOf("dropTableIfExists('crash_log')"),
    );
  });

  it('does not delete an operator-owned MUD WebSocket hostname during rollback', () => {
    const migration = read('backend/migrations/20260902144000_add_mud_ws_host.ts');
    const down = migration.slice(migration.indexOf('export async function down'));

    expect(down).not.toContain('.delete()');
    expect(down).toContain('Configuration data is intentionally retained');
  });

  it('separates systemd configuration refusal from retryable dependency checks', () => {
    const service = read('deploy/templates/systemd/durisweb-production.service');

    expect(service).toContain('@BACKEND_ROOT@/migrations');
    expect(service).toContain('ExecCondition=');
    expect(service).toContain('productionPreflight.js --configuration');
    expect(service).toContain('ExecStartPre=');
    expect(service).toContain('productionPreflight.js --dependencies');
  });

  it('uses token-file only after checking cloudflared compatibility', () => {
    const launcher = read('deploy/scripts/run-durisweb-cloudflared');

    expect(launcher).toContain('cloudflared_version_output=');
    expect(launcher).toContain('supports_token_file');
    expect(launcher).toContain('--token-file');
    expect(launcher).toContain('TUNNEL_TOKEN="$tunnel_token"');
  });

  it('documents portable rendering, preflight, and endpoint acceptance', () => {
    const deployment = read('docs/deployment.md');

    expect(deployment).toContain('deploy/scripts/render-config');
    expect(deployment).toContain('Linger=yes');
    expect(deployment).toContain('configured local and public health endpoints');
    expect(deployment).toContain('MUD WebSocket handshake');
    expect(deployment).not.toContain('/home/');
  });

  it('distinguishes scoped read-only and writable cache credential families', () => {
    const environment = read('backend/.env.example');

    expect(environment).toContain('MUD_REDIS_CACHE_USERNAME');
    expect(environment).toContain('CACHE_REDIS_AUTH_MODE');
  });

  it('wires the protected MUD endpoint middleware into the admin update route', () => {
    const adminRoutes = read('backend/src/routes/admin.ts');
    const updateRoute = adminRoutes.slice(
      adminRoutes.indexOf("'/web/settings/:key'"),
      adminRoutes.indexOf("'/web/logo'"),
    );

    expect(updateRoute).toContain("requirePermission('manage_front_page')");
    expect(updateRoute).toContain('requireWebSettingAuthorization');
  });
});

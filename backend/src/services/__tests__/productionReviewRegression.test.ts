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

  it('encodes every dynamic battle metadata value before HTML interpolation', () => {
    const entrypoint = read('backend/src/index.ts');
    const metadata = entrypoint.slice(
      entrypoint.indexOf('const generateBattleOgTags'),
      entrypoint.indexOf('// Vue Router history mode support'),
    );

    expect(metadata).toContain('const title = escapeHtml(');
    expect(metadata).toContain('const description = escapeHtml(');
    expect(metadata).toContain('const url = escapeHtml(');
    expect(metadata).toContain('const encodedSiteTitle = escapeHtml(siteTitle)');
    expect(metadata).toContain('logoUrl ? escapeHtml(logoUrl) : undefined');
  });

  it('reads user-profile wealth from the canonical player rows', () => {
    const forumService = read('backend/src/services/forumService.ts');
    const userProfile = forumService.slice(
      forumService.indexOf('export async function getUserProfile'),
      forumService.indexOf('export async function updateUserProfile'),
    );

    expect(userProfile).toContain('COUNT(DISTINCT ac.pid)');
    expect(userProfile).toContain('COALESCE(pd.bank_platinum, 0) * 1000');
    expect(userProfile).toContain('FROM frag_leaderboard fl');
    expect(userProfile).toContain('FROM player_data pd');
    expect(userProfile).toContain('WHERE ac.pid = pd.pid');
    expect(userProfile).not.toContain('LEFT JOIN frag_leaderboard fl');
    expect(userProfile).not.toContain('pc.money');
    expect(userProfile).not.toContain('pc.balance');
  });

  it('backs up and restores the same explicitly configured MUD database', () => {
    const service = read('backend/src/services/backupService.ts');
    const backup = service.slice(
      service.indexOf('async function runBackup'),
      service.indexOf('/**\n * Create the zip'),
    );
    const archive = service.slice(
      service.indexOf('async function createZipArchive'),
      service.indexOf('/**\n * Update backup status'),
    );
    const restore = service.slice(
      service.indexOf('async function executeRestorePipeline'),
      service.indexOf('export async function createRestore'),
    );

    expect(backup).toContain('environment.mudDatabase.connection');
    expect(backup).toContain('mudPool.execute');
    expect(archive).toContain('environment.mudDatabase.connection.database');
    expect(restore).toContain('environment.mudDatabase.connection');
    expect(restore).toContain('-P ${dbPort}');
  });

  it('keeps shell-sensitive MySQL healthcheck values in single arguments', () => {
    const compose = read('podman-compose.yml');

    expect(compose).toContain('-h \\"$${MYSQL_HEALTHCHECK_HOST}\\"');
    expect(compose).toContain('-u\\"$${MYSQL_USER}\\"');
    expect(compose).toContain('-p\\"$${MYSQL_PASSWORD}\\"');
  });

  it('keeps reviewed configuration guidance aligned with runtime behavior', () => {
    const api = read('docs/api/README_api.md');
    const architecture = read('docs/ARCHITECTURE.md');
    const development = read('docs/development.md');
    const environments = read('docs/environments.md');

    expect(api).toContain('loopback `ws://127.0.0.1:4050` value is a local example');
    expect(api).not.toContain('whose default is `ws://127.0.0.1:4050`');
    expect(architecture).toContain('When Cloudflared is enabled');
    expect(development).toContain('pnpm --dir backend config:check');
    expect(development).toContain('pnpm --dir frontend config:check');
    expect(environments).toContain('`discord_webhook_url` for server-side delivery only');
  });
});

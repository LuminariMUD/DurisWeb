import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(TEST_DIRECTORY, '../../..');
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(BACKEND_ROOT, relativePath), 'utf8');
}

function readProject(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

describe('DurisWeb integration security contracts', () => {
  it('does not publish or subscribe through legacy Redis channels', () => {
    expect(read('src/services/donationService.ts')).not.toContain('mud:nchat');
    expect(read('src/services/donationOutboxService.ts')).not.toContain('mud:nchat');
    expect(read('src/services/playerEventSubscriber.ts')).not.toContain('mud:player');
    expect(read('src/services/onlinePlayersService.ts')).not.toContain('mud:online');
    expect(read('src/services/mudAuctionClient.ts')).not.toContain('online_players');
  });

  it('keeps donation delivery scoped and signed', () => {
    const outbox = read('src/services/donationOutboxService.ts');
    const event = read('src/utils/donationEvent.ts');
    expect(outbox).toContain("getScopedRedisConfiguration('donation')");
    expect(outbox).toContain('activeSeasonEpoch');
    expect(outbox).toContain('donation_outbox');
    expect(event).toContain("createHmac('sha256'");
    expect(event).toContain('amountCents');
    expect(event).toContain('schema_version: 1');
  });

  it('keeps presence delivery scoped to the active season', () => {
    const subscriber = read('src/services/playerEventSubscriber.ts');
    const online = read('src/services/onlinePlayersService.ts');
    expect(subscriber).toContain("getScopedRedisConfiguration('presence')");
    expect(subscriber).toContain(':season:${epoch}:player');
    expect(online).toContain('presence:current');
    expect(online).toContain('scanBounded');
    expect(online).toContain('currentAfter');
  });

  it('keeps the privileged MUD secret out of frontend code', () => {
    expect(readProject('frontend/src/utils/duriswebAuth.ts')).not.toContain('DURISWEB_SECRET');
    expect(readProject('frontend/src/composables/useMudConnection.ts')).toContain("package: 'Client.Info'");
    expect(readProject('frontend/src/composables/useMudConnection.ts')).not.toContain("package: 'Core.Hello'");
  });

  it('keeps the privileged bridge bound to its authenticated socket', () => {
    const bridge = read('src/services/mudAuctionClient.ts');
    const transportPolicy = read('src/services/mudTransportPolicy.ts');
    expect(bridge).toContain('function handleDuriswebChallenge(socket: WebSocket, message: any)');
    expect(bridge).toContain('handleDuriswebChallenge(socket, msg)');
    expect(bridge).toContain('!isAuthenticated');
    expect(bridge).toContain('resolveMudWebSocketUrl');
    expect(transportPolicy).toContain('parsed.username || parsed.password || parsed.search || parsed.hash');
    expect(transportPolicy).toContain('MUD WebSocket URL contains forbidden components.');
  });

  it('defines a TLS-only exact webhook boundary', () => {
    const productionNginx = readProject('nginx-durisweb.conf');
    expect(productionNginx).toContain('location = /kofihook');
    expect(productionNginx).toContain('proxy_pass http://127.0.0.1:3001/kofihook;');
    expect(productionNginx).toContain('client_max_body_size 64k;');

    const bootstrapNginx = readProject('nginx-durisweb-initial.conf');
    expect(bootstrapNginx).toContain('location = /kofihook');
    expect(bootstrapNginx).toContain('return 404;');
    expect(bootstrapNginx).not.toContain('proxy_pass http://127.0.0.1:3001/kofihook;');
  });
});

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  WebSocketStreamLimiter,
  canReceiveAccountEvent,
  hasWebSocketPermission,
  type WebSocketPrincipal,
} from '../websocketAccess.js';

const principal: WebSocketPrincipal = {
  accountName: 'Cwial',
  sessionId: 'session-1',
  permissions: {
    accountName: 'Cwial',
    role: 'player',
    immortalLevel: null,
    maxLevel: 56,
    canAccessImmortalForum: false,
    canAccessGodForum: false,
    guilds: [],
    canModerate: false,
    canBan: false,
    canEditPosts: false,
    canDeletePosts: false,
    canPinThreads: false,
    canLockThreads: false,
    adminPermissions: ['view_server_health'],
  },
};

describe('WebSocket access policy', () => {
  it('denies raw global presence to anonymous and ordinary players at subscription and delivery', () => {
    const ordinary = {
      ...principal,
      permissions: { ...principal.permissions, adminPermissions: [] },
    };
    expect(hasWebSocketPermission(undefined, 'view_server_health', 57)).toBe(false);
    expect(hasWebSocketPermission(ordinary, 'view_server_health', 57)).toBe(false);
    expect(
      hasWebSocketPermission(
        { ...ordinary, permissions: { ...ordinary.permissions, maxLevel: 57 } },
        'view_server_health',
        57,
      ),
    ).toBe(true);

    // Pin the real entry points to the tested authorization policy as well.
    const server = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');
    for (const subscription of ['SUBSCRIBE_PLAYER_EVENTS', 'SUBSCRIBE_WHOLIST']) {
      const block = server.slice(server.indexOf(`if (data.type === '${subscription}')`));
      expect(block.slice(0, block.indexOf('Subscribed = true'))).toContain(
        'await verifyWebSocketAuth(data.token, 57)',
      );
      expect(block.slice(0, block.indexOf('Subscribed = true'))).toContain('if (!principal)');
    }
    for (const broadcast of ['broadcastPlayerEvent', 'broadcastWholist']) {
      const block = server.slice(server.indexOf(`export function ${broadcast}(`));
      expect(block.slice(0, block.indexOf('client.send(message)'))).toContain(
        "hasWebSocketPermission(getWebSocketPrincipal(client), 'view_server_health', 57)",
      );
    }
    const admin = readFileSync(new URL('../../routes/admin.ts', import.meta.url), 'utf8');
    expect(admin).toContain("router.get('/who', requireAuth, requireOverlord,");
  });

  it('fails closed for privileged broadcasts without a principal', () => {
    expect(hasWebSocketPermission(undefined, 'view_server_health')).toBe(false);
    expect(hasWebSocketPermission(principal, 'manage_mud_backup')).toBe(false);
    expect(hasWebSocketPermission(principal, 'view_server_health')).toBe(true);
  });

  it('targets account events only at the matching authenticated account', () => {
    expect(canReceiveAccountEvent(principal, 'Cwial')).toBe(true);
    expect(canReceiveAccountEvent(principal, 'OtherAccount')).toBe(false);
    expect(canReceiveAccountEvent(undefined, 'Cwial')).toBe(false);
  });

  it('allows overlords or minimum-level principals when explicitly requested', () => {
    expect(hasWebSocketPermission(principal, 'unused', 56)).toBe(true);
    expect(hasWebSocketPermission(principal, 'unused', 57)).toBe(false);
  });

  it('bounds concurrent streams per connection and releases slots', () => {
    const connection = {};
    const limiter = new WebSocketStreamLimiter<typeof connection>(2);

    expect(limiter.acquire(connection, 'rooms:alpha')).toBe(true);
    expect(limiter.acquire(connection, 'rooms:alpha')).toBe(false);
    expect(limiter.acquire(connection, 'mobs:alpha')).toBe(true);
    expect(limiter.acquire(connection, 'objects:alpha')).toBe(false);
    expect(limiter.count(connection)).toBe(2);

    limiter.release(connection, 'rooms:alpha');
    expect(limiter.acquire(connection, 'objects:alpha')).toBe(true);
    limiter.clear(connection);
    expect(limiter.count(connection)).toBe(0);
    expect(limiter.acquire(connection, 'resets:alpha')).toBe(true);
  });
});

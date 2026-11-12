import { describe, expect, it } from '@jest/globals';
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

    // The subscription handlers are exercised in realtime/__tests__/applicationSocket.test.ts,
    // broadcast filtering in realtime/__tests__/broadcasts.test.ts, and the overlord-only
    // /who route in features/admin/__tests__/adminComposition.test.ts.
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

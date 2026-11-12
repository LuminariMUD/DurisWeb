import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WebSocket, type WebSocketServer } from 'ws';
import type { UserPermissions } from '../../services/permissionService.js';
import type { ApplicationClientState } from '../clientState.js';

const getCategoryAccessForAccount =
  jest.fn<(categoryId: number, permissions: UserPermissions) => Promise<{ canView: boolean }>>();
jest.unstable_mockModule('../../services/categoryService.js', () => ({
  getCategoryAccessForAccount,
}));

const broadcasts = await import('../broadcasts.js');

type SyntheticSocket = ApplicationClientState & {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock;
  terminate: jest.Mock;
};

function permissions(level: number | null, grants: string[] = []): UserPermissions {
  return {
    accountName: 'Fixture',
    role: 'player',
    immortalLevel: null,
    maxLevel: level ?? 50,
    canAccessImmortalForum: false,
    canAccessGodForum: false,
    guilds: [],
    canModerate: false,
    canBan: false,
    canEditPosts: false,
    canDeletePosts: false,
    canPinThreads: false,
    canLockThreads: false,
    adminPermissions: grants,
  };
}

function socket(
  accountName?: string,
  level: number | null = null,
  grants: string[] = [],
  state: ApplicationClientState = {},
): SyntheticSocket {
  return {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: jest.fn(),
    terminate: jest.fn(),
    wsPrincipal: accountName
      ? {
          accountName,
          sessionId: 'fixture-sid',
          permissions: { ...permissions(level, grants), accountName },
        }
      : undefined,
    ...state,
  };
}

function attach(...clients: SyntheticSocket[]): void {
  broadcasts.attachBroadcastServer({ clients: new Set(clients) } as unknown as WebSocketServer);
}

const delivered = (client: SyntheticSocket) => client.send.mock.calls.length > 0;

describe('application broadcasts', () => {
  beforeEach(() => {
    broadcasts.detachBroadcastServer();
    getCategoryAccessForAccount.mockReset();
  });

  it('is a no-op without an attached server or after detaching', async () => {
    const client = socket();
    broadcasts.broadcastNewEvent({ id: 1 });
    attach(client);
    broadcasts.detachBroadcastServer();
    broadcasts.broadcastNewsUpdate({ date: '2026-11-10', items: [] });
    await broadcasts.broadcastForumPost(1, {}, 'Author', 2);
    expect(delivered(client)).toBe(false);
  });

  it('sends public events to every open socket only', () => {
    const open = socket();
    const closed = { ...socket(), readyState: WebSocket.CLOSED };
    attach(open, closed);
    broadcasts.broadcastAuctionEvent('AUCTION_NEW', { id: 1 });
    expect(JSON.parse(open.send.mock.calls[0]?.[0] as string)).toEqual({
      type: 'AUCTION_NEW',
      data: { id: 1 },
    });
    expect(delivered(closed)).toBe(false);
  });

  it('limits permission broadcasts to entitled principals', () => {
    const anonymous = socket();
    const player = socket('Player');
    const operator = socket('Operator', 57, ['view_server_health', 'view_connection_logs']);
    attach(anonymous, player, operator);
    broadcasts.broadcastCrashAlert({ id: 1 });
    broadcasts.broadcastConnectionEvent({
      characterName: 'Synthetic',
      status: 'connect',
      ipAddress: '192.0.2.1',
      timestamp: new Date(0),
    });
    expect(operator.send).toHaveBeenCalledTimes(2);
    expect(delivered(anonymous) || delivered(player)).toBe(false);
  });

  it('requires a subscription plus health permission or level 57 for player events', () => {
    const subscribed = { playerEventsSubscribed: true };
    const granted = socket('Granted', null, ['view_server_health'], subscribed);
    const levelled = socket('Levelled', 57, [], subscribed);
    const unsubscribed = socket('Quiet', 57, ['view_server_health']);
    const lowLevel = socket('Low', 56, [], subscribed);
    attach(granted, levelled, unsubscribed, lowLevel, socket(undefined, null, [], subscribed));
    broadcasts.broadcastPlayerEvent('PLAYER_LOGIN', {});
    expect(granted.send).toHaveBeenCalledTimes(1);
    expect(levelled.send).toHaveBeenCalledTimes(1);
    expect(delivered(unsubscribed) || delivered(lowLevel)).toBe(false);
  });

  it('targets notifications at the matching account', () => {
    const owner = socket('Owner');
    const other = socket('Other');
    attach(owner, other, socket());
    broadcasts.broadcastNotification('Owner', { id: 1 });
    expect(delivered(owner)).toBe(true);
    expect(delivered(other)).toBe(false);
  });

  it('filters forum posts by category access, treating anonymous sockets as anonymous', async () => {
    const reader = socket('Reader');
    const anonymous = socket();
    attach(reader, anonymous);
    getCategoryAccessForAccount.mockImplementation(async (_category, viewer) => ({
      canView: viewer.accountName === 'Reader',
    }));
    await broadcasts.broadcastForumPost(5, { id: 9 }, 'Author', 3);
    expect(delivered(reader)).toBe(true);
    expect(delivered(anonymous)).toBe(false);
    expect(getCategoryAccessForAccount).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ accountName: '', maxLevel: 0 }),
    );
  });
});

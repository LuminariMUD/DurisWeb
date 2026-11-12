import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WebSocket } from 'ws';
import type { UserPermissions } from '../../services/permissionService.js';
import { stubModule } from '../../test/stubModule.js';

// Real auth/token verification and dispatch; every privileged effect is a synthetic stub.
let role: UserPermissions['role'] = 'player';
let maxLevel = 50;
let grants: string[] = [];
let terminalSession: number | undefined;
const watchLog = jest.fn((..._args: unknown[]) => true);
const unwatchLog = jest.fn();
const createSession = jest.fn(async (..._args: unknown[]) => ({ sessionId: 5 }));
const destroySession = jest.fn(async (_sessionId: number) => undefined);
const isTerminalOperationAuthorized = jest.fn<(...args: unknown[]) => Promise<boolean>>(
  async () => false,
);
const deployToCommit = jest.fn(async () => undefined);
const countZoneItems =
  jest.fn<typeof import('../../services/zoneBuilderStreamer.js').countZoneItems>();
// Web sessions that are still active; revoking one simulates logout, reset or expiry.
let activeSessions = new Set(['sid', 'sid2']);
let sessionLookupFails = false;
const hasActiveWebSession = jest.fn(async (_account: string, sid?: string) =>
  activeSessions.has(sid ?? ''),
);
const getActiveWebSessionIds = jest.fn(async (_sessions: unknown) => {
  if (sessionLookupFails) throw new Error('Web session lookup failed');
  const sessions = _sessions as Array<{ sessionId: string }>;
  return new Set(
    sessions.map(({ sessionId }) => sessionId).filter((sid) => activeSessions.has(sid)),
  );
});
const getUserPermissions = jest.fn(
  async (accountName: string, _characters: unknown): Promise<UserPermissions> => ({
    accountName,
    role,
    immortalLevel: null,
    maxLevel,
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
  }),
);

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../db/connection.js', { pool: {}, mudPool: {} });
stub('../../db/redis.js');
stub('../../services/sessionService.js', { hasActiveWebSession, getActiveWebSessionIds });
stub('../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
});
stub('../../services/permissionService.js', { getUserPermissions });
stub('../../services/logWatchService.js', { watchLog, unwatchLog });
stub('../../services/terminalService.js', {
  createSession,
  destroySession,
  isTerminalOperationAuthorized,
  getSessionByWebSocket: () => terminalSession,
});
stub('../../services/deploymentService.js', {
  deployToCommit,
  determineDeployAction: async () => 'deploy',
});
stub('../../services/gitService.js', {
  getCurrentCommitHash: async () => ({ full: 'a'.repeat(40), short: 'a'.repeat(7) }),
});
stub('../../services/zoneBuilderStreamer.js', { countZoneItems });
stub('../../services/zoneInfoService.js', { canAccessZone: async () => true });

const { handleApplicationConnection } = await import('../applicationSocket.js');
const { clientState } = await import('../clientState.js');
const { generateAccessToken, generateTerminalToken, generateWebSocketToken } = await import(
  '../../middleware/auth.js'
);
const {
  attachBroadcastServer,
  broadcastConnectionEvent,
  broadcastCrashAlert,
  detachBroadcastServer,
} = await import('../broadcasts.js');
const { revalidateSockets, revokeSocketSessions } = await import('../socketAuth.js');
const { default: logger } = await import('../../utils/logger.js');

type SyntheticSocket = EventEmitter & {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock;
  terminate: jest.Mock;
  close: jest.Mock;
};

const clients = new Set<SyntheticSocket>();

function connect(headers: IncomingMessage['headers'] = {}): SyntheticSocket {
  const ws: SyntheticSocket = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: jest.fn(),
    terminate: jest.fn(),
    close: jest.fn(() => {
      ws.readyState = WebSocket.CLOSED;
      ws.emit('close');
    }),
  });
  clients.add(ws);
  handleApplicationConnection(ws as unknown as WebSocket, { headers } as IncomingMessage);
  return ws;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
async function send(ws: SyntheticSocket, message: unknown) {
  ws.emit('message', Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)));
  await flush();
}
const replies = (ws: SyntheticSocket) =>
  ws.send.mock.calls.map(([message]) => JSON.parse(message as string));
const state = (ws: SyntheticSocket) => clientState(ws as unknown as WebSocket);
const wsToken = (sid = 'sid') => generateWebSocketToken('Fixture', 'f@example.invalid', sid);

describe('application socket dispatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    role = 'player';
    maxLevel = 50;
    grants = [];
    terminalSession = undefined;
    activeSessions = new Set(['sid', 'sid2']);
    sessionLookupFails = false;
    clients.clear();
    jest.clearAllMocks();
  });

  it('welcomes, answers ping, rejects bad JSON and ignores non-string types', async () => {
    const ws = connect();
    await send(ws, { type: 'ping' });
    await send(ws, '{not json');
    await send(ws, { type: ['SUBSCRIBE_LOG'], token: wsToken() });
    expect(replies(ws)).toEqual([
      { type: 'CONNECTED', message: 'Connected to DurisMUD PvP WebSocket' },
      { type: 'pong' },
      { type: 'ERROR', message: 'Invalid JSON' },
    ]);
    expect(watchLog).not.toHaveBeenCalled();
  });

  it('rate-limits a burst above 20 messages', async () => {
    const ws = connect();
    for (let i = 0; i < 21; i++) ws.emit('message', Buffer.from('{"type":"ping"}'));
    await flush();
    expect(replies(ws).at(-1)).toEqual({ type: 'ERROR', message: 'Rate limit exceeded' });
    expect(replies(ws).filter((reply) => reply.type === 'pong')).toHaveLength(20);
  });

  it('subscribes to player events only at level 57', async () => {
    const ws = connect();
    maxLevel = 56;
    await send(ws, { type: 'SUBSCRIBE_PLAYER_EVENTS', token: wsToken() });
    expect(state(ws).playerEventsSubscribed).toBe(false);
    maxLevel = 57;
    await send(ws, { type: 'SUBSCRIBE_PLAYER_EVENTS', token: wsToken() });
    expect(state(ws).playerEventsSubscribed).toBe(true);
    expect(state(ws).wsPrincipal?.accountName).toBe('Fixture');
  });

  it('requires terminal_access before creating a terminal', async () => {
    const ws = connect();
    const token = generateTerminalToken('Fixture', 'f@example.invalid', 'sid');
    await send(ws, { type: 'TERMINAL_CONNECT', token, cols: 100, rows: 30 });
    expect(replies(ws).at(-1)).toEqual({
      type: 'TERMINAL_ERROR',
      message: 'Terminal access permission required',
    });
    expect(createSession).not.toHaveBeenCalled();

    grants = ['terminal_access'];
    await send(ws, { type: 'TERMINAL_CONNECT', token, cols: 100, rows: 30 });
    expect(createSession).toHaveBeenCalledWith('Fixture', ws, 100, 30);
    expect(replies(ws).at(-1)).toEqual({ type: 'TERMINAL_CONNECTED', sessionId: 5 });
  });

  it('refuses deployment to non-overlords without deploying', async () => {
    const ws = connect();
    await send(ws, { type: 'DEPLOY_START', token: wsToken(), targetHash: 'a'.repeat(40) });
    expect(replies(ws).at(-1)).toEqual({
      type: 'DEPLOY_ERROR',
      message: 'Overlord access required for deployment',
    });
    expect(deployToCommit).not.toHaveBeenCalled();
  });

  it('keeps an unexpected deployment exception out of replies and logs', async () => {
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    role = 'overlord';
    deployToCommit.mockRejectedValueOnce(new Error('DEPLOY_PRIVATE_SENTINEL'));
    const ws = connect();
    await send(ws, { type: 'DEPLOY_START', token: wsToken(), targetHash: 'a'.repeat(40) });
    expect(deployToCommit).toHaveBeenCalledTimes(1);
    expect(replies(ws).at(-1)).toMatchObject({
      type: 'DEPLOY_ERROR',
      message: expect.stringMatching(/^Deployment failed \(reference /),
    });
    expect(JSON.stringify(replies(ws))).not.toContain('DEPLOY_PRIVATE_SENTINEL');
    expect(log.mock.calls).toEqual([
      [
        'Deployment WebSocket error:',
        {
          reference: expect.any(String),
          code: 'unclassified',
        },
      ],
    ]);
    expect(log).toHaveBeenCalledTimes(1);
    ws.emit('close');
  });

  it('keeps a zone-stream exception out of replies and logs', async () => {
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    countZoneItems.mockRejectedValueOnce(new Error('ZONE_PRIVATE_SENTINEL'));
    const ws = connect();
    await send(ws, {
      type: 'ZONE_STREAM_START',
      zoneId: 'zone-a',
      streamType: 'rooms',
      token: wsToken(),
    });
    expect(countZoneItems).toHaveBeenCalledWith('zone-a');
    expect(replies(ws).at(-1)).toMatchObject({
      type: 'ZONE_STREAM_ERROR',
      message: expect.stringMatching(/^Failed to load zone data \(reference /),
    });
    expect(JSON.stringify(replies(ws))).not.toContain('ZONE_PRIVATE_SENTINEL');
    expect(log.mock.calls).toEqual([
      [
        'Zone WebSocket stream failed',
        {
          reference: expect.any(String),
          code: 'unclassified',
        },
      ],
    ]);
    expect(log).toHaveBeenCalledTimes(1);
    ws.emit('close');
  });

  it('releases log watchers and the terminal on close', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'syslog',
    });
    expect(replies(ws).at(-1)).toEqual({
      type: 'LOG_SUBSCRIBED',
      category: 'runtime',
      logName: 'syslog',
    });
    const callback = watchLog.mock.calls[0]?.[2];
    terminalSession = 9;
    state(ws).terminalAuth = { accountName: 'Fixture', webSessionId: 'sid' };

    ws.emit('close');
    await flush();
    expect(unwatchLog).toHaveBeenCalledWith('runtime', 'syslog', callback);
    expect(state(ws).logSubscriptions?.size).toBe(0);
    expect(state(ws).terminalAuth).toBeUndefined();
    expect(destroySession).toHaveBeenCalledWith(9);
  });

  it('does not report or keep a subscription for a log that cannot be watched', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    watchLog.mockReturnValueOnce(false);
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'missing.log',
    });
    expect(replies(ws).at(-1)).toEqual({
      type: 'ERROR',
      category: 'runtime',
      logName: 'missing.log',
      message: 'Log unavailable',
    });
    expect(state(ws).logSubscriptions?.size).toBe(0);
  });

  it('does not watch a log for a socket that closed while its subscription was checked', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'SUBSCRIBE_LOG',
          token: wsToken(),
          category: 'runtime',
          logName: 'game.log',
        }),
      ),
    );
    ws.readyState = WebSocket.CLOSED;
    ws.emit('close');
    await flush();
    expect(watchLog).not.toHaveBeenCalled();
    expect(state(ws).logSubscriptions?.size).toBe(0);
  });
  it('cancels a subscription when unsubscribe arrives before authentication completes', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'SUBSCRIBE_LOG',
          token: wsToken(),
          category: 'runtime',
          logName: 'game.log',
        }),
      ),
    );
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'UNSUBSCRIBE_LOG', category: 'runtime', logName: 'game.log' }),
      ),
    );
    await flush();
    expect(watchLog).not.toHaveBeenCalled();
    expect(state(ws).logSubscriptions?.size).toBe(0);
    expect(replies(ws).filter((reply) => reply.type === 'LOG_SUBSCRIBED')).toHaveLength(0);
  });
  it('acknowledges an idempotent subscription without registering another watcher', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    const message = {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'game.log',
    };
    await send(ws, message);
    await send(ws, message);
    expect(watchLog).toHaveBeenCalledTimes(1);
    expect(replies(ws).filter((reply) => reply.type === 'LOG_SUBSCRIBED')).toHaveLength(2);
    ws.emit('close');
  });
  it('attempts every log cleanup and preserves colon-bearing filenames after a failure', async () => {
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const ws = connect();
    grants = ['view_server_logs'];
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'sys:log',
    });
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'player',
      logName: 'game.log',
    });
    unwatchLog.mockImplementationOnce(() => {
      throw new Error('CLEANUP_PRIVATE_SENTINEL');
    });
    ws.emit('close');
    await flush();
    expect(unwatchLog).toHaveBeenCalledTimes(2);
    expect(unwatchLog).toHaveBeenCalledWith('runtime', 'sys:log', expect.any(Function));
    expect(unwatchLog).toHaveBeenCalledWith('player', 'game.log', expect.any(Function));
    expect(state(ws).logSubscriptions?.size).toBe(0);
    expect(log.mock.calls).toEqual([['Log watcher cleanup failed', { code: 'unclassified' }]]);
  });
  it('does not revive a removed callback when the same log is subscribed again', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    const message = {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'game.log',
    };
    await send(ws, message);
    const previous = watchLog.mock
      .calls[0]?.[2] as import('../../services/logWatchService.js').LogWatchCallback;
    unwatchLog.mockImplementationOnce(() => {
      throw new Error('Synthetic close failure');
    });
    await send(ws, { type: 'UNSUBSCRIBE_LOG', category: 'runtime', logName: 'game.log' });
    await send(ws, message);
    const current = watchLog.mock
      .calls[1]?.[2] as import('../../services/logWatchService.js').LogWatchCallback;
    ws.send.mockClear();
    previous(['stale']);
    await flush();
    expect(replies(ws)).toEqual([]);
    current(['fresh']);
    await flush();
    expect(replies(ws)).toEqual([
      { type: 'LOG_UPDATE', category: 'runtime', logName: 'game.log', newLines: ['fresh'] },
    ]);
    ws.emit('close');
  });
  it('invalidates its client subscription when the real reader reports unavailable', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'game.log',
    });
    const callback = watchLog.mock
      .calls[0]?.[2] as import('../../services/logWatchService.js').LogWatchCallback;
    callback([], 'unavailable');
    await flush();
    expect(state(ws).logSubscriptions?.size).toBe(0);
    expect(replies(ws).at(-1)).toEqual({
      type: 'ERROR',
      category: 'runtime',
      logName: 'game.log',
      message: 'Log unavailable',
    });
  });

  it('still tears down the terminal when an earlier close step fails', async () => {
    const ws = connect();
    grants = ['view_server_logs'];
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'game.log',
    });
    terminalSession = 9;
    unwatchLog.mockImplementationOnce(() => {
      throw new Error('watcher already closed');
    });
    ws.emit('close');
    await flush();
    expect(unwatchLog).toHaveBeenCalled();
    expect(destroySession).toHaveBeenCalledWith(9);
  });

  it('contains a failed terminal teardown on close', async () => {
    const ws = connect();
    terminalSession = 9;
    destroySession.mockRejectedValueOnce(new Error('pty already gone'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      ws.emit('close');
      await flush();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect(destroySession).toHaveBeenCalledWith(9);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('application socket principal revalidation', () => {
  const crash = { id: 1 };
  const connection = {
    characterName: 'Someone',
    status: 'connected',
    ipAddress: '192.0.2.1',
    timestamp: new Date(0),
  };
  const subscribeLog = (ws: SyntheticSocket, sid = 'sid') =>
    send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(sid),
      category: 'runtime',
      logName: 'syslog',
    });
  const pushedTypes = (ws: SyntheticSocket) => replies(ws).map((reply) => reply.type);

  beforeEach(() => {
    role = 'player';
    maxLevel = 50;
    grants = ['view_server_logs', 'view_server_health', 'view_connection_logs'];
    terminalSession = undefined;
    activeSessions = new Set(['sid', 'sid2']);
    sessionLookupFails = false;
    clients.clear();
    jest.clearAllMocks();
    attachBroadcastServer({ clients } as never);
  });
  afterAll(() => detachBroadcastServer());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stops log lines and privileged broadcasts once the subscribed session is revoked', async () => {
    const ws = connect();
    await subscribeLog(ws);
    const callback = watchLog.mock.calls[0]?.[2] as (lines: string[]) => void;
    activeSessions.delete('sid');

    revokeSocketSessions({ accountName: 'Fixture', sessionId: 'sid' });
    await flush();
    ws.send.mockClear();
    callback(['secret line']);
    broadcastCrashAlert(crash);
    broadcastConnectionEvent(connection);

    expect(ws.close).toHaveBeenCalledWith(4401, 'Session ended');
    expect(unwatchLog).toHaveBeenCalledWith('runtime', 'syslog', callback);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('revokes only the logged-out session, or every session of the account case-insensitively', async () => {
    const first = connect();
    const second = connect();
    await subscribeLog(first, 'sid');
    await subscribeLog(second, 'sid2');

    revokeSocketSessions({ accountName: 'Fixture', sessionId: 'sid' });
    expect(first.close).toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();

    revokeSocketSessions({ accountName: 'fixture' });
    expect(second.close).toHaveBeenCalled();
  });

  it('applies permission loss on revalidation without closing a live session', async () => {
    const ws = connect();
    maxLevel = 57;
    await subscribeLog(ws);
    await send(ws, { type: 'SUBSCRIBE_PLAYER_EVENTS', token: wsToken() });
    const callback = watchLog.mock.calls[0]?.[2] as (lines: string[]) => void;

    grants = [];
    maxLevel = 50;
    await revalidateSockets();
    ws.send.mockClear();
    callback(['secret line']);
    broadcastCrashAlert(crash);
    broadcastConnectionEvent(connection);
    const { broadcastPlayerEvent } = await import('../broadcasts.js');
    broadcastPlayerEvent('PLAYER_LOGIN', {});

    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
    expect(state(ws).wsPrincipal?.permissions.adminPermissions).toEqual([]);
  });

  it('closes sockets whose session expired or could not be checked', async () => {
    const expired = connect();
    await subscribeLog(expired, 'sid');
    activeSessions.delete('sid');
    await revalidateSockets();
    expect(expired.close).toHaveBeenCalledWith(4401, 'Session ended');

    const unverifiable = connect();
    await subscribeLog(unverifiable, 'sid2');
    sessionLookupFails = true;
    await revalidateSockets();
    expect(unverifiable.close).toHaveBeenCalledWith(4401, 'Session ended');
  });

  it('ends a terminal whose owner lost terminal_access', async () => {
    const ws = connect();
    grants = ['terminal_access'];
    const token = generateTerminalToken('Fixture', 'f@example.invalid', 'sid');
    await send(ws, { type: 'TERMINAL_CONNECT', token, cols: 80, rows: 24 });
    terminalSession = 5;

    await revalidateSockets();
    expect(destroySession).not.toHaveBeenCalled();

    grants = [];
    await revalidateSockets();
    expect(destroySession).toHaveBeenCalledWith(5);
    expect(state(ws).terminalAuth).toBeUndefined();
  });

  it.each([false, true])(
    'does not close a newer login after an old session lookup (failure=%s)',
    async (failure) => {
      const ws = connect();
      await subscribeLog(ws);
      let resolve!: (value: Set<string>) => void;
      let reject!: (reason: Error) => void;
      getActiveWebSessionIds.mockImplementationOnce(
        () =>
          new Promise<Set<string>>((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const pending = revalidateSockets();
      await subscribeLog(ws, 'sid2');
      const replacement = state(ws).wsPrincipal;
      if (failure) reject(new Error('fixture private sql 192.0.2.1'));
      else resolve(new Set(['sid']));
      await pending;
      expect(ws.close).not.toHaveBeenCalled();
      expect(state(ws).wsPrincipal).toBe(replacement);
    },
  );

  it.each([false, true])(
    'never applies a late permission lookup to a newer login (failure=%s)',
    async (failure) => {
      const ws = connect();
      await subscribeLog(ws);
      const oldPermissions = state(ws).wsPrincipal!.permissions;
      let resolve!: (value: UserPermissions) => void;
      let reject!: (reason: Error) => void;
      getUserPermissions.mockImplementationOnce(
        () =>
          new Promise<UserPermissions>((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const pending = revalidateSockets();
      await flush();
      grants = [];
      maxLevel = 57;
      await send(ws, { type: 'SUBSCRIBE_PLAYER_EVENTS', token: wsToken('sid2') });
      const replacement = state(ws).wsPrincipal;
      if (failure) reject(new Error('private account path 192.0.2.1'));
      else resolve(oldPermissions);
      await pending;
      expect(ws.close).not.toHaveBeenCalled();
      expect(state(ws).wsPrincipal).toBe(replacement);
      expect(state(ws).wsPrincipal?.sessionId).toBe('sid2');
      expect(state(ws).wsPrincipal?.permissions.adminPermissions).toEqual([]);
    },
  );

  it('does not destroy a replacement terminal after its former owner lookup completes', async () => {
    const ws = connect();
    grants = ['terminal_access'];
    await send(ws, {
      type: 'TERMINAL_CONNECT',
      token: generateTerminalToken('Fixture', 'f@example.invalid', 'sid'),
    });
    terminalSession = 5;
    const denied = { ...(await getUserPermissions('Fixture', [])), adminPermissions: [] };
    let release!: (value: UserPermissions) => void;
    getUserPermissions.mockImplementationOnce(
      () =>
        new Promise<UserPermissions>((yes) => {
          release = yes;
        }),
    );
    const pending = revalidateSockets();
    await flush();
    createSession.mockResolvedValueOnce({ sessionId: 6 });
    await send(ws, {
      type: 'TERMINAL_CONNECT',
      token: generateTerminalToken('Fixture', 'f@example.invalid', 'sid2'),
    });
    terminalSession = 6;
    const replacement = state(ws).terminalAuth;
    destroySession.mockClear();
    release(denied);
    await pending;
    expect(destroySession).not.toHaveBeenCalled();
    expect(state(ws).terminalAuth).toBe(replacement);
  });

  it('releases denied log watchers and sends scoped errors without reviving them on permission regain', async () => {
    const ws = connect();
    await send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'sys:log',
    });
    const callback = watchLog.mock.calls[0]?.[2];
    grants = [];
    await revalidateSockets();
    expect(unwatchLog).toHaveBeenCalledWith('runtime', 'sys:log', callback);
    expect(state(ws).logSubscriptions?.size).toBe(0);
    expect(replies(ws)).toContainEqual({
      type: 'ERROR',
      category: 'runtime',
      logName: 'sys:log',
      message: 'Server log permission required',
    });
    grants = ['view_server_logs'];
    await revalidateSockets();
    expect(watchLog).toHaveBeenCalledTimes(1);
    expect(ws.close).not.toHaveBeenCalled();
  });

  it.each(['sessions', 'permissions'])(
    'bounds stalled %s checks, fences late completion and permits a later pass',
    async (kind) => {
      const ws = connect();
      await subscribeLog(ws);
      const principal = state(ws).wsPrincipal!;
      let release!: () => void;
      if (kind === 'sessions') {
        getActiveWebSessionIds.mockImplementationOnce(
          () =>
            new Promise<Set<string>>((yes) => {
              release = () => yes(new Set(['sid']));
            }),
        );
      } else {
        getUserPermissions.mockImplementationOnce(
          () =>
            new Promise<UserPermissions>((yes) => {
              release = () => yes({ ...principal.permissions, adminPermissions: [] });
            }),
        );
      }
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      const pending = revalidateSockets();
      await flush();
      await jest.advanceTimersByTimeAsync(10_000);
      let finished = false;
      void pending.then(() => {
        finished = true;
      });
      await flush();
      try {
        expect(finished).toBe(true);
        expect(ws.close).toHaveBeenCalledWith(4401, 'Session ended');
        const duringOutage = connect();
        await subscribeLog(duringOutage, 'sid2');
        const queries = getActiveWebSessionIds.mock.calls.length;
        await Promise.all([revalidateSockets(), revalidateSockets()]);
        expect(duringOutage.close).toHaveBeenCalledWith(4401, 'Session ended');
        expect(getActiveWebSessionIds).toHaveBeenCalledTimes(queries);
      } finally {
        release();
        await pending;
      }
      await flush();
      expect(principal.permissions.adminPermissions).toContain('view_server_logs');
      const next = connect();
      await subscribeLog(next, 'sid2');
      await revalidateSockets();
      expect(next.close).not.toHaveBeenCalled();
      jest.useRealTimers();
    },
  );

  it('does not bind a subscription whose session ended during permission lookup', async () => {
    const ws = connect();
    const permissions = await getUserPermissions('Fixture', []);
    let release!: (value: UserPermissions) => void;
    getUserPermissions.mockImplementationOnce(
      () =>
        new Promise<UserPermissions>((yes) => {
          release = yes;
        }),
    );
    const pending = send(ws, {
      type: 'SUBSCRIBE_LOG',
      token: wsToken(),
      category: 'runtime',
      logName: 'syslog',
    });
    await flush();
    activeSessions.delete('sid');
    revokeSocketSessions({ accountName: 'Fixture', sessionId: 'sid' });
    release(permissions);
    await pending;
    await flush();
    expect(watchLog).not.toHaveBeenCalled();
    expect(state(ws).wsPrincipal).toBeUndefined();
  });

  it('makes pending terminal creation visible to logout and never acknowledges it afterwards', async () => {
    const ws = connect();
    grants = ['terminal_access'];
    let release!: (value: { sessionId: number }) => void;
    createSession.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          release = yes;
        }),
    );
    const pending = send(ws, {
      type: 'TERMINAL_CONNECT',
      token: generateTerminalToken('Fixture', 'f@example.invalid', 'sid'),
    });
    await flush();
    expect(state(ws).terminalAuth?.webSessionId).toBe('sid');
    activeSessions.delete('sid');
    revokeSocketSessions({ accountName: 'Fixture', sessionId: 'sid' });
    expect(ws.close).toHaveBeenCalledWith(4401, 'Session ended');
    terminalSession = 9;
    release({ sessionId: 9 });
    await pending;
    await flush();
    expect(destroySession).toHaveBeenCalledWith(9);
    expect(state(ws).terminalAuth).toBeUndefined();
    expect(pushedTypes(ws)).not.toContain('TERMINAL_CONNECTED');
  });

  it('leaves a newer terminal alone when an old input authorization fails late', async () => {
    const ws = connect();
    terminalSession = 5;
    state(ws).terminalAuth = { accountName: 'Fixture', webSessionId: 'sid' };
    let release!: (value: boolean) => void;
    isTerminalOperationAuthorized.mockImplementationOnce(
      () =>
        new Promise<boolean>((yes) => {
          release = yes;
        }),
    );
    const pending = send(ws, { type: 'TERMINAL_INPUT', data: 'fixture' });
    await flush();
    const replacement = { accountName: 'Other', webSessionId: 'sid2' };
    state(ws).terminalAuth = replacement;
    terminalSession = 6;
    release(false);
    await pending;
    expect(destroySession).not.toHaveBeenCalled();
    expect(state(ws).terminalAuth).toBe(replacement);
    expect(pushedTypes(ws)).not.toContain('TERMINAL_ERROR');
  });

  it('logs revalidation failures without raw SQL, paths or addresses', async () => {
    const ws = connect();
    await subscribeLog(ws);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    getActiveWebSessionIds.mockRejectedValueOnce(
      Object.assign(new Error('private SQL /accounts/private 192.0.2.1'), {
        code: 'ER_ACCESS_DENIED_ERROR',
      }),
    );
    await revalidateSockets();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private SQL|\/accounts|192\.0\.2\.1/);
    expect(JSON.stringify(warn.mock.calls)).toContain('ER_ACCESS_DENIED_ERROR');
  });

  it('computes permissions once per account and coalesces concurrent passes', async () => {
    for (let i = 0; i < 3; i++) await subscribeLog(connect());
    getUserPermissions.mockClear();
    getActiveWebSessionIds.mockClear();

    await Promise.all([revalidateSockets(), revalidateSockets(), revalidateSockets()]);
    // The first pass plus one queued follow-up, however many callers arrived meanwhile.
    expect(getActiveWebSessionIds).toHaveBeenCalledTimes(2);
    expect(getUserPermissions).toHaveBeenCalledTimes(2);
  });

  it('leaves anonymous sockets alone and still sends them public events', async () => {
    const ws = connect();
    await revalidateSockets();
    const { broadcastNewEvent } = await import('../broadcasts.js');
    broadcastNewEvent({ id: 1 });
    expect(getActiveWebSessionIds).not.toHaveBeenCalled();
    expect(pushedTypes(ws)).toContain('NEW_PVP_EVENT');
    expect(ws.close).not.toHaveBeenCalled();
  });

  it('does not let a late cookie hydration replace a token principal or revive a closed socket', async () => {
    let release!: () => void;
    hasActiveWebSession.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = () => resolve(true))),
    );
    const cookie = `access_token=${generateAccessToken('Cookie', 'c@example.invalid', 'sid')}`;
    const ws = connect({ cookie });
    await subscribeLog(ws);
    expect(state(ws).wsPrincipal?.accountName).toBe('Fixture');
    release();
    await flush();
    expect(state(ws).wsPrincipal?.accountName).toBe('Fixture');

    hasActiveWebSession.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = () => resolve(true))),
    );
    const closed = connect({ cookie });
    closed.close();
    release();
    await flush();
    expect(state(closed).wsPrincipal).toBeUndefined();
  });
});

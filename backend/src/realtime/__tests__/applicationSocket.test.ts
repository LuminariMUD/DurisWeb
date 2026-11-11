import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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
const deployToCommit = jest.fn(async () => undefined);

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../db/connection.js', { pool: {}, mudPool: {} });
stub('../../db/redis.js');
stub('../../services/sessionService.js', { hasActiveWebSession: async () => true });
stub('../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
});
stub('../../services/permissionService.js', {
  getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
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
});
stub('../../services/logWatchService.js', { watchLog, unwatchLog });
stub('../../services/terminalService.js', {
  createSession,
  destroySession,
  getSessionByWebSocket: () => terminalSession,
});
stub('../../services/deploymentService.js', { deployToCommit });
stub('../../services/gitService.js');
stub('../../services/zoneBuilderStreamer.js');
stub('../../services/zoneInfoService.js');

const { handleApplicationConnection } = await import('../applicationSocket.js');
const { clientState } = await import('../clientState.js');
const { generateTerminalToken, generateWebSocketToken } = await import('../../middleware/auth.js');

type SyntheticSocket = EventEmitter & {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock;
  terminate: jest.Mock;
};

function connect(): SyntheticSocket {
  const ws = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: jest.fn(),
    terminate: jest.fn(),
  });
  handleApplicationConnection(ws as unknown as WebSocket, { headers: {} } as IncomingMessage);
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
const wsToken = () => generateWebSocketToken('Fixture', 'f@example.invalid', 'sid');

describe('application socket dispatch', () => {
  beforeEach(() => {
    role = 'player';
    maxLevel = 50;
    grants = [];
    terminalSession = undefined;
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
    expect(replies(ws).at(-1)).toEqual({ type: 'ERROR', message: 'Log unavailable' });
    expect(state(ws).logSubscriptions?.size).toBe(0);
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

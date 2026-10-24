import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

const hasActiveWebSession = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const pty = {
  pid: 4242,
  onData: jest.fn(),
  onExit: jest.fn(),
  kill: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
};

const spawn = jest.fn(() => pty);

jest.unstable_mockModule('node-pty', () => ({
  spawn,
}));
jest.unstable_mockModule('node:fs/promises', () => ({ unlink: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute },
}));
jest.unstable_mockModule('../sessionService.js', () => ({
  hasActiveWebSession,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({
    mud: {
      directory: '/tmp/duris-test',
      terminalSandboxBinary: '/usr/bin/custom-bwrap',
      processShell: '/opt/custom-shell',
      processPath: '/usr/local/bin:/usr/bin:/bin',
      processUser: 'duris-test',
      processLocale: 'C.UTF-8',
    },
  }),
}));

const terminalService = await import('../terminalService.js');
const { APPLICATION_MAX_BUFFERED_BYTES } = await import('../../utils/applicationWebSocket.js');

type FakeWebSocket = EventEmitter & {
  readyState: number;
  bufferedAmount: number;
  send: jest.Mock;
  terminate: jest.Mock;
};

function fakeWebSocket(): FakeWebSocket {
  return Object.assign(new EventEmitter(), {
    readyState: 1,
    bufferedAmount: 0,
    send: jest.fn(),
    terminate: jest.fn(),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('terminal WebSocket session authorization', () => {
  beforeEach(() => {
    hasActiveWebSession.mockReset();
    execute.mockReset();
    pty.onData.mockReset();
    pty.onExit.mockReset();
    pty.kill.mockReset();
    pty.write.mockReset();
    pty.resize.mockReset();
    spawn.mockReset();
    spawn.mockImplementation(() => pty);
  });

  afterEach(async () => {
    await terminalService.cleanupAllSessions();
  });

  it('rejects terminal operations after the bound web session is revoked', async () => {
    execute.mockResolvedValueOnce([{ insertId: 7 }]).mockResolvedValue([]);
    hasActiveWebSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const ws = fakeWebSocket();
    const created = await terminalService.createSession('Cwial', ws as never);

    await expect(
      terminalService.isTerminalOperationAuthorized(
        created.sessionId,
        ws as never,
        'Cwial',
        'web-session-7',
      ),
    ).resolves.toBe(true);
    await expect(
      terminalService.isTerminalOperationAuthorized(
        created.sessionId,
        ws as never,
        'Cwial',
        'web-session-7',
      ),
    ).resolves.toBe(false);
  });

  it('removes the old socket binding when an account reconnects', async () => {
    execute.mockResolvedValueOnce([{ insertId: 8 }]).mockResolvedValue([]);
    hasActiveWebSession.mockResolvedValue(true);

    const firstSocket = fakeWebSocket();
    const secondSocket = fakeWebSocket();
    const first = await terminalService.createSession('Cwial', firstSocket as never);
    const rebound = await terminalService.createSession('Cwial', secondSocket as never);

    expect(rebound.sessionId).toBe(first.sessionId);
    expect(terminalService.getSessionByWebSocket(firstSocket as never)).toBeUndefined();
    expect(terminalService.getSessionByWebSocket(secondSocket as never)).toBe(first.sessionId);
  });

  it('passes an isolated tmux namespace and bashrc path to the PTY', async () => {
    execute.mockResolvedValueOnce([{ insertId: 12 }]).mockResolvedValue([]);

    const ws = fakeWebSocket();
    await terminalService.createSession('Cwial', ws as never);

    const [sandboxBinary, commandArgs, options] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(sandboxBinary).toBe('/usr/bin/custom-bwrap');
    expect(options.env.DURIS_TMUX_SESSION).toBe('duris-Cwial-12');
    expect(options.env.DURIS_BASHRC_PATH).toBe('/tmp/.duris_bashrc-12');
    expect(options.env.SHELL).toBe('/opt/custom-shell');
    expect(options.env.DURIS_TMUX_SHELL_COMMAND).toBe(
      "'/opt/custom-shell' --rcfile '/tmp/.duris_bashrc-12'",
    );
    expect(commandArgs.join(' ')).toContain('$DURIS_TMUX_SESSION');
    expect(commandArgs.join(' ')).toContain('$DURIS_BASHRC_PATH');
    expect(commandArgs.join(' ')).toContain('$DURIS_TMUX_SHELL_COMMAND');
    expect(commandArgs.join(' ')).not.toContain('bash --rcfile');
  });

  it('destroys all active terminal sessions for an account', async () => {
    execute.mockResolvedValueOnce([{ insertId: 13 }]).mockResolvedValue([]);

    const ws = fakeWebSocket();
    await terminalService.createSession('Cwial', ws as never);
    await terminalService.cleanupAccountSessions('Cwial');

    expect(terminalService.getAccountSessions('Cwial')).toEqual([]);
    expect(terminalService.getActiveSessionCount()).toBe(0);
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it('uses an account- and session-specific tmux namespace', () => {
    expect(terminalService.getTerminalSessionName('Cwial', 8)).toBe('duris-Cwial-8');
    expect(terminalService.getTerminalSessionName('name with spaces', 9)).toMatch(
      /^duris-name_with_spaces-9$/,
    );
  });

  it('delivers normal terminal output through the shared bound and refuses a stalled consumer', async () => {
    execute.mockResolvedValueOnce([{ insertId: 14 }]).mockResolvedValue([]);
    const ws = fakeWebSocket();
    await terminalService.createSession('Cwial', ws as never);
    const onData = pty.onData.mock.calls[0][0] as (data: string) => void;
    onData('ordinary terminal output');
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'TERMINAL_OUTPUT',
        data: 'ordinary terminal output',
      }),
      expect.any(Function),
    );
    const sent = ws.send.mock.calls.length;
    ws.bufferedAmount = APPLICATION_MAX_BUFFERED_BYTES;
    onData('slow consumer');
    expect(ws.terminate).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledTimes(sent);
  });

  it('does not create a PTY after its socket closes during the initial database insert', async () => {
    const insert = deferred<unknown>();
    execute.mockReturnValueOnce(insert.promise).mockResolvedValue([]);
    const ws = fakeWebSocket();
    const creating = terminalService.createSession('Cwial', ws as never);
    ws.readyState = 3;
    ws.emit('close');
    insert.resolve([{ insertId: 900001 }]);
    expect((await creating).sessionId).toBe(-1);
    expect(spawn).not.toHaveBeenCalled();
    expect(terminalService.getActiveSessionCount()).toBe(0);
  });

  it('serializes concurrent creation for the same account', async () => {
    const insert = deferred<unknown>();
    execute.mockReturnValueOnce(insert.promise).mockResolvedValue([{ insertId: 900002 }]);
    const ws = fakeWebSocket();
    const first = terminalService.createSession('Cwial', ws as never);
    const second = terminalService.createSession('Cwial', ws as never);
    insert.resolve([{ insertId: 900002 }]);
    const results = await Promise.all([first, second]);
    expect(results[1].sessionId).toBe(results[0].sessionId);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(
      execute.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO terminal_sessions')),
    ).toHaveLength(1);
  });

  it('cancels pending creation when account-wide terminal cleanup happens before the insert completes', async () => {
    const insert = deferred<unknown>();
    execute.mockReturnValueOnce(insert.promise).mockResolvedValue([]);
    const creating = terminalService.createSession('Cwial', fakeWebSocket() as never);
    const logout = terminalService.cleanupAccountSessions('Cwial');
    insert.resolve([{ insertId: 900003 }]);
    await Promise.all([creating, logout]);
    expect(spawn).not.toHaveBeenCalled();
    expect(terminalService.getActiveSessionCount()).toBe(0);
  });

  it('kills and removes a spawned PTY when its PID update fails', async () => {
    execute
      .mockResolvedValueOnce([{ insertId: 900004 }])
      .mockRejectedValueOnce(new Error('fixture PID update failed'))
      .mockResolvedValue([]);
    expect((await terminalService.createSession('Cwial', fakeWebSocket() as never)).sessionId).toBe(
      -1,
    );
    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(terminalService.getActiveSessionCount()).toBe(0);
  });

  it('kills the PTY immediately while final output logging is blocked', async () => {
    execute.mockResolvedValueOnce([{ insertId: 900005 }]).mockResolvedValue([]);
    const ws = fakeWebSocket();
    const created = await terminalService.createSession('Cwial', ws as never);
    const onData = pty.onData.mock.calls[0][0] as (data: string) => void;
    onData('final fixture output');
    const log = deferred<unknown>();
    execute.mockReturnValueOnce(log.promise).mockResolvedValue([]);
    const closing = terminalService.destroySession(created.sessionId);
    try {
      expect(pty.kill).toHaveBeenCalledTimes(1);
      expect(terminalService.getSessionByWebSocket(ws as never)).toBeUndefined();
    } finally {
      log.resolve([]);
      await closing;
    }
  });

  it('cleans up a socket that closes while its PID update is pending', async () => {
    const update = deferred<unknown>();
    execute
      .mockResolvedValueOnce([{ insertId: 900006 }])
      .mockReturnValueOnce(update.promise)
      .mockResolvedValue([]);
    const ws = fakeWebSocket();
    const creating = terminalService.createSession('Cwial', ws as never);
    await Promise.resolve();
    expect(spawn).toHaveBeenCalledTimes(1);
    ws.readyState = 3;
    ws.emit('close');
    try {
      expect(pty.kill).toHaveBeenCalledTimes(1);
      expect(terminalService.getActiveSessionCount()).toBe(0);
    } finally {
      update.resolve([]);
      expect((await creating).sessionId).toBe(-1);
    }
  });

  it('handles PTY exit before its PID update completes without resurrecting the session', async () => {
    const update = deferred<unknown>();
    execute
      .mockResolvedValueOnce([{ insertId: 900007 }])
      .mockReturnValueOnce(update.promise)
      .mockResolvedValue([]);
    const creating = terminalService.createSession('Cwial', fakeWebSocket() as never);
    await Promise.resolve();
    const onExit = pty.onExit.mock.calls[0][0] as (event: {
      exitCode: number;
      signal: number;
    }) => void;
    onExit({ exitCode: 0, signal: 0 });
    update.resolve([]);
    expect((await creating).sessionId).toBe(-1);
    expect(terminalService.getActiveSessionCount()).toBe(0);
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });
});

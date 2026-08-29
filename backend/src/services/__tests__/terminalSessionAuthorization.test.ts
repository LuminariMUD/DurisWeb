import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

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
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute },
}));
jest.unstable_mockModule('../sessionService.js', () => ({
  hasActiveWebSession,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const terminalService = await import('../terminalService.js');

type FakeWebSocket = { readyState: number; send: jest.Mock };

function fakeWebSocket(): FakeWebSocket {
  return { readyState: 1, send: jest.fn() };
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
    execute
      .mockResolvedValueOnce([{ insertId: 7 }])
      .mockResolvedValue([]);
    hasActiveWebSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const ws = fakeWebSocket();
    const created = await terminalService.createSession('Cwial', ws as never);

    await expect(terminalService.isTerminalOperationAuthorized(
      created.sessionId,
      ws as never,
      'Cwial',
      'web-session-7',
    )).resolves.toBe(true);
    await expect(terminalService.isTerminalOperationAuthorized(
      created.sessionId,
      ws as never,
      'Cwial',
      'web-session-7',
    )).resolves.toBe(false);
  });

  it('removes the old socket binding when an account reconnects', async () => {
    execute
      .mockResolvedValueOnce([{ insertId: 8 }])
      .mockResolvedValue([]);
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
    execute
      .mockResolvedValueOnce([{ insertId: 12 }])
      .mockResolvedValue([]);

    const ws = fakeWebSocket();
    await terminalService.createSession('Cwial', ws as never);

    const [, commandArgs, options] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
    expect(options.env.DURIS_TMUX_SESSION).toBe('duris-Cwial-12');
    expect(options.env.DURIS_BASHRC_PATH).toBe('/tmp/.duris_bashrc-12');
    expect(commandArgs.join(' ')).toContain('$DURIS_TMUX_SESSION');
    expect(commandArgs.join(' ')).toContain('$DURIS_BASHRC_PATH');
  });

  it('destroys all active terminal sessions for an account', async () => {
    execute
      .mockResolvedValueOnce([{ insertId: 13 }])
      .mockResolvedValue([]);

    const ws = fakeWebSocket();
    await terminalService.createSession('Cwial', ws as never);
    await terminalService.cleanupAccountSessions('Cwial');

    expect(terminalService.getAccountSessions('Cwial')).toEqual([]);
    expect(terminalService.getActiveSessionCount()).toBe(0);
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it('uses an account- and session-specific tmux namespace', () => {
    expect(terminalService.getTerminalSessionName('Cwial', 8)).toBe('duris-Cwial-8');
    expect(terminalService.getTerminalSessionName('name with spaces', 9)).toMatch(/^duris-name_with_spaces-9$/);
  });
});

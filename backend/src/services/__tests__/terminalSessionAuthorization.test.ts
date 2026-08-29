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

jest.unstable_mockModule('node-pty', () => ({
  spawn: jest.fn(() => pty),
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
});

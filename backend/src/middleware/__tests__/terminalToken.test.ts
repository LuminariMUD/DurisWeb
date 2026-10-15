import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';

process.env.JWT_SECRET = 'local-terminal-jwt-secret-at-least-32-bytes';

jest.unstable_mockModule('../../services/permissionService.js', () => ({
  getUserPermissions: jest.fn(),
}));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  parseAccountFile: jest.fn(),
}));
jest.unstable_mockModule('../../services/adminPermissionService.js', () => ({
  getUserPermissions: jest.fn(),
}));
jest.unstable_mockModule('../../services/sessionService.js', () => ({
  hasActiveWebSession: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let auth: typeof import('../auth.js');

beforeAll(async () => {
  auth = await import('../auth.js');
});

describe('scoped terminal tokens', () => {
  it('creates a short-lived terminal token that ordinary access verification rejects', () => {
    const terminalToken = auth.generateTerminalToken(
      'Cwial',
      'cwial@example.invalid',
      'web-session-1',
    );
    const payload = auth.verifyTerminalToken(terminalToken);

    expect(payload?.accountName).toBe('Cwial');
    expect(payload?.sid).toBe('web-session-1');
    expect(payload?.tokenType).toBe('terminal');
    expect(auth.isAccessToken(auth.verifyToken(terminalToken))).toBe(false);
    expect(auth.isRefreshToken(auth.verifyToken(terminalToken))).toBe(false);
    expect(
      auth.verifyTerminalToken(
        auth.generateAccessToken('Cwial', 'cwial@example.invalid', 'web-session-1'),
      ),
    ).toBeNull();
  });
});

describe('application WebSocket capabilities', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('binds the capability to the web session without granting HTTP or terminal access', () => {
    const token = auth.generateWebSocketToken('TestStaff', '', 'web-session-2');
    const payload = auth.verifyWebSocketToken(token);
    expect(payload?.accountName).toBe('TestStaff');
    expect(payload?.sid).toBe('web-session-2');
    expect(payload?.tokenType).toBe('websocket');
    expect(payload!.exp - payload!.iat).toBe(300);
    expect(auth.isAccessToken(auth.verifyToken(token))).toBe(false);
    expect(auth.isRefreshToken(auth.verifyToken(token))).toBe(false);
    expect(auth.verifyTerminalToken(token)).toBeNull();
  });

  it('rejects access, refresh, terminal, and altered tokens for application subscriptions', () => {
    for (const generate of [
      auth.generateAccessToken,
      auth.generateRefreshToken,
      auth.generateTerminalToken,
    ]) {
      expect(auth.verifyWebSocketToken(generate('TestStaff', '', 'web-session-2'))).toBeNull();
    }
    const token = auth.generateWebSocketToken('TestStaff', '', 'web-session-2');
    expect(auth.verifyWebSocketToken(token + 'invalid')).toBeNull();
  });

  it('rejects an expired capability', () => {
    jest.useFakeTimers();
    const token = auth.generateWebSocketToken('TestStaff', '', 'web-session-2');
    jest.setSystemTime(Date.now() + 301_000);
    expect(auth.verifyWebSocketToken(token)).toBeNull();
  });
});

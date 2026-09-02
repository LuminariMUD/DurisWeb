import { beforeAll, describe, expect, it, jest } from '@jest/globals';

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

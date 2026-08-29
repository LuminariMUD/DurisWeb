import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const compare = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const hash = jest.fn<(...args: unknown[]) => Promise<string>>();
const parseAccountFile = jest.fn<(...args: unknown[]) => Promise<any>>();
const updateAccountPassword = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const isBcryptHash = jest.fn<(...args: unknown[]) => boolean>();
const revokeAllWebSessions = jest.fn<(...args: unknown[]) => Promise<number>>();
const cleanupAccountSessions = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('bcrypt', () => ({
  default: { compare, hash },
}));
jest.unstable_mockModule('../../services/accountService.js', () => ({
  parseAccountFile,
  accountExists: jest.fn(),
  isBcryptHash,
  updateAccountPassword,
}));
jest.unstable_mockModule('../../services/permissionService.js', () => ({
  getFullUserContext: jest.fn(),
}));
jest.unstable_mockModule('../../services/sessionService.js', () => ({
  hasActiveWebSession: jest.fn(),
  hasMatchingRefreshSession: jest.fn(),
  revokeAllWebSessions,
}));
jest.unstable_mockModule('../../services/terminalService.js', () => ({
  cleanupAccountSessions,
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn() },
}));
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  generateTerminalToken: jest.fn(),
  verifyToken: jest.fn(),
  isAccessToken: jest.fn(() => true),
  isRefreshToken: jest.fn(() => true),
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      sessionId: 'session-current',
      permissions: {},
      adminPermissions: new Set(),
    };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

describe('password-change session teardown', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: authRoutes } = await import('../auth.js');
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  beforeEach(() => {
    compare.mockReset().mockResolvedValue(true);
    hash.mockReset().mockResolvedValue('new-bcrypt-hash');
    parseAccountFile.mockReset().mockResolvedValue({
      accountName: 'Cwial',
      email: 'cwial@example.invalid',
      passwordHash: 'old-bcrypt-hash',
      characters: [],
      isBlocked: false,
    });
    updateAccountPassword.mockReset().mockResolvedValue(undefined);
    isBcryptHash.mockReset().mockReturnValue(true);
    revokeAllWebSessions.mockReset().mockResolvedValue(3);
    cleanupAccountSessions.mockReset().mockResolvedValue(undefined);
  });

  it('revokes web sessions, destroys terminals, and clears cookies after success', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(response.status).toBe(200);
    expect(updateAccountPassword).toHaveBeenCalledWith('Cwial', 'new-bcrypt-hash');
    expect(revokeAllWebSessions).toHaveBeenCalledWith('Cwial');
    expect(cleanupAccountSessions).toHaveBeenCalledWith('Cwial');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('access_token=;'),
        expect.stringContaining('refresh_token=;'),
      ]),
    );
  });
});

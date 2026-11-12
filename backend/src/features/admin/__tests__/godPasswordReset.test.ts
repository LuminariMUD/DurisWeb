import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// The real god routes and auth; account levels, sessions and persistence are synthetic.
const LEVELS: Record<string, number> = {
  greater: 60,
  peer: 60,
  forger: 61,
  overlord: 62,
  mortal: 50,
};
// Stored account names keep their original casing; lookups ignore case.
const STORED_NAMES: Record<string, string> = { mortal: 'Mortal' };
const storedName = (accountName: string) =>
  STORED_NAMES[accountName.toLowerCase()] ?? accountName.toLowerCase();
const updateAccountPassword = jest.fn(async (_account: string, _hash: string) => undefined);
const revokeAllWebSessions = jest.fn(async (_account: string) => 1);
const cleanupAccountSessions = jest.fn(async (_account: string) => undefined);
const revokeSocketSessions = jest.fn((_target: { accountName: string }) => undefined);
const poolQuery = jest.fn(async (_sql: string, _params: unknown[]) => [{}]);
const searchAccounts = jest.fn(async (_query: string, _limit: number) => [] as string[]);
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));

const permissions = (accountName: string): UserPermissions => {
  const maxLevel = LEVELS[accountName.toLowerCase()] ?? 0;
  return {
    accountName,
    role: maxLevel >= 62 ? 'overlord' : 'greater_god',
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
    adminPermissions: [],
  };
};

stub('../../../db/connection.js', { pool: { query: poolQuery }, mudPool: {} });
stub('../../../db/redis.js', { getCache: async () => null });
stub('../../../services/sessionService.js', {
  hasActiveWebSession: async () => true,
  revokeAllWebSessions,
});
stub('../../../services/terminalService.js', { cleanupAccountSessions });
stub('../../../realtime/socketAuth.js', { revokeSocketSessions });
stub('../../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({
    accountName: storedName(accountName),
    characters: [],
  }),
  accountExists: async (accountName: string) => accountName in LEVELS,
  updateAccountPassword,
  searchAccounts,
});
stub('../../../services/permissionService.js', {
  getUserPermissions: async (accountName: string) => permissions(accountName),
});
stub('../../../services/adminPermissionService.js', { getUserPermissions: async () => new Set() });

const { adminGodRoutes } = await import('../godRoutes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/admin', adminGodRoutes);

const as = (account: string) =>
  `access_token=${generateAccessToken(account, `${account}@example.invalid`, 'sid')}`;
const reset = (caller: string, accountName: string) =>
  request(app)
    .post('/api/admin/god/reset-password')
    .set('Cookie', as(caller))
    .send({ accountName, newPassword: 'synthetic-pass' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('god password reset', () => {
  it.each(['mortal', 'MORTAL'])(
    'resets a lower-ranked account requested as %s under its stored name',
    async (requested) => {
      const response = await reset('greater', requested);
      expect(response.status).toBe(200);
      expect(updateAccountPassword).toHaveBeenCalledWith('Mortal', expect.stringMatching(/^\$2/));
      expect(revokeAllWebSessions).toHaveBeenCalledWith('Mortal');
      // Terminal session maps are keyed by the exact stored name.
      expect(cleanupAccountSessions).toHaveBeenCalledWith('Mortal');
      expect(revokeSocketSessions).toHaveBeenCalledWith({ accountName: 'Mortal' });
      expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('admin_action_log'), [
        'greater',
        'Mortal',
        'L60 reset L50 account',
      ]);
    },
  );

  it.each([
    ['greater', 'overlord'],
    ['greater', 'forger'],
    ['greater', 'peer'],
    ['overlord', 'overlord'],
    ['greater', 'GREATER'],
  ])('refuses %s resetting %s without touching the account', async (caller, target) => {
    const response = await reset(caller, target);
    expect(response.status).toBe(403);
    expect(updateAccountPassword).not.toHaveBeenCalled();
    expect(revokeAllWebSessions).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('keeps internal error text out of the response', async () => {
    updateAccountPassword.mockRejectedValueOnce(new Error('EACCES /var/duris/players/m/mortal'));
    const response = await reset('forger', 'mortal');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to reset password' });
  });

  it('revokes sockets before a failed terminal cleanup can interrupt the reset', async () => {
    cleanupAccountSessions.mockRejectedValueOnce(new Error('fixture terminal storage failure'));
    const response = await reset('greater', 'mortal');
    expect(response.status).toBe(500);
    expect(revokeSocketSessions).toHaveBeenCalledWith({ accountName: 'Mortal' });
    expect(revokeSocketSessions.mock.invocationCallOrder[0]).toBeLessThan(
      cleanupAccountSessions.mock.invocationCallOrder[0]!,
    );
  });

  it('bounds account search results', async () => {
    const response = await request(app)
      .get('/api/admin/god/accounts/search?query=a&limit=100000')
      .set('Cookie', as('greater'));
    expect(response.status).toBe(200);
    expect(searchAccounts).toHaveBeenCalledWith('a', 50);
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// The real health routes and auth; grants and persistence are synthetic.
let grants: string[] = [];
const poolQuery = jest.fn(async (_sql: string, _params: unknown[]) => [{}]);
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));

stub('../../../db/connection.js', { pool: { query: poolQuery }, mudPool: {} });
stub('../../../db/redis.js', { getCache: async () => null });
stub('../../../services/sessionService.js', { hasActiveWebSession: async () => true });
stub('../../../services/unifiedNotificationService.js');
stub('../../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
});
stub('../../../services/permissionService.js', {
  getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
    accountName,
    role: 'greater_god',
    immortalLevel: 60,
    maxLevel: 60,
    canAccessImmortalForum: true,
    canAccessGodForum: true,
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
stub('../../../services/adminPermissionService.js', {
  getUserPermissions: async () => new Set(grants),
});

const { adminHealthRoutes } = await import('../healthRoutes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/admin', adminHealthRoutes);

const patchCrash = (id: string, body: unknown) =>
  request(app)
    .patch(`/api/admin/crashes/${id}`)
    .set('Cookie', `access_token=${generateAccessToken('staff', 'staff@example.invalid', 'sid')}`)
    .send(body as object);

beforeEach(() => {
  grants = [];
  jest.clearAllMocks();
});

describe('PATCH /api/admin/crashes/:id', () => {
  it('refuses a read-only health viewer without touching the incident', async () => {
    grants = ['view_server_health'];
    const response = await patchCrash('3', { analyzed: true, notes: 'triaged' });
    expect(response.status).toBe(403);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['abc', { analyzed: true }],
    ['3', { notes: { nested: true } }],
    ['3', { notes: 'x'.repeat(10_001) }],
    ['3', { analyzed: 'yes' }],
  ])('rejects malformed input (%s)', async (id, body) => {
    grants = ['manage_server_incidents'];
    const response = await patchCrash(id, body);
    expect(response.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('lets an incident manager mark a crash analyzed', async () => {
    grants = ['manage_server_incidents'];
    const response = await patchCrash('3', { analyzed: true, notes: null });
    expect(response.status).toBe(200);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE server_incidents'), [
      1,
      null,
      3,
    ]);
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import express, { type IRouter } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// The composed /api/admin router with real auth; persistence and backups are synthetic.
const deleteFailedBackups = jest.fn(async () => 2);
const deleteBackup = jest.fn(async (_id: number) => true);
const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));

stub('../../../db/connection.js', { pool: {}, mudPool: {} });
stub('../../../db/redis.js', { getCache: async () => null });
stub('../../../services/sessionService.js', { hasActiveWebSession: async () => true });
stub('../../../services/accountService.js', {
  parseAccountFile: async (accountName: string) => ({ accountName, characters: [] }),
});
stub('../../../services/permissionService.js', {
  getUserPermissions: async (accountName: string): Promise<UserPermissions> => ({
    accountName,
    role: 'overlord',
    immortalLevel: 62,
    maxLevel: 62,
    canAccessImmortalForum: true,
    canAccessGodForum: true,
    guilds: [],
    canModerate: true,
    canBan: true,
    canEditPosts: true,
    canDeletePosts: true,
    canPinThreads: true,
    canLockThreads: true,
    adminPermissions: [],
  }),
});
stub('../../../services/adminPermissionService.js', { getUserPermissions: async () => new Set() });
stub('../../../services/backupService.js', { deleteFailedBackups, deleteBackup });

const { adminRouter } = await import('../routes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api/admin', (_req, res) => {
  res.status(418).json({ reached: 'next mount' });
});

/** Every (method, path) registered by the composed admin groups. */
function routes(router: IRouter): Array<[string, string]> {
  type Layer = {
    route?: { path: string; methods: Record<string, boolean> };
    handle?: { stack?: Layer[] };
  };
  const found: Array<[string, string]> = [];
  const visit = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.push([method, layer.route.path]);
        }
      } else if (layer.handle?.stack) {
        visit(layer.handle.stack);
      }
    }
  };
  visit((router as unknown as { stack: Layer[] }).stack);
  return found;
}

// Routes that were public before the split; everything else must reject anonymous callers.
const PUBLIC = new Set(['get /mud/time']);

describe('composed admin router', () => {
  it('rejects anonymous callers on every non-public admin route before any handler runs', async () => {
    const all = routes(adminRouter);
    expect(all.length).toBeGreaterThan(100);
    for (const [method, path] of all) {
      if (PUBLIC.has(`${method} ${path}`)) continue;
      const concrete = path.replace(/:(\w+)/g, '1');
      const response = await request(app)[method as 'get'](`/api/admin${concrete}`);
      expect([method, path, response.status]).toEqual([method, path, 401]);
    }
    expect(deleteFailedBackups).not.toHaveBeenCalled();
    expect(deleteBackup).not.toHaveBeenCalled();
  });

  it('passes unmatched paths through to later /api/admin mounts', async () => {
    for (const path of ['/users', '/git/status', '/analytics/web/summary']) {
      const response = await request(app).get(`/api/admin${path}`);
      expect([path, response.status]).toEqual([path, 418]);
    }
  });

  it('keeps specific routes ahead of dynamic IDs', async () => {
    const cookie = `access_token=${generateAccessToken('Overlord', 'o@example.invalid', 'sid')}`;
    const failed = await request(app).delete('/api/admin/backup/failed').set('Cookie', cookie);
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual(expect.objectContaining({ success: true, deletedCount: 2 }));
    expect(deleteBackup).not.toHaveBeenCalled();
  });
});

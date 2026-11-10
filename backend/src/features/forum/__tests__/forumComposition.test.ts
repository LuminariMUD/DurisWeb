import { describe, expect, it, jest } from '@jest/globals';
import express, { type IRouter } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// The composed /api/forum router with real optional/required auth; persistence is synthetic.
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
    role: 'player',
    immortalLevel: null,
    maxLevel: 50,
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
  }),
});
stub('../../../services/adminPermissionService.js', { getUserPermissions: async () => new Set() });

const { forumRouter } = await import('../routes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/forum', forumRouter);

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

// A read-only lookup that was public before the split.
const PUBLIC_WRITES = new Set(['post /characters/batch/accounts']);

describe('composed forum router', () => {
  it('rejects anonymous callers on every forum write before any handler runs', async () => {
    const writes = routes(forumRouter).filter(([method]) => method !== 'get');
    expect(writes.length).toBeGreaterThan(40);
    for (const [method, path] of writes) {
      if (PUBLIC_WRITES.has(`${method} ${path}`)) continue;
      const concrete = path.replace(/:(\w+)/g, '1');
      const response = await request(app)[method as 'post'](`/api/forum${concrete}`);
      expect([method, path, response.status]).toEqual([method, path, 401]);
    }
  });

  it('keeps /users/me routes ahead of /users/:accountName', async () => {
    const cookie = `access_token=${generateAccessToken('Player', 'p@example.invalid', 'sid')}`;
    const own = await request(app).post('/api/forum/users/me/avatar').set('Cookie', cookie);
    // The own-avatar handler answered (R2 is unconfigured in tests); the admin route would 403.
    expect([own.status, own.body]).toEqual([503, { error: 'Avatar upload is not available' }]);
    const other = await request(app).post('/api/forum/users/Someone/avatar').set('Cookie', cookie);
    expect(other.status).toBe(403);
  });
});

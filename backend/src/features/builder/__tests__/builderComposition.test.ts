import { describe, expect, it, jest } from '@jest/globals';
import express, { type IRouter } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { UserPermissions } from '../../../services/permissionService.js';
import { stubModule } from '../../../test/stubModule.js';

// The composed /api/builder router with real auth; every service behind it is a stub.
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

const { builderRouter } = await import('../routes.js');
const { generateAccessToken } = await import('../../../middleware/auth.js');
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/builder', builderRouter);

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

describe('composed builder router', () => {
  it('requires authentication, then manage_zones, before every builder route', async () => {
    const cookie = `access_token=${generateAccessToken('Player', 'p@example.invalid', 'sid')}`;
    const all = routes(builderRouter);
    expect(all.length).toBeGreaterThan(50);
    for (const [method, path] of all) {
      const url = `/api/builder${path.replace(/:(\w+)/g, '1')}`;
      const anonymous = await request(app)[method as 'get'](url);
      const unpermitted = await request(app)[method as 'get'](url).set('Cookie', cookie);
      expect([method, path, anonymous.status, unpermitted.status]).toEqual([
        method,
        path,
        401,
        403,
      ]);
    }
  });
});

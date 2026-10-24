import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import mysql, { type Connection, type Pool } from 'mysql2/promise';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { UserPermissions } from '../permissionService.js';
import { readOwnerSchemaFixture, applyOwnerSchemaFixture } from '../../test/ownerSchemaFixture.js';
import { prepareFixtureMetadata, runFixtureWebMigrations } from '../../test/webMigrationFixture.js';
import { loadWebBaselineBundle } from '../../db/webBaselineBundle.js';
import { runWebBaseline, externalSchemaSha256 } from '../../db/webBaseline.js';

const selected = process.env.TEST_TRAFFIC_DB_PORT;
const port = selected ? Number(selected) : undefined;
if (selected && (!port || ![23436, 23437].includes(port) || !process.env.TEST_BASELINE_MUD_SOURCE))
  throw new Error('Forum qualification requires a disposable port and pinned owner inputs');
const native = port ? describe : describe.skip;
const name = `durisweb_qualification_forum_search_${process.pid}`;
let admin: Connection | undefined;
let pool: Pool | undefined;
let created = false;
let search: typeof import('../forumService.js')['searchForum'];
let app: express.Express;
let authenticated = true;
const reader: UserPermissions = {
  accountName: 'Alice',
  role: 'player',
  immortalLevel: null,
  maxLevel: 56,
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
native('forum search SQL and pagination', () => {
  beforeAll(async () => {
    const inputs = readOwnerSchemaFixture(process.env.TEST_BASELINE_MUD_SOURCE!);
    admin = await mysql.createConnection({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      charset: 'utf8mb4',
    });
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [
      name,
    ]);
    created = true;
    await admin.changeUser({ database: name });
    await prepareFixtureMetadata(admin);
    await applyOwnerSchemaFixture(admin, port!, name, inputs);
    const bundle = loadWebBaselineBundle();
    await runWebBaseline(admin, 'bootstrap', await externalSchemaSha256(admin, bundle));
    runFixtureWebMigrations(port!, name);
    await admin.query('INSERT INTO forum_categories(id,name,access_type,min_level) VALUES ?', [
      [
        [1, 'Public', 'public', null],
        [2, 'Members', 'authenticated', null],
        [3, 'Staff', 'role_based', 57],
      ],
    ]);
    await admin.query(
      'INSERT INTO forum_threads(id,category_id,author_account_name,title,content,created_at,is_deleted) VALUES ?',
      [
        [
          [1, 1, 'Alice', 'Quartz alpha', 'Quartz expedition', '2026-10-01 12:00:00', 0],
          [2, 1, 'Bob', 'Quartz beta', 'Quartz expedition', '2026-10-02 12:00:00', 0],
          [3, 2, 'Alice', 'Quartz gamma', 'Quartz expedition', '2026-10-03 12:00:00', 0],
          [4, 3, 'Alice', 'Quartz private', 'Quartz private fixture', '2026-10-02 12:00:00', 0],
          [5, 1, 'Alice', 'Quartz deleted', 'Quartz deleted fixture', '2026-10-02 12:00:00', 1],
        ],
      ],
    );
    await admin.query(
      'INSERT INTO forum_posts(id,thread_id,author_account_name,content,created_at,is_deleted) VALUES ?',
      [
        [
          [1, 1, 'Bob', 'Quartz expedition', '2026-10-02 12:00:00', 0],
          [2, 1, 'Alice', 'Quartz expedition', '2026-10-03 12:00:00', 0],
          [3, 2, 'Alice', 'Quartz expedition', '2026-10-02 15:00:00', 0],
          [4, 2, 'Bob', 'Quartz expedition', '2026-10-04 12:00:00', 0],
          [5, 3, 'Alice', 'Quartz expedition', '2026-10-02 23:59:00', 0],
          [6, 4, 'Alice', 'Quartz private fixture', '2026-10-02 12:00:00', 0],
          [7, 1, 'Alice', 'Quartz deleted post', '2026-10-02 12:00:00', 1],
          [8, 5, 'Alice', 'Quartz deleted parent', '2026-10-02 12:00:00', 0],
        ],
      ],
    );
    pool = mysql.createPool({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      database: name,
      dateStrings: true,
    });
    jest.unstable_mockModule('../../db/connection.js', () => ({ pool, mudPool: pool }));
    jest.unstable_mockModule('../../db/redis.js', () => ({
      default: {},
      getCache: async () => null,
      setCache: async () => {},
      deleteCache: async () => {},
    }));
    jest.unstable_mockModule('../webSettingsService.js', () => ({
      getWebSettings: async () => ({ pvpDelayMinutes: 15, respectWebinfoToggle: true }),
    }));
    search = (await import('../forumService.js')).searchForum;
    const identify: RequestHandler = (req, _res, next) => {
      req.user = authenticated
        ? {
            accountName: 'Alice',
            email: 'fixture@example.invalid',
            sessionId: 'fixture-session',
            permissions: reader,
            adminPermissions: new Set(),
          }
        : undefined;
      next();
    };
    jest.unstable_mockModule('../../middleware/auth.js', () => ({
      optionalAuth: identify,
      requireAuth: identify,
      requireModerator: identify,
      requirePermission: () => identify,
    }));
    jest.unstable_mockModule('../../index.js', () => ({ broadcastForumPost: () => {} }));
    app = express();
    app.use('/api/forum', (await import('../../routes/forum.js')).default);
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      if (created) await admin.query('DROP DATABASE ??', [name]);
      await admin.end();
    }
  });

  it.each(['titles', 'content', 'both'] as const)(
    'applies author filtering to matching %s documents',
    async (scope) => {
      const result = await search({ query: 'quartz', scope, author: 'Alice' }, reader);
      expect(result.total).toBe(scope === 'titles' ? 2 : scope === 'content' ? 3 : 5);
      expect(result.results.every((row) => row.author === 'Alice')).toBe(true);
      expect(result.results.every((row) => row.category_id !== 3)).toBe(true);
    },
  );

  it('binds combined author/category/date filters in each branch and uses document timestamps', async () => {
    const result = await search(
      {
        query: 'quartz',
        scope: 'both',
        author: 'Alice',
        dateFrom: '2026-10-02',
        dateTo: '2026-10-03',
      },
      reader,
    );
    expect(result.results.map((row) => `${row.type}:${row.id}`)).toEqual(['post:5', 'post:3']);
    expect(result.total).toBe(2);
    const category = await search({ query: 'quartz', author: 'Alice', categoryId: 1 }, reader);
    expect(category.total).toBe(3);
  });

  it('returns the complete accessible total independently of stable, disjoint result pages', async () => {
    const first = await search({ query: 'quartz' }, reader, 1, 2);
    const second = await search({ query: 'quartz' }, reader, 2, 2);
    const repeated = await search({ query: 'quartz' }, reader, 1, 2);
    expect(first.total).toBe(8);
    expect(second.total).toBe(8);
    const identities = (rows: typeof first.results) => rows.map((row) => `${row.type}:${row.id}`);
    expect(new Set([...identities(first.results), ...identities(second.results)]).size).toBe(4);
    expect(identities(repeated.results)).toEqual(identities(first.results));
  });

  it('does not count private/deleted content for an ordinary reader', async () => {
    const hidden = await search({ query: 'private' }, reader);
    expect(hidden).toEqual({ results: [], total: 0 });
    const adminReader: UserPermissions = {
      ...reader,
      role: 'overlord',
      immortalLevel: 62,
      maxLevel: 62,
    };
    const all = await search({ query: 'quartz' }, adminReader);
    expect(all.total).toBe(10);
    expect(all.results.some((row) => row.type === 'thread' && row.id === 5)).toBe(false);
    expect(all.results.some((row) => row.type === 'post' && [7, 8].includes(row.id))).toBe(false);
  });

  it('keeps actual search-route pagination metadata aligned with real totals and bounds', async () => {
    const response = await request(app).get('/api/forum/search?query=quartz&page=2&limit=2');
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 2, limit: 2, total: 8, pages: 4 });
    const bounded = await request(app).get(
      '/api/forum/search?query=quartz&page=99999999&limit=100',
    );
    expect(bounded.status).toBe(200);
    expect(bounded.body.pagination).toEqual({ page: 10000, limit: 100, total: 8, pages: 1 });
    const trimmed = await request(app).get(
      '/api/forum/search?query=%20quartz%20&author=%20Alice%20',
    );
    expect(trimmed.status).toBe(200);
    expect(trimmed.body.pagination.total).toBe(5);
  });

  it('rejects structured query values and retains anonymous refusal', async () => {
    for (const query of [
      'query=quartz&query=alpha',
      'query=quartz&author=Alice&author=Bob',
      'query=quartz&page=1&page=2',
      'query=quartz&dateFrom=2026-10-01&dateFrom=2026-10-02',
    ]) {
      expect((await request(app).get('/api/forum/search?' + query)).status).toBe(400);
    }
    authenticated = false;
    try {
      expect((await request(app).get('/api/forum/search?query=quartz')).status).toBe(401);
    } finally {
      authenticated = true;
    }
  });
});

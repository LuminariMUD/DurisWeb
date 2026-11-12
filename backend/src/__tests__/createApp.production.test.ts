import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import { stubModule } from '../test/stubModule.js';

// The real composition built with a production configuration against a temporary
// frontend build, so the production-only branches are proven by responses.
const unavailable = async () => {
  throw new Error('database unavailable in composition test');
};
const database = { query: unavailable, execute: unavailable, getConnection: unavailable };
const battle = {
  event: { room_name: 'The "<Pit>" & co', stamp: '2026-11-12T00:00:00.000Z' },
  participants: [
    { player_description: '[56 Crusader] Juts (Githzerai)', pk_type: 'KILLER' },
    { player_description: '[50 Rogue] Vex (Human)', pk_type: 'VICTIM' },
  ],
};

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../db/connection.js', { pool: database, mudPool: database });
stub('../db/redis.js', { getCache: async () => null });
stub('../services/pvpService.js', {
  getPvPEventDetail: async (id: number) => (id === 7 ? battle : null),
});
stub('../services/webSettingsService.js', {
  getWebSettings: async () => ({
    siteTitle: 'Duris <Test>',
    siteLogoUrl: 'https://cdn.example/logo.png?a=1&b="2"',
  }),
});

const { createApp } = await import('../app.js');
const { getBackendConfiguration } = await import('../config/environment.js');

const SITE = 'https://duris.example';
const INDEX = '<html><head><title>Duris SPA</title></head><body>spa-shell</body></html>';
let dist: string;
let app: Application;

beforeAll(async () => {
  dist = await mkdtemp(path.join(os.tmpdir(), 'durisweb-dist-'));
  await mkdir(path.join(dist, 'assets'));
  await writeFile(path.join(dist, 'index.html'), INDEX);
  await writeFile(path.join(dist, 'assets', 'app-abc12345.js'), 'asset-body');
  const base = getBackendConfiguration();
  app = createApp({
    environment: {
      ...base,
      environment: 'production',
      siteUrl: SITE,
      server: { ...base.server, allowedOrigins: [SITE, 'https://www.duris.example'] },
    },
    frontendDistPath: dist,
  });
});

afterAll(async () => {
  await rm(dist, { recursive: true, force: true });
});

const cookies = (response: request.Response) => String(response.headers['set-cookie'] ?? '');

describe('createApp in production', () => {
  it('redirects a website alias before any asset or cookie is served', async () => {
    const page = await request(app).get('/forum?x=1').set('Host', 'www.duris.example');
    expect(page.status).toBe(308);
    expect(page.headers.location).toBe(`${SITE}/forum?x=1`);

    const asset = await request(app)
      .get('/assets/app-abc12345.js')
      .set('Host', 'www.duris.example');
    expect(asset.status).toBe(308);
    expect(cookies(asset)).toBe('');
  });

  it('serves fingerprinted assets after CORS but before the CSRF cookie', async () => {
    const asset = await request(app).get('/assets/app-abc12345.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toBe('asset-body');
    expect(asset.headers['cache-control']).toContain('immutable');
    expect(cookies(asset)).toBe('');

    const foreign = await request(app)
      .get('/assets/app-abc12345.js')
      .set('Origin', 'https://elsewhere.example');
    expect(foreign.status).toBe(403);
  });

  it('keeps registered API routes and answers unknown API paths with JSON', async () => {
    expect((await request(app).get('/api/ping')).text).toBe('pong');
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'API route not found' });
  });

  it('falls back to the SPA shell instead of the JSON not-found handler', async () => {
    for (const route of ['/some/route', '/missing/page.png']) {
      const page = await request(app).get(route);
      expect(page.status).toBe(200);
      expect(page.text).toBe(INDEX);
      expect(cookies(page)).toContain('csrf_token=');
    }
  });

  it('encodes every dynamic battle value in crawler metadata', async () => {
    const page = await request(app).get('/pvp/7').set('User-Agent', 'Discordbot/2.0');
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('<title>Duris SPA</title>');
    expect(page.text).toContain('<title>Battle #7 - Juts vs Vex | Duris &lt;Test&gt;</title>');
    expect(page.text).toContain(
      'content="PvP battle at The &quot;&lt;Pit&gt;&quot; &amp; co - Juts defeated Vex"',
    );
    expect(page.text).toContain(`<meta property="og:url" content="${SITE}/pvp/7">`);
    expect(page.text).toContain('content="https://cdn.example/logo.png?a=1&amp;b=&quot;2&quot;"');
    expect(page.text).not.toMatch(/<Pit>|<Test>|b="2"/);

    // People, and crawlers asking for unknown battles, get the plain shell.
    expect((await request(app).get('/pvp/7')).text).toBe(INDEX);
    expect((await request(app).get('/pvp/8').set('User-Agent', 'Discordbot/2.0')).text).toBe(INDEX);
  });
});

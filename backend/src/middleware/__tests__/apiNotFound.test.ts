import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apiNotFound } from '../errorHandler.js';
import { generateCsrfToken, verifyCsrfToken } from '../csrf.js';

let root: string;
let app: express.Express;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'durisweb-api-fallback-'));
  await mkdir(path.join(root, 'api'));
  await writeFile(path.join(root, 'api/public-file.txt'), 'static fixture');
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><div id="app">Vue history fixture</div>',
  );
  app = express();
  app.use(cookieParser());
  app.use(generateCsrfToken);
  app.use(verifyCsrfToken);
  app.get('/api/known', (_req, res) => res.json({ reached: true }));
  app.use('/api', apiNotFound);
  app.use(express.static(root));
  app.use((_req, res) => res.sendFile(path.join(root, 'index.html')));
});
afterAll(async () => {
  await rm(root, { recursive: true });
});

describe('API namespace before static/SPA fallback', () => {
  it.each([
    '/api',
    '/api/',
    '/api/missing?probe=private-fixture',
    '/api/public-file.txt',
    '/API/missing',
  ])('returns noncached JSON 404 for %s', async (url) => {
    const response = await request(app).get(url);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'API route not found' });
    expect(response.text).not.toContain('private-fixture');
  });

  it('leaves registered API and ordinary history routes reachable', async () => {
    expect((await request(app).get('/api/known')).body).toEqual({ reached: true });
    for (const url of ['/forum/thread/123', '/apiary', '/login?redirect=%2Fforum']) {
      const response = await request(app).get(url);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Vue history fixture');
    }
  });

  it('preserves mutation CSRF before unknown-path handling and handles HEAD without HTML', async () => {
    expect((await request(app).post('/api/missing')).status).toBe(403);
    const mutation = await request(app)
      .post('/api/missing')
      .set('Cookie', 'csrf_token=matching')
      .set('X-CSRF-Token', 'matching');
    expect(mutation.status).toBe(404);
    expect(mutation.body).toEqual({ error: 'API route not found' });
    const head = await request(app).head('/api/missing');
    expect(head.status).toBe(404);
    expect(head.headers['content-type']).toContain('application/json');
    expect(head.text).toBeUndefined();
  });

  it('wires the production boundary after registered routers and before static serving', async () => {
    const source = await readFile(new URL('../../index.ts', import.meta.url), 'utf8');
    const boundary = source.indexOf("app.use('/api', apiNotFound)");
    expect(boundary).toBeGreaterThan(source.indexOf("app.use('/api/hooks', hookRoutes)"));
    expect(boundary).toBeLessThan(source.indexOf('app.use(express.static(publicPath'));
  });
});

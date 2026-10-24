import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { fingerprintedFrontendAssets } from '../frontendAssets.js';
import { generateCsrfToken, verifyCsrfToken } from '../csrf.js';

let root: string;
let app: express.Express;
const versioned = [
  'index-AbCd_1-2.js',
  'index-QwErTy12.css',
  'font-1234abcd.woff2',
  'map-1234ABCD.png',
];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'durisweb-assets-'));
  await mkdir(path.join(root, 'assets'));
  for (const name of versioned) await writeFile(path.join(root, 'assets', name), `content:${name}`);
  await writeFile(path.join(root, 'assets/config.json'), '{}');
  for (const name of ['index.html', 'service-worker.js', 'registerSW.js', 'manifest.webmanifest']) {
    await writeFile(
      path.join(root, name),
      name === 'index.html'
        ? `<script src="/assets/${versioned[0]}"></script>`
        : name === 'manifest.webmanifest'
          ? '{}'
          : 'unversioned',
    );
  }
  app = express();
  app.use(cookieParser());
  app.use('/assets', fingerprintedFrontendAssets(root));
  app.use(generateCsrfToken);
  app.use(verifyCsrfToken);
  app.get('/api/example', (_req, res) => res.json({ dynamic: true }));
  app.post('/api/example', (_req, res) => res.json({ changed: true }));
  app.use(express.static(root));
  app.use((_req, res) => res.sendFile(path.join(root, 'index.html')));
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

describe('fingerprinted frontend files before CSRF issuance', () => {
  it.each(versioned)(
    'serves a fresh anonymous %s request immutably without issuing a cookie',
    async (name) => {
      const response = await request(app).get(`/assets/${name}`);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers.etag).toBeDefined();
    },
  );

  it('keeps conditional requests and HEAD cookie-free with the same lifetime', async () => {
    const initial = await request(app).get(`/assets/${versioned[0]}`);
    const conditional = await request(app)
      .get(`/assets/${versioned[0]}`)
      .set('If-None-Match', initial.headers.etag);
    expect(conditional.status).toBe(304);
    expect(conditional.headers['set-cookie']).toBeUndefined();
    expect(conditional.headers['cache-control']).toBe(initial.headers['cache-control']);
    const head = await request(app).head(`/assets/${versioned[0]}`);
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
    expect(head.headers['set-cookie']).toBeUndefined();
    expect(head.headers['cache-control']).toBe(initial.headers['cache-control']);
  });

  it.each([
    '/assets/config.json',
    '/index.html',
    '/service-worker.js',
    '/registerSW.js',
    '/manifest.webmanifest',
  ])('retains immediate revalidation and CSRF issuance for %s', async (url) => {
    const response = await request(app).get(url);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=0');
    expect(response.headers['set-cookie']).toEqual([expect.stringContaining('csrf_token=')]);
  });

  it('does not attach immutable headers to missing fingerprints or encoded traversal', async () => {
    for (const url of ['/assets/missing-AbCd1234.js', '/assets/%2e%2e%2fservice-worker.js']) {
      const response = await request(app).get(url);
      expect(response.headers['cache-control'] ?? '').not.toContain('immutable');
    }
  });

  it('leaves dynamic responses, application cookies and mutation CSRF checks in place', async () => {
    const dynamic = await request(app).get('/api/example');
    expect(dynamic.body).toEqual({ dynamic: true });
    expect(dynamic.headers['cache-control'] ?? '').not.toContain('immutable');
    expect(dynamic.headers['set-cookie']).toEqual([expect.stringContaining('csrf_token=')]);
    expect((await request(app).post('/api/example')).status).toBe(403);
    expect((await request(app).post(`/assets/${versioned[0]}`)).status).toBe(403);
    const mutation = await request(app)
      .post('/api/example')
      .set('Cookie', 'csrf_token=matching')
      .set('X-CSRF-Token', 'matching');
    expect(mutation.status).toBe(200);
    expect(mutation.body).toEqual({ changed: true });
  });

  it('serves the next release HTML and assets while old fingerprinted URLs remain valid', async () => {
    await request(app).get('/');
    await writeFile(path.join(root, 'assets/index-NewHash1.js'), 'new release');
    await writeFile(
      path.join(root, 'index.html'),
      '<script src="/assets/index-NewHash1.js"></script>',
    );
    const html = await request(app).get('/forum/thread/123');
    expect(html.text).toContain('/assets/index-NewHash1.js');
    expect(html.headers['cache-control']).toBe('public, max-age=0');
    expect((await request(app).get('/assets/index-NewHash1.js')).text).toBe('new release');
    expect((await request(app).get(`/assets/${versioned[0]}`)).status).toBe(200);
  });

  it('wires only production assets before CSRF and leaves canonical/CORS handling ahead of them', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../index.ts', import.meta.url)),
      'utf8',
    );
    const earlyAssets = source.indexOf(
      "app.use('/assets', fingerprintedFrontendAssets(frontendDistPath))",
    );
    expect(earlyAssets).toBeGreaterThan(source.indexOf('app.use(canonicalHost('));
    expect(earlyAssets).toBeGreaterThan(source.indexOf('cors({'));
    expect(earlyAssets).toBeLessThan(source.indexOf('app.use(generateCsrfToken)'));
    expect(source.slice(source.lastIndexOf('\n', earlyAssets - 10), earlyAssets)).toContain(
      "if (environment.environment === 'production')",
    );
  });
});

import vm from 'node:vm';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { canonicalHost } from '../canonicalHost.js';
import { generateCsrfToken, verifyCsrfToken } from '../csrf.js';

const siteOrigin = 'https://site.test.invalid';
const aliasOrigin = 'https://www.site.test.invalid';

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(canonicalHost(siteOrigin, [siteOrigin, aliasOrigin]));
  app.use(cookieParser());
  app.use(generateCsrfToken);
  app.use(verifyCsrfToken);
  app.use((_req, res) => res.json({ reachedApplication: true }));
  return app;
}

describe('production canonical website routing', () => {
  it.each([
    '/login?redirect=%2Fforum%3Fpage%3D2',
    '/pvp/123?pov=Some%20Player',
    '//other.invalid/login',
  ])('preserves the request target %s without issuing alias cookies', async (target) => {
    const response = await request(createApp()).get(target).set('Host', 'www.site.test.invalid');
    expect(response.status).toBe(308);
    expect(response.headers.location).toBe(`${siteOrigin}${target}`);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('redirects HEAD and accepts case-insensitive hostnames', async () => {
    const response = await request(createApp()).head('/login').set('Host', 'WWW.SITE.TEST.INVALID');
    expect(response.status).toBe(308);
    expect(response.headers.location).toBe(`${siteOrigin}/login`);
    expect(response.text).toBeUndefined();
  });

  it.each(['site.test.invalid', '127.0.0.1:7770', 'other.test.invalid'])(
    'does not redirect canonical, local, or unconfigured host %s',
    async (host) => {
      const response = await request(createApp()).get('/login').set('Host', host);
      expect(response.status).toBe(200);
      expect(response.headers.location).toBeUndefined();
    },
  );

  it('does not let an untrusted forwarded hostname override the website host', async () => {
    const response = await request(createApp())
      .get('/login')
      .set('Host', 'www.site.test.invalid')
      .set('X-Forwarded-Host', 'site.test.invalid');
    expect(response.headers.location).toBe(`${siteOrigin}/login`);
  });

  it.each(['/health', '/api', '/api/ping'])('preserves endpoint %s on an alias', async (target) => {
    const response = await request(createApp()).get(target).set('Host', 'www.site.test.invalid');
    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
  });

  it('does not replay a mutation or bypass CSRF validation', async () => {
    const app = createApp();
    const invalid = await request(app)
      .post('/api/auth/login')
      .set('Host', 'www.site.test.invalid')
      .set('Cookie', 'csrf_token=cookie-token')
      .set('X-CSRF-Token', 'different-token')
      .send({});
    expect(invalid.status).toBe(403);
    expect(invalid.body).toEqual({ error: 'Invalid CSRF token' });
    expect(invalid.headers.location).toBeUndefined();

    const valid = await request(app)
      .post('/api/auth/login')
      .set('Host', 'site.test.invalid')
      .set('Cookie', 'csrf_token=matching-token')
      .set('X-CSRF-Token', 'matching-token')
      .send({});
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ reachedApplication: true });
  });

  it.each(['site.test.invalid', 'www.site.test.invalid'])(
    'serves a noncached retirement worker on %s without redirecting its update',
    async (host) => {
      const response = await request(createApp()).get('/sw.js').set('Host', host);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/javascript');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('leaves the new worker available on the canonical host', async () => {
    const response = await request(createApp())
      .get('/service-worker.js')
      .set('Host', 'site.test.invalid');
    expect(response.body).toEqual({ reachedApplication: true });
  });

  it('activates immediately, unregisters before reloading, and tolerates a closed tab', async () => {
    const response = await request(createApp()).get('/sw.js').set('Host', 'www.site.test.invalid');
    const handlers = new Map<
      string,
      (event: { waitUntil: (work: Promise<unknown>) => void }) => void
    >();
    const order: string[] = [];
    const urls = [`${aliasOrigin}/login?redirect=%2Fforum#section`, `${aliasOrigin}/forum`];
    const navigate = jest.fn(async (url: string) => {
      order.push(`navigate:${url}`);
      if (url.endsWith('/forum')) throw new Error('Tab closed');
      return null;
    });
    const skipWaiting = jest.fn(async () => undefined);
    vm.runInNewContext(response.text, {
      self: {
        addEventListener: (
          name: string,
          handler: (event: { waitUntil: (work: Promise<unknown>) => void }) => void,
        ) => handlers.set(name, handler),
        skipWaiting,
        clients: {
          claim: async () => {
            order.push('claim');
          },
          matchAll: async () => urls.map((url) => ({ url, navigate })),
        },
        registration: {
          unregister: async () => {
            order.push('unregister');
            return true;
          },
        },
      },
    });
    const tasks: Promise<unknown>[] = [];
    const event = {
      waitUntil: (work: Promise<unknown>) => {
        tasks.push(work);
      },
    };
    handlers.get('install')!(event);
    await Promise.all(tasks);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
    handlers.get('activate')!(event);
    await expect(Promise.all(tasks)).resolves.toBeDefined();
    expect(order).toEqual(['claim', 'unregister', ...urls.map((url) => `navigate:${url}`)]);
  });
});

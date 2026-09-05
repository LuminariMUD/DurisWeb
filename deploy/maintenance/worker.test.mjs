import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker, { handleRequest } from './worker.mjs';

const request = (path = '/', init = {}) => new Request(`https://website.example.invalid${path}`, {
  headers: { Accept: 'text/html' }, ...init,
});
let forbiddenOriginCalls = 0;
const neverFetch = () => {
  forbiddenOriginCalls++;
  throw new Error('Origin must not be contacted');
};
afterEach(() => {
  const calls = forbiddenOriginCalls;
  forbiddenOriginCalls = 0;
  assert.equal(calls, 0, 'maintenance/status must not contact the origin');
});

test('Cloudflare entry point ignores the execution context argument and forwards normally', async (context) => {
  const response = new Response('healthy');
  const origin = context.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await worker.fetch(request(), {}, { waitUntil() {} }), response);
  assert.equal(origin.mock.calls.length, 1);
});

test('document forwarding carries an independent timeout signal without changing its URL or cookies', async () => {
  const input = request('/news?view=latest', { headers: { Accept: 'text/html', Cookie: 'test=value' } });
  await handleRequest(input, {}, async (forwarded) => {
    assert.notEqual(forwarded, input);
    assert.notEqual(forwarded.signal, input.signal);
    assert.equal(forwarded.url, input.url);
    assert.equal(forwarded.headers.get('Cookie'), 'test=value');
    return new Response('healthy');
  });
});

test('planned burn-in serves an independent accessible page with Retry and no external assets', async () => {
  const response = await handleRequest(request('/news'), { MAINTENANCE_REASON: 'mud_burnin' }, neverFetch);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const html = await response.text();
  assert.match(html, /MUD server testing \(burn-in\)/);
  assert.match(html, /<a href="">Retry<\/a>/);
  assert.match(html, /aria-labelledby="notice-title"/);
  assert.doesNotMatch(html, /<script|<img|<link|https?:/);
});

test('operator status is readable without the origin, but cannot be changed by HTTP', async () => {
  for (const reason of ['off', 'maintenance', 'mud_burnin']) {
    const response = await handleRequest(request('/api/site-availability'), { MAINTENANCE_REASON: reason }, neverFetch);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: 'durisweb-availability', reason });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const denied = await handleRequest(request('/api/site-availability', { method: 'POST' }), {}, neverFetch);
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('Allow'), 'GET, HEAD');
});

test('maintenance blocks writes and upgrades without forwarding and API errors are never HTML', async () => {
  for (const init of [
    { method: 'POST', body: 'private payload' },
    { headers: { Accept: 'text/html', Upgrade: 'websocket' } },
    { method: 'GET' },
  ]) {
    const response = await handleRequest(request('/api/action', init), { MAINTENANCE_REASON: 'maintenance' }, neverFetch);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).reason, 'maintenance');
  }
});

test('HEAD responses have no body for both maintenance and status', async () => {
  for (const path of ['/', '/api/site-availability']) {
    const response = await handleRequest(request(path, { method: 'HEAD' }), { MAINTENANCE_REASON: 'maintenance' }, neverFetch);
    assert.equal(await response.text(), '');
  }
});

test('unknown operator text and origin exceptions are never exposed or labelled burn-in', async () => {
  const unsafe = '<script>private operator data</script>';
  for (const value of [unsafe, null, '', 0, {}]) {
    const invalid = await handleRequest(request(), { MAINTENANCE_REASON: value }, neverFetch);
    assert.equal(invalid.status, 503);
    assert.doesNotMatch(await invalid.text(), /private operator data|burn-in|<script>/);
  }
  for (const originFetch of [
    async () => { throw new Error(unsafe); },
    async () => new Response(unsafe, { status: 530 }),
    async () => new Response(unsafe, { status: 500 }),
  ]) {
    const response = await handleRequest(request(), {}, originFetch);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private operator data|burn-in|<script>/);
  }
});

test('healthy traffic, authentication errors, and redirects pass through unchanged', async () => {
  for (const status of [200, 302, 401, 403, 404, 429]) {
    const origin = new Response('original', { status, headers: { 'Set-Cookie': 'test=value; Secure' } });
    const response = await handleRequest(request(), { MAINTENANCE_REASON: 'off' }, async () => origin);
    assert.equal(response, origin);
  }
});

test('writes and WebSocket requests pass through exactly once and are never retried', async () => {
  for (const input of [
    request('/api/action', { method: 'POST', body: 'payload' }),
    request('/ws', { headers: { Upgrade: 'websocket' } }),
  ]) {
    let calls = 0;
    const origin = new Response('original');
    assert.equal(await handleRequest(input, {}, async (forwarded) => {
      calls++;
      assert.equal(forwarded, input);
      return origin;
    }), origin);
    assert.equal(calls, 1);
    calls = 0;
    const failed = await handleRequest(input, {}, async () => {
      calls++;
      return new Response('failure', { status: 502 });
    });
    assert.equal(failed.status, 503);
    assert.equal(calls, 1);
  }
});

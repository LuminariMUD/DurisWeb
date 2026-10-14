import type { RequestHandler } from 'express';

// Older installations cached the SPA at /sw.js on both public hosts. Replace
// that worker without waiting for every tab to close, then reload through the
// network so canonical routing and the new frontend configuration take effect.
// The new frontend registers /service-worker.js; do not retire that worker.
const RETIRE_LEGACY_WORKER = `
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    await Promise.allSettled(windows.map((client) => client.navigate(client.url)));
  })());
});
`;

/** Keeps the production SPA and its host-only authentication cookies together. */
export function canonicalHost(siteUrl: string, allowedOrigins: readonly string[]): RequestHandler {
  const canonical = new URL(siteUrl);
  const websiteHosts = new Set(allowedOrigins.map((origin) => new URL(origin).host));
  websiteHosts.add(canonical.host);

  return (req, res, next) => {
    const host = req.get('host')?.toLowerCase();
    // Only configured website hosts participate. Local probes and API requests
    // keep their existing contracts; never redirect or replay a submitted body.
    if (
      !host ||
      !websiteHosts.has(host) ||
      !['GET', 'HEAD'].includes(req.method) ||
      req.path === '/health' ||
      req.path === '/api' ||
      req.path.startsWith('/api/')
    ) {
      next();
      return;
    }

    if (req.path === '/sw.js') {
      res.set('Cache-Control', 'no-store');
      res.type('application/javascript').send(RETIRE_LEGACY_WORKER);
      return;
    }

    if (host !== canonical.host) {
      // Concatenation preserves encoded paths/queries and cannot turn a leading
      // // into an attacker-controlled redirect origin as URL resolution would.
      const target = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
      res.redirect(308, `${canonical.origin}${target}`);
      return;
    }

    next();
  };
}

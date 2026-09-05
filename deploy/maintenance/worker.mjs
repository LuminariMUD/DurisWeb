// Runs on a Cloudflare Route in front of the existing website tunnel, not on the MUD host.
const notices = {
  unavailable: {
    title: 'Temporarily unavailable',
    message: 'The website is temporarily unavailable. Please try again shortly.',
  },
  maintenance: {
    title: 'Scheduled maintenance',
    message: 'The website is temporarily offline for maintenance. Please check back shortly.',
  },
  mud_burnin: {
    title: 'Server testing in progress',
    message: 'Duris is temporarily offline for MUD server testing (burn-in). Please check back shortly.',
  },
};

/** @param {{ MAINTENANCE_REASON?: unknown }} env */
function selectedReason(env) {
  const reason = env.MAINTENANCE_REASON === undefined ? 'off' : env.MAINTENANCE_REASON;
  if (reason === 'off' || reason === 'maintenance' || reason === 'mud_burnin') return reason;
  // Misconfiguration must not accidentally reopen a maintenance window or expose its value.
  return 'unavailable';
}

/** @param {Request} request */
function isDocument(request) {
  return (
    ['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' &&
    !new URL(request.url).pathname.startsWith('/api/') &&
    (request.headers.get('Accept') ?? '').includes('text/html')
  );
}

/** @param {Request} request @param {keyof typeof notices} reason */
function unavailableResponse(request, reason) {
  const notice = notices[reason];
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Retry-After': '60',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  });
  let body;
  if (isDocument(request)) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    // Only fixed, reviewed copy is interpolated. No request, exception, or operator text.
    body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${notice.title} · Duris</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111310; color: #eeeedf; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at top, #303624, #111310 65%); }
    main { width: min(100%, 520px); padding: clamp(24px, 6vw, 48px); border: 1px solid #575743; border-radius: 16px; background: #181b15; }
    .brand { margin: 0 0 32px; font: 700 18px Georgia, serif; letter-spacing: .24em; color: #d9ef8b; }
    h1 { margin: 0 0 20px; font: 400 clamp(30px, 7vw, 42px)/1.12 Georgia, serif; text-wrap: balance; }
    p { line-height: 1.65; color: #c6c9b8; }
    a { display: inline-block; margin-top: 16px; padding: 12px 24px; border-radius: 6px; background: #d9ef8b; color: #171c0c; font-weight: 700; text-decoration: none; }
    a:hover { background: #ecffb1; }
    a:focus-visible { outline: 3px solid #eeeedf; outline-offset: 4px; }
    .hint { margin-top: 28px; font-size: 13px; }
  </style>
</head>
<body>
  <main aria-labelledby="notice-title">
    <p class="brand">DURIS</p>
    <h1 id="notice-title">${notice.title}</h1>
    <p>${notice.message}</p>
    <a href="">Retry</a>
    <p class="hint">This notice stays available while the server is offline.</p>
  </main>
</body>
</html>`;
  } else {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    body = JSON.stringify({ error: 'site_unavailable', reason, message: notice.message });
  }
  return new Response(request.method === 'HEAD' ? null : body, { status: 503, headers });
}

/**
 * Does not retry requests, read credentials, contact the MUD, or depend on the origin for notices.
 * @param {Request} request
 * @param {{ MAINTENANCE_REASON?: unknown }} env
 * @param {typeof fetch} originFetch
 */
export async function handleRequest(request, env, originFetch = fetch) {
  const reason = selectedReason(env);
  if (new URL(request.url).pathname === '/api/site-availability') {
    const allowed = request.method === 'GET' || request.method === 'HEAD';
    return new Response(
      request.method === 'HEAD' ? null : JSON.stringify(
        allowed ? { service: 'durisweb-availability', reason } : { error: 'method_not_allowed' },
      ),
      {
        status: allowed ? 200 : 405,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          Allow: 'GET, HEAD',
        },
      },
    );
  }
  if (reason !== 'off') return unavailableResponse(request, reason);

  try {
    // Bound document waits only. Never abort or replay writes, streams, or WebSocket upgrades.
    const forwarded = isDocument(request)
      ? new Request(request, { signal: AbortSignal.timeout(8000) })
      : request;
    const response = await originFetch(forwarded);
    if (response.status < 500) return response;
    await response.body?.cancel();
  } catch {
    // Tunnel failures and origin errors become a neutral notice, not a guessed maintenance reason.
  }
  return unavailableResponse(request, 'unavailable');
}

export default {
  /** @param {Request} request @param {{ MAINTENANCE_REASON?: unknown }} env */
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

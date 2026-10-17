# Website availability notices

The [Design guide](../../docs/DESIGN.md#interaction-and-accessibility) links
this document as the owner of the availability flow and standalone outage-page
constraints. General visual and interaction guidance lives in that guide.

This optional Cloudflare Worker runs **outside the production server**, on a
Worker Route in front of the existing website tunnel. It serves a small,
self-contained page even when the app, database, tunnel, or entire origin host
is down. No service on the MUD host is added or changed. Committing these files
does **not** activate the Worker or deploy the frontend.

## Behavior

The operator-owned `MAINTENANCE_REASON` Worker variable selects the message:

| Value | Behavior |
|---|---|
| `off` or unset | Forward requests to the existing origin; network failures and HTTP 5xx get a generic unavailable response. |
| `maintenance` | Serve scheduled-maintenance notices without contacting the origin. |
| `mud_burnin` | Explain that Duris is temporarily offline for MUD server testing (burn-in), without contacting the origin. |
| Any other value | Fail closed with a generic unavailable notice; never display the rejected value. |

An offline MUD alone is **not** treated as website maintenance. Select
`mud_burnin` only when the operator intentionally takes the website offline as
part of that work. No reason is inferred from process state and no ETA is
invented. There is no public switch, arbitrary message input, or database write.

Unavailable HTML documents return HTTP 503 with `Retry-After: 60`, `no-store`,
and `noindex`. Retry is a same-page navigation and works without JavaScript.
The page contains no external fonts, scripts, images, or analytics. API and
asset failures return safe JSON rather than HTML. Healthy responses, redirects,
auth errors, cookies, and WebSocket upgrades pass through unchanged. Document
requests have an eight-second origin timeout; writes and streams are never
aborted by this timeout or retried by the Worker. Planned maintenance rejects
new writes and upgrades before forwarding; it does not terminate established
sockets or shut down any service.

`GET /api/site-availability` is reserved by the Worker and returns HTTP 200 with
`{"service":"durisweb-availability","reason":"off"}` (or the selected reason).
It is **operator status, not an origin health check**. HEAD is supported; other
methods return 405. Responses are never cached and contain no credentials.

The frontend shows an accessible dialog when configuration loading fails, a
shared API request has a network/timeout/5xx failure, or the browser goes
offline. It looks up the reason on this same-origin endpoint with a three-second
timeout and without credentials. Only known codes with the expected service
identity are accepted; absent Worker, invalid JSON, and unknown codes retain
neutral copy. Concurrent errors open one dialog per incident. Dismiss keeps a
Details banner available. Retry rechecks the reason and, outside maintenance,
reads site configuration; it never replays a failed action or reloads a form.
For a feature-specific failure, retry that feature manually after recovery.
Existing tabs receive the notice on their next failing API request, not through
background polling. Older cached frontend versions need an update first.

## Activate later (explicit production deployment)

1. Deploy the verified frontend using the normal isolated-build release process.
   Do not build over the served `frontend/dist` directory.
2. In the correct Cloudflare account, create a Worker with `worker.mjs` as its
   ES module entry point. Disable its `workers.dev` and preview URLs.
3. Inventory every configured public website/API hostname from the deployed
   tunnel/DNS routes and website/API origin configuration (`SITE_URL`,
   `ALLOWED_ORIGINS` and `VITE_API_URL`). Add an explicit **Route** to this Worker
   for each canonical host, website alias and separately hosted API, for example
   `website.example.invalid/*` and `www.website.example.invalid/*`. Keep every
   existing proxied tunnel DNS record. Do not create Custom Domains, replace
   DNS, use a whole-zone wildcard or include the MUD hostname.
   The frontend reads operator status from its same-origin
   `/api/site-availability`. A separate API hostname must be routed too.
   Do not rely on canonical-host redirects: the
   [backend middleware](../../backend/src/middleware/canonicalHost.ts)
   deliberately passes API paths and mutations through without redirecting.
4. Set the Worker text variable `MAINTENANCE_REASON` to `maintenance` for the
   controlled acceptance check, then deploy the Worker. This deliberately gates
   website traffic. Check account limits and route failure policy: this is not
   protection against a Cloudflare-wide outage or exhausted Worker quota.
5. Verify **each inventoried hostname**, not just the canonical host: public
   `/` and a deep link return the maintenance HTML/HTTP 503;
   `/api/site-availability` returns the expected service identity, selected
   reason, HTTP 200 and `Cache-Control: no-store`; an API GET returns JSON 503.
   Confirm API mutation paths are gated with a cookie-free, empty POST to the
   authenticated `/api/admin/backup/upload` route: require the Worker's
   maintenance JSON/HTTP 503. A redirect, authentication/CSRF error, SPA page,
   healthy API response or origin error is not proof of maintenance gating.
   Send no session cookie, real upload or other write payload. Check denied web
   WebSocket upgrades for each configured web socket host too; do not probe the
   separate MUD login/socket. Record per-host results and stop if any host or
   path is missing, ungated or uncertain.
6. In a browser with the new app already loaded, verify the popup, Dismiss,
   Details, and Retry. Verify keyboard focus, mobile layout, and ordinary auth
   and web WebSocket behavior after reopening. Do not perform a MUD burn-in just
   to test the notice; the offline-origin behavior is simulated in unit tests.

For CLI-managed deployment, copy `wrangler.example.toml` **outside the repo**,
replace its entry-point path and every route/zone placeholder, include the full
reviewed hostname inventory, and use the approved
Wrangler installation and account authentication. Do not commit credentials or
generated configuration. `keep_vars = true` preserves the dashboard-owned
maintenance variable across code deploys; do not add it to `[vars]` or a CLI
override unless intentionally changing the window.

Cloudflare references: [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Worker variables](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Each maintenance window

First, for the approved maintenance window, set `MAINTENANCE_REASON` to the approved
reason in the Worker settings and deploy that variable change. Reconcile the
current public hostname inventory and confirm the notice, status, API refusal
and web-upgrade refusal on **every configured website/API hostname**, as above,
before inventory or preservation. A notice on one host does not gate an alias
host's existing session or a separately hosted API.

Then establish the independent private-directory keeper required by the
[legacy temporary-copy preservation gate](../../docs/deployment.md#legacy-temporary-copy-preservation-gate)
before inventory: a watchdog pause does not prevent the application's automatic
restart from cleaning up its private temporary files. Complete that gate
before stopping any website service or restarting a dependency that stops it.
The Worker does not prove existing requests, background jobs or other writers
have stopped; verify their closure/fencing separately as the gate requires.
Required copies and recovery evidence must be preserved before the old unit's
`PrivateTmp` namespace is torn down. The notice does not operate the MUD or the
application service group, satisfy the whole preservation gate, or authorize
service operations.

After the separately authorized recovery, verify origin health, then set the
variable to `off` and deploy the variable change. Verify public application
health and assets through the Worker; Retry should dismiss an existing popup
after configuration recovers. Do not clear a MUD burn-in window until its owner
confirms completion.

Rollback: retain the prior Worker version/variables and route configuration.
Revert to that version or remove only this Worker's exact website Route. Route
removal restores direct tunnel behavior, including Cloudflare's default error
page if the tunnel is still down; it does not restore any origin service.

## Local verification (no services or account required)

From the repository root:

```bash
node --test deploy/maintenance/worker.test.mjs
pnpm --dir frontend exec tsc --allowJs --checkJs --strict --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM ../deploy/maintenance/worker.mjs
pnpm --dir frontend test:unit --run src/components/__tests__/SiteAvailabilityNotice.spec.ts src/services/__tests__/apiAvailability.spec.ts src/composables/__tests__/useSiteConfig.test.ts
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
```

Also run the full frontend unit suite, an isolated-output frontend build, and
desktop/mobile browser checks before release. Node tests simulate origin
responses; they do not prove the real Cloudflare account/route configuration.

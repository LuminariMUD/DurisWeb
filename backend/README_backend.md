# DurisWeb Backend

The backend is an Express 5 and TypeScript service providing HTTP and WebSocket
APIs, MySQL persistence, Redis-backed caching/pub-sub, and privileged DurisMUD
integration services.

## Setup

Copy `backend/.env.example` to `backend/.env`, replace every required secret,
and configure a MUD-compatible shared database. See the root
[onboarding guide](../docs/onboarding.md) and explicit
[website baseline procedure](schema-baselines/README.md). The historical chain
is retained for existing ledgers, not replayed for a fresh installation.

## Run Commands

| Command | Purpose |
|---------|---------|
| `pnpm install --frozen-lockfile` | Install the committed dependency graph |
| `pnpm dev` | Run the TypeScript service with nodemon |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled service |
| `pnpm config:check` | Validate the complete environment without dependency connections |
| `pnpm schema:check` | Verify versioned web schema inputs and historical checksums without a database |
| `pnpm schema:lifecycle` | Explicit DBA setup or read-only verification of the versioned metadata helper; required before baseline bootstrap/migrations |
| `pnpm schema:baseline` | Explicit target-confirmed baseline inspection, bootstrap, adoption, verification, or limited teardown |
| `pnpm backup:inventory` | Bounded read-only legacy-copy metadata inventory; requires the configured backup root and a new private output file; never authorizes cleanup |
| `pnpm backup:preserve-legacy` | Explicit Linux/Python operator copy and restart verification of private legacy-byte bundles; never removes sources or authorizes adoption |
| `pnpm test --runInBand` | Run Jest serially |
| `pnpm format:check` | Check Biome formatting without edits |
| `pnpm lint` | Run non-mutating ESLint checks |
| `pnpm type-check` | Run TypeScript without emission |
| `pnpm migrate:status` | Inspect the selected database migration ledger |
| `pnpm seed:run` | Run idempotent seeds against the selected environment |
| `pnpm sync-flags` | Atomically publish builder flag definitions from the selected MUD checkout |
| `pnpm wiki:publish --source-revision <commit> --source-tree <tree>` | Atomically publish wiki objects/mobs from the selected clean MUD checkout |
| `pnpm forum:bootstrap` | Add any missing categories from the approved minimal forum taxonomy |

The listener has no default host or port. `GET /health` returns 200 only when
both MySQL and Redis respond; it returns 503 with a degraded snapshot otherwise.

Public `/api/status` shares one diagnostic refresh and reuses its projected
sample for five seconds. `lastUpdated` is the sample time, not each request's
time. A refresh failure or two-second timeout returns explicit unavailable
status (HTTP 500), never the expired healthy sample. A stalled refresh admits no
replacement work until its underlying read settles. Population is read and its
delayed-publication eligibility rechecked on every response. HTTP responses stay
`no-store`; dependency `/health` checks remain independent and uncached.

In production, Vite's fingerprinted `/assets/name-<eight-character-hash>.ext`
files are served before CSRF cookie issuance with `public, max-age=31536000,
immutable`. Canonical-host routing, compression and CORS still run first.
Unversioned assets, HTML, service-worker entry points and application/API routes
retain their normal middleware and cache policies. Never replace the contents
of an existing fingerprinted URL; a release must publish its new hashed files
alongside the HTML that references them. Verify origin headers and Cloudflare
cache behavior separately during release acceptance.

Large zone world files are parsed in one pass with periodic event-loop yields,
so wiki and builder map reads can continue servicing other requests. An independent
worker observes the backend heartbeat and writes a warning directly to stderr if
the main loop stops responding for five seconds. It attempts one short CPU sample
per stall and logs only relative application code locations, then records recovery
if the loop resumes. See [stall diagnostics](../docs/runbooks/incident-response.md#backend-event-loop-stall).

On shutdown, the service stops accepting HTTP connections while closing existing
WebSocket clients normally. Peers that do not acknowledge the close frame are
terminated after five seconds, so upgraded connections cannot hold shutdown open
until the service manager's stop timeout.

The application `/ws` transport accepts at most 256 simultaneous connections;
excess upgrades receive HTTP 503 with `Retry-After: 5`. Its 10 KiB inbound limit
applies to the complete uncompressed message, including fragmented and UTF-8
payloads, before the application handler runs (oversize close code 1009).
Thirty-second protocol heartbeats terminate a peer that has not answered by the
next tick. Application producers, including terminal/deployment output, share a
1 MiB per-peer queued-output budget; slow consumers are terminated rather than
accumulating output. Normal close cleanup releases subscriptions, streams and
established terminal sessions. These are transport safety bounds, not a capacity
forecast; the separate game/MUD bridge transport retains its own policy.

Terminal creation is serialized per account and cancelled if its socket closes
or account-wide terminal cleanup runs while SQL is pending. A spawned PTY is
registered for cleanup before its PID write; a failed write or early process
exit cannot leave it untracked. Pending sessions remain available to cleanup but
are hidden from operation dispatch until creation finishes. Cleanup revokes
mappings and kills the PTY before
awaiting final SQL logging, and shutdown drains pending terminal cleanup before
closing database pools. Normal logout still revokes the web session; subsequent
terminal operations recheck it.

PvP list and release-cursor summaries select the eligible, ordered event page
before aggregating participant snapshots. Participant filters still choose
events, and each selected event retains both complete teams. Counts, release
cutoffs, capture-privacy rules and cursor order are unchanged. Structured JSON
snapshots preserve description delimiters and dense teams. Independent row counts
reject truncated aggregates rather than publishing partial teams; server/session
aggregate limits are unchanged. The mature-history
native qualification uses the pinned full owner schema; see
[development](../docs/development.md) for its explicit disposable-target opt-in.

## Main Areas

| Path | Purpose |
|------|---------|
| `src/routes/` | HTTP route modules |
| `src/services/` | Domain and integration services |
| `src/hooks/` | Hook registry, state, resolution, and delivery gates |
| `src/middleware/` | Auth, CSRF, errors, and request limits |
| `src/db/` | MySQL and Redis clients |
| `migrations/` | Knex TypeScript migrations plus excluded legacy SQL artifacts |
| `seeds/` | Idempotent development/test seed data |

## Security Boundaries

- `JWT_SECRET` is backend-only and required at process import/startup.
- `src/config/environment.ts` is the only process-environment reader; Knex,
  runtime services, scripts, and preflight consume its typed result.
- `DURISWEB_SECRET` and its optional previous key are backend/MUD credentials;
  never expose them as `VITE_*` values or log them.
- Remote MUD bridge connections require `wss:` with certificate verification;
  plaintext `ws:` is loopback-only.
- Hook administration requires authentication and
  `manage_mud_properties` (or overlord access).

See [Architecture](../docs/ARCHITECTURE.md),
[API documentation](../docs/api/README_api.md), and the cumulative
[security record](../docs/SECURITY-COMPLIANCE.md).

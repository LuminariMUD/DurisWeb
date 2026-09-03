# DurisWeb HTTP API

The Express application is assembled in `backend/src/index.ts`. Its listener,
public site URL, and ingress origin are required environment/deployment values.
The configured ingress forwards the SPA, `/api`, `/ws`, and `/kofihook` to the
Express origin.

There is no OpenAPI document or generated client. Route modules and their
tests remain the executable source of truth; this page documents stable entry
points and security boundaries rather than duplicating every handler.

## Common Endpoints

| Method | Path | Authentication | Purpose |
|--------|------|----------------|---------|
| `GET` | `/health` | Public | MySQL/Redis readiness; 200 `ok` or 503 `degraded` |
| `GET` | `/api/ping` | Public | Plain-text latency probe (`pong`) |
| `GET` | `/api/site-config` | Public | Browser-safe site configuration |
| `POST` | `/kofihook` | Ko-fi verification token; CSRF-exempt | Bounded, rate-limited donation webhook |
| `GET` | `/api/status` | Public | Limited MUD runtime status |

## Route Groups

| Prefix | Route Module | Surface |
|--------|--------------|---------|
| `/api/auth` | `routes/auth.ts` | Login, logout, refresh, current user, password/session actions |
| `/api/pvp` | `routes/pvp.ts` | PvP battles, comments, reactions, reports |
| `/api/news` | `routes/news.ts` | Public news |
| `/api/forum` | `routes/forum.ts` | Forums, profiles, images, subscriptions, polls |
| `/api/admin` | `routes/admin.ts` | Permissioned administration, operations, backups, settings |
| `/api/admin/users` | `routes/userManagement.ts` | Permissioned account/character management |
| `/api/admin/git` | `routes/git.ts` | Permissioned MUD repository status/actions |
| `/api/content` | `routes/content.ts` | Managed MUD help/news/MOTD/information content |
| `/api/frag` | `routes/frag.ts` | Frag rankings and player/account summaries |
| `/api/zones` | `routes/zones.ts` | Zone list/status and bounded mutations |
| `/api/status` | `routes/status.ts` | Public health history/incidents |
| `/api/server/reboot` | `routes/serverReboot.ts` | Reboot history/statistics |
| `/api/mud` | `routes/mudControl.ts` | Permissioned MUD process status/control |
| `/api/builder` | `routes/builder.ts` | Builder data, editing, validation, access, comments |
| `/api/wiki` | `routes/wiki.ts` | Wiki/game reference data and updates |
| `/api/help` | `routes/help.ts` | MUD help-file lookups |
| `/api/guide` | `routes/guide.ts` | Guide categories and help search |
| `/api/guide/suggestions` | `routes/helpSuggestions.ts` | Authenticated guide suggestions/moderation |
| `/api/notifications` | `routes/notifications.ts` | Authenticated notifications |
| `/api/analytics` | `routes/webAnalytics.ts` | Public page-view tracking and protected analytics |
| `/api/admin/analytics/web` | `routes/webAnalytics.ts` | Protected web analytics alias |
| `/api/auction` | `routes/auction.ts` | Auction reads, default-gated bid/buy actions, and MUD-authoritative admin removal |
| `/api/push` | `routes/push.ts` | VAPID key and authenticated subscriptions |
| `/api/changelog` | `routes/changelog.ts` | Changelog reads and permissioned management |
| `/api/public/statistics` | `routes/publicStatistics.ts` | Public faction/date statistics |
| `/api/hooks` | `routes/hooks.ts` | Permissioned hook state, website toggle, and reconciliation |

Some route modules contain both public and protected handlers. Do not infer
authorization from the prefix alone; inspect the handler middleware and tests.

## Default-closed MUD mutation routes

Several legacy routes remain addressable for compatibility but return HTTP 503
with `error: "operation_gated"` unless an operator explicitly opens their unsafe
mutation gate:

| Route family | Gate |
|---|---|
| `POST /api/auction/listings/:auctionId/bid` and `/buy` | `auctionWrites` |
| Player/locker duplicate-item delete and bulk-delete routes under `/api/admin/dupes` | `itemDeletes` |
| `POST /api/admin/mud/wipe/execute` | `playerWipe` |
| Stored and uploaded backup restore routes under `/api/admin` | `databaseRestore` |

Read-only auction and duplicate diagnostics are unaffected. Administrative
auction removal is also unaffected because it already delegates to the MUD's
authoritative critical command. The `ALLOW_UNSAFE_*` settings do not supply the
missing safety contracts and should remain closed in ordinary deployments; see
[Configuration and Environments](../environments.md#unsafe-mutation-gates).

## Authentication and CSRF

- Login issues HTTP-only `access_token` and `refresh_token` cookies. Protected
  handlers use `requireAuth`, which verifies the access JWT and the associated
  live `web_sessions` row before loading permissions.
- Authorization may require game level/role, a granular permission, or both.
  Overlord role bypasses granular admin permissions.
- State-changing requests use a double-submit `csrf_token`: send the cookie
  value as `x-csrf-token`. Safe methods are exempt.
- `/api/analytics/track` and `/kofihook` are the explicit CSRF exemptions. The
  Ko-fi route independently requires a constant-time verification-token match,
  validates a bounded payload, rate limits requests, and acknowledges only
  durable recording.
- Credentialed CORS accepts only `ALLOWED_ORIGINS` (plus requests with no
  browser Origin header).

Raw refresh-token storage and session timezone semantics are open findings; see
the [security record](../SECURITY-COMPLIANCE.md).

## Hook Control API

All hook endpoints require authentication plus `manage_mud_properties` (or
overlord access).

| Method | Path | Body | Result |
|--------|------|------|--------|
| `GET` | `/api/hooks` | None | Registry rows with website, MUD, effective, provenance, resource, and sanitized transport state |
| `PATCH` | `/api/hooks/:id` | `{ "enabled": boolean }` | Changes only the website-owned toggle and records actor context |
| `POST` | `/api/hooks/:id/reconcile` | `{ "enabled": boolean }` | Sets applicable ends in fail-closed order and reports complete/warning state |

Hook ids must be exact registry values and `enabled` must be a JSON boolean.
Terminal mutation is rejected. The frontend should render the returned observed
state rather than applying an optimistic result.

## WebSockets and the MUD Bridge

The browser-facing WebSocket uses `/ws` on the DurisWeb server for terminal,
streaming, and application events. It is distinct from the backend's outbound
privileged MUD bridge, whose endpoint is required through `MUD_WS_URL`. A
loopback `ws://127.0.0.1:4050` value is a local example, not an application
default. Hook state and reconciliation behavior is implemented by the
[state client](../../backend/src/hooks/mudHookStateClient.ts) and
[reconciliation service](../../backend/src/services/hookReconcileService.ts),
with the matching MUD side documented and tested in the separate MUD
repository.

Remote MUD bridge endpoints require `wss:` and certificate validation. Never
put the HMAC bridge secret in browser code or a `VITE_*` setting.

## Error Shape and Limits

Most JSON errors use `{ "error": "message" }`; validation handlers may return
structured `errors`. Body limits, route-specific rate limits, and resource-id
validators live in middleware/route code. Clients should handle 400, 401, 403,
404, 409, 413, 429, 500, and dependency-related 503 responses according to the
specific endpoint contract.

## Documentation Gap

A complete OpenAPI contract, schema examples, and generated-client workflow do
not exist. Adding them requires a dedicated inventory/reconciliation of the
large route surface; this page must not be treated as an exhaustive endpoint
schema.

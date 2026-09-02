# Architecture

## System Overview

DurisWeb is a two-package TypeScript application coupled to a separate C MUD
server and a shared MySQL schema. The Vue frontend talks only to the Express
backend. The backend owns HTTP/WebSocket APIs, persistence, caching, MUD
integration, and operator actions.

```text
Browser
  |
  | configured HTTPS / WSS ingress
  v
Vue frontend ---- HTTP / browser WebSocket ---- Express backend
                                                  |       |
                                      MySQL <-----+       +---- Redis
                                        ^
                                        | shared schema
                                        |
                                    DurisMUD (C)
                                        ^
                                        | bridge, pub/sub, files,
                                        | process control, terminal
                                        +-------------------------- backend
```

Production paths, dependencies, binaries, ports, hostnames, and ingress are
rendered from an operator-owned deployment input using `deploy/templates/`.
No machine-specific service or nginx artifact is authoritative in the checkout.

## Components

| Component | Location | Technology | Responsibility |
|-----------|----------|------------|----------------|
| Backend API | `backend/src/index.ts`, `backend/src/routes/` | Express 5, TypeScript | HTTP routes, browser WebSockets, middleware, static fallback |
| Domain services | `backend/src/services/` | TypeScript | Game data, community features, admin operations, MUD integrations |
| Hook control | `backend/src/hooks/` | TypeScript | Registry, cached settings, foreign state, resolution, activity and resource health |
| Data layer | `backend/src/db/`, `backend/migrations/` | mysql2, Knex, MySQL 8 | Shared database access and web schema evolution |
| Cache/pub-sub | `backend/src/db/redis.ts`, `backend/src/utils/scopedRedis.ts` | Redis 7, ioredis | Cache and scoped integration delivery |
| Frontend | `frontend/src/` | Vue 3, Vite, TypeScript, Pinia | Public, community, builder, and admin experiences |
| Hook console | `frontend/src/views/admin/mud/HookControlView.vue` | Vue 3 | Server-authoritative hook and transport operations |
| MUD server | external `MUD_DIR` checkout | C | Game runtime, bridge listener, property-backed MUD gates |
| Local dependencies | `podman-compose.yml` | Docker Compose, MySQL 8, Redis 7 | Developer database/cache containers |

## Data and Dependency Flow

- The frontend accesses MySQL and Redis only through the backend.
- DurisWeb and DurisMUD currently share one MySQL schema. MUD core tables are
  created outside the DurisWeb Knex chain, and DurisWeb migrations alter some
  MUD-owned tables.
- The 1.2.0 forward migration chain was replayed successfully against a restored
  production baseline on MariaDB 10.11. MUD-owned runtime schema is guarded by
  the migration and startup preflights. Historical down migrations are not a
  safe production inverse, so schema releases remain backup-first work.
- Redis serves ordinary application caching and separately scoped integration
  pub/sub identities. Legacy unscoped MUD channels are prohibited by tests.
- Browser build-time values use the `VITE_*` namespace and are public. Backend
  secrets must never cross that boundary.

## MUD Integration Channels

| Channel | Direction | Trust Boundary | Key Controls |
|---------|-----------|----------------|--------------|
| Privileged bridge | MUD -> web, with web commands | HMAC-authenticated WebSocket | Production is same-host loopback; connection-bound challenge and current/previous secret |
| Scoped pub/sub | Both | Redis ACL credentials and deployment namespace | Namespace plus season epoch, dedicated roles, signed donation events |
| Flatfile/log ingestion | MUD -> web | Host filesystem beneath `MUD_DIR` | Canonical containment, file type/size/encoding validation, strict records, per-hook backoff |
| Process control | Web -> MUD host | Admin permission and command construction | `mud_control` permission, bounded request validation |
| Interactive terminal | Web -> host | Admin permission and live session authorization | `terminal_access`/overlord, short capability, bubblewrap/tmux; always-on recovery path |

Controls are channel-specific. Securing the bridge does not authenticate files
or make the terminal a complete sandbox.

## Hook Ownership and State

The immutable registry contains 13 website-toggleable hooks and one always-on
terminal row. Eight hooks also have a MUD property; five are website-only. The
effective state is computed from applicable owners rather than forcing every
row into a fictional two-ended shape.

Foreign MUD state is accepted only after bridge authentication, schema-
validated, replaced wholesale, cleared on disconnect, and considered unknown
when missing. Local settings-read failure defaults enabled to avoid severing
every integration during a database blip; missing foreign state remains
inactive so DurisWeb never fabricates MUD approval. Reconciliation disables the
website first and enables it last.

See [ADR 0001](adr/0001-hook-control-ownership-and-state.md) and the
[hook registry guide](../backend/src/hooks/README_hooks.md).

## Request Security

- CORS uses the allowlist in `ALLOWED_ORIGINS` and sends credentials.
- State-changing HTTP requests require a double-submit CSRF cookie/header,
  except the bounded analytics and Ko-fi webhook paths.
- Authentication uses HTTP-only JWT cookies bound to a live `web_sessions`
  record. Authorization combines game level/role and granular admin
  permissions.
- Request bodies and selected sensitive routes are size/rate limited.
- Known cumulative exceptions, including raw refresh-token storage and timezone
  expiry semantics, live in
  [Security and Compliance](../.spec_system/SECURITY-COMPLIANCE.md).

## Health and Operations

- Backend `GET /health` checks MySQL and Redis concurrently and returns 503 when
  either fails.
- Frontend `public/health` is copied into the production build, while the
  Express production route at `/health` reports persistent dependency status.
- Local origin and public apex/`www` health are verified through the dedicated
  tunnel. The tunnel also exposes a loopback-only readiness endpoint for
  operator checks.
- The backup service creates local ZIP archives; Phase transition validation
  exercised a real disposable backup, archive test, and restore. Restore is an
  operator action and is not automated by CI.

## Key Decisions

- [ADR 0001: Hook control ownership and state](adr/0001-hook-control-ownership-and-state.md)
- [ADR template](adr/0000-template.md)
- [Phase 00 PRD](../.spec_system/PRD/PRD.md)
- [DurisMUD handoff](../.spec_system/PRD/MUD_HANDOFF.md)

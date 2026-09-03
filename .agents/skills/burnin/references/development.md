# Development burn-in

Use this mode only for a disposable local DurisWeb environment. It must exercise this checkout's
real development processes and dependencies without touching production.

## Establish isolation

1. Require the three inputs used by `scripts/dev.sh`: root `.env`, `backend/.env`, and
   `frontend/.env`. Inspect required non-secret identity fields without printing secrets. Inventory
   ignored Vite files (`.env.local`, `.env.development*`, and `.env.production*`) and validate the
   effective development runtime and chosen build-mode inputs, not just `frontend/.env`.
2. Require `backend/.env` to select `NODE_ENV=development`; prove the database and both Redis
   targets are local/disposable and that frontend/API/WebSocket URLs are development endpoints.
   Valid syntax from `config:check` is not proof of isolation.
3. Resolve the active Docker context/daemon and reject a remote or unowned target. Scrub inherited
   `DOCKER_HOST`, `DOCKER_CONTEXT`, `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, profiles, and interpolation
   overrides unless each is deliberately part of the selected fixture. Render the effective Compose
   configuration and resolve its exact file, project name, labels, bound ports, containers, named
   volumes, and existing volume ownership/history. Require positive operator or fixture provenance
   that the database and cache data may be used and migrated as disposable development state;
   loopback bindings and project-like names are insufficient.
4. Check loaded systemd units and running processes. If the active production unit uses this
   checkout, or the files select production dependencies, do not rewrite its environments for a
   development run. Use a separate development checkout/configuration or report the blocker.
5. Stop only development processes positively identified by this checkout's working directories,
   command lines, and listeners. Never stop the production application, database, cache, MUD, or
   ingress for a development burn-in.
6. Resolve `MUD_DIR`, `BACKUP_DIR`, MUD process identity/path, `MUD_WS_URL`, MUD Redis, cache Redis,
   and every enabled outbound feature. Require each filesystem path, account, namespace, endpoint,
   and credential scope to be development-owned/disposable; otherwise the feature must already be
   disabled or be changed only with separate user authorization. Normal startup records health data,
   schedules backups and cleanup, opens the MUD bridge, and may start guild sync, Redis subscriptions,
   or donation delivery, so `NODE_ENV=development` alone is not isolation.
7. Resolve every required host binary, especially `TERMINAL_SANDBOX_BIN`, without printing protected
   values. Require a regular executable with the intended bubblewrap-compatible identity; never
   substitute a shell or install host software under burn-in authority. An absent/incompatible
   sandbox makes the administrative terminal unavailable and the full burn-in partial.

## Prepare the schemas first

After dependency installation and connection-free source checks, validate the Compose definition
and start its MySQL/Redis dependencies without starting ad hoc application processes. Prove the
selected database is a disposable, operator-approved MUD-compatible baseline with an authenticated
`SELECT 1`; that query proves connectivity only. Separately require the recorded baseline artifact
and provenance, expected ledger state, required tables, canonical MUD-owned column/fingerprint
contracts, and every pending migration's preconditions before applying anything. An empty Compose
database is not a valid baseline.

Restore or recreate the test database from the approved sanitized baseline. Before the shared
backend tests, scrub inherited application variables and select that test database explicitly.
Require its database and Redis database/namespace to differ from development and production, then
run:

```bash
NODE_ENV=test pnpm --dir backend migrate:status
NODE_ENV=test pnpm --dir backend migrate:latest
NODE_ENV=test pnpm --dir backend migrate:status
```

After the source suites pass, inspect the distinct development database's exact pending set and
bring it forward before the fresh build or any live application start:

```bash
NODE_ENV=development pnpm --dir backend migrate:status
NODE_ENV=development pnpm --dir backend migrate:latest
NODE_ENV=development pnpm --dir backend migrate:status
```

Record names and hashes and confirm that only the reviewed pending TypeScript migrations ran, none
remain, and protected MUD-owned schema contracts still pass. Never replay excluded legacy SQL
artifacts or use a down migration to make status green. If test and development configurations
resolve to the same database, stop and correct the isolation instead of running the chain twice.

## Fresh build and live pass

After the shared source gates pass, prove a fresh build. Resolve `backend/dist` and
`frontend/dist` under this repository, verify they are generated outputs, remove only those exact
directories, and run:

```bash
pnpm --dir backend build
pnpm --dir frontend exec vite build --mode development
```

Review all build output and the resulting frontend `index.html`, referenced generated assets, and
backend entrypoint. The shared type check plus direct Vite development-mode build is the development
equivalent of the frontend build script without ambiguous package-script argument forwarding. Prove
which Vite files and public values supplied that mode; reject stale artifacts or production
endpoints.

From `backend/`, run the freshly compiled configuration and dependency preflights against the
scrubbed development environment before starting the app:

```bash
NODE_ENV=development node dist/scripts/productionPreflight.js --configuration
NODE_ENV=development node dist/scripts/productionPreflight.js --dependencies
```

Start the maintained development stack through `./scripts/dev.sh` in a session whose output remains
observable. Do not replace it with ad hoc package starts because the script owns configuration
validation and Compose startup. Wait with a bounded retry for the configured `/health` URL and
require structured success for database and cache, not merely HTTP 200.

Against the running development target, verify at least:

- `/health`, `/api/ping`, `/api/site-config`, the SPA shell, and a generated asset;
- allowed-origin CORS and rejection of an untrusted origin;
- application WebSocket `/ws` ping/pong;
- configured MUD WebSocket connectivity and relevant Redis bridge state;
- a safe non-destructive authentication/connectivity/contract probe for every enabled optional
  integration, including donations, R2, push, Gemini, and guild sync as applicable; never deliver a
  real donation/notification or submit player data merely to make a probe pass;
- browser navigation through `/`, `/status`, `/news`, `/pvp`, `/forum`, `/wiki`, `/guide`,
  `/auction`, and `/play` at desktop and mobile sizes, with every API/console failure investigated;
- no unexpected process exit, listener change, console diagnostic, or new error-priority log.

If operator-provided test credentials are in scope, use a dedicated development account to exercise
login/session refresh/logout and representative protected read-only UI and WebSocket paths. Those
bounded disposable session/login-history writes are expected; verify logout invalidates the session
and do not change account data, content, configuration, MUD state, or other data. If credentials are
unavailable or insufficient for that lifecycle and one permission-appropriate protected read-only
route, the result is a public-only partial pass, not a clean full burn-in.

If any enabled integration lacks a safe probe or requires unapproved cost/external side effects,
report that integration as untested and the overall burn-in as partial rather than disabling it or
claiming clean coverage.

Monitor the process output, health, listener, and current application logs from a recorded boundary
for at least five minutes and ten seconds after the last smoke action, polling at intervals no longer
than 30 seconds. This must cross one five-minute health/guild scheduling cycle; verify any scheduled
write stayed inside the disposable targets. On a finding, stop only this development session,
repair it, and restart the full migration/shared/fresh-build/live sequence. On success, leave the
stack running unless asked to stop it; state separately whether the local Compose dependencies
remain running.

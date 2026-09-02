# Deployment

Deployment is operator-controlled and has no repository-owned hostname, home
directory, port, service dependency, credential, or secret. The maintained
artifacts are templates under `deploy/templates/`; historical machine-specific
nginx and split frontend/backend service files have been removed.

## Build and validate

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend build
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
./scripts/check-config-literals.sh
```

From `backend/`, run the compiled static and live gates with the production
environment installed:

```bash
node dist/scripts/productionPreflight.js --configuration
node dist/scripts/productionPreflight.js --dependencies
```

The first command aggregates invalid configuration and verifies the migration
bundle. The second verifies the selected database schema/ledger, general cache,
and the optional scoped presence connection.

## Render host configuration

Create the dedicated operator input outside the checkout:

```bash
install -m 0600 deploy/deployment.env.example /absolute/operator/path/deployment.env
```

Edit every value. `DEPLOYMENT_ENV_FILE` must name that same installed file;
`BACKEND_ENV_FILE` names the separately protected backend runtime environment.
The cache service consumes `CACHE_REDIS_PASSWORD` from the backend environment,
so that file is the credential owner for both the application and managed
Redis. Set `DEPLOY_CLOUDFLARED_ENABLED` and `DEPLOY_NGINX_ENABLED` explicitly;
values in a disabled group are ignored, while every value in an enabled group
must be replaced. Then render:

```bash
deploy/scripts/render-config /absolute/operator/path/deployment.env
```

The required `RENDER_OUTPUT_DIR` receives:

- systemd units for the application and private Redis cache;
- a Redis base configuration without an embedded password;
- the Cloudflare unit when its group is enabled;
- bootstrap and TLS nginx configurations when their group is enabled.

The renderer rejects missing values, unsafe input permissions, symlinks,
unresolved/example placeholders, and missing or non-empty unmarked output
targets. Create the dedicated output directory before rendering; the renderer
marks it so later renders can update only that owned location. Inspect the
output, install the Redis/nginx files at the configured paths, and link the
rendered systemd units from their actual output directory. At service start,
`run-durisweb-redis` copies the installed base
configuration into systemd's mode-0700 runtime directory and appends the
backend-owned password to a mode-0600 runtime config; the secret never appears
in `ExecStart`. For user services, enable linger for the selected service
account and verify `Linger=yes` before enabling units.

The cloudflared launcher validates the deployment file ownership/mode, obtains
a short-lived tunnel token from the configured account/tunnel, and restricts
the child environment. It selects token-file handling only for compatible
cloudflared versions.

## Acceptance and rollback

After start or restart, verify:

- the configured local and public health endpoints;
- `/api/ping`, `/api/site-config`, the SPA shell, and a generated asset;
- allowed-origin CORS and rejection of an untrusted origin;
- browser application WebSocket ping/pong and the configured MUD WebSocket handshake;
- raw/TLS MUD connections when those endpoints are enabled;
- Redis connectivity, authenticated bridge state, and unexpected restart count.

Schema releases remain backup-first. Restore a transaction-consistent backup to
disposable matching database software, apply the forward chain, compare tables
and row counts, and run the production preflight before touching production.
Historical down migrations are not the recovery plan.

Application rollback uses an explicitly selected last-known-good commit whose
migrations are compatible with the live schema, followed by rebuild, preflight,
restart, and the same acceptance checks. DNS and database rollback targets must
come from a fresh operator journal, never tracked documentation.

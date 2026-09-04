# Configuration and Environments

DurisWeb has five configuration owners. A value must not be copied into source
code or another configuration surface to compensate for a missing setting.

| Owner | Concern | Checked-in contract |
|---|---|---|
| Backend environment | Secrets, server endpoints, filesystem paths, feature activation | `backend/.env.example`, parsed only by `backend/src/config/environment.ts` |
| Frontend environment | Public build URLs and Vite server topology | `frontend/.env.example`, parsed only by `frontend/config/environment.ts` |
| Database `web_settings` | Operator-editable public branding, MUD addresses, front-page content, and delivery settings | `backend/src/services/webSettingsService.ts` |
| Local Compose environment | Developer MySQL/Redis containers and host bindings | `.env.example` and `podman-compose.yml` |
| Deployment environment | Host paths, service dependencies, binaries, ingress, and tunnel topology | `deploy/deployment.env.example` and `deploy/templates/` |

There are no implicit development or production values. Missing and invalid
backend/frontend values are reported together before the application starts.
Disabled optional integrations require an explicit `false` flag; enabling one
requires its complete configuration group.

## Backend environment

The backend always requires:

- Runtime: `NODE_ENV`, `HOST`, `PORT`, `ALLOWED_ORIGINS`, `LOG_LEVEL`,
  `SITE_URL`, and `JWT_SECRET`.
- Web database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- MUD ownership/bridge: `MUD_DATABASE_MODE`, `MUD_DIR`, `MUD_WS_URL`,
  `MUD_PROCESS_USER`, `MUD_PROCESS_HOME`, `MUD_PROCESS_PATH`,
  `MUD_PROCESS_LOCALE`, `MUD_PROCESS_SHELL`, `MUD_SETSID_BIN`,
  `TERMINAL_SANDBOX_BIN`, `DB_PASSWD`, and `DURISWEB_SECRET`.
- Backup/cache: `BACKUP_DIR`, `CACHE_REDIS_HOST`, `CACHE_REDIS_PORT`,
  `CACHE_REDIS_DB`, `CACHE_REDIS_AUTH_MODE`, and `CACHE_REDIS_TLS`.

`MUD_DATABASE_MODE=shared` deliberately reuses the web database. With
`MUD_DATABASE_MODE=separate`, all five `MUD_DB_HOST`, `MUD_DB_PORT`,
`MUD_DB_USER`, `MUD_DB_PASSWORD`, and `MUD_DB_NAME` values are required.

`CACHE_REDIS_AUTH_MODE` is `none`, `password`, or `acl`. Password and ACL modes
require `CACHE_REDIS_PASSWORD`; ACL also requires `CACHE_REDIS_USERNAME`.
Production refuses unauthenticated cache Redis. Credentialed connections may
use plaintext only on a loopback host; all other credentialed cache connections
require `CACHE_REDIS_TLS=true`, `CACHE_REDIS_CA_CERT`, and
`CACHE_REDIS_TLS_SERVER_NAME`.

Optional groups are explicit:

| Flag | Required when enabled |
|---|---|
| `MUD_REDIS_ENABLED` | `MUD_REDIS_HOST`, `MUD_REDIS_PORT`, `MUD_REDIS_DB`, `MUD_REDIS_NAMESPACE`, `MUD_REDIS_AUTH_MODE`, presence/cache credentials, and TLS values when selected |
| `DONATIONS_ENABLED` | Enabled MUD Redis plus `KOFI_VERIFICATION_TOKEN` and `MUD_REDIS_DONATION_SECRET`; donation ACL credentials in ACL mode |
| `R2_ENABLED` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` |
| `PUSH_ENABLED` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `GEMINI_ENABLED` | `GEMINI_API_KEY` |
| `ENABLE_GUILD_SYNC` | No additional variables |

## Unsafe mutation gates

The following settings are not normal feature flags. They expose legacy write
paths that bypass part of the MUD's transaction, ownership, or recovery
contract. An absent value and an explicit `false` both keep the path closed;
the affected endpoint returns `503` with `error: "operation_gated"`.

| Setting | Affected path |
|---|---|
| `ALLOW_UNSAFE_AUCTION_WRITES` | Direct web auction bids and buy-now purchases; read-only auction access and MUD-authoritative administrative removal remain available. |
| `ALLOW_UNSAFE_ITEM_DELETES` | Individual and bulk deletion from authoritative player/locker item tables; read-only duplicate diagnostics remain available. |
| `ALLOW_UNSAFE_PLAYER_WIPE` | The web-owned direct SQL player-wipe implementation. |
| `ALLOW_UNSAFE_DATABASE_RESTORE` | Both stored-archive and uploaded-archive legacy restore endpoints; backup creation remains available. |

Keep all four unset or `false` in ordinary deployments. Setting one to `true`
only acknowledges the documented risk; it does not make the operation atomic,
MUD-authoritative, or recoverable. Any exceptional use requires explicit
operator authorization, a protected and restore-tested backup, a maintenance
fence, and a recorded recovery decision. See the
[shared database contract](ARCHITECTURE.md#mutation-authority-and-default-closed-gates).

`DURISWEB_SECRET_PREVIOUS` and `DURISWEB_SECRET_ROTATED_AT` are an optional,
bounded rotation pair. The complete key inventory and safe placeholders live in
`backend/.env.example`; secret values must never be logged or committed.

`TERMINAL_SANDBOX_BIN` must resolve to the intended bubblewrap-compatible
regular executable on the deployment host. The connection-free production
preflight verifies its bubblewrap identity and runs a bounded no-op launch with
the namespaces required by the administrative terminal. Installation alone is
not sufficient: on hosts that restrict unprivileged user namespaces through
AppArmor, install the dedicated executable profile described in
[Deployment](deployment.md#terminal-sandbox-host-readiness). Never point the
setting at a shell or bypass the sandbox to make terminal startup succeed. A
failed sandbox gate does not by itself degrade an already-running public HTTP,
WebSocket, database, cache, or MUD bridge path.

## Frontend environment

Every frontend build requires `VITE_BASE_URL`, `VITE_API_URL`, `VITE_WS_URL`,
`VITE_STATIC_URL`, `FRONTEND_DEV_HOST`, `FRONTEND_DEV_PORT`,
`FRONTEND_PREVIEW_HOST`, `FRONTEND_PREVIEW_PORT`, and
`FRONTEND_ALLOWED_HOSTS`. All `VITE_*` values are public browser data.

## Database-backed site settings

`web_settings` is the only runtime owner for public mutable settings:
`pvp_delay_minutes`, `mud_host`, `mud_port`, `mud_port_tls`, `mud_ws_url`,
`site_title`, `site_logo_url`, `support_url`,
`front_page_hero_enabled`, `front_page_hero_title`,
`front_page_hero_subtitle`, `front_page_hero_image_url`, `front_page_content`,
`max_hourly_backups`, `respect_webinfo_toggle`, and `discord_webhook_enabled`.
The same table stores `discord_webhook_url` for server-side delivery only; it is
a bearer credential and is never part of the browser-safe public inventory.

The forward migration backfills missing keys to preserve the existing
deployment. Runtime code does not recreate those values. An incomplete or
invalid row set makes `/api/site-config` unavailable, and the frontend renders a
deliberate unavailable state instead of substituting branding or endpoints.
The migration's down path deliberately retains these operator-owned values;
application rollback must not erase them.

## Local and deployment configuration

The root `.env` supplies every `COMPOSE_*` interpolation used by
`podman-compose.yml`; the backend `.env` must use matching database/cache
credentials and host ports. Deployment operators keep a mode-0600 copy of
`deploy/deployment.env.example` outside the repository and render portable
systemd and Redis files. `DEPLOY_CLOUDFLARED_ENABLED` and
`DEPLOY_NGINX_ENABLED` explicitly select complete optional ingress groups and
their rendered artifacts. See [Deployment](deployment.md).

`backend/.env.test` is the only test override. Under `NODE_ENV=test`, it is
loaded before `backend/.env`; tests fill isolated in-process values only when a
test variable is absent. Existing process variables always win over dotenv
files; otherwise the first defined test-file value wins. In non-test modes,
`backend/.env` fills only variables absent from the process environment.

A partial test file is therefore not proof of isolation: missing values can be
filled by fallback test defaults or by the later backend file, and exported
process variables override both files. Before any database-backed suite or
migration rehearsal, start from a process environment without production
connection variables, provide an explicit disposable database/cache selection,
and inspect the resolved non-secret environment name, host, port, and database
name. Treat a production namespace or endpoint in test mode as a hard refusal,
not something to work around. `config:check` validates the configuration
contract but does not prove that the selected services are disposable.

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
Integrations controlled by an enable flag require an explicit `false` when
disabled and their complete configuration group when enabled. Discord delivery
uses an optional token/channel pair, described under database-backed settings.

## Find installation-specific settings

Each installation supplies its own values through the owning component's input
file. The examples describe the supported keys; their sample paths and ports
are replaceable values, not a required directory layout.

| Setting | Configuration owner | Variables |
|---|---|---|
| Backend listener and website origins | `backend/.env` | `HOST`, `PORT`, `SITE_URL`, `ALLOWED_ORIGINS` |
| Web database and database ownership mode | `backend/.env` | `DB_*`, `MUD_DATABASE_MODE`, optional `MUD_DB_*` |
| Website cache and scoped MUD Redis access | `backend/.env` | `CACHE_REDIS_*`, `MUD_REDIS_*` |
| Selected MUD checkout and privileged bridge | `backend/.env` | `MUD_DIR`, `MUD_WS_URL`, `MUD_PROCESS_*` |
| Website backup storage | `backend/.env` | `BACKUP_DIR` |
| Discord battle delivery | `backend/.env` | `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID` |
| Browser API, application WebSocket and static origins | `frontend/.env` | `VITE_API_URL`, `VITE_WS_URL`, `VITE_STATIC_URL`, `VITE_BASE_URL` |
| Application paths, environment location and rendered artifacts | Deployment input | `BACKEND_ROOT`, `FRONTEND_DIST`, `BACKEND_ENV_FILE`, `RENDER_OUTPUT_DIR`, `DEPLOYMENT_ENV_FILE` |
| Service manager, identity and dependency names | Deployment input | `DEPLOY_SERVICE_SCOPE`, `SERVICE_USER`, `APPLICATION_SERVICE`, `CACHE_SERVICE`, `DATABASE_SERVICE`, `MUD_SERVICE` |
| Runtime tools and service home | Deployment input | `NODE_BIN`, `TEST_BIN`, `SERVICE_PATH`, `SERVICE_HOME`, `REDIS_BIN`, `CLOUDFLARED_BIN` |
| Managed private Redis storage and listener | Deployment input | `REDIS_CONFIG_PATH`, `REDIS_DATA_DIR`, `REDIS_BIND_ADDRESS`, `REDIS_PORT` |
| Public ingress and acceptance endpoints | Deployment input | `DEPLOY_CLOUDFLARED_ENABLED`, `CLOUDFLARE_*`, `DEPLOY_NGINX_ENABLED`, `NGINX_*`, `LOCAL_HEALTH_URL`, `PUBLIC_HEALTH_URL` |
| Local Compose dependencies | Root `.env` | `COMPOSE_MYSQL_*`, `COMPOSE_REDIS_*` |

Start with the [backend](../backend/.env.example),
[frontend](../frontend/.env.example), [deployment](../deploy/deployment.env.example)
and [Compose](../.env.example) examples. The deployment input is a separately
protected copy selected by `DEPLOYMENT_ENV_FILE`; its filename/location can
differ between installations. Keep the separate DurisMUD product's configuration
under its own ownership. DurisWeb's MUD settings select integration targets;
they are not a replacement for the game's environment.

When adding a configurable behavior, add its key to the appropriate example,
parser/validation and consumer together, then provision it in the installation's
protected input. A documentation-only or unused environment key does not make a
hardcoded behavior configurable. Browser-visible keys remain public.

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

`SITE_URL` selects the canonical website origin in production. Website GET/HEAD
requests on other hosts listed in `ALLOWED_ORIGINS` redirect to that origin,
preserving the path and query. API requests, exact `/health`, and mutations keep
their existing behavior. Align `VITE_API_URL`, `VITE_WS_URL`, and `VITE_STATIC_URL`
with that website origin when the backend serves all three; CORS permission alone
does not let one hostname read another hostname's CSRF cookie. Development
continues to use its separately configured frontend and backend listeners.

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

When push is enabled, authenticated users manage their browser subscription
from their own profile. The generated service worker imports `/push-sw.js` so
background notifications are displayed and same-origin notification links can
focus or open the site. Deploy the frontend worker and backend VAPID
configuration together; rotating the VAPID key pair requires users to create
new subscriptions.

## Session time and credential contract

Session creation uses database `UNIX_TIMESTAMP()+604800`; access and refresh
require `expires_at_epoch > UNIX_TIMESTAMP()`. The database owns the unchanged
seven-day lifetime. Thirty-day JWT/cookie validity does not extend it. Refresh
JWTs are stored only as exact-byte SHA-256 digests in `BINARY(32)`; missing
credentials and incomplete legacy rows never become access-only refresh checks.

Application and database timezones may differ. No new timezone setting, Date
serialization policy, SQL-mode relaxation, or raw-token fallback is needed.
Clocks must still be synchronized: existing five-minute pool sampling warns
when the minimum observed skew exceeds 60 seconds, accounting for round-trip
latency and SQL second precision. It does not alter either clock or pool state.
The [session cutover procedure](../backend/schema-baselines/README.md#session-credential-cutover)
requires an approved one-time website logout and empty-session rollback.

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
| `ALLOW_UNSAFE_DATABASE_RESTORE` | Historical compatibility setting only; both restore endpoints and direct service calls remain unavailable even if true. Backup creation and archive inspection remain available. |

Keep all four unset or `false` in ordinary deployments. For the other three, setting one to `true`
only acknowledges the documented risk; it does not make the operation atomic,
MUD-authoritative, or recoverable. Any exceptional use requires explicit
operator authorization, a protected and restore-tested backup, a maintenance
fence, and a recorded recovery decision. See the
[shared database contract](ARCHITECTURE.md#mutation-authority-and-default-closed-gates).

No environment variable enables database restore. The obsolete asynchronous
row-merge executor has been removed: it could reintroduce removed account/game
data without consulting current lifecycle evidence, and did not preserve the MUD's ownership contract.
Use the protected [operator recovery procedure](deployment.md#application-restore-boundary)
with separate authorization. A future supported restore needs offline replay of
current holds/removal records and independent verification before exposure.

`DURISWEB_SECRET_PREVIOUS` and `DURISWEB_SECRET_ROTATED_AT` are an optional,
bounded rotation pair. The complete key inventory and safe placeholders live in
`backend/.env.example`; secret values must never be logged or committed.

`TERMINAL_SANDBOX_BIN` must resolve to the intended bubblewrap-compatible
executable on the deployment host. Configuration validation can check the value
but cannot prove that the host binary is installed. If it is absent, record the
administrative terminal as unavailable and install/revalidate the sandbox in a
separate operator-approved change; never point the setting at a shell or bypass
the sandbox to make terminal startup succeed. This limitation does not by itself
degrade the public HTTP, WebSocket, database, cache, or MUD bridge paths.

## Frontend environment

Every frontend build requires `VITE_BASE_URL`, `VITE_API_URL`, `VITE_WS_URL`,
`VITE_STATIC_URL`, `FRONTEND_DEV_HOST`, `FRONTEND_DEV_PORT`,
`FRONTEND_PREVIEW_HOST`, `FRONTEND_PREVIEW_PORT`, and
`FRONTEND_ALLOWED_HOSTS`. All `VITE_*` values are public browser data.

`VITE_STATIC_URL` names the origin that hosts pre-rendered world-map layer
images at `/duris/maps/layer-<N>.png`. When it equals `VITE_API_URL`, the
frontend requests the map background from the backend's on-demand
`/api/wiki/map/image` endpoint instead, because the backend does not serve
that static path and the request would otherwise fall through to the SPA
fallback.

## Database-backed site settings

The [Design guide](DESIGN.md#copy-and-public-settings) describes how the UI
presents these settings; this section owns their configuration contract.

`web_settings` is the only runtime owner for public mutable settings:
`pvp_delay_minutes`, `mud_host`, `mud_port`, `mud_port_tls`, `mud_ws_url`,
`site_title`, `site_logo_url`, `support_url`,
`front_page_hero_enabled`, `front_page_hero_title`,
`front_page_hero_subtitle`, `front_page_hero_image_url`, `front_page_content`,
`max_hourly_backups`, `respect_webinfo_toggle`, and `discord_webhook_enabled`.
Discord delivery uses `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` in the backend
runtime environment. Set both to reuse an existing bridge bot, or leave both
unset to disable delivery. The bot needs View Channel, Send Messages, and Embed
Links in the destination channel. No additional bot connection or bridge listener
is needed: the website sends embeds through Discord's authenticated REST API.
The token is server-only and never enters frontend configuration or settings.
Restart the website backend after changing these environment values.

See [Discord delivery](discord-delivery.md) for transport outcomes and recovery limits.

The historical `discord_webhook_enabled` key still controls automatic battle
posts, avoiding a settings migration. Manual PvP posts and the admin **Send test
message** action work independently of that toggle. The old `discord_webhook_url`
row is ignored and excluded from admin settings; webhook delivery is no longer
used. Leave automatic posting off while testing a temporary destination.

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
their rendered artifacts. Select the groups appropriate to your installation
and preserve its existing ingress during maintenance. See
[Deployment](deployment.md).

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

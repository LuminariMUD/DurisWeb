# Environments

## Environment Matrix

| Environment | Endpoint | Current Repository Status |
|-------------|----------|---------------------------|
| Development | Frontend `http://localhost:5173`; backend example `http://localhost:3001` | Supported through package scripts and Docker Compose dependencies; requires an external shared-schema baseline |
| Test | Package-local Jest/Vitest; optional dedicated MySQL via `backend/.env.test` | Supported; database tests must use isolated credentials/data |
| Staging | Not configured | No URL, platform, credentials, or probe target exists in the repository |
| Production | `https://duris.sbs`; `https://www.duris.sbs` | Verified on 2026-09-02 using user-systemd services and a dedicated Cloudflare Tunnel |

Production uses the checked-in units under `deploy/systemd/`, not the historical
nginx, PM2, or split frontend/backend service files. The verified checkout is
`/home/duris/durisweb`; the application listens only on `127.0.0.1:7770` and a
dedicated Cloudflare Tunnel publishes apex and `www`. Staging remains undefined.

## Verified Production Endpoints

| Purpose | Endpoint | Notes |
|---------|----------|-------|
| Public website/API | `https://duris.sbs` | Cloudflare Tunnel to loopback port 7770 |
| Website alias | `https://www.duris.sbs` | Same dedicated website tunnel |
| DurisWeb browser WebSocket | `wss://duris.sbs/ws` | Served by the Express application |
| Primary MUD connection | `mud.duris.sbs:7777` | DNS-only raw TCP; used by almost all players |
| Direct TLS MUD connection | `mud.duris.sbs:4001` | Hostname-verified TLS game port |
| Browser MUD connection | `wss://ws.duris.sbs` | Separate MUD tunnel to loopback port 4050 |

Do not substitute `mud.newduris.com` for these production endpoints. The raw,
direct-TLS, and browser-WebSocket transports deliberately use separate settings.

## Backend Required Configuration

| Variable | Purpose | Security Note |
|----------|---------|---------------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Shared MySQL connection | Required DB values have no safe production defaults; protect credentials |
| `JWT_SECRET` | Signs access, refresh, and terminal JWTs | Required at startup; generate high entropy and never log/commit it |
| `PORT`, `HOST` | HTTP listener | Example uses 3001; development defaults to loopback |
| `ALLOWED_ORIGINS` | Credentialed CORS allowlist | Enumerate exact trusted browser origins |
| `MUD_DIR`, `MUD_ACCOUNTS_DIR` | MUD source/data roots | Same-host production uses `/home/duris/duris` and `/home/duris/duris/Accounts`; paths may expose player data |

## Integration Configuration

| Variable | Purpose | Boundary |
|----------|---------|----------|
| `MUD_WS_URL` | Privileged MUD bridge endpoint | Production uses loopback `ws://127.0.0.1:4050`; remote hosts require validated `wss:` |
| `DURISWEB_SECRET` | Current bridge HMAC key | Backend and MUD only; at least 32 bytes |
| `DURISWEB_SECRET_PREVIOUS` | Bounded rotation fallback | Optional; remove after all clients use the new key |
| `DURISWEB_SECRET_ROTATED_AT` | Admin-console age metadata | Timestamp only, not secret material |
| `REDIS_*` | Cache and scoped integration delivery | Production pub/sub uses dedicated ACL identities and namespace/season scoping |
| `MUD_DB_*` | Optional authoritative MUD read database | All-or-none separate connection; otherwise shared DB values are reused |

Optional feature variables for Gemini, Cloudflare R2, Web Push, Ko-fi, backups,
and MUD process control are documented with placeholders in
`backend/.env.example`. Frontend endpoints live in `frontend/.env.example`.
Keep the examples as the variable-name source of truth rather than duplicating
every optional value here.

## Frontend Configuration

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Browser-visible backend HTTP base URL |
| `VITE_WS_URL` | Browser-visible DurisWeb WebSocket URL |
| `VITE_STATIC_URL` | Browser-visible static asset origin |

Every `VITE_*` value is compiled into browser code. Never use that namespace
for `JWT_SECRET`, `DURISWEB_SECRET`, database credentials, Redis passwords,
third-party private keys, or webhook verification tokens.

## Known Security and Privacy Decisions

- Production cookies become secure and same-site strict when
  `NODE_ENV=production`.
- The production privileged bridge is same-host loopback and HMAC-authenticated.
  The separate public browser path `wss://ws.duris.sbs` was certificate- and
  connection-tested during deployment.
- `DURISWEB_PRIVATE_PRESENCE` on the MUD must be exactly `TRUE` to include
  account names, IP addresses, or client metadata in presence payloads; default
  feeds omit them.
- Raw refresh-token storage, session-expiry timezone semantics, dependency
  advisories, and GDPR lifecycle gaps remain open. See
  [Security and Compliance](../.spec_system/SECURITY-COMPLIANCE.md).

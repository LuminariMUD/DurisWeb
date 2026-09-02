# Environments

## Environment Matrix

| Environment | Endpoint | Current Repository Status |
|-------------|----------|---------------------------|
| Development | Frontend `http://localhost:5173`; backend example `http://localhost:3001` | Supported through package scripts and Docker Compose dependencies; requires an external shared-schema baseline |
| Test | Package-local Jest/Vitest; optional dedicated MySQL via `backend/.env.test` | Supported; database tests must use isolated credentials/data |
| Staging | Not configured | No URL, platform, credentials, or probe target exists in the repository |
| Production | Not verified | nginx, PM2, and systemd reference files exist, but no active platform/release authority is declared |

The nginx reference names `newduris.com`, while the checked-in service/process
files contain differing users and absolute paths. Treat them as historical
deployment inputs that require operator reconciliation, not a deployable source
of truth.

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
| `MUD_WS_URL` | Privileged MUD bridge endpoint | Defaults to loopback `ws://127.0.0.1:4050`; remote hosts require validated `wss:` |
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
- Cross-host MUD bridging needs live certificate-valid WSS acceptance before
  release. Repository tests cover policy, not the external endpoint.
- `DURISWEB_PRIVATE_PRESENCE` on the MUD must be exactly `TRUE` to include
  account names, IP addresses, or client metadata in presence payloads; default
  feeds omit them.
- Raw refresh-token storage, session-expiry timezone semantics, dependency
  advisories, and GDPR lifecycle gaps remain open. See
  [Security and Compliance](../.spec_system/SECURITY-COMPLIANCE.md).

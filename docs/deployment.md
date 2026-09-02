# Deployment

## Current Production

DurisWeb production was deployed and externally verified on 2026-09-02.

| Surface | Verified production value |
|---------|---------------------------|
| Public website/API | `https://duris.sbs` and `https://www.duris.sbs` |
| Application origin | `127.0.0.1:7770` |
| Website ingress | Dedicated Cloudflare Tunnel |
| Primary MUD | `mud.duris.sbs:7777` raw TCP |
| Direct secure MUD | `mud.duris.sbs:4001` TLS |
| Browser MUD | `wss://ws.duris.sbs` through its separate tunnel |
| Checkout | `/home/duris/durisweb` under the `duris` account |
| Release version | `1.2.0` |

The repository does not automate releases. Production changes remain an
operator-controlled workflow with an explicit database backup/rehearsal gate.
Never commit `.env` files, tunnel tokens, database passwords, Redis passwords,
JWT keys, or the privileged MUD bridge secret.

## Build and Validation

Install and build both independent packages:

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend build
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
```

- Backend release inputs: `backend/dist/` plus the checked-in
  `backend/migrations/` directory used by the migration-ledger preflight.
- Frontend artifact: `frontend/dist/`, served by the backend in production.
- The generated frontend PWA version follows the root `VERSION` file.

Run the complete matrix in [Development](development.md). Database-backed tests
must use disposable data and explicit test credentials; `NODE_ENV=test` makes
the backend prefer `backend/.env.test` before using `.env` only as a fallback.

Before starting production, run the compiled read-only gate from `backend/`:

```bash
test -d migrations
NODE_ENV=production node dist/scripts/productionPreflight.js --configuration
NODE_ENV=production node dist/scripts/productionPreflight.js --dependencies
```

The preflight verifies required tables, all checked-in TypeScript migrations,
the canonical MUD runtime table contract, session-token capacity, database and
cache connectivity, scoped presence reads, and the player-event subscription.
The configuration stage exits 78 for invalid static configuration and causes
systemd to skip startup. The dependency stage exits 1 for unavailable or
incompatible database/Redis dependencies so `Restart=on-failure` can retry.

## Verified Service Topology

The active production path is defined by the checked-in templates:

| File | Responsibility |
|------|----------------|
| `deploy/systemd/durisweb-redis.service` | Loopback-only web cache on port 7778 |
| `deploy/systemd/durisweb-production.service` | Preflight plus Express API/static frontend on port 7770 |
| `deploy/systemd/durisweb-cloudflared.service` | Dedicated website tunnel bound to the application lifecycle |
| `deploy/scripts/run-durisweb-cloudflared` | Fetches a short-lived tunnel token without exposing it to the child environment |

The production units are user services:

```bash
sudo loginctl enable-linger duris
loginctl show-user duris -p Linger
systemctl --user link /home/duris/durisweb/deploy/systemd/durisweb-redis.service
systemctl --user link /home/duris/durisweb/deploy/systemd/durisweb-production.service
systemctl --user link /home/duris/durisweb/deploy/systemd/durisweb-cloudflared.service
systemctl --user daemon-reload
systemctl --user enable --now durisweb-redis.service
systemctl --user enable --now durisweb-production.service
systemctl --user enable --now durisweb-cloudflared.service
```

`loginctl show-user` must report `Linger=yes`; otherwise the user manager and
all three production services can stop after logout and will not start at boot.
The launcher uses `--token-file` with cloudflared 2025.4.0 or newer and the
restricted `TUNNEL_TOKEN` environment fallback for older releases.

The tunnel unit is both bound to and part of the application unit: it stops
when the origin disappears and follows deliberate application restarts.

The historical nginx, PM2, `backend/durisweb-backend.service`, and
`frontend/durisweb-frontend.service` files use obsolete hostnames, users, or
paths. They are references only and are not part of the verified production
runtime.

The backend production environment uses `MUD_DIR=/home/duris/duris` and
`MUD_ACCOUNTS_DIR=/home/duris/duris/Accounts`. These server-only paths must not
be exposed through `VITE_*` variables. The privileged same-host MUD bridge uses
`ws://127.0.0.1:4050`; public browsers use `wss://ws.duris.sbs` instead.

## Health and Acceptance

Required checks after every deployment:

```bash
curl --fail http://127.0.0.1:7770/health
curl --fail https://duris.sbs/health
curl --fail https://www.duris.sbs/health
cd /home/duris/durisweb/backend
node --input-type=module <<'NODE'
import WebSocket from 'ws';

const socket = new WebSocket('wss://ws.duris.sbs');
const timer = setTimeout(() => {
  console.error('WebSocket handshake timed out');
  process.exit(1);
}, 10_000);
socket.once('open', () => {
  clearTimeout(timer);
  console.log('WebSocket handshake passed');
  socket.close();
});
socket.once('error', (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(1);
});
NODE
systemctl --user show durisweb-production.service \
  -p ActiveState -p UnitFileState -p NRestarts -p Result
systemctl --user show durisweb-cloudflared.service \
  -p ActiveState -p UnitFileState -p NRestarts -p Result
```

After provisioning or changing the units, reboot the host once during the
maintenance window, reconnect as `duris`, and verify boot recovery:

```bash
systemctl --user is-active durisweb-redis.service
systemctl --user is-active durisweb-production.service
systemctl --user is-active durisweb-cloudflared.service
systemctl --user show durisweb-redis.service durisweb-production.service \
  durisweb-cloudflared.service -p ActiveState -p UnitFileState -p NRestarts -p Result
```

Acceptance also includes:

- `/api/ping`, `/api/site-config`, the SPA shell, and a generated asset;
- allowed-origin CORS and HTTP 403 for an untrusted origin;
- ping/pong over `wss://duris.sbs/ws`;
- a successful connection to `wss://ws.duris.sbs`;
- raw MUD banner access on 7777 and hostname-verified TLS on 4001;
- an authenticated privileged bridge and applied MUD hook state in service logs;
- the player-event Redis subscription and zero unexpected restart count.

Cloudflare production enforces HTTP-to-HTTPS redirects, minimum TLS 1.2, TLS
1.3 support, and a bounded HSTS policy. The `mud.duris.sbs` A record remains
DNS-only because ports 7777 and 4001 terminate at the game server, while `ws`
and the website use different Cloudflare tunnels.

## Database and MUD Runtime Gate

DurisWeb and DurisMUD share a MariaDB schema. MUD-owned tables are authoritative:
web migrations must not change their sealed runtime shape or add incoming
foreign keys that alter the MUD fingerprint.

For any schema-changing release:

1. Enter a declared maintenance window and confirm player impact.
2. Create an owner-only, transaction-consistent full database backup.
3. Restore that exact archive into disposable MariaDB matching production.
4. Apply the complete forward migration chain to the clone.
5. Compare all original tables and row counts, run `CHECK TABLE`, the DurisWeb
   preflight, and the MUD runtime compatibility verifier.
6. Apply only the rehearsed forward migrations to production, rerun both
   verifiers, and start services through systemd.

Do not use the historical Knex down chain as the production recovery plan. It
is not a dependable inverse of the forward schema history. Restore the verified
pre-change archive when database rollback is required.

Restarting the production MUD Redis unit also restarts the MUD because of its
hard systemd dependency. Treat Redis restarts as player-visible maintenance,
not as a routine web-cache operation.

## Release and Rollback

Application rollback:

1. Resolve the exact last-known-good commit and ensure its migrations remain
   compatible with the live schema.
2. Build backend and frontend from that commit.
3. Run the compiled production preflight.
4. Restart `durisweb-production.service`; the website tunnel remains bound to
   the service and resumes with it.
5. Repeat all local and public acceptance checks.

DNS rollback must be a narrowly scoped Cloudflare DNS batch: remove only the
current apex/`www` website-tunnel CNAMEs and restore the previously captured
website records. Preserve apex MX/TXT, the `mud` DNS-only A record, and the
separate `ws` tunnel CNAME. Capture current record IDs and values immediately
before every mutation; never copy stale IDs from documentation.

Database rollback uses the exact restore-tested pre-change archive. Keep its
path, checksum, record-count evidence, and restore command in an owner-only
operator journal rather than tracked documentation.

## CI/CD

`.github/workflows/quality.yml` runs Node 22 and pnpm 10.15.1 formatting, lint,
and type checks for backend and frontend. It does not run the full tests,
publish artifacts, mutate infrastructure, or deploy production. Release
authority and execution therefore remain manual operator responsibilities.

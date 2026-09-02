# Onboarding

## Prerequisites

- [ ] Git access to `git@github.com:xander-l/DurisWeb.git`.
- [ ] Node.js 22 (the CI version; the frontend accepts Node 20.18+ or 22.12+).
- [ ] pnpm 10.15.1, matching both package metadata and GitHub Actions.
- [ ] Docker with the `docker compose` subcommand.
- [ ] A local DurisMUD checkout for MUD-backed features.
- [ ] Access to a MUD-compatible MySQL schema baseline when exercising database
      features.

## Setup

1. Clone and enter the repository:

   ```bash
   git clone git@github.com:xander-l/DurisWeb.git durisweb
   cd durisweb
   ```

2. Activate the package-manager version and install both independent packages:

   ```bash
   corepack prepare pnpm@10.15.1 --activate
   pnpm --dir backend install --frozen-lockfile
   pnpm --dir frontend install --frozen-lockfile
   ```

3. Create local environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

4. Edit `backend/.env`:

   - Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
   - Replace `JWT_SECRET` with output from `openssl rand -base64 64`.
   - Set `MUD_DIR` and `MUD_ACCOUNTS_DIR` to the MUD checkout and account-data
     directory. The same-host production values are `/home/duris/duris` and
     `/home/duris/duris/Accounts`.
   - For the privileged bridge, replace `DURISWEB_SECRET` with at least 32
     random bytes and configure the same current key in the MUD service.
   - Leave `MUD_WS_URL` unset for the loopback default unless a real WSS endpoint
     has been configured. Never weaken certificate validation.

5. Review `frontend/.env`. The example points at the backend on port `3001`.
   Values prefixed `VITE_` are browser-visible; do not place server credentials
   there.

## Database Baseline Warning

`podman-compose.yml` starts an empty MySQL 8 service, but an empty database is
not a complete DurisWeb database. DurisWeb shares the MUD schema, and the MUD C
server creates core tables outside Knex. The historical TypeScript migration
ordering is also not replayable from zero, while legacy SQL artifacts are
excluded from Knex.

Do not run `pnpm migrate:latest` against a new or shared database expecting it
to create a valid full schema. Obtain an operator-approved schema-only baseline
and reconcile its migration ledger as dedicated backup-first work. Never copy
production player rows into development.

## Start

Once both `.env` files and the database baseline are ready, start all local
processes with:

```bash
./scripts/dev.sh
```

The script installs missing package dependencies, starts MySQL and Redis through
Docker Compose, and runs the two development servers. It leaves the containers
running after `Ctrl-C` so application restarts are quick.

## Verify

- [ ] Open `http://localhost:5173`.
- [ ] Run `curl --fail http://localhost:3001/health`; healthy MySQL and Redis
      produce an `ok` response.
- [ ] Run backend tests: `pnpm --dir backend test --runInBand`.
- [ ] Run frontend tests: `pnpm --dir frontend test:unit --run`.

Stop local dependencies with:

```bash
docker compose -f podman-compose.yml down
```

See [Development](development.md) for the full command matrix and
[Environments](environments.md) for configuration/security boundaries.

# Onboarding

## Prerequisites

- Git access to this repository.
- Node.js 22 and pnpm 10.15.1.
- Docker with the `docker compose` subcommand.
- A local DurisMUD checkout and an operator-approved MUD-compatible database
  baseline for features that read game data.

## Setup

Install both independent packages:

```bash
corepack prepare pnpm@10.15.1 --activate
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
```

Create all three required local inputs:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Replace every `CHANGE_ME` and example hostname. Keep the Compose database and
cache credentials/ports aligned with `backend/.env`. Generate independent,
high-entropy values for `JWT_SECRET`, `DURISWEB_SECRET`, database passwords,
and the Redis password. Select `MUD_DATABASE_MODE` and every feature flag
deliberately; do not leave enabled groups partially configured.

Frontend `VITE_*` values are embedded in browser assets and must not contain
server secrets. `MUD_DIR` is the server-side MUD checkout root. Configure a
complete `MUD_WS_URL`; remote bridges must use certificate-validated `wss:`.

Validate backend configuration without opening database or Redis connections:

```bash
pnpm --dir backend config:check
pnpm --dir frontend config:check
```

## Database baseline warning

The Compose MySQL service starts an empty database, not a complete DurisWeb
schema. DurisWeb shares MUD-owned tables created outside Knex, and the historical
migration chain is not a supported zero-to-current bootstrap. Obtain a
sanitized, operator-approved schema baseline and use isolated development data.

## Start and verify

```bash
./scripts/dev.sh
```

The script refuses missing configuration, validates Compose and backend inputs,
starts MySQL/Redis, then launches both application packages. It prints URLs
derived from the configured hosts and ports.

Run the health URL printed by the script, then:

```bash
pnpm --dir backend test --runInBand
pnpm --dir frontend test:unit --run
```

Stop local dependencies with the same required root environment:

```bash
docker compose --env-file .env -f podman-compose.yml down
```

See [Configuration and Environments](environments.md) for ownership and
[Development](development.md) for the full quality matrix.

# Onboarding

## Prerequisites

- Git access to this repository.
- Node.js 26 and pnpm 12.10.1.
- Docker with the `docker compose` subcommand.
- A local DurisMUD checkout and an operator-approved MUD-compatible database
  baseline for features that read game data.

## Setup

Install both independent packages:

```bash
corepack prepare pnpm@12.10.1 --activate
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

## Database baseline

The Compose MySQL service starts an empty database, not a complete DurisWeb
schema. DurisWeb shares MUD-owned tables created outside Knex, and the historical
migration chain is not a supported zero-to-current bootstrap. Have the MUD owner
provision and verify its schema in an isolated development database. The
[website baseline procedure](../backend/schema-baselines/README.md#operator-procedure)
then creates only website objects, using an explicit target and the owner's
approved external-schema hash. Inspecting the observed hash is not approval.

```bash
pnpm --dir backend schema:check
pnpm --dir backend schema:baseline inspect --target '<host>:<port>/<database>'
pnpm --dir backend schema:baseline bootstrap \
  --target '<host>:<port>/<database>' --mud-schema-sha256 '<approved hash>'
pnpm --dir backend migrate:latest
pnpm --dir backend migrate:status
```

Use the literal backend database endpoint/name in `--target`; the command refuses
a mismatch. Bootstrap verifies existing MUD names and the approved metadata
fingerprint, refuses unrecorded web objects/history, and resumes only recorded
partial work. It creates a separate provenance record, not fictional historical
migration rows. Existing installations use inspected adoption and retain their
original ledger; never bootstrap over their data.

The baseline does not populate player data, grant accounts permissions, create
forum taxonomy, publish wiki references, or extract map rooms. Complete those
explicit feature-readiness steps in [deployment](deployment.md) before claiming
the site ready. No setup command here authorizes operating a shared database.

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

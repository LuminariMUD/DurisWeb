# DurisWeb

DurisWeb is the Express/TypeScript API and Vue 3 web application for DurisMUD,
covering PvP data, forums, wiki and guide content, auctions, builder tools, and
operator administration.

## Quick Start

After completing the one-time configuration in
[Onboarding](docs/onboarding.md), one command starts MySQL, Redis, the backend,
and the frontend:

```bash
./scripts/dev.sh
```

The example configuration serves the frontend at `http://localhost:5173` and
the backend health endpoint at `http://localhost:3001/health`. Press `Ctrl-C`
to stop the application processes; stop the local dependencies separately with
`docker compose -f podman-compose.yml down`.

The Compose database is infrastructure only. It does not solve the known
shared-MUD schema and historical migration-baseline problem. Read the onboarding
database warning before using a new database.

## Repository Structure

```text
.
|-- backend/              # Express API, data access, MUD integrations
|-- frontend/             # Vue 3 single-page application
|-- docs/                 # Architecture, setup, operations, and API guides
|-- scripts/              # Repository-level developer entry points
|-- .github/workflows/    # GitHub Actions quality checks
|-- .spec_system/         # Product requirements and implementation evidence
`-- podman-compose.yml     # Local MySQL 8 and Redis 7 services
```

The DurisMUD C server is a separate repository. The backend reads its checkout
from `MUD_DIR` and its account data from `MUD_ACCOUNTS_DIR`. The same-host
production configuration uses `/home/duris/duris` and
`/home/duris/duris/Accounts`, respectively.

## Packages

| Package | Path | Stack | Purpose |
|---------|------|-------|---------|
| Backend | `backend/` | Express 5, TypeScript, Knex, MySQL, Redis | HTTP/WebSocket API, persistence, MUD integration, operator services |
| Frontend | `frontend/` | Vue 3, Vite, TypeScript, Tailwind CSS | Public site, community tools, builder, and admin UI |

This is a logical monorepo, not a root pnpm workspace. Each package has its own
manifest and lockfile; run package commands from that package or use `pnpm
--dir`.

## Documentation

- [Onboarding](docs/onboarding.md)
- [Development Guide](docs/development.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Environments](docs/environments.md)
- [Deployment](docs/deployment.md)
- [HTTP API](docs/api/README_api.md)
- [Incident Response](docs/runbooks/incident-response.md)
- [Contributing](CONTRIBUTING.md)
- [Security and Compliance](.spec_system/SECURITY-COMPLIANCE.md)

## Project Status

Version 1.2.0 is deployed at `https://duris.sbs`. Production uses a same-host,
HMAC-authenticated loopback bridge to DurisMUD, a dedicated website Cloudflare
Tunnel, and a separate certificate-valid `wss://ws.duris.sbs` browser path. The
primary player connection is `mud.duris.sbs:7777`; direct TLS is available on
`mud.duris.sbs:4001`. See [Deployment](docs/deployment.md) for the verified
topology and release gates.

Phase 00 is complete: all seven hook-control and integration-security sessions
validated. Repository and MUD feature-branch integration status still needs the
normal maintainer merge/release process; live deployment does not imply that
every branch has been merged to its default branch.

The cumulative security posture is `AT RISK` because dependency, refresh-token,
session-timezone, and privacy-lifecycle work remains. See the
[PRD](.spec_system/PRD/PRD.md) and
[security record](.spec_system/SECURITY-COMPLIANCE.md) for exact evidence.

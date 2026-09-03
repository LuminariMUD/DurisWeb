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

The script requires root, backend, and frontend environment files and prints
the configured frontend and health URLs. Press `Ctrl-C` to stop the application
processes; stop local dependencies separately with the same root `.env`.

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
`-- podman-compose.yml     # Local MySQL 8 and Redis 7 services
```

The DurisMUD C server is a separate repository. The backend reads its checkout
from the required `MUD_DIR`; every other host path is supplied through backend
or deployment configuration.

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
- [Repository Conventions](docs/CONVENTIONS.md)
- [Project Considerations](docs/CONSIDERATIONS.md)
- [Security and Compliance](docs/SECURITY-COMPLIANCE.md)
- [Documentation Audit](docs/docs-audit.md)

## Project Status

Production topology is operator-supplied through a protected deployment input,
then rendered into systemd, Redis, and ingress files. No production hostname,
port, user home, or secret is compiled into the repository. See
[Deployment](docs/deployment.md) for the release gates.

Phase 00 is complete: all seven hook-control and integration-security sessions
validated. The corresponding MUD hook integration was merged to the MUD default
branch through PR #71 (`0e0649954`). DurisWeb and DurisMUD still have independent
release histories, so every deployment must record and verify both exact commits;
live deployment of one repository does not prove the other is current.

The cumulative security posture is `AT RISK` because dependency, refresh-token,
session-timezone, and privacy-lifecycle work remains. See the
[architecture](docs/ARCHITECTURE.md),
[project considerations](docs/CONSIDERATIONS.md), and
[security record](docs/SECURITY-COMPLIANCE.md) for the current contracts and
evidence.

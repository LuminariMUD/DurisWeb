# Development Guide

## Repository Model

DurisWeb has independent `backend/` and `frontend/` pnpm projects. There is no
root package manifest or shared workspace dependency graph. Use `pnpm --dir`
from the root or change into the target package.

## Required Tools

| Tool | Verified Version / Source | Purpose |
|------|---------------------------|---------|
| Node.js | 22 in `.github/workflows/quality.yml` | Runtime and build tooling |
| pnpm | 10.15.1 in package metadata and CI | Dependency and script runner |
| Docker Compose | `docker compose`; `podman-compose.yml` | Local MySQL 8 and Redis 7 |
| MySQL client tools | Environment-specific | Migration inspection and operator backup/restore checks |
| Git | Current supported version | Source and MUD content operations |

## One-Command Development

After onboarding configuration:

```bash
./scripts/dev.sh
```

The script starts dependencies and both dev servers. It does not create or
certify the shared MUD/DurisWeb schema baseline.

## Backend Commands

| Command | Purpose |
|---------|---------|
| `pnpm --dir backend dev` | Nodemon development server |
| `pnpm --dir backend build` | Compile TypeScript to `backend/dist/` |
| `pnpm --dir backend start` | Run compiled backend |
| `pnpm --dir backend test --runInBand` | Full serial Jest suite |
| `pnpm --dir backend test:coverage --runInBand` | Jest coverage |
| `pnpm --dir backend format:check` | Non-mutating Biome check |
| `pnpm --dir backend format` | Apply Biome formatting |
| `pnpm --dir backend lint` | Non-mutating ESLint check |
| `pnpm --dir backend lint:fix` | Apply ESLint fixes |
| `pnpm --dir backend type-check` | TypeScript check without output |
| `pnpm --dir backend migrate:status` | Inspect selected Knex ledger |
| `pnpm --dir backend seed:run` | Run idempotent seeds |

Before any migration command, read the database baseline warning in
[Onboarding](onboarding.md) and select a disposable or explicitly authorized
database. The current development ledger is a known exception; do not repair it
automatically.

For test database work, copy `backend/.env.test.example` to
`backend/.env.test`, provide dedicated credentials, and set `NODE_ENV=test`.

## Frontend Commands

| Command | Purpose |
|---------|---------|
| `pnpm --dir frontend dev` | Vite development server on port 5173 |
| `pnpm --dir frontend build` | Vue type-check plus production build |
| `pnpm --dir frontend preview` | Preview build on port 4173 |
| `pnpm --dir frontend test:unit --run` | Run Vitest once |
| `pnpm --dir frontend format:check` | Non-mutating Biome check |
| `pnpm --dir frontend format` | Apply Biome formatting |
| `pnpm --dir frontend lint` | Non-mutating ESLint check |
| `pnpm --dir frontend lint:fix` | Apply ESLint fixes |
| `pnpm --dir frontend type-check` | Vue TypeScript project check |

## Complete Local Quality Matrix

```bash
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend test --runInBand
pnpm --dir backend build
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
```

GitHub Actions currently runs only format, lint, and type-check for both
packages. Build, test, dependency-security, integration, and deployment bundles
are not configured in CI.

## Testing Conventions

- Jest and Vitest tests live in `__tests__/` beside their domain code.
- Install ESM mocks before dynamic imports and close Redis/socket resources in
  suites that intentionally create clients.
- Prefer deterministic pool, transaction, bridge, and transport boundaries to
  ambient game rows.
- Source-text security contracts intentionally pin sensitive structure. Pair
  them with behavior tests and update deliberate refactors, never by deletion.
- Hook changes must cover registry ownership, delivery suppression, state,
  reconnect, permission, and the applicable MUD C/doc contract.

## Formatting and Generated Files

Biome 2.5.11 is pinned in both packages. `format:check` does not edit files;
`format` does. ESLint follows the same split between `lint` and `lint:fix`.

The root `.gitignore` excludes dependencies, builds, logs, environment files,
coverage, backups, and generated map content. Do not commit `.env`, player data,
database dumps, or backup archives.

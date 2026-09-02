# Development Guide

DurisWeb contains independent `backend/` and `frontend/` pnpm projects. There
is no root workspace manifest. Complete [Onboarding](onboarding.md), including
all three environment files, before running `./scripts/dev.sh`.

## Backend commands

| Command | Purpose |
|---|---|
| `pnpm --dir backend config:check` | Aggregate and report invalid backend configuration without connecting to dependencies |
| `pnpm --dir backend dev` | Run the TypeScript service with nodemon |
| `pnpm --dir backend build` | Compile TypeScript |
| `pnpm --dir backend test --runInBand` | Run Jest serially |
| `pnpm --dir backend format:check` | Check Biome formatting |
| `pnpm --dir backend lint` | Run ESLint |
| `pnpm --dir backend type-check` | Check TypeScript without output |
| `pnpm --dir backend migrate:status` | Inspect the selected Knex ledger |

## Frontend commands

| Command | Purpose |
|---|---|
| `pnpm --dir frontend dev` | Run the configured Vite development server |
| `pnpm --dir frontend config:check` | Validate public and Vite configuration without starting a server |
| `pnpm --dir frontend build` | Type-check and build `dist/` |
| `pnpm --dir frontend preview` | Run the configured Vite preview server |
| `pnpm --dir frontend test:unit --run` | Run Vitest once |
| `pnpm --dir frontend format:check` | Check Biome formatting |
| `pnpm --dir frontend lint` | Run ESLint |
| `pnpm --dir frontend type-check` | Check Vue/TypeScript projects |

## Complete quality matrix

```bash
./scripts/check-config-literals.sh
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

For database tests, copy `backend/.env.test.example` to `backend/.env.test` and
use isolated credentials/data. Source-text security tests pin sensitive
boundaries; update them only when the new structure preserves the policy.

Do not commit `.env` files, dumps, account data, generated deployment output,
or backup archives. See [Configuration and Environments](environments.md) before
adding any new setting.

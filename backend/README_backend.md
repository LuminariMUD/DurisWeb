# DurisWeb Backend

The backend is an Express 5 and TypeScript service providing HTTP and WebSocket
APIs, MySQL persistence, Redis-backed caching/pub-sub, and privileged DurisMUD
integration services.

## Setup

Copy `backend/.env.example` to `backend/.env`, replace every required secret,
and configure a MUD-compatible shared database. See the root
[onboarding guide](../docs/onboarding.md); the historical migration chain cannot
bootstrap a new shared schema safely.

## Run Commands

| Command | Purpose |
|---------|---------|
| `pnpm install --frozen-lockfile` | Install the committed dependency graph |
| `pnpm dev` | Run the TypeScript service with nodemon |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled service |
| `pnpm config:check` | Validate the complete environment without dependency connections |
| `pnpm test --runInBand` | Run Jest serially |
| `pnpm format:check` | Check Biome formatting without edits |
| `pnpm lint` | Run non-mutating ESLint checks |
| `pnpm type-check` | Run TypeScript without emission |
| `pnpm migrate:status` | Inspect the selected database migration ledger |
| `pnpm seed:run` | Run idempotent seeds against the selected environment |
| `pnpm sync-flags` | Atomically publish builder flag definitions from the selected MUD checkout |
| `pnpm wiki:publish --source-revision <commit> --source-tree <tree>` | Atomically publish wiki objects/mobs from the selected clean MUD checkout |
| `pnpm forum:bootstrap` | Add any missing categories from the approved minimal forum taxonomy |

The listener has no default host or port. `GET /health` returns 200 only when
both MySQL and Redis respond; it returns 503 with a degraded snapshot otherwise.

## Main Areas

| Path | Purpose |
|------|---------|
| `src/routes/` | HTTP route modules |
| `src/services/` | Domain and integration services |
| `src/hooks/` | Hook registry, state, resolution, and delivery gates |
| `src/middleware/` | Auth, CSRF, errors, and request limits |
| `src/db/` | MySQL and Redis clients |
| `migrations/` | Knex TypeScript migrations plus excluded legacy SQL artifacts |
| `seeds/` | Idempotent development/test seed data |

## Security Boundaries

- `JWT_SECRET` is backend-only and required at process import/startup.
- `src/config/environment.ts` is the only process-environment reader; Knex,
  runtime services, scripts, and preflight consume its typed result.
- `DURISWEB_SECRET` and its optional previous key are backend/MUD credentials;
  never expose them as `VITE_*` values or log them.
- Remote MUD bridge connections require `wss:` with certificate verification;
  plaintext `ws:` is loopback-only.
- Hook administration requires authentication and
  `manage_mud_properties` (or overlord access).

See [Architecture](../docs/ARCHITECTURE.md),
[API documentation](../docs/api/README_api.md), and the cumulative
[security record](../docs/SECURITY-COMPLIANCE.md).

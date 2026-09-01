# CONVENTIONS.md

## Guiding Principles

- Optimize for readability over cleverness
- Code is written once, read many times
- Consistency beats personal preference
- If it can be automated, automate it
- When writing code: Make NO assumptions. Do not be lazy.  Pattern match precisely.  Do not skim when you need detailed info from documents. Validate systematically.

## Naming

- TypeScript: `camelCase` values and functions, `PascalCase` types and Vue
  components, `SCREAMING_SNAKE` module constants
- Files: `camelCase.ts` for services and utils, `PascalCase.vue` for components
- Database: `snake_case` tables (plural) and columns
- Booleans read as questions: `isActive`, `hasPermission`, `shouldRetry`
- Hook identifiers are `snake_case` and identical on both ends -- the same
  string in `web_settings`, in MUD config, and in logs. Never translate them.
- Match domain language -- use MUD terms (account, character, immortal, zone)

## Files & Structure

- One concept per file where practical
- File names reflect their primary export or purpose
- Group by feature/domain, not by type (prefer `/orders/api.ts` over `/api/orders.ts`)
- Keep nesting shallow--if you're 4+ levels deep, reconsider

## Functions & Modules

- Functions do one thing; keep them readable without scrolling
- ESM only (`"type": "module"`) -- relative imports carry the `.js` extension
- `async`/`await` over raw promise chains; never leave a floating promise
- Prefer named exports; default exports only where a framework requires one

## Types

- `interface` for object shapes that may be extended; `type` for unions,
  intersections, and function signatures
- No `any` in new code -- use `unknown` and narrow
- Parse external input (MUD payloads, request bodies, config) into a typed shape
  at the boundary; do not assert with `as`
- Database row types live beside the query, not inline in handlers

## Comments

- Explain *why*, not *what*
- Delete commented-out code--that's what git is for
- TODOs include context: `// TODO(name): reason, ticket if applicable`
- Update or remove comments when code changes

## Error Handling

- Fail fast and loud in development; fail gracefully in production
- Errors are actionable -- include the hook id, account, or query context
- Never swallow errors silently; a caught error is logged or rethrown
- Security and integration failures fail closed: on doubt, refuse the operation
- Never log secrets, IP addresses, or tokens

## MUD Integration Hooks

Every website<->MUD integration point follows one contract. See
`.spec_system/PRD/PRD.md` and `.spec_system/SECURITY-COMPLIANCE.md`.

- Every hook has a stable `snake_case` id, registered in the hook registry
- Every hook is independently toggleable on both ends; a hook is active only
  when both ends enable it (fail closed)
- The source does not emit a disabled hook's events -- do not emit and discard
- Toggle checks on an event path are in-memory lookups, never a DB or disk read
- Toggle changes take effect without restarting either system
- Treat everything arriving from the MUD as untrusted input, including
  filesystem-sourced data -- validate before parsing
- The bridge secret is fail-closed and never reaches frontend code or logs
- Contract tests in `backend/src/**/__tests__/*SecurityContract*` and
  `*Authorization*` assert on source text; update them deliberately, never by
  deletion

## Database Layer

### Connection
- Connection string source: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` env vars (see `backend/.env.example`) -- never hardcoded
- Pool size: knex default (min 2, max 10) unless overridden in `backend/knexfile.ts`
- Separate connection URLs for: app, migrations, tests

### Migrations
- Tool: Knex (`backend/knexfile.ts`)
- Location: `backend/migrations/`
- Naming convention: `NNN_verb_subject.sql` (zero-padded sequence, snake_case)
- CRITICAL: Never modify a migration already applied to shared environments
- Every migration must have a reverse/down

### Models / Schema
- Location: `backend/src/db/`, with row types in `backend/src/types/`
- Naming: snake_case tables (plural), PascalCase TypeScript types
- Required columns: `id`, `created_at`, `updated_at`

### Queries
- Parameterized only (no string concatenation)
- N+1 prevention strategy: batch with `whereIn` and join at the service layer
- Transaction boundary rules: wrap multi-table writes in a single knex transaction at the service layer

### Seeding
- Script: `pnpm seed:run` in `backend/`
- Must be idempotent (safe to re-run)

### Testing
- Strategy: separate database (Jest, `backend/jest.config.ts`)
- Fixture location: `backend/src/**/__tests__/`

### Vector / Embeddings (if applicable)
- Not applicable -- no vector store in use

## Testing

- Backend: Jest (`NODE_OPTIONS=--experimental-vm-modules pnpm test`); frontend:
  Vitest (`pnpm test:unit`)
- Tests live in `__tests__/` beside the code under test
- Test names describe scenario and expectation, not the function name
- Test behavior, not implementation -- except contract tests, which
  deliberately pin structure
- Every hook needs a test proving it delivers when enabled and does not when
  disabled at either end
- Flaky tests get fixed or deleted -- never ignored

## Git & Version Control

- Commit messages: imperative mood, concise (`Add user validation` not `Added some validation stuff`)
- One logical change per commit
- Branch names: `type/short-description` (e.g., `feat/user-auth`, `fix/cart-total`)
- Keep commits atomic enough to revert safely

## Pull Requests

- Small PRs get better reviews
- Description explains the *what* and *why*--reviewers can see the *how*
- Link relevant tickets/context
- Review your own PR before requesting others

## Code Review

- Critique code, not people
- Ask questions rather than make demands
- Approve when it's good enough, not perfect
- Nitpicks are labeled as such

## Dependencies

- pnpm in both packages; each has its own lockfile and both are committed
- Fewer dependencies = less risk; justify additions
- Pin versions; update intentionally, never as a side effect of another change

## Local Dev Tools

| Category | Tool | Config |
|----------|------|--------|
| Formatter | not configured | - |
| Linter | ESLint 9 | `backend/eslint.config.js`, `frontend/eslint.config.ts` |
| Type Safety | TypeScript 5.9 | `backend/tsconfig.json`, `frontend/tsconfig*.json` |
| Testing | Jest (backend), Vitest (frontend) | `backend/jest.config.ts`, `frontend/vitest.config.ts` |
| Observability | not configured | - |
| Git Hooks | not configured | - |
| Database | MySQL 8 + Redis 7 | `podman-compose.yml`, `backend/knexfile.ts` |

## Workspace Structure

| Package | Path | Stack |
|---------|------|-------|
| backend | backend | TypeScript |
| frontend | frontend | TypeScript |

### Cross-Package Rules

- Import from sibling packages via workspace aliases, not relative paths
- Shared types live in a dedicated shared/common package
- Each package owns its own tests; integration tests live at repo root
- Changes spanning multiple packages require explicit cross-package session scope

### Database Ownership

| Database | Owner Package | Type | Shared By |
|----------|---------------|------|-----------|
| duris_dev | backend | MySQL 8 | frontend (via HTTP API only) |
| redis | backend | Redis 7 | backend only |

- Migrations live in the owner package
- Consuming packages use the owner's API, not direct DB access

## MUD Server Source (Local Dev)

The DurisMUD server source is checked out locally and directly readable at:

```
/home/aiwithapex/projects/duris/
```

This is a separate repository from durisweb -- never edit it as part of a
durisweb session unless the session scope says so explicitly.

**Why it matters**: both sides of every website<->MUD hook are inspectable.
Verify integration contracts against the MUD C source rather than inferring
them from the durisweb side alone.

| What | Path under `/home/aiwithapex/projects/duris/` |
|------|-----------------------------------------------|
| WebSocket server and auth (channel 1) | `src/net/websocket.h`, `src/net/ws_auth.h`, `src/net/ws_handlers.c`, `src/net/comm.c`, `src/net/gmcp.c` |
| Account login / nanny (port 4050 refs) | `src/account/nanny.c` |
| Comm log durisweb tails (channel 3) | `logs/log/comm` |
| Other MUD logs | `logs/log/{artifact,cmd.debug,debug,file,mob,status,sys}` |
| Account and player flatfiles | `Accounts/`, `Players/` |
| Start/restart script (channel 4) | `scripts/cycle_mud.sh` |
| Area and help data | `areas/`, `areas_mini/`, `help/` |
| MUD-side schema and migrations | `db/`, `migrations/` |
| MUD docs and agent instructions | `docs/`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `SECURITY.md` |

In `backend/.env`, `MUD_DIR` points at this checkout for local development
(`backend/.env.example` ships the placeholder `/path/to/DurisMUD`).

## When In Doubt

- Ask
- Leave it better than you found it
- Ship, learn, iterate

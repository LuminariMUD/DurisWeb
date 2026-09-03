# Agent Guide

Website for DurisMUD - usually hosted on same server as DurisMUD

## Repository

- This is a logical monorepo with independent `backend/` and `frontend/` pnpm projects; there is no root package manifest.
- Backend: Express 5, TypeScript, Knex, MySQL, and Redis. Frontend: Vue 3, Vite, TypeScript, and Tailwind CSS.
- Read the nearest README plus `docs/development.md`. Follow `docs/CONVENTIONS.md`; integration or security work also requires `docs/SECURITY-COMPLIANCE.md`.
- DurisMUD is a separate repository. Do not modify or operate it unless explicitly requested.

## Working Rules

- Inspect relevant implementation, tests, and configuration before editing. Keep changes focused and preserve unrelated work in the checkout.
- Reuse established patterns. Update documentation when behavior or configuration changes; never add secrets, `.env` files, dumps, generated output, backups, or player data.
- Use ESM and include `.js` on relative TypeScript imports. Prefer named exports, `async`/`await`, strict types, and validation of external input; do not add `any`.
- Use `camelCase` for values/functions, `PascalCase` for types and Vue components, and `snake_case` for database fields and hook IDs.
- Treat browser-visible `VITE_*` values as public. Never log secrets, tokens, or IP addresses; security and integration failures must fail closed.
- Never edit an applied migration. New migrations need a reversible `down`; use an isolated test database and do not run migrations against shared environments without explicit direction.

## Verification

Run commands from the repository root with `pnpm --dir`. For the affected package, run the narrowest relevant tests plus:

```bash
pnpm --dir <backend|frontend> format:check
pnpm --dir <backend|frontend> lint
pnpm --dir <backend|frontend> type-check
```

Backend tests use `pnpm --dir backend test --runInBand`; frontend tests use `pnpm --dir frontend test:unit --run`. Run the applicable build for runtime changes. Backend database/MUD-write changes also require `pnpm --dir backend verify:mud-writes`. Cross-package changes must validate both packages. Report every command run and any checks not run.

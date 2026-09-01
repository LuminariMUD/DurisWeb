# DurisWeb Frontend

The frontend is a Vue 3 and Vite single-page application for the public DurisMUD
site, forums, PvP and auction data, guide/wiki content, builder tools, and
operator administration.

## Setup

Copy `frontend/.env.example` to `frontend/.env`. The default development API and
browser WebSocket endpoints point to the backend on port `3001`. Never put
`DURISWEB_SECRET`, `JWT_SECRET`, or another server credential in a `VITE_*`
variable; Vite exposes those values to browsers.

## Run Commands

| Command | Purpose |
|---------|---------|
| `pnpm install --frozen-lockfile` | Install the committed dependency graph |
| `pnpm dev` | Run Vite on port `5173` |
| `pnpm build` | Type-check and produce `dist/` |
| `pnpm preview` | Preview the production build on port `4173` |
| `pnpm test:unit --run` | Run Vitest once |
| `pnpm format:check` | Check Biome formatting without edits |
| `pnpm lint` | Run non-mutating ESLint checks |
| `pnpm type-check` | Run Vue TypeScript project checks |

## Main Areas

| Path | Purpose |
|------|---------|
| `src/views/` | Route-level pages |
| `src/components/` | Product and shared UI components |
| `src/composables/` | Reusable application state and server interactions |
| `src/router/` | Route definitions and auth/permission metadata |
| `src/services/` | Browser-side API services |
| `src/stores/` | Pinia state stores |
| `public/` | Static assets copied to the build output |

The Phase 00 hook console is at `/admin/mud/hooks` and requires the
`manage_mud_properties` permission. It displays server-observed website, MUD,
effective, mismatch, unavailable, and transport states; it does not apply
optimistic toggle results.

See [Development](../docs/development.md) and
[Architecture](../docs/ARCHITECTURE.md).

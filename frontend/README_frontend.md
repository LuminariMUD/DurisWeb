# DurisWeb Frontend

The frontend is a Vue 3 and Vite single-page application for the public DurisMUD
site, forums, PvP and auction data, guide/wiki content, builder tools, and
operator administration.

## Setup

Copy `frontend/.env.example` to `frontend/.env` and set every public URL, host,
port, and allowed-host value explicitly. Never put
`DURISWEB_SECRET`, `JWT_SECRET`, or another server credential in a `VITE_*`
variable; Vite exposes those values to browsers.

## Run Commands

| Command | Purpose |
|---------|---------|
| `pnpm install --frozen-lockfile` | Install the committed dependency graph |
| `pnpm dev` | Run Vite on the configured host and port |
| `pnpm build` | Type-check and produce `dist/` |
| `pnpm config:check` | Validate public and Vite settings without starting a server |
| `pnpm preview` | Preview on the configured host and port |
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

`config/environment.ts` owns build/server parsing and
`src/config/environment.ts` is the only browser-side `import.meta.env` reader.
Mutable public branding and MUD addresses come only from `/api/site-config`;
the UI reports an unavailable state when that database contract is incomplete.

See [Development](../docs/development.md) and
[Architecture](../docs/ARCHITECTURE.md).

# DurisWeb Frontend

The frontend is a Vue 3 and Vite single-page application for the public DurisMUD
site, forums, PvP and auction data, guide/wiki content, builder tools, and
operator administration.

## Initial download boundaries

The Vite build groups shared Vue/chart runtimes explicitly and leaves editor and
icon modules to the bundler's route-based splitting. Grouping every editor/icon
dependency together can pull editing code and complete dynamic icon catalogs
into the initial shared shell through their common dependencies. Forum category
icons and the game hotbar retain their full name-selected catalogs on those
routes; no catalog entries are removed.

After a build, `node scripts/qualification/initial-download.mjs` from the repository
root counts the complete HTML-declared JS/CSS/font set and its raw/gzip bytes.
The command derives the deployment base from Vite's module entry, so a build
served under `/community/` still resolves its local `dist/assets/` files correctly.
This excludes dynamically imported route assets, images, API calls and
service-worker installation; measure those with a fresh browser waterfall too.
See [issue 98's qualification record](../docs/ongoing-projects/plan-issue-98.md).

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

Website/network failures open a dismissible availability dialog with a read-only
Retry action. A separately deployed Cloudflare Worker supplies explicit
maintenance reasons and an independent page for complete origin/tunnel outages.
See [availability notices](../deploy/maintenance/README.md) for activation and
operator controls. Neither feature starts or stops the MUD.

## Design

The [Design guide](../docs/DESIGN.md) is the starting point for UI work. It
covers the eclipse palette, typography, shared components, responsive layout,
copy and imagery, forms, motion, and accessibility. It also links the source
files that own exact tokens and behavior.

See [adding or changing a page](../docs/DESIGN.md#adding-or-changing-a-page),
[homepage assets and configuration](../docs/DESIGN.md#homepage-assets-and-configuration),
and [game content and charts](../docs/DESIGN.md#game-content-and-charts) for the
contracts to preserve, and [verification](../docs/DESIGN.md#verification) for
the relevant checks.

See [Development](../docs/development.md) and
[Architecture](../docs/ARCHITECTURE.md).

The desktop Wiki menu lists **Surface Map** below **Map**; mobile More offers the
same destination after Map. It opens the public internal `/surface-map` route,
hosting a manually maintained local snapshot of Drevarr's October 2026 map.
Its image, icons and validated zone/travel data live in `public/surface-map/`;
requests respect `VITE_BASE_URL`. See the [snapshot guide](../docs/surface-map.md)
for credits, refresh instructions and keyboard room lookup. The existing
backend-driven `/wiki/map` remains separate.

## Privacy and visit-statistics choices

`/privacy` is public, with desktop **Browse** and mobile **More** access. It
contains source-owned draft privacy details and the owner-supplied contact;
provider use, retention and public wording remain subject to review. The backend
policy currently disables receipt issuance and collection. UI/source preparation
does not approve that policy or announce a live release.

The browser validates both notice and choice versions, the receipt, revision and
expiry through `/api/privacy`. Explicit choices use the existing CSRF cookie and
are serialized with [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
[BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
and the fixed `duris_privacy_choice_v1` browser safety preference stop other tabs.
That setting contains only `off` or `accepted`, never a visit/account identifier;
a failed save leaves it off until a new confirmed choice or browser-data clearing.
It is corroborated by the server and cannot grant consent by itself.

Acceptance requires a separate receipt read-back, so rejected HttpOnly cookies
cannot enable tracking. Unsupported synchronization or unreadable preferences
keep optional collection off; refusal/withdrawal can still attempt a server save.
The only visit nonce lives in page memory after confirmation. Event bodies contain
only an allowlisted route family, nonce, choice version and revision, with no
referrer header. Standard browser/network headers and necessary security records
are separate; the collector does not use them to enrich statistics.
Stop, expiry, withdrawal and account transitions abort optional
work and discard that nonce. Login never grants consent. Completed server writes
cannot be recalled by aborting a browser request.

Preference checks have a bounded necessary timeout and their own error UI;
optional failures do not open the site's general outage dialog or replay events.
The frontend creates no persistent analytics identifier or title-delay timer.
See the [lifecycle inventory](../docs/privacy-data-lifecycle.md) and
[API contract](../docs/api/README_api.md#privacy-choice-contract).

## Mudlet GUI page

`/mudlet-gui` is a public, lazy-loaded page available through desktop **Browse**
and mobile **More**, beside Guide. It introduces the desktop Arjinius Client,
shows native demonstration screenshots, and links to GitHub releases and setup
instructions. Primary **Play** navigation still opens the browser client at
`/play`. Branding and connection details use the shared public site configuration;
setup lists the encrypted TLS port when configured and labels the plaintext port
separately. External destinations live in `src/config/links.ts`.

The [asset record](src/assets/mudlet-gui/README.md) pins the public package used
for the screenshots. Recheck the downloadable release and its behavior when
updating those images or claims. The page makes no runtime GitHub API request.

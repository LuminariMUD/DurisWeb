# Backend and API structure cleanup

Prepared 2026-11-10. **Status: in progress — see [Progress log](#progress-log).**
Source baseline: `8a1986b`. Recheck the affected source and working-tree changes
before each implementation step; the measurements below describe this revision.

## Outcome and scope

Keep Express 5, TypeScript, Vue 3, Vite, Axios, mysql2, Knex, Redis, Jest, Vitest,
and the two independent pnpm packages. Make a feature change understandable from
its own routes, service calls, browser API functions, and tests without editing
large unrelated modules or importing the running server.

The concrete scope is the backend entry point and its broadcast consumers;
the admin, forum, builder, and changelog HTTP modules; and the HTTP client code
currently collected in `frontend/src/services/api.ts`. Other services move only
when ownership or a dependency in these paths requires it. Existing focused
modules do not need a repository-wide relocation.

**Non-goals:** a framework migration, microservices, a new ORM, database/schema
changes, a shared workspace package, generated API clients, a new event bus or
dependency-injection container, UI redesign, new features, and changing the MUD.
There is no production operation or deployment authorization in this plan.

**Files for this planning task:** this document only. Later implementation files
and proof are specified below. Source links are evidence, not instructions to
change every linked file.

## Evidence and constraints

The focused source review found these concrete seams:

- [backend/src/index.ts](../../backend/src/index.ts) is 1,825 lines. It assembles
  HTTP middleware, exposes broadcast functions, handles application WebSockets,
  starts jobs and integrations, and owns signal handling and shutdown.
- [admin.ts](../../backend/src/routes/admin.ts) is 4,682 lines;
  [forum.ts](../../backend/src/routes/forum.ts) is 3,374;
  [builder.ts](../../backend/src/routes/builder.ts) is 2,702. They collect many
  distinct operations, although substantial domain logic already lives in
  `backend/src/services/`. Reuse those services rather than adding parallel ones.
- [frontend API module](../../frontend/src/services/api.ts) is 3,605 lines. One
  Axios instance and its CSRF/availability interceptors share a file with many
  feature APIs, some wire types, named exports, and a default `pvpApi` export.
- `routes/forum.ts`, `routes/auction.ts`, `services/crashDetectionService.ts`,
  and `services/mudConnectionLogSync.ts` import broadcasts from `index.ts`;
  these four are the only production imports of the entry point. Five test files
  mock `../../index.js` (`forumSearchNative`, `postImageRemovalNative`,
  `mudConnectionLogSync`, `userProfilePrivacy`, `userProfileSchemaIntegration`).
  The cycle is reachable from live code: `routes/admin.ts` and
  `routes/mudControl.ts` import `mudControlService.ts`, which imports
  `createWebShutdownIncident` from `crashDetectionService.ts`, which imports
  `index.ts`. Crash monitoring itself (`startCrashMonitoring`) is not started by
  the entry point, and `mudConnectionLogSync.ts` has no production importer;
  removing the import cycle must not activate either.
- Mount order carries behavior. `/api/admin/data-holds` is mounted before the
  `/api/admin` router; `/api/admin/users`, `/api/admin/git`, and
  `/api/admin/analytics/web` are mounted after it and are reached only because
  `routes/admin.ts` has no router-level `use` and its routes do not match them.
  `routes/forum.ts` applies `optionalAuth` and `routes/builder.ts` applies
  `requireAuth` plus `requirePermission('manage_zones')` at router level.
- `backend/mud-write-allowlist.json` keys each classified write as
  `<path under src>|<operation>|<table>`. 28 of its 53 keys start with
  `routes/admin.ts`; none name the forum, builder, changelog, or auction route
  files. `verify:mud-writes` fails on an unclassified write and on an entry
  that no longer matches a statement, so a moved statement and its key must
  change in the same commit.
- [changelog routes](../../backend/src/routes/changelog.ts) already have a
  separate [service](../../backend/src/services/changelogService.ts), reusable
  validation helpers, route tests, and visible frontend consumers. This is a
  bounded pilot for the feature layout.
- Error formats are not uniform: the global handler returns an `error` object,
  while many routes return an `error` string; some responses also carry `code`.
  A file move must not silently change these contracts.
- Several contract tests inspect specific source files and statement order.
  `apiNotFound`, `frontendAssets`, `applicationWebSocket`, `websocketAccess`,
  `hookDeliveryContract`, and `productionReviewRegression` read
  `backend/src/index.ts` as text; `websocketAccess` and
  `productionReviewRegression` also read `routes/admin.ts`.
  Moving code requires relocating assertions deliberately, not deleting them
  or leaving unused old code so a string test passes.
- About 130 frontend files import `services/api`, and 24 spec files mock
  `@/services/api`. The default `pvpApi` export has four callers:
  `PvPListView.vue`, `SearchView.vue`, `usePvPEvents.ts`, and `useAnalytics.ts`.
- Paths this plan moves are cited outside the source tree:
  `docs/api/README_api.md`, `docs/ARCHITECTURE.md`, `docs/docs-audit.md`, a
  relative link to `changelogService.ts` in `docs/privacy-data-lifecycle.md`,
  and `.agents/skills/news-update/references/publishing.md`.
- Database modules have import-time work: MySQL pools are constructed and the
  cache Redis client connects on import. Separating `createApp` from startup
  alone will not make the entire dependency graph free of external effects.

File lengths identify review targets, not quality scores. No maintenance-time,
performance, production-health, or test-pass claim follows from this review.

Follow [conventions](../CONVENTIONS.md), [architecture](../ARCHITECTURE.md),
[security boundaries](../SECURITY-COMPLIANCE.md),
[API contracts](../api/README_api.md), and [development](../development.md).
Keep source-status and deployment-status claims separate.

## Target organization

The paths below are proposed destinations, created only when their step lands.
Keep nesting shallow and use named exports in new modules, with `.js` suffixes
on relative TypeScript imports. Preserve existing exports temporarily only for
identified callers that have not yet migrated.

```text
backend/src/
  index.ts                         # executable entry; launch and signal wiring
  app.ts                           # createApp; HTTP middleware and route assembly
  runtime/
    startServer.ts                 # dependency checks and explicit startup wiring
    backgroundJobs.ts              # existing job starts and their stop handles
    shutdown.ts                    # ordered, idempotent resource cleanup
  realtime/
    broadcasts.ts                  # existing broadcasts; no entry-point import
    applicationSocket.ts           # connection lifecycle and message dispatch
    clientState.ts                 # typed per-connection state
    ...                            # handler files only for actual message families
  features/
    changelog/
      routes.ts
      service.ts
      validation.ts
      __tests__/
    admin/
      routes.ts                    # ordered composition of admin route groups
      settingsRoutes.ts
      accessRoutes.ts
      ...                          # groups listed in step 4
    forum/
      routes.ts
      ...
    builder/
      routes.ts
      ...
  middleware/                      # retain existing cross-feature middleware
  services/                        # retain shared/integration services
  db/                              # retain persistence ownership and clients
  hooks/                           # retain existing hook registry and gates

frontend/src/
  services/
    httpClient.ts                  # one Axios instance, CSRF and interceptors
    api.ts                         # temporary explicit re-exports; removed in step 5
  features/
    changelog/api.ts
    admin/...                      # split API modules by the same admin concerns
    forum/api.ts
    builder/api.ts
    ...                            # remaining existing API exports, by domain
```

Feature routes handle HTTP concerns and delegate operations to existing domain
services. Keep feature-only validation and wire types beside their feature;
keep genuinely shared helpers where they are. Do not require a separate
controller, repository, interface, and factory for every endpoint.

Runtime code may compose features and services. Features/services must not import
`index.ts`, `app.ts`, or runtime startup. Browser features import the shared HTTP
client; the HTTP client must not import features. Backend and frontend continue
to communicate through HTTP/WebSocket contracts, not cross-package imports.

## Compatibility requirements

Every extraction must preserve the affected observable contract:

- HTTP method, URL, query/body encoding, status, response fields and error shape;
  decimal-string BIGINT identifiers, optional/null fields, pagination bounds,
  upload/download headers, streaming, cancellation, and timeout behavior.
- Middleware and route order, including specific routes before dynamic IDs,
  authentication/permission checks, mutation gates, request limits, rate limits,
  CSRF handling and the webhook exception. Preserve relevant `baseUrl`, params,
  and `originalUrl` behavior when changing router composition.
- Production canonical-host and fingerprinted-asset handling; JSON API 404s
  before static/history fallback; ordinary Vue history navigation and existing
  public-page metadata behavior.
- Current account/session and forum/category authorization, hook gates,
  WebSocket recipient filtering, reconnect behavior, bounded output and cleanup.
  Browser game traffic and the privileged MUD bridge remain separate transports.
- SQL statements, transaction boundaries, database ownership, and existing
  disabled mutation behavior. A move does not authorize a new MUD write.
- One HTTP client and one set of interceptors. Preserve `withCredentials`, the
  10-second shared timeout, mutation CSRF headers, outage notification rules,
  and the `operation_gated` exception; do not add automatic retries or replay.

Preserving contracts is not an instruction to bless an existing defect. If a
defect blocks a slice, isolate and prove its repair explicitly; unrelated fixes
belong in separate work. Do not combine structural moves with a global error
envelope, new validation semantics, or a permissions redesign.

## Implementation sequence

Each numbered step has an acceptance gate. Step 4 deliberately consists of
several feature-sized PRs. Record the actual commits, commands, outcomes, skips,
and remaining work as implementation proceeds; do not pre-mark checks passed.

### 0. Capture the affected contracts before moving code

At the start of each slice, inspect its routes, service calls, all imports and
test mocks. Record its method/path list, middleware order, response examples,
and external effects in the PR description or focused test fixtures. Use
synthetic data, never production responses, credentials, or player records.

Run the existing relevant tests on the starting revision. Add only missing
behavioral coverage for a concrete extraction risk: route shadowing, a missing
guard, duplicate interceptor/job registration, a broadcast recipient, or a
resource not being closed. Keep this work in the slice rather than creating a
general route-inventory framework or a separate broad test campaign.

**Exit:** known baseline results, named compatibility checks, and a bounded file
list for that PR. Pre-existing failures are recorded and investigated; they are
not counted as passing qualification.

### 1. Pilot the layout with the shared client and changelog

Use two small commits, independently reviewable:

1. Move the Axios instance, `getCsrfToken`, and existing interceptors from
   `frontend/src/services/api.ts` to `services/httpClient.ts`. Have the old API
   module import/re-export that same instance. Update `hooksApi.ts`,
   `privacy.ts`, `accountExport.ts`, and direct transport consumers as needed.
   Preserve the privacy/export modules' deliberate `fetch`, bounded download,
   redirect, abort, and timeout policies; they are not generic Axios conversions.
2. Move changelog routes/service into `backend/src/features/changelog/`, and
   move the current route-specific validators to `validation.ts`. Move
   `changelogApi` into `frontend/src/features/changelog/api.ts`. Update the
   backend mount, frontend consumers, imports and test mocks. Keep the old
   frontend export as an explicit forwarding export until step 5; remove the
   old backend files once all their callers have moved. In the same commit,
   repoint the changelog paths in `docs/api/README_api.md`, the
   `changelogService.ts` link in `docs/privacy-data-lifecycle.md`, and the
   owner table in `.agents/skills/news-update/references/publishing.md`, so no
   link breaks and the release workflow does not cite removed files.

Keep the existing validation and sanitization behavior. A typed parser can
replace a local cast only with the same accepted inputs and errors; reuse
`utils/validation.ts`, not a new schema library. Move service/route tests with
their owner when practical and preserve the distinction between their scopes.

**Proof:** changelog route field, validation, visibility and pagination suites;
service visibility/content suites; frontend API availability, ChangelogList,
ChangelogBanner, and the admin consumer checks. Add a small Axios-adapter test
for the extracted changelog methods and CSRF/interceptor behavior where existing
tests do not cover it. Existing mocked-auth route tests do not prove real auth
or the complete app mount; include the composed HTTP path with synthetic auth
state for public reads, unauthorized writes, and an authorized mutation.

**Exit:** the pilot works through the actual HTTP/browser API path; there is one
transport instance; changelog behavior is unchanged. Use the pilot to confirm
the layout before repeating it across larger modules.

### 2. Remove imports back into the backend entry point

Move broadcast functions out of `index.ts` into `realtime/broadcasts.ts`, along
with the minimal shared state they need. Runtime attaches the one application
WebSocket server and clears that binding on stop. Preserve the existing
no-server behavior and recipient checks; do not introduce a general event bus.

Update the forum/auction route imports, crash-detection and connection-log
service imports, and the five test files that mock `../../index.js`; a mock
left on the old specifier silently stops applying. Reuse the callback setters
already used by notification, backup, MUD-control and player-event services.
Introduce `clientState.ts` only for connection fields actually read by the
broadcasters and handlers; replace moved socket `any` accesses with explicit
types without claiming incoming payloads are validated by a type assertion.

**Proof:** forum/post and auction broadcast paths; `websocketAccess`,
`applicationWebSocket`, `mudConnectionLogSync`, and affected profile/forum
fixtures. Test entitled and non-entitled recipients with synthetic sockets.
Update source assertions to inspect the executing broadcast implementation.

**Exit:** no production feature/service imports the executable entry point, no
second broadcast implementation, and previously inactive legacy monitors remain
inactive. Add a narrow import restriction in the existing ESLint configuration
if needed to keep this demonstrated dependency problem from returning.

### 3. Separate HTTP composition, WebSockets, and runtime lifetime

Do this after step 2, in separate reviewable commits/PRs:

1. Extract `createApp` into `app.ts`, preserving exact middleware, route,
   metadata and static-fallback order. Keep `node dist/index.js` as the package
   entry command. Importing application composition must not install process
   signal handlers, start listeners, schedule jobs, or start MUD integrations.
   Mock DB/Redis modules in isolated composition tests: the existing connection
   modules still have import-time effects. Do not claim otherwise or add a
   general dependency container to eliminate them.
2. Extract the connection lifecycle and dispatch into
   `realtime/applicationSocket.ts`. Split handlers by existing message family:
   authentication/subscriptions, log streams, terminal, builder streams, and
   deployment. Keep dispatch order, exact messages, per-connection state,
   authorization and cancellation/close behavior. Privileged handlers are
   qualified with synthetic dependencies, never live terminal/deploy actions.
3. Move startup into `runtime/startServer.ts`, job ownership into
   `runtime/backgroundJobs.ts`, and cleanup into `runtime/shutdown.ts`.
   `index.ts` launches once, installs signals once, and decides process exit.
   Use explicit functions/stop handles, not a plugin registry or resource DSL.

Keep the current dependency/schema/session checks, feature gates, polling
cadences, initial PvP cursor, and no-overlap behavior. Inventory every resource
started here: timers, health/guild monitoring, backup cron, outbox/audit workers,
flatfile monitoring, bridge/subscriptions, log watchers, sockets and terminals.
The backup scheduler currently discards its cron task handle; retain a stop
handle as part of lifecycle ownership without changing its schedule or work.
Repeated shutdown must not repeat destructive cleanup; partial startup failure
must close only resources acquired by that startup. Stop producers and close
dependent work before closing shared database/cache clients.

**Proof:** composed-app HTTP checks plus existing asset/API-404/error-handler
contracts; `applicationWebSocket`, `websocketAccess`, `serverShutdown`,
`terminalSessionAuthorization`, `pvpPolling`, `hookDeliveryContract`, and
`productionReviewRegression`. The last two, with `apiNotFound`,
`frontendAssets`, `applicationWebSocket`, and `websocketAccess`, read
`index.ts` as text and must be repointed at the file that now executes each
asserted statement. Extend fixtures for signal registration, startup failure, stop ordering,
duplicate job prevention, and a connected peer during shutdown. A synthetic
cron job must stop without creating a backup. Keep source-contract assertions
attached to the actual registration/dispatch path after the move.

**Exit:** `index.ts` contains launch/signal/exit wiring, not routes, SQL,
broadcast implementations or message handlers. Runtime resources have explicit
owners and tested cleanup. No environment or deployment-template change is
required just to load the new files.

### 4. Split the large route modules by existing responsibility

Preserve the root mount prefixes and ordered composition. Choose simple child
routers or explicit registration functions based on the existing parameter and
middleware behavior; do not blindly nest routers and lose params or guards.
Move one group and its tests at a time, removing its old implementation.
Keep the forum and builder router-level middleware ahead of every moved group.
Do not add router-level `use` middleware or a catch-all to the admin
composition: `/api/admin/users`, `/api/admin/git`, and
`/api/admin/analytics/web` requests pass through that router before reaching
their own mounts.

- **Admin:** move settings/uploads and Discord configuration first; then
  permissions/roles/accounts, analytics/health/WHO/incidents, community
  moderation, and backup/upload/restore endpoints. Keep god commands and
  duplicate-item actions separately identifiable with their current gates.
  `features/admin/routes.ts` composes these groups. Read endpoints are not a
  reason to relax staff authorization. Backup and restore behavior stays under
  the existing services and recovery contracts.
- **Forum:** separate categories/threads/posts, search, subscriptions and
  notifications, polls/reactions, profiles, and image operations. Preserve the
  existing category/privacy checks and notification timing. Keep the existing
  `forumService.ts` initially; split a service only when a route group exposes
  a distinct responsibility or a query currently lives inside its handler.
- **Builder:** separate zone listing/search/activity, rooms, mobs, objects,
  resets/flags, map positions, validation, comments/proc requests, and
  streaming/export. Preserve parent-zone/child ownership checks, ordered auth,
  filesystem containment, streaming cancellation, and existing parser/writer
  services. No game file or MUD process is operated during this cleanup.

Keep SQL behavior unchanged when moving a route-local query to a feature-owned
service function, with row types beside the query. Do not add generic CRUD or
repository wrappers. For every moved MUD-owned write, update only the path part
of its `backend/mud-write-allowlist.json` key, in the commit that moves the
statement; preserve its classification, gate, authoritative writer and SQL
semantics. All 28 route-file keys belong to `routes/admin.ts`, so every admin
group that carries one needs this; the forum and builder route files have none.
Run `verify:mud-writes` for these moves.

**Proof:** existing admin permission-ID and native admin-read suites, plus the
`websocketAccess` and `productionReviewRegression` assertions that read
`routes/admin.ts` as text, repointed at the group that now owns them; forum
access, search, profile privacy/schema, polls and image-removal suites; builder
child-ID and relevant zone mutation/containment/streaming suites. Add composed
HTTP cases for any moved group not covered, especially specific-vs-dynamic route
precedence and unauthorized requests causing no mutation. Native fixtures use
only explicit disposable targets documented in `docs/development.md`.

**Exit per group:** its routes have one owner, the previous block is removed,
middleware and responses match the baseline, and tests reach the mounted group.
**Exit for the step:** the old admin/forum/builder route files are gone or are
temporary forwarding modules with a named caller and removal in step 6; their
replacements compose features rather than carrying unrelated handler bodies.

### 5. Finish the frontend API split and remove its compatibility module

After step 1, migrate the remaining exports in feature-sized changes coordinated
with step 4 where useful. Cover all existing API groups: site configuration,
PvP, news, auth, forum, admin/dupes/user management/analytics, profile/character/
guild, frags, git, builder, wiki, guides/suggestions, notifications, auctions,
and public statistics. Split large admin and builder API objects along the
backend groups rather than moving the entire large block into a new large file.

Preserve function names/signatures, request encoding, return types, and errors.
Move API-local types with their owner; do not reorganize the whole shared
`frontend/src/types` tree. Reconcile touched wire types against backend
responses; a TypeScript generic on `axios.get` is not runtime validation.

Move each feature's callers and mocks in the same change. Raw `apiClient`
consumers import `services/httpClient.ts`; move their endpoint-specific calls
into a feature API when that endpoint belongs to the slice. Specialized fetch
clients retain their policies. Preserve the default `pvpApi` export only until
its four default-import callers are migrated to the named export. A
`vi.mock('@/services/api')` left in a spec whose subject now imports a feature
module no longer intercepts anything; move each mock with its caller. New feature files must never import the old facade.

**Proof:** API availability and affected consumer tests, adapter-level assertions
for representative reads/writes/uploads/query encoding, and both package
contracts whenever wire typing or a backend path is touched. Preserve raw Axios
rejections and stable `code` checks; do not rewrite error formats during moves.

**Exit:** no source or tests import `services/api`; delete that file. There is
one shared Axios instance and no duplicated interceptors or endpoint methods.
Privacy/export, authentication, outage reporting and existing request behavior
continue to pass their own tests.

### 6. Close the migration and document the resulting ownership

Remove temporary forwarding modules and obsolete exports once searches show
no callers. Remove only code made obsolete by this work; do not turn closure
into repository-wide dead-code removal. Add narrow existing-linter restrictions
for executable-entry imports and the retired frontend API path, if not already
covered. Do not add a dependency-analysis platform or arbitrary file-size gate.

Update `docs/ARCHITECTURE.md`, `docs/api/README_api.md`, package READMEs, and
`docs/CONVENTIONS.md` only where their ownership/import/testing guidance changed.
Repoint the remaining moved-path citations listed under Evidence, including the
route-owner table in `docs/api/README_api.md` and the verification sources in
`docs/docs-audit.md`; a search for the retired paths outside this plan should
return nothing.
The resulting guides should identify where to add a route, a job, a WebSocket
handler, a browser API call, and the matching tests.

Review total complexity: fewer unrelated responsibilities per module, no duplicate
implementations, no new runtime dependencies, no competing abstraction layers,
and explicit ownership of shared state. Record a representative follow-up
feature edit's touched modules and test setup burden; do not claim time savings
or performance gains from reduced file lengths alone.

**Exit:** all scoped modules migrated, required checks pass, every temporary
compatibility path removed, and remaining out-of-scope findings recorded. Move
lasting guidance into the permanent docs and retire this working plan according
to the development guide after completion.

## Verification and acceptance

Run from the repository root. These are future implementation commands, not
results from the planning task. Re-resolve moved paths/test names after each
slice. Run heavy checks serially; use an isolated local checkout and fixtures.

Initial focused checks for steps 1–3:

```bash
pnpm --dir backend test --runInBand changelog
pnpm --dir frontend test:unit --run apiAvailability ChangelogList ChangelogBanner NewsAdminView accountExport privacy
pnpm --dir backend test --runInBand websocketAccess applicationWebSocket serverShutdown terminalSessionAuthorization pvpPolling apiNotFound frontendAssets errorHandler integrationSecurityContract hookDeliveryContract productionReviewRegression
```

These existing suites are starting points, not substitutes for the new composed
path and lifecycle cases described above. In particular, source-string tests
and mocked-auth handler tests do not prove end-to-end authorization or startup.

For every affected backend slice:

```bash
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend build
```

For every affected frontend slice:

```bash
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend build
```

Run both groups for cross-package changes. Database/MUD-write changes, including
moving classified statements, also require:

```bash
pnpm --dir backend verify:mud-writes
```

Use the matching owner manifest as described in the development guide; do not
operate or modify the MUD repository. Run applicable native suites with their
explicit isolated fixture settings. At closure run the full backend and frontend
suites once on the final revision with required isolated dependencies:

```bash
pnpm --dir backend test --runInBand
pnpm --dir frontend test:unit --run
git diff --check
```

Also exercise the affected browser journeys against the local built application:
public news/changelog, sign-in/out, forum read/post/search, authorized admin
reads and denied access, builder reads, and application WebSocket
connect/reconnect/stop. Mutating journeys use synthetic owned data; stub MUD,
terminal, deployment and provider boundaries. Record what those stubs do not
qualify. Compare routes and response semantics, not only screenshots or builds.

Report every verification command, result and skip. A green unit suite with
native tests skipped is not native qualification. Package gates are necessary
for source changes; they are not required merely to add this Markdown plan.

## Delivery and rollback

The default order is 0 → 1 → 2 → 3 → 4 → 5 → 6. Frontend feature moves in step 5
can accompany their backend group after step 1, but one agent/change should own
each shared entry/client file at a time. This plan does not require parallel
agents, simultaneous builds, or production workload.

Each PR must be independently buildable and behavior-compatible. Separate pure
moves from logic repairs in reviewable commits. Revert an unshipped slice normally;
for an authorized release use the existing deployment/recovery procedure and
the recorded last verified artifacts. There is no schema migration to undo.
Rollback must not duplicate jobs or revive a legacy monitor. Compatibility
between old/new frontend and backend builds follows from preserved wire formats
and must be checked, not assumed from a successful TypeScript build.

Deployment, if later requested, follows the deployment skill and existing
production ingress. Never build directly into a live served `frontend/dist`
as a validation step. Run the news-update workflow for that release: prepare
reader-visible notes when warranted, publish only after live verification, and
verify their public rendering. If the release is purely internal restructuring,
record why no new Website Changelog entry is needed. This planning-only change
has no reader-visible website behavior and needs no published entry.

## Planning validation

This document is based on read-only source, test, configuration and guide
inspection at the baseline above. No application, database, MUD, browser journey,
package test/build, or deployment was run while preparing it. Completed checks:

- `git diff --check`: passed for tracked changes.
- `git diff --no-index --check /dev/null docs/ongoing-projects/2026-11-10-backend-api-structure-plan.md`:
  passed for this new, untracked document.
- PowerShell relative-link and Markdown-fence inspection: all 12 relative links
  resolve; all six code blocks have balanced fences.

A follow-up read-only review at `460edf8` rechecked the plan against the source
with `git grep`, `wc -l`, and a key count of `backend/mud-write-allowlist.json`.
The five file lengths were unchanged; the only non-plan change since the
baseline is `frontend/src/content/clientChangelog.json`. That review added the
import-chain, mount-order, allowlist-key, source-reading-test, frontend-caller,
and moved-path-citation evidence and the step instructions that depend on it.
No test, build, or application was run.

Implementation acceptance is tracked per slice in the progress log below.

## Progress log

Each slice is one branch/PR, stacked on the previous one until merged. A new
session continues from the last row: check its PR state, rebase the stack if a
base merged, then start the next step. Branch names follow `refactor/<slice>`.

### Step 1 — shared client and changelog pilot (branch `refactor/changelog-feature`)

Stacked on `refactor/frontend-http-client` (step 1.1). Done:

- 1.1 `frontend/src/services/httpClient.ts` owns the one Axios instance,
  `getCsrfToken`, and both interceptors; `api.ts` imports it and re-exports
  `apiClient`/`getCsrfToken` for the ~25 remaining raw-client callers (step 5).
  `hooksApi`, `privacy`, `accountExport` and their spec mocks use it directly.
  New test in `apiAvailability.spec.ts`: same instance via both paths,
  credentials/timeout defaults, CSRF only on mutations.
- 1.2 Backend changelog is `backend/src/features/changelog/{routes,service,
  validation}.ts` with named export `changelogRouter`; old route/service files
  are deleted. Tests moved to `features/changelog/__tests__/` and renamed
  `changelogRoute*`/`changelogService*` to keep both scopes. New
  `changelogRouteAuth.test.ts` runs the real auth middleware with synthetic
  sessions (anonymous read, 401/403 writes with no mutation, authorized create).
  `frontend/src/features/changelog/api.ts` owns `changelogApi`; its four callers
  and two spec mocks moved, so **no forwarding export was kept** (no caller
  needed one). Adapter test `features/changelog/__tests__/api.spec.ts` pins all
  eight endpoints, bodies and CSRF. Docs repointed: `docs/api/README_api.md`,
  `docs/privacy-data-lifecycle.md`, news-update `publishing.md`.

Verification (local, no `.env` files; frontend build used the CI placeholder
`VITE_*`/`FRONTEND_*` values from `.github/workflows/painted-map-validation.yml`):
baseline `pnpm --dir backend test --runInBand changelog` 6 suites/27 tests
passed before the move, 7/30 after; frontend full unit suite 93 files/753
tests passed; format:check, lint, type-check and build passed for both packages.
Not covered: the full app mount (no `createApp` until step 3) and a browser
journey; the composed auth test mounts only the changelog router.

### Step 2 — broadcasts out of the entry point (branch `refactor/realtime-broadcasts`)

Stacked on `refactor/changelog-feature`. Done:

- `backend/src/realtime/broadcasts.ts` owns every former `index.ts` broadcast
  (bodies unchanged), `broadcastToPermission`, the anonymous forum principal,
  and the single server binding. `index.ts` calls `attachBroadcastServer(wss)`
  after creating the server and `detachBroadcastServer()` after
  `closeWebServer`, so delivery during close is unchanged.
  `broadcastFragUpdate` is now exported (its only caller is still `index.ts`).
  `broadcastWholist` still has no production caller; it moved as-is.
- `realtime/clientState.ts` types the three fields broadcasters read
  (`wsPrincipal`, `playerEventsSubscribed`, `wholistSubscribed`); every `as any`
  access to those fields in `index.ts` now uses `clientState(ws)`. Other socket
  fields (`terminalAuth`, rate-limit counters, log subscriptions) are step 3.2.
- forum/auction routes, `crashDetectionService`, `mudConnectionLogSync` and the
  five test mocks now target `realtime/broadcasts.js`. No production module
  imports `index.ts`; crash monitoring and connection-log sync remain unstarted.
- `eslint.config.js` restricts `../index.js` / `../../index.js` imports below
  `src/` (hooks/types excluded, they have their own `index.ts`). Dynamic imports
  and `jest.unstable_mockModule` strings are not covered by the rule.
- Tests: new `realtime/__tests__/broadcasts.test.ts` drives synthetic sockets
  (no-server/detached no-op, open-only delivery, permission broadcasts,
  subscription + permission-or-level-57 for player events/wholist, account
  targeting, forum category access with the anonymous principal). It replaces
  the `websocketAccess` source-string assertion on the broadcast bodies; the
  subscription-handler assertions still read `index.ts`.
  `applicationWebSocket` now also checks `realtime/broadcasts.ts` uses
  `sendApplicationMessage`.

Verification: `pnpm --dir backend test --runInBand broadcasts websocketAccess
applicationWebSocket mudConnectionLogSync userProfilePrivacy forumSearchNative
postImageRemovalNative auction forum crashDetection serverShutdown
hookDeliveryContract productionReviewRegression` — 13 suites passed, 2 native
suites skipped (no isolated DB). `userProfileSchemaIntegration` needs a native
test database and fails with `Access denied` both before and after this change
(no `backend/.env.test` in this checkout) — **not qualified**. format:check,
lint, type-check, build passed.

### Step 3.1 — `createApp` (branch `refactor/create-app`)

Stacked on `refactor/realtime-broadcasts`. Done:

- `backend/src/app.ts` exports `createApp()`: the former `index.ts` block from
  `trust proxy` through `errorHandler`, moved verbatim (same middleware, mount,
  OG-metadata and static-fallback order). It reads configuration when called and
  installs no listener, job, integration or signal handler.
- `index.ts` calls `createApp()` and then performs the hook-state setup
  (`setMudHookStateProvider` + initial `refreshHookState`) at the same point in
  module evaluation as before; that is startup work, so it stayed out of
  `app.ts`. Package entry is still `node dist/index.js`.
- Source-reading assertions moved deliberately: `apiNotFound`, `frontendAssets`
  and the battle-metadata case in `productionReviewRegression` now read
  `app.ts`; WebSocket/terminal assertions still read `index.ts`.
- New `src/__tests__/createApp.test.ts` imports the real composition (DB, Redis,
  session/account/permission lookups and changelog persistence stubbed from
  their own export lists) and proves: no SIGINT/SIGTERM handler added, ping,
  JSON API 404, and the mounted changelog path through CSRF and real auth
  (CSRF 403, 401, 403, then 201 for `manage_news`). This closes the step 1
  "full app mount" gap.
- Docs: `docs/api/README_api.md`, `docs/ARCHITECTURE.md`, `docs/docs-audit.md`.

Verification: `pnpm --dir backend test --runInBand createApp apiNotFound
frontendAssets errorHandler integrationSecurityContract hookDeliveryContract
productionReviewRegression applicationWebSocket websocketAccess serverShutdown
changelog` — 17 suites / 144 tests passed; format:check, lint, type-check,
build passed. Note: use `pnpm exec biome`, matching `format:check`.

### Step 3.2 — application socket (branch `refactor/application-socket`)

Stacked on `refactor/create-app`. Done:

- `realtime/applicationSocket.ts` exports `handleApplicationConnection`
  (`wss.on('connection', handleApplicationConnection)` in `index.ts`): per-socket
  state init, cookie principal hydration, 20-msg/s burst limit, JSON parse,
  ping, dispatch, close cleanup, welcome message. The former `if` chain became a
  lookup table; message types are disjoint and the lookup requires a string
  `type`, so `===` semantics are unchanged.
- Handler families, bodies moved verbatim: `subscriptionHandlers.ts`
  (player events / WHO list), `logStreamHandlers.ts` (+ `clearLogSubscriptions`),
  `terminalHandlers.ts` (+ `ensureTerminalOperation`, `closeTerminal`),
  `zoneStreamHandlers.ts` (owns the per-connection stream limiter,
  `clearZoneStreams`), `deployHandler.ts`. Shared verification lives in
  `socketAuth.ts` (`verifyWebSocketAuth`, `hydrateWebSocketPrincipal`,
  `authorizeZoneStream`).
- `clientState.ts` now types every per-socket field (`messageCount`,
  `lastReset`, `logSubscriptions`, `terminalAuth` too); no `as any` socket access
  remains. `ClientMessage` documents the parsed JSON shape and states that it
  validates nothing (same assumptions as the former implicit `any`).
- Source assertions repointed: `websocketAccess` → `subscriptionHandlers.ts`,
  `hookDeliveryContract` terminal check → `terminalHandlers.ts`,
  `applicationWebSocket` producer list → the realtime files (and asserts the
  connection wiring in `index.ts`).
- New `realtime/__tests__/applicationSocket.test.ts` drives synthetic sockets
  with real token verification and stubbed services: welcome/ping/bad JSON/
  non-string type, rate limit, level-57 subscription, `terminal_access` before
  terminal creation, overlord-only deploy (no deploy call), close releasing log
  watchers, terminal ownership and session. No terminal/deploy action is real.
- `src/test/stubModule.ts`: shared helper (now used by `createApp` and this
  test) that stubs every runtime export from a module's source and rejects
  unexpected calls.

Verification: `pnpm --dir backend test --runInBand applicationSocket createApp
websocketAccess applicationWebSocket hookDeliveryContract
terminalSessionAuthorization broadcasts serverShutdown` passed (6 suites/84
tests plus 9 new). Full `pnpm --dir backend test --runInBand`: 153 suites
passed, 12 skipped; 7 suites / 89 tests failed — `userProfileSchemaIntegration`,
`backupService`, `hookSettingsService`, `accountService`, `sessionService`,
`authSessionBinding`, `webSessionSchema` — **identical on `master`** (they need
a native MySQL test DB this checkout lacks). Jest also does not exit after the
run on `master` either (open handles); pre-existing, not investigated here.
format:check, lint, type-check, build passed.

### Step 3.3 — runtime lifetime (branch `refactor/runtime-lifecycle`)

Stacked on `refactor/application-socket`. Done:

- `index.ts` (now ~50 lines) composes the app, sets up hook state, installs
  signals once, launches once and decides exit. No routes, SQL, broadcasts or
  socket handlers remain in it.
- `runtime/startServer.ts`: watchdog, flatfile probe/monitor, DB/MUD DB checks,
  schema and session invariants, pool sampling, HTTP + application WebSocket
  server, background jobs, `listen`. It records each acquired resource in a
  `RuntimeResources` object as it goes and **throws** on failed dependency
  checks instead of calling `process.exit(1)`.
- `runtime/backgroundJobs.ts`: PvP poller (initial cursor = latest released
  battle), frag/Discord/socket-count/orphan-image intervals, guild sync, health
  monitoring, GeoIP, backup scheduler, MUD control/auction/player-event
  integrations, donation outbox, hook audit worker, notification/news
  broadcasters — cadences and feature gates unchanged; modules the old code
  loaded with `await import` still are. A second start throws; stop handles are
  registered before anything starts so a partial start stops only what started.
- `runtime/shutdown.ts`: `createShutdown(resources)` keeps the former order
  (watchdog → producers → log watchers → web server + broadcast detach →
  terminals → workers → flatfile monitor → pool sampling → presence Redis → DB
  → Redis), is memoized (repeat calls do nothing) and skips unacquired
  resources. `installSignalHandlers` registers SIGTERM/SIGINT/SIGUSR2 once.
- Backup scheduler now keeps its cron task: `stopHourlyBackupScheduler()`;
  schedule and work unchanged.
- Behavior changes, deliberate per this step: a failed start now releases what
  it acquired before `exit(1)` (bounded by a 2 s exit timer); the dead
  force-exit timer that followed `process.exit(0)` was removed; the pool
  session-sampling timer (already `unref`'d) is now cleared on shutdown.
- Tests: `runtime/__tests__/runtimeLifecycle.test.ts` (order + idempotence with
  a connected WebSocket peer closed 1000, unacquired resources skipped, signals
  installed once, DB-check failure stops before listening and shutdown
  releases only watchdog/flatfile), `runtime/__tests__/backgroundJobs.test.ts`
  (five intervals with unchanged cadences, duplicate start refused, every
  interval cleared, producers/workers stopped once, restart after stop),
  `services/__tests__/backupScheduler.test.ts` (scheduled once, synthetic cron
  stopped without any DB call). `applicationWebSocket` wiring assertion now
  reads `runtime/startServer.ts`.
- Docs: `docs/ARCHITECTURE.md`, `docs/api/README_api.md`, `docs/docs-audit.md`.

Verification: `pnpm --dir backend test --runInBand backgroundJobs
runtimeLifecycle backupScheduler createApp applicationSocket
applicationWebSocket websocketAccess serverShutdown
terminalSessionAuthorization pvpPolling apiNotFound frontendAssets errorHandler
integrationSecurityContract hookDeliveryContract productionReviewRegression
broadcasts changelog` — 24 suites / 178 tests passed; format:check, lint,
type-check, build passed. Not run: launching `node dist/index.js` (no local
`.env`/database), so real startup/shutdown against live dependencies is
unqualified here.

### Step 4a — admin route groups (branch `refactor/admin-settings-routes`)

Stacked on `refactor/runtime-lifecycle`. Done:

- `routes/admin.ts` is deleted. Its route blocks moved verbatim (only
  `router.` → the group's router name, import paths, and removal of unused
  imports) into 13 groups under `backend/src/features/admin/`:
  `communityRoutes` (forum settings/permissions/audit, category CRUD, ACL,
  archives), `analyticsRoutes` (analytics, boot time, WHO, connection cleanup),
  `logRoutes`, `connectionRoutes`, `mudRoutes` (dashboard, time, properties,
  level cap, timers), `wipeRoutes`, `healthRoutes` (AI analysis, crashes, server
  health, incidents + `INCIDENT_UPDATE_COLUMNS`), `accessRoutes` (permissions,
  roles, accounts), `backupRoutes` (backup, restore, uploads), `settingsRoutes`
  (web settings, logo/hero uploads), `discordRoutes`, `godRoutes`,
  `dupeRoutes` (god commands and duplicate-item actions stay separately
  identifiable with their gates).
- `features/admin/routes.ts` composes them in the former registration order
  with `adminRouter.use(group)` — path-less child routers, no router-level
  middleware or catch-all. Paths are disjoint across groups; specific-before-
  dynamic pairs (`/backup/failed` vs `/backup/:id`, `/ai-analysis/history`
  vs `/:id`) are inside one group in their original order.
- The 28 `routes/admin.ts` keys in `backend/mud-write-allowlist.json` now name
  `features/admin/wipeRoutes.ts` (25 DELETEs), `mudRoutes.ts` (level_cap,
  timers) and `analyticsRoutes.ts` (UPDATE ip_info, the connection cleanup);
  classification and SQL unchanged.
- Tests: `adminAccountPermissionIdValidation` moved to
  `features/admin/__tests__/` and mounts the composed router; source checks in
  `websocketAccess` (WHO route guard, now whitespace-insensitive) and
  `productionReviewRegression` (web-settings update route) read the owning
  group files. New `adminComposition.test.ts` (real auth, synthetic overlord):
  enumerates all 100+ registered admin routes and requires 401 for anonymous
  callers on each (only `GET /mud/time` was public and stays so), proves
  `/users`, `/git/*` and `/analytics/web/*` still pass through to later
  mounts, and that `DELETE /backup/failed` wins over `/backup/:id`.
- Deviation from "one group per commit": the groups were extracted from the
  original line ranges in one mechanical commit, because the old file could not
  be left half-composed without a temporary second admin mount.
- Docs: `docs/api/README_api.md` route-owner row.

Verification: `pnpm --dir backend verify:mud-writes` — 53 classified writes
verified; `pnpm --dir backend test --runInBand adminComposition
adminAccountPermissionIdValidation adminReadQueriesNative websocketAccess
productionReviewRegression createApp integrationSecurityContract
webAnalyticsValidation dataHoldNative` — 7 suites passed, 2 native suites
skipped (no isolated DB: `adminReadQueriesNative`, `dataHoldNative` are
**not qualified**); format:check, lint, type-check, build passed.

### Step 4b — forum route groups (branch `refactor/forum-routes`)

Stacked on `refactor/admin-settings-routes`. Done:

- `routes/forum.ts` is deleted; blocks moved verbatim into
  `backend/src/features/forum/`: `contentRoutes` (categories, threads, posts,
  latest/popular activity), `reactionPollRoutes`, `subscriptionRoutes`
  (subscriptions + notifications, including the pre-existing duplicate
  thread subscribe/unsubscribe pair, kept in order), `searchRoutes`,
  `moderationRoutes`, `profileRoutes` (user/character/guild profiles, avatar
  and banner uploads with their limiter, mentions), `imageRoutes` (post images
  with their limiter/upload config).
- `shared.ts` holds what several groups use: `ANONYMOUS_PERMISSIONS`,
  `getAuthorizedThread`, and the single `postLimiter` instance (threads, posts
  and poll votes still share one rate-limit budget).
- `features/forum/routes.ts` applies `optionalAuth` first, then mounts the
  groups. Cross-group paths are disjoint; order-sensitive pairs
  (`/users/me/*` vs `/users/:accountName/*`) stay within one group.
- `forumService.ts` was not split: no route group exposed a separate service
  responsibility during the move. No forum MUD-write keys exist.
- Tests: `userProfilePrivacy` / `userProfileSchemaIntegration` moved to
  `features/forum/__tests__/`; the two native service tests mount
  `forumRouter`. New `forumComposition.test.ts`: every forum write (40+) gives
  401 to anonymous callers (only the public `POST /characters/batch/accounts`
  lookup is exempt, as before) and `/users/me/avatar` still wins over
  `/users/:accountName/avatar`.
- The mover script also had to strip comments inside import lists; a historical
  command log in `docs/ongoing-projects/plan-issue-98.md` still names
  `src/routes/forum.ts` and is left as a record of what ran then.
- Docs: `docs/api/README_api.md` route-owner row.

Verification: `pnpm --dir backend test --runInBand forumComposition
userProfilePrivacy userProfileSchemaIntegration forumSearchNative
postImageRemovalNative forum poll imageRemoval broadcasts createApp` — 9 suites
passed, 2 native skipped; `userProfileSchemaIntegration` fails with the known
native-DB `Access denied` (same as `master`) — **not qualified**.
`verify:mud-writes` 53 verified; format:check, lint, type-check, build passed.

### Step 4c — builder route groups (branch `refactor/builder-routes`)

Stacked on `refactor/forum-routes`. Done:

- `routes/builder.ts` is deleted; blocks moved verbatim into
  `backend/src/features/builder/`: `zoneRoutes` (list/search/activity, zone
  map/header, next vnum, zone create/delete/clone, map positions — positions
  are zone map data, so no separate map file), `roomRoutes`, `mobRoutes`,
  `objectRoutes`, `resetFlagRoutes`, `streamExportRoutes` (counts, SSE stream,
  download; owns the `MUD_DIR`/`AREAS_DIR` constants), `validationRoutes`,
  `gitRoutes`, `settingsRoutes`, `accessRoutes` (zone access, info,
  permissions, account search), `collaborationRoutes` (builder notifications,
  proc requests, comments).
- `shared.ts`: `validateOptionalHtml`, `logBuilderActivity`, and the local
  `canAccessZone` / `canManagePermissions` helpers.
- `features/builder/routes.ts` applies `requireAuth` then
  `requirePermission('manage_zones')` before every group. All builder paths are
  pairwise disjoint, so group order cannot change matching. No builder
  MUD-write keys moved (the zone-metadata entry is not keyed to the route file).
- Tests: `builderChildIdValidation` moved to `features/builder/__tests__/`; new
  `builderComposition.test.ts` enumerates every builder route (50+) and
  requires 401 anonymous / 403 without `manage_zones`.
- Docs: `docs/api/README_api.md` route-owner row.

Verification: `pnpm --dir backend test --runInBand builderComposition
builderChildIdValidation zone builder` — 11 suites / 57 tests passed;
`verify:mud-writes` 53 verified; format:check, lint, type-check, build passed.
No game file or MUD process was touched.

### Step 5 — frontend feature APIs (branch `refactor/frontend-feature-apis`)

Stacked on `refactor/builder-routes` (independent of it in code; stacked to
keep this log linear). Done:

- `frontend/src/services/api.ts` is deleted. Each export moved verbatim to
  `frontend/src/features/<domain>/api.ts`: `site` (getSiteConfig), `pvp`,
  `news`, `auth`, `forum`, `admin` (adminApi, dupeApi + Dupe* types,
  userManagementApi, analyticsApi), `profile` (profile/character/guild), `frag`,
  `git`, `builder`, `wiki`, `guide` (guide + help suggestions), `notifications`,
  `auction`, `publicStats` (+ Faction* types); `changelog` moved in step 1.
- `adminApi` and `builderApi` are split by backend route group into
  `features/admin/{community,backup,settings,discord,mudControl}Api.ts` and
  `features/builder/{zone,room,mob,object,resetFlag,validation,git,settings,
  access,collaboration}Api.ts`, then recomposed by spread into the same
  `adminApi` / `builderApi` objects, so every caller and `adminApi.x(...)` call
  is unchanged. No method uses `this`; a spec pins the 53/58 method counts so
  a key collision cannot silently drop one.
- All ~130 consumers and 21 spec mocks were rewritten mechanically: each
  `@/services/api` import now names the owning module; each
  `vi.mock('@/services/api', …)` factory was split into one `vi.mock` per
  owning module with the same properties. The four default `pvpApi` imports
  are named imports; the default export is gone. Raw-client users import
  `apiClient` from `services/httpClient` (their endpoint calls were not moved:
  they are outside the slices touched here).
- No narrow lint rule was added for the retired path: the file no longer
  exists, so any import fails type-check.
- New `features/__tests__/featureApis.spec.ts`: method counts, PvP query
  encoding, axios `params`, multipart admin upload with CSRF.

Verification: `pnpm --dir frontend test:unit --run` — 94 files / 757 tests
passed (one new file, four new tests); format:check, lint, type-check passed;
build passed with the CI placeholder env.

Next: step 6 — closure: permanent docs (`docs/ARCHITECTURE.md`,
`docs/CONVENTIONS.md`, package READMEs) on where to add a route, job,
WebSocket handler, browser API call and tests; final full suites;
browser-journey status. Branch `refactor/structure-closure`.

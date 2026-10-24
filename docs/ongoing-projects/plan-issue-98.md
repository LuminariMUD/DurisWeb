# Issue 98 — off-server traffic readiness

Tracker: [DurisWeb #98](https://github.com/LuminariMUD/DurisWeb/issues/98).
Baseline: `592a2b60bbaaa0c8c811b95d00b262763f37bf47`.

## Outcome and boundaries

Implement and qualify all off-server tasks A1–A10 in focused PRs. Production
deployment, measurements and publication remain section B operator work. Do not
access production or modify/operate the separate MUD checkout.

The smallest A1 change is one in-process public-status snapshot with a five-second
lifetime and one shared refresh. Cache only projected status fields; read and
recheck delayed population for every response. Keep `/health` independent. No new
Redis keys, configuration or background polling are needed.

## Work and proof

- A1: implemented/isolated-tested on `branch/issue-98-status-snapshot`. Files: public status
  service/route, existing route tests, backend/API documentation and this plan.
  Proof: real Express route concurrency/expiry/failure/privacy tests, isolated
  before/after status traffic with child-process/resource observations, backend
  format/lint/type/build checks. No database writes or schema changes.
- A2: implemented/isolated-tested on `branch/issue-98-immutable-assets`, stacked on A1 PR #99.
  Outcome: fingerprinted frontend files get immutable origin caching without
  issuing an anonymous CSRF cookie. Non-goals: changing CDN settings, caching
  APIs/authenticated pages/maps, or deploying. Files: static middleware, backend
  wiring, HTTP tests and backend/deployment documentation. Proof: actual Express
  static/conditional/CSRF requests plus startup-order source coverage.
- A3: implemented/isolated-tested on `branch/issue-98-initial-download`, stacked
  on A2 PR #100. Files: Vite chunk groups, initial-download source tool and
  frontend/qualification documentation. Outcome: editor and full icon catalogs
  remain on consuming routes, with measured complete initial transfer. No new
  lazy-component wrappers, catalogs, dependencies or configuration are needed.
- A4: implemented/isolated-tested on `branch/issue-98-shell-precache`, stacked on
  A3 PR #101. Outcome: precache only the shell/home graph and required static
  assets; preserve offline shell, optional route use, updates and PvP NetworkOnly.
  Files: Vite precache graph/filter, update composable, focused regression and
  its virtual-module test plugin, frontend/qualification documentation.
- A5: implemented/isolated-tested on `branch/issue-98-websocket-bounds`, stacked on A4.
  Outcome: 10 KiB transport input, 256 admitted application peers, 30-second
  heartbeat with one missed reply allowed until the next tick, and a 1 MiB
  application output budget per peer. Files: application WebSocket factory/send
  guard, entry point, terminal/deployment output paths, focused native socket and
  authorization tests, backend/qualification docs. Proof: real isolated TCP
  payload/fragment/admission/dead-peer/slow-consumer/normal-traffic and shutdown
  checks. Separate MUD transport and production operations are non-goals.
- A6: implemented/isolated-tested on `branch/issue-98-reconnect-jitter`, stacked on A5 PR #103.
  Outcome: bounded exponential reconnect delay with jitter, reset after a stable
  connection; manual disconnect cancels retries and retired socket events cannot
  alter a newer connection. Files: application composable, focused timer/event
  tests and frontend/qualification docs. Proof: observable retry timing and
  generation races plus an isolated native-browser reconnect burst. The game
  transport is unchanged; no extra timer/configuration/backoff framework is needed.
- A7: in progress on `branch/issue-98-database-qualification`, stacked on A8
  PR #105. Outcome: representative native query plans/acquisition/query timing,
  bounded admission/deadline/overload experiments, and an evidence-based choice
  before changing the pool. Preserve strict pooled-session safeguards and pool
  size 10; no speculative index, hardware or pool increase. Use owned synthetic
  databases only. A7 and A9 reuse the source-owned owner/baseline fixture workflow.
- A8: implemented/isolated-tested on `branch/issue-98-api-pagination`, stacked on A6 PR #104.
  Outcome: public/admin changelog pagination uses established bounds (page
  1–10,000, limit 1–100, default 20), with complete decimal query values and
  service-level bounds; unmatched API paths return noncached JSON 404 ahead of
  static/SPA fallback. Files: routes/services, existing validation/error boundary,
  focused HTTP/service tests and API/qualification docs. Preserve authorization
  and ordinary history URLs; no general API/error-framework redesign is needed.
- A9: representative data/accounts/forum/PvP/socket/browser qualification.
  Include disconnect during terminal creation (SQL/PTY binding) and cleanup with
  delayed output writes; A5's terminal fixture covers established sessions, not
  that asynchronous creation race or a real privileged host terminal.
- A10: exact PR/commit/test handoff, deployment/rollback instructions and
  unpublished visitor-facing release wording for the qualified changes.

## Commands and evidence

Initial inspection: `git status --short --branch`, `git log -1 --format=oneline`,
`git worktree list`, `git fetch origin`, `git switch -c
branch/issue-98-status-snapshot origin/master`; targeted `cat`, `sed`, `rg` and
`rg --files` reads of repository/package guides, skills, configuration, source and
tests; `node --version` (`v24.15.0`), `pnpm --version` (`12.10.1`). Existing backend
and frontend dependencies are installed. This local checkout has no root/backend
`.env`; mocked route tests use repository-owned test defaults and no live target.

A1 commands/results:

- `pnpm --dir backend test --runInBand
  src/routes/__tests__/publicStatus.test.ts --testNamePattern=five.seconds`:
  failed before the fix because every request changed the sample timestamp.
- `pnpm --dir backend exec biome format --write
  src/services/publicStatusService.ts src/routes/status.ts
  src/routes/__tests__/publicStatus.test.ts`: changed-file formatting.
- `pnpm --dir backend test --runInBand
  src/routes/__tests__/publicStatus.test.ts
  src/routes/__tests__/publicStatistics.test.ts
  src/services/__tests__/healthService.test.ts
  src/services/__tests__/processMonitorSnapshot.test.ts`: **100 tests pass**.
  The first combined run exposed test scheduling assumptions; explicit barriers
  and waiting for response completion fixed those tests without changing policy.
- `pnpm --dir backend format:check`, `pnpm --dir backend lint`,
  `pnpm --dir backend type-check`, `pnpm --dir backend build`,
  `git diff --check`: pass.
- `backend/node_modules/.bin/biome format --write
  scripts/qualification/public-status-traffic.mjs`: benchmark-source formatting.
  Running Biome from backend against `../scripts` first hit its path-root panic;
  invoking the binary from repository root fixed that tooling invocation.
- `node --experimental-test-module-mocks
  scripts/qualification/public-status-traffic.mjs baseline
  592a2b60bbaaa0c8c811b95d00b262763f37bf47` and the same command with `candidate`:
  **140 successful HTTP responses each** (120 starts at 30/s plus a 20-request
  burst). Baseline/candidate p95: **100.79/8.46 ms**, parent CPU:
  **817.98/326.47 ms**, waited-child CPU: **1190/10 ms**, direct diagnostic
  subprocess starts: **280/2** (140/1 process scans and 140/1 disk shells).
  Neither completed run returned unavailable population. The initial harness
  wrongly required optional history always to be available; it now accepts and
  counts the route's valid unavailable state, covered separately by privacy tests.

The source-owned comparison compiles the original route from the pinned Git
revision and uses current unchanged diagnostic/population dependencies. It uses
real loopback HTTP, `ps`, `df` and host resource readings, with synthetic
SQL/cache/presence and an empty temporary MUD-directory fixture. It does not
operate a MUD process or model production data, network, CPU or capacity.
Experimental module mocking requires the documented Node flag.

An initial direct WSL invocation lacked pnpm on PATH; all package commands run
through the initialized login shell. No full backend suite, frontend checks,
database/migration tests or `verify:mud-writes` run for A1: it changes no frontend,
SQL write or schema. Section B remains unverified.

A1 PR: [#99](https://github.com/LuminariMUD/DurisWeb/pull/99), source commit
`47e6fc5e62f83bdc3f8cd375082d5fcc6e6691e2`; open/unmerged at handoff. The tracker
marks A1's off-server work complete, with deployment/live verification pending.

A2 uses the existing static server, narrowed to Vite's actual eight-character
fingerprint naming. A filename guard is sufficient; no manifest loader, cache
service, configuration toggle or frontend build change is needed. The ordinary
static/application path continues handling all other requests.

A2 commands/results:

- `pnpm --dir backend exec biome format --write src/index.ts
  src/middleware/frontendAssets.ts src/middleware/__tests__/frontendAssets.test.ts`:
  changed-file formatting.
- `pnpm --dir backend test --runInBand
  src/middleware/__tests__/frontendAssets.test.ts
  src/middleware/__tests__/canonicalHost.test.ts
  src/services/__tests__/integrationSecurityContract.test.ts`: **41 tests pass**,
  including 14 new tests using actual Express static responses, anonymous
  cookies, ETag/304/HEAD, unversioned HTML/workers, encoded traversal/missing
  assets, API/mutation CSRF, new release HTML/assets and production startup order.
  The initial two-suite run found invalid synthetic webmanifest JSON; using a
  valid fixture fixed that test without a runtime change.
- `pnpm --dir backend format:check`, `pnpm --dir backend lint`,
  `pnpm --dir backend type-check`, `pnpm --dir backend build`,
  `git diff --check`: pass.

No frontend source/build, database/MUD write or schema changes; frontend, full
backend/database suites and `verify:mud-writes` are not run for A2. Cloudflare
`HIT`/`Age`, installed artifacts, public hostnames and live acceptance remain B3.

A2 PR: [#100](https://github.com/LuminariMUD/DurisWeb/pull/100), source commit
`1986f72adadd804b3a5b243606764e989f136b41`. Merge #99 first, then retarget #100 to
master. Both were open, unmerged and mergeable when checked.

A3 source tracing found shared `PopperContent` importing floating-positioning
functions from the forced editor chunk. Rolldown groups recursively include
dependencies by default; the editor group consequently entered the shared
shell. The forced icon group also combined initial named imports with complete
catalogs used only by dynamic routes. Removing those two groups lets the existing
route imports determine their boundaries; full namespace imports remain intact.

A3 commands/results:

- Baseline and candidate `pnpm --dir frontend build` pass with this isolated
  public configuration (no credentials): `VITE_BASE_URL=/`,
  `VITE_API_URL=http://127.0.0.1:8138`, `VITE_WS_URL=ws://127.0.0.1:8138/ws`,
  `VITE_STATIC_URL=http://127.0.0.1:8138`, `FRONTEND_DEV_HOST=127.0.0.1`,
  `FRONTEND_DEV_PORT=5173`, `FRONTEND_PREVIEW_HOST=127.0.0.1`,
  `FRONTEND_PREVIEW_PORT=8138`, `FRONTEND_ALLOWED_HOSTS=localhost`.
- `node scripts/qualification/initial-download.mjs`: baseline/candidate
  **50/42** HTML-declared files (**47/39 JS**, one CSS and two fonts each),
  **2,254,248/1,003,266 raw bytes**, **672,375/322,332 gzip bytes**. The initial
  editor chunk (160,689 gzip bytes) and complete grouped icon catalogs disappear
  from HTML preloads. Home-route imports/images/APIs remain separately measured.
- `pnpm --dir frontend format:check`, `pnpm --dir frontend lint`,
  `pnpm --dir frontend type-check`, `pnpm --dir frontend test:unit --run`:
  pass; **556 tests / 72 files**. Build also runs type-check. Palette and
  configuration literal guards pass with `bash frontend/scripts/check-palette-literals.sh`
  and `bash scripts/check-config-literals.sh`.
- `backend/node_modules/.bin/biome format --write
  scripts/qualification/initial-download.mjs`, `node --check
  scripts/qualification/initial-download.mjs`, `git diff --check`: pass.
- Browser plugin not available; existing Python Playwright 1.58.0 with installed
  Chromium **153.0.8010.12** was used. Its default browser revision was absent;
  the explicit installed executable avoids any dependency/browser installation.
  Local fixture: `node /tmp/durisweb-issue98/browser-fixture.mjs`, loopback 8138,
  actual built assets and synthetic API/socket responses, no real account/data.
- `python3 /tmp/durisweb-issue98/browser-download.py baseline mobile`, then
  `candidate mobile`, then `candidate desktop`: pass. Viewports **390×844** and
  **1440×1000**. Mobile has 4× CPU, 100 ms latency and 200 KiB/s download limits.
  Baseline/candidate foreground encoded resources: **923,109/580,538 bytes**;
  transfer including resource headers: **944,409/601,538 bytes**; LCP:
  **5,992/3,980 ms**, CLS **0.022685/0.022685**. Candidate desktop LCP **224 ms**,
  CLS **0**. These are single local observations, not performance guarantees.
- Page identity, meaningful homepage, no framework overlay, clean console and
  network, pause/resume motion, named `dna` forum icon and actual rich-text input
  passed. Screenshots of desktop/mobile home/forum/editor were inspected. Private
  logs, resource lists and PNGs are under `/tmp/durisweb-issue98/`.

Initial browser attempts exposed fixture-only category wrappers/hidden duplicate
locators; matching the source API shapes and selecting visible content corrected
them. Blocking service-worker registration produced fixture-induced Workbox
errors. Final A3 contexts instead expose the supported no-service-worker browser
state and pass with no errors/warnings; A4 must separately test normal installation.
The optional editor chunk now exceeds Vite's 600 kB warning threshold (722 kB
raw), but is absent from the initial set and its real route works. The threshold
is not raised or the warning suppressed. Current precaching still includes
optional routes (**304 entries**); reducing that is A4, not an A3 claim.

A3 PR: [#101](https://github.com/LuminariMUD/DurisWeb/pull/101), source commit
`b0347181fe25391935ce5792e89fd3795a1bdc50`. Stack: #99 → #100 → #101.

A4 records a normal fresh-browser installation **before changing precaching**,
using the A3 build as its baseline. The generated chunk graph supplies shell and
homepage imports, CSS and asset references; the existing Workbox manifest is
filtered to that graph and install icons. Runtime cache policies and immediate
registration stay intact. No manually maintained chunk list, new cache manager
or registration timer is needed. Source tracing also found `dismissUpdate`
changing a local ref while the UI returned the registration ref; the fix uses
the actual ref and removes its unused local copies/copy helper (no callers).

A4 commands/results:

- `pnpm --dir frontend test:unit --run
  src/composables/__tests__/usePwaUpdate.spec.ts`: the dismissal regression fails
  before repair and all three tests pass afterward. The existing VitePWA plugin
  in Vitest supplies virtual-module resolution; before adding it, the test could
  not resolve `virtual:pwa-register/vue`.
- `pnpm --dir frontend exec biome format --write vite.config.ts vitest.config.ts
  src/composables/usePwaUpdate.ts src/composables/__tests__/usePwaUpdate.spec.ts`;
  frontend `format:check`, `lint`, `type-check`, `test:unit --run`, and `build`
  with the A3 synthetic environment: pass, **559 tests / 73 files**. The existing
  optional-editor size warning remains. Configuration-literal and diff checks pass.
- Generated precache: **304 → 77 entries**, **6489.47 → 1413.85 KiB raw**.
  Those are manifest measurements, distinct from the actual browser below.
- `python3 /tmp/durisweb-issue98/browser-install.py a4baseline` and `candidate`:
  normal Chromium 153 with service workers allowed, fresh contexts, viewport
  390×844, real built files/synthetic APIs on loopback 8138. Full request timing,
  status/size records and cache URL lists are saved as `a4-*-install.json` in the
  private evidence directory. Actual cached entries: **299 → 72**; worker-owned
  requests: **302 → 75**; worker response-body bytes: **2,032,518 → 10,180**.
  The new install reuses shell files already fetched by the page. These counts
  include browser HTTP-cache reuse, not just manifest sizes or a production CDN.
- All HTML-declared initial JS/CSS/font files are present in the real precache.
  Optional editor/forum/game entry chunks are absent from installation. The
  optional editor loads and accepts input when visited, then its actual JS is
  available from the runtime cache offline. Offline reload renders the same
  explicit unavailable/offline shell as the baseline; live API data remains
  unavailable. A previously successful PvP request fails offline rather than
  replaying a cached response. Online consoles are clean; deliberate offline
  API/socket failures are retained separately as expected network errors.
- `python3 /tmp/durisweb-issue98/browser-update.py`: actual A3 worker → candidate
  upgrade passes, including the existing update-now action and new shell.
  The old large precache is cleaned (74 total entries including runtime cache).
  A private next-worker copy changes only a comment to trigger another real
  waiting-worker event. The new client shows the notice, dismisses it without
  activating that worker, rediscovers it on reload and applies it through the UI.
  No console errors. Actual offline/prompt screenshots were inspected.

The first offline locator used a straight-space phrase rather than the actual
apostrophe-containing UI text; correcting the fixture locator resolved it. All
browser scripts, generated copies, JSON/waterfalls and screenshots remain outside
Git under `/tmp/durisweb-issue98/`. No production, native mobile device, live API,
backend or database qualification is claimed for A4.

A4 PR: [#102](https://github.com/LuminariMUD/DurisWeb/pull/102), source commit
`0de77161e62200bd0a205b576cc66cda96061f2b`. Stack: #99 → #100 → #101 → #102.

A5 keeps one application socket factory and one send guard. All entry-point,
terminal and deployment producers use that guard, including control-frame pong
responses. No per-IP inventory, new environment setting or write-queue subsystem
is introduced. The existing two close handlers are consolidated so established
terminal cleanup runs once; subscriptions/stream reservations clear before its
asynchronous work. Authorization predicates stay ahead of delivery. The separate
MUD client and transport are unchanged. New transport errors log a fixed category.

A5 commands/results:

- `pnpm --dir backend exec biome format --write
  src/utils/applicationWebSocket.ts src/utils/__tests__/applicationWebSocket.test.ts
  src/utils/__tests__/websocketAccess.test.ts src/index.ts
  src/services/terminalService.ts src/services/deploymentService.ts` and formatting
  of the extended terminal authorization fixture: pass.
- `pnpm --dir backend test --runInBand
  src/utils/__tests__/applicationWebSocket.test.ts
  src/utils/__tests__/websocketAccess.test.ts
  src/utils/__tests__/serverShutdown.test.ts
  src/services/__tests__/terminalSessionAuthorization.test.ts
  src/middleware/__tests__/terminalToken.test.ts
  src/services/__tests__/integrationSecurityContract.test.ts`: **39 tests pass**.
  Real loopback TCP verifies exact 10 KiB multibyte input, single/fragmented/UTF-8
  oversize rejection before application delivery, normal protocol ping/pong,
  256 accepted peers plus HTTP 503 rejection, released-slot reuse, responsive/dead
  heartbeats, paused slow consumers, excessive output and shutdown timer cleanup.
  Existing shutdown checks include a non-reading peer. Focused capability,
  permission/source-wiring and PTY-mocked terminal fixtures preserve access rules
  and verify normal output through the guard and refusal at its output bound.
- The initial admission fixture incorrectly assumed concurrent client-open order
  matched server Set order; waiting for the actually released peer corrected its
  timeout. Type-check found a circular inferred cleanup-fixture type; an explicit
  minimal cleanup shape fixed it. Neither correction relaxes the limits.
- Backend `format:check`, `lint`, `type-check`, `build` and `git diff --check`:
  pass. No frontend/runtime database or real MUD/terminal operation runs in A5.
- `pnpm --dir backend verify:mud-writes`: pass, **53 classified writes**;
  source/manifest inspection only, with no MUD operation or new SQL write.

The native socket suite exercises the actual factory/transport; it does not boot
the full application listener or prove a live JWT/database/PTY journey. Those
combined-data/application checks remain A9, and all deployment/live evidence
remains section B. No production flood or oversized-payload demonstration occurs.

A5 PR: [#103](https://github.com/LuminariMUD/DurisWeb/pull/103), source commit
`b2bf32254f35cd954ddad9482a782735c4a5a381`. Its tracker checkbox remains open for
combined application/auth/terminal proof under A9, while the transport/source PR
is ready for review. Stack: #99 → #100 → #101 → #102 → #103.

A6 replaces the shared intentional-close flag with explicit desired state and a
socket generation. Only the current generation can update connection/message
state. One retry timer uses equal jitter with 5/10/20/30-second ceilings and a
bounded attempt counter. A monotonic open timestamp supplies the stable reset
when the next retry is needed; no second timer or backoff service is introduced.

A6 commands/results:

- `pnpm --dir frontend test:unit --run
  src/composables/__tests__/useWebSocket.spec.ts`: all **seven regressions fail
  on the parent** and pass after repair. Coverage includes growing/capped jitter,
  stable reset, manual cancellation/reset, late close/message events, repeated
  closes/single pending connection, and synchronous-construction retry.
- `pnpm --dir frontend exec biome format --write
  src/composables/useWebSocket.ts src/composables/__tests__/useWebSocket.spec.ts`;
  frontend `format:check`, `lint`, `type-check`, `test:unit --run`, and `build`
  with the A3 synthetic environment: pass, **566 tests / 74 files**. Generated
  shell precaching remains 77 entries; optional editor warning remains. The
  configuration literal guard and `git diff --check` pass.
- `node /tmp/durisweb-issue98/reconnect-fixture.mjs` and
  `python3 /tmp/durisweb-issue98/browser-reconnect.py baseline`, then `candidate`:
  actual Chromium 153 and the built A5 application socket factory on isolated
  loopback 8140. Each run imports 100 independent copies of the actual application
  composable (only Vue/config import locations adapted), then closes those 100
  sockets together and observes all 100 reconnecting. No API/account or MUD work.
- Instrumented, unchanged native timeout calls show the baseline scheduling all
  100 retries at **5000 ms** (one 250-ms bucket). The candidate schedules
  **2533.28–4993.74 ms**, spanning **ten** 250-ms buckets. Native server arrival
  ranges are **5006.02–9969.60 ms** baseline and **2545.33–5006.99 ms** candidate.
  Browser connection throttling makes arrival spread alone an unsuitable proof
  of the timer policy; both scheduling and actual connections are retained in
  `a6-*-burst.json`. No console errors. These are single local observations, not
  production connection-rate or visitor-capacity guarantees.

The first burst fixture used an asynchronous wait predicate that returned before
the actual arrival condition; explicit bounded stats polling fixed that test.
All private fixture scripts/results remain in `/tmp/durisweb-issue98/`. Normal
subscription callback delivery and stale-event refusal are covered by the
composable fixture; full combined backend/auth/browser proof remains A9.

A6 PR: [#104](https://github.com/LuminariMUD/DurisWeb/pull/104), source commit
`6649edb0cc32b714963b2119bbd23e521caf58d6`. Stack: #99 → #100 → #101 → #102 →
#103 → #104. A8 is implemented next so the combined fixture includes correct API
fallback behavior before the shared A7/A9 database/application qualification.

A8 reuses `parsePagination` without changing other route contracts. A small
changelog-only query validator rejects partial/negative/array values before list
work; the service also bounds internal numeric callers before offset arithmetic.
The API not-found handler belongs beside the existing error boundary and sends a
fixed no-store JSON reply, avoiding request/query reflection and the SPA fallback.

A8 commands/results:

- `pnpm --dir backend test --runInBand
  src/routes/__tests__/changelogPagination.test.ts
  src/services/__tests__/changelogVisibility.test.ts`: **12 regressions fail on
  parent** (unbounded list/offset, accepted malformed inputs and zero fallback).
- `pnpm --dir backend exec biome format --write src/routes/changelog.ts
  src/services/changelogService.ts src/middleware/errorHandler.ts src/index.ts
  src/routes/__tests__/changelogPagination.test.ts
  src/services/__tests__/changelogVisibility.test.ts
  src/middleware/__tests__/apiNotFound.test.ts`: changed-file formatting.
- `pnpm --dir backend test --runInBand` with the two pagination/visibility files
  above plus `src/routes/__tests__/changelogVisibility.test.ts`,
  `changelogFields.test.ts`, `changelogValidation.test.ts`,
  `src/services/__tests__/changelogContent.test.ts` and
  `src/middleware/__tests__/apiNotFound.test.ts`: **35 tests pass**. Actual Express
  requests cover both list paths, visibility/auth/permission ordering, malformed
  and excessive values, API prefixes/case/HEAD, CSRF precedence, static files
  hidden behind `/api`, normal history URLs and startup placement. Service SQL
  parameters cap at limit 100/offset 999900 for extreme internal callers.
- Backend `format:check`, `lint`, `type-check`, `build`, `verify:mud-writes`
  (**53 classified writes**) and `git diff --check`: pass. Type-check first found
  an invalid ordinary-player immortal-level value in the new fixture; using the
  actual `null` domain value corrected the fixture. No query/schema/MUD write is
  added; frontend and native database suites are not run for this focused change.
- The final format check caught indentation introduced by that fixture correction
  after the feature commit was pushed. A formatting-only follow-up and rerun of
  backend format/lint/diff checks pass before PR creation; history is preserved.

The isolated route tests use synthetic identity/service data; full application
and representative native-data proof remains A7/A9. No deployment, changelog
publication or production access occurs.

A8 PR: [#105](https://github.com/LuminariMUD/DurisWeb/pull/105), source commits
`464cbc9` and formatting follow-up `4cfcc0aea354b072060998e40f2ce35bea5357b4`.
Stack: #99 → #100 → #101 → #102 → #103 → #104 → #105.

## A7/A9 isolated fixture preparation

New task-owned Docker resources (label `durisweb.issue=98`) use dedicated network
`durisweb-issue98`, with loopback-only published ports: MySQL 8.0.46 on 23436,
MariaDB 11.8 on 23437 and Redis 7.4.7 on 23479. Existing dev/other containers and
ports 3306/3307/13306/16379 are untouched. SQL fixtures have 1 GiB/two-CPU limits;
Redis has 256 MiB. Only these synthetic, anonymous-volume fixtures are disposable.

The first dedicated network was internal and Docker did not publish its requested
ports. Inspecting HostConfig versus NetworkSettings proved that state; only the
three newly created empty task containers/network were recreated on a dedicated
bridge. A direct CLI diagnostic also misparsed an attached host option; its
verified task process was terminated. All schema writes use explicit Node
connection objects restricted to the owned port/name pairs.

The metadata guard correctly refused an initial MariaDB 10.11 fixture: the actual
website schema-family source accepts MySQL 8 and MariaDB 11.8. Only the new empty
MariaDB fixture was replaced with the already-installed 11.8 image; no metadata
check or source pin was weakened. MySQL's completed fixture was preserved.

Owner inputs were fetched read-only from Duris commit
`6d4d71e56547c71898247e73ccca74da75e0a9f6` into the private
`/tmp/durisweb-issue98/owner/` directory. The existing source helper verifies its
three pinned digests plus all 43 immutable apply-file checksums before execution.
No MUD repository command, source change, server or player data is used.

`pnpm --dir backend exec node --import tsx
/tmp/durisweb-issue98/provision.mjs` initially provisioned MySQL and stopped on
the unsupported MariaDB family. The explicit `... provision.mjs 23437` continuation
provisioned the supported replacement. Both databases have **280 tables** after
the owner schema, explicit lifecycle metadata, website baseline and real forward
migrations. Their owner metadata remains unchanged before/after website setup:

- 23436: `durisweb_qualification_issue98_23436`, owner head
  `0043_news_acknowledgement`, fingerprint
  `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`.
- 23437: `durisweb_qualification_issue98_23437`, same owner head, fingerprint
  `995f0c9f1a726dc25e3ce1104627ebff02e0414e7d2e48595f94de7ce3b0e8e2`.

Preparation commands include read-only `docker image ls`, `docker ps`, selected
`docker inspect`/network properties, `free -m`, readiness SELECT/version checks,
Redis PING, and pinned-file `sha256sum`; owned network/container create/stop
commands are retained in the execution transcript. New resource ownership was
verified before replacing failed empty fixtures. No production mutation occurs.

The larger synthetic dataset now contains **1,000 accounts/characters**, **50,001
PvP events** (one future-hidden), **200,000 participant snapshots**, **500 forum
threads**, **20,000 posts** and **500 changelog entries** on each engine. The
private `seed.mjs` refuses nonempty target stores and commits synthetic rows in a
transaction. Database-scoped fixture app users have private mode-0600 config
files outside Git; the normal application receives no fixture-root credential.
Installed bcrypt and native PTY modules import successfully. No real account,
credential or player data is copied.

## A7 PvP query work

Initial profiling of the actual full visibility/participant statement measured
recent reads at **475.58/466.50 ms** first/warm on MySQL 8.0.46 and
**316.58/316.47 ms** on MariaDB 11.8.9. MySQL EXPLAIN estimates about 50,000 outer
events, plus participant joins, temporary work and filesort before LIMIT. The new
native optimizer regression fails on parent with **50,001** outer estimated
events for a 50-row page. The fix selects the fully filtered/ordered event page
inside a derived table before joining/grouping its complete snapshots. Counts
and release predicates remain separate/unchanged; no new index, cache or pool
limit is introduced.

The same private profiler afterward observes **38.34/24.37 ms** first/warm MySQL
and **13.13/10.20 ms** MariaDB for recent lists; likes ordering is
**24.64/11.54 ms** respectively. Participant-filter reads remain about
**145/125 ms** and are not claimed uniformly faster. These are individual local
observations on capped fixture containers. The script's initial `cold` label
means a first application/settings-cache call, not a proved cold InnoDB buffer
pool. Baseline captures were preserved as `a7-baseline-profile-*.json`; candidate
results/full plans are `a7-profile-*.json`, outside Git.

The representative forum search with an author filter fails with
`ER_PARSE_ERROR` on both engines. That is a demonstrated existing defect to repair
as a separate focused change before the combined A9 search qualification; it is
not omitted from the result. A7 acquisition/overload experiments and A9's
auth/terminal/cold-cache/longer observation still remain open.

PvP query commands/results:

- `pnpm --dir backend exec node --import tsx
  /tmp/durisweb-issue98/profile.mjs 23436` and `23437`: actual source service
  calls, real SQL/cache, full statement EXPLAIN and unchanged pooled invariants.
- `node /tmp/durisweb-issue98/run-test.mjs <23436|23437>
  src/services/__tests__/pvpTrafficNative.test.ts`: **four native cases pass
  on each engine**. The source-owned fixture installs the verified full owner,
  baseline/forward schema, seeds/analyzes 50,001/200,000 rows, checks unchanged
  owner metadata and removes only its new PID-qualified database. It proves
  page/participant/likes/release semantics, ascending/newest cursors and outer
  optimizer cardinality bounded to the selected page. Default unit runs skip
  these cases; selected ports/input checks fail closed.
- The same private runner with `src/services/__tests__/pvpService.test.ts`
  explicitly sets its existing `TEST_PVP_DB_PORT` opt-in: **43 tests pass on each
  engine**, including capture/privacy, complete-team filters, date/level/race/
  class/alignment behavior, hidden-event refusal, cursor ordering and full-history
  counts. The normal three-file PvP service/poller/route run passes **66 tests**,
  with 33 native cases skipped there and separately run above.
- Backend format/lint/types/build and `verify:mud-writes` (**53 classified
  writes**) pass. Type-check required treating overloaded spy calls as unknown
  and validating captured SQL/bindings before EXPLAIN; no unsafe cast or `any`
  was introduced. `git diff --check` passes. No frontend change or full backend
  suite is included in this focused SQL chunk.

## Unpublished release news

Prepare the combined payload as reader-visible changes are proven. Reconcile it
with existing production entries/drafts during the separately authorized release;
this off-server run does not publish or write a database draft.

A1 candidate public wording (unpublished):

```html
<h3>Website status</h3>
<ul><li>The status page reuses a recent status sample during repeated visits,
while showing when that sample was last updated. Unavailable status stays
explicit, and the delayed population estimate keeps its existing privacy rules.</li></ul>
```

A2 candidate public wording (unpublished):

```html
<h3>Website loading</h3>
<ul><li>Versioned website files can stay cached between visits, while pages
and update checks continue to pick up new releases.</li></ul>
```

A3 candidate public wording (unpublished):

```html
<ul><li>Opening the website downloads less shared code. Rich-text editing and
the full forum/game icon selections remain available where they are used.</li></ul>
```

A4 candidate public wording (unpublished):

```html
<ul><li>Installing the website downloads its core pages first, with optional
tools loaded when opened. The offline notice and update controls remain
available, and dismissing an update notice now works.</li></ul>
```

A5 candidate public wording (unpublished):

```html
<h3>Live connections</h3>
<ul><li>Website live connections now limit oversized messages and stop stalled
connections from building up output. Busy servers can ask new connections to
retry; normal notification and administration permissions are unchanged.</li></ul>
```

A6 candidate public wording (unpublished):

```html
<ul><li>Website live connections spread retry attempts after an interruption
and back off during repeated failures. Closing a connection explicitly cancels
its retries.</li></ul>
```

A8 candidate public wording (unpublished):

```html
<ul><li>Website Changelog lists now enforce bounded page sizes. Invalid API
addresses return a clear API error while ordinary website links keep working.</li></ul>
```

PvP query candidate public wording (unpublished):

```html
<h3>PvP history</h3>
<ul><li>Battle lists do less work when browsing a long history, while retaining
the same event order, complete teams and privacy rules.</li></ul>
```

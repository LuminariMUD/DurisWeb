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
- A5: transport payload, heartbeat, admission and backpressure bounds.
- A6: jittered reconnect delay with stable-connection reset.
- A7: representative isolated query/pool overload qualification before tuning.
- A8: bounded changelog pagination and JSON API 404s.
- A9: representative data/accounts/forum/PvP/socket/browser qualification.
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

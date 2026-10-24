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
- A2: fingerprinted static asset caching and middleware-order/HTTP proof.
- A3: initial import graph and complete mobile download measurements.
- A4: fresh-browser service-worker waterfall and bounded precaching.
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

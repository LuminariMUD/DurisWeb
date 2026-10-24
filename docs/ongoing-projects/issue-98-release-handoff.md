# Issue 98 — off-server release handoff

Prepared 2026-10-24 for [#98](https://github.com/LuminariMUD/DurisWeb/issues/98).
Integration updated 2026-10-25: the implementation PRs through #112 have merged
into master, and #113 supplies this handoff. Review repairs are recorded below.
Historical qualification retains its stated limits; the corrected soak tool
still needs a full observation for its stronger completion checks. Production
access, deployment, migration, MUD operation and news publication remain outside
this merge task. Section B stays open for operator acceptance.
The [working record](plan-issue-98.md) contains exact commands, per-change
before/after evidence, failed regressions, fixture provenance and limitations.

## Candidate and review order

The historical qualification baseline is
`592a2b60bbaaa0c8c811b95d00b262763f37bf47`. Before #113, integrated master is
`cfbcc61c789a19056fd791b2eeaefb669cdfc411`. The original implementation heads
below provide provenance; they are not a current deployment pin. The oldest-first
integration also includes #91–#97 and #106/#108, whose release requirements and
drafts must be reconciled separately. Children were retargeted to master after
their predecessors merged, with merge commits and no history rewriting.

1. [#99](https://github.com/LuminariMUD/DurisWeb/pull/99), status snapshots:
   `47e6fc5e62f83bdc3f8cd375082d5fcc6e6691e2`.
2. [#100](https://github.com/LuminariMUD/DurisWeb/pull/100), immutable assets:
   `1986f72adadd804b3a5b243606764e989f136b41`.
3. [#101](https://github.com/LuminariMUD/DurisWeb/pull/101), initial downloads:
   `b0347181fe25391935ce5792e89fd3795a1bdc50`.
4. [#102](https://github.com/LuminariMUD/DurisWeb/pull/102), shell precache/update:
   `0de77161e62200bd0a205b576cc66cda96061f2b`.
5. [#103](https://github.com/LuminariMUD/DurisWeb/pull/103), socket bounds:
   `b2bf32254f35cd954ddad9482a782735c4a5a381`.
6. [#104](https://github.com/LuminariMUD/DurisWeb/pull/104), reconnect jitter:
   `6649edb0cc32b714963b2119bbd23e521caf58d6`.
7. [#105](https://github.com/LuminariMUD/DurisWeb/pull/105), pagination/API 404:
   `4cfcc0aea354b072060998e40f2ce35bea5357b4`.
8. [#107](https://github.com/LuminariMUD/DurisWeb/pull/107), page-first PvP SQL:
   `c46c5d793dd61dca3ad676eee1c66b02cec74d32`.
9. [#109](https://github.com/LuminariMUD/DurisWeb/pull/109), forum search:
   `6e73bbca12330c5f026c5aacf8b74c7f40ee2b64`.
10. [#110](https://github.com/LuminariMUD/DurisWeb/pull/110), dense teams:
    `31b13b1308399016c8d702b30f0813c7404671a3`.
11. [#111](https://github.com/LuminariMUD/DurisWeb/pull/111), terminal lifecycle:
    `1d1b01985e0c46ac231d425eee9ab3a728fd9303`.
12. [#112](https://github.com/LuminariMUD/DurisWeb/pull/112), qualification:
    `76dffbae214acd52b690a9a7cdeb12b584f5c8f0`.
13. [#113](https://github.com/LuminariMUD/DurisWeb/pull/113): this handoff. Its final
    reviewed head and exact checks are recorded in the PR's addressing comment.

Review integration corrections: #101's non-root-base repair moved into #101 as
`1aec6d9`; #111's pending-terminal dispatch repair is `05b364d`; #112's HTTP drain
and per-socket heartbeat repairs are `c11fca9`. All four associated review threads
are answered/resolved. #103, #107 and #109 integrated master with documentation
conflicts resolved by retaining both contracts. #106/#108 now document their map
resolution/cache/query limits. No branch was deleted. The final master SHA must
be pinned afresh for any later authorized deployment.

## Evidence and decisions

- Status benchmark: 140 requests, direct subprocess starts **280 → 2**, p95
  **100.79 → 8.46 ms**. Sample time remains truthful, failures explicit, delayed
  population privacy rechecked per response, dependency health uncached.
- A3 controlled initial-download comparison: gzip **672,375 → 322,332 bytes**,
  47 → 39 JS files. The final built frontend counts **42 declared assets /
  1,003,442 raw / 322,439 gzip bytes** after the reconnect change. Optional editor
  and full icon catalogs still work on consuming routes. Their large optional
  editor warning remains visible; the threshold was not weakened.
- A4 controlled normal-worker comparison: 299 → 72 cached entries and 302 → 75
  worker requests, with actual transferred-body measurements in the plan.
  Fresh install, optional-route caching, offline shell, update dismiss/apply and
  PvP NetworkOnly behavior pass.
- Native socket tests prove exact/oversized/fragmented input, admission,
  heartbeat/dead peers, slow output consumers and shutdown. The native browser
  100-client retry experiment exercises the actual reconnect composable.
- Mature SQL/full-app qualification covers 50,001 events, 200,000 snapshots,
  1,000 synthetic accounts, 500 threads and 20,000 posts on MySQL 8.0.46 and
  MariaDB 11.8.9. Reproduced forum binding/count and dense-team loss defects are
  repaired. Each engine passes 52 PvP unit/native cases and eight forum native
  SQL/HTTP cases. The terminal/transport/permission run after review repair passes 36 tests;
  full cookie/session/JWT/real-PTY and locked-SQL SIGTERM journeys pass on both.
  Those historical native journeys predate the pending-dispatch correction;
  its delayed-PID regression proves refusal during creation and operation after it.
- A7 measures acquisition and query timing separately, including 10/50-call
  bursts and complete plans. The bounded HTTP prototype returns retryable 503s
  without executing expired reads. A client query timeout leaves server work
  running: **retain the size-10 pool and session safeguards**, with no global
  timeout/index/pool increase. The runtime unlimited checkout queue is unchanged;
  route-attributed live evidence and separate review are needed before tuning.
- Two 901-second runs retain 100 sockets each with **8,972 / 8,973 mixed reads**,
  zero HTTP errors and no unexpected closures. All route p95/p99, descriptor,
  CPU and RSS samples are retained. RSS grows during these finite runs; there is
  no long-term plateau/leak-free or production-capacity claim.
  These reports predate #112's corrected final request drain and ten-second
  per-socket application-reply checks. The actual-CLI synthetic regressions pass;
  the 901-second observations were not repeated and cannot establish those
  stronger completion guarantees.
- Cold browser storage and a separate empty-owned-Redis app startup are tested.
  SQL/OS caches remain warm. The real-backend 390×844 mobile lab run measures
  **LCP 3192 ms, CLS 0.006912 and sampled INP 32 ms** over four taps, with the
  actual SW waterfall, login, forum visibility/icon/thread and editor passing.
  This is not physical-device or field INP evidence.

Private evidence stays outside Git under `/tmp/durisweb-issue98/` (0700;
credential configuration 0600). The plan names each report and actual command;
the source qualification CLIs refuse ordinary fixture names/ports. Owner schema
inputs are pinned/hash-verified published sources, never a player-data export.
No MUD command or server is run. The deterministic echo PTY does not qualify the
production bubblewrap/tmux sandbox. Missing bridge/presence diagnostics are
expected isolated-fixture limits, separate from successful HTTP/session tests.

Historical frozen soak artifact-manifest SHA-256:
`4bfabe3040a7cfdafd55b2717e0375a4d13ae127beb29fbc51c3c78d84fcfe09`.
Historical rebuilt artifact-manifest SHA-256:
`5141288b533401cea298bf9567ea5dee2d9e1369056f46a97be0e5cb7593ebd7`.
The final shutdown await was validated by rerunning both native shutdown journeys
after the soak; served artifacts were never overwritten during observation.
These identities predate the merge-review repairs and do not identify a new
release build of current master.

## Checks

All affected-package format/lint/type checks, focused tests and runtime builds
passed for their changes; database changes passed `verify:mud-writes` (53
classified writes). The plan records full commands and earlier failed/fixed
checks. Frontend's last runtime change passed all 566 unit tests. A full local
backend suite, production tests, live host checks and field-device tests were
not run. CLI-only changes use `node --check`, Node fixture tests, root Biome and
`git diff --check`; they do not require another application build.

The original PR heads had successful backend/frontend GitHub checks. Merge-review
repairs additionally ran their relevant regressions and required package gates;
exact commands, reused evidence and skipped native/full suites are recorded in
each PR's addressing comment. The final integration checks are recorded on #113.
No CI success is inferred from a queued run. #98 remains open for operator work.

Final integrated verification, 2026-10-25:

- Both packages pass `pnpm --dir <package> format:check`, `lint` and `type-check`.
  `pnpm --dir backend build` passes. After the frontend type check,
  `pnpm --dir frontend build-only` passes with explicit synthetic loopback URLs
  and Vite host/port settings; no environment file or served artifact is changed.
- `pnpm --dir frontend test:unit --run`: 583 pass in 74 files.
- The focused backend terminal/account/presence/socket/map/security run passes
  90 cases; two native opt-ins remain skipped. Its complete selectors are in
  #113's addressing comment. `pnpm --dir backend verify:mud-writes` passes with
  53 classified writes; `pnpm --dir backend schema:check` verifies the 77-table
  baseline and 85 migration sources without inspecting/changing a database.
- `node --test scripts/qualification/initial-download.test.mjs
  scripts/qualification/runtime-soak.test.mjs`: all six cases pass. The four
  qualification CLIs pass `node --check`; root Biome and `git diff --check` pass.
- Palette and configuration guards pass. The configuration guard initially
  flagged the owned `pwipeWebsiteProbe.ts` child-process CLI; its file-specific
  exception now matches the existing timezone-probe pattern. Ordinary backend
  environment reads remain subject to the same central ownership rule.
- `node scripts/qualification/initial-download.mjs` on this synthetic build:
  42 assets, 39 JS, one CSS, two fonts; 1,004,137 raw / 322,664 gzip bytes. The
  service-worker manifest has 77 entries. These are local build measurements.

The full backend/database/native suites, 901-second soaks, browser acceptance,
physical-device profiling and production checks were not repeated. Earlier
evidence is reused only within its documented source and fixture limits.

## Operator release and recovery, when authorized

Follow [deployment.md](../deployment.md) and the installed
[deploy-production skill](../../.agents/skills/deploy-production/SKILL.md), plus
the protected current operator records. This is a handoff, not execution.

1. Complete B1 on the actual production host: verify installed identities,
   local/public structured health, services, database/cache/host headroom,
   watchdog and the required Cloudflare tunnel. Historical/off-server figures
   cannot establish current readiness.
2. Review/integrate the selected stack, then pin the clean latest master SHA.
   Do not deploy an unreviewed feature-branch tip. Record any unrelated changes
   included by master and qualify them through their own release requirements.
3. Retain compatible backend/frontend artifacts, dependencies, protected config
   and preflight/migration-bundle pin in a private recovery directory. Build the
   pinned candidate in a separate release worktree with frozen lockfiles and
   actual protected production environment; never build over served artifacts.
   Run both config checks/builds and production configuration/dependency
   preflights. This stack adds no migrations. Pending unrelated migrations are
   a separate authorized scope, never an automatic preflight workaround.
4. Use the existing preservation/promotion/watchdog procedure. Stop/promote/start
   only the website, retaining the old trees and matching preflight pin. Keep
   Cloudflare ingress active. Do not restart or operate the MUD/shared services.
5. Verify exact promoted hashes/PID/start identity, structured local and both
   public hostname health, site config, new HTML/assets and affected UI. Complete
   B3: first anonymous immutable assets without CSRF issuance, conditional
   requests, actual CDN HIT/Age, dynamic privacy/auth/CSRF boundaries, SW update
   controls, status freshness, sockets and API history fallback. Repeat the
   ordinary service/health check after 20–30 seconds.
6. If acceptance fails, restore the retained compatible artifacts/dependencies
   and their preflight pin, reload/start the website and verify recovery before
   removing watchdog pause. Retain old hashed assets for existing clients as
   required by the deployment guide; check service-worker recovery. There is no
   stack migration to roll down. Do not treat rollback as a successful release.
7. Complete B4–B6 in a coordinated bounded traffic window with on-host
   observations and normal privacy cadence. Monitor RSS growth, route waits and
   search p95, 429s, health, swap I/O and restart counts. Record the October 28
   readiness decision with explicit unresolved limits. Publish/reconcile B7 news
   only after live verification, then verify the saved and publicly rendered
   entry. Keep #98 open while section B remains unresolved.

## Proposed Website Changelog payload — unpublished

Reconcile with existing live entries/drafts using the repository
[news-update skill](../../.agents/skills/news-update/SKILL.md). Select only wording
for changes actually included in the verified release; do not duplicate entries.
No website database draft or published entry was written in this off-server run.

```html
<h3>Website loading and live connections</h3>
<ul>
<li>Opening and installing the website downloads less shared code. Editing tools
and the full icon selections remain available when opened.</li>
<li>Versioned website files can stay cached between visits. Offline notices and
update controls remain available, and dismissing an update notice now works.</li>
<li>Live connections spread retries after an interruption and stop stalled
connections from accumulating output. Administration terminals clean up
interrupted connection attempts and stop promptly when disconnected.</li>
</ul>
<h3>Battle history and forums</h3>
<ul>
<li>Battle lists do less work across a long history while preserving event order,
large teams, participant descriptions and existing privacy rules.</li>
<li>Forum author and date filters work together across threads and replies.
Result totals and page navigation include accessible matches beyond the first
page, while private and deleted content remains protected.</li>
</ul>
<h3>Status and website lists</h3>
<ul>
<li>Status visits share a recent sample and show when it was updated. Unavailable
status remains explicit, with the same delayed-population privacy rules.</li>
<li>Website Changelog lists enforce bounded page sizes, and invalid API addresses
return a clear error while ordinary website links keep working.</li>
</ul>
```

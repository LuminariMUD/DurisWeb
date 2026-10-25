# Issue #114: zone-room map readability

Updated 2026-10-25. **Status: implemented, locally accepted, and open for review in a two-PR stack.**

- Issue: [#114](https://github.com/LuminariMUD/DurisWeb/issues/114).
- Source baseline: `d2f38e291abdcf5ab35a9c703ee101271a6b841d`; remote `master`
  still matches this baseline at final verification.
- Layout branch: `branch/issue-114-zone-map-readability`, commit
  `553f22cfc318886cdd968fa597cac6f3f44a179b`, [PR #115](https://github.com/LuminariMUD/DurisWeb/pull/115).
  Its frontend/backend CI checks pass.
- Follow-up branch: `branch/issue-114-zone-map-interactions`, based on #115,
  [PR #116](https://github.com/LuminariMUD/DurisWeb/pull/116). Its runtime-code
  commit is `c689d05b230de334085bf3a46de5c07a517b74d6`; the subsequent commit
  records only this review metadata. Review/merge #115 first, then #116.
  Check each PR's live Checks tab before merging; no merge is performed here.
- Scope ends at review-ready PRs. Deployment, live acceptance and changelog
  publication require the eventual authorized release; no release tag is needed.

## Outcome and implemented design

The wiki zone-detail map now lays out each connected group of rooms using its
exits, then packs those groups to the panel proportions. All rooms are retained,
occupied grid cells are resolved without an overlapping fallback, and placement
is deterministic under room/exit enumeration changes. Incoming-only adjacency
is used to discover component membership without inventing an exit.

One visual room-pair connection retains all directed exits, with arrows for the
actual directions of travel. Vertical links are dashed; selected connections
show endpoint compass/U/D labels. Up/down offsets remain schematic and do not
claim geographic coordinates or authoritative floors. Out-of-zone destinations
retain the previous graph omission and existing room-detail behavior.

The selected room has a diamond, bone border and constant-screen-size vermilion
marker. Its persistent VNUM/name **Find** button centers it at reading zoom.
Ordinary selection preserves the user's camera. Fit can zoom below the old
25% floor and its padding clears the toolbar and marker. Zoom, pan, Fit,
Auto-Layout, fullscreen and the sector legend remain available with named controls.
The room list uses native keyboard-operable buttons.

A resize observer initializes hidden desktop/mobile instances when they become
visible, updates canvas dimensions, refits an overview, and preserves a custom
camera. Resizing does not move rooms; explicit Auto-Layout repacks for the new
panel. Fullscreen fits on entry and restores the prior custom camera or overview
on exit/Escape. Observers, frames, listeners and renderers are released on unmount.

The ablation review kept Cytoscape and one small pure layout helper. It removed
unbounded initialization polling, the orphan grid and occupied-position fallback,
and the fullscreen legend's permanently covering panel. A redundant selection
glow was removed because it covered direction labels; the diamond/border/marker
already identify selection. No layout chooser, new engine, worker pipeline,
dependency, persistence service, API, schema, backend or MUD change was needed.
World maps (`/wiki/map`, `/surface-map`), Mudlet and the game client are outside scope.

## Source-grounded findings and comparisons

The old outgoing traversal reached only **4 of Alatorin's 952 rooms**; it put
948 rooms into an eleven-column grid without following their connections.
Weak component sizes start 288, 114, 92, 68, 51 and 50. The old 528×4778-unit
shape was clamped at 25% zoom, leaving only 506 room centers visible on desktop
and 374 on narrow screens. Collision fallback also reproduced an overlapping
room pair in the multi-level comparison zone.

The final production-build browser matrix retains every room and exactly every
in-zone `(source, direction, destination)` tuple, with zero node overlaps and
no rooms covered by the zoom toolbar at Fit:

- **Alatorin (#831):** 952 rooms, 2043 directed exits, 1037 visual connections.
  The straight-segment crossing proxy falls from 12,455 to **169** (98.6% fewer).
  All 952 rooms fit at 9.30% desktop / 5.12% narrow. Overview is for orientation;
  Find and zoom provide individual-room reading and selection.
- **The Gagga'Jobo Cave System (#190, `goblincave`):** 23 rooms, 44 directed
  exits, 22 visual connections; crossing proxy remains **0 → 0**.
- **The Outcasts Tower (#113, `otower`):** 51 rooms, 102 directed exits,
  51 visual connections, including 16 vertical exits. Overlaps improve **1 → 0**;
  the crossing proxy is **6 → 7**. The schematic still contains crossings and is
  not claimed to be a minimum-crossing or geographic embedding.

Crossings are strict intersections of center-to-center segments, excluding
shared endpoints and collinear/endpoint contacts. This is a repeatable layout
proxy, not a pixel count of rendered Bezier curves or a claim that every remaining
crossing is unavoidable. Route checks and reading-zoom screenshots supplement it.

Comparison caught a smaller-zone regression in the first layout chunk (five
crossings). Preferring outgoing compass order and nearest clockwise collision
cells restored zero. The synthetic-identity cave regression uses that topology;
`measure-pr115.mjs` reproduces 191/5/6 crossings at #115, compared with final
169/0/7. This refinement is included in the dependent PR.

A direct Node 26.11.1 sample measured final layout at **6.80 ms** for #831,
0.12 ms for #190 and 0.14 ms for #113. These are local observations, not production
capacity or an enforced performance budget.

## Browser acceptance and evidence

Browser plugin was unavailable; regular Playwright used installed **Chrome
155.0.8059.41 on Windows**. The actual application route, view, map component,
Cytoscape renderer and controls ran from local production bundles. Zone and
peripheral bootstrap HTTP responses plus the unrelated site WebSocket were
fixtures. No MUD process, database, credential, or player data was used.

The fixture is a read-only `.wld`/`.zon` projection matching the wiki room fields,
from the local MUD checkout with HEAD
`571bb08d9ea22642b76e48a3eee250f4b1b1a9b1` (Alatorin `.wld` SHA-256 prefix
`a1085d540c245bba`). Public website/API requests returned 403; live reproduction
and the deployed website identity remain unverified. Saved map-data positions
were not adopted: the existing view uses zone-detail rooms, and the map-data
endpoint has different exit-visibility semantics.

- [x] Matched initial-fit, fixed 100% reading-zoom, selected-room and fullscreen
  captures for all three zones at **1440×900** and **390×844**; additional #831
  captures at **29%**, plus the actual dense-route selection.
- [x] Tablet **768×1024**, and **1023×844 / 1024×844** breakpoint checks: complete
  fit, retained selection on Details/Map tab reveal, no horizontal page overflow.
- [x] Real canvas click selects #83101 without resetting camera; actual exit
  buttons and existing keyboard exit navigation update details/map selection.
- [x] Native room-list keyboard Space selection, visible **2px solid focus**,
  and Find on a distant room. Traced actual routes
  `83238:north:83234`, `83234:north:83230`, `83230:east:83231`.
- [x] Pointer drag, wheel and toolbar zoom; resized desktop split updates actual
  canvas dimensions while preserving a custom camera; Auto-Layout refits the
  resized panel and keeps selection.
- [x] Repeated fullscreen entry, Escape and button exit restore custom camera;
  the fullscreen legend is operable. Fit shows all nodes clear of the toolbar.
- [x] Mobile Chrome emulation with actual dispatched touch events: tap selects
  #83101, one-finger drag pans, two-finger pinch zooms. Physical devices and
  other browser engines are not qualified.
- [x] Meaningful page content, expected route/title, no framework overlay and
  clean console in the final serial acceptance sessions.

Evidence is outside Git:
`C:/Users/apexw/.codex/visualizations/2026/10/25/01a17354-e3cb-7c01-b502-67f0a0cde0f2/issue114/`.
It contains `before-*` / `after-*` PNGs, `before-metrics.json`, `after-metrics.json`,
`matrix-checks.json` (including final source SHA-256 values), `browser-checks.json`,
`touch-checks.json`, `extra-checks.json`, and the reusable `browser.cjs`,
`matrix.cjs`, `acceptance.cjs`, `touch.cjs`, `extra.cjs` scripts.

Fixtures/provenance and the temporary baseline build live in
`/tmp/durisweb-issue114/`. `serve.py` serves the changed `frontend/dist` on 5179
and the baseline build on 5180. The baseline build injects the exact original
`WikiZoneMap.vue` from `d2f38e2` into the same application shell; the room-list
button change does not affect its captured map. Raw fixtures remain outside Git.
If temporary data is lost, recreate it by projecting the recorded `.wld` inputs
through the fields in `wikiService.getZoneByNumber` and the direction table in
`zoneBuilderParser`; do not start or modify the MUD.

Dev previews on Node 24.15.0 and 26.11.1 crashed with a devtools socket
`ECONNRESET`; static bundles removed that dependency from acceptance. A blocked
service-worker experiment produced expected registration errors, so final checks
use fresh normal contexts with a stable build. Parallel Chrome runs exceeded
an aggressive startup timeout; the same final checks pass serially without
source changes. These harness attempts do not qualify the devtools or PWA flow.

## Validation commands and results

All package commands ran from the repository root. Source inspection used
read-only Git, `rg`, `cat`, `sed`, `wc`, directory and process/socket probes.
No package installation, migration, shared service or MUD operation was run.

- Formatting writes, all passed: `pnpm --dir frontend exec biome format --write`
  on the helper/spec/component; on component/view; and separately on each new
  component/view spec. These were scoped file lists, not repository rewrites.
- `pnpm --dir frontend format:check`: passed, final 689 files.
- `pnpm --dir frontend lint`: passed.
- `pnpm --dir frontend type-check`: passed. Initial attempts rejected data-mapped
  arrow enums; typed selector styles fixed that before #115 was committed.
- `./frontend/scripts/check-palette-literals.sh`: passed.
- `pnpm --dir frontend test:unit --run src/utils/__tests__/wikiZoneMapLayout.spec.ts`:
  passed, final 8 tests (including empty/single-room, 952-room packing, collision,
  deterministic ordering, directed-exit semantics and small-cave crossing cases).
- `pnpm --dir frontend test:unit --run src/components/wiki/__tests__/WikiZoneMap.spec.ts src/utils/__tests__/wikiZoneMapLayout.spec.ts src/views/wiki/__tests__/WikiZoneDetailView.spec.ts`:
  passed, **15 tests** across three files. Component cases use actual headless
  Cytoscape, with view tests covering query selection and navigation.
- After removing only three redundant optional glow style properties, reran
  `pnpm --dir frontend test:unit --run src/components/wiki/__tests__/WikiZoneMap.spec.ts`
  (5 passed), format/lint, `pnpm --dir frontend build-only`, and the browser matrix,
  touch and fullscreen/focus comparisons. Other valid test/type evidence is reused.
- `pnpm --dir frontend build`: passed on Node 26.11.1; final style-only
  `pnpm --dir frontend build-only` also passed. Existing editor/icon chunk-size
  warnings remain. Builds used explicit loopback public endpoints:
  `VITE_BASE_URL=/`, API/static `http://127.0.0.1:5179`, WS
  `ws://127.0.0.1:5179/ws`, dev host `0.0.0.0`, dev port `5179`, preview host
  `127.0.0.1`, preview port `4179`, allowed hosts `localhost`.
- `pnpm --dir frontend build-only --config /tmp/durisweb-issue114/baseline.config.ts`:
  passed, with the analogous baseline endpoints/ports 5180/4180 and private output.
- Node 26.11.1: `/tmp/durisweb-issue114/measure-final.mjs` and
  `/tmp/durisweb-issue114/measure-pr115.mjs`: passed, measured results above.
- Bundled Windows Node ran `matrix.cjs`, `acceptance.cjs`, `touch.cjs`, and
  `extra.cjs` from the evidence directory: passed serially. Matrix checks exact
  topology, all-node fit, overlap and toolbar clearance; other scripts cover
  the actual interactions, device emulation, fullscreen and focus listed above.
- `git diff --check` and relative Markdown-link/JSON validation: passed before commit.
  Runtime-source SHA-256 values match the final browser matrix exactly.

Full frontend regression and local backend checks/build/MUD-write verification
are not run: no shared UI primitive, dependency, backend, configuration, database
or MUD-write code changed. Required frontend gates, focused tests, browser
acceptance and #115's CI are the applicable evidence; this is not a full burn-in.

## Review and release handoff

Source changes are confined to
[WikiZoneMap.vue](../../frontend/src/components/wiki/WikiZoneMap.vue),
[wikiZoneMapLayout.ts](../../frontend/src/utils/wikiZoneMapLayout.ts), the room-list
markup in [WikiZoneDetailView.vue](../../frontend/src/views/wiki/WikiZoneDetailView.vue),
and their three focused test files. The durable contract is in
[DESIGN.md](../DESIGN.md#wiki-zone-room-map).

[issue-114-website-changelog-draft.json](issue-114-website-changelog-draft.json)
is a complete **unpublished** public payload. At eventual authorized deployment,
use the [news-update skill](../../.agents/skills/news-update/SKILL.md), reconcile
existing entries/drafts, replace the draft version with the verified release
version, publish after live acceptance, and verify saved fields/public rendering.
There is no live changelog write or deployment in this task. Issue #114 should
remain open until the reviewed stack is merged; the final PR can close it then.

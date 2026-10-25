# Issue #114: zone-room map readability

Prepared 2026-10-25. **Status: implementation in progress; layout chunk readying for review.**

- Issue: [Improve zone-room map layout and connection readability in large zones](https://github.com/LuminariMUD/DurisWeb/issues/114).
- Branch: `branch/issue-114-zone-map-readability`.
- Source baseline: `d2f38e291abdcf5ab35a9c703ee101271a6b841d`, matching local
  `master` and remote `master` when this plan was prepared.
- Implementation is authorized through review-ready PRs. Deployment and live
  publication remain separate; no database or MUD operations are needed.

## Current handoff

The first chunk replaces the single-component traversal/orphan grid with a
deterministic traversal of every weak component, collision-free placement, and
component packing based on the panel proportions. One visual connection retains
all original directed exits between its rooms, with arrows matching those exits.
The minimum zoom is lowered so Fit can actually show the entire large graph.
No dependency or API change is needed.

Confirmed using read-only `.wld`/`.zon` projections from MUD source
`571bb08d9ea22642b76e48a3eee250f4b1b1a9b1`. No MUD process or data store was used.
Alatorin has 952 rooms: the old outgoing traversal reaches just 4, leaving 948
in the orphan grid. Weak component sizes start 288, 114, 92, 68, 51, 50. The
comparison cases are Goblin Caves (#190, 23 rooms) and The Outcasts Tower
(#113, 51 rooms, 16 vertical exits). Tower has one overlapping node pair in
the old layout. The new layout has none in these cases.

Public website/API requests returned HTTP 403; live reproduction is unverified.
Browser evidence instead uses the actual local application route and components,
with fixture HTTP responses for zone data and peripheral bootstrap APIs. This
proves the frontend path against real zone topology, not the deployed revision.
Browser plugin is not available; regular Playwright uses installed Chrome
155.0.8059.41. Node 24.15.0's preview crashed with `ECONNRESET`; the replacement
preview runs on Node 26.11.1. The app's existing router `next()` deprecation
warning is baseline noise. The initial fixture used anonymous 401 responses;
subsequent captures use an anonymous user response to avoid that expected noise.

Six baseline captures (1440×900 and 390×844 for all three zones) and JSON
measurements are outside Git under
`C:/Users/apexw/.codex/visualizations/2026/10/25/01a17354-e3cb-7c01-b502-67f0a0cde0f2/issue114/`.
Alatorin's baseline graph is 528×4778 model units; its 25% zoom floor clips it
inside the 691×587 desktop and 358×417 narrow map canvases. Fixture JSON and
source provenance are in `/tmp/durisweb-issue114/`; recreate them from the
recorded source if needed, keeping raw world data outside Git.

Next chunk: distinguish vertical and selected connections, persistent selection
identity/recentering, resize/fullscreen/mobile lifecycle, component/view tests,
matched final captures and interaction checks, design contract and changelog draft.
Publish the first focused PR when its required checks finish, then stack the
remaining interaction work. Keep this section and the validation ledger current.

### Validation ledger

- `pnpm --dir frontend exec biome format --write src/utils/wikiZoneMapLayout.ts src/utils/__tests__/wikiZoneMapLayout.spec.ts src/components/wiki/WikiZoneMap.vue`: passed.
- `pnpm --dir frontend test:unit --run src/utils/__tests__/wikiZoneMapLayout.spec.ts`: passed, 7 tests; 952-isolated-room packing included, 11 ms total test time.
- `pnpm --dir frontend format:check`: passed (687 files).
- `pnpm --dir frontend lint`, `pnpm --dir frontend type-check`, and
  `./frontend/scripts/check-palette-literals.sh`: passed.
- `pnpm --dir frontend build`: passed on Node 26.11.1 with explicit loopback
  Vite settings (dev 5179, preview 4179). Existing editor/icon chunk-size warnings
  remain. Initial type-check/build attempts rejected data-mapped arrow shapes;
  replaced them with typed selector styles, then both checks passed.
- Direct Node 26.11.1 layout measurement on the captured zone projections:
  #831 4.53 ms / 2043 directed exits / 1037 visual connections; #190 0.10 ms;
  #113 0.18 ms. These are local observations, not a production performance budget.
- Browser desktop #831: all 952 nodes fit at 12.16% with zero overlapping pairs
  and unchanged 1037 visual connections. Selection retains #83100. More readable
  selection and connection presentation remain for the next chunk.
- `git diff --check`: passed.
- Backend checks are not run because no backend/configuration/database/MUD-write
  code changes. Full frontend regression is deferred unless integration evidence
  justifies it; focused new tests and required package checks cover each chunk.

## Outcome and boundaries

Make the **Zone Map on Wiki → Zones → zone detail** easier to understand:
distinct rooms, traceable connections, useful panel coverage, and an identifiable
selected room. Use Alatorin – the Forge City (#831), with room #83100 selected,
as the main regression case. The report shows 952 rooms at 29% zoom; confirm
those values against the reproduction data rather than assuming they are current.

Preserve room identities and actual exit topology, including one-way and
vertical exits. Keep room-list/detail navigation, zoom, pan, Fit to View,
Auto-Layout, fullscreen, and desktop/mobile access usable. An overview need
not show every room label, but zooming in must make individual rooms selectable
and their connections understandable.

Non-goals: the world map at `/wiki/map` (issue #71), `/surface-map`, Mudlet or
the browser game client, manual per-zone coordinates, new map engines, new
dependencies, schema/API changes, and changes to the separate MUD repository.
Do not add a layout chooser, persistence service, worker pipeline, or general
graph framework without reproduction evidence that the requested outcome needs it.

## Source findings and open questions

These are source observations, not a confirmed explanation of the screenshot.

1. [WikiZoneMap.vue](../../frontend/src/components/wiki/WikiZoneMap.vue) owns
   graph construction, layout, styling, selection, and viewport controls.
   `runAutoLayout()` traverses outgoing exits from the first room with exits;
   it does not restart traversal for each remaining connected component.
   Unreached rooms are placed in rows of **11** starting at a fixed Y offset,
   without preserving their connections in placement. This can create a tall
   block even when those rooms form their own connected subgraphs. Measure
   the unreached count for #831 before identifying this as its cause.
2. Placement uses 50-unit grid spacing and 24-unit nodes. Collision resolution
   tries 13 offsets, then returns the requested position even if occupied.
   Cycles and contradictory direction constraints are not reconciled after
   first placement. `up` shares the northeast offset and `down` the southeast
   offset. These are concrete overlap and multi-level readability risks.
3. `buildElements()` collapses all exits between an unordered room pair to
   one edge, keeping only the first direction, while drawing one target arrow.
   Check reciprocal exits, multiple directions to one destination, and
   self-loops before changing routing; cleaner geometry must not imply an
   incorrect route or lose exit semantics. Out-of-zone destinations are
   currently omitted from the graph.
4. Initial layout, Fit, and fullscreen use `cy.fit(undefined, 50)`; zoom is
   constrained to 0.25–2. There is no explicit component resize observer.
   Check whether fit is clamped for large graphs and whether resizing the
   desktop split or revealing the mobile tab leaves stale canvas dimensions.
   At the reported 29%, a 24-unit node is only about seven CSS pixels wide.
5. [WikiZoneDetailView.vue](../../frontend/src/views/wiki/WikiZoneDetailView.vue)
   builds the graph's `rooms` prop from zone-detail rooms/exits. It fetches and
   stores `mapData` but does not pass those coordinates or edges to this map.
   Desktop uses two resizable panels; mobile has separate Details and Map tabs.
   Selection changes the highlight without intentionally changing the viewport.
6. The existing [API types](../../frontend/src/types/index.ts) and
   [wiki service](../../backend/src/services/wikiService.ts) expose optional
   saved positions through map-data. That service also filters secret exits,
   whereas the detail projection has a different exit representation. Switching
   data sources is not a layout shortcut: first reconcile topology and visibility
   contracts. Keep this plan frontend-focused; record a separate follow-up if
   investigation establishes an independent API/visibility defect.
7. No dedicated `WikiZoneMap` or `WikiZoneDetailView` test was found in the
   current frontend tests. Existing
   [LeafletMap tests](../../frontend/src/components/wiki/__tests__/LeafletMap.spec.ts)
   illustrate the repository's Vue/Vitest patterns but cover another renderer.

The reporter did not supply browser/OS, deployed revision, or exact viewport.
The current live layout, #831 component counts, saved-position availability,
and representative small/multi-level zone IDs remain unverified.

## Implementation sequence

### 1. Reproduce and establish the graph contract

- [ ] Capture #831 with #83100 selected at initial fit, approximately 29%,
  and a usable reading zoom. Record website SHA, browser/version, viewport,
  actual map-panel dimensions, zoom/pan, room/exit counts, and fixture provenance.
  Use approved public/demo data; keep raw captures and private evidence outside Git.
- [ ] Record directed exit tuples, reciprocal/multi-exit pairs, weakly connected
  components, rooms missed by the initial outgoing traversal, node overlaps,
  graph bounds/aspect ratio, and visible panel occupancy. Trace several actual
  routes through the dense lower section. Distinguish placement defects from
  crossings inherent in the source graph.
- [ ] Choose and record one representative smaller zone and one multi-level
  zone. Add synthetic fixtures for disconnected components, incoming-only
  reachability, cycles, directional conflicts, vertical exits, and isolated rooms.
- [ ] Compare identical data and camera conditions before/after; do not claim
  improvement from a different viewport, filtered graph, or missing rooms.

### 2. Correct placement with the smallest sufficient layout

- [ ] Keep Cytoscape and one deterministic layout path. Extract a typed pure
  helper only for graph construction/placement that needs independent tests;
  keep component lifecycle and camera state in the component.
- [ ] If confirmed by the baseline, traverse every connected component instead
  of flattening all unreached rooms into the orphan grid. Use undirected
  adjacency only to discover membership; retain original directed exits for
  navigation/rendering. Preserve useful compass relationships within components.
- [ ] Replace the occupied-position fallback with collision-free placement for
  finite inputs. Use stable room/exit ordering and indexed lookup/occupancy
  structures where needed; do not add a second fallback layout engine.
- [ ] Pack disconnected components to suit the available panel, with clear
  separation, without inventing links or distorting coordinates independently
  on X/Y. Evaluate vertical separation and conflicting constraints explicitly;
  do not present up/down as ordinary compass exits. A floor selector is not
  required unless simpler placement/routing fails the multi-level example.
- [ ] Compare the resulting shape and route tracing with the baseline. If #831
  is largely connected and this does not explain the problem, revisit its
  actual constraint/crossing hotspots before choosing a different algorithm.

### 3. Make connections and camera behavior readable

- [ ] Represent one-way, reciprocal, parallel-direction, and vertical exits
  faithfully. Combine a reciprocal pair visually only when both directions
  remain explicit; use the existing exit controls as the navigation authority.
  Tune edge routing/contrast/arrowheads against actual congested paths, avoiding
  avoidable node intersections. Do not hide exits to improve a screenshot.
- [ ] Make the selected node and its immediate connections distinguishable at
  overview and reading zoom, without relying on color alone or permanently
  labelling every node. Preserve room VNUM/name access and sector meanings.
- [ ] Make initial fit and explicit Fit show the whole graph with useful
  padding; reconcile fit with zoom limits. Keep normal selection from resetting
  a user's pan/zoom. Handle split-panel resize, mobile tab reveal, and fullscreen
  entry/exit without stale sizing, clipped controls, or unintended relayout.
- [ ] Follow [DESIGN.md](../DESIGN.md) for tokens, control names, keyboard focus,
  touch access, overlays, and motion. Scope accessibility repairs to changed
  controls and the room-selection/navigation workflow.

### 4. Prove acceptance and prepare the release handoff

- [ ] Add focused tests for deterministic finite positions, zero node overlap,
  every input room retained exactly once, and exact exit semantics. Include
  empty/single-room cases and a synthetic graph comparable to the reported
  952-room size; record layout time without inventing an unsupported performance
  budget. Small fixtures must fail against the relevant old behavior.
- [ ] Add component/view coverage for map-click selection, room-list selection,
  exit-button navigation, initial `?room=83100` selection, highlight updates,
  Fit/Auto-Layout controls, data replacement, resize, and teardown where changed.
  Use rendered browser checks for canvas geometry and hit targets; mocks alone
  do not establish readability or successful pointer interaction.
- [ ] Capture matched before/after screenshots for all three real zones at
  **1440×900 desktop** and **390×844 narrow**; also exercise **768×1024 tablet**
  and both sides of the `lg` breakpoint. Record actual panel sizes. Include
  initial fit, reading zoom, #831 near 29%, fullscreen, and selected-room states.
- [ ] In the browser, pan and zoom with supported mouse/touch input, resize the
  desktop split, switch mobile tabs, enter/exit fullscreen repeatedly, rerun
  Auto-Layout, select neighboring rooms, and follow real connected-room exits.
  Verify room identity/details/highlight agree, selected rooms remain findable,
  controls stay accessible, and there are no new console errors.
- [ ] Review the evidence against every issue criterion: spacing and shape,
  fewer avoidable crossings/crowding, selectable rooms and visible selection,
  all requested controls/navigation, and comparisons across zone types and sizes.
  Record unavoidable crossings or incomplete evidence explicitly.
- [ ] Update this plan with final decisions/results and the changed zone-map
  contract in `DESIGN.md` if needed. Prepare visitor-facing Website Changelog
  text during implementation using the
  [news-update skill](../../.agents/skills/news-update/SKILL.md). Reconcile and
  publish only after an authorized deployment is verified live, then verify
  the saved entry and public rendering. This planning-only change needs no
  public entry because it changes no website behavior.

## Expected files and validation

Expected implementation touches are `WikiZoneMap.vue`, its focused tests, and,
only where integration/resize requires it, `WikiZoneDetailView.vue` and its tests.
A small `frontend/src/utils/wikiZoneMapLayout.ts` plus colocated tests is
appropriate if pure placement is extracted. No dependency, backend, or migration
changes are planned. Keep unrelated unused-data cleanup out of the patch.

Run from the repository root after implementation (new test paths are proposed):

```bash
pnpm --dir frontend test:unit --run src/components/wiki/__tests__/WikiZoneMap.spec.ts src/views/wiki/__tests__/WikiZoneDetailView.spec.ts
# If the layout helper is extracted:
pnpm --dir frontend test:unit --run src/utils/__tests__/wikiZoneMapLayout.spec.ts
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend build
git diff --check
```

Use the final actual test paths in the handoff. Build only in a verified
development/isolated checkout; production `frontend/dist` is served immediately.
If evidence expands the change into backend/data contracts, revise this scope,
read [SECURITY-COMPLIANCE.md](../SECURITY-COMPLIANCE.md), and run both packages'
required checks plus applicable backend tests/build and `verify:mud-writes`.

The validation ledger above records executed checks. Browser acceptance beyond
the recorded baseline and first-layout preview, live reproduction, and release
verification remain incomplete. The issue remains open until implementation
and the acceptance evidence are complete.

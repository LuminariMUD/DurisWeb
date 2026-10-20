# Wiki world map readability plan

Prepared 2026-10-19. **Status: implementation in progress; preview deployment authorized on 2026-10-20.**
Source rechecked: `49cc119d7394587104ba3726e7e1b2f5babc6b57`.

## Outcome and scope

Make `/wiki/map` easier to read, especially zone names, using the visual treatment
of the [reference map](https://drevarr.github.io/New_Duris_Surface_Map.html).
Keep DurisWeb's existing extraction, database projections, generated terrain
images, automatic entrance placement, and Leaflet rendering. The reference is
visual evidence; its HTML, PNG, hardcoded locations, and icons are not inputs to
our map.

Work is limited to label presentation, zoom-dependent label density, a quieter
generated terrain palette, and the matching legend and map controls. Preserve
Surface, Underdark, and Alatorin, continent jumps, map bounds, coordinates,
panning, zoom/reset, marker/name toggles, and clicks through to zone details.

**Non-goals:** a new map engine, imported artwork, manually positioned labels,
search/sidebar features, dragon/ferry data, live positions, new dependencies,
API or schema changes, MUD changes, and changes to other map renderers. The owner authorized implementation and a quick preview deployment on 2026-10-20;
a full deployment qualification will follow separately.

Prioritize **easy reading, then neat composition, then decoration**. Names are
the first visual layer, entrance dots the second, and terrain the supporting
context. A successful result lets a reader identify a complete zone name at
normal browser zoom without squinting, associate it with the correct entrance,
and distinguish nearby terrain. Reduce clutter through spacing and density;
do not make the text smaller to fit more names.

## Local reference and design evidence

The reference was downloaded on 2026-10-19 into the ignored
`tmp/wiki-map-reference/` directory. It contains the original
`New_Duris_Surface_Map.html`, its 1600×1600 terrain PNG, both icon assets, and
Leaflet 1.9.4 CSS/JavaScript. `manifest.json` records source URLs, byte counts,
and SHA-256 checksums. `offline.html` changes only the two Leaflet URLs to local
files; the original remains intact. Keep these reference files out of commits
and application bundles. If the directory is absent in another checkout,
download the reference and its dependencies again before visual comparison.

The useful visual cues are centered multiline names, bold light text with a
dark halo, and restrained green, brown, and blue terrain. The downloaded HTML
also has limitations: labels use 9px text, 0.9 line height, and a 50px marker
width despite a 180px CSS maximum. Its `updateLabelScale()` function is defined
but never called or registered, so its proposed zoom scaling is not evidence
of working label-density behavior. Use these observations to guide our own
rendered comparisons, not as a specification to copy verbatim.

This review inspected the downloaded source and terrain PNG. Reference browser
captures were attempted with existing Playwright tooling, but the available
Chromium runtime lacked `libXdamage.so.1`; no rendered interaction or visual
acceptance is claimed. The implementation baseline and browser checks below
remain required.

## Current implementation and constraints

- [WikiMapView.vue](../../frontend/src/views/wiki/WikiMapView.vue) owns the page,
  toolbar, layer/continent selection, legend, and zone navigation.
- [LeafletMap.vue](../../frontend/src/components/wiki/LeafletMap.vue) overlays
  the generated PNG and fetches entrances for the visible area. Labels currently
  use 11px, weight 500, a light shadow, and unwrapped text to the marker's right.
  The map uses `CRS.Simple` in room coordinates and calls `fitBounds`; the
  `initialZoom` prop is currently unused. Use the actual fitted zoom and
  `map.getZoom()` when collecting baselines or setting density thresholds.
- [wikiService.ts](../../backend/src/services/wikiService.ts) generates the PNG
  from `wiki_map_positions`, drawing a colored block per room. Its terrain table
  and the page's legend are separate and must agree. The renderer currently
  defines sectors 0–29; Road (37) appears in the legend but falls back to the
  layer background in the renderer. The website's existing
  [sector table](../../frontend/src/components/wiki/WorldMap.vue) defines 0–39,
  including liquid mithril (30), mushrooms (31), castle terrain (32–34), planes
  (35–36), Road (37), snowy forest (38), and lava (39). Account for these known
  sectors when updating the renderer; reserve fallback for unknown IDs. Use
  that table to check sector meanings without changing its legacy renderer.
- [extractMapData.ts](../../backend/src/scripts/extractMapData.ts) owns map
  extraction; `wiki_map_positions` and `wiki_zone_entrances` remain the data
  sources. Entrance results can contain multiple rows for a coordinate or
  destination. Inspect this in the baseline; zoom cannot separate identical
  coordinates, and deduplicating by zone name would lose distinct entrances.
- [mapLayerImageUrl.ts](../../frontend/src/utils/mapLayerImageUrl.ts) selects
  the API image or the configured static origin. Preserve both paths.
- [MapPreviewDisplay.vue](../../frontend/src/components/forum/widgets/MapPreviewDisplay.vue)
  also embeds `LeafletMap`, with labels, markers, and controls disabled.
  [ShipRadar.vue](../../frontend/src/components/mud/ShipRadar.vue) consumes the
  generated surface image separately. Both need regression checks; neither
  needs a layout redesign.

## Compatibility with DESIGN.md

The [Design guide](../DESIGN.md) remains authoritative. Its distinction between
[game terrain and control chrome](../DESIGN.md#game-content-and-charts) permits
a terrain palette suited to reading the map without changing the eclipse theme.

| Element | Planned treatment | Design contract |
|---|---|---|
| Zone labels | Bold system sans, bone foreground, a strong ink-colored halo, centered multiline text with space clear of the entrance dot. | [Typography](../DESIGN.md#typography) and [colors](../DESIGN.md#colors-and-surfaces); use existing tokens instead of copying pure white/black literals. |
| Terrain | Muted forest/field greens, earth tones for hills/mountains, blue water, and recognizable desert/arctic/Underdark distinctions. | [Game-authored colors](../DESIGN.md#game-authored-colors); colors convey sector meaning and are separate from application tokens. |
| Markers and controls | Retain vermilion/bone markers, existing shared controls, ink surfaces, rules, focus states, and rectangular chrome. | [Shared components](../DESIGN.md#shared-components) and [third-party UI](../DESIGN.md#charts-and-third-party-ui). |
| Responsive behavior | Preserve the shell and usable map area; labels wrap locally rather than widening the page. | [Layout](../DESIGN.md#layout-and-responsive-behavior) and [accessibility](../DESIGN.md#interaction-and-accessibility). |

Do not copy the reference's blue sidebar, generic page typography, green hover
state, or 9px text size. Start labels at `0.875rem` (14px at the default root
size), weight 600–700, and 1.2–1.3 line height, with at most `1rem` at close zoom.
These are starting values for visual review, not a claim of accessibility.
Keep complete names available and check contrast over light and dark terrain.
Use a compact, solid ink halo around the glyphs; a broad blurred glow obscures
nearby letters and terrain. Check the tooltip's effective opacity as well as
the text color. A dark halo must separate bone text from snow/desert; token
usage alone is not proof.
Record the final map-specific label/terrain rules in the existing game-content
section of `DESIGN.md`, with source links; do not relax global design rules.

Keep the composition map-led: one wrapping toolbar, aligned groups of controls,
and small, consistently inset overlays. Give help text a readable ink surface
and body-sized text instead of the current 10px translucent text over terrain.
Keep it clear of the marker/name toggles on narrow screens. The legend is
currently hidden below `sm`; provide a compact, keyboard/touch-operable legend
disclosure there so terrain meanings remain available without covering the
map permanently. Reuse existing controls and shared spacing, with explicit
accessible names for layer, continent, zoom, reset, and legend controls.

### Label visibility contract

| Markers | Names | Expected presentation |
|---|---|---|
| On | On | Permanent wrapped names at reading/close zoom. Overview may use hover/focus disclosure with a fine pointer; retain permanent names on touch. |
| On | Off | Dots remain navigable; no permanent labels return on zoom, pan, resize, or layer changes. Hover/focus details and accessible marker names remain available. |
| Off | On | Permanent names at every zoom, preserving discovery without visible dots. Do not leave invisible 1px markers as keyboard targets; any interactive name needs a visible focus treatment. |
| Off | Off | Terrain only, with no entrance labels, popups, or invisible entrance tab stops. This is also the shared preview's configuration. |

Density changes must not overwrite the user's toggle choices. Keep keyboard
names and the route to zone details available on visible entrance controls.
Automatic overview reduction must not force touch users to navigate just to
discover a name. An explicit Names off choice still hides permanent labels.

## Implementation sequence

1. **Capture the baseline.** In an isolated development checkout, capture the
   same bounds at overview, normal reading, and close zoom on all three layers.
   Include dense entrance clusters, duplicate/co-located entrances, long and
   unbroken names, forest, ocean, desert, and arctic terrain. Use synthetic or
   approved demonstration data. Record the fixture, viewport, actual zoom,
   center/bounds, layer, and toggle state for reproducible comparisons.
   The reference supplies appearance, not authoritative names or geography.

2. **Improve labels first.** In `LeafletMap.vue`, use bone text with an ink
   outline/shadow, stronger weight, centered alignment, and a bounded width
   (initially about `10rem`) with natural wrapping and an emergency break for
   unbroken names. Use no ellipsis or line clamp. Anchor the label above or
   below its entrance so the dot and click target remain visible. Let Leaflet
   position overlays; avoid CSS transforms that overwrite its positioning.
   Apply hover emphasis to an inner dot or its colors/border; the current
   marker `transform: scale(...)` rule must not compete with Leaflet's position.
   Scope CSS under a component-owned container class; Leaflet-created nodes
   need a descendant/deep selector rather than a Vue scope attribute alone.
   Preserve ANSI-code stripping and use text nodes/`textContent` for both
   tooltips and popup names. Existing tooltip strings and popup interpolation
   are HTML sinks; stripping ANSI codes does not escape markup.

3. **Tune label density with actual zoom.** Keep a readable screen-space size
   at normal zoom, with a small bounded increase at close zoom. Reduce permanent
   labels at overview instead of shrinking them into illegible text; follow
   the visibility contract above. Calibrate thresholds against room-coordinate
   scale, viewport, and fitted overview, rather than copying the reference's
   image-pixel zoom values. Record numeric thresholds and check immediately
   below and above them; use the same policy on reset, resize, and layer change.
   Use the existing Leaflet events and lifecycle; no collision engine,
   per-zone offsets, or new settings. Nearby distinct coordinates should
   separate on zoom. If co-located destinations occur, use a coordinate-anchored
   disclosure with each distinct destination available, rather than overlapping
   names or dropping destinations. Keep all source coordinates and entrances.
   Ensure delayed entrance responses cannot redraw a previous layer or undo
   a toggle, and clear pending refresh timers/listeners on unmount.

4. **Quiet the generated terrain and align the legend.** Update the existing
   sector RGB table and background colors in `wikiService.ts`, then the matching
   swatches in `WikiMapView.vue`. Maintain sector IDs, geometry, dimensions,
   layer filtering, unknown-sector fallback, and the meaning of each terrain
   type. Cover known sectors 0–39, including a distinct Road (37) color, and
   test unknown IDs separately. Give legend entries explicit sector IDs so
   their swatches can be compared with decoded renderer pixels; group related
   terrain only when its label describes the group accurately. Match the
   entrance key to the actual vermilion/bone marker (currently the key uses
   `bg-danger`). Review the palette on Underdark and Alatorin as well as Surface;
   muted colors must still distinguish terrain.
   Keep explicit frontend/backend mappings consistent without adding a shared
   package or an endpoint. Leave the extractor and unused legacy canvas world
   map alone; no re-extraction or database write is needed for this styling.

5. **Verify and document the result.** Compare matched before/after captures,
   finish the acceptance checks below, document the final design decisions,
   and prepare release news. Retain existing loading/error behavior and all
   shared-preview options. Stop when readability and compatibility pass.

Expected source edits: `LeafletMap.vue`, `WikiMapView.vue`, `wikiService.ts`,
focused behavior tests, and `DESIGN.md`. Shared `main.css` owns global chrome;
change it only if an actual shared token/chrome adjustment is needed. No global
palette change is expected.

## Acceptance and proof

- Labels are visibly clearer than the matched baseline on every layer: strong
  separation from bright/dark terrain, complete wrapped long names, readable
  normal-zoom text, and usable dense regions after zooming in. Check measured
  text/halo contrast against the rendered colors, targeting at least 4.5:1 for
  normal text; screenshots alone do not establish accessible contrast. Record
  the computed font size, line height, opacity, foreground/halo colors, and
  measured ratio. Long names must wrap without clipping at map edges or hiding
  their entrance dot; use one consistent placement rule instead of manual offsets.
- Marker locations, zone destinations, layer bounds, and terrain geometry are
  unchanged. The legend agrees with the generated palette, including roads.
- Overview label reduction preserves name discovery by mouse, keyboard, and touch;
  marker/name toggles, zoom/reset, continent jumps, panning, and layer changes
  behave consistently. Labels do not obscure entrance interaction or gestures.
- Shared previews still show no labels/markers/controls. The ship radar image
  retains correct contact alignment. Repeated navigation and zoom do not leave
  duplicate overlays/listeners or cause additional per-room network requests.
  Exercise slow entrance responses while switching layers, toggles, and routes;
  stale results must not restore obsolete names or markers.
- Inspect 390×844, 768×1024, 1023×900, 1024×900, and 1440×1000 CSS viewports,
  plus 200% browser zoom, keyboard focus, and reduced motion. Check that page
  controls remain reachable above mobile navigation with no horizontal page
  overflow, including the narrow-screen legend disclosure. Check 639px/640px
  around its `sm` transition. Capture screenshots outside the checkout and
  record exact states. Review neatness at intended display size: consistent
  label rhythm, aligned controls, clear map area, and no competing help/legend
  overlays. Contrast checks alone do not prove the visual design is successful.
- Use the available Browser skill for rendered checks; if unavailable, use
  existing Playwright tooling and record the reason. Do not add dependencies
  or claim screenshots/unit tests prove behavior that was not exercised.

Add focused behavior coverage for all four visibility states through zoom/layer
changes, preserved zone-click destinations, long/markup-bearing names rendered
as text in tooltips and popups, stale-response rejection, and the shared
preview's hidden-label configuration. Include co-located destination access if
that path is needed. There is no current dedicated Leaflet map test; use the
existing frontend test setup rather than a new harness. Add a small synthetic
image-generation test using mocked rows and
an isolated cache to verify decoded PNG dimensions, sector/road colors, and
coordinate placement, plus known-sector coverage and unknown-sector fallback.
Check legend swatches against the renderer's decoded output, not just a second
copy of the expected palette. Avoid tests that merely repeat CSS declarations.

Run from the isolated checkout root and record exact commands/results:

```bash
pnpm --dir frontend test:unit --run src/utils/__tests__/mapLayerImageUrl.spec.ts
# Also run the focused map behavior specs added during implementation.
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend build
pnpm --dir backend test --runInBand wikiMapReadiness
# Also run the focused image-generation spec added during implementation.
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend build
```

Both packages change, so validate both. Backend tests use isolated fixtures;
production/shared data is not a test target. The planned renderer change adds
no database/MUD writes; if implementation changes a database/MUD-write path,
also run `pnpm --dir backend verify:mud-writes`. Follow the
[quality matrix](../development.md#complete-quality-matrix) for applicable gates
and report checks not run. Source checks do not establish live deployment.

## Release and cache handling

Follow [build and validate](../deployment.md#build-and-validate); building into
this production checkout's `frontend/dist` publishes immediately. Implementation
and browser verification belong in an isolated checkout. Deploy only within an
authorized release using the existing deployment/recovery procedure.

The API PNG is cached in Redis and browsers for one hour. A separate static
origin, when configured, serves generated PNG objects with seven-day caching;
the frontend service worker also caches static image paths. The ship radar has
an additional 24-hour IndexedDB image cache. Account for these separately:
refresh only affected map-image keys/objects in an authorized deployment, and
either use a narrow image revision/cache refresh where required or document and
verify the actual expiry window. Do not flush unrelated caches or assume a
server restart updates every browser. Check both a fresh profile and a returning
profile, and verify the origin/path actually selected by configuration.

Use the [news-update skill](../../.agents/skills/news-update/SKILL.md) during
implementation and release. Draft reader-facing wording: “Wiki map zone names
are easier to read, with clearer text, wrapping, and calmer terrain colors.”
Reconcile it with existing Website Changelog coverage; publish through the admin
UI/API only after the described release is verified live, then verify saved
content and its public rendering. This planning-only change needs no public
changelog entry because website behavior has not changed.

## Implementation record — 2026-10-20

- Outcome: readable complete zone names, calmer generated terrain, and usable
  responsive controls, following DESIGN.md. The scope and non-goals above remain.
- Work starts from `65c7ad9` in an isolated `feat/wiki-map-readability` worktree;
  no build is run into the live checkout. Keep source, screenshots, command logs,
  and recovery evidence identified in the final verification record.
- Ablation review: the existing Leaflet/events and explicit palette tables are
  sufficient. No new engine, dependencies, shared package, or collision system.
  Required async-response protection and coordinate grouping stay in scope.
- Browser plugin not available; using existing Playwright and its already
  installed Chromium runtime/libraries. Flow: `/wiki/map` → layers, zoom,
  entrance/name toggles and destinations → readable, correctly placed content.
- Pending: baseline captures, implementation, focused tests/package gates,
  matched visual/interaction checks, preview deployment/cache verification,
  and published Website Changelog verification.

### Baseline and first implementation

- Captured anonymous public-map geography (no player data) on all three layers
  at 1440×1000 and 390×844, overview/reading/close; retained PNGs, entrances,
  bounds and capture metadata outside the checkout. Synthetic names are used
  for markup, extreme lengths, shared coordinates, and delayed-response checks.
- Surface has 370 rows at 366 coordinates; two coordinates lead to multiple
  distinct destinations. These now use a coordinate-anchored destination chooser.
  Distinct coordinates and all source rows remain intact. Underdark has 101
  entrances; Alatorin has 75. Initial surface fitted zoom is 0.9 desktop and
  -0.2 phone. Alatorin has different bounds (0–99 × 0–38).
- Implemented 14px/1.25/600 bone names with a solid ink outline; 16px at zoom 4.
  A first screenshot pass rejected permanent labels at zoom 2 as too crowded.
  Fine-pointer overview now uses hover/focus disclosure below zoom 3 (8px per
  room), with permanent names at/above 3. Touch and names-only retain names at
  every zoom; explicit Names off still wins. Continent jumps use zoom 3.
- Added request-generation checks, pending-request reuse, unified layer/bounds
  updates, resize handling, and timer/listener cleanup. Literal DOM text replaces
  HTML name sinks. Shared preview remains terrain-only.
- Muted terrain covers all known sectors 0–39. The compact keyboard/touch terrain
  key uses explicit matching sector IDs; help sits on an ink footer outside
  the map, clear of the visibility controls.
- First focused run: 14 frontend and 9 backend tests pass. Image tests decode
  actual renderer output and compare every known sector with the view's legend,
  plus unknown-sector/background, scale, placement, layer filters and cache.
  Final checks will be repeated after visual tuning.

### Verification and release preparation

- Matched before/after captures use the same 1382×748 map viewport, center,
  layer and exact zoom: Surface/Underdark at 0.9, 3 and 4; Alatorin at 3.8,
  4.5 and 6. Full screenshots and JSON metadata are retained privately. Dense
  distinct entrances separate at closer zoom; all entrances remain represented.
- Responsive browser checks passed at 390×844, 639×900, 640×900, 768×1024,
  1023×900, 1024×900 and 1440×1000: all visibility combinations, controls,
  continent jumps, keyboard terrain disclosure, no horizontal overflow, and
  no clipped visible names at reading zoom. Reduced-motion checks passed.
- Actual Chromium browser zoom at 200% was exercised in an isolated Xvfb
  display using native keyboard shortcuts (1440px window → 720 CSS pixels,
  devicePixelRatio 2). The map key remains keyboard-reachable above navigation.
- Measured label styles: 14px / 17.5px / 600 at zoom 3, 16px / 20px at zoom 4,
  opacity 1, foreground `#ece8dd`, solid outline `#111310`; contrast 15.3:1.
  Reviewed on bright/desert/snow and dark terrain; names wrap completely,
  including synthetic long unbroken and markup-bearing strings.
- Shared preview renders no entrances or controls. The real ship radar with
  synthetic contacts uses the revised PNG and preserves coordinate alignment:
  world (200,200) → (50.1253%,50.1253%), contact (205,200) →
  (51.3784%,50.1253%). A seeded old IndexedDB image was bypassed.
- Late layer-bounds responses cannot replace the selected layer. An edge-popup
  browser test found that automatic panning closed a destination chooser; fixed
  by preserving its open coordinate and focused destination through refresh.
  The regression now passes in both component and rendered browser checks.
- The only added scope is coordinated image revision `20261020` in Redis, API/
  static image URLs, and the radar IndexedDB key. Existing bytes expire naturally;
  no unrelated cache is flushed. Production has no separate static origin
  (`R2_ENABLED=false`); both URL-selection branches remain covered by tests.
- Deployment preflight passes against the real production configuration and
  dependencies (93 existing migrations). No migration or extraction is needed.
  Previous compiled artifacts match the retained deployed release byte-for-byte;
  previous runtime source matches `9b6196a`. The application has PrivateTmp off,
  so its restart does not remove a systemd private temporary directory.
- Changelog review covers all 23 saved entries, including drafts: no matching
  map-readability entry exists. The previous release is covered by entry 37.
  Prepared “A clearer view of the world”, version `2026.10.20`; publication
  waits for live preview acceptance.
- Quick preview deployment is the authorized scope. Full repository suites,
  native database rehearsals, long burn-in, backup/restore qualification, and
  `verify:mud-writes` are not run here: there are no database/MUD-write changes,
  and the owner will perform the full proper deployment separately.

### Commands and results

Commands below run from the isolated checkout. Installed dependencies were
reused without changing either lockfile. `--config.verify-deps-before-run=false`
prevents pnpm from attempting an unnecessary install through the dependency
links. Initial test-fixture path/zoom mocks and a test-only readonly assignment
were corrected; the final runs below pass. No dependency was added.

```bash
pnpm --config.verify-deps-before-run=false --dir frontend test:unit --run src/components/wiki/__tests__/LeafletMap.spec.ts src/utils/__tests__/mapLayerImageUrl.spec.ts src/utils/__tests__/shipCoordinates.spec.ts
# PASS: 3 files, 22 tests
pnpm --config.verify-deps-before-run=false --dir backend test --runInBand wikiMapImage wikiMapReadiness
# PASS: 2 suites, 9 tests
pnpm --config.verify-deps-before-run=false --dir frontend format:check
pnpm --config.verify-deps-before-run=false --dir frontend lint
pnpm --config.verify-deps-before-run=false --dir frontend type-check
pnpm --config.verify-deps-before-run=false --dir frontend build
pnpm --config.verify-deps-before-run=false --dir backend format:check
pnpm --config.verify-deps-before-run=false --dir backend lint
pnpm --config.verify-deps-before-run=false --dir backend type-check
pnpm --config.verify-deps-before-run=false --dir backend build
./frontend/scripts/check-palette-literals.sh
./scripts/check-config-literals.sh
pnpm --config.verify-deps-before-run=false --dir frontend config:check
# All PASS
```

The freshly compiled `productionPreflight.js --configuration` and
`productionPreflight.js --dependencies` also pass using the actual production
backend working directory/environment and isolated release's migration bundle.
No production build, migration, database test, or map re-extraction was run.

Supporting commands: `git status/log/worktree/diff/archive`, `rg`, `cat`/`sed`,
Python source/manifest checks, targeted `biome format --write`, Node fixture
rendering (mock database/cache; public map rows), and Playwright scripts
`baseline.mjs`, `candidate-visual.mjs`, `matched-browser.mjs`, `qa-browser.mjs`,
`shared-browser.mjs`, `edge-popup.mjs`, and `zoom-headed.mjs`. Read-only
`systemctl --user show/list-units` establishes the deployment target.
Screenshot evidence includes normal and reduced motion, all three layers,
synthetic long names, keyboard chooser, mobile key, shared preview, radar,
and native 200% browser zoom. Headless preference/shortcut attempts did not
change browser zoom; the headed Xvfb/native-key check is the actual zoom proof.

# Wiki world map readability plan

Prepared 2026-10-19. **Status: planned; implementation and deployment have not started.**
Source inspected: `467532462b76bb11ed4c8a7f2455ff5b3a59af41`.

## Outcome and scope

Make `/wiki/map` easier to read, especially zone names, using the visual treatment
of the [reference map](https://drevarr.github.io/New_Duris_Surface_Map.html).
Keep DurisWeb's existing extraction, database projections, generated terrain
images, automatic entrance placement, and Leaflet rendering. The reference is
visual evidence; its HTML, PNG, hardcoded locations, and icons are not inputs to
our map.

Work is limited to label presentation, zoom-dependent label density, a quieter
generated terrain palette, and the matching legend. Preserve Surface, Underdark,
and Alatorin, continent jumps, map bounds, coordinates, panning, zoom/reset,
marker/name toggles, and clicks through to zone details.

**Non-goals:** a new map engine, imported artwork, manually positioned labels,
search/sidebar features, dragon/ferry data, live positions, new dependencies,
API or schema changes, MUD changes, and changes to other map renderers. This
document authorizes planning only; it does not publish website changes.

## Current implementation and constraints

- [WikiMapView.vue](../../frontend/src/views/wiki/WikiMapView.vue) owns the page,
  toolbar, layer/continent selection, legend, and zone navigation.
- [LeafletMap.vue](../../frontend/src/components/wiki/LeafletMap.vue) overlays
  the generated PNG and fetches entrances for the visible area. Labels currently
  use 11px, weight 500, a light shadow, and unwrapped text to the marker's right.
- [wikiService.ts](../../backend/src/services/wikiService.ts) generates the PNG
  from `wiki_map_positions`, drawing a colored block per room. Its terrain table
  and the page's legend are separate and must agree. The renderer currently
  defines sectors 0–29; Road (37) appears in the legend but falls back to the
  layer background in the renderer. Address that directly related readability
  gap when updating the palette; verify other used sectors against the existing
  website sector definitions.
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
state, or 9px text size. Start labels at `0.75rem` with weight 600–700 and about
1.15 line height; tune against rendered evidence. Keep complete names available
and check contrast over light and dark terrain. A dark halo must be sufficiently
solid to separate bone text from snow/desert; token usage alone is not proof.
Record the final map-specific label/terrain rules in the existing game-content
section of `DESIGN.md`, with source links; do not relax global design rules.

## Implementation sequence

1. **Capture the baseline.** In an isolated development checkout, capture the
   same bounds at overview, normal reading, and close zoom on all three layers.
   Include dense entrance clusters, a long name, forest, ocean, desert, and
   arctic terrain. Record the data fixture, viewport, and zoom for comparison.
   The reference supplies appearance, not authoritative names or geography.

2. **Improve labels first.** In `LeafletMap.vue`, use bone text with an ink
   outline/shadow, stronger weight, centered alignment, and a bounded width
   (initially about `9rem`) with natural wrapping. Anchor the label above or
   below its entrance so the dot and click target remain visible. Let Leaflet
   position overlays; avoid CSS transforms that overwrite its positioning.
   Scope label CSS to this map component/container so generic Leaflet styles
   and other maps are unaffected. Preserve ANSI-code stripping and insert zone
   names as text rather than interpolating untrusted HTML into new label markup.

3. **Tune label density with actual zoom.** Keep a readable screen-space size
   at normal zoom, with a small bounded increase at close zoom. Reduce permanent
   labels at overview instead of shrinking them into illegible text; retain
   marker hover/focus names and zone navigation. When markers are hidden but
   names are enabled, retain permanent names so entrances remain discoverable.
   Calibrate thresholds against
   our room-coordinate map, viewport, and fitted overview, rather than copying
   the reference's image-pixel zoom values. Keep an explicit names-off toggle
   off across zoom, pan, resize, and layer changes. Use the existing Leaflet
   events and lifecycle; no collision engine, per-zone offsets, or new settings.
   Dense adjacent names must become readable when zooming in.

4. **Quiet the generated terrain and align the legend.** Update the existing
   sector RGB table and background colors in `wikiService.ts`, then the matching
   swatches in `WikiMapView.vue`. Maintain sector IDs, geometry, dimensions,
   layer filtering, unknown-sector fallback, and the meaning of each terrain
   type. Include a distinct Road (37) color. Review the palette on Underdark and
   Alatorin as well as Surface; muted colors must still distinguish terrain.
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
  normal text; screenshots alone do not establish accessible contrast.
- Marker locations, zone destinations, layer bounds, and terrain geometry are
  unchanged. The legend agrees with the generated palette, including roads.
- Overview label reduction preserves name discovery by hover/keyboard focus;
  marker/name toggles, zoom/reset, continent jumps, panning, and layer changes
  behave consistently. Labels do not obscure entrance interaction or gestures.
- Shared previews still show no labels/markers/controls. The ship radar image
  retains correct contact alignment. Repeated navigation and zoom do not leave
  duplicate overlays/listeners or cause additional per-room network requests.
- Inspect 390×844, 768×1024, 1023×900, 1024×900, and 1440×1000 CSS viewports,
  plus 200% browser zoom, keyboard focus, and reduced motion. Check that page
  controls remain reachable above mobile navigation with no horizontal page
  overflow. Capture screenshots outside the checkout and record exact states.
- Use the available Browser skill for rendered checks; if unavailable, use
  existing Playwright tooling and record the reason. Do not add dependencies
  or claim screenshots/unit tests prove behavior that was not exercised.

Add focused behavior coverage for label visibility through zoom/layer changes,
explicit toggle state, preserved zone-click destinations, long text rendered
safely, and the shared preview's hidden-label configuration. There is no current
dedicated Leaflet map test; use the existing frontend test setup rather than a
new harness. Add a small synthetic image-generation test using mocked rows and
an isolated cache to verify decoded PNG dimensions, sector/road colors, and
coordinate placement. Avoid tests that merely repeat CSS declarations.

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

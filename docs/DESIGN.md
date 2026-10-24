# DurisWeb design

This is the central guide to the website's visual design and interaction
patterns. Use it when adding a page, changing a component, writing interface
copy, or preparing imagery. It describes the implemented **eclipse** design
and gives review criteria for new and changed UI.

Exact token values and component behavior remain in source. Specialized
contracts, configuration ownership, and asset provenance remain in the linked
guides below; those sources link back here. Keep both sides current when a
design decision changes. System and database design live in
[Architecture](ARCHITECTURE.md).

## Contents

- [Visual direction](#visual-direction)
- [Colors and surfaces](#colors-and-surfaces)
- [Typography](#typography)
- [Shared components](#shared-components)
- [Layout and responsive behavior](#layout-and-responsive-behavior)
- [Content and imagery](#content-and-imagery)
- [Interaction and accessibility](#interaction-and-accessibility)
- [Game content and charts](#game-content-and-charts)
- [Adding or changing a page](#adding-or-changing-a-page)
- [Verification](#verification)
- [Sources and related guides](#sources-and-related-guides)

## Visual direction

The eclipse design combines near-black ink surfaces, warm bone text, vermilion
accents, serif display headings, fine rules, and rectangular controls. The
homepage establishes the editorial treatment: large headings, atmospheric
artwork, numbered pathways, and generous section spacing. Application pages
use the same palette and shared controls at a density suited to their task.

There is one dark application palette, with `color-scheme: dark`. A paper
reading section is an explicit local treatment, not a second application theme.
Use vermilion for brand emphasis and prominent destinations; use status colors
with labels that explain their meaning. Game-authored colors have a separate
contract described under [game content](#game-content-and-charts).

## Colors and surfaces

[`main.css`](../frontend/src/assets/main.css) owns the Tailwind `@theme` tokens,
the shadcn-vue semantic mapping in `:root`, base styles, and shared utilities.
Use semantic classes for application UI, such as `bg-background`,
`text-foreground`, `text-muted-foreground`, and `border-border`. Named eclipse
utilities are available when the visual role needs to be explicit.

| Role | Named tokens | Semantic mapping or use |
|---|---|---|
| Page and recessed content | `ink`, `ink-sunken` | `background` uses ink; inputs, code blocks, and terminal-like content can use sunken ink. |
| Layered surfaces | `ink-raised`, `ink-high`, `ink-top` | `card`, `popover`, and `muted` use raised ink; `secondary` and `accent` use high ink. |
| Main and supporting text | `bone`, `bone-muted`, `faint` | `foreground` uses bone. `muted-foreground` has its own value; it is not an alias for faint. |
| Rules and focus | `rule`, `vermilion` | `border` and `input` use rule; `ring` uses vermilion. |
| Brand | `vermilion`, `vermilion-light`, `vermilion-deep`, `vermilion-hover` | `brand` uses the deep shade with `brand-foreground`; links and accents use vermilion. |
| Supporting accents | `ember`, `label` | Warm accent and monospace index-label text. |
| Status | `success`, `warning`, `danger`, `info`, each with a `-deep` step | Foreground/icon colors on ink; `/15` fills for subtle status badges; deep steps for stronger fills. |
| Paper sections | `bone`, `paper-ink`, `rule-paper`, `vermilion-paper` | Light reading surface, dark text, rules, and links appropriate to that surface. |

`primary` is bone with ink foreground. A default button therefore has a bone
fill and dark text. `brand` is the vermilion call to action. Solid destructive
buttons and badges use `danger-deep` with white text; the brighter
`destructive` semantic token serves other treatments such as validation and
focus rings. Preserve these distinctions when choosing a component variant.

### Paper surfaces and corners

The opt-in `surface-paper` class sets the background, text, prose body/headings,
and link color for long-form reading. It does not remap every dark semantic
token or every nested component. Check headings, muted text, tables, controls,
and rendered editor content on the actual surface. Keep ANSI MUD content on
ink; its colors were not designed for paper.

`--radius` is zero. The theme maps `rounded-xs` and `rounded-md` through
`rounded-4xl` to rectangular corners; `rounded-sm` is the explicit 2px option.
`rounded-full` remains appropriate for avatars and status dots. Editor-authored
images and tables can request rounding through `data-rounded`, and decorative
shapes can use their own radius. Those are local exceptions, not a reason to
change the shared control shape.

### Changing the palette

Add or change tokens in `main.css`, then reference them with utilities or CSS
variables. Update [chart colors](#game-content-and-charts) when their matching
tokens change. Check normal, hover, focus, disabled, and error states on each
surface that uses the color.

[`check-palette-literals.sh`](../frontend/scripts/check-palette-literals.sh)
rejects numbered raw Tailwind classes from **gray, cyan, zinc, slate, neutral,
and stone** in frontend Vue, TypeScript, CSS, and HTML. It does not detect all
hardcoded hex values, other palette families, or insufficient contrast. A
passing guard is one check, not a complete visual review. Its game-color
exceptions are documented [below](#game-content-and-charts).

## Typography

| Use | Typeface and treatment |
|---|---|
| Wordmark, page/section headings, brand calls to action | Cormorant Garamond, with Georgia/serif fallback. Use weight 400; regular and italic are the shipped faces. |
| Application body, forms, tables, ordinary controls | System sans via `font-sans`. |
| Indexes, rails, compact metadata | `font-label` monospace; `index-label` supplies uppercase, tracking, size, and label color. |
| Commands and code | Monospace; preserve whitespace where it carries meaning. |

Global `h1` and `h2` styles use the display face at weight 400 with font
synthesis disabled. Avoid adding bold utilities to those headings. Use a
logical heading hierarchy independently of visual size.

[`fonts.css`](../frontend/src/assets/fonts.css) declares locally hosted regular
and italic Latin subsets with `font-display: swap`. The build's
[`preloadDisplayFonts`](../frontend/vite.config.ts) plugin preloads their hashed
WOFF2 assets. The [SIL Open Font License](../frontend/src/assets/fonts/OFL.txt)
stays beside the font files. No runtime Google Fonts request is needed.

The homepage retains its own editorial type scale and Arial/Helvetica body
stack in [`FrontPageView.vue`](../frontend/src/views/FrontPageView.vue). Use the
shared application typography as the starting point for other pages.

## Shared components

Import brand components from
[`@/components/brand`](../frontend/src/components/brand/index.ts). Their shared
styles live in `main.css`.

| Component | Contract |
|---|---|
| `DisplayHeading` | `level` is `1`, `2`, or `3` (default `1`). `size` is `page`, `section`, or `none`; the default follows the level. Wrap emphasis in `<em>` for vermilion italic. `none` allows a page-specific scale. |
| `IndexLabel` | Uppercase monospace label; `as` chooses the element (default `span`). It does not replace a heading. |
| `SectionRule` | An `hr` with a 1px rule-colored border and no built-in margin; the surrounding layout owns spacing. |
| `BrandActionLink` | Internal `RouterLink` with required `to`, a trailing decorative arrow, and optional `compact`. Use for a prominent destination. |
| `BrandTextLink` | Internal `RouterLink` with required `to`, display type, and a persistent underline. Use for a secondary destination. |

`DisplayHeading` page size is `clamp(2.5rem, 4.5vw, 4rem)`; section size is
`clamp(1.75rem, 3vw, 2.5rem)`. Brand action links have a 3.875rem minimum height,
or 2.75rem with `compact`. These values are maintained in CSS.

Use the existing [`Button`](../frontend/src/components/ui/button/index.ts)
for actions. Its variants are `default`, `brand`, `destructive`, `outline`,
`secondary`, `ghost`, and `link`; sizes are `default`, `sm`, `lg`, `icon`,
`icon-sm`, and `icon-lg`. A `brand` button uses the brand colors but retains
ordinary button typography. Use links for navigation and buttons for actions;
give non-submit buttons inside forms `type="button"`.

Build forms and overlays from the existing `components/ui/` primitives,
including `Input`, `Label`, `Card`, `Alert`, `Dialog`, and `Sheet`. Preserve
their disabled, validation, focus, title, and description behavior when
composing them. Icons use `@lucide/vue`; decorative icons should be hidden from
assistive technology, and an icon-only control needs an accessible name.

## Layout and responsive behavior

[`App.vue`](../frontend/src/App.vue) owns the shared shell and scroll container.
The document and `#app` occupy the viewport with overflow hidden; ordinary
page scrolling happens in the shell's `main` element. Preserve this when
adding sticky content, dialogs, or nested scrolling regions.

[`RouteMeta`](../frontend/src/router/index.ts) supplies these layout choices:

| Metadata | Behavior |
|---|---|
| `contentGutter` omitted or `true` | Standard content padding. The shell provides mobile bottom clearance, matching scroll padding to keep keyboard-focused links above the bottom navigation, and wider-screen gutter adjustments. |
| `contentGutter: false` | Full-bleed sections, as on the homepage. The page supplies its own internal gutters. Use this instead of negative margins around the shell. |
| `fullscreen: true` | Removes the standard content padding and shell vertical scrolling for immersive views such as the MUD client. |
| `hideNav: true` | Uses the pop-out shell without normal navigation; availability notices and toasts remain. |

Sidebar visibility is separately selected for `/forum`, `/admin`, and
`/dashboard` paths; `fullscreen` is not a general sidebar visibility switch.
Desktop site links and the fixed mobile bottom navigation switch at Tailwind's
`lg` breakpoint. The `/play` route hides the bottom navigation and its header
on smaller screens. Sidebar primitives have their own mobile sheet behavior.

The homepage uses a 105rem maximum section width and a fluid gutter of
`clamp(1.5rem, 5.2vw, 6rem)`. Its editorial layout has separate tablet and
mobile rules at 1199px and 760px; mobile places the hero copy below the image
and stacks the three pathways. Editor-rendered columns stack at 640px.
These are existing context-specific choices, not one universal breakpoint.

For new pages, use the shell's default gutter unless the composition needs
full-bleed sections. Reuse component padding and Tailwind spacing, constrain
long reading lines, and let grids collapse according to their content. Verify
long headings, narrow screens, zoom, and fixed navigation without clipped
controls or unintended horizontal page scrolling. Dense tables and maps may
need an explicit local scroll region.

Shared forum pagination places page numbers above navigation buttons below
the `sm` breakpoint, retaining its stable single row on wider screens. Result
counts and pagination may wrap onto separate rows when their container is narrow.

## Content and imagery

### Copy and public settings

Brand copy can evoke the text-based world, rivalries, exploration, and player
community. Pair that atmosphere with a concrete next action, as the homepage
does with play, news, wiki, PvP, and forum destinations. State feature claims
that can be demonstrated in the product. Use precise, plain language in forms,
empty states, errors, and operational controls.

Public branding, MUD addresses, and homepage content come from `/api/site-config`.
Their database ownership remains in
[Configuration and Environments](environments.md#database-backed-site-settings).
An unavailable configuration is an explicit UI state; do not invent replacement
addresses or branding. The shared site-config composable displays the exact
legacy title `Duris SBS` as `Duris` without rewriting stored settings.

### Homepage assets and configuration

The generated decorative eclipse artwork is
[`duris-eclipse.webp`](../frontend/src/assets/eclipse/duris-eclipse.webp)
(1672 × 941). It is also the default profile banner. The homepage treats the
image as decorative with empty alt text, explicit dimensions, and high fetch
priority. Headings, navigation, and controls remain HTML. The separate root
README banner has its own [asset provenance](assets/readme-banner.md), including
its generation prompt; it is atmospheric artwork, not a gameplay screenshot.

The homepage preserves operator hero visibility, custom title/subtitle, custom
image URL, and sanitized CMS content. Only the exact legacy title, subtitle,
and editor placeholder receive special treatment. Image-only and widget-only
content must remain visible. Carousel, top-fragger, recent-PvP, and map-preview
widgets mount after their content container exists, and unmount when replaced
or when the page leaves. The implementation stays in
[`FrontPageView.vue`](../frontend/src/views/FrontPageView.vue).

Rich text uses the existing `tiptap-content` styles for whitespace, image
alignment, columns, tables, code, lists, and links. Preserve authored structure
when displaying sanitized content. MUD news has a different plain-text and
color-code contract in the [API guide](api/README_api.md#mud-news-publishing).

### Preparing images and screenshots

Use original interface captures to demonstrate product features. Keep artwork
and screenshots clearly identified, and use captions to explain what a reader
should notice. Capture with synthetic or approved demonstration data and
exclude player data, credentials, and private chat.

Record the capture source, product revision, viewport, and demonstrated state
when adding screenshot assets. Preserve a readable interface at the intended
display size, keep its aspect ratio, and provide useful alt text for meaningful
images. Decorative images use empty alt text. Set image dimensions to reserve
space; give high fetch priority only to important initial-viewport imagery,
and consider lazy loading for images below it. Keep asset provenance and
licenses beside the assets and link them here.

The [Mudlet GUI page screenshot record](../frontend/src/assets/mudlet-gui/README.md)
documents native captures of the downloadable client with invented demonstration
data, release identity, image checksums, and reproduction steps. The original
[planning captures](ongoing-projects/assets/mudlet-gui/README.md) remain available
with their separate source revision and provenance.

## Interaction and accessibility

For new and changed UI, review the complete interaction, not just its resting
appearance:

- Keep a logical heading order, semantic landmarks, explicit form labels, and
  meaningful control names. Test keyboard access, visible focus, dialog
  dismissal, and focus returning to an appropriate control.
- The base stylesheet supplies a 2px vermilion focus outline with a 4px offset;
  UI primitives also have component focus treatments. Do not remove focus
  visibility when overriding styles. Check it against the actual background.
- Use text or an icon with a label alongside status color. Check contrast for
  text, controls, and focus indicators in their rendered states, including
  paper surfaces and translucent fills. A token name does not prove contrast.
- Distinguish loading, empty, unavailable, validation-error, and success states.
  Use `role="status"` or `role="alert"` as appropriate to announce changes.
  Pending actions should communicate progress and prevent duplicate submission.
- Use native form submission. The login form is the existing example: account
  and password fields share one form and appropriate autocomplete values;
  Enter and the Login button use the same handler; Back to Home only navigates.
- Keep motion optional. The hero's pause control and
  `prefers-reduced-motion` both stop its animation. Explore moves focus to the
  world section and avoids smooth scrolling when motion is paused or reduced.
  Shared brand transitions also respect reduced motion. Check other animated
  components individually; this is not a global animation-disable mechanism.
- Availability notices use a dismissible dialog and a persistent Details
  banner. Retry rechecks availability and configuration without replaying the
  user's failed action. The standalone outage page has no external asset
  dependencies. The complete flow and operational contract remain in
  [Website availability notices](../deploy/maintenance/README.md#behavior).
- Notification sounds supplement visible notifications. Keep custom sounds
  short and normalized, and account for browser playback restrictions. The
  asset location, volume, and beep fallback remain documented in
  [Notification Sounds](../frontend/public/sounds/README_sounds.md).

These are design and review requirements, not a claim that every route has
passed an accessibility audit. Automated component tests do not replace browser
checks for focus, layout, contrast, zoom, and motion preferences.

## Game content and charts

### Game-authored colors

Theme changes must preserve the meaning of MUD text, player highlights, map
terrain, and faction data. The palette guard excludes `ansiParser.ts`, the
editor's `MudColorExtension.ts`, `types/trigger.ts`, and the ANSI parser spec.
Smaller game-color tables use paired `palette-literals: off` and
`palette-literals: on` comments. Keep exemptions limited to game semantics.

The [ANSI parser spec](../frontend/src/utils/__tests__/ansiParser.spec.ts) pins
the parser's color mappings and rendered sample, and checks editor round trips.
It does not test every game-color consumer. Review the affected editor,
highlight, or map consumer as well when changing one of those paths.

Recipient-specific web chat uses a separate server presentation snapshot and
palette-ID mapping. It has no competing browser color preference; structured
chat blink stays steady for accessibility. Its validation, fallback behavior,
named `--mud-*` variables, and history contracts remain together in
[Recipient colors in web chat](CHAT-COLORIZATION.md). Do not infer those IDs
from ANSI SGR order or assume that all legacy ANSI animation shares that policy.

### Wiki world map

The initial map data load retries interrupted requests, timeouts, and temporary
server failures twice with a short delay. A persistent failure shows an actionable
error and a Retry button that fetches the data again without reloading the page.
Login, permission, and rate-limit refusals explain the problem without automatic
retries. Navigating away prevents further recovery requests.

[`LeafletMap.vue`](../frontend/src/components/wiki/LeafletMap.vue) gives names the
first visual emphasis: system sans, bone on a compact solid ink outline, weight
600, 1.25 line height, centered natural wrapping within 10rem, with emergency
word breaking and no truncation. Names are 0.875rem, increasing to 1rem at
Leaflet zoom 4. Tooltip opacity is 1. A consistent edge rule puts a name below
its entrance when space above is insufficient and keeps its text inside the map.
The entrance coordinates never move.

With a fine pointer and markers visible, zooms below 3 use hover/focus name
disclosure; zoom 3 and above show permanent names. In this room-coordinate CRS,
zoom 3 means eight screen pixels per room. Touch and names-only views retain
permanent names at every zoom. Explicit Names off suppresses permanent names;
both toggles off produce terrain only with no entrance tab stops. Each zone
number receives one permanent name among its visible entrances, chosen in stable
top-to-bottom, left-to-right coordinate order. Panning can move the name to
another entrance when the labelled one leaves view. Other entrances retain
their markers, hover/focus disclosure, and navigation. Distinct zones with the
same name remain distinct.

Co-located destinations share a keyboard-operable chooser; their permanent
label contains only zone names not already shown elsewhere. Separate coordinates
remain separate entrances. Names-only mode shows one visible text focus target
per labelled entrance and omits duplicate-only entrances. Zooming further
separates nearby entrances; no manual positioning is used.

The generated terrain uses muted greens, earth tones, and blue water, with
recognizable snow, desert, volcanic, and Underdark sectors. Its explicit RGB
table in [`wikiService.ts`](../backend/src/services/wikiService.ts) and the
sector-labelled key in [`WikiMapView.vue`](../frontend/src/views/wiki/WikiMapView.vue)
cover sectors 0–39 and are compared against decoded image pixels in tests.
Unknown sectors retain the layer background. Palette changes must preserve
geometry and all consumers, including terrain-only previews and the ship radar.
Use a coordinated image/cache revision when a palette release must bypass older
API, static-image, or persistent radar caches.

#### Painted view and docks

The main map page starts in a painted view: the browser paints the terrain from
the sector grid served by `/api/wiki/map/sectors`, in web workers, with
[`painter.ts`](../frontend/src/utils/paintedMap/painter.ts). The original
generated image stays underneath, so it shows while painting runs and whenever
**Painted map** is off; browsers without workers keep the original only.
Painting is deterministic and tiled: overview tiles use 8 pixels per room and
are requested and mounted for the viewport plus a 25% margin. From zoom 3,
centre-first detail uses 16 or 32 pixels per room, selected from the zoom and
device pixel ratio (capped at 2). Tiles overlap by one room so no seams show.

Layer changes cancel old work and recycle workers to release prepared grids.
Rock has a separate lower pane, independent of worker completion order. A tile
failure retries once; a repeated tile failure or worker crash returns to the
original map with a visible error. Toggle the painted view to retry with fresh
workers. Access-gated map APIs use `no-store`; the server-side cache still applies.

The current detail request budget is 64 tiles (about 31 MiB decoded at 32 pixels
per room). Both resolutions share a 48 MiB / 128-entry LRU retention budget;
previous-resolution imagery remains visible while its replacement paints.
Stale queued detail is dropped after pans and the worker pool has at most two
workers. Showing a layer
always refetches its sectors; an hourly refresh also replaces the whole source,
invalidating old terrain tiles and prepared worker grids together. Payload size
is checked before base64 decoding. Sector reads coalesce by layer, admit at most
two unfinished reads, have a four-second response deadline and ten-second failure
cooldown. A timed-out read remains shared until its actual I/O settles; SQL has
client and engine statement limits and aborted connections are destroyed.

The painting keeps the sector meanings of the generated image and adds shaded
relief, coasts with surf, tree canopies, roads drawn from one-room lines of city
rooms, reefs from shallows at sea, and bedrock with lit caverns below ground.
Continents are estimated from the seed rooms in the MUD's `src/world/map.c`
using neighbouring land connectivity, colouring Evil violet and Undead with
sere land, grave-glow and red lava. This visual approximation is not the MUD's
authoritative continent assignment, which follows actual room exits and zones. The ten cargo
ports from `src/ships/ship_variables.c` get a pier with a moored ship and, with
**Docks** on, a labelled anchor that adds no tab stop. Keep
[`worldFeatures.ts`](../frontend/src/utils/paintedMap/worldFeatures.ts) in step
with those MUD files.

Keep controls rectangular and on ink, markers vermilion with bone borders, and
help outside the terrain on an ink footer. The terrain key is a compact native
disclosure at every viewport, with a bounded scrollable body. Keep map controls
and the key above the mobile navigation; global chrome and tokens remain shared.

### Charts and third-party UI

[`chartTheme.ts`](../frontend/src/utils/chartTheme.ts) supplies resolved color
strings for canvas chart options. Keep its palette in step with the matching
CSS tokens; a raw `var(--color-…)` string is not resolved by this helper.
Use its text, grid, tooltip, series, faction, and heat-scale helpers instead of
repeating chart palettes. Faction meanings and their colors are explicit in
that module. Keep labels or legends alongside color-coded data.

`main.css` also owns the themed scrollbars, NProgress bar, dark vue-sonner
toasts, and Leaflet control chrome. Map imagery and terrain colors represent
data and remain separate from those controls.

## Adding or changing a page

1. Choose the user task, heading hierarchy, primary action, and required
   loading/empty/error states. Check claims and destinations against the
   implemented feature and configured public settings.
2. Add the view and route using existing patterns. Choose the gutter contract
   deliberately, and update relevant desktop and mobile navigation together.
3. Compose shared brand and UI components with semantic tokens. Start with
   normal document flow; use page-specific layout rules only where needed.
4. Add meaningful imagery with alt text, dimensions, and provenance. Preserve
   existing CMS, game-color, and availability contracts where they apply.
5. Verify the affected behavior and rendered states using the checks below.
   Update this guide if the change establishes a new shared design decision.

A basic page within the standard shell can start with:

```vue
<script setup lang="ts">
import { BrandActionLink, DisplayHeading, IndexLabel, SectionRule } from '@/components/brand'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <header class="space-y-4">
      <IndexLabel as="p">Explore Duris</IndexLabel>
      <DisplayHeading>Your next <em>adventure.</em></DisplayHeading>
      <p class="max-w-prose text-muted-foreground">Explain the page's purpose and next step.</p>
    </header>
    <SectionRule />
    <BrandActionLink to="/play">Enter the world</BrandActionLink>
  </div>
</template>
```

## Verification

Run commands from the repository root. Select the existing tests relevant to
the changed behavior; extend them when behavior changes require coverage.

| Contract | Existing test |
|---|---|
| Homepage copy/configuration, content visibility, sanitization, widgets, pause control, failure state | [`FrontPageView.spec.ts`](../frontend/src/views/__tests__/FrontPageView.spec.ts) |
| Public configuration and legacy title presentation | [`useSiteConfig.test.ts`](../frontend/src/composables/__tests__/useSiteConfig.test.ts) |
| Mudlet GUI content, download/support links, image descriptions, and configuration states | [`MudletGuiView.spec.ts`](../frontend/src/views/__tests__/MudletGuiView.spec.ts) |
| Native login submission, pending state, errors, and navigation | [`LoginView.spec.ts`](../frontend/src/views/__tests__/LoginView.spec.ts) |
| Availability reasons, dismissal, reopening, and read-only Retry | [`SiteAvailabilityNotice.spec.ts`](../frontend/src/components/__tests__/SiteAvailabilityNotice.spec.ts) |
| ANSI mappings, escaping, and editor round trips | [`ansiParser.spec.ts`](../frontend/src/utils/__tests__/ansiParser.spec.ts) |
| Structured chat rendering and history | [`ChatPresentation.spec.ts`](../frontend/src/components/mud/__tests__/ChatPresentation.spec.ts), [`ChatPresentationHistory.spec.ts`](../frontend/src/components/mud/__tests__/ChatPresentationHistory.spec.ts) |

For example, for a homepage change:

```bash
pnpm --dir frontend test:unit --run src/views/__tests__/FrontPageView.spec.ts src/composables/__tests__/useSiteConfig.test.ts
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
```

Runtime changes also require the applicable build. On the production checkout,
building into `frontend/dist` publishes immediately: follow the detached
worktree procedure in [Deployment](deployment.md#build-and-validate).
[Development](development.md#complete-quality-matrix) owns the complete quality
matrix; report checks run and any checks not run.

For rendered changes, inspect a narrow phone viewport, tablet, desktop, and
the relevant breakpoint boundaries. Check long content, zoom, keyboard focus,
reduced motion, image loading, status states, and relevant authenticated/public
views. Record actual viewports and screenshots when providing visual evidence.
Keep test evidence distinct from claims about live deployment.

For documentation changes, verify relative file links, heading anchors, and
backlinks to retained sources. Preserve useful old anchors when moving sections
so existing references still lead readers to the canonical guidance.

## Sources and related guides

These sources retain details that belong with their implementation or domain.
The links are part of this guide; avoid copying their full contracts here.

| Source | Details retained there |
|---|---|
| [`main.css`](../frontend/src/assets/main.css) | Exact token values, semantic mapping, radii, shared classes, third-party chrome, and rich-text styles. |
| [`fonts.css`](../frontend/src/assets/fonts.css) and [Vite configuration](../frontend/vite.config.ts) | Font declarations, asset paths, and build-time preload behavior; the license stays with the fonts. |
| [Brand exports](../frontend/src/components/brand/index.ts) and [button variants](../frontend/src/components/ui/button/index.ts) | Component implementations and exact styling APIs. |
| [`App.vue`](../frontend/src/App.vue) and [router](../frontend/src/router/index.ts) | Scroll ownership, navigation, gutter, and pop-out layout behavior. |
| [`FrontPageView.vue`](../frontend/src/views/FrontPageView.vue) | Editorial composition, responsive rules, CMS mounting, and hero motion. |
| [`chartTheme.ts`](../frontend/src/utils/chartTheme.ts) | Canvas color values, faction mapping, and series/heat helpers. |
| [Palette guard](../frontend/scripts/check-palette-literals.sh) | Exact scan scope and game-color exemptions. |
| [Chat colorization](CHAT-COLORIZATION.md) | Recipient presentation protocol, palette IDs, escaping, fallback, and history behavior. |
| [README banner provenance](assets/readme-banner.md) | Artwork origin and generation prompt. |
| [Availability notices](../deploy/maintenance/README.md) | App and standalone outage flows, operational reasons, and verification. |
| [Notification sounds](../frontend/public/sounds/README_sounds.md) | Optional audio asset, playback volume, browser restrictions, and fallback. |
| [Configuration](environments.md#database-backed-site-settings) | Public mutable branding/content ownership and unavailable-state contract. |
| [HTTP API](api/README_api.md) | Data and publishing contracts that the UI must preserve. |
| [Architecture](ARCHITECTURE.md) | System, integration, and database design. |
| [Conventions](CONVENTIONS.md), [Development](development.md), and [Frontend guide](../frontend/README_frontend.md) | Contributor rules, commands, and package orientation. |

The [repository documentation index](../README.md#documentation) and
[contribution guide](../CONTRIBUTING.md) link here as the starting point for UI
work. Temporary feature plans belong in `docs/ongoing-projects/`; durable design
decisions belong here or in a linked authoritative source.

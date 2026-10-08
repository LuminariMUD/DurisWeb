# Site-wide design transition — eclipse edition everywhere

Written 2026-10-08. Plan only; no code has changed. The production website is
the single deployment described in
[prod-deploy.md](prod-deploy.md#production-location-authoritative). The
homepage shipped the "eclipse" design on 2026-09-05 (commit `e86c895`, recorded
in [homepage-redesign.md](homepage-redesign.md)). Every other route still uses
the original shadcn-vue slate theme with cyan accents. This plan carries the
homepage design to the whole site in shippable phases.

## Progress

| Phase | State |
| --- | --- |
| 0. Decisions and baseline | Not started |
| 1. Foundation: tokens, fonts, global chrome | Not started |
| 2. Shell: header, navigation, sidebar, banners, shared primitives | Not started |
| 3. Public surfaces sweep | Not started |
| 4. Play client chrome | Not started |
| 5. Admin and builder | Not started |
| 6. Closeout: guard rail, cleanup, documentation | Not started |

Each phase leaves the site coherent and can be deployed on its own. Phase 1
changes the look of every page at once because most components already read
shared theme tokens; the later phases remove the hard-coded colors that the
tokens cannot reach.

## Where the split is today

| Layer | Homepage (`/`) | Everything else |
| --- | --- | --- |
| Palette | Ink `#111310`, bone `#ece8dd`, vermilion `#df583d`, rules `#575743` | shadcn slate oklch tokens in `frontend/src/assets/main.css`; shell is `bg-black text-gray-300`; cyan-400 active state |
| Display type | Cormorant Garamond regular/italic, locally hosted, loaded only by `FrontPageView.vue` | Tailwind preflight system sans; headings are bold sans |
| Body type | Arial/Helvetica | System sans (Tailwind default; `base.css` with an Inter stack exists but is not imported by `main.ts`) |
| Labels | `ui-monospace`, uppercase, tracked | Mixed |
| Controls | Rectangular, no radius; underlined secondary links; 2px vermilion focus outline with offset | `--radius: 0.625rem`; ring-based focus |
| Header and mobile nav | Restyled only on `/` by `.home-header` and `.home-mobile-nav` in `App.vue` | `bg-gray-950 border-gray-800`, cyan-400 active |
| Page gutter | Full-bleed sections; escapes the shell with `margin: -1rem -1rem -5rem` | `main` pads `px-4 py-4 pb-20 lg:pb-4` |
| Progress bar, scrollbar, editor content | Overridden locally for editor content | NProgress `#22d3ee`; scrollbar gray; TipTap links cyan |
| PWA colors | n/a | `manifest.json` `#16213e` / `#1a1a2e`; `index.html` theme-color `#16213e` |

Everything the homepage needs already lives in the repository: the font files
and OFL license under `frontend/src/assets/fonts/`, the declarations in
`frontend/src/assets/home/typography.css`, and the component vocabulary in
`frontend/src/views/FrontPageView.vue`.

## Inventory of what must change

Counted on 2026-10-08 with `grep` over `frontend/src`. Figures are
approximate and exist to size the work, not to be tracked exactly.

| Signal | Count |
| --- | --- |
| Views (`views/` + `views/admin` + `views/builder` + `views/wiki`) | 73 |
| Non-UI-kit components | ≈158 |
| shadcn-vue UI kit files (`components/ui/**`), all token-driven | 180 |
| Files already using semantic tokens such as `text-muted-foreground` | 209 |
| Files with raw `gray-*` classes | 81 (1,072 occurrences) |
| Files with raw `cyan-*` classes | 55 (325 occurrences) |
| Files with raw `zinc-*` classes (builder mockups dominate) | 16 (496 occurrences) |
| Files with raw `slate-*` classes | 50 (110 occurrences) |
| Files with status hues (red/green/yellow/amber/blue/purple/orange) | ≈90, ≈1,400 occurrences |
| Files with hex colors inside `<style>` blocks | 6 |
| Files using `dark:` variants (the `html.dark` class is permanent) | 24 |

Largest single files by raw palette classes:

| File | Raw classes |
| --- | --- |
| `components/forum/editor/TipTapEditor.vue` | 249 |
| `views/PvPListView.vue` | 187 |
| `views/StatsView.vue` | 115 |
| `components/builder/Design4TabbedWorkspace.vue` (mockup) | 98 |
| `views/SearchView.vue` | 94 |
| `views/BattleDetailView.vue` | 93 |
| `components/builder/Design5NotionStyle.vue` (mockup) | 80 |
| `components/builder/Design1SplitPanel.vue` (mockup) | 75 |
| `views/wiki/WikiZoneDetailView.vue` | 48 |
| `App.vue` | 45 |
| `components/mud/TriggerFormDialog.vue` | 41 |

Two categories are deliberately **not** recolored:

- `frontend/src/utils/ansiParser.ts` and
  `components/forum/editor/MudColorExtension.ts` map MUD color codes to Tailwind
  classes. Those are game semantics (a red mob is red), not theme. They stay.
- Status meaning (online/offline, faction, win/loss, warning) keeps its hue.
  Phase 1 defines a status palette tuned to sit on ink; the sweeps route status
  colors through it rather than removing them.

## Decisions to confirm before Phase 1

Each has a recommendation. Record the answer in this file before starting.

1. **Corner radius.** Recommendation: `--radius: 0` site-wide to match the
   homepage's rectangular controls. Inputs, badges and avatars can opt into
   `rounded-sm` where a hard corner reads badly.
2. **Button hierarchy.** Recommendation: `default` becomes bone-on-ink for
   ordinary actions; add a `brand` variant (vermilion block `#b92e1c`, hover
   `#d03b26`, text `#fff4e8`) for calls to action such as Enter the world, Post
   thread and Log in; `destructive` keeps a red that is darker than vermilion
   and is always paired with a confirmation dialog, as the admin wipe and
   level-cap dialogs already do. Alternative: make vermilion the default
   primary, which reads as "danger" next to destructive buttons in admin.
3. **Paper surfaces.** The homepage's bone section is part of the vocabulary.
   Recommendation: ink is the default surface everywhere; bone becomes an
   opt-in `surface-paper` wrapper for long-form reading (guide pages, wiki
   articles, news bodies). Alternative: ink only, bone never used off the
   homepage.
4. **Display type in dense pages.** Recommendation: Cormorant Garamond for the
   wordmark, page titles (`h1`), section headings (`h2`) and brand CTAs only.
   Tables, forms, forum posts and terminal output stay in the sans stack so the
   PvP list and admin tables keep their density.
5. **Icon stroke.** Recommendation: keep Lucide's default stroke width in
   application UI; the homepage's hairline stroke is reserved for large
   decorative icons.
6. **Builder mockups.** `/builder-mockups` and `components/builder/Design1..5`
   are prototypes carrying ≈360 zinc classes. Recommendation: remove the route
   and the five mockup components in Phase 5; they are not a product surface.
   Alternative: leave them untouched and list them in the lint allowlist.

## Target design system

Derived from the values in `FrontPageView.vue` and `App.vue`. Token names
follow the existing `--color-*` convention in `main.css`. Hex values are the
ones already shipped on the homepage so the two surfaces match exactly.

### Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink` | `#111310` | Page background |
| `--color-ink-raised` | `#1a1c18` | Cards, table header rows, popovers (new; nearest existing value is the editor table head `#17110e`) |
| `--color-ink-sunken` | `#0b0908` | Code blocks, table cells, inputs |
| `--color-bone` | `#ece8dd` | Primary text on ink; paper surface |
| `--color-bone-muted` | `#d0cec2` | Secondary copy (hero subtitle) |
| `--color-muted` | `#b8b5a8` | Muted text, editor body copy |
| `--color-faint` | `#898879` | Underlines, placeholder text, dividers on ink |
| `--color-rule` | `#575743` | Borders and rules on ink |
| `--color-rule-paper` | `#999a8d` | Borders on bone (the pathway separators) |
| `--color-paper-ink` | `#171a15` | Text on bone |
| `--color-vermilion` | `#df583d` | Accent text, links, active nav, focus outline |
| `--color-vermilion-deep` | `#b92e1c` | Brand CTA fill |
| `--color-vermilion-hover` | `#d03b26` | Brand CTA hover |
| `--color-vermilion-paper` | `#a3281b` | Link hover on bone |
| `--color-ember` | `#f79250` | Ember particles, warm highlight |
| `--color-label` | `#b3b086` | Monospace rail labels |

Status palette (new; chosen to sit on ink without the neon cast of the
current Tailwind 400 shades): success `#8aa66b`, warning `#d9a553`, danger
`--color-vermilion`, info `#7f9fb0`, plus a muted variant of each at 15%
alpha for badges. Faction and class colors used in PvP and profile views keep
their current meaning and are reviewed for contrast in Phase 3.

### Semantic (shadcn) token mapping

`main.css` currently defines a light `:root` and a `.dark` block, but
`index.html` hard-codes `class="dark"` and there is no toggle. The mapping
below becomes the only palette; the light block is removed and the 71 `dark:`
variants are deleted during the sweeps.

| Semantic token | Maps to |
| --- | --- |
| `--background` / `--foreground` | ink / bone |
| `--card`, `--popover` | ink-raised / bone |
| `--primary` / `--primary-foreground` | bone / ink (see decision 2) |
| `--secondary` | ink-raised / bone |
| `--muted` / `--muted-foreground` | ink-raised / muted |
| `--accent` / `--accent-foreground` | ink-raised / bone (hover surfaces) |
| `--destructive` | vermilion-deep |
| `--warning` | status warning |
| `--border`, `--input` | rule |
| `--ring` | vermilion |
| `--sidebar*` | ink / bone / rule, active vermilion |
| `--chart-1..5` | vermilion, ember, label, bone-muted, info |

### Typography

| Role | Face | Where |
| --- | --- | --- |
| Display | Cormorant Garamond 400, italic for emphasis, tight tracking | Wordmark, `h1`, `h2`, brand CTAs, hero copy |
| Body | `ui-sans-serif, system-ui, Arial, sans-serif` | Everything else |
| Label | `ui-monospace, monospace`, uppercase, `0.1em`–`0.2em` tracking | Index labels, rail text, metadata, timestamps |

Fonts move from `assets/home/typography.css` to a global `assets/fonts.css`
imported by `main.css`, with `<link rel="preload">` for both WOFF2 files in
`index.html` (≈46 KB total, `font-display: swap`). No runtime request leaves
the host.

### Controls and focus

- Rectangular controls (`--radius` per decision 1), 1px rule borders, no
  shadows.
- Links: underline with `text-underline-offset: 0.35rem`, underline color
  faint, hover vermilion.
- Focus: `outline: 2px solid vermilion; outline-offset: 4px` everywhere;
  the ring utilities in the UI kit map `--ring` to vermilion so existing
  `focus-visible:ring-*` classes keep working.
- Motion: respect `prefers-reduced-motion`; the homepage pause control stays
  homepage-only.

### Layout

- `main` stops padding by default. Routes opt into the standard gutter with a
  `contentGutter` meta flag (default on), and the homepage sets it off so the
  negative-margin hack in `FrontPageView.vue` goes away.
- Standard page container: `max-width: 105rem`, gutter
  `clamp(1.5rem, 5.2vw, 6rem)` on marketing-style pages,
  `clamp(1rem, 2vw, 2rem)` on application pages.

### Contrast check (WCAG 2.1 AA)

| Pair | Ratio |
| --- | --- |
| bone on ink | ≈15:1 |
| muted on ink | ≈9:1 |
| vermilion on ink | ≈5:1 (passes normal text; avoid below 14px) |
| `#fff4e8` on vermilion-deep | ≈5.5:1 |
| paper-ink on bone | ≈14:1 |

Recheck with an automated tool in Phase 0 once the status palette is final.

## Phases

### Phase 0 — Decisions and baseline

Scope: no product change.

1. Confirm the six decisions above and record them here.
2. Capture baseline screenshots of the current site at 360, 768 and 1280 px
   for `/`, `/news`, `/pvp`, `/pvp/stats`, `/forum`, `/forum/thread/:id`,
   `/wiki/map`, `/wiki/zones`, `/guide`, `/auction`, `/status`, `/login`,
   `/play` (logged out), `/user/:name`, `/admin/dashboard`. Playwright
   Chromium can be run ad hoc as the homepage work did; it is not added as a
   dependency. Store the images outside the checkout with the release
   evidence, never in the repository.
3. Run the frontend quality matrix on `master` and note any pre-existing
   failures so later phases are measured against a known baseline.

Done when the decisions are recorded and the baseline set exists.

### Phase 1 — Foundation

Scope: `frontend/src/assets/main.css`, new `frontend/src/assets/fonts.css`,
`frontend/index.html`, `frontend/public/manifest.json`, removal of
`frontend/src/assets/base.css`, `frontend/src/assets/home/typography.css`.

1. Replace the slate `@theme` and `:root`/`.dark` blocks with the color tokens
   and semantic mapping above. Keep the `@theme inline` indirection so the UI
   kit keeps reading `--color-*` names.
2. Add the status palette tokens and a `surface-paper` utility (if decision 3
   is yes).
3. Move the font declarations to `fonts.css`, import from `main.css`, preload
   in `index.html`, delete `home/typography.css` and its import in
   `FrontPageView.vue`.
4. Base typography in `@layer base`: `h1`/`h2` display face and scale,
   body sans, link treatment, focus outline, selection color.
5. Retheme the global pieces in `main.css`: scrollbar (rule on ink), NProgress
   bar (vermilion), TipTap content (links vermilion, tables and code on
   ink-sunken, blockquote rule). Then delete the duplicated `:deep(.tiptap-content)`
   block from `FrontPageView.vue` because the global rules now match.
6. Set `manifest.json` `theme_color` and `background_color` and the
   `index.html` `theme-color` meta to ink. Review `public/icons/*` and
   `favicon.ico` for cyan; regenerate from `assets/logo.svg` if needed.
7. vue-sonner: pass CSS variables (`--normal-bg`, `--normal-border`,
   `--normal-text`) in the `Toaster` style prop so toasts match.
8. Delete the unused Vue scaffold: `base.css`, the unrouted `HomeView.vue`
   and `AboutView.vue`, the components `HelloWorld.vue`, `TheWelcome.vue`,
   `WelcomeItem.vue`, and `components/__tests__/HelloWorld.spec.ts`. Verified
   2026-10-08: nothing else imports them.
9. Add `frontend/scripts/check-palette-literals.sh` (same shape as the
   existing config-literal check) that fails on `gray-|cyan-|zinc-|slate-`
   classes outside an allowlist. Seed the allowlist with today's 81+ files so
   the check passes; each sweep phase shrinks it.

Effect: all 180 UI-kit components and the ≈209 files on semantic tokens
re-skin immediately. Pages still carrying raw `gray-*`/`cyan-*` classes look
mixed until their sweep; that is expected and is why the shell comes next.

Verification: `FrontPageView.spec.ts` stays green (it asserts copy and
behavior, not colors); full quality matrix; `pnpm --dir frontend build`;
visual diff against the Phase 0 baseline for `/` (must be unchanged) and
`/news` (must now be ink and bone).

### Phase 2 — Shell and shared primitives

Scope: `App.vue`, `components/layout/*`, `components/pwa/InstallBanner.vue`,
`components/changelog/ChangelogBanner.vue`, `NewsAnnouncementModal.vue`,
`SiteAvailabilityNotice.vue`, `UptimeBar.vue`, `router/index.ts`,
`FrontPageView.vue`.

1. Make the `.home-header` and `.home-mobile-nav` styles the default header
   and `BottomNavbar` styles, then delete the `route.path === '/'`
   conditionals. Wordmark in display face; nav links in display face at
   `1.3rem`; active state vermilion; the MUD address block returns on wide
   screens in label mono.
2. `AppSidebar.vue`, `AdminMenu.vue`, `ForumMenu.vue`, `BreadcrumbsNav.vue`:
   replace raw classes with `sidebar-*` and semantic tokens.
3. Offline and update banners: amber/cyan fills become status warning and
   ink-raised with a vermilion action.
4. Add the `contentGutter` route meta and remove the negative margins and
   `padding-bottom` compensation from `.duris-home`.
5. Extract the homepage vocabulary into shared components under
   `components/brand/`: `BrandActionLink.vue` (the vermilion CTA with arrow),
   `BrandTextLink.vue`, `DisplayHeading.vue` (display face with `<em>` accent
   slot), `IndexLabel.vue` (mono uppercase label), `SectionRule.vue`. Add the
   `brand` variant to `components/ui/button/index.ts`. Rewrite
   `FrontPageView.vue` to consume them so the homepage and the rest of the site
   share one implementation. Keep its test passing without edits where
   possible; update selectors only if markup moves.
6. Update `BottomNavbar.spec.ts` for any class changes.

Verification: quality matrix; the two layout specs; visual check of header,
sidebar, mobile sheet and banners at the three widths; keyboard focus visible
on every nav control.

### Phase 3 — Public surfaces sweep

Scope, in traffic order. Each bullet is a reviewable change set; remove its
files from the lint allowlist as it lands.

1. News: `NewsView.vue`, `NewsDetailView.vue`, `components/changelog/*`.
2. PvP and statistics: `PvPListView.vue` (187 raw classes), `BattleDetailView.vue`,
   `StatsView.vue`, `FactionActivityView.vue`, `FragLeaderboardView.vue`,
   `components/pvp/*`, `components/frag/*`, `components/charts/*` (ECharts
   axis and label colors become bone-muted/rule; series use `--chart-*`).
3. Auctions: `AuctionListView.vue`, `AuctionDetailView.vue`,
   `AuctionHistoryView.vue`.
4. Forum: `ForumView.vue`, `CategoryView.vue`, `ThreadView.vue`,
   `NewThreadView.vue`, `ForumSearchView.vue`, `NotificationsView.vue`,
   `components/forum/*`. `TipTapEditor.vue` (249 raw classes) is its own
   change set; its toolbar becomes ink-raised with rule borders and vermilion
   active states. `MudColorExtension.ts` is untouched.
5. Wiki and guide: `WikiView.vue`, `views/wiki/*`, `components/wiki/*`
   (Leaflet controls in `WikiZoneMap.vue` and `WikiMapView.vue` get ink
   backgrounds and rule borders via scoped overrides), `GuideView.vue`,
   `HelpSuggestionsView.vue`, `MySuggestionsView.vue`, `components/guide/*`.
   Apply `surface-paper` to article bodies if decision 3 is yes.
6. Accounts and profiles: `LoginView.vue`, `ChangePasswordView.vue`,
   `UserProfileView.vue`, `GuildProfileView.vue`, `CharacterProfileView.vue`,
   `components/profile/*` (`ProfileHeroBanner.vue` adopts the hero treatment:
   art, bottom mask, display heading).
7. Utility pages: `SearchView.vue`, `StatusView.vue`, `ForbiddenView.vue`.

Per-file method: raw `gray-*`/`cyan-*`/`slate-*` to semantic tokens; status
hues to the status palette; page `h1`/`h2` to `DisplayHeading`; primary
actions to `Button` with the right variant; delete `dark:` variants; move
hex colors in `<style>` blocks to tokens.

Verification per change set: quality matrix, the view's spec if one exists
(`ForumViewProvisioning.spec.ts`, `WikiMobsReadiness.spec.ts`,
`WikiObjectsReadiness.spec.ts`), screenshot comparison at three widths, and a
contrast pass on any status badge.

### Phase 4 — Play client chrome

Scope: `MudClientView.vue`, `PopOutMapView.vue`, `components/mud/*` (43 files,
16 with raw palette: `TriggerFormDialog.vue`, `MudMap.vue`,
`AliasFormDialog.vue` and the settings panels lead).

- Restyle only the chrome: connection overlay, side panels, map container,
  dialogs, status bar, buttons.
- Terminal output, the ANSI class map and any player-configured colors stay
  exactly as they are. Add a test that `ansiParser.ts` output classes are
  unchanged for a fixed sample so a sweep cannot alter game colors by
  accident.
- `/play` and `/play/map` keep `fullscreen` / `hideNav`; the pop-out window's
  `Toaster` and overlay adopt the tokens.

Verification: quality matrix, the new ANSI test, a manual connect to the
production MUD through the web client to confirm colors and prompts render as
before.

### Phase 5 — Admin and builder

Scope: `AdminLayout.vue`, `AdminView.vue`, `DashboardView.vue`,
`views/admin/*` (22), `components/admin/*` (20), `ZoneManagementView.vue`,
`ModerationLogView.vue`, `UserManagementView.vue`, `ArchivesView.vue`,
`views/builder/*`, `components/builder/*` (35; the editor and map components,
not the mockups).

- Admin uses the sidebar tokens from Phase 1 and the shared primitives from
  Phase 2; most of its views are already on semantic tokens, so the work is
  mainly the eight admin components with raw palette and the confirmation
  dialogs, which keep `destructive` styling.
- Builder: `ZoneMap.vue` and the editor panels get the chrome treatment; map
  tile colors are data, not theme.
- Builder mockups: remove `/builder-mockups`, `BuilderMockupsView.vue` and
  `Design1..5*.vue` per decision 6, or allowlist them.

Verification: quality matrix, `DashboardView.spec.ts`, manual walk of the
admin menu with an immortal account on production after deploy.

### Phase 6 — Closeout

1. Empty the lint allowlist and wire `check-palette-literals.sh` into the
   frontend quality job in `.github/workflows/quality.yml`.
2. Remove any remaining `.home-*` leftovers, unused keyframes and dead CSS.
3. Documentation: update `frontend/README_frontend.md` (theme section replaces
   the homepage-only note), `docs/development.md` (where tokens live and how
   to add a color), and append an "Outcome" section to this file with the
   deployed commit, date and acceptance evidence. Mark
   [homepage-redesign.md](homepage-redesign.md) as superseded by this plan.
4. Update the frontend memory and journals the same way the wiki map release
   was recorded.

## Rules that apply to every phase

- Frontend only. No backend, API, database, migration, MUD or
  `deploy/` change is expected. If a phase needs one, stop and record why here
  before proceeding.
- Operator-configured content keeps working: hero visibility, title, subtitle,
  image URL and the editor content from the Front Page Editor, plus every
  TipTap widget (carousel, top fragger, recent PvP, map preview). The homepage
  spec covers this and must stay green.
- No `any`, ESM with `.js` on relative imports, named exports, strict types.
- Keep each change set reviewable: one area per commit, lint allowlist
  shrinks in the same commit.
- Never commit screenshots, generated images or release evidence.

## Verification commands

Run from the repository root for every change set:

```bash
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
```

Plus `frontend/scripts/check-palette-literals.sh` once Phase 1 adds it. No
backend commands are needed unless a phase crosses packages.

## Rollout

Each phase deploys as a frontend-only release following
[docs/deployment.md](../deployment.md#build-and-validate) and the cutover
procedure recorded in [prod-deploy.md](prod-deploy.md): build in a detached
worktree, run the matrix there, pause the watchdog, swap the checksum-verified
`frontend/dist`, run `deploy/scripts/recover-deployment`, then accept. The
cache keys in the private Redis hold only geo, wiki and boot data, so no cache
flush is needed for a theme release. Rollback is the previous `dist` tree from
the release set.

Acceptance for every phase: the three-width screenshots match the intent, the
homepage is pixel-unchanged (Phase 1) or changed only by the shared-primitive
refactor (Phase 2), keyboard focus is visible on every interactive control
touched, and `prefers-reduced-motion` disables any animation added.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Vermilion small text falls below AA on ink | Use vermilion at 16px+ or as underline/outline only; muted bone for small secondary text |
| Red-for-brand and red-for-danger collide in admin | Decision 2 keeps `default` neutral and `destructive` darker with confirm dialogs |
| Serif display face hurts dense tables and forms | Decision 4 restricts it to headings, wordmark and CTAs |
| `--radius: 0` makes inputs and avatars look harsh | Per-component `rounded-sm` opt-in; review in Phase 2 |
| TipTap editor is one 249-class file | Own change set; toolbar styles via a small scoped stylesheet rather than per-button classes |
| Leaflet, ECharts and vue-sonner ship their own CSS | Scoped overrides driven by tokens, verified on `/wiki/map`, `/pvp/stats` and a toast |
| Game colors change by accident | ANSI map untouched and pinned by a test in Phase 4 |
| FOUT on first paint with the display face on every page | Preload both WOFF2 files; `font-display: swap`; Georgia fallback has similar metrics |
| Partial state between phases looks inconsistent | Phase 1 retokens the kit first so the mismatch is limited to raw-class pockets, then the sweeps proceed by traffic |

## Effort

Rough, in focused sessions, assuming one person and review between phases.

| Phase | Sessions |
| --- | --- |
| 0 | 0.5 |
| 1 | 1 |
| 2 | 1.5 |
| 3 | 4–5 |
| 4 | 1 |
| 5 | 2 |
| 6 | 0.5 |

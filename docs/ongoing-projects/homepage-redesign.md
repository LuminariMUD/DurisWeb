# Duris homepage — eclipse edition

Updated 2026-09-05. This replaces the previous designer's unfinished proposal.
Implementation is on the user-authorized `master` branch. Source and local
production-preview verification are recorded below. The user subsequently
authorized committing, pushing master and deploying on this production host;
the deployment boundary is recorded at the end of this document.

## Design

An illustrated fantasy cover with a burning eclipse above an impossible citadel.
Large Cormorant Garamond typography and a vermilion italic headline lead into an
open, bone-colored world guide, then a charcoal closing invitation. The hero
image drifts slowly and ten small embers rise. Pause/resume is a real control;
the operating system's reduced-motion preference disables the animation.

The frontend design and imagegen skills informed the concept-first workflow,
separate production artwork, local font packaging, responsive design, and
concept-to-browser comparison. Browser plugin not available: Playwright Chromium
was used with isolated HTTP/WebSocket fixtures, not live player sessions.

### Design system and component inventory

- Ink: `#111310`; bone: `#ece8dd`; accent: `#df583d`; CTA: `#b92e1c`;
  rules: `#575743`; light-section text: `#171a15`.
- Display: locally hosted Cormorant Garamond regular/italic; body: Arial/system
  sans-serif; index and rail labels: system monospace.
- Layout: full-width artwork and bands, maximum 105rem content width, responsive
  gutters from 24px to 96px, open three-column guide with thin separators.
- Controls: rectangular primary links, underlined secondary links, outline motion
  control; visible keyboard focus rings. Existing Lucide outline icon family
  retained for arrows, compass, swords, flag, pause and play.
- Mobile: art above the headline, left-aligned copy, stacked guide and closing
  section; existing fixed mobile navigation remains usable.
- Image treatment: no color wash over the desktop art. Mobile has a bottom mask
  that blends artwork into the ink background. Art is decorative; all UI text,
  headings and controls are real HTML.

### Allowed default copy and routes

The default first viewport contains:

- DURIS; News; PvP Logs; Browse; Wiki; Forum; Donate when configured; Login or
  the existing authenticated account controls.
- “A world / written in / blood.”
- “A text-based world of rival kingdoms, dangerous alliances, and
  player-versus-player war. Your next command could change everything.”
- “Enter the world” → `/play`; “News & Updates” → `/news`.
- “Free to play. Played in your browser.”
- “Words build worlds. Players make history.”
- “Explore Duris” → in-page world guide; “Pause motion” / “Resume motion”.

Continuation:

- “The world is text. The stakes are real.”
- “No quest marker can tell you who to trust. Learn the lands, follow the
  rivalries, and find the people who will stand beside you.”
- 01 / Explore; “Know the world.”; “Every zone has a story. Every path has a
  price. Start with the map.”; “Open the wiki” → `/wiki/map`.
- 02 / Witness; “Read the rivalries.”; “Ambushes, victories, and names worth
  remembering. The latest from the battlefield.”; “View PvP logs” → `/pvp`.
- 03 / Belong; “Find your people.”; “Trade knowledge. Talk strategy. Meet the
  community behind the characters.”; “Join the forum” → `/forum`.
- “What will your next command be?”; “Enter Duris” → `/play`;
  “Free to play. No download required.”
- DURIS; “A world made by its players.”

## Configuration behavior

The existing site-config API is retained. The exact legacy display title
`NewDuris` is exposed as `Duris` by the shared frontend composable, including the
header and homepage document title. Other configured titles remain unchanged.

The exact stock hero title and subtitle use the new designed copy. Custom
titles, subtitles and image URLs still take precedence; the hero visibility
setting is still honored. The exact “Edit this content in Web Settings”
placeholder is suppressed. Other sanitized CMS content appears between hero
and guide, including image-only and widget-only content.

Carousel, top-fragger, recent-PvP and map widgets still mount and unmount. The
container is watched as well as its content, so content supplied while site
configuration is loading mounts correctly once the container exists.

No database migration is needed for this presentation change. No applied
migration, backend API, game configuration, player data, or separate DurisMUD
repository was changed. Stored settings have not been rewritten. Operators can
continue editing custom homepage content through Web Settings.

## Assets and generation provenance

Built-in Image Gen was used for both concept images and the standalone artwork.
No API-key/CLI fallback was used.

Concept source directory:
`/home/duris/.codex/generated_images/01a07074-3cd3-77e2-8a1b-e9ad816a9625/`

- First viewport, 1536×1024:
  `exec-6f4ee47f-e15d-498f-b121-133eb1bba8e2.png`.
- World guide and closing section, 1536×1024:
  `exec-86d2f15e-b6c2-4f6f-802c-626686f5e5a9.png`.
- Standalone artwork, 1672×941:
  `exec-18475876-1f70-49df-bb4a-883c3f23b4c3.png`.

Production asset: `frontend/src/assets/home/duris-eclipse.webp`, 171,088 bytes.
Chromium's WebP encoder packaged the generated pixels at quality 0.88 without
creative edits. The project references only the packaged repository asset.

Fonts: `frontend/src/assets/fonts/cormorant-garamond-{regular,italic}.woff2`
(22,876 / 23,660 bytes), Latin subsets from Google Fonts. The SIL Open Font
License is included at `frontend/src/assets/fonts/OFL.txt`.
Font declarations are in `frontend/src/assets/home/typography.css`.
No runtime font request goes to Google.

The superseded untracked battle PNG and intermediate TTF downloads were moved
to `/tmp/duris-home-qa.Ajz2k3/`; they remain recoverable there, and the original
battle art also remains in the previous Codex generated-image directory.
Only final artwork and fonts are shipped in this checkout.

### Final production-art prompt

> Use case: background-extraction. Input image is edit target and art reference.
> Extract/recreate ONLY the full-bleed standalone hero artwork from this Duris
> webpage concept into a wide 1536x864 landscape production background. Remove
> ALL website text, headline, navigation, header, buttons, footer, rules and
> lower white section. Preserve exactly the castle, eclipse ring, bridge and
> tiny red-cloaked traveler, cloud texture, dramatic scale, art style, palette
> and positioning from the original hero. Artwork has towering gothic citadel
> on RIGHT 55%, vermilion burning eclipse upper right at 72% width 28% height,
> tower rising in front, dark crag and arched bridge down to bottom. Left 38%
> is almost empty near-black warm charcoal #111310 fading very softly into
> artwork; intended for live HTML overlay text but DO NOT include any text.
> Maintain original red glow with black eclipse center and rich black/olive
> etched detail. Very fine thin orbit circle can remain around eclipse as
> subtle part of celestial artwork. Fill whole canvas with hero art, no
> letterbox. Bottom blends into #111310, no white area, no UI, no symbols,
> no words, no watermark. Preserve fantasy painting craft and specificity,
> avoid glossy 3D.

The concept prompts specified the exact copy above, desktop header and hero
composition, the bone-colored three-column guide, and the charcoal closing
invitation; they required code-native UI, separable artwork, no fake metrics,
and the typography, colors, spacing and responsive system recorded above.
The standalone prompt was an edit of the first-viewport concept.

## Verification and fidelity ledger

Final source and production-preview verification passed on 2026-09-05:

- Focused tests: 13/13 passed, including custom settings, sanitization,
  image-only content, widget lifecycle, unavailable state and brand normalization.
- Full frontend tests: 130/130 passed in 35 files. The later title change was
  rechecked with the focused suite and the browser return-navigation test.
- Frontend format check, lint, type check and final production build passed.
- Chromium production preview: 1536×1024 desktop; widths 320, 390, 430, 768,
  1024 and 1920 with zero horizontal overflow. Mobile captures use 430×932.
- Page identity, meaningful content, image/font loading, absence of framework
  overlays, keyboard focus, pause/resume, reduced motion and Explore focus passed.
- Play opens the existing MUD login form. News opens the News page; returning
  home restores the Duris tab title. No game login was attempted.
- Final production run has no console or uncaught page errors. An earlier
  harness run blocked service workers and produced registration warnings;
  rerunning with service workers enabled passed without those harness warnings.
- Default above-the-fold copy diff passed; no unexpected visible copy.
- Final concept/render comparison verified layout, type, colors, image crop,
  section structure, copy, controls and responsive behavior. No material visual
  mismatches remain beyond the intentional adaptations recorded below.

Final screenshots: `/tmp/duris-home-qa.Ajz2k3/production-desktop.png`,
`production-lower.png`, `production-mobile.png`, `production-mobile-lower.png`,
`production-closing.png`, `production-mobile-closing.png` and
`production-tablet.png` in the same directory. The accepted concepts and
latest production screenshots were inspected with `view_image` in the final
QA pass. The implementation was faithfully verified against the selected
design with the documented navigation/icon adaptations.

Concepts and production screenshots were both opened with `view_image`.
The reference dimensions, 1536×1024, were used for desktop capture.
The comparison covered:

| Comparison | Evidence and resolution |
| --- | --- |
| Hero layout | Three-line left headline, large right citadel/eclipse, CTA row and next-section preview preserved. |
| Art framing | Desktop image changed to top alignment to restore breathing room above the eclipse; mobile keeps the sun and tower visible. |
| Typography | Local Cormorant regular/italic matches the literary display character; body and UI controls have explicit sizes. |
| Palette | Ink/bone split, vermilion italic text and red CTA preserved; no desktop tint added. |
| Copy | Default first-viewport wording and ordering match the allowed list; existing conditional nav/account labels remain. |
| Section rhythm | Open columns and rules continue into the dark final invitation, with no card wrappers. |
| Responsive behavior | 320px motion-control overflow repaired by wrapping the controls. Guide and closing invitation stack. |
| Motion and focus | Pause/resume, OS reduced motion, Explore scroll/focus and keyboard primary-link navigation verified. |
| Brand continuity | Legacy title normalization verified; returning from News revealed a stale tab title, repaired with route-owned reactive head metadata. |

Intentional adaptations from the raster concepts: repository-native outline
icons replace illustrated engravings; existing dropdown chevrons, account,
donation and mobile-navigation controls are preserved. The real app header
stays visible while its main content scrolls. Custom operator content remains
supported even though it is absent from the default concept.

The Browser plugin was unavailable. Browser tests use Playwright 1.62.1 and the
existing Chromium installation/libraries, with no new project dependencies.
Local dev: `http://127.0.0.1:5178/`.
Local production preview: `http://127.0.0.1:5179/`.
Rendered screenshots are outside the repository under
`/tmp/duris-home-qa.Ajz2k3/`. Temporary browser/encoding scripts and CSS scratch
files were removed with `apply_patch` after verification; final screenshots
and the recoverable superseded assets remain there for review.

### Command record

All package commands run from the repository root:

- `pnpm --dir frontend type-check` — initial draft and revised implementation.
- `pnpm --dir frontend exec biome format --write src/views/FrontPageView.vue src/views/__tests__/FrontPageView.spec.ts src/composables/useSiteConfig.ts src/composables/__tests__/useSiteConfig.test.ts src/App.vue src/assets/home/typography.css` — touched files; subsequent invocations used the touched view/test subset.
- `pnpm --dir frontend test:unit --run src/views/__tests__/FrontPageView.spec.ts src/composables/__tests__/useSiteConfig.test.ts` — focused regression tests.
- `pnpm --dir frontend format:check`.
- `pnpm --dir frontend lint`.
- `pnpm --dir frontend test:unit --run` — full frontend suite.
- `pnpm --dir frontend build` — production build, repeated after fixes.
- `pnpm --dir frontend dev --host 127.0.0.1 --port 5178`.
- `pnpm --dir frontend preview --host 127.0.0.1 --port 5179`.
- `pnpm --dir frontend exec playwright --version` — unavailable in frontend.
- `pnpm --dir /tmp/durisweb-browser-qa-20260904 exec playwright --version` — existing external QA installation available, version 1.62.1.
- `LD_LIBRARY_PATH=/tmp/durisweb-browser-qa-20260904/libs/usr/lib/x86_64-linux-gnu node /tmp/duris-home-qa.Ajz2k3/encode.mjs` — lossily packaged the original generated PNG as WebP.
- Same environment prefix with `node /tmp/duris-home-qa.Ajz2k3/qa.mjs` and
  `node /tmp/duris-home-qa.Ajz2k3/production-qa.mjs` — browser checks and screenshots.
- `pnpm --dir frontend exec biome format --write /tmp/duris-home-qa.Ajz2k3/homepage.css` — outside-project path was ignored.
- `pnpm --dir frontend exec biome format --stdin-file-path=src/assets/home/homepage.css < /tmp/duris-home-qa.Ajz2k3/homepage.css` — standalone CSS parser rejected Vue `:deep`.
- `pnpm --dir frontend exec biome format --stdin-file-path=src/assets/home/homepage.css < /tmp/duris-home-qa.Ajz2k3/hero-only.css` — formatted the standard CSS; applied back with `apply_patch`.
- `pnpm --dir frontend exec biome format --help` — inspected supported formatting flags.
- `git diff --check`, `git diff --stat`, `git status --short`,
  `git branch --show-current`, `git show HEAD:frontend/src/views/FrontPageView.vue`
  and focused `git diff` — checkout and final-change inspection.
- Read-only `pwd`, `rg` / `rg --files`, `cat`, `sed`, `ls`,
  `ss -ltn`, `ps -eo pid,etime,%cpu,%mem,args`, and
  `command -v convert cwebp ffmpeg` — repository, instructions, package,
  runtime and available-encoder inspection.
- `curl -fsSL` — Google Fonts CSS (default and Chromium user agent), the
  referenced Google Fonts TTF/WOFF2 assets, and upstream
  `google/fonts/main/ofl/cormorantgaramond/OFL.txt`.
- `mkdir -p frontend/src/assets/fonts` and
  `mktemp -d /tmp/duris-home-qa.XXXXXX` — asset and isolated QA directories.
- `mv frontend/src/assets/fonts/cormorant-garamond-regular.ttf frontend/src/assets/fonts/cormorant-garamond-italic.ttf frontend/src/assets/home/duris-hero.png /tmp/duris-home-qa.Ajz2k3/` — preserve superseded assets outside shipping source.

Backend tests, backend format/lint/type/build, migrations, and
`verify:mud-writes` are not applicable and were not run: no backend/database/
MUD-write implementation changed. Live game login, production deployment,
Safari and Firefox are outside this verification scope.

## Production release — 2026-09-05

The user explicitly authorized commit/push to master and production deployment.
The change contains only frontend code, assets, tests and documentation. The
backend process serves this checkout's `frontend/dist` directly: readback showed
that the prior preview build was already publicly served before this release
operation. Its entry asset was `index-ByZe480Q.js`, SHA-256
`8d933e13377b13cf0ee801b65b9ca765764f2ff574198388b906a5056802b50f`.

This release builds the committed source in an isolated worktree and atomically
exchanges the complete frontend directory. Prior hashed assets are retained for
open browser tabs. Rollback artifacts and checksums are preserved outside the
repository under `/home/duris/.local/state/durisweb-homepage-release.DGSwvy/`.
The protected release evidence records final commit, artifact identities,
pre/post service state and live acceptance results.

Frontend quality gates and the unchanged backend's compiled production
preflights are checked. This is a static-asset-only cutover: no backend artifact,
environment, service configuration, migration, database row, or game process is
changed. Accordingly backend rebuild/tests, database dump/restore rehearsal,
MUD protocol probes and the backend-restart soak do not apply to this release.
Production service-group acceptance, local/public asset digests, and real
desktop/mobile browser verification are required after cutover. No service
restart is needed. Final live deployment status is confirmed in the release
evidence and task handoff, rather than pre-claimed in this source commit.

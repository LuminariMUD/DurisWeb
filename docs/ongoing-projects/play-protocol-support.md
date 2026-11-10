# /play protocol support: November 10 implementation

Status: **implementation and local qualification complete; review, merge and production release pending**.

This executes the [November 7–10 support plan](https://github.com/LuminariMUD/duris-client/blob/781669671b7fbc3b1318c6ddbe1187a75b009197/docs/ongoing-projects/play-protocol-support.md)
in the owning DurisWeb repository. The branch starts at
**`8bf88c692f479288537259bd592851f347ea34ef`**, the head of
[DurisWeb #161](https://github.com/LuminariMUD/DurisWeb/pull/161).
GitHub still reported that PR open and unmerged during the initial implementation.
Review subsequently rebased this follow-up onto #161's squash merge,
`f22a22c2c097eaae94459abc3a69f03e52597a67`, retaining its terminal ampersand
repair and both sets of release notes.

Server source and fresh harness qualification use
**`08b98339dbfb6b2541f6647558428673c1735498`**, including the November 10
color-boundary (`5d9a73dd8`) and terminal-truncation (`5c4fabd57`) fixes.
The server worktree was read/tested without changing its source. No production
server, website, account, database or news entry was changed.

## Implementation

The existing #161 capability negotiation, Unicode decoder, shared text-node
renderer, per-line trigger clipping, chat layouts and retained history remain
the implementation of `Duris.Links 1`. Browser WebSockets receive JSON snapshots;
native MXP negotiation/quoting fixes require no browser MXP parser or additional
subscription. The final implementation does not introduce another transport,
renderer, URL recognizer, link registry, preference or backend endpoint.

Two missing ship behaviors are repaired:

- Disconnect/error, account-menu return, account changes/logout, character changes
  and full reset clear both ship snapshots. Previously old contacts/status could
  remain visible after their session ended. An ordinary status refresh for the
  same character preserves current data.
- The world-map view does not place a contact outside its image bounds. A wrapped
  tactical offset can cross the zone edge; the existing packet contains no zone
  dimensions or topology that would justify guessing a wrapped global position.
  Such contacts remain on radar with their server range/bearing, and the map
  explains that some positions are unavailable. Missing world axes continue to
  use the existing unavailable-coordinates message. Zero remains valid.

`ShipRadar.vue` and `mudStore.ts` own those changes. The existing connection and
output suites gain budget, exact-target, renegotiation, blank-line/gag/Unicode
and missing/truncated-presentation cases. `ShipProtocol.spec.ts` exercises actual
ship components and the real store: replacement snapshots, lock loss, empty/null
clears, seam fallback and session retirement.

The unpublished [release-news draft](clickable-links-changelog-draft.json) includes
the ship fixes and now uses the API's `isPublished` field. A release version/date
must be selected and the draft reconciled with the admin history at deployment.

## Plan coverage and evidence

### 1. Paired source and fixtures — complete locally

The production server output harness passes at the pinned server revision.
Fresh `OUTPUT_PRESENTATION_FIXTURE` output contains three text/full-chat/body-chat
examples identical to #161's committed `output-presentation-v1.json` except
timestamps. A fixture refresh would therefore add only clock noise.

The server GUI/GMCP harness also passes capability versions, support changes,
opt-out, channel entry points and lifecycle checks. The ship harness passes
horizontal/vertical/diagonal seams, reciprocal detection, ranges/bearings/arcs,
sensor edges, lock loss, invalid dimensions and final-valid-room coordinates.

### 2. Negotiation and validation — complete locally

The actual browser socket handler advertises `Duris.Capabilities 1` and
`Duris.Links 1` on each fresh socket and does not subscribe to Links. Tests cover
reconnect, no automatic link command on receipt, target byte/link/run/text bounds,
unsupported or malformed snapshots, and exact HTTP/HTTPS targets including IPv6,
Unicode, query ampersands and balanced punctuation. Snapshots remain optional;
the server harness verifies unnegotiated/disabled delivery, and the client tests
verify readable undecorated output without reconstructing links.

### 3. Display, interactions and history — complete locally

Existing and extended tests cover gagging, Unicode code-point rebasing, blank
lines, clipping without changing targets, palette mappings, single-copy history
insertion/reload, malformed saved metadata and legacy fallback. A mismatched
snapshot never restores a truncated terminal tail.

Fresh Chromium verification drove the real `/play` route and WebSocket handler
using the current server harness fixtures. Mouse, Enter and Space each send
exactly one normal help command; movement keys on a focused link do not leak
game commands. A retained split-history help link works with Enter. Text,
full-line say and body-only nchat URL anchors keep their exact destinations;
opening a URL sends no game command. Unit/component coverage also retains
tell/guild presentations and group body links through saved-history reload.

Desktop **1440×1000**, tablet **820×1180** and phone **390×844** passed page
identity, meaningful rendering, no framework overlay, interaction and screenshot
checks. There were no page errors. The existing Vue Router `next()` deprecation
warning remains. Browser plugin was not available; the installed Python
Playwright/Chromium was used without adding project dependencies.

The original #161 paired real-MUD help/pager/search/chat journey remains recorded
in [the existing contract](../CHAT-COLORIZATION.md#clickable-help-and-web-links)
and the server #951 handoff. That journey was not rerun here; link dispatch and
the wire schema are unchanged. Fresh checks here establish the final browser
behavior and current server serializers separately, not a production deployment
or a new end-to-end booted-MUD certification.

### 4. Corrected ship semantics — complete with explicit map fallback

Component tests verify replacement range/bearing and flags, empty and null
snapshots, and clearing at every changed session boundary. A same-character
refresh retains its ship data. Radar displays the corrected west-seam example
at 2 nm / 270 degrees. A synthetic X=0 world anchor is accepted, but its derived
X=-2 contact is not drawn on a 0–199 map or guessed to be X=198.

The real browser opened the Ship tab and Radar window, verified the map fallback
and unavailable-coordinate messages, then received replacement lock flags and
a null clear through its socket. The display removed the lock and showed
“Not on a ship.” No browser identity, credentials or coordinates were promoted
to verified server access. Global image bounds do not establish zone wrapping;
that limitation remains explicit instead of exposing incorrect positions.

### 5. Gates and release — code gates pass; release conditional

Commands run from DurisWeb unless an absolute server path is stated:

```text
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend test:unit --run src/utils/__tests__/outputPresentation.spec.ts src/components/mud/__tests__/OutputPresentation.spec.ts src/components/mud/__tests__/OutputPresentationLog.spec.ts src/components/mud/__tests__/ChatPresentation.spec.ts src/components/mud/__tests__/ChatPresentationHistory.spec.ts src/composables/__tests__/useMudConnectionCredentials.spec.ts src/utils/__tests__/shipCoordinates.spec.ts src/components/mud/__tests__/ShipProtocol.spec.ts src/composables/__tests__/usePlayMap.spec.ts
pnpm --dir frontend format:check
pnpm --dir frontend exec biome format src config <expanded root *.ts/*.json/*.html files>
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend build
bash frontend/scripts/check-palette-literals.sh
git diff --check
```

The focused suites and affected map regression suite pass **78 tests in 9 files**.
Lint, types, production build, palette and whitespace checks pass. The build uses
loopback-only synthetic public service settings, not production configuration.
Existing large-chunk and Biome schema-version notices remain.

On Windows the bundled package-manager fallback passes literal `*.ts`, `*.json`
and `*.html` arguments to Biome: the canonical `format:check` command reports
those invalid paths. The equivalent direct Biome command with PowerShell-expanded
root files checks **717 files** successfully. No package script or configuration
was changed to work around this local shell behavior. Targeted Biome formatting
was applied to the changed sources/tests.

Server checks run through WSL in the already existing isolated source checkout:

```text
OUTPUT_PRESENTATION_FIXTURE=/tmp/play-protocol-wire-20261110.json python3 /home/aiwithapex/projects/duris-item-values-art/tests/async/test_word_output_integration.py
python3 /home/aiwithapex/projects/duris-item-values-art/tests/async/test_gui_gmcp_contract.py
python3 /home/aiwithapex/projects/duris-item-values-art/tests/async/test_ship_contacts.py
python3 /tmp/play-protocol-20261110-browser.py
```

All pass. The browser script, DOM capture, fresh wire output and screenshots
are temporary local evidence outside the checkout, named
`/tmp/play-protocol-20261110-*`. Screenshot copies are under the chat's
`C:/Users/apexw/.codex/visualizations/2026/11/10/01a1c577-a548-7ae2-baf1-6017e2122c4f/`.
No backend source or database behavior changed; backend checks/migrations were
not run. No Mudlet package change or release is involved.

## Release follow-through

The implementation builds on merged #161. Its follow-up [PR #162](https://github.com/LuminariMUD/DurisWeb/pull/162)
is restacked onto `master` after that merge, without duplicating the original
parent commits. Deployment remains a separate step. At an authorized release,
verify the served browser and paired
server revisions, repeat the small live help/chat/reconnect/ship smoke, then use
news-update to reconcile/publish and verify the release entry. Until then this
work is not described as live and the draft remains unpublished.

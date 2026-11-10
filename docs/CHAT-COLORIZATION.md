# Recipient colors in web chat

The [Design guide](DESIGN.md#game-content-and-charts) explains how game colors
relate to the website theme. This document retains the recipient presentation,
palette, and history contracts.

This client implements [Duris server #288](https://github.com/LuminariMUD/Duris/issues/288), tracked locally
by [#43](https://github.com/LuminariMUD/DurisWebApp/issues/43). The authoritative wire contract is
[`STRUCTURED_CHAT_COLORIZATION.md`](https://github.com/LuminariMUD/Duris/blob/master/docs/guides/STRUCTURED_CHAT_COLORIZATION.md)
in the server repository.

Players use server commands such as `toggle color tell brightcyan`, `toggle color gcc yellow`,
`toggle color preview say brightgreen`, and `toggle color reset all`. These are character preferences;
the browser does not keep a competing color setting. A preview does not save. Reconnect uses the saved
server choice. Existing characters and packets without a presentation snapshot keep the existing client layout.

Say, tell/reply and guild chat can carry a version 1 `presentation` snapshot. `parseChatPresentation`
validates its canonical channel pair, numeric palette IDs and contiguous Unicode code point runs. The full
line replaces the normal sender/body display once. The chat panel keeps its channel label and timestamp;
its formatted line can still open a direct chat. Floating windows use the same escaped Vue component.
The server has already applied recipient language/visibility rules and chosen the frame. There is no browser
animation timer, color guessing or second application of a base color.

The exact ID mapping is exported by [`chatPalette.ts`](../frontend/src/utils/chatPalette.ts):
0 is default; 16–23 are black, blue, green, cyan, red, magenta, yellow and white;
24–31 are their bright variants. This differs from ANSI SGR numeric order.
Named `--mud-black`, `--mud-blue`, …, `--mud-bright-white` CSS variables can replace the documented hex defaults.
`--mud-background` and `--mud-foreground` control default colors independently of white. Foreground brightness
adds bold; authored background brightness selects the server's historical underline behavior when requested.
Blink remains steady in the browser for accessibility. Authored text is never inserted as HTML by this path.

Each packet creates one store message and one applicable history entry. A reset affects new messages; existing
history retains its frozen frame. Saved snapshots are validated again on rendering, so malformed storage or
future protocol versions fall back to the legacy message. The existing local history format remains version 1
with an optional field. This change adds no credentials, server endpoints or preference persistence API.

The server harness exports the synthetic fixture in
[`chat-presentation-v1.json`](../frontend/src/components/mud/__tests__/fixtures/chat-presentation-v1.json).
It contains real production-rendered say/tell/guild frames for two recipients, reset and reconnect.
Tests compare rendered text and palette values,
reject malformed metadata, dispatch through the actual WebSocket handler, and exercise the real store, panel,
window manager and persisted-history reload. The floating window's input reference uses its actual component
element so opening or expanding the window can focus the input without a runtime error.

Run frontend `format:check`, `lint`, `type-check`, `test:unit --run` and `build`. No backend behavior changes.

## Clickable help and web links

The browser advertises `Duris.Links 1` through `Core.Supports.Set` after each
connection opens. This capability adds presentation to existing messages; it
requires no periodic subscription. Its server implementation is
[Duris PR #942](https://github.com/LuminariMUD/Duris/pull/942), including the
preceding help/MXP/output PR stack. Either peer remains usable with the older
peer, with ordinary readable text and no added links.

An ordinary text envelope retains `type`, `category` and terminal `data`, and can
carry `presentation: {version: 1, text, underline, runs, links?}`. Runs retain the
palette IDs and code-point offsets above. Each link is
`{start, end, kind: 'command' | 'url', target}` with half-open code-point bounds.
Only explicit `help <topic>` targets can become command buttons. HTTP/HTTPS
targets become external anchors with `noopener noreferrer`. No label, help-like
chat text or browser regex creates a command. Receipt never activates a link.

`outputPresentationLines()` validates the bounded snapshot and checks that its
literal text matches the terminal data after removing SGR codes and carriage
returns. It clips and rebases the snapshot alongside the existing line split.
Triggers still see their original terminal line; gagging discards its snapshot.
The store retains snapshots for live output and both split-history panes.
Buttons use the existing game command sender. One link remains one keyboard
target across color changes and normal visual wrapping.

All existing `Comm.Channel` channels can carry `bodyPresentation` using the same
schema, with URL links only. It supplies the normal sender/body layout, including
the preserve color policy; adopted full-line snapshots can also contain URLs.
Floating chat histories retain both optional fields and revalidate on rendering.
The history storage version stays 1, and older records remain readable. Console,
authored-body and full-line chat palettes retain their existing mappings.

The decoder bounds text, runs, links and target bytes, rejects overlapping or
out-of-range spans, controls, unsupported versions and schemes, and accepts only
numeric palette IDs. The shared `OutputPresentation.vue` uses Vue text nodes.
Invalid or absent metadata falls back to ordinary text. Terminal fallback strips
ANSI colors safely without treating literal URL ampersands as authored Duris
markup; local authored messages keep their existing renderer.

The synthetic `output-presentation-v1.json` fixture comes from the server's actual
output/GMCP harness. Tests cover receipt, Unicode line rebasing, gagging, split
history, saved chat reload, literal HTML-like labels, target rejection and click
dispatch. Playwright qualification of `/play` uses those payloads through the
normal WebSocket handler and command sender: help click/Enter each send once,
URLs in text/full-line/body chat open the exact destination, and receipt sends
no game command. Chromium desktop (1440×1000), tablet (820×1180) and phone
(390×844) passed. This synthetic browser fixture is separate from a live MUD
session and native-client qualification. The existing Vue Router `next()`
deprecation warning remains; no page errors or framework overlay occurred.

The paired implementation also passed `/play` against a real disposable
MariaDB MUD: normal login and character entry, help references while paging,
keyboard activation of retained links, help search results, exact external query
strings and say-channel URLs. Native qualification and the official Duris
Mudlet package's copied-console links/hotboot are recorded in
[Duris PR #951](https://github.com/LuminariMUD/Duris/pull/951) and its handoff
document. The native compatibility repair is isolated to the server serializer;
the browser snapshot contract is unchanged. No production session was used.

Release news is prepared in
[`clickable-links-changelog-draft.json`](ongoing-projects/clickable-links-changelog-draft.json).
Choose the release date/version and reconcile existing entries at deployment;
publish only after the paired server/browser release passes live acceptance.
No news was published and no deployment is part of this PR.

The November 10 follow-up qualification and ship-state fixes are recorded in
[/play protocol support](ongoing-projects/play-protocol-support.md). Fresh server
fixtures match the existing browser fixtures except timestamps, including the
server's later color-boundary and truncation repairs. The receipt tests cover
missing/mismatched snapshots, renegotiation, blank lines and gagging before a
Unicode link. The browser retains its ordinary-text fallback for older peers.

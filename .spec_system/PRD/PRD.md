# durisweb - Product Requirements Document

## Overview

durisweb is the web platform for DurisMUD: an Express/TypeScript API and a Vue 3
single-page frontend that surface PvP logs, forums, wiki, auctions, builder
tools, and administration. It is not a standalone product - most of its value
comes from integrating with the live MUD server, a separate C codebase.

That integration is currently five distinct hook channels, each built at a
different time with a different trust model, no shared conventions, and no
operator control. There is no way to disable a single hook: if one misbehaves,
the options are to leave it running or take a system down. There is also no way
to see, at a glance, which hooks are actually live.

This PRD covers making that integration surface deliberate: every hook works
correctly, every hook can be turned off independently from either end, and the
transport carrying them is secure enough to cross a host boundary.

## Goals

1. Establish a single, uniform hook contract that all website<->MUD integration
   points conform to, replacing five ad hoc designs.
2. Give operators an independent on/off toggle for every hook, honored on both
   the website and the MUD, applied without restarting either system.
3. Make the effective state of every hook observable, including when the two
   ends disagree about whether it should be on.
4. Secure the transport so the website and MUD can run on separate hosts.
5. Close the trust gaps in hooks that currently have no authentication.
6. Lock every contract established here in regression tests that fail loudly if
   a future change undoes them.

## Non-Goals

- Rewriting or redesigning MUD game logic.
- Changing what the existing hooks semantically do; this phase governs how they
  are controlled and secured, not what data they carry.
- Adding new integration features or new event streams.
- Player-facing UI for hook state - toggles are an admin/operator capability.
- Migrating away from Redis, WebSocket, or flatfile transports.
- Resolving the GDPR gaps tracked separately in SECURITY-COMPLIANCE.md, except
  where a hook toggle is itself the mitigation.
- Multi-tenant or per-user hook configuration; toggles are global per system.

## Users and Use Cases

### Primary Users

- **Operator / Overlord**: runs both systems, needs to disable a misbehaving
  hook during an incident without downtime.
- **MUD administrator**: works primarily on the MUD host, needs the MUD to be
  able to refuse a hook locally regardless of website configuration.
- **Developer**: adds or modifies a hook, needs one documented contract to
  follow rather than five precedents.

### Key Use Cases

1. Operator disables the auction event stream during an incident and the rest of
   the bridge keeps running.
2. MUD administrator disables connection-log ingestion on the MUD side; the
   website reflects it as off and stops expecting data.
3. Operator opens the admin UI and sees which hooks are live, which are off, and
   which are off because the two ends disagree.
4. Operator rotates `DURISWEB_SECRET` without disconnecting the bridge.
5. Deployment moves the MUD to a separate host and the bridge continues to work
   over an authenticated, encrypted transport.

## Requirements

### MVP Requirements

**Hook registry and contract**

- Developer can consult a single registry that enumerates every hook, its
  channel, direction, and toggle key.
- Developer can add a new hook by conforming to one documented contract rather
  than copying an existing integration.
- Each hook has a stable identifier used identically on both ends.

**Toggles**

- Operator can enable or disable each hook independently on the website.
- MUD administrator can enable or disable each hook independently on the MUD.
- Operator can change any toggle without restarting the website.
- MUD administrator can change any toggle without restarting the MUD.
- A hook is active only when both ends have it enabled; either end disabled
  means off (fail closed).
- A hook whose ends disagree is reported as a distinct mismatch state, not
  silently treated as off.
- Toggles cover these 13 streams: auction new, auction bid, auction close,
  player presence, MUD shutdown, wholist, admin character delete, donation
  delivery, connection-log ingestion, flag parsing, guild parsing,
  zone/builder parsing, and process control.
- The interactive terminal is deliberately NOT toggleable - it is the operator's
  recovery path when other hooks fail. It appears in the registry as
  `always-on` and its permission gate is its only control.
- The MUD refuses to emit a disabled hook's events rather than emitting them for
  the website to discard.
- The website refuses to act on a disabled hook's inbound data.

**Observability**

- The MUD reports its toggle states to the website over the existing
  authenticated bridge, as a response to a `durisweb_hook_state` command and as
  an unsolicited push whenever a state changes. No second transport is added.
- The website treats MUD state as UNKNOWN when the bridge is down, never as
  enabled or disabled.
- Operator can see each hook's website state, MUD state, effective state, and
  last activity timestamp.
- Operator can see when a hook was last toggled and by whom.
- A toggle change is recorded in the existing admin action log.

**Transport security**

- The bridge reaches a split-host MUD via `wss://` terminated by a reverse
  proxy on the MUD host, with certificate validation on the durisweb client.
  The MUD's own listener stays loopback-only - this is the architecture its
  integration reference already mandates, not a new design.
- The website refuses a non-loopback bridge host unless the transport is `wss:`.
- The website supports a previous-secret grace window during rotation, matching
  the MUD's existing `DURISWEB_SECRET_PREVIOUS` behavior.
- Flatfile ingestion validates content before parsing: anchored patterns,
  alphabetic-only character names, and parseable IPs. A malformed line is
  dropped and counted, never partially ingested.
- When the MUD filesystem is not reachable (split-host deployment), flatfile
  hooks degrade gracefully: they report UNAVAILABLE with a clear reason, stop
  retrying on a backoff, and do not block or degrade any other hook. A
  replacement transport for this channel is deferred to a future PRD.

**MUD-side hand-off documentation**

- Every change required in the DurisMUD repository is delivered as written
  hand-off documentation in this repo, not only as code.
- A MUD engineer can implement the MUD side from that document alone, without
  reading durisweb's TypeScript.
- Each documented change states the file, the function or hook point, the exact
  property keys involved, the wire format, and the acceptance check.
- The document records which changes have landed upstream and which are still
  outstanding, so the two repositories can be reconciled at any time.

**Correctness**

- Every hook has a test proving it delivers when enabled and does not deliver
  when disabled at either end.
- Every hook recovers its correct state after a bridge reconnect.
- Existing contract tests continue to pass unmodified except by deliberate
  update.

### Deferred Requirements

- Operator can schedule a hook to re-enable automatically after a set duration.
- Operator can toggle hooks from inside the MUD via an in-game command.
- Per-hook rate limits and quotas.
- Automatic hook disable on repeated failure (circuit breaker).
- Historical charting of hook throughput.

## Non-Functional Requirements

- **Performance**: A disabled hook adds no measurable cost - the toggle check
  must be an in-memory lookup, not a database or disk read, on the event path.
  Toggle state reads add < 1ms at p95 to any event handler.
- **Toggle propagation**: A toggle change takes effect on both ends within 10
  seconds without a restart.
- **Security**: The bridge authenticates with HMAC-SHA256 over a
  connection-bound, single-use challenge with a 30-second expiry. No hook
  bypasses authentication. `DURISWEB_SECRET` remains fail-closed at >= 32 bytes
  and never appears in frontend code or logs.
- **Secret rotation**: Rotation completes with zero dropped events, using an
  overlapping previous-secret window on both ends.
- **Reliability**: The bridge reconnects automatically with backoff; no hook
  loses events across a reconnect that the transport itself did not drop.
  Hook state survives restart of either system.
- **Observability**: Every hook rejection is logged with the hook id and the
  reason; logs contain no IP addresses or account credentials.
- **Testability**: Every requirement above has a regression test.

## Constraints and Dependencies

- The MUD server is a separate repository in C at
  `/home/aiwithapex/projects/duris/`, referenced by durisweb via `MUD_DIR`.
  Changes there are cross-repo and must be coordinated.
- MUD-side configuration is `lib/duris.properties`, and the runtime mechanism
  the toggles need already exists. `src/world/properties.c` provides a
  `properties` command with `set` (in-memory, effective immediately, wizlogged
  and sql_logged), `reload` (re-read the file), `save` (persist), and `revert`,
  all gated to FORGER+. Reads go through `get_property()`, an in-memory bsearch
  over a sorted array - it already satisfies the in-memory event-path budget.
  Values are floats, so a toggle is `1.000` / `0.000`, matching the existing
  `debug.flee.stun` precedent.
- durisweb already exposes this: `manage_mud_properties` permission,
  `PropertiesView.vue`, `PropertyEditDialog.vue`, and a properties API. MUD-side
  toggles extend an existing path rather than creating one.
- Website-side settings live in the existing `web_settings` key/value table with
  a cached read path (`webSettingsService.ts`) and an admin UI.
- The MUD already supports `DURISWEB_SECRET_PREVIOUS`; the website does not.
  This asymmetry is a known gap, not a new design decision.
- Flatfile ingestion depends on the MUD writing `logs/log/comm`, `Accounts/`,
  and `Players/` on a shared filesystem. Under a split-host deployment this
  channel is expected to fail gracefully and stay dark; replacing it is out of
  scope for this phase.
- `DURISWEB_SECRET` is delivered as an environment variable from a `.env` file
  on each host (`backend/.env`, per `backend/.env.example:58`), loaded by PM2 /
  systemd on the website side and read via `getenv()` on the MUD side. It is
  not in a secrets manager and is not currently rotated on a schedule.
- The bridge default is `ws://127.0.0.1:4050`.
- Existing contract tests encode prior hardening and must not regress.
- The MUD repository already documents this integration and must be kept in
  sync: `docs/reference/api/durisweb.md` (auth handshake, available events,
  presence read protocol, rotation procedure),
  `docs/operations/CONFIGURATION.md` (every `DURISWEB_*` variable),
  `docs/operations/RUNBOOK.md`, and `docs/operations/incident-response.md`.
  Hook ids and console labels follow that vocabulary - notably
  `DURIS_WEBSOCKET_PORT` for the MUD listener port.
- The MUD's production WebSocket listener is loopback-only by design; public
  exposure is via an HTTPS/WSS reverse proxy. Any transport work follows that
  model rather than adding TLS inside the MUD.
- `DURISWEB_PRIVATE_PRESENCE` already exists as a privacy control: presence
  payloads omit account names, IP addresses, and client metadata unless it is
  set to exactly `TRUE`. Treat it as an existing data-minimization toggle.

## Phases

This system delivers the product via phases. Each phase is implemented via
multiple 2-4 hour sessions (12-25 tasks each).

| Phase | Name | Sessions | Status |
|-------|------|----------|--------|
| 00 | hooks between website & mud server + security of those hooks | 7 | Not Started |

## Phase 00: hooks between website & mud server + security of those hooks

### Objectives

1. Read the MUD side of each channel and document the authoritative contract
   before changing anything.
2. Build the hook registry and give every hook a stable shared identifier.
3. Implement website-side toggles on `web_settings` with hot reload.
4. Implement MUD-side toggles as `duris.properties` keys read through
   `get_property()`, reusing the existing `properties` command - no new config
   mechanism.
5. Implement fail-closed resolution and mismatch reporting between the two ends.
6. Add `wss://` support with certificate validation and a non-loopback guard.
7. Add previous-secret support on the website to match the MUD.
8. Harden flatfile ingestion provenance and parsing.
9. Extend the contract test suite to cover every toggle and security decision.
10. Produce and maintain `.spec_system/PRD/MUD_HANDOFF.md` covering every change
    required in the DurisMUD repository.

### Sessions (To Be Defined)

Sessions are defined via `/phasebuild` as `session_NN_name.md` stubs under
`.spec_system/PRD/phase_00/`.

**Note**: This command does NOT create phase directories or session stubs. Run
`/phasebuild` after creating the PRD.

## Technical Stack

- Node.js + Express + TypeScript (ESM) - existing backend API
- Vue 3 + Vite + TypeScript + Tailwind 4 - existing frontend, hosts the admin UI
- Knex + MySQL 8 - schema and the `web_settings` toggle store
- Redis 7 - scoped pub/sub transport for donation and presence hooks
- `ws` WebSocket client - the privileged MUD bridge
- node-pty + bubblewrap + tmux - sandboxed terminal hook
- Jest (backend) and Vitest (frontend) - contract and regression tests
- C (MUD side) - `src/net/ws_auth.h`, `ws_handlers.c`, `comm.c`, `gmcp.c`

## Deliverables

Beyond code, Phase 00 delivers:

- `.spec_system/PRD/MUD_HANDOFF.md` - every change required in the DurisMUD
  repository, specified so a MUD engineer can implement it without reading
  durisweb's TypeScript. Carries a per-change status column and is reconciled
  at each session close.

## Package Map

| Package | Path | Stack | Purpose |
|---------|------|-------|---------|
| backend | backend | TypeScript | API, all hook clients, toggle resolution |
| frontend | frontend | TypeScript | Admin UI for hook state and toggles |
| DurisMUD | /home/aiwithapex/projects/duris/ | C | External repo; MUD-side hook emitters and toggles |

## Success Criteria

- [ ] A hook registry exists and every integration point is listed in it.
- [ ] Each of the 13 enumerated hooks has an independent toggle on both ends.
- [ ] The terminal is registered as always-on and has no toggle.
- [ ] Disabling a hook on either end stops it within 10 seconds, no restart.
- [ ] A disabled hook produces no events at the source, not just discarded ones.
- [ ] Admin UI shows website state, MUD state, and effective state per hook.
- [ ] Mismatched states are shown as mismatches, not as plain "off".
- [ ] The bridge connects over `wss://` through the MUD host's reverse proxy
      with certificate validation; the MUD listener stays loopback-only.
- [ ] The website refuses a non-loopback host without `wss:`.
- [ ] `DURISWEB_SECRET` rotates end to end with zero dropped events.
- [x] Flatfile ingestion validates input before parsing.
- [ ] Every toggle and security decision has a regression test.
- [x] Flatfile hooks report UNAVAILABLE and stop retrying when the MUD
      filesystem is unreachable, without affecting other hooks.
- [ ] MUD reports its hook states over the existing bridge; no new transport.
- [ ] `MUD_HANDOFF.md` covers every MUD-side change with file, hook point,
      property key, wire format, and acceptance check.
- [ ] The MUD's `docs/reference/api/durisweb.md` and
      `docs/operations/CONFIGURATION.md` are updated for every new command,
      event, and property this phase introduces.
- [ ] All pre-existing contract tests still pass.

## Risks

- **Cross-repo coordination**: Half this work is in a separate C repository with
  its own release cycle. Mitigation: land MUD-side changes first behind
  defaults that preserve current behavior, then the website side.
- **Property key collision and precision**: `duris.properties` is a flat float
  namespace shared with game tuning. Mitigation: namespace every toggle as
  `durisweb.hook.<hook_id>`, and treat any value >= 0.5 as enabled so float
  round-tripping cannot silently disable a hook.
- **Fail-closed lockout**: A bug in toggle resolution could disable every hook
  at once. Mitigation: default to enabled on read failure for existing hooks,
  and cover resolution with tests before wiring it into event paths.
- **Silent flatfile blind spot**: under split-host the flatfile channel goes
  dark by design, and connection-log data simply stops. Mitigation: surface
  UNAVAILABLE prominently in the console rather than as an absence, so nobody
  mistakes a dark channel for a quiet one.
- **Hand-off drift**: MUD-side code can land without the document being updated,
  or vice versa. Mitigation: `MUD_HANDOFF.md` carries a status column per change
  and is reviewed at session close.
- **Contract tests assert on source text**: Refactors can break them without
  behavior changes. Mitigation: update deliberately, never by deletion.
- **Scope creep into GDPR work**: The hook surface overlaps the data-protection
  findings. Mitigation: those stay tracked separately unless a toggle is the
  mitigation.

## Assumptions

- The operator controls both systems and can deploy to both.
- Both ends can be changed; this is not a fixed third-party integration.
- The set of hooks is stable during this phase - no new streams are added.
- Global per-system toggles are sufficient; no per-user scoping is needed.
- The MUD's existing challenge design (32 random bytes, 30-second expiry,
  minute-bound HMAC, attempt throttling) is sound and is the model to conform
  to, not to replace.
- MUD-side C changes are acceptable in scope for this phase, and are delivered
  as documentation plus code so a MUD engineer can apply them independently.
- The MUD host is inside the same trust domain as the website (see Resolved
  Decisions #5).

## Resolved Decisions

All Phase 00 open questions are closed. Answers 1, 5, 6, and 7 were determined
by reading the MUD source; 2, 3, and 4 were decided by the product owner.

**1. MUD runtime config reload - already exists, no new mechanism needed.**
`src/world/properties.c` provides a `properties` command with `set` (in-memory,
immediate, wizlogged and sql_logged), `reload`, `save`, and `revert`, all
FORGER+. `get_property()` is an in-memory bsearch, so toggle checks already meet
the event-path budget. Toggles become `durisweb.hook.<hook_id>` float keys
(1.000 / 0.000, >= 0.5 means enabled), matching the existing `debug.flee.stun`
pattern. durisweb already has the `manage_mud_properties` permission and a
properties admin UI to extend.

**2. Flatfile channel under split-host - fails gracefully, replacement deferred.**
It reports UNAVAILABLE with a reason, stops retrying on a backoff, and affects
no other hook. A replacement transport is a future PRD, not this one.

**3. MUD toggle-state reporting - over the existing bridge.**
A `durisweb_hook_state` command on the authenticated WebSocket, plus an
unsolicited push when a state changes. No second transport, no new auth surface.
State is UNKNOWN while the bridge is down.

**4. Terminal hook - not toggleable.**
It is the recovery path when other hooks fail. It is listed in the registry as
`always-on`; its `terminal_access` permission gate is its only control.

**5. MUD host threat model - same trust domain as the website.**
Evidence: character names are validated `isalpha`-only at
`src/account/nanny.c:2444`, so a player cannot inject delimiters into the comm
log that durisweb's anchored patterns parse; IP addresses come from the socket,
not from user input. The remaining way to forge that channel is write access to
the MUD host filesystem - and anyone with that already holds `DURISWEB_SECRET`
and can drive the MUD process directly. Treating the host as untrusted would
therefore buy nothing while the other channels exist.

Consequence: channel 3 does not need authentication, but it does get strict
parser hardening as defence in depth - anchored patterns, alphabetic-name and
parseable-IP validation, and dropped-line counting - so a corrupted or truncated
log cannot produce garbage rows or feed junk into the Gemini analyzer.

**6. `DURISWEB_SECRET` storage and rotation - .env per host, procedure already
documented upstream.**
Website side: `.env` loaded by PM2/systemd (`backend/.env.example:58`). MUD
side: `src/core/env_file.c` loads `.env` at boot, enforcing an owner-controlled
regular file at mode 0600 or stricter, then `getenv()` is called *inside*
`ws_verify_durisweb_signature` on every verification - the secret is never
cached in a static.

Because `load_env_file()` runs once at boot and uses `setenv(..., 0)` (no
overwrite), a MUD-side key change is adopted at its next restart. That is the
coordination point, and `docs/reference/api/durisweb.md` already prescribes the
flow: deploy the new key as `DURISWEB_SECRET`, retain the old as
`DURISWEB_SECRET_PREVIOUS`, switch the backends, then remove the previous key.
The MUD accepts both keys throughout, so durisweb backends switch at their own
pace with no dropped events. No runtime `setenv` command is needed.

Remaining gap is website-side only: durisweb reads just the current secret and
must gain `DURISWEB_SECRET_PREVIOUS` support. No rotation cadence is defined
today; adopting one is an operations decision, not a blocker.

**8. Transport for split-host - reverse proxy, not TLS inside the MUD.**
`docs/reference/api/durisweb.md` states the public endpoint must be HTTPS/WSS
terminated by a local reverse proxy and that the game server's production
listener is loopback-only. So the `wss://` requirement is satisfied by proxy
configuration on the MUD host plus certificate validation in durisweb's client.
No MUD C change. This supersedes an earlier assumption that the MUD listener
itself would gain TLS.

**9. Hook inventory - 13 streams, not 11.**
Reading `docs/reference/api/durisweb.md` and `mudAuctionClient.ts` surfaced two
more authenticated streams already in use: `wholist` (`mudAuctionClient.ts:310`,
subscription gated at level 57+) and `admin_delete_character`
(`mudAuctionClient.ts:264`, called from `userManagementService.ts:294`). Both
are in scope and get toggles.

**10. Presence privacy - an existing control, not a gap.**
`DURISWEB_PRIVATE_PRESENCE` must be exactly `TRUE` for presence payloads to
include account names, IP addresses, or client metadata; the default feeds omit
them. Confirm its production value during the phase and record it.

**7. Process control and terminal permissions - stay separate.**
They already are: process control uses `requirePermission('mud_control')`, the
terminal requires `terminal_access` or the overlord role
(`backend/src/index.ts:1171`). Merging them would grant an arbitrary sandboxed
shell to everyone who can restart the MUD. Keep them distinct and document
`terminal_access` as strictly the higher privilege of the two.

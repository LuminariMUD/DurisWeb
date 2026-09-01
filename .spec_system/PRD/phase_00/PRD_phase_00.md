# PRD Phase 00: hooks between website & mud server + security of those hooks

**Status**: In Progress
**Sessions**: 7 (initial estimate)
**Estimated Duration**: 5-8 days

**Progress**: 5/7 sessions (71%)

---

## Overview

The website and the MUD are coupled through five channel types carrying 13
authenticated or filesystem-sourced streams, each built at a different time with
a different trust model and no operator control. This phase makes that surface
deliberate: one hook contract, an independent toggle per hook honored on both
ends, observable effective state including disagreement, and a transport that
can cross a host boundary.

Full requirements in [PRD.md](../PRD.md). Operator console design in
[PRD_UX.md](../PRD_UX.md). Every MUD-repository change is specified in
[MUD_HANDOFF.md](../MUD_HANDOFF.md), which is itself a phase deliverable.

---

## Progress Tracker

| Session | Name | Status | Est. Tasks | Validated |
|---------|------|--------|------------|-----------|
| 01 | Hook registry and contract | Complete (2026-09-01) | 16 | PASS |
| 02 | MUD-side toggles and state reporting | Complete (2026-09-01) | 20 | PASS |
| 03 | Website toggle store and resolution | Complete (2026-09-01) | 18 | PASS |
| 04 | Bridge state sync and transport security | Complete (2026-09-01) | 20 | PASS |
| 05 | Flatfile ingestion hardening | Complete (2026-09-01) | 22 | PASS |
| 06 | Hook Control console | Not Started | ~22 | - |
| 07 | Contract tests and doc reconciliation | Not Started | ~18 | - |

---

## Completed Sessions

- **Session 01: Hook registry and contract** (2026-09-01) - 16/16 tasks,
  25/25 tests, validation PASS. Registry of 14 hooks across 5 channels is now
  the single source of hook ids for Sessions 02-07.
- **Session 02: MUD-side toggles and state reporting** (2026-09-01) - 20/20
  tasks, clean build under -Werror, validation PASS. Eight MUD gates plus
  `durisweb_hook_state`, all defaulting to enabled. Commit `28aa1100` is pushed
  to `feat/durisweb-hook-toggles` in the MUD repo and remains unmerged.
- **Session 03: Website toggle store and resolution** (2026-09-01) - 18/18
  tasks, 56/56 tests, validation PASS. Toggle store, fail-closed resolution,
  event-path gate, and admin API. Also cleared most of the inherited migration
  blocker: backend suite went from 8 failing suites to 3.
- **Session 04: Bridge state sync and transport security** (2026-09-01) - 20/20
  tasks, 52/52 tests, validation PASS. Real MUD state now feeds resolution;
  plaintext refused across a network; certificates validated; secret rotation
  closed. Confirmed SEC-RT-1 (High).
- **Session 05: Flatfile ingestion hardening** (2026-09-01) - 22/22 tasks,
  161/161 affected tests, validation PASS. Filesystem reads are contained and
  bounded, malformed aggregates fail closed without hiding valid neighbors,
  flatfile hooks degrade independently to UNAVAILABLE with bounded recovery,
  and connection-sync logs no longer expose IP addresses.

---

## Upcoming Sessions

- Session 06: Hook Control console

---

## Objectives

1. Establish one hook contract and a registry with stable ids shared by both
   repositories.
2. Give every hook an independent toggle on both ends, applied without
   restarting either system.
3. Resolve effective state fail-closed and surface disagreement as a distinct
   mismatch, never as plain off.
4. Secure the transport for split-host deployment and close the previous-secret
   gap on the website side.
5. Harden the unauthenticated flatfile channel and make it degrade visibly.
6. Ship the operator console specified in PRD_UX.md.
7. Lock every decision in regression tests and keep both repositories'
   documentation in sync.

---

## Prerequisites

- None. This is Phase 00.
- Read access to the MUD repository at `/home/aiwithapex/projects/duris/`
  (already available locally).

---

## Technical Considerations

### Architecture

Five channels, 13 toggleable streams, plus the always-on terminal. Toggle state
lives in `web_settings` on the website and `durisweb.hook.*` properties on the
MUD. Effective state is resolved fail-closed in memory on the event path. The
MUD reports its states over the existing authenticated bridge via
`durisweb_hook_state` - no second transport.

Land MUD-side changes first with all toggles defaulting to enabled, so current
behavior is preserved exactly and the website side can follow without a
coordinated release.

### Technologies

- TypeScript/ESM, Express, Knex + MySQL (`web_settings`), Redis
- `ws` WebSocket client for the privileged bridge
- Vue 3 + shadcn-vue for the console
- C on the MUD side: `src/world/properties.c`, `src/net/ws_handlers.c`
- Jest (backend), Vitest (frontend)

### Risks

- **Cross-repo coordination**: Mitigation - MUD lands first behind
  behavior-preserving defaults; MUD_HANDOFF.md carries per-change status.
- **Property key collision/precision**: Mitigation - namespace as
  `durisweb.hook.<id>`; treat `>= 0.5` as enabled.
- **Fail-closed lockout**: Mitigation - default to enabled on read failure;
  test resolution before wiring it into event paths.
- **Silent flatfile blind spot**: Mitigation - surface UNAVAILABLE prominently,
  never as absence.
- **Hand-off drift**: Mitigation - reconcile MUD_HANDOFF.md status at each
  session close.
- **Contract tests assert on source text**: Mitigation - update deliberately,
  never by deletion.

### Relevant Considerations

- [P00] **MUD flatfile ingestion is unauthenticated**: Session 05 hardens the
  parsers. Per PRD Resolved Decision 5 the host is same-trust-domain, so this is
  defence in depth, not an auth boundary.
- [P00] **Terminal sandbox is deliberately porous**: Out of scope to change, but
  Session 01 registers the terminal as always-on and Session 06 renders it
  without a switch.
- [P00] **`web_sessions.refresh_token` may be unhashed**: Session 04 touches
  auth adjacent code - confirm then, and record the finding either way.
- [P00] **Contract tests assert on source text**: Sessions 02-06 must update
  them deliberately rather than deleting assertions that break.
- [P00] **MUD source is locally readable**: Every session verifies contracts
  against `/home/aiwithapex/projects/duris/` rather than inferring them.

---

## Success Criteria

Phase complete when:
- [ ] All 7 sessions completed and validated
- [ ] All 13 hooks have independent, working toggles on both ends
- [ ] Terminal is registered always-on with no toggle
- [ ] Toggle changes propagate within 10 seconds without restart
- [ ] A disabled hook emits nothing at the source
- [ ] Mismatch renders distinctly from off, unknown, and unavailable
- [ ] Bridge connects over `wss://` through a reverse proxy with cert validation
- [ ] Website supports `DURISWEB_SECRET_PREVIOUS`
- [x] Flatfile parsers validate input and degrade to UNAVAILABLE cleanly
- [ ] MUD_HANDOFF.md shows every change DONE or explicitly deferred
- [ ] MUD `docs/reference/api/durisweb.md` and `CONFIGURATION.md` updated
- [ ] All pre-existing contract tests still pass

---

## Dependencies

### Depends On

- Nothing. First phase.

### Enables

- Phase 01: replacement transport for the flatfile channel under split-host
  deployment (deferred from this phase by PRD Resolved Decision 2).
- The deferred requirements in PRD.md: scheduled re-enable, in-game toggle
  command, per-hook rate limits, circuit breaker, throughput charting.

# Task Checklist

**Session ID**: `phase00-session05-flatfile-ingestion-hardening`
**Total Tasks**: 22
**Work Window**: One backend trust-boundary change spanning filesystem access, parser validation, hook health, and API observability, with a shared end-to-end failure and recovery gate.
**Created**: 2026-09-01

---

Legend: `[x]` completed; `[ ]` pending; `[P]` parallelizable; `[S0005]` session ref; `TNNN` task ID.

---

## Setup (3 tasks)

- [x] T001 [S0005] Verify Sessions 03-04 are complete, record the base commit, and inspect current filesystem consumers against the live MUD checkout (`.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/spec.md`)
- [x] T002 [S0005] Run the relevant hook and parser test baseline plus backend type-check before implementation (`backend/package.json`)
- [x] T003 [S0005] Confirm representative connection, C flag, and zone record formats from the authoritative MUD files without copying player data into fixtures (`/home/aiwithapex/projects/duris/logs/log/comm`, `/home/aiwithapex/projects/duris/src/common.c`, `/home/aiwithapex/projects/duris/areas/`)

---

## Foundation (5 tasks)

- [x] T004 [S0005] Create per-hook in-memory availability, sanitized reason, dropped-input counter, failure count, and bounded exponential-backoff state with clock injection and cleanup (`backend/src/hooks/flatfileHookState.ts`)
- [x] T005 [S0005] Create a typed filesystem boundary that lazily resolves MUD_DIR, contains paths, rejects oversized or NUL-bearing input, distinguishes optional absence from root unavailability, and respects per-hook retry windows (`backend/src/services/flatfileAccess.ts`)
- [x] T006 [S0005] Overlay flatfile resource state onto effective hook resolution and expose immutable health metadata without adding I/O to status reads (`backend/src/hooks/hookSettingsService.ts`)
- [x] T007 [S0005] Export the flatfile health lifecycle and serialize reason, retry time, and dropped-input totals in the authorized hook API (`backend/src/hooks/index.ts`, `backend/src/routes/hooks.ts`)
- [x] T008 [S0005] Replace fatal startup MUD_DIR validation with a non-blocking initial probe and one cleaned-up, unref'ed recovery monitor so unrelated integrations still start (`backend/src/index.ts`)

---

## Implementation (9 tasks)

- [x] T009 [S0005] Implement fully anchored connection candidate parsing with strict timestamp, ASCII alphabetic name, and `net.isIP` validation; return explicit ignored versus malformed outcomes (`backend/src/services/mudConnectionLogSync.ts`)
- [x] T010 [S0005] Gate historical and realtime connection parsing from cached website state, count malformed candidates, remove IP addresses from logs, and add exactly one backoff-aware tail retry with cleanup on stop (`backend/src/services/mudConnectionLogSync.ts`)
- [x] T011 [S0005] Make flag source reads gated, path-contained, bounded, and all-or-nothing; reject invalid or duplicate parsed definitions and count rejected content before any database sync (`backend/src/services/mudFlagParser.ts`)
- [x] T012 [S0005] Make zone/builder paths resolve lazily from MUD_DIR and route required reads through the typed filesystem boundary without changing safe path containment (`backend/src/services/zoneBuilderParser.ts`, `backend/src/utils/safeZonePath.ts`)
- [x] T013 [S0005] Reject malformed or truncated world, mobile, object, and reset records instead of returning valid prefixes, while preserving optional absent sidecars and valid current MUD formats (`backend/src/services/zoneBuilderParser.ts`)
- [x] T014 [S0005] Enforce the guild parsing toggle on the database-backed compatibility entry point and background synchronization without falsely coupling guild availability to MUD_DIR (`backend/src/services/mudGuildParser.ts`, `backend/src/services/guildSyncService.ts`)
- [x] T015 [S0005] Reconcile registry ownership descriptions for the dormant legacy connection parser and database-backed guild parser while preserving stable hook ids and toggle keys (`backend/src/hooks/registry.ts`)
- [x] T016 [S0005] Ensure unavailable and malformed-input errors name only the hook/path context, never source content, IP addresses, credentials, or tokens (`backend/src/hooks/flatfileHookState.ts`, `backend/src/services/flatfileAccess.ts`, `backend/src/services/mudConnectionLogSync.ts`)
- [x] T017 [S0005] Verify one flatfile failure cannot alter another flatfile hook or any bridge, pubsub, process, or terminal state (`backend/src/hooks/hookSettingsService.ts`, `backend/src/hooks/flatfileHookState.ts`)

---

## Testing (5 tasks)

- [x] T018 [S0005] [P] Test health state isolation, exponential backoff cap, recovery, dropped counters, immutable snapshots, and lifecycle cleanup (`backend/src/hooks/__tests__/flatfileHookState.test.ts`)
- [x] T019 [S0005] [P] Test contained reads, traversal and symlink escape, optional absence, missing root, size limit, NUL rejection, retry suppression, and recovery (`backend/src/services/__tests__/flatfileAccess.test.ts`)
- [x] T020 [S0005] [P] Test valid IPv4/IPv6 connection lines and hostile suffix, Unicode name, invalid IP, invalid timestamp, truncation, unrelated-line, disabled-hook, counter, retry, and PII-log scenarios (`backend/src/services/__tests__/mudConnectionLogSync.test.ts`)
- [x] T021 [S0005] [P] Test flag, guild, and zone/builder success, toggle suppression, unavailable root, malformed/truncated content, all-or-nothing behavior, and recovery with isolated fixtures (`backend/src/services/__tests__/flatfileParsers.test.ts`)
- [x] T022 [S0005] Run session tests, existing hook and contract suites, full backend suite, type-check, and ASCII/LF validation; record any baseline-independent failure (`backend/package.json`, `.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/implementation-notes.md`)

---

## Completion Checklist

- [x] All tasks marked `[x]`
- [x] All tests and checks passing, except independently proven pre-existing failures
- [x] All files ASCII-encoded with LF line endings
- [x] implementation-notes.md updated
- [x] Ready for `creview` (next step in the implement -> creview -> validate sequence)

---

## Next Steps

Run the `creview` workflow step.

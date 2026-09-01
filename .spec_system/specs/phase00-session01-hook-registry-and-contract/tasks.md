# Task Checklist

**Session ID**: `phase00-session01-hook-registry-and-contract`
**Total Tasks**: 16
**Estimated Duration**: 2-3 hours
**Created**: 2026-09-01

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable (can run with other [P] tasks)
- `[S0001]` = Session reference (phase 00, session 01)
- `TNNN` = Task ID

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 3 | 3 | 0 |
| Foundation | 4 | 4 | 0 |
| Implementation | 5 | 5 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **16** | **16** | **0** |

---

## Setup (3 tasks)

Initial configuration and environment preparation.

- [x] T001 [S0001] Verify prerequisites: backend deps installed, Jest runs, MUD source readable at `/home/aiwithapex/projects/duris/`
- [x] T002 [S0001] Create `backend/src/hooks/` and `backend/src/hooks/__tests__/`
- [x] T003 [S0001] Cross-read the 9 MUD-emitting hooks against `/home/aiwithapex/projects/duris/src/net/ws_handlers.h` and `docs/reference/api/durisweb.md`; record exact emitter symbols for Session 02

---

## Foundation (4 tasks)

Core structures and base implementations.

- [x] T004 [S0001] [P] Define `HookChannel` and `HookDirection` string unions with exhaustive-switch support (`backend/src/hooks/types.ts`)
- [x] T005 [S0001] [P] Define `HookId` union and `HookDefinition` interface, with `webSettingKey` and `mudPropertyKey` explicitly nullable (`backend/src/hooks/types.ts`)
- [x] T006 [S0001] Add the 7 `bridge` channel entries: auction_new, auction_bid, auction_close, player_presence, mud_shutdown, wholist, admin_delete_character (`backend/src/hooks/registry.ts`)
- [x] T007 [S0001] Add the `pubsub` entry (donation_delivery) and the 4 `flatfile` entries (connection_log, flag_parsing, guild_parsing, zone_builder_parsing) (`backend/src/hooks/registry.ts`)

---

## Implementation (5 tasks)

Main feature implementation.

- [x] T008 [S0001] Add the `process` entry (process_control) and the always-on `terminal` entry with both keys null (`backend/src/hooks/registry.ts`)
- [x] T009 [S0001] Freeze the registry array and build `Map`-backed lookups once at module load, with no DB or disk access (`backend/src/hooks/registry.ts`)
- [x] T010 [S0001] Implement `getHook`, `getToggleableHooks`, `getHooksByChannel`, and `getMudEmittingHooks`, each with an explicit absent case for unknown ids rather than a bare `undefined` that reads as enabled (`backend/src/hooks/registry.ts`)
- [x] T011 [S0001] Create the public surface re-exporting types and helpers only, keeping the raw array unexported to preserve single-source-of-truth (`backend/src/hooks/index.ts`)
- [x] T012 [S0001] Write the contract for adding a new hook: required fields, id naming rule, channel selection, and the both-ends toggle obligation (`backend/src/hooks/README.md`)

---

## Testing (4 tasks)

Verification and quality assurance.

- [x] T013 [S0001] [P] Write registry invariant tests: 14 entries, 13 toggleable, 1 always-on, unique ids, unique `webSettingKey`, unique non-null `mudPropertyKey`, `durisweb.hook.<id>` format, every channel populated (`backend/src/hooks/__tests__/registry.test.ts`)
- [x] T014 [S0001] [P] Write lookup tests covering unknown id, empty-string id, and case-mismatched id across every exported helper (`backend/src/hooks/__tests__/registry.test.ts`)
- [x] T015 [S0001] Run `pnpm test` and `pnpm type-check` in `backend/`; verify all pre-existing contract tests still pass
- [x] T016 [S0001] Reconcile MUD_HANDOFF.md changes 1-5 and 8 against final ids and property keys; validate ASCII and LF on all created files (`.spec_system/PRD/MUD_HANDOFF.md`)

---

## Completion Checklist

Before marking session complete:

- [x] All tasks marked `[x]`
- [x] Session tests passing (24/24); 4 pre-existing contract suites still green
- [x] All files ASCII-encoded
- [x] implementation-notes.md updated
- [x] Ready for `/validate`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

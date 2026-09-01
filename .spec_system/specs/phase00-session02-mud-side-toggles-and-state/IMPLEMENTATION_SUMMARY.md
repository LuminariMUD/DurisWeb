# Implementation Summary

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Completed**: 2026-09-01
**Duration**: ~2 hours

---

## Overview

Implemented the MUD half of the hook control system: eight toggle properties,
eight source-level gates, and a `durisweb_hook_state` command with an
unsolicited push on change. Everything defaults to enabled, so this can land
upstream on its own without changing behaviour or requiring the website side.

Committed to `feat/durisweb-hook-toggles` in the MUD repository. Not pushed.

---

## Deliverables

### Files Modified (MUD repository)

| File | Changes |
|------|---------|
| `lib/duris.properties` | Eight `durisweb.hook.*` keys at 1.000 |
| `src/core/prototypes.h` | `durisweb_hook_enabled`, `is_durisweb_hook_property` |
| `src/world/properties.c` | Helper implementation; push on set and reload |
| `src/net/ws_handlers.h` | `ws_cmd_durisweb_hook_state`, `ws_broadcast_durisweb_hook_state` |
| `src/net/ws_handlers.c` | 8 gates, serializer, command handler, push, table entry |
| `src/redis/redis_donation_runtime.c` | Donation gate on the game thread |
| `docs/reference/api/durisweb.md` | Hook toggles section with the frame format |
| `docs/operations/CONFIGURATION.md` | Property family table |
| `docs/operations/RUNBOOK.md` | "Disabling a DurisWeb hook" procedure |

### Files Modified (durisweb repository)

| File | Changes |
|------|---------|
| `backend/src/hooks/registry.ts` | `connection_log` corrected to website-side only |
| `backend/src/hooks/__tests__/registry.test.ts` | 9 -> 8 MUD-gated; added a test pinning the rationale |
| `.spec_system/PRD/MUD_HANDOFF.md` | Six changes marked DONE; correction recorded |

---

## Technical Decisions

1. **`connection_log` gets no MUD property**: the lines durisweb parses are
   ordinary `LOG_COMM` operational records - `LOG_COMM` appears 16 times in
   `comm.c` alone, with a parallel `loginlog()`. Gating them would delete
   admin-facing connection data to control a web integration. Eight MUD-gated
   hooks, not nine.
2. **Donation gate on the game thread**: the obvious location, `accept_payload`,
   runs on a background thread and would race with `properties set` mutating the
   properties array. Moved to `check_donation_messages`. It is also semantically
   right - durisweb is the producer, so the MUD's control is over whether it
   *applies* an event.
3. **Drain and drop while disabled**: leaving donation events queued would fill
   to capacity and flood on re-enable. Dropping is logged once per pulse with a
   count, so a disabled hook is visible without per-event spam.
4. **Push keyed on matched keys, not the pattern**: `properties set` takes an
   fnmatch glob. Testing the pattern would have missed `properties set * 0.000`.
5. **One serializer for response and push**: the two cannot diverge.

---

## Test Results

| Metric | Value |
|--------|-------|
| MUD build | Clean, exit 0 |
| Errors | 0 |
| Warnings | 0 under `-Werror` |
| Binary | `bin/server/dms_new` linked |
| durisweb registry tests | 25/25 |

---

## Lessons Learned

1. **Never pipe a build through `tail` when the exit code matters.** The first
   build failed on a `websocket_close` arity error and reported success, because
   the pipeline returned `tail`'s status. Redirect to a file and check `$?`.
2. **Implementing a plan is where its errors surface.** The `connection_log`
   design was wrong in the PRD, the hand-off, and the registry, and only reading
   the actual log call sites revealed it.
3. **The MUD's strict build is a real safety net.** `-Werror` with
   `-Wuse-after-free=3`, `-Wstringop-overflow=4`, and `-Wshadow` turns a compile
   into a meaningful review pass.

---

## Future Considerations

1. Session 04 must confirm the production value of `DURISWEB_PRIVATE_PRESENCE`.
2. Session 07 must prove on the wire that a disabled hook emits nothing, rather
   than trusting source inspection.
3. The MUD branch is unpushed; upstream is `LuminariMUD/DurisMUD`.
4. Session 03 still blocked by the migration bootstrap defect.

---

## Session Statistics

- **Tasks**: 20 completed
- **Files Modified**: 9 (MUD) + 3 (durisweb)
- **Files Created**: 0
- **Blockers**: 1 resolved

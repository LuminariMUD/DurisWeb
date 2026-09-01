# Task Checklist

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Total Tasks**: 20
**Estimated Duration**: 3-4 hours
**Created**: 2026-09-01

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable (can run with other [P] tasks)
- `[S0002]` = Session reference (phase 00, session 02)
- `TNNN` = Task ID

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 3 | 3 | 0 |
| Foundation | 4 | 4 | 0 |
| Implementation | 9 | 9 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **20** | **20** | **0** |

---

## Setup (3 tasks)

- [x] T001 [S0002] Create a working branch in the MUD repo; confirm clean tree and never push from this session
- [x] T002 [S0002] Generate the nine property keys and guard sites from `getMudGatedHooks()` rather than transcribing them
- [x] T003 [S0002] Verify the build path: locate the build entry point and confirm a compile check is possible

---

## Foundation (4 tasks)

- [x] T004 [S0002] Append the nine `durisweb.hook.*` keys at `1.000` under a labelled section (`lib/duris.properties`)
- [x] T005 [S0002] Declare `durisweb_hook_enabled` and the state-change notifier (`src/world/properties.h`)
- [x] T006 [S0002] Implement `durisweb_hook_enabled` reading via `get_property(key, 1.0, false)` with a `>= 0.5` threshold, defaulting unknown keys to enabled so an older properties file cannot disable a live hook (`src/world/properties.c`)
- [x] T007 [S0002] Declare `ws_cmd_durisweb_hook_state` and the push entry point (`src/net/ws_handlers.h`)

---

## Implementation (9 tasks)

- [x] T008 [S0002] Guard the three auction emitters at the top of each function, before any cJSON allocation (`src/net/ws_handlers.c`)
- [x] T009 [S0002] Guard both presence emitters -- `ws_broadcast_player_login` and `ws_broadcast_player_logout` -- so presence cannot be half-disabled (`src/net/ws_handlers.c`)
- [x] T010 [S0002] Guard `ws_broadcast_mud_shutdown` (`src/net/ws_handlers.c`)
- [x] T011 [S0002] Guard `ws_send_wholist_to_client` and `ws_cmd_admin_delete_character`, returning an explicit refusal to the caller rather than silence for the command path (`src/net/ws_handlers.c`)
- [x] T012 [S0002] Guard donation application in the Redis worker with an explicit drop-and-log path (`src/redis/redis_donation_worker.c`)
- [x] T013 [S0002] Implement a single `hook_state` frame serializer with `schema_version`, used by both the command response and the push so the two cannot diverge (`src/net/ws_handlers.c`)
- [x] T014 [S0002] Implement `ws_cmd_durisweb_hook_state` with authorization enforced at the handler before any state is serialized, rejecting unauthenticated descriptors (`src/net/ws_handlers.c`)
- [x] T015 [S0002] Register the command in the handler table (`src/net/ws_handlers.c`)
- [x] T016 [S0002] Push state to authenticated service peers when a `durisweb.hook.` property changes, and only for that prefix (`src/world/properties.c`)

---

## Testing (4 tasks)

- [x] T017 [S0002] Compile-check the touched translation units; report honestly if a full build is impractical
- [x] T018 [S0002] [P] Verify all nine guards sit at the top of their emitter and match the registry `mudSite` values
- [x] T019 [S0002] [P] Update MUD docs: `docs/reference/api/durisweb.md`, `docs/operations/CONFIGURATION.md`, `docs/operations/RUNBOOK.md`
- [x] T020 [S0002] Reconcile MUD_HANDOFF.md status column; validate ASCII and LF on all touched files

---

## Completion Checklist

Before marking session complete:

- [x] All tasks marked `[x]`
- [x] Full build clean under -Werror (make exit 0, 0 warnings, binary linked)
- [x] All files ASCII-encoded (one pre-existing em dash in RUNBOOK.md untouched)
- [x] implementation-notes.md updated
- [x] Ready for `/validate`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

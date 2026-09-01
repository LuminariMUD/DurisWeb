# Implementation Notes

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Started**: 2026-09-01 11:20
**Last Updated**: 2026-09-01 11:55

---

## Session Progress

| Metric | Value |
|--------|-------|
| Tasks Completed | 20 / 20 |
| Blockers | 0 |

---

## Task Log

### T001-T003 - Setup

Branched the MUD repo to `feat/durisweb-hook-toggles` from a clean `master`.
Nothing is pushed from this session; the MUD repo has its own remote
(`LuminariMUD/DurisMUD`).

Property keys and guard sites were **generated** by running
`getMudGatedHooks()` from the Session 01 registry, not transcribed, so the two
repositories cannot drift.

Build entry point is `make -C src`, which compiles with `-Werror` and a strict
warning set (`-Wall -Wextra -Wpedantic -Wshadow -Wuse-after-free=3` and more).

---

### T004 - Properties (with a correction)

Appended a labelled `[DurisWeb hook toggles]` block to `lib/duris.properties`
with **eight** keys, not the nine the plan called for. See Design Decision 1.

**Files Changed**: `lib/duris.properties`

---

### T005-T007 - Helper and declarations

There is no `src/world/properties.h`; the project declares these in
`src/core/prototypes.h`. Added `durisweb_hook_enabled` and
`is_durisweb_hook_property` there.

`durisweb_hook_enabled` formats `durisweb.hook.<id>` and calls
`get_property(key, 1.0, false)`. The `false` matters: `fussy` logging on a
missing key would fire on every event.

**BQC Fixes**:
- Failure path completeness: `snprintf` truncation is checked, so an
  over-long id returns disabled rather than querying a truncated key.
- Trust boundary: null and empty ids return disabled rather than formatting a
  bare prefix key.

**Files Changed**: `src/core/prototypes.h`, `src/world/properties.c`

---

### T008-T012 - Guards

Eight gates. All seven broadcast guards were verified to sit **before** the
first `cJSON_Create` in their function, so a disabled hook allocates nothing:

| Function | Guard line | First alloc |
|----------|-----------|-------------|
| `ws_broadcast_auction_new` | 372 | 375 |
| `ws_broadcast_auction_bid` | 407 | 410 |
| `ws_broadcast_auction_close` | 442 | 445 |
| `ws_broadcast_mud_shutdown` | 477 | 480 |
| `ws_broadcast_player_login` | 506 | 514 |
| `ws_broadcast_player_logout` | 553 | 559 |
| `ws_send_wholist_to_client` | 587 | 590 |

**BQC Fixes**:
- Failure path completeness: `admin_delete_character` is a request path with a
  caller waiting, so a disabled hook returns an explicit error rather than
  silence. Authorization is still checked first, so an unauthenticated caller
  learns nothing about hook configuration.
- Concurrency safety: the donation gate was moved off the worker thread. See
  Design Decision 2.

**Files Changed**: `src/net/ws_handlers.c`, `src/redis/redis_donation_runtime.c`

---

### T013-T016 - State reporting

One serializer (`ws_build_durisweb_hook_state_json`) feeds both the command
response and the push, so they cannot diverge. Frame carries
`schema_version: 1`, matching the existing donation event convention.

**BQC Fixes**:
- Trust boundary: `ws_cmd_durisweb_hook_state` checks `durisweb_verified`
  before serializing anything, logs the attempt, and closes the socket -
  matching how other service commands treat unauthenticated peers.
- Contract alignment: fixed a real bug in the push trigger. See Design
  Decision 3.

**Files Changed**: `src/net/ws_handlers.c`, `src/net/ws_handlers.h`,
`src/world/properties.c`

---

### T017-T020 - Verification and docs

Build, guard-placement verification, MUD documentation, and MUD_HANDOFF
reconciliation. Build result recorded in the Test Results section of the
validation report.

**Files Changed**: `docs/reference/api/durisweb.md`,
`docs/operations/CONFIGURATION.md`, `docs/operations/RUNBOOK.md`,
`.spec_system/PRD/MUD_HANDOFF.md` (durisweb repo)

---

## Design Decisions

### Decision 1: `connection_log` gets no MUD property

**Context**: The plan called for nine MUD-gated hooks including
`connection_log`, gating "whether durisweb-consumed connection lines are
written" to `logs/log/comm`.

**What I found**: those lines are not durisweb-specific. `LOG_COMM` is a
general operational log used 16 times in `comm.c` alone and twice in
`nanny.c`, and the login path writes a parallel `loginlog()` as well. The exact
lines durisweb parses (`Losing player:`, `Closing link to:`,
`... has reconnected.`) are ordinary MUD admin records.

**Options Considered**:
1. Gate the log writes as planned - would delete admin-facing connection
   records whenever someone toggled a website hook. An admin reading the comm
   log would silently lose data for a reason that has nothing to do with the
   MUD.
2. No MUD property; toggle ingestion on the durisweb side instead.

**Chosen**: Option 2. Eight MUD-gated hooks, not nine.
**Rationale**: The PRD's rule is "the source does not emit a disabled hook's
events." For this hook the MUD is not really the source of a durisweb event -
it writes its own log, and durisweb happens to tail it. Sacrificing MUD
observability to control a web integration inverts the priority. Session 01's
registry, its tests, MUD_HANDOFF.md, and the MUD docs were all updated.

### Decision 2: Donation gate runs on the game thread, not the worker thread

**Context**: `redis_donation_worker.c` decodes and queues events on a
background `std::thread`. The obvious guard location was `accept_payload`.

**Options Considered**:
1. Guard in `accept_payload` - reads `duris_properties` from the worker thread
   while `properties set` mutates it from the game thread. A data race.
2. Guard in `check_donation_messages` (`redis_donation_runtime.c`), the
   game-thread pump that applies events.

**Chosen**: Option 2.
**Rationale**: keeps every properties read on the game thread. It is also the
semantically correct place: durisweb is the producer here, so the MUD's control
is over whether it *applies* an event, not whether one is published.

Also chose to **drain and drop** while disabled rather than stop taking from
the queue. Leaving events queued would fill to `REDIS_DONATION_QUEUE_CAPACITY`
and then flood on re-enable. Dropping is logged once per pulse with a count, so
a disabled hook is visible in the log rather than silent, without per-event
spam.

### Decision 3: Push keyed on matched keys, not the command pattern

**Context**: `properties set` takes an **fnmatch glob**, not an exact key.

**Bug caught**: the first implementation tested
`is_durisweb_hook_property(pattern)`. `properties set * 0.000` would have
disabled every hook while matching no prefix, so no push would fire and the
website would keep showing every hook as enabled - exactly the silent
disagreement this phase exists to eliminate.

**Chosen**: track a `hook_changed` flag inside the match loop, set when an
actually-matched key is in the family. Also added a push after
`properties reload`, which can change many keys at once.

---

## Build Result

Full `make -C src` build: **clean**. Exit 0, zero errors, zero warnings under
`-Werror` with `-Wall -Wextra -Wpedantic -Wshadow=compatible-local
-Wuse-after-free=3 -Wformat=2` and more. `bin/server/dms_new` linked;
`net/ws_handlers.o` and `world/properties.o` both rebuilt from the edited
sources.

The first build **failed** and I initially misread it as passing: the command
was piped through `tail`, so the shell reported `tail`'s exit status rather than
`make`'s. The real error was `websocket_close(d)` -- the function takes
`(d, code, reason)`. Fixed to
`websocket_close(d, WS_CLOSE_POLICY_VIOLATION, "Not authorized")`, matching the
convention at the other call sites, and rebuilt capturing the exit code
directly.

## Blockers & Solutions

### Blocker 1: Build failure masked by a pipeline exit code

**Description**: `make 2>&1 | tail -30` returns tail's exit status, so a failing
build reported success.
**Impact**: T017
**Resolution**: Redirected build output to a file and captured `$?` from `make`
itself. Fixed the underlying arity error and rebuilt clean.
**Time Lost**: ~10 minutes, plus one wasted full build

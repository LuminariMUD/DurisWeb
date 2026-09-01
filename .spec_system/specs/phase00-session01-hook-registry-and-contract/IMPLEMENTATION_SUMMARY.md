# Implementation Summary

**Session ID**: `phase00-session01-hook-registry-and-contract`
**Package**: backend
**Completed**: 2026-09-01
**Duration**: ~2.5 hours

---

## Overview

Built the hook registry that is now the single source of truth for
website<->MUD integration ids. 14 hooks across 5 channels: 13 toggleable plus
the always-on terminal. Every id was verified against the MUD C source rather
than inferred from durisweb, which caught two errors in the planning documents.

No behaviour changed. The module is inert data plus pure lookups, deliberately
landing structure before enforcement so a resolution bug cannot mass-disable
hooks before Session 03 tests it.

---

## Deliverables

### Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/hooks/types.ts` | Hook types with explicitly nullable keys | ~75 |
| `backend/src/hooks/registry.ts` | 14 entries, frozen, with O(1) lookups | ~285 |
| `backend/src/hooks/index.ts` | Public surface; raw array stays unexported | ~20 |
| `backend/src/hooks/README.md` | Contract for adding a new hook | ~95 |
| `backend/src/hooks/__tests__/registry.test.ts` | 24 tests | ~185 |

### Files Modified

| File | Changes |
|------|---------|
| `.spec_system/PRD/MUD_HANDOFF.md` | Corrected Change 3 emitter table; pointed at `getMudGatedHooks()` as generated source |
| `.spec_system/CONSIDERATIONS.md` | Added 2 technical-debt items found during setup |
| `backend/package.json` | Version 1.0.0 -> 1.0.1 |

---

## Technical Decisions

1. **One hook for player presence, not three**: the MUD has separate login and
   logout emitters plus a Redis presence feed. Toggle granularity should match
   operator intent, not implementation topology - and a partial state (login on,
   logout off) would leave the website with players who never leave. All three
   sites are recorded in `mudSite`.
2. **Derive keys from ids rather than writing literals**: `webKey(id)` and
   `mudKey(id)` generate `hook_enabled_<id>` and `durisweb.hook.<id>`. A typo in
   a literal would silently produce a hook that can never be disabled from one
   side - the exact contract-drift failure the BQC warns about.
3. **`requireHook` alongside `getHook`**: an unregistered id returning
   `undefined` is ambiguous where a caller decides whether to deliver an event.
   `requireHook` throws with the offending id, and the docs state that
   `undefined` is never an open gate. Fail closed is the phase's governing
   principle; the lookup layer should not contradict it.
4. **Registry frozen, maps built once at load**: satisfies the sub-1ms
   in-memory budget Session 03 must hit on event paths.

---

## Test Results

| Metric | Value |
|--------|-------|
| Session tests | 24 |
| Passed | 24 |
| Failed | 0 |
| Pre-existing contract suites | 19/19 passing |
| Type-check | Clean |

---

## Lessons Learned

1. **Reading the MUD source found two planning errors.** `player_presence` has
   two emitters, not one, and `donation_delivery` has no WebSocket emitter at
   all - the MUD consumes it via `src/redis/redis_donation_worker.c`. Both were
   wrong in MUD_HANDOFF.md. Verifying against the other repository is worth the
   time on every cross-repo session.
2. **The repo cannot bootstrap a fresh database.** Discovered while setting up
   the test environment, not by reading code. Environment setup is a real source
   of findings, not just overhead.
3. **Port assumptions do not hold on a shared machine.** 3306 and 6379 were both
   occupied, and the MUD's own database container publishes no ports at all.
   Isolated containers on non-default ports, configured outside the repo, avoided
   touching committed compose files.

---

## Future Considerations

1. **Blocks Session 03**: a fresh database cannot be migrated -
   `017_add_terminal_access_permission.ts` inserts into `admin_permissions`,
   created 33 positions later. Must be resolved before a new migration can be
   verified. Fix cannot rename released migrations (CONVENTIONS.md).
2. **14 `.sql` migrations are never applied** - `knexfile.ts` sets
   `extension: 'ts'`. Determine whether they are dead or a manual step.
3. **113 dependency vulnerabilities** (3 critical, 58 high) exist in the tree.
   Not introduced here; triage outside Phase 00.
4. **Session 02 should generate its property block** from `getMudGatedHooks()`
   rather than transcribing, so the repositories cannot drift.
5. **Confirm the production value of `DURISWEB_PRIVATE_PRESENCE`** - recorded in
   the `player_presence` entry as a privacy-relevant unknown.

---

## Session Statistics

- **Tasks**: 16 completed
- **Files Created**: 5
- **Files Modified**: 3
- **Tests Added**: 24
- **Blockers**: 1 resolved (environment), 1 escalated (migration bootstrap)

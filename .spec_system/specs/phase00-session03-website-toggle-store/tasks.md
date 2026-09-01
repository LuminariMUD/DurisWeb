# Task Checklist

**Session ID**: `phase00-session03-website-toggle-store`
**Total Tasks**: 18
**Estimated Duration**: 2-3 hours
**Created**: 2026-09-01

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable
- `[S0003]` = Session reference (phase 00, session 03)
- `TNNN` = Task ID

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 3 | 3 | 0 |
| Foundation | 5 | 5 | 0 |
| Implementation | 6 | 6 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **18** | **18** | **0** |

---

## Setup (3 tasks)

- [x] T001 [S0003] Verify the test database is reachable with the MUD schema present and durisweb migrations current
- [x] T002 [S0003] Record the dev-database bootstrap procedure so it is reproducible (`.spec_system/specs/phase00-session03-website-toggle-store/dev-database.md`)
- [x] T003 [S0003] Confirm the migration-ordering fix from the blocker work still applies cleanly (`backend/migrations/016a_bootstrap_admin_permission_tables.ts`)

---

## Foundation (5 tasks)

- [x] T004 [S0003] [P] Define the effective-state union and inputs, keeping MISMATCH, UNKNOWN, and UNAVAILABLE distinct rather than collapsed to OFF (`backend/src/hooks/hookResolution.ts`)
- [x] T005 [S0003] Implement pure resolution with exhaustive switch handling, treating a hook with no MUD side as web-decided rather than MUD-off (`backend/src/hooks/hookResolution.ts`)
- [x] T006 [S0003] Write the migration seeding one `web_settings` row per toggleable hook, additive and idempotent with a `down` that removes only its own rows (`backend/migrations/20260901000000_hook_toggles.ts`)
- [x] T007 [S0003] [P] Define the MUD state provider interface with an injectable default reporting UNKNOWN, so this session is testable before Session 04 exists (`backend/src/hooks/hookSettingsService.ts`)
- [x] T008 [S0003] Implement the settings store with schema-validated reads and a read-failure path that defaults to enabled rather than mass-disabling (`backend/src/hooks/hookSettingsService.ts`)

---

## Implementation (6 tasks)

- [x] T009 [S0003] Implement toggle writes with cache invalidation on the same path, so a change is in effect before the call returns (`backend/src/hooks/hookSettingsService.ts`)
- [x] T010 [S0003] Write every toggle change to the admin action log with the acting account and old/new value (`backend/src/hooks/hookSettingsService.ts`)
- [x] T011 [S0003] Implement the synchronous event-path gate reading only cached state, with an explicit path for always-on and unregistered ids (`backend/src/hooks/hookGate.ts`)
- [x] T012 [S0003] Add the read endpoint returning web, MUD, and effective state per hook, with authorization enforced at the route (`backend/src/routes/hooks.ts`)
- [x] T013 [S0003] Add the write endpoint with schema-validated input, duplicate-trigger protection, and explicit error mapping (`backend/src/routes/hooks.ts`)
- [x] T014 [S0003] Export the new surface and mount the router (`backend/src/hooks/index.ts`, `backend/src/index.ts`)

---

## Testing (4 tasks)

- [x] T015 [S0003] [P] Test every cell of the state matrix including not-MUD-gated and always-on hooks (`backend/src/hooks/__tests__/hookResolution.test.ts`)
- [x] T016 [S0003] [P] Test store read failure, missing row, unparseable value, and cache invalidation on write (`backend/src/hooks/__tests__/hookSettingsService.test.ts`)
- [x] T017 [S0003] Apply and roll back the migration against the test database; verify one row per toggleable hook and none for the terminal
- [x] T018 [S0003] Run the full backend suite and type-check; validate ASCII and LF

---

## Completion Checklist

- [x] All tasks marked `[x]`
- [x] Session tests passing (56/56 across 3 hook suites)
- [x] All files ASCII-encoded
- [x] implementation-notes.md updated
- [x] Ready for `/validate`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

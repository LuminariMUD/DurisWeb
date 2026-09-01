# Implementation Summary

**Session ID**: `phase00-session03-website-toggle-store`
**Package**: backend
**Completed**: 2026-09-01
**Duration**: ~3 hours

---

## Overview

Built the website half of the hook control system: per-hook toggles in
`web_settings`, the fail-closed resolution engine that combines both ends, a
synchronous event-path gate, and a permission-gated admin API.

Also cleared most of the blocker carried forward from Session 01, taking the
backend suite from 8 failing suites (88 tests) to 3 (33), and documented a
reproducible database bootstrap.

---

## Deliverables

### Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/hooks/hookResolution.ts` | Pure state resolution, 5 effective states | ~150 |
| `backend/src/hooks/hookSettingsService.ts` | Store, cache, audit-logged writes | ~250 |
| `backend/src/hooks/hookGate.ts` | Synchronous event-path gate | ~60 |
| `backend/src/routes/hooks.ts` | Admin API, permission-gated | ~120 |
| `backend/migrations/20260901000000_hook_toggles.ts` | Seeds 13 rows from the registry | ~60 |
| `backend/migrations/016a_bootstrap_admin_permission_tables.ts` | Migration-ordering fix | ~105 |
| `backend/src/hooks/__tests__/hookResolution.test.ts` | Full state matrix | ~145 |
| `backend/src/hooks/__tests__/hookSettingsService.test.ts` | Store and failure modes | ~180 |
| `.spec_system/specs/.../dev-database.md` | Reproducible DB bootstrap | ~65 |

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/hooks/index.ts` | Export the new surface |
| `backend/src/index.ts` | Mount the hooks router |
| `backend/migrations/20251115000000_admin_permissions_system.ts` | `hasTable` guards, conflict-tolerant seeds |

---

## Technical Decisions

1. **Read failure defaults to enabled.** Fail-closed governs a *known*
   disagreement; an unreadable settings table is absence of knowledge.
   Defaulting it closed would let one transient database error sever every MUD
   integration at once.
2. **MUD state defaults to UNKNOWN, not enabled.** Claiming knowledge we lack
   would let a hook read ON while the MUD has it off.
3. **Five effective states, not two.** MISMATCH, UNKNOWN, and UNAVAILABLE are
   all inactive but stay distinguishable, so the console can explain *why*.
4. **Reuse `property_change` for audit.** Avoids ALTERing an ENUM on a table in
   the MUD's shared schema; `target = 'hook:<id>'` keeps it filterable.
5. **Injectable MUD state provider.** Lets this session be complete and tested
   before the bridge exists in Session 04.

---

## Test Results

| Metric | Value |
|--------|-------|
| Session tests | 56 |
| Passed | 56 |
| Full suite | 366/399 (54 of 57 suites) |
| Type-check | Clean |
| Migration | up / idempotent / down / re-apply all verified |

---

## Lessons Learned

1. **The recorded blocker was a symptom, not the cause.** Session 01 called it an
   `admin_permissions` ordering defect. It is actually two deeper facts: durisweb
   shares the MUD's database, and the numeric-to-timestamp migration rename makes
   *every* numeric migration sort before *every* timestamped one. Worth
   re-investigating an inherited finding rather than trusting its framing.
2. **Environment work produces findings.** SEC-TZ-1 - session expiry failing open
   across a timezone boundary - surfaced only because a regression test failed
   while building a test database, and only by checking whether it was a real bug
   rather than assuming data absence.
3. **Verify the deliverable even when the surrounding machinery is broken.** The
   migration chain cannot reach the new migration, so it was executed directly.
   That is a real test; pretending the chain works would not have been.

---

## Future Considerations

1. Migration chain still halts at `045`. A squash to a baseline deserves its own
   scope.
2. Three suites need their own fixtures (33 tests).
3. SEC-TZ-1 needs an owner - it fails open on an auth boundary.
4. Session 04 replaces the UNKNOWN provider with real bridge state.
5. Session 07: consider making toggle + audit atomic (SEC-3-2).

---

## Session Statistics

- **Tasks**: 18 completed
- **Files Created**: 9
- **Files Modified**: 3
- **Tests Added**: 31
- **Blockers**: 1 resolved, 1 partially resolved and escalated

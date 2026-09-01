# Session Specification

**Session ID**: `phase00-session03-website-toggle-store`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Not Started
**Created**: 2026-09-01
**Package**: backend
**Package Stack**: TypeScript

---

## 1. Session Overview

Session 01 defined the hooks; Session 02 gave the MUD its half of the switch.
This session builds the website half and the piece that makes the pair mean
something: the resolution engine that combines both ends into one effective
state.

Resolution is where the phase's central rule lives. A hook is active only when
both ends enable it; either end off means off; the two disagreeing is a
*mismatch*, reported as its own state rather than flattened to "off". Getting
this wrong in the direction of over-disabling would take the whole integration
down, so resolution is written and exhaustively tested before it is wired into
any event path.

Storage reuses `web_settings`, which already has a cached read path and an admin
UI. Nothing new is invented where something works.

---

## 2. Objectives

1. Persist a per-hook website toggle in `web_settings`, defaulting to enabled.
2. Resolve effective state from both ends: ON, OFF, MISMATCH, UNKNOWN,
   UNAVAILABLE - fail closed, never silently.
3. Provide an in-memory enforcement helper meeting the sub-1ms event-path budget.
4. Expose a permission-gated admin API that reads state and sets website
   toggles, writing every change to the existing admin action log.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-hook-registry-and-contract` - hook ids and setting keys
- [x] `phase00-session02-mud-side-toggles-and-state` - the MUD state this
      resolves against

### Required Tools/Knowledge

- Knex migrations against the shared MUD database (see Environment)
- The existing `webSettingsService.ts` cache and `requirePermission` middleware

### Environment Requirements

- MySQL reachable with the MUD schema present. durisweb shares the MUD's
  database; a test database is built by cloning the MUD schema structure-only.
  Row data must NOT be copied - it is real player PII.

---

## 4. Scope

### In Scope (MVP)

- Operator can enable or disable each hook independently on the website
- Operator can change any toggle without restarting the website
- A hook is active only when both ends enable it (fail closed)
- Ends that disagree produce a distinct MISMATCH state
- Toggle state reads on an event path are in-memory only
- Operator can see each hook's website state, MUD state, and effective state
- A toggle change is recorded in the admin action log with the actor

### Out of Scope (Deferred)

- Consuming MUD state over the bridge - *Reason: Session 04 owns the transport;
  this session defines the interface it will feed*
- Flatfile UNAVAILABLE detection - *Reason: Session 05*
- The operator console - *Reason: Session 06*
- Wiring enforcement into every existing event path - *Reason: the helper is
  delivered and unit-tested here; per-hook wiring lands with each hook's session*

---

## 5. Technical Approach

### Architecture

Three layers, deliberately separated so the risky one can be tested alone:

1. **Store** (`hookSettingsService.ts`) - reads and writes `web_settings` rows,
   backed by the existing settings cache so a read is in-memory after first load.
2. **Resolution** (`hookResolution.ts`) - a pure function from
   `(webState, mudState)` to an effective state. No I/O, no dependencies,
   exhaustively tested.
3. **Enforcement** (`hookGate.ts`) - the event-path helper. Synchronous, reads
   the cache, never awaits the database.

MUD state is supplied by an injectable provider so this session can be built and
tested before Session 04 exists. Until then the provider reports UNKNOWN.

### State model

| Web | MUD | Effective |
|-----|-----|-----------|
| on | on | ON |
| off | any | OFF |
| on | off | MISMATCH (inactive) |
| on | unknown | UNKNOWN (inactive) |
| on | unavailable | UNAVAILABLE (inactive) |
| any | not MUD-gated | follows web state |

MISMATCH, UNKNOWN, and UNAVAILABLE are all inactive - fail closed - but remain
distinguishable so the console can explain *why* a hook is not running.

### Design Patterns

- **Pure core**: resolution has no I/O, so every combination is cheap to test.
- **Fail closed, degrade loudly**: inactive states are distinct, never collapsed.
- **Read failure defaults to enabled**: a database error must not mass-disable a
  working integration. Fail-closed applies to *known* disagreement, not to an
  unreadable store.

### Technology Stack

- TypeScript 5.9 ESM, Knex, MySQL, Jest

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `backend/migrations/20260901000000_hook_toggles.ts` | Seed one `web_settings` row per toggleable hook | ~55 |
| `backend/src/hooks/hookResolution.ts` | Pure state resolution | ~110 |
| `backend/src/hooks/hookSettingsService.ts` | Store, cache, audit-logged writes | ~180 |
| `backend/src/hooks/hookGate.ts` | Event-path enforcement helper | ~70 |
| `backend/src/routes/hooks.ts` | Permission-gated admin API | ~130 |
| `backend/src/hooks/__tests__/hookResolution.test.ts` | Exhaustive state matrix | ~140 |
| `backend/src/hooks/__tests__/hookSettingsService.test.ts` | Store and failure modes | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/index.ts` | Export the new surface | ~10 |
| `backend/src/index.ts` | Mount the hooks router | ~3 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Every toggleable hook has a `web_settings` row defaulting to enabled
- [ ] Resolution is correct for every combination in the state matrix
- [ ] Either end disabled yields an inactive effective state
- [ ] Disagreement yields MISMATCH, distinguishable from OFF
- [ ] A store read failure defaults to enabled, never a mass disable
- [ ] Toggle changes apply without a restart
- [ ] Every toggle change is written to the admin action log with the actor
- [ ] The admin API is permission-gated

### Testing Requirements

- [ ] Unit tests written and passing
- [ ] Manual testing completed

### Non-Functional Requirements

- [ ] The enforcement helper performs no database or disk read
- [ ] Migration has a working `down`

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- The migration writes to `web_settings`, a table shared with the MUD's
  database. It must be additive and idempotent, and its `down` must remove only
  the rows it added.
- Resolution must not treat "MUD not gated" as "MUD off". Five hooks
  (connection_log, flag/guild/zone parsing, process_control) have no MUD side;
  for them the web toggle alone decides.

### Potential Challenges

- **Cache staleness**: `webSettingsService` caches with a TTL. A toggle write
  must invalidate immediately or the 10-second propagation budget is missed.
- **Terminal is always-on**: it has no setting row. Every code path must handle
  a hook with a null `webSettingKey` without throwing.

### Relevant Considerations

- [P00] **durisweb shares the MUD's database**: the migration lands in a schema
  the MUD also owns. Keep it strictly additive.
- [P00] **SEC-TZ-1**: do not introduce another timestamp comparison that depends
  on app and database timezones agreeing.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session:
- Resolution defaulting to enabled on a *known* disagreement, silently
  defeating the fail-closed rule
- A store read failure cascading into disabling every hook at once
- A toggle write succeeding but not invalidating the cache, so the console
  reports a change that is not in effect

---

## 9. Testing Strategy

### Unit Tests

- Every cell of the state matrix, including the not-MUD-gated row
- Always-on hooks resolve ON regardless of inputs
- Unknown hook id is rejected rather than defaulting
- Store read failure yields enabled, and says so
- Cache invalidated on write

### Integration Tests

- Migration applies and rolls back cleanly against the test database

### Manual Testing

- Apply migration; confirm one row per toggleable hook, all enabled
- Confirm the terminal has no row

### Edge Cases

- Hook with `mudPropertyKey: null`
- Always-on hook passed to every function
- Setting row missing entirely (hook added after the migration)
- Setting row containing an unparseable value

---

## 10. Dependencies

### External Libraries

- None added.

### Other Sessions

- **Depends on**: Sessions 01, 02
- **Depended by**: Sessions 04, 05, 06, 07

---

## Next Steps

Run `/implement` to begin AI-led implementation.

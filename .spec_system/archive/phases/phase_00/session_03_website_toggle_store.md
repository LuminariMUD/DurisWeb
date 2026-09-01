# Session 03: Website toggle store and resolution

**Session ID**: `phase00-session03-website-toggle-store`
**Package**: backend
**Status**: Not Started
**Estimated Tasks**: ~18
**Estimated Duration**: 2-3 hours

---

## Objective

Store website-side toggles in `web_settings`, and build the fail-closed
resolution engine that combines both ends into an effective state.

---

## Scope

### In Scope (MVP)

- `web_settings` keys per hook, defaulting to enabled
- Hot reload via the existing settings cache - no restart
- In-memory resolution: web state + MUD state -> ON / OFF / MISMATCH /
  UNKNOWN / UNAVAILABLE
- Fail closed: either end off means off; read failure defaults to enabled
- Enforcement helper for event paths, meeting the < 1ms p95 budget
- Toggle changes written to the existing admin action log with actor
- Admin API for reading state and setting website-side toggles

### Out of Scope

- Consuming MUD state over the bridge (Session 04)
- Frontend (Session 06)
- Flatfile-specific UNAVAILABLE detection (Session 05)

---

## Prerequisites

- [ ] Session 01 complete - registry available

---

## Deliverables

1. Migration adding hook toggle rows to `web_settings`
2. Resolution engine module with exhaustive state tests
3. Enforcement helper wired into website-side hook consumers
4. Admin API endpoints, permission-gated
5. Audit log entries on every toggle change

---

## Success Criteria

- [ ] Every registered hook has a website toggle defaulting to enabled
- [ ] Resolution is exhaustively tested across all state combinations
- [ ] Read failure defaults to enabled, never to a mass disable
- [ ] Toggle check on the event path is an in-memory lookup, no DB or disk
- [ ] Changes apply without restart and are audit-logged with actor
- [ ] Disabling a hook stops the website acting on its inbound data

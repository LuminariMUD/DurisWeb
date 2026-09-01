# Session 06: Hook Control console

**Session ID**: `phase00-session06-hook-control-console`
**Packages**: frontend, backend
**Status**: Not Started
**Estimated Tasks**: ~22
**Estimated Duration**: 3-4 hours

---

## Objective

Build the operator console specified in PRD_UX.md: dual-state rows, toggles that
never lie, and mismatch that is impossible to scan past.

Primary deliverables are in `frontend`; `backend` is a secondary dependency for
any API gaps found during integration.

---

## Scope

### In Scope (MVP)

- Route `/admin/mud/hooks` in the `mud` sidebar group
- `DualStateLamp` with the hazard-hatch mismatch treatment
- `HookRow`, `HookGroup` by channel, `HookToggle` with ON/OFF/PENDING
- Terminal row rendered `ALWAYS ON` with no switch
- States: ON, OFF, MISMATCH, UNKNOWN, UNAVAILABLE - each with label and shape,
  never colour alone
- `TransportPanel`: scheme, host, cert expiry, secret age; blocking error for
  non-loopback over `ws:`
- `HookDetailSheet` with both ends' provenance and a reconcile action
- Add the amber `--warning` token to light and dark blocks
- Deep link `?hook=<id>`
- Hook-health summary card on the MUD dashboard
- Responsive per PRD_UX section 8; accessibility per section 9

### Out of Scope

- Secret rotation dialog if Session 04 defers rotation UI
- Throughput charting - deferred requirement
- Restyling anything outside this console

---

## Prerequisites

- [ ] Sessions 03 and 04 complete - state API available
- [ ] PRD_UX.md reviewed

---

## Deliverables

1. Hook Control console at `/admin/mud/hooks`
2. Component set from PRD_UX.md section 11
3. Amber `--warning` token in the shared palette
4. Vitest coverage for state rendering and toggle behavior

---

## Success Criteria

- [ ] All 13 toggleable hooks plus the always-on terminal row render
- [ ] Mismatch is visually distinct from off, unknown, and unavailable
- [ ] No state is conveyed by colour alone
- [ ] Toggles show PENDING until both ends confirm - never optimistic
- [ ] Enabling into a known-off MUD state prompts; disabling does not
- [ ] Non-loopback over `ws:` shows the blocking error
- [ ] Keyboard navigable; focus returns correctly on drawer close
- [ ] No new dependencies added

# Session 07: Contract tests and doc reconciliation

**Session ID**: `phase00-session07-contract-tests-and-docs`
**Packages**: backend, frontend
**Status**: Not Started
**Estimated Tasks**: ~18
**Estimated Duration**: 2-3 hours

---

## Objective

Lock every decision from this phase in regression tests, and leave both
repositories' documentation consistent with what was built.

---

## Scope

### In Scope (MVP)

- Extend `integrationSecurityContract.test.ts` with the new contracts:
  registry as the sole id source, fail-closed resolution, no optimistic
  toggles, non-loopback guard, previous-secret support
- Per-hook delivery tests: delivers when enabled, does not when disabled at
  either end
- Reconnect state-recovery tests
- Verify all pre-existing contract tests still pass unmodified
- Reconcile MUD_HANDOFF.md: every change DONE or explicitly deferred
- Update CONSIDERATIONS.md and SECURITY-COMPLIANCE.md with phase findings
- Confirm MUD docs updated in Session 02 match what shipped

### Out of Scope

- New features
- GDPR remediation - separate track

---

## Prerequisites

- [ ] Sessions 01-06 complete

---

## Deliverables

1. Extended contract test suite covering every phase decision
2. Per-hook enable/disable delivery tests
3. MUD_HANDOFF.md fully reconciled
4. CONSIDERATIONS.md and SECURITY-COMPLIANCE.md updated

---

## Success Criteria

- [ ] Every phase success criterion has a test that fails if undone
- [ ] All 13 hooks have enable/disable delivery coverage
- [ ] Pre-existing contract tests pass unmodified, or changes are justified
- [ ] MUD_HANDOFF.md has no TODO without an explicit deferral reason
- [ ] Both repositories' docs describe the same contract
- [ ] Full backend and frontend test suites pass

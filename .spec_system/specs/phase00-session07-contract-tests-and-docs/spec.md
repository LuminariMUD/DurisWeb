# Session Specification

**Session ID**: `phase00-session07-contract-tests-and-docs`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Complete
**Created**: 2026-09-01
**Base Commit**: a5be94b0bf89564abd495bc8bea930431f724c85
**MUD Base Commit**: 246d451099d664de8ddde51acd6f3b3ed86cb2a1
**Work Window**: One coherent contract-and-documentation closeout covering all phase decisions, deterministic full suites, and an exact pushed-but-unmerged cross-repository handoff.
**Package**: null
**Package Stack**: Express/TypeScript (`backend`), Vue 3/TypeScript (`frontend`), C/C++20 build (`/home/aiwithapex/projects/duris`)

---

## 1. Session Overview

This final Phase 00 session converts the behavior shipped in Sessions 01-06
into durable regression contracts and reconciles both repositories' operator
documentation. It adds no product feature. The main artifact is evidence: every
registered delivery gate, fail-closed state transition, reconnect path,
transport decision, and MUD command contract must fail a test if it regresses.

The phase has 13 toggleable hooks, but only eight have an in-process MUD gate.
The remaining five are website-owned reads or host controls and correctly
report `MUD: N/A`; the terminal is always-on and permission-gated. Coverage is
therefore exact rather than artificial: all 13 website gates are exercised in
both states, all eight MUD gates are exercised in both states, the five
website-only hooks are asserted to have no MUD property, and terminal recovery
semantics are separately locked.

Three backend suites currently depend on ambient database rows and one frontend
suite has a stale composable mock. Because the session requires clean full
suites, those tests are made deterministic without changing application
behavior. Documentation records the MUD branch as pushed and unmerged, per the
maintainer's instruction; merge and deployed reverse-proxy acceptance remain
explicit external follow-ups.

---

## 2. Objectives

1. Lock every Phase 00 functional and security decision in deterministic tests.
2. Prove enabled/disabled delivery behavior for every applicable side of every
   registered hook, including disconnect and reconnect recovery.
3. Restore genuinely clean backend and frontend full-suite results by removing
   ambient-data and stale-mock assumptions from tests only.
4. Make the PRD, handoff, security record, considerations, and MUD operator docs
   describe the same exact contract and delivery status.
5. Finish with both branches pushed and unmerged, with no force-push or PR.

---

## 3. Prerequisites

- [x] Sessions 01-06 are complete and validated.
- [x] durisweb base `a5be94b` is pushed on `chore/init-spec-system`.
- [x] DurisMUD base `246d4510` is pushed on
  `feat/durisweb-hook-toggles` and remains unmerged.
- [x] No new dependency, schema change, or production credential is required.

---

## 4. Scope

### In Scope

- Extend the integration security contract to pin the registry as the sole id
  source, fail-closed resolution, authoritative/non-optimistic toggle UI,
  non-loopback plaintext refusal, explicit TLS verification, and one previous
  secret retry.
- Add table-driven website-gate coverage for all 13 toggleable ids, applicable
  MUD-gate coverage for all eight property-backed ids, explicit N/A coverage for
  five website-only ids, and immutable terminal coverage.
- Lock delivery-boundary ownership so each hook owner calls its registered gate
  before applying, publishing, parsing, or controlling the target resource.
- Expand state-frame tests across all eight MUD ids, including full-frame apply,
  disconnect-to-unknown, reconnect recovery, omissions, and malformed frames.
- Expand the MUD integration contract for the exact eight property keys,
  source-side suppression, authenticated set/state commands, atomic persistence,
  acknowledgement, state push, and matching docs.
- Replace live database/Redis assumptions in `auctionService`, `guildService`,
  and `userManagementService` tests with deterministic mocks/fixtures that test
  service contracts rather than developer-machine data.
- Repair the stale `AdminDashboardOverview` composable/WebSocket mocks so the
  existing component suite exercises the current component contract.
- Reconcile `MUD_HANDOFF.md`, `CONSIDERATIONS.md`,
  `SECURITY-COMPLIANCE.md`, the phase PRD, and relevant MUD API/configuration,
  runbook, and incident-response documentation.
- Run focused and full test suites, type-checks, lint, frontend production
  build, strict MUD build, contract script, text hygiene, and doc parity checks.

### Out Of Scope

- New hook behavior, UI features, transports, dependencies, or schema changes.
- Merging either branch, opening a PR, force-pushing, or deploying services.
- Provisioning or proving a live reverse-proxy endpoint. Local contracts prove
  that remote plaintext is refused and WSS/TLS validation is required; deployed
  endpoint acceptance is an explicitly deferred operator task.
- Remediating `SEC-RT-1` or `SEC-TZ-1`. Both remain documented High findings;
  refresh-token hashing requires an explicit session-invalidation decision.
- GDPR remediation or unrelated production-data cleanup.

---

## 5. Technical Approach

### Coverage Matrix

Use the registry itself to generate the contract matrix so newly added or
removed ids cannot silently escape coverage. The website gate must call its
delivery callback for `true` and suppress it for `false` for every toggleable
definition. For each property-backed definition, resolution is active only when
both the cached website setting and observed MUD state are enabled; disabled,
unknown, or missing MUD state stays closed. Definitions with
`mudPropertyKey: null` must remain `not_gated`, never fabricate a MUD state.

Source contracts complement the generic gate matrix by pinning the enforcement
site owned by every registry row. On the MUD side, the Python integration
contract derives an exact expected set and checks the property registry,
serializer, command whitelist, and emit/worker guards. This deliberately avoids
requiring one test to boot a live MUD process or production database.

### Deterministic Suite Repair

Mock the database boundary at module load using existing Jest ESM conventions.
Fixtures model representative rows and state transitions; assertions cover SQL
parameters, mapping, filtering, limits, and money deduction without selecting or
mutating real rows. Mock Redis/bridge collaborators where imported. Update only
test code unless a deterministic test exposes a genuine application defect.

Repair the frontend suite's analytics and WebSocket mocks to expose every hook
the current component consumes. Preserve its existing behavioral assertions and
add no production workaround.

### Documentation Reconciliation

`MUD_HANDOFF.md` uses `PUSHED (UNMERGED)` for shipped branch work because the
maintainer explicitly requested no merge. Add the Session 06 authenticated
`durisweb_hook_set` change, correct the property prototype path and exact eight
ids, and attach commit/branch evidence. Each remaining operational step carries
an owner and deferral reason rather than a bare TODO.

MUD API/runbook/incident docs describe authentication-first set handling,
automatic durable persistence, acknowledgements, safe disable/enable ordering,
and mismatch recovery. Security and considerations documents retain unresolved
findings and add final validation evidence without claiming a deployed WSS
endpoint.

---

## 6. Deliverables

### Files To Create

| File | Purpose |
|------|---------|
| `backend/src/hooks/__tests__/hookDeliveryContract.test.ts` | Registry-generated all-hook gate and ownership matrix |
| `.spec_system/specs/phase00-session07-contract-tests-and-docs/implementation-notes.md` | Decisions, evidence, and exact verification ledger |
| `.spec_system/specs/phase00-session07-contract-tests-and-docs/validation.md` | Final session validation |

### Files To Modify

| File | Changes |
|------|---------|
| `backend/src/services/__tests__/integrationSecurityContract.test.ts` | Phase-wide security and authoritative-state contracts |
| `backend/src/hooks/__tests__/mudHookStateClient.test.ts` | Exhaustive eight-id disconnect/reconnect matrix |
| `backend/src/services/__tests__/auctionService.test.ts` | Deterministic pool/notification boundary tests |
| `backend/src/services/__tests__/guildService.test.ts` | Deterministic pool fixtures and behavior assertions |
| `backend/src/services/__tests__/userManagementService.test.ts` | Deterministic query/bridge/gate contract tests |
| `frontend/src/components/admin/__tests__/AdminDashboardOverview.spec.ts` | Current composable and WebSocket mock contract |
| `/home/aiwithapex/projects/duris/tests/async/test_durisweb_integration_security.py` | Exact properties, gates, commands, persistence, and docs |
| `/home/aiwithapex/projects/duris/docs/reference/api/durisweb.md` | Hook state/set wire contract |
| `/home/aiwithapex/projects/duris/docs/operations/CONFIGURATION.md` | Exact property and transport configuration |
| `/home/aiwithapex/projects/duris/docs/operations/RUNBOOK.md` | Website reconcile and partial-failure recovery |
| `/home/aiwithapex/projects/duris/docs/operations/incident-response.md` | Hook mismatch/transport response |
| `.spec_system/PRD/MUD_HANDOFF.md` | Pushed-unmerged status and exact Session 06 change |
| `.spec_system/CONSIDERATIONS.md` | Final architectural/testing findings |
| `.spec_system/SECURITY-COMPLIANCE.md` | Final security posture and open findings |
| `.spec_system/PRD/PRD.md` | Evidence-based phase criterion reconciliation |

---

## 7. Success Criteria

### Contract Coverage

- [x] All 13 toggleable hooks deliver when their website gate is enabled and
  suppress delivery when it is disabled.
- [x] All eight property-backed hooks resolve active only when both ends are
  enabled and close for MUD disabled, unknown, omitted, or disconnected state.
- [x] Five website-only hooks are explicitly `mudPropertyKey: null` and MUD N/A;
  terminal stays always-on and rejects mutation.
- [x] Every registry owner has an enforcement-site contract at the appropriate
  delivery/application boundary.
- [x] Reconnect restores all eight reported states without retaining stale
  pre-disconnect values.
- [x] Registry-only ids, fail-closed state, non-optimistic controls, remote
  plaintext refusal, explicit TLS verification, and one previous-secret retry
  are regression-tested.
- [x] MUD contracts pin exact properties, auth-first set/state handling, strict
  input validation, atomic persistence, state push, ack, and source suppression.

### Suite And Build Quality

- [x] Full backend Jest suite passes with no ambient database/Redis dependency.
- [x] Full frontend Vitest suite passes with current component mocks.
- [x] Backend and frontend type-check, changed-file lint, frontend production
  build, strict MUD build, and MUD Python integration contract pass.
- [x] Pre-existing contract assertions remain semantically intact; any source
  edit is justified in implementation notes.
- [x] Changed text files are ASCII, LF-only, and free of trailing whitespace.

### Documentation And Delivery

- [x] `MUD_HANDOFF.md` contains no unqualified TODO and identifies both pushed
  MUD commits as unmerged with merge/deployment explicitly deferred.
- [x] Both repositories document the same eight MUD ids, 13 website ids,
  always-on terminal, set/state frames, persistence, and safe ordering.
- [x] PRD, considerations, and security compliance link each phase criterion to
  truthful evidence and retain `SEC-RT-1`/`SEC-TZ-1` as open findings.

**Post-validation delivery requirement**: push both branches and leave them
unmerged. This is intentionally not a validation criterion because delivery
occurs only after `validate` and `updateprd` complete.

---

## 8. Working Assumptions And Risks

- "Both ends" means every end that actually owns a gate: 13 website and eight
  MUD. Adding fake MUD properties to website-only reads would violate the
  registry contract rather than satisfy coverage.
- The user's no-merge instruction controls delivery status. A commit can be
  complete and pushed while repository landing remains deferred.
- A local test can prove secure URL policy and TLS verification but cannot prove
  an operator has provisioned the production reverse proxy. Documentation must
  distinguish code acceptance from deployment acceptance.
- Source-shape contracts are intentionally narrow and paired with behavioral
  tests; broad snapshots would create noise without improving assurance.
- Test determinism repairs must not hide production failures. Fixtures exercise
  actual service query/mapping branches and do not skip assertions.

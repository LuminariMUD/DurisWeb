# Task Checklist

**Session ID**: `phase00-session07-contract-tests-and-docs`
**Total Tasks**: 21
**Work Window**: Phase-wide contract coverage, deterministic full suites, and exact cross-repository documentation.
**Created**: 2026-09-01

---

Legend: `[x]` completed; `[ ]` pending; `[P]` parallelizable; `[S0007]` session ref; `TNNN` task ID.

---

## Setup And Coverage Lock (3 tasks)

- [x] T001 [S0007] Verify Sessions 01-06, clean pushed durisweb/MUD bases, branch topology, and no-merge constraint (`spec.md`, `.spec_system/state.json`)
- [x] T002 [S0007] Record the exact registry matrix: 13 website gates, eight MUD gates, five website-only N/A hooks, and always-on terminal (`backend/src/hooks/registry.ts`)
- [x] T003 [S0007] Run focused/full baselines and map every Phase 00 PRD criterion to a proposed automated or explicit operational acceptance (`implementation-notes.md`)

## Phase Contract Tests (7 tasks)

- [x] T004 [S0007] Add registry-generated enabled/disabled website delivery coverage for all 13 toggleable hooks and immutable terminal behavior (`backend/src/hooks/__tests__/hookDeliveryContract.test.ts`)
- [x] T005 [S0007] Add all-eight MUD state resolution coverage and all-five website-only N/A assertions (`backend/src/hooks/__tests__/hookDeliveryContract.test.ts`)
- [x] T006 [S0007] Pin each registry owner to its actual pre-delivery/application enforcement boundary (`backend/src/hooks/__tests__/hookDeliveryContract.test.ts`)
- [x] T007 [S0007] Expand full-frame, omission, disconnect, and reconnect recovery tests across all eight MUD-gated ids (`backend/src/hooks/__tests__/mudHookStateClient.test.ts`)
- [x] T008 [S0007] Extend the integration security contract for sole-source ids, fail-closed resolution, authoritative toggles, remote plaintext refusal, explicit TLS verification, and previous-secret retry (`backend/src/services/__tests__/integrationSecurityContract.test.ts`)
- [x] T009 [S0007] Extend the MUD integration contract for exact ids/properties, source suppression, auth-first state/set commands, strict inputs, atomic persistence, ack/state push, and doc parity (`/home/aiwithapex/projects/duris/tests/async/test_durisweb_integration_security.py`)
- [x] T010 [S0007] Run the focused phase contract matrix and repair only evidence-backed contract gaps (`backend/src/hooks/__tests__/`, `backend/src/services/__tests__/`, MUD integration test)

## Deterministic Full-Suite Repair (4 tasks)

- [x] T011 [S0007] Replace ambient character/coin and Redis assumptions with deterministic auction-service boundary tests (`backend/src/services/__tests__/auctionService.test.ts`)
- [x] T012 [S0007] Replace ambient guild rows and Redis lifecycle assumptions with deterministic guild-service fixtures (`backend/src/services/__tests__/guildService.test.ts`)
- [x] T013 [S0007] Replace ambient player/IP lookup assumptions with deterministic user-management query, mapping, bridge, and gate tests (`backend/src/services/__tests__/userManagementService.test.ts`)
- [x] T014 [S0007] Repair the stale admin overview analytics/WebSocket mocks and preserve all current component assertions (`frontend/src/components/admin/__tests__/AdminDashboardOverview.spec.ts`)

## Documentation Reconciliation (4 tasks)

- [x] T015 [S0007] Document exact hook state/set frames, automatic persistence, safe ordering, mismatch recovery, and transport incidents in the MUD API/config/runbook/incident guides (`/home/aiwithapex/projects/duris/docs/`)
- [x] T016 [S0007] Correct exact ids/paths and add Session 06 set-command details in `MUD_HANDOFF.md`; mark both commits `PUSHED (UNMERGED)` and give every deferral an owner/reason (`.spec_system/PRD/MUD_HANDOFF.md`)
- [x] T017 [S0007] Update cumulative architecture/test findings and security posture without closing `SEC-RT-1`, `SEC-TZ-1`, or claiming deployed WSS (`.spec_system/CONSIDERATIONS.md`, `.spec_system/SECURITY-COMPLIANCE.md`)
- [x] T018 [S0007] Reconcile Phase 00 PRD criteria to exact automated evidence or explicit operator deployment acceptance (`.spec_system/PRD/PRD.md`)

## Verification And Delivery (3 tasks)

- [x] T019 [S0007] Run full backend/frontend suites, both type-checks, changed-file lint, frontend production build, strict MUD build, and MUD Python contract (`implementation-notes.md`)
- [x] T020 [S0007] Verify cross-repository id/frame/doc parity plus ASCII, LF, trailing-whitespace, and clean-diff hygiene (`implementation-notes.md`)
- [x] T021 [S0007] Complete implementation artifacts and a clean pre-review diff/status checkpoint, then hand the full base-to-HEAD change set to `creview`; final state/commit/push follows validation and `updateprd` (`IMPLEMENTATION_SUMMARY.md`)

---

## Completion Checklist

- [x] All tasks marked `[x]`
- [x] All automated checks pass without baseline exceptions
- [x] All phase criteria have truthful evidence or explicit deployment deferral
- [x] Both repositories' docs describe one exact contract
- [x] Pre-review diffs are clean and both branches remain unmerged
- [x] Ready for `creview`, then `validate` and `updateprd`

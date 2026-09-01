# Task Checklist

**Session ID**: `phase00-session06-hook-control-console`
**Total Tasks**: 26
**Work Window**: One operator-control window across the Vue console, truthful hook/transport API, and authenticated MUD set/ack path.
**Created**: 2026-09-01

---

Legend: `[x]` completed; `[ ]` pending; `[P]` parallelizable; `[S0006]` session ref; `TNNN` task ID.

---

## Setup And Design Lock (3 tasks)

- [x] T001 [S0006] Verify Sessions 03-05, record clean durisweb/MUD branch bases, and confirm the session is cross-cutting (`.spec_system/specs/phase00-session06-hook-control-console/spec.md`)
- [x] T002 [S0006] Run relevant backend hook/security, frontend unit/type, and MUD integration-contract baselines before implementation (`backend/package.json`, `frontend/package.json`, `/home/aiwithapex/projects/duris/tests/async/test_durisweb_integration_security.py`)
- [x] T003 [S0006] Lock the desktop/mobile concept inventory against PRD_UX, reject generated content/color drift, inspect installed shadcn-vue component APIs, and record the fidelity checklist (`assets/`, `frontend/components.json`)

---

## Backend And MUD Foundation (8 tasks)

- [x] T004 [S0006] Extend website toggle loading/status rows with actor/time provenance while preserving the synchronous boolean event cache (`backend/src/hooks/hookSettingsService.ts`)
- [x] T005 [S0006] Add in-memory MUD report receipt metadata and per-hook last-activity telemetry, then instrument accepted delivery/application boundaries without recording status reads (`backend/src/hooks/mudHookStateClient.ts`, `backend/src/hooks/hookActivity.ts`, hook owner services)
- [x] T006 [S0006] Extract a safe bridge URL/status parser and expose sanitized scheme, host, loopback, blocked reason, connection/auth state, TLS peer certificate expiry, and optional secret age (`backend/src/services/mudTransportPolicy.ts`, `backend/src/services/mudTransportStatus.ts`, `backend/.env.example`)
- [x] T007 [S0006] Add an exact registered-hook setter on the MUD game thread that updates memory, persists atomically, and broadcasts the existing hook-state frame (`/home/aiwithapex/projects/duris/src/world/properties.c`, `/home/aiwithapex/projects/duris/src/core/prototypes.h`)
- [x] T008 [S0006] Add an authentication-first `durisweb_hook_set` WebSocket handler with strict id/boolean/request validation and success/error acknowledgement (`/home/aiwithapex/projects/duris/src/net/ws_handlers.c`, `/home/aiwithapex/projects/duris/src/net/ws_handlers.h`)
- [x] T009 [S0006] Resolve MUD hook-set acknowledgements and observed pushed state in the existing bridge client without adding another transport (`backend/src/services/mudAuctionClient.ts`, `backend/src/hooks/mudHookStateClient.ts`)
- [x] T010 [S0006] Implement fail-closed reconcile ordering for MUD-gated and website-only hooks, including partial disable results, enable rollback safety, terminal rejection, and bounded observation wait (`backend/src/services/hookReconcileService.ts`)
- [x] T011 [S0006] Serialize provenance/activity/resource/transport metadata, add the explicit reconcile route, and align hook API authorization with `manage_mud_properties` (`backend/src/routes/hooks.ts`)

---

## Frontend Implementation (10 tasks)

- [x] T012 [S0006] Add semantic `--warning`/foreground tokens to light and dark palettes and register them in Tailwind v4 (`frontend/src/assets/main.css`)
- [x] T013 [S0006] Create hook API types/client and a composable for authoritative polling, pending/error maps, summary counts, filtering, and query-owned selection (`frontend/src/types/hooks.ts`, `frontend/src/services/hooksApi.ts`, `frontend/src/composables/useHookControl.ts`)
- [x] T014 [S0006] Build `DualStateLamp` with labelled WEB/MUD lamps and solid, hollow, dotted, unavailable, N/A, always-on, and broken hazard-hatch effective connectors (`frontend/src/components/admin/hooks/DualStateLamp.vue`)
- [x] T015 [S0006] Build `HookToggle` with ON/OFF/PENDING states, server-bound value, accessible state label, enable-into-known-off confirmation, and no confirmation on disable (`frontend/src/components/admin/hooks/HookToggle.vue`)
- [x] T016 [S0006] Build keyboard-operable `HookRow` and `HookGroup` components with exact channel grouping, inline row errors, last activity, desktop list, tablet two-column cards, and mobile stacked controls (`frontend/src/components/admin/hooks/HookRow.vue`, `frontend/src/components/admin/hooks/HookGroup.vue`)
- [x] T017 [S0006] Build `TransportPanel` with quiet nominal metadata, honest unknown/not-applicable values, and a persistent non-loopback plaintext `role=alert` (`frontend/src/components/admin/hooks/TransportPanel.vue`)
- [x] T018 [S0006] Build `HookDetailSheet` with both-end provenance, resource health, last activity, set-both-ends actions, deep-link ownership, and focus return (`frontend/src/components/admin/hooks/HookDetailSheet.vue`)
- [x] T019 [S0006] Compose `HookControlView` with summary strip, timestamp, filter/mobile filter sheet, skeleton rows, polling-without-spinner, live announcements, channel groups, and no-result/error states (`frontend/src/views/admin/mud/HookControlView.vue`)
- [x] T020 [S0006] Add the permission-gated route and MUD Settings sidebar item, preserving current admin shell behavior (`frontend/src/router/index.ts`, `frontend/src/components/layout/AdminMenu.vue`)
- [x] T021 [S0006] Add `HookHealthCard` to the existing MUD dashboard with active/off/mismatch/unknown counts and console link (`frontend/src/components/admin/hooks/HookHealthCard.vue`, `frontend/src/views/admin/mud/MudDashboardView.vue`)

---

## Testing And Verification (5 tasks)

- [x] T022 [S0006] [P] Test backend provenance, activity, transport sanitization, permissions, terminal rejection, reconcile ordering, observation timeout, and partial failures (`backend/src/hooks/__tests__/`, `backend/src/services/__tests__/`, `backend/src/routes/__tests__/`)
- [x] T023 [S0006] [P] Extend MUD integration contracts for auth-first set handling, exact hook ids, persistence/state push/ack, then run the strict MUD build (`/home/aiwithapex/projects/duris/tests/async/test_durisweb_integration_security.py`, `/home/aiwithapex/projects/duris/src/Makefile`)
- [x] T024 [S0006] [P] Test every lamp shape/label, terminal immutability, ON/OFF/PENDING toggle behavior, confirmation asymmetry, transport blocking, sheet focus/deep links, responsive classes, and dashboard summary (`frontend/src/components/admin/hooks/__tests__/`, `frontend/src/views/admin/mud/__tests__/`)
- [x] T025 [S0006] Run the real console in a browser at desktop/tablet/mobile sizes; verify keyboard/filter/sheet/reconcile flows, capture screenshots, compare both concepts with `view_image`, and repair every material fidelity mismatch (`.spec_system/specs/phase00-session06-hook-control-console/validation.md`)
- [x] T026 [S0006] Run session suites, backend hook/security contracts, full frontend tests, type-check, lint, production build, relevant backend full-suite baseline comparison, and ASCII/LF checks; record exact results (`backend/package.json`, `frontend/package.json`, `implementation-notes.md`)

---

## Completion Checklist

- [x] All tasks marked `[x]`
- [x] All tests and checks passing, except independently proven pre-existing failures
- [x] All files ASCII-encoded with LF line endings
- [x] implementation-notes.md updated
- [x] Desktop and mobile fidelity ledger complete with no material mismatch
- [x] MUD and durisweb branches pushed without merge
- [x] Ready for `creview` (next step in the implement -> creview -> validate sequence)

---

## Next Steps

Run the `implement` workflow step, then `creview`, `validate`, and `updateprd`.


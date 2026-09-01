# Code Review and Repair Report

**Session ID**: `phase00-session06-hook-control-console`
**Package**: cross-cutting (`backend`, `frontend`, DurisMUD)
**Reviewed**: 2026-09-01
**Base Commit**: `5966bb465366f9389c8824c9745cac75283e7eff`
**MUD Base Commit**: `28aa110005f226a40e7cdda9a4cd64349c1540c9`
**Result**: RESOLVED

## Review Surface

The review covered every tracked hunk and untracked artifact since the
recorded durisweb base (50 files before closeout artifacts), plus all five MUD
files changed since its base. The surface included the status/reconcile API,
transport policy and runtime status, delivery gates/activity instrumentation,
Vue console/composable/components/tests, navigation/dashboard integration,
the C property setter and authenticated handler, and the session design assets.

Inventory and whitespace checks used `git diff`, `git status`,
`git ls-files --others --exclude-standard`, and `git diff --check` in both
repositories. Generated browser captures remained outside both repositories.

## Findings by Severity

### Critical

No findings.

### High

No Session 06 findings. Existing `SEC-RT-1` remains a previously recorded
project-level High finding and was not expanded by this session.

### Medium

- `frontend/src/components/admin/hooks/HookRow.vue` - the original row was
  button-like while containing a switch. Keyboard activation could open the
  sheet and carry an Enter event into its first reconcile action. Fixed by
  making details a real explicit button, resolving row pointer clicks to that
  trigger, and restoring focus to it. Browser keyboard/focus coverage passes.
- `frontend/src/components/ui/sidebar/Sidebar.vue` - the existing absolute
  sidebar rail lacked a positioned desktop ancestor and caused horizontal
  overflow on the new wide console. Fixed by containing it with `relative`;
  browser checks at all three viewports show no overflow.

### Low

- `/home/aiwithapex/projects/duris/src/net/ws_handlers.c` - the strict request
  id check bounded length but accepted an empty string. Fixed by rejecting an
  empty value and extending the MUD source contract.
- `backend/src/routes/hooks.ts` - permission, input, actor, terminal, and safe
  response behavior were inspected but not directly exercised. Fixed with
  `hooksControlValidation.test.ts` (8/8 passing).
- `backend/src/services/__tests__/integrationSecurityContract.test.ts` - a
  source contract still expected a URL-policy literal in the bridge client
  after the pure policy was extracted. Fixed by asserting the import boundary
  and the equivalent checks in `mudTransportPolicy.ts`.

## Behavioral and Security Review

- Disable ordering closes the website gate before any MUD command. Enable
  ordering holds the website off until the authenticated acknowledgement and
  pushed MUD state agree. Timeout/rejection never opens delivery.
- The MUD command is authentication-first, accepts only exact registered MUD
  hook ids, requires a non-empty bounded request id and boolean value, persists
  through replacement/rename, pushes the canonical state frame, then acks.
- The route requires `manage_mud_properties`, derives actor from the
  authenticated request, rejects terminal and malformed values, and never
  serializes URL paths, credentials, HMACs, or secrets.
- Transport policy rejects non-loopback plaintext, rejects credential/query/
  fragment components generically, and explicitly enables certificate
  validation for WSS.
- Activity telemetry is process-local and records only registered hooks at
  accepted delivery/application boundaries. Status reads cannot create
  activity.
- No dependency, migration, persistent UI telemetry, or new data transfer was
  added.

## Evidence Ledger

| Check | Result | Evidence |
|-------|--------|----------|
| Focused backend | PASS | Final boundary/reconcile/transport/activity matrix: 47/47 |
| Backend full suite | BASELINE ONLY | 63/66 suites, 485/518 tests; same 3 ambient-data suites and 33 failures |
| Frontend Session 06 | PASS | 14/14 tests |
| Frontend full suite | BASELINE ONLY | 26/27 files, 86/93 tests; same 7 stale `useWhoList` mock failures |
| Type/lint/build | PASS | Both type-checks, changed-file ESLint, production Vue build |
| MUD | PASS | Strict warnings-as-errors build and integration-security contract |
| Browser | PASS | Desktop/tablet/mobile, no console/page errors or overflow; filter, sheet, deep link, focus, reconcile, mobile target verified |
| Diff/encoding | PASS | Both repository diffs clean; text artifacts ASCII with LF |

## Summary

All findings were repaired and re-tested. There is no unresolved Session 06
code-review issue. The only suite failures are independently established
pre-existing fixture/mock baselines.

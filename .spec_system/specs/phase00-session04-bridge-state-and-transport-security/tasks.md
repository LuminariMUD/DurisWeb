# Task Checklist

**Session ID**: `phase00-session04-bridge-state-and-transport-security`
**Total Tasks**: 20
**Estimated Duration**: 3-4 hours
**Created**: 2026-09-01

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable
- `[S0004]` = Session reference (phase 00, session 04)

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 3 | 3 | 0 |
| Foundation | 5 | 5 | 0 |
| Implementation | 7 | 7 | 0 |
| Testing | 5 | 5 | 0 |
| **Total** | **20** | **20** | **0** |

---

## Setup (3 tasks)

- [x] T001 [S0004] Re-read the MUD's authoritative contract in `docs/reference/api/durisweb.md` and `src/net/ws_auth.h` before changing the client
- [x] T002 [S0004] Record the exact `hook_state` frame shape emitted by Session 02 so parsing matches the producer
- [x] T003 [S0004] Determine whether `web_sessions.refresh_token` is stored hashed and record the finding

---

## Foundation (5 tasks)

- [x] T004 [S0004] [P] Define the MUD state map and frame types, defaulting every MUD-gated hook to UNKNOWN (`backend/src/hooks/mudHookStateClient.ts`)
- [x] T005 [S0004] Implement schema-validated frame parsing that rejects an unknown `schema_version` or malformed payload wholesale rather than applying it partially (`backend/src/hooks/mudHookStateClient.ts`)
- [x] T006 [S0004] Apply frames so hooks omitted from a frame revert to UNKNOWN rather than retaining a stale value (`backend/src/hooks/mudHookStateClient.ts`)
- [x] T007 [S0004] Implement the `MudHookStateProvider`, returning `not_gated` for hooks with no MUD side (`backend/src/hooks/mudHookStateClient.ts`)
- [x] T008 [S0004] Implement disconnect handling that clears all state to UNKNOWN on scope exit (`backend/src/hooks/mudHookStateClient.ts`)

---

## Implementation (7 tasks)

- [x] T009 [S0004] Add the loopback rule to URL resolution: `ws:` permitted only for loopback hosts, anything else must be `wss:` (`backend/src/services/mudAuctionClient.ts`)
- [x] T010 [S0004] Enable explicit certificate validation for `wss:` connections (`backend/src/services/mudAuctionClient.ts`)
- [x] T011 [S0004] Add `DURISWEB_SECRET_PREVIOUS` support with exactly one retry and no secret in any log line (`backend/src/services/mudAuctionClient.ts`)
- [x] T012 [S0004] Request `durisweb_hook_state` immediately after authentication succeeds (`backend/src/services/mudAuctionClient.ts`)
- [x] T013 [S0004] Dispatch `hook_state` frames to the state client, inside the existing post-authentication guard (`backend/src/services/mudAuctionClient.ts`)
- [x] T014 [S0004] Clear MUD state on socket close so a dropped bridge reports UNKNOWN rather than stale values (`backend/src/services/mudAuctionClient.ts`)
- [x] T015 [S0004] Register the provider at startup and export the new surface (`backend/src/index.ts`, `backend/src/hooks/index.ts`)

---

## Testing (5 tasks)

- [x] T016 [S0004] [P] Test frame handling: valid, unknown version, malformed, omitted hooks, unregistered ids (`backend/src/hooks/__tests__/mudHookStateClient.test.ts`)
- [x] T017 [S0004] [P] Test lifecycle: disconnect clears to UNKNOWN, reconnect restores, ungated hooks unaffected (`backend/src/hooks/__tests__/mudHookStateClient.test.ts`)
- [x] T018 [S0004] [P] Test transport policy and rotation: loopback/non-loopback under both schemes, IPv6 forms, previous-secret retry (`backend/src/services/__tests__/mudTransportSecurity.test.ts`)
- [x] T019 [S0004] Verify no secret is logged on either authentication path
- [x] T020 [S0004] Run the full backend suite and type-check; confirm pre-existing contract tests still pass; validate ASCII and LF

---

## Completion Checklist

- [x] All tasks marked `[x]`
- [x] Session tests passing (52/52); contract suites still 19/19
- [x] All files ASCII-encoded
- [x] implementation-notes.md updated
- [x] Ready for `/validate`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

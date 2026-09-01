# Session Specification

**Session ID**: `phase00-session04-bridge-state-and-transport-security`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Not Started
**Created**: 2026-09-01
**Package**: backend
**Package Stack**: TypeScript

---

## 1. Session Overview

Session 02 taught the MUD to report its hook state; Session 03 built a
resolution engine waiting for that report behind an injectable provider that
currently answers UNKNOWN for everything. This session connects the two, and
closes the transport gaps that let the pair run on separate hosts.

Three strands: consume `durisweb_hook_state` over the existing authenticated
bridge and feed it into resolution; make the client refuse an unsafe transport
and validate certificates when one is used; and close the previous-secret gap so
rotation matches what the MUD already supports and the upstream docs already
prescribe.

Reconnect handling matters more here than it looks. The bridge drops and
reconnects routinely, and a hook whose MUD state is stale after a reconnect is
exactly the silent disagreement the phase exists to eliminate.

---

## 2. Objectives

1. Request and consume `durisweb_hook_state`, feeding real MUD state into
   resolution in place of the UNKNOWN default.
2. Report UNKNOWN whenever the bridge is down, and recover correct state on
   reconnect without a restart.
3. Refuse a non-loopback bridge host unless the transport is `wss:`, and
   validate certificates when it is.
4. Accept `DURISWEB_SECRET_PREVIOUS` so rotation completes without dropped
   events.
5. Determine and record whether `web_sessions.refresh_token` is stored hashed.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session02-mud-side-toggles-and-state` - the `durisweb_hook_state`
      command and its push
- [x] `phase00-session03-website-toggle-store` - the resolution engine and its
      `MudHookStateProvider` seam

### Required Tools/Knowledge

- The existing `mudAuctionClient.ts` connection lifecycle
- Node `crypto` HMAC and the MUD's documented challenge contract

### Environment Requirements

- No live MUD required: the contract is exercised against the documented frame
  format and the MUD source, with unit tests rather than a running server.

---

## 4. Scope

### In Scope (MVP)

- Request `durisweb_hook_state` after authentication succeeds
- Handle unsolicited `hook_state` pushes
- Feed MUD state into the resolution engine
- Reset to UNKNOWN on disconnect; re-request on reconnect
- Refuse non-loopback hosts over plaintext `ws:`
- Validate certificates for `wss:`
- Support `DURISWEB_SECRET_PREVIOUS` in signature generation
- Record a finding on `web_sessions.refresh_token` storage

### Out of Scope (Deferred)

- Reverse-proxy configuration on the MUD host - *Reason: an ops task outside
  this repository (PRD Resolved Decision 8)*
- Flatfile UNAVAILABLE detection - *Reason: Session 05*
- The operator console - *Reason: Session 06*
- Rotation UI - *Reason: rotation is an operational procedure, not a screen*

---

## 5. Technical Approach

### Architecture

A new `mudHookStateClient.ts` owns MUD-reported state as a module-level map plus
a `MudHookStateProvider` implementation registered with the settings service.
Keeping it separate from `mudAuctionClient.ts` avoids growing an already large
file and lets the state logic be tested without a socket.

`mudAuctionClient.ts` gains three small integration points: request state after
auth, dispatch `hook_state` frames to the new module, and clear state on close.

### Transport safety

`resolveMudWebSocketUrl` already rejects credentials, queries, and fragments and
requires `ws:`/`wss:`. This session adds the loopback rule: a `ws:` URL is
accepted only when the host is a loopback address. Anything else must be `wss:`.
For `wss:`, certificate validation is explicitly enabled rather than left to
defaults, so a future `rejectUnauthorized: false` cannot creep in unnoticed.

### Secret rotation

The MUD accepts both `DURISWEB_SECRET` and `DURISWEB_SECRET_PREVIOUS`
(`ws_auth.h:82-83`). The website signs with one secret, so during rotation it
must be able to fall back. The client signs with the current secret; if
authentication fails and a previous secret is configured, it retries once with
that before giving up. This matches the documented procedure: deploy the new
key, keep the old as PREVIOUS, switch backends, remove PREVIOUS.

### Design Patterns

- **Absence is not knowledge**: any state we have not been told is UNKNOWN,
  which resolution treats as inactive but distinguishable from off.
- **Fail closed on transport**: an unsafe URL throws at connect time rather than
  connecting insecurely.

### Technology Stack

- TypeScript 5.9 ESM, `ws`, Node `crypto`, Jest

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/mudHookStateClient.ts` | MUD state map, provider, frame parsing | ~160 |
| `backend/src/hooks/__tests__/mudHookStateClient.test.ts` | Frame handling and lifecycle | ~150 |
| `backend/src/services/__tests__/mudTransportSecurity.test.ts` | URL policy and secret rotation | ~140 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `backend/src/services/mudAuctionClient.ts` | Loopback/wss policy, cert validation, previous-secret retry, state request and dispatch, clear on close | ~90 |
| `backend/src/hooks/index.ts` | Export the new surface | ~8 |
| `backend/src/index.ts` | Register the provider at startup | ~4 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] MUD state is requested after authentication and applied to resolution
- [ ] Unsolicited `hook_state` pushes are applied
- [ ] A malformed or unauthenticated frame is rejected, not partially applied
- [ ] Bridge down yields UNKNOWN for every MUD-gated hook
- [ ] State is re-requested and correct after a reconnect
- [ ] A non-loopback host over `ws:` is refused with a clear error
- [ ] `wss:` validates certificates
- [ ] `DURISWEB_SECRET_PREVIOUS` allows authentication during rotation
- [ ] The refresh-token storage question is answered in writing

### Testing Requirements

- [ ] Unit tests written and passing
- [ ] Manual testing completed

### Non-Functional Requirements

- [ ] No secret is logged, including during a rotation retry
- [ ] Applying a state frame is in-memory only

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- `hook_state` frames must only be honoured post-authentication. The existing
  `handleMessage` guard covers this; the new case must sit inside it.
- Hooks absent from a frame must become UNKNOWN, not retain a stale value. A MUD
  that stops reporting a hook is telling us something.
- `schema_version` is present for a reason: reject a frame whose version we do
  not understand rather than guessing at its shape.

### Potential Challenges

- **Loopback detection**: `localhost`, `127.0.0.0/8`, `::1`, and `[::1]` all
  need handling. Getting this wrong either blocks a valid local setup or permits
  plaintext across a network.
- **Rotation retry must not loop**: exactly one retry with the previous secret,
  then fail.

### Relevant Considerations

- [P00] **SEC-TZ-1**: do not add another cross-timezone timestamp comparison.
- [P00] **Contract tests assert on source text**: the existing
  `integrationSecurityContract.test.ts` pins strings in this file; update
  deliberately if a pinned line moves.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session:
- Stale MUD state surviving a reconnect, so the console shows a hook as ON that
  the MUD has since disabled
- A permissive loopback check letting plaintext cross a network boundary
- A secret leaking into a log line on the rotation retry path

---

## 9. Testing Strategy

### Unit Tests

- Valid frame applies every hook's state
- Unknown `schema_version` rejected wholesale
- Malformed frame rejected without partial application
- Hooks omitted from a frame become UNKNOWN
- Ungated hooks always report `not_gated` regardless of frames
- Disconnect clears state to UNKNOWN
- Loopback and non-loopback hosts under both schemes
- Signature generated with current secret; retry uses previous

### Integration Tests

- Deferred to Session 07, which exercises delivery end to end.

### Manual Testing

- Confirm the request is sent only after `durisweb_auth` succeeds
- Confirm no secret appears in any log statement on either path

### Edge Cases

- Frame arriving before authentication
- Frame naming a hook not in the registry
- `DURISWEB_SECRET_PREVIOUS` set but empty or too short
- IPv6 loopback in bracketed form

---

## 10. Dependencies

### External Libraries

- None added.

### Other Sessions

- **Depends on**: Sessions 02, 03
- **Depended by**: Sessions 06, 07

---

## Next Steps

Run `/implement` to begin AI-led implementation.

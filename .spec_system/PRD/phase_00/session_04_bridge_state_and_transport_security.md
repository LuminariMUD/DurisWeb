# Session 04: Bridge state sync and transport security

**Session ID**: `phase00-session04-bridge-state-and-transport-security`
**Package**: backend
**Status**: Not Started
**Estimated Tasks**: ~22
**Estimated Duration**: 3-4 hours

---

## Objective

Consume MUD hook state over the bridge, and close the transport and
secret-rotation gaps on the website side.

---

## Scope

### In Scope (MVP)

- Request `durisweb_hook_state` after authentication; handle unsolicited pushes
- Feed MUD state into the resolution engine; UNKNOWN while the bridge is down
- Re-request state on every reconnect so state is correct after recovery
- `wss://` support with certificate validation
- Refuse a non-loopback host unless the scheme is `wss:`
- `DURISWEB_SECRET_PREVIOUS` support, matching the MUD's existing behavior
- Rotation rehearsal proving zero dropped events
- Confirm and record whether `web_sessions.refresh_token` is hashed

### Out of Scope

- Reverse-proxy configuration on the MUD host (ops task)
- MUD-side changes (Session 02)
- UI (Session 06)

---

## Prerequisites

- [ ] Session 02 landed upstream, or a stub MUD peer to test against
- [ ] Session 03 complete - resolution engine available

---

## Deliverables

1. Bridge client requesting and consuming `durisweb_hook_state`
2. `wss://` support with cert validation and the non-loopback guard
3. Previous-secret support with a documented rotation procedure
4. Reconnect handling that restores correct state
5. Written finding on refresh token storage

---

## Success Criteria

- [ ] MUD state is reflected within 10 seconds of a MUD-side change
- [ ] Bridge down yields UNKNOWN, never assumed on or off
- [ ] State is correct after a reconnect without a restart
- [ ] Non-loopback host over plaintext `ws:` is refused with a clear error
- [ ] `wss://` connects with certificate validation enforced
- [ ] Rotation completes with zero dropped events
- [ ] Refresh token storage finding recorded in SECURITY-COMPLIANCE.md

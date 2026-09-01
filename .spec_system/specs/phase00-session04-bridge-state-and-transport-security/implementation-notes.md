# Implementation Notes

**Session ID**: `phase00-session04-bridge-state-and-transport-security`
**Package**: backend
**Started**: 2026-09-01 13:15
**Last Updated**: 2026-09-01 14:05

---

## Session Progress

| Metric | Value |
|--------|-------|
| Tasks Completed | 20 / 20 |
| Blockers | 1 resolved |

---

## Task Log

### T001-T003 - Contract re-read and the refresh-token question

Re-read `docs/reference/api/durisweb.md` and `src/net/ws_auth.h` before
touching the client, and confirmed the frame shape against the serializer
Session 02 actually wrote.

T003 answered a question open since the Session 01 survey: **refresh tokens are
stored verbatim.** `routes/auth.ts:107` generates a refresh JWT and inserts it
unchanged; `sessionService.ts:17` compares the raw value. Recorded as SEC-RT-1,
High - see Finding below.

---

### T004-T008 - MUD state client

New module rather than more code in `mudAuctionClient.ts`, which is already
large. It also means the state logic is testable without a socket, which turned
out to matter (see Blocker 1).

**BQC Fixes**:
- Contract alignment: frames are validated fully before anything is applied. A
  frame with one malformed entry applies nothing, so state is never half fresh
  and half stale with no way to tell which.
- Contract alignment: an unrecognised `schema_version` is refused rather than
  parsed hopefully. Misreading a future frame could mark a disabled hook enabled.
- State freshness: applying a frame replaces state wholesale, so a hook the MUD
  stops reporting reverts to unknown instead of keeping a stale reading.
- Trust boundary: `enabled` must be an actual boolean; `'true'` and `1` are
  rejected rather than coerced.

**Files Changed**: `backend/src/hooks/mudHookStateClient.ts` - created

---

### T009-T011 - Transport policy and rotation

The loopback rule is the substantive security change: `ws:` is now accepted only
for a loopback host. Anything else must be `wss:`, and `wss:` sets
`rejectUnauthorized: true` explicitly so that disabling validation would be a
visible edit rather than an omitted default.

Rotation gets exactly one retry with `DURISWEB_SECRET_PREVIOUS`, matching what
the MUD already accepts and what `docs/reference/api/durisweb.md` prescribes.

**BQC Fixes**:
- Duplicate action prevention: the retry is guarded by a flag so a MUD rejecting
  us for an unrelated reason cannot cause a loop.
- Error information boundaries: a missing or short secret throws naming the
  *variable*, never its value. Covered by a test that asserts the message does
  not contain the secret.

**Files Changed**: `backend/src/services/mudTransportPolicy.ts` - created;
`backend/src/services/mudAuctionClient.ts` - modified

---

### T012-T015 - Bridge integration

State is requested as soon as authentication succeeds, `hook_state` frames are
dispatched inside the existing post-authentication guard, and state is cleared
on close.

**BQC Fixes**:
- State freshness on re-entry: `clearMudHookState()` on socket close. Without it
  a reconnect could serve state the MUD changed while we were disconnected -
  exactly the silent disagreement this phase exists to remove.
- Resource cleanup: the challenge and rotation slot are reset on close so a new
  connection starts from the current secret.
- Failure path completeness: a failed state request is logged rather than
  leaving the caller believing state was requested.

**Files Changed**: `backend/src/services/mudAuctionClient.ts`,
`backend/src/index.ts`, `backend/src/hooks/index.ts`

---

### T016-T020 - Tests and verification

52 tests: 23 on frame handling and lifecycle, 29 on transport policy and
rotation.

Results: session 52/52; full suite 418 passing of 451 (56 of 59 suites); the
four pre-existing contract suites still 19/19; type-check clean.

---

## Blockers & Solutions

### Blocker 1: Test importing the bridge client hung

**Description**: the transport tests originally imported `mudAuctionClient.js`,
whose module-level side effects open a database pool and begin connecting. Jest
never exited.
**Impact**: T018
**Resolution**: extracted the pure functions into `mudTransportPolicy.ts`. This
was the right structure anyway - CONVENTIONS.md warns against growing god files,
and `mudAuctionClient.ts` was already long. `resolveMudWebSocketUrl` stayed put
deliberately, because `integrationSecurityContract.test.ts` pins one of its
error strings.
**Time Lost**: ~10 minutes

---

## Design Decisions

### Decision 1: A separate module for MUD-reported state

**Context**: the state could have lived in `mudAuctionClient.ts` beside the
socket.
**Chosen**: `mudHookStateClient.ts`, with the socket calling into it.
**Rationale**: it keeps frame validation testable without a socket, and keeps a
file that is already large from growing further. The socket module now only
routes; the state module decides.

### Decision 2: Absence is unknown, never enabled

**Context**: several points could have defaulted to "enabled" - before the first
report, after a disconnect, for a hook omitted from a frame.
**Chosen**: all of them are UNKNOWN, which resolution treats as inactive.
**Rationale**: this is the one place where fail-closed genuinely applies. We are
not guessing about our own store (where enabled is the safe default, per Session
03); we are reporting what the *other system* says. Claiming it said "enabled"
when it said nothing would let a hook run that the MUD has switched off.

### Decision 3: Loopback means the whole 127.0.0.0/8 range

**Context**: the obvious check is `hostname === '127.0.0.1'`.
**Chosen**: `localhost`, all of `127.0.0.0/8`, and both IPv6 loopback spellings
including the bracketed form.
**Rationale**: too narrow blocks a valid local setup; too broad (a prefix match
on `'127'`) would accept `127.example.com` and let plaintext cross a network.
Both failure modes are covered by tests.

---

## Finding: SEC-RT-1

`web_sessions.refresh_token` stores the refresh JWT verbatim -
`routes/auth.ts:107-116` inserts the generated token unchanged, and
`sessionService.ts:17` compares the raw value.

The severity is raised by an architectural fact confirmed in Session 03:
durisweb shares the MUD's database. So read access to the MUD's schema, any MUD
database backup, or SQL injection reachable from either codebase yields live,
directly replayable session tokens for every logged-in user, for up to seven
days. A replay is indistinguishable from the genuine request.

Remediation is contained - store and compare a SHA-256 digest, one insert site
and one comparison - but it invalidates existing sessions on deploy, so it needs
an owner and a deployment decision rather than an incidental fix here.

Recorded as High in SECURITY-COMPLIANCE.md.

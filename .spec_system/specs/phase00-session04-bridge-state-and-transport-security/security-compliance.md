# Security & Compliance Report

**Session ID**: `phase00-session04-bridge-state-and-transport-security`
**Package**: backend
**Reviewed**: 2026-09-01
**Result**: PASS

---

## Scope

**Files reviewed**:
- `backend/src/hooks/mudHookStateClient.ts`
- `backend/src/services/mudTransportPolicy.ts`
- `backend/src/services/mudAuctionClient.ts` (modified sections)
- `backend/src/index.ts` (provider registration)

---

## Security Assessment

### Overall: PASS

| Category | Status | Severity | Details |
|----------|--------|----------|---------|
| Injection | PASS | -- | No queries or shell calls added. Frame keys are looked up in the registry, never interpolated. |
| Hardcoded Secrets | PASS | -- | Secrets are read from the environment only. The test file uses obvious dummy values and restores `process.env` afterwards. |
| Sensitive Data Exposure | PASS | -- | No log statement interpolates a secret, signature, or challenge. Thrown errors name the variable, never the value - asserted by a test. |
| Insecure Dependencies | PASS | -- | None added. |
| Security Misconfiguration | PASS | -- | This session *removes* one: plaintext `ws:` to a non-loopback host is now refused rather than silently permitted. |
| Transport Security | PASS | -- | `wss:` sets `rejectUnauthorized: true` explicitly, so disabling validation would be a visible edit rather than an omitted default. |
| Authentication | PASS | -- | Rotation adds exactly one retry under the previous key, guarded against looping. `hook_state` is only honoured post-authentication, inside the existing guard. |

### Improvements delivered

- **Plaintext across a network is now refused.** Previously any host was
  accepted over `ws:`; the bridge carries an HMAC handshake and privileged
  commands such as `admin_delete_character`.
- **Certificate validation is explicit** rather than relying on a default.
- **Zero-downtime rotation is possible on the website side**, closing the
  asymmetry where the MUD accepted two keys and durisweb only one.

### Findings

#### SEC-4-1: Loopback trust assumes a trustworthy local host

- **Severity**: Informational
- **Description**: Plaintext is permitted to loopback addresses. Any local
  process able to bind or intercept loopback could observe the handshake.
- **Rationale**: this matches the MUD's own documented architecture - its
  production listener is loopback-only and a reverse proxy terminates WSS. A
  local attacker at that level already has the MUD process itself.
- **Status**: Accepted, documented.

---

## GDPR Compliance Assessment

### Overall: PASS

| Category | Status | Details |
|----------|--------|---------|
| Data Collection & Purpose | N/A | `hook_state` frames carry hook ids and booleans only |
| Consent Mechanism | N/A | No personal data |
| Data Minimization | PASS | Improves it: refusing plaintext across a network protects the presence and connection data other hooks carry |
| Right to Erasure | N/A | No new storage; state is in-memory and cleared on disconnect |
| PII in Logs | PASS | New log lines name hook ids and secret *variable* names only |
| Third-Party Data Transfers | PASS | Improves it: the transport carrying player data to durisweb is now encrypted when it crosses a host boundary |

### Findings

No new GDPR findings.

---

## Finding raised by this session

**SEC-RT-1 (High)**: refresh tokens are stored verbatim in `web_sessions`, in a
database shared with the MUD. Confirmed during T003, answering a question left
open by the Session 01 survey. Full detail in SECURITY-COMPLIANCE.md. Not
introduced by this phase; needs an owner and a deployment decision, since fixing
it invalidates existing sessions.

---

## Recommendations

- SEC-RT-1 should be scheduled. The change is small; the deploy consequence is
  what needs planning.
- Session 07 should assert the loopback policy in the contract test suite so it
  cannot regress.

---

## Sign-Off

- **Result**: PASS
- **Reviewed by**: AI validation (`/validate`)
- **Date**: 2026-09-01

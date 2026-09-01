# Security & Compliance Report

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Reviewed**: 2026-09-01
**Result**: PASS

---

## Scope

**Files reviewed** (session deliverables only, all in the MUD repository):
- `lib/duris.properties` - eight toggle keys, all 1.000
- `src/core/prototypes.h` - two declarations
- `src/world/properties.c` - toggle helper, push trigger
- `src/net/ws_handlers.c` - eight gates, serializer, command, push
- `src/net/ws_handlers.h` - two declarations
- `src/redis/redis_donation_runtime.c` - donation gate
- `docs/` - three documentation files

**Review method**: static analysis of the session diff plus a full compile under
`-Werror` with the project's hardening flags (`-D_FORTIFY_SOURCE=3`,
`-fstack-protector-strong`, `-fstack-clash-protection`).

---

## Security Assessment

### Overall: PASS

| Category | Status | Severity | Details |
|----------|--------|----------|---------|
| Injection | PASS | -- | No SQL, no shell, no `system()`. Hook ids are compile-time string literals from a static array, never caller-supplied. The one `snprintf` into a fixed buffer checks its return for truncation. |
| Hardcoded Secrets | PASS | -- | No credentials introduced. The session does not touch `DURISWEB_SECRET` or any auth path. |
| Sensitive Data Exposure | PASS | -- | The `hook_state` frame carries only hook ids and booleans - no player, account, or connection data. The unauthenticated-attempt log records no address or identity. The donation drop log records a count, not donor details. |
| Insecure Dependencies | PASS | -- | No dependencies added. cJSON was already vendored and in use. |
| Security Misconfiguration | PASS | -- | Defaults preserve existing behaviour: all eight toggles ship at `1.000`, so landing this changes nothing until an operator acts. |
| Memory Safety | PASS | -- | Compiles clean under `-Werror -Wall -Wextra -Wpedantic -Wstringop-overflow=4 -Warray-bounds=2 -Wuse-after-free=3`. Every `cJSON_Create` failure path frees what it allocated; the serializer's caller frees the returned string. |
| Authorization | PASS | -- | `ws_cmd_durisweb_hook_state` checks `durisweb_verified` before serializing anything and closes with `WS_CLOSE_POLICY_VIOLATION`. The push iterates only `durisweb_verified` descriptors. |

### Findings

#### SEC-1: Authorization ordering in `admin_delete_character` (resolved by design)

- **Severity**: Low, addressed
- **File**: `src/net/ws_handlers.c`
- **Description**: The new hook gate sits alongside the existing authorization
  check. Placed carelessly, a disabled-hook refusal returned before the auth
  check would tell an unauthenticated caller that the hook exists and is
  disabled - a small information leak.
- **Remediation**: the gate is written as
  `if (d->durisweb_verified && !durisweb_hook_enabled(...))`, so an
  unauthenticated caller still falls through to the existing "Not authorized"
  path and learns nothing about configuration.
- **Status**: Remediated during implementation.

#### SEC-2: Concurrency on the donation path (resolved by design)

- **Severity**: Medium, avoided
- **File**: `src/redis/redis_donation_runtime.c`
- **Description**: The obvious gate location, `accept_payload` in
  `redis_donation_worker.c`, runs on a background `std::thread`. Reading
  `duris_properties` there would race with `properties set` mutating the same
  array from the game thread.
- **Remediation**: gate moved to `check_donation_messages`, the game-thread
  pump. All property reads stay on the game thread.
- **Status**: Remediated during implementation.

---

## GDPR Compliance Assessment

### Overall: PASS

This session does not collect, store, or transmit personal data. It adds a
control that can *reduce* personal data flow.

| Category | Status | Details |
|----------|--------|---------|
| Data Collection & Purpose | N/A | No new collection |
| Consent Mechanism | N/A | No data collected |
| Data Minimization | PASS | Improves it: `player_presence` and `connection_log` carry account and connection data, and an operator can now stop the presence stream at source without stopping the MUD |
| Right to Erasure | N/A | No new storage |
| PII in Logs | PASS | Two log statements added, neither contains personal data: an unauthenticated-attempt notice with no identifier, and a dropped-donation count with no donor details |
| Third-Party Data Transfers | PASS | Reduces them: disabling a hook stops that data reaching durisweb at all |

### Personal Data Inventory

No personal data collected or processed. Two existing flows become
operator-controllable:

| Data Element | Flow | New control |
|-------------|------|-------------|
| Character name, faction | `player_presence` broadcasts | `durisweb.hook.player_presence` |
| Donor character name, amount | `donation_delivery` application | `durisweb.hook.donation_delivery` |

Note recorded for Session 04: presence payloads already omit account names, IP
addresses, and client metadata unless `DURISWEB_PRIVATE_PRESENCE` is exactly
`TRUE`. This session did not change that setting and its production value
remains unconfirmed.

### Findings

No GDPR findings.

---

## Recommendations

- Session 04 should confirm the production value of `DURISWEB_PRIVATE_PRESENCE`
  when it wires up the bridge, and record it in SECURITY-COMPLIANCE.md.
- Session 07 should test that a disabled hook emits nothing on the wire, rather
  than trusting the guard's presence in source.

---

## Sign-Off

- **Result**: PASS
- **Reviewed by**: AI validation (`/validate`)
- **Date**: 2026-09-01

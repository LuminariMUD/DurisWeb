# DurisMUD Hand-Off - Phase 00 Hook Control

**Companion to**: [PRD.md](PRD.md)
**Target repository**: `/home/aiwithapex/projects/duris/` (DurisMUD)
**Created**: 2026-09-01
**Last reconciled**: 2026-09-01, Session 07

This document records every Phase 00 change owned by the DurisMUD repository.
It is exact enough for a MUD engineer to review or land the work without
reading the website's TypeScript.

Status vocabulary:

- `PUSHED (UNMERGED)`: committed on the remote feature branch and verified,
  but not merged. This is the current requested topology.
- `ANSWERED`: an investigated question requiring no code change.
- `DEFERRED (OPS)`: an operational acceptance outside either repository, with
  its owner and reason stated.
- `DONE`: reserved for a merged change. No Phase 00 MUD change is labelled DONE
  because the maintainer explicitly requested no merge.

Existing pushed, unmerged commits on `feat/durisweb-hook-toggles`:

- `28aa1100` - Session 02 runtime properties, source gates, state reporting,
  rotation acceptance, and initial docs.
- `246d4510` - Session 06 authenticated runtime set/persist/push/ack command.
- `df121bb3` - Session 07 exact integration contracts and reconciled operator
  documentation.

---

## Summary

| # | Change | Files | Status |
|---|--------|-------|--------|
| 1 | Add exactly eight hook properties | `lib/duris.properties` | PUSHED (UNMERGED), `28aa1100` |
| 2 | Add property read/set helpers | `src/world/properties.c`, `src/core/prototypes.h` | PUSHED (UNMERGED), `28aa1100` + `246d4510` |
| 3 | Gate each emitter/consumer at source | `src/net/ws_handlers.c`, `src/redis/redis_donation_runtime.c` | PUSHED (UNMERGED), `28aa1100` |
| 4 | Add authenticated `durisweb_hook_state` | `src/net/ws_handlers.c/.h` | PUSHED (UNMERGED), `28aa1100` |
| 5 | Push complete state after property changes | `src/world/properties.c`, `src/net/ws_handlers.c` | PUSHED (UNMERGED), `28aa1100` + `246d4510` |
| 6 | Keep MUD listener loopback-only behind WSS proxy | no C change | DEFERRED (OPS) |
| 7 | Confirm current/previous secret rotation | `src/net/ws_auth.h`, docs | ANSWERED |
| 8 | Reconcile API/config/runbook/incident docs | `docs/reference/api/durisweb.md`, `docs/operations/` | PUSHED (UNMERGED), `df121bb3` |
| 9 | Add authenticated `durisweb_hook_set` with durable ack | `src/net/ws_handlers.c/.h`, `src/world/properties.c`, `src/core/prototypes.h` | PUSHED (UNMERGED), `246d4510` |

No new config system, authentication scheme, or transport is introduced.

---

## Shared Contract

- Hook ids are identical `snake_case` strings on both ends.
- MUD property keys are `durisweb.hook.<hook_id>` floats. `>= 0.5` is enabled.
- Missing properties default to enabled so an older property file preserves
  pre-phase behavior.
- Only eight hooks have a MUD property. Five toggleable hooks are website-only,
  and `terminal` is always-on with permission/live-session controls.
- Unknown, absent, or disconnected MUD state is never treated as enabled by the
  website.

The exact MUD-owned ids, in state-frame order, are:

1. `auction_new`
2. `auction_bid`
3. `auction_close`
4. `player_presence`
5. `mud_shutdown`
6. `wholist`
7. `admin_delete_character`
8. `donation_delivery`

The website-only ids are `connection_log`, `flag_parsing`, `guild_parsing`,
`zone_builder_parsing`, and `process_control`. The MUD must not invent
properties for them.

---

## Change 1 - Exactly Eight Hook Properties

**File**: `lib/duris.properties`

```text
[durisweb hook toggles]
durisweb.hook.auction_new=1.000
durisweb.hook.auction_bid=1.000
durisweb.hook.auction_close=1.000
durisweb.hook.player_presence=1.000
durisweb.hook.mud_shutdown=1.000
durisweb.hook.wholist=1.000
durisweb.hook.admin_delete_character=1.000
durisweb.hook.donation_delivery=1.000
```

`connection_log` deliberately has no MUD property. It stops DurisWeb ingestion,
not the MUD's own `LOG_COMM` operational records.

**Acceptance**: the tracked file and configuration table contain exactly these
eight keys, and the integration contract compares both to the handler whitelist.

---

## Change 2 - Property Helpers

**Files**: `src/world/properties.c`, `src/core/prototypes.h`

`durisweb_hook_enabled(id)` builds the namespaced key with a bounded buffer and
performs a non-fussy property read defaulting to enabled. Empty or overlong ids
return false rather than overflowing.

`set_durisweb_hook_enabled(id, enabled)` finds an existing property, updates it
on the game thread, persists through `lib/duris.properties.new` plus `rename`,
rolls memory back on persistence failure, applies properties, logs the key but
not credentials, and pushes the complete state.

**Acceptance**: strict MUD build passes; the Python contract pins bounded key
construction, atomic persistence, rollback path, apply, and state push.

---

## Change 3 - Source-Side Enforcement

Broadcast functions return before constructing JSON:

| Function | Hook id |
|----------|---------|
| `ws_broadcast_auction_new` | `auction_new` |
| `ws_broadcast_auction_bid` | `auction_bid` |
| `ws_broadcast_auction_close` | `auction_close` |
| `ws_broadcast_mud_shutdown` | `mud_shutdown` |
| `ws_broadcast_player_login` and `ws_broadcast_player_logout` | `player_presence` |
| `ws_send_wholist_to_client` | `wholist` |

`ws_cmd_admin_delete_character` explicitly refuses a verified service request
before parsing its character payload when the hook is disabled. Authentication
still precedes disclosure: an unverified descriptor receives only the existing
not-authorized response.

`donation_delivery` is not a WebSocket emitter. Its game-thread gate is in
`src/redis/redis_donation_runtime.c`, before queued events are applied. Disabled
events are drained and dropped so they cannot accumulate and flood on re-enable;
one aggregate line per pulse records the drop count.

**Acceptance**: `tests/async/test_durisweb_integration_security.py` slices every
emitter/consumer and asserts the gate precedes payload construction, request
parsing, or application.

---

## Change 4 - Authenticated State Command

**Files**: `src/net/ws_handlers.c`, `src/net/ws_handlers.h`

An authenticated service sends:

```json
{"type":"cmd","cmd":"durisweb_hook_state","data":{}}
```

The response and unsolicited push use one serializer:

```json
{
  "type": "hook_state",
  "schema_version": 1,
  "hooks": {
    "auction_new": {"enabled": true},
    "auction_bid": {"enabled": true},
    "auction_close": {"enabled": true},
    "player_presence": {"enabled": true},
    "mud_shutdown": {"enabled": true},
    "wholist": {"enabled": true},
    "admin_delete_character": {"enabled": true},
    "donation_delivery": {"enabled": true}
  }
}
```

Authorization is checked before state serialization. An unauthenticated
descriptor is closed without learning configuration.

**Acceptance**: the table-driven command entry, auth-first ordering, exact id
tuple, schema version, and shared serializer are pinned by the Python contract.

---

## Change 5 - State Push On Property Change

The in-game `properties set` and `properties reload` paths push the complete
state after `apply_properties()`. In-game `properties set` remains in memory
until `properties save`; this long-standing operator behavior is unchanged.

The authenticated service setter in Change 9 persists automatically and pushes
before acknowledging. The website tolerates state and ack arriving in either
observation order and waits for the requested state before settling its control.

**Acceptance**: a changed MUD property reaches connected authenticated peers
without restart; disconnect clears the website's report and reconnect restores
only the new complete frame.

---

## Change 6 - WSS Reverse Proxy - Deferred Operational Acceptance

No MUD C change is required. Production keeps the MUD WebSocket listener on
exact loopback and terminates public WSS at a local reverse proxy. DurisWeb
refuses non-loopback `ws://` and sets `rejectUnauthorized: true` for WSS.

**Deferred owner**: deployment operator.

**Reason**: neither repository declares a production endpoint, certificate, or
deployment authority. Repository tests prove code policy, not that an operator
has provisioned and connected a live reverse proxy. Before production release,
the operator must verify a certificate-valid `wss://` connection through the
MUD host proxy. This deferral does not authorize plaintext or disabled TLS
verification.

---

## Change 7 - Previous-Secret Rotation - Answered

`src/net/ws_auth.h` reads `DURISWEB_SECRET` and
`DURISWEB_SECRET_PREVIOUS` on each verification and accepts either. The MUD
process adopts environment changes at restart. DurisWeb signs with current
first and retries previous exactly once after rejection, closing the earlier
one-key asymmetry.

**Acceptance**: both repositories' contracts pin previous-key support and the
website's one-retry bound. Remove the previous key after all backends switch.

---

## Change 8 - Reconciled MUD Documentation

The MUD docs now cover:

- exact state and set frames, strict input bounds, ack, and push behavior;
- exact eight MUD ids and five website-only ids;
- in-game memory-only changes versus automatic service persistence;
- disable-website-first and enable-website-last reconciliation;
- mismatch, unknown, WSS, certificate, and rotation incident response.

**Acceptance**: the MUD Python contract reads the API, configuration, runbook,
and incident guide and pins their id and behavioral parity. Session 07's MUD
contract/docs are pushed at `df121bb3`; merge remains intentionally deferred.

---

## Change 9 - Authenticated Durable Hook Setter

**Files**: `src/net/ws_handlers.c`, `src/net/ws_handlers.h`,
`src/world/properties.c`, `src/core/prototypes.h`

The authenticated backend sends a `durisweb_hook_set` command with:

- non-empty `requestId`, maximum 128 bytes;
- `hook`, exact-whitelisted to the eight ids;
- `enabled`, an actual JSON boolean;
- `actor`, supplied for website provenance but never trusted as MUD auth.

Authorization precedes data parsing. A valid request calls the game-thread
setter from Change 2. Persistence failure returns `success:false`; success
pushes the complete state and returns a correlated `durisweb_hook_set` ack with
`requestId`, `hook`, and `enabled`.

**Acceptance**: strict MUD build and Python contract pass; the website reconcile
suite proves disable-first, enable-last, rejection, timeout, website-only, and
immutable-terminal paths.

---

## Intentionally Unchanged

- No config replacement: the existing property system remains authoritative.
- No new authentication scheme: the challenge-bound HMAC remains in place.
- No new transport: state and set use the existing authenticated bridge.
- No TLS inside the MUD process: the loopback listener stays behind the proxy.
- No runtime secret reload command: coordinated restart remains documented.
- No MUD terminal toggle: terminal recovery is website permission/session gated.
- No comm-log format change and no unrelated gameplay change.

---

## Landing Order When Merge Is Authorized

No merge is authorized at this point. The pushed feature branch remains the
handoff. When a maintainer later chooses to land it, preserve this order:

1. `28aa1100`: properties/helper, source gates, state command/push, initial docs.
2. `246d4510`: authenticated durable set/push/ack.
3. `df121bb3`: exact integration contracts and reconciled operator docs.
4. Configure and accept the live WSS reverse proxy before networked production.

All properties default enabled, so landing the MUD side before the website side
preserves existing behavior. The deployment operator owns step 4; the repository
maintainer owns any future merge decision.

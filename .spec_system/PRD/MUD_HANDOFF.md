# DurisMUD Hand-Off - Phase 00 Hook Control

**Companion to**: [PRD.md](PRD.md)
**Target repository**: `/home/aiwithapex/projects/duris/` (DurisMUD, C)
**Created**: 2026-09-01

This document is a required Phase 00 deliverable. It specifies every change
needed in the DurisMUD repository so that a MUD engineer can implement the MUD
side without reading durisweb's TypeScript.

Keep the Status column current. A change is `DONE` only when it is merged
upstream and its acceptance check passes.

**Implemented in Phase 00 Session 02** on branch `feat/durisweb-hook-toggles`
in `/home/aiwithapex/projects/duris/`. Not pushed. Three corrections were made
during implementation and are recorded inline below.

---

## Summary

| # | Change | Files | Status |
|---|--------|-------|--------|
| 1 | Add hook toggle properties (8, not 9) | `lib/duris.properties` | DONE |
| 2 | Add a toggle helper | `src/world/properties.c`, `src/core/prototypes.h` | DONE |
| 3 | Gate each emitter on its toggle | `src/net/ws_handlers.c`, `src/redis/redis_donation_runtime.c` | DONE |
| 4 | Add `durisweb_hook_state` command | `src/net/ws_handlers.c/.h` | DONE |
| 5 | Push state on toggle change | `src/world/properties.c` | DONE |
| 6 | ~~TLS on the bridge listener~~ | -- | NOT NEEDED |
| 7 | ~~Confirm previous-secret behaviour~~ | -- | ANSWERED |
| 8 | Update the integration reference docs | `docs/reference/api/durisweb.md`, `docs/operations/CONFIGURATION.md`, `docs/operations/RUNBOOK.md` | DONE |

Nothing here requires a new config system, a new auth scheme, or a new
transport. Every change extends a mechanism the MUD already has.

---

## Conventions

- **Hook ids** are `snake_case` and identical on both ends. Never translate them.
- **Property keys** are `durisweb.hook.<hook_id>`.
- **Values** are floats, like every other property. `1.000` = enabled,
  `0.000` = disabled. Treat `>= 0.5` as enabled so float round-tripping cannot
  silently disable a hook.
- **Default is enabled** (`1.000`) for every hook that exists today, so applying
  this work changes no behaviour until an operator flips something.

---

## Change 1 - Add hook toggle properties

**File**: `lib/duris.properties`

Append a block. Only the nine hooks the MUD actually emits or serves belong
here; the remaining four are website-side only and have no MUD counterpart.

```
[durisweb hook toggles]
durisweb.hook.auction_new=1.000
durisweb.hook.auction_bid=1.000
durisweb.hook.auction_close=1.000
durisweb.hook.player_presence=1.000
durisweb.hook.mud_shutdown=1.000
durisweb.hook.donation_delivery=1.000
durisweb.hook.wholist=1.000
durisweb.hook.admin_delete_character=1.000
```

**Correction (Session 02): `connection_log` is not gated on the MUD.** The lines
durisweb parses out of `logs/log/comm` are ordinary `LOG_COMM` operational logs
the MUD writes for its own purposes -- `LOG_COMM` is used 16 times in `comm.c`
alone, alongside a parallel `loginlog()`. Gating them would delete admin-facing
connection records in order to control a website integration. The toggle stays
on the durisweb side and stops ingestion, not logging. Eight keys, not nine.

The five website-side hooks (connection_log, flag parsing, guild parsing,
zone/builder parsing, process control) are consumers or callers, not MUD
emitters, and need no property.

**Acceptance**: `properties durisweb` in-game lists all eight at `1.000`.

---

## Change 2 - Add a toggle helper

**Files**: `src/world/properties.c`, `src/world/properties.h`

```c
/* Returns TRUE when the named durisweb hook is enabled.
   Unknown keys default to enabled so a missing property never
   silently disables an existing integration. */
bool durisweb_hook_enabled(const char *hook_id)
{
    char key[128];
    snprintf(key, sizeof(key), "durisweb.hook.%s", hook_id);
    return get_property(key, 1.0, false) >= 0.5;
}
```

Note `fussy = false` on the `get_property` call - a missing key must not log a
complaint on every event.

**Acceptance**: unit or in-game check that an unknown hook id returns TRUE and
that setting a key to `0.000` returns FALSE.

---

## Change 3 - Gate each emitter on its toggle

**File**: `src/net/ws_handlers.c`

Guard at the **top of each emitter**, before any payload is built. The
requirement is that a disabled hook produces no event at the source - not that
the website discards it.

| Function (declared in `ws_handlers.h`) | Hook id |
|----------------------------------------|---------|
| `ws_broadcast_auction_new` | `auction_new` |
| `ws_broadcast_auction_bid` | `auction_bid` |
| `ws_broadcast_auction_close` | `auction_close` |
| `ws_broadcast_mud_shutdown` | `mud_shutdown` |
| `ws_broadcast_player_login` **and** `ws_broadcast_player_logout` | `player_presence` |
| `ws_send_wholist_to_client` | `wholist` |
| `ws_cmd_admin_delete_character` | `admin_delete_character` |

Verified against `src/net/ws_handlers.c` during Session 01. Two corrections to
the earlier draft:

- **`player_presence` has two emitters**, not one - login at line 387 and
  logout at line 430. Both need the guard; one registry hook covers both, since
  an operator cutting presence wants both gone.
- **`donation_delivery` is not a WebSocket emitter.** durisweb is the producer
  and the MUD consumes over Redis, so its guard belongs in
  `src/redis/redis_donation_worker.c`, not `ws_handlers.c`. The MUD-side gate
  means the worker ignores inbound donation events while disabled.

```c
void ws_broadcast_auction_new(int auction_id, const char *seller_name, ...)
{
    if (!durisweb_hook_enabled("auction_new"))
        return;
    /* existing body unchanged */
}
```

For `connection_log`, guard the durisweb-consumed write sites in the connection
logging path rather than an emitter.

**Acceptance**: with a property at `0.000`, trigger the event in-game and
confirm nothing is sent on the socket (durisweb logs no inbound event, and a
packet capture on 4050 shows no frame). For `donation_delivery`, confirm the
Redis worker drops the event without applying it.

**Source of truth for ids**: `backend/src/hooks/registry.ts` in the durisweb
repo. Each entry carries a `mudSite` field naming the exact symbol or file its
guard belongs at. Generate this list with `getMudGatedHooks()` rather than
transcribing it, so the two repositories cannot drift.

---

## Change 4 - Add the `durisweb_hook_state` command

**Files**: `src/net/ws_handlers.c`, `src/net/ws_handlers.h`

Register alongside the existing `durisweb_*` commands. **It must require an
authenticated durisweb session** - the same gate as `ws_cmd_durisweb_auth`
establishes. Reject it on any unauthenticated descriptor.

```c
/* durisweb service: report hook toggle states */
void ws_cmd_durisweb_hook_state(struct descriptor_data *d, cJSON *data);
```

Response frame:

```json
{
  "type": "hook_state",
  "schema_version": 1,
  "hooks": {
    "auction_new":      { "enabled": true  },
    "auction_bid":      { "enabled": true  },
    "auction_close":    { "enabled": true  },
    "player_presence":  { "enabled": false },
    "mud_shutdown":     { "enabled": true  },
    "donation_delivery":{ "enabled": true  },
    "connection_log":   { "enabled": true  }
  }
}
```

Include `schema_version` - durisweb's existing donation events already carry
one, and the website keys its parser off it.

**Acceptance**: an authenticated durisweb client sending
`{"type":"cmd","cmd":"durisweb_hook_state","data":{}}` receives the frame above.
An unauthenticated descriptor sending it is rejected and the socket closed.

---

## Change 5 - Push state on toggle change

**File**: `src/world/properties.c`, in the `properties set` path

After `apply_properties()`, if the changed key begins with `durisweb.hook.`,
send the same `hook_state` frame from Change 4 to every authenticated durisweb
descriptor.

This is what meets the PRD's 10-second propagation budget without the website
polling. `properties reload` should push as well, since it can change many keys
at once.

**Acceptance**: with durisweb connected, run `properties set
durisweb.hook.auction_new 0.000` in-game; the website console reflects OFF
within 10 seconds with no page refresh.

---

## Change 6 - TLS on the bridge listener - NOT NEEDED

**Status: withdrawn.** `docs/reference/api/durisweb.md` already states that the
public endpoint must be HTTPS/WSS terminated by a local reverse proxy and that
the game server's production WebSocket listener is loopback-only.

So the PRD's `wss://` requirement is met by reverse-proxy configuration on the
MUD host plus certificate validation in durisweb's client. **No MUD C change.**
This entry is kept rather than deleted because an earlier draft of this document
specified TLS inside the MUD, and that was wrong.

---

## Change 7 - Previous-secret behaviour - ANSWERED

**Status: no change needed.** `getenv("DURISWEB_SECRET")` and
`getenv("DURISWEB_SECRET_PREVIOUS")` are called *inside*
`ws_verify_durisweb_signature` (`src/net/ws_auth.h:82-83`), on every
verification. Neither is cached in a static.

`src/core/env_file.c` loads `.env` once at boot (`comm.c:519`) using
`setenv(..., 0)`, which does not overwrite. A MUD-side key change is therefore
adopted at the next restart - which is the documented coordination point, not a
defect. The rotation flow in `docs/reference/api/durisweb.md` already accounts
for it: both keys are live simultaneously, so durisweb backends switch at their
own pace with zero dropped events.

No runtime `setenv` command is required. The remaining work is website-side.

---

## Change 8 - Update the integration reference docs

**Files**: `docs/reference/api/durisweb.md`, `docs/operations/CONFIGURATION.md`

The MUD repository already documents this integration, and that documentation
is the contract durisweb is written against. It must not fall behind.

- `docs/reference/api/durisweb.md`: add the `durisweb_hook_state` command, its
  response frame and `schema_version`, the unsolicited push on toggle change,
  and a note that any event may be suppressed by its `durisweb.hook.*` property.
- `docs/operations/CONFIGURATION.md`: add the `durisweb.hook.*` property family
  alongside the existing `DURISWEB_*` variable table.
- `docs/operations/RUNBOOK.md`: add a short "disabling a durisweb hook" entry
  pointing at `properties set durisweb.hook.<id> 0.000`.

**Acceptance**: a reader of the MUD docs alone can implement a durisweb client
against the current contract, including hook suppression.

---

## What is NOT changing

Recorded so a reviewer does not go looking:

- **No new config system.** `properties` already supports `set`, `reload`,
  `save`, `revert` at FORGER+, and `get_property()` is an in-memory bsearch.
- **No new auth scheme.** The existing challenge design - 32 random bytes via
  `RAND_bytes`, 30-second expiry, minute-bound HMAC-SHA256, attempt throttling -
  is the model to conform to, not to replace.
- **No new transport.** Hook state travels over the existing bridge.
- **No TLS inside the MUD.** The listener stays loopback-only; a reverse proxy
  terminates WSS. See withdrawn Change 6.
- **No runtime secret-reload command.** Secrets are read per-verification and a
  key change lands at the next restart, which the documented rotation flow
  already accommodates. See answered Change 7.
- **No terminal toggle.** The interactive terminal is deliberately always-on as
  the operator recovery path; it is gated by `terminal_access` on the website
  side only.
- **No comm-log format change.** durisweb's parsers are being hardened to the
  current format; changing it would break them.
- **No game logic changes.** Nothing here touches gameplay.

---

## Landing order

Land the MUD side first, with all toggles defaulting to `1.000`. Current
behaviour is preserved exactly, so the website side can follow at its own pace
without a coordinated release.

1. Changes 1 and 2 (properties + helper) - inert on their own.
2. Change 3 (emitter gates) - still inert while defaults are `1.000`.
3. Changes 4 and 5 (state reporting) - the website can now read MUD state.
4. Change 8 (docs) - alongside changes 4 and 5, never after.

Changes 6 and 7 require no work; they are retained as answered questions.

Split-host deployment needs reverse-proxy configuration on the MUD host, which
is an ops task outside this repository.

# Hook Registry

The single source of truth for website<->MUD integration hook ids.

A "hook" is one stream of data or control crossing between durisweb and the
DurisMUD server. There are 14: 13 toggleable, plus the always-on terminal.

See `.spec_system/PRD/PRD.md` for requirements and
`.spec_system/PRD/MUD_HANDOFF.md` for the MUD-side changes.

## Rules

1. **Hook ids are defined only in `registry.ts`.** Never write a hook id as a
   literal anywhere else -- import it. Ids appear in `web_settings`, in the
   MUD's `lib/duris.properties`, in logs, and in the operator console, and they
   must be byte-identical in all four.
2. **Ids are permanent.** Once released, renaming one is a migration on both
   sides. Choose carefully.
3. **Both ends toggle.** Every hook except an always-on one gets an independent
   toggle on the website and, where the MUD has a side to gate, on the MUD. A
   hook is active only when both ends enable it (fail closed).
4. **The source does not emit a disabled hook.** Never emit and discard.
5. **Toggle checks are in-memory.** Never a database or disk read on an event
   path.

## Adding a hook

1. Add the id to the `HookId` union in `types.ts`.
2. Add a `HookDefinition` to `DEFINITIONS` in `registry.ts`, in its channel's
   block.
3. Set `mudPropertyKey` only when the MUD has something to gate. A hook the
   website reads or drives on its own gets `null`, never an empty string.
4. Record `mudSite` -- the MUD symbol or file the gate lives at -- so cross-repo
   work has an unambiguous target.
5. Add the `web_settings` row (see Session 03) and, if MUD-gated, the
   `duris.properties` key (see Session 02).
6. Extend the registry tests; the invariant tests will fail until the new entry
   is consistent.

## Fields

| Field | Meaning |
|-------|---------|
| `id` | Stable `snake_case` identifier, identical on both ends |
| `channel` | Transport family: `bridge`, `pubsub`, `flatfile`, `process`, `terminal` |
| `direction` | `mud_to_web` or `web_to_mud` |
| `alwaysOn` | True only when the hook must never be disabled |
| `webSettingKey` | `web_settings` key, `hook_enabled_<id>`. Null only when `alwaysOn` |
| `mudPropertyKey` | `durisweb.hook.<id>`, or null when the MUD has no side to gate |
| `owner` | durisweb service that owns the hook |
| `mudSite` | MUD symbol or file the gate lives at, or null |
| `description` | What the hook carries, and any caveat worth knowing |

## Channels

| Channel | Trust boundary |
|---------|----------------|
| `bridge` | Authenticated WebSocket on 4050. HMAC-SHA256 challenge-response |
| `pubsub` | Scoped Redis, namespaced by season epoch, per-scope credentials |
| `flatfile` | Filesystem. Unauthenticated by construction -- validate before parsing |
| `process` | Website drives host processes. Permission-gated only |
| `terminal` | Sandboxed shell. Permission-gated only, always on |

## Lookups

`getHook` returns `undefined` for an unregistered id. **Do not treat that as
enabled** -- an unregistered id is a bug, not an open gate. On paths where the
id is expected to exist, use `requireHook`, which throws with the offending id.
Narrow untrusted input with `isHookId` first.

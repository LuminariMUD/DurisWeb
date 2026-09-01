# Hook Registry

This directory contains the source of truth for website/MUD integration hook
ids, ownership, state, and delivery policy.

A hook is one stream of data or control crossing between DurisWeb and the
DurisMUD server. The registry has 14 rows: 13 website-toggleable hooks and the
always-on terminal recovery path. Eight toggleable hooks have a MUD property;
five are intentionally website-only.

See the [Phase 00 PRD](../../../.spec_system/PRD/PRD.md),
[MUD handoff](../../../.spec_system/PRD/MUD_HANDOFF.md), and
[architecture guide](../../../docs/ARCHITECTURE.md).

## Rules

1. Define hook ids only in `registry.ts`; consume registry lookups elsewhere.
2. Treat released ids as permanent cross-repository contract values.
3. Gate each owned end independently. The effective state is active only when
   every applicable end is enabled.
4. Suppress disabled work at its source before payload construction or action.
5. Keep event-path checks in memory; never add database or disk I/O there.
6. Treat absent MUD state as unknown/inactive and clear it on disconnect.
7. Keep terminal registered and permission-gated, but never toggleable.

## Adding a Hook

1. Add the id to `HookId` in `types.ts`.
2. Add a `HookDefinition` to the correct channel block in `registry.ts`.
3. Set `mudPropertyKey` only when the MUD owns an enforcement site.
4. Record the DurisWeb owner and exact MUD symbol/file when applicable.
5. Add the website setting and any applicable MUD property/handler changes.
6. Extend registry-generated behavior tests and the exact cross-repository
   contract tuple.
7. Update `MUD_HANDOFF.md` and operator documentation when the MUD changes.

## Registry Fields

| Field | Meaning |
|-------|---------|
| `id` | Stable `snake_case` identifier shared across systems |
| `channel` | `bridge`, `pubsub`, `flatfile`, `process`, or `terminal` |
| `direction` | `mud_to_web` or `web_to_mud` |
| `alwaysOn` | True only for the terminal recovery path |
| `webSettingKey` | `web_settings` key; null only for always-on rows |
| `mudPropertyKey` | `durisweb.hook.<id>` or null for website-only rows |
| `owner` | DurisWeb service that owns delivery/application |
| `mudSite` | MUD enforcement symbol/file, or null |
| `description` | Operator-facing purpose and ownership caveat |

`getHook` returns `undefined` for unknown input. Never interpret that result as
enabled. Use `isHookId` at untrusted boundaries and `requireHook` where a
registered id is an invariant.

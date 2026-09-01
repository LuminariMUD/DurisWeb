# Session Specification

**Session ID**: `phase00-session01-hook-registry-and-contract`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Not Started
**Created**: 2026-09-01
**Package**: backend
**Package Stack**: TypeScript

---

## 1. Session Overview

Every later session in this phase needs one stable vocabulary for the
website<->MUD integration surface. Today that vocabulary does not exist: five
channels were built at different times, each naming its streams differently, and
nothing enumerates them in one place. Session 02 cannot add MUD property keys
without final hook ids, Session 03 cannot key `web_settings` rows without them,
and Session 06 cannot render rows without them.

This session builds that foundation and nothing else. It produces a registry
module enumerating all 13 toggleable streams plus the always-on terminal, each
with a stable `snake_case` id used identically in `web_settings`, in
`lib/duris.properties`, in logs, and in the operator console. It also writes
down the contract a new hook must satisfy, so the sixth integration does not
become a sixth precedent.

No behavior changes. Nothing is gated, toggled, or enforced here - the registry
is inert data plus types. That is deliberate: PRD Resolved Decision 1 and the
phase risk register both call for landing structure before enforcement, so a
bug in resolution cannot mass-disable hooks before it is tested.

---

## 2. Objectives

1. Enumerate all 14 registry entries (13 toggleable + 1 always-on) verified
   against the MUD source, not inferred from durisweb alone.
2. Assign stable `snake_case` ids and `durisweb.hook.<id>` property keys that
   Sessions 02, 03, and 06 consume without renaming.
3. Publish a typed registry module that is the single source of hook ids.
4. Document the contract a new hook must satisfy, and reconcile MUD_HANDOFF.md
   changes 1-5 and 8 against the final ids.

---

## 3. Prerequisites

### Required Sessions

- None. First session of Phase 00.

### Required Tools/Knowledge

- TypeScript/ESM module conventions per CONVENTIONS.md
- Jest with `NODE_OPTIONS=--experimental-vm-modules`
- Ability to read C well enough to confirm emitter names in `ws_handlers.h`

### Environment Requirements

- MUD source readable at `/home/aiwithapex/projects/duris/`
- `backend/` dependencies installed via pnpm

---

## 4. Scope

### In Scope (MVP)

- Developer can consult a single registry that enumerates every hook, its
  channel, direction, and toggle key - a typed array in `registry.ts`
- Each hook has a stable identifier used identically on both ends - ids are
  defined only here and imported everywhere else
- Developer can add a new hook by conforming to one documented contract -
  written to `backend/src/hooks/README.md`
- The interactive terminal is registered `always-on` with no toggle key
- MUD_HANDOFF.md changes 1-5 and 8 reconciled against final ids

### Out of Scope (Deferred)

- Toggle storage and resolution - *Reason: Session 03; the registry must be
  stable before anything keys off it*
- MUD-side property keys in `duris.properties` - *Reason: Session 02 consumes
  the ids this session fixes*
- Enforcement on event paths - *Reason: Session 03, after resolution is tested*
- Console rendering - *Reason: Session 06*

---

## 5. Technical Approach

### Architecture

A new `backend/src/hooks/` module. `registry.ts` exports a frozen array of
`HookDefinition` records and lookup helpers. It has no runtime dependencies on
services, so any service can import it without a cycle.

Each entry records: `id`, `channel`, `direction`, `alwaysOn`, `webSettingKey`,
`mudPropertyKey` (null when the MUD does not emit it), `owner` (the durisweb
service file), and `description`.

Channel assignment follows PRD SECURITY-COMPLIANCE:

| Channel | Hooks |
|---------|-------|
| `bridge` | auction_new, auction_bid, auction_close, player_presence, mud_shutdown, wholist, admin_delete_character |
| `pubsub` | donation_delivery |
| `flatfile` | connection_log, flag_parsing, guild_parsing, zone_builder_parsing |
| `process` | process_control |
| `terminal` | terminal (always-on) |

Nine entries carry a `mudPropertyKey`; the four website-side consumers and the
terminal do not.

### Design Patterns

- **Single source of truth**: ids exist only in `registry.ts`. Contract tests in
  Session 07 assert no literal hook id appears elsewhere.
- **Frozen data + derived lookups**: `Object.freeze` plus `Map`-backed lookups
  built once at module load, so Session 03's in-memory budget is achievable.
- **Discriminated union on channel**: exhaustive `switch` handling per
  CONVENTIONS.md Types section.

### Technology Stack

- TypeScript 5.9, ESM with `.js` import extensions
- Jest (backend test runner)

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/types.ts` | `HookId`, `HookChannel`, `HookDirection`, `HookDefinition` | ~60 |
| `backend/src/hooks/registry.ts` | The 14 entries plus lookup helpers | ~180 |
| `backend/src/hooks/index.ts` | Public surface re-exports | ~15 |
| `backend/src/hooks/README.md` | Contract for adding a new hook | ~90 |
| `backend/src/hooks/__tests__/registry.test.ts` | Completeness, uniqueness, invariants | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `.spec_system/PRD/MUD_HANDOFF.md` | Reconcile ids and property keys in changes 1-5, 8 | ~20 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] All 13 toggleable hooks plus the terminal are registered (14 entries)
- [ ] `wholist` and `admin_delete_character` are present
- [ ] Terminal is `alwaysOn: true` with `webSettingKey: null` and
      `mudPropertyKey: null`
- [ ] Exactly 9 entries carry a `durisweb.hook.<id>` property key
- [ ] Every id verified against MUD source or an existing durisweb service
- [ ] Lookup by id returns in O(1) and is null-safe for unknown ids

### Testing Requirements

- [ ] Unit tests written and passing
- [ ] Manual testing completed

### Non-Functional Requirements

- [ ] Registry is import-safe from any service with no circular dependency
- [ ] Lookups are in-memory only - no DB or disk access anywhere in the module

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- Ids are permanent once Session 02 writes them into `duris.properties` and
  Session 03 into `web_settings`. Renaming later is a migration on both sides.
- `player_presence` travels over both the bridge and Redis. It is registered
  once, on `bridge`, with its dual nature noted in the description - two
  registry entries for one stream would produce two toggles for one thing.
- `mudPropertyKey` is `null`, never an empty string, for website-only hooks.
  Session 02 iterates on non-null to generate the property block.

### Potential Challenges

- **Emitter names drifting from ids**: MUD functions are
  `ws_broadcast_auction_new`; ids drop the prefix. Mitigation: record the exact
  emitter symbol in the description so Session 02 has an unambiguous mapping.
- **Over-registering**: `request_wholist` is a durisweb-to-MUD request while
  `wholist` is the response stream. Mitigation: one entry, on the response,
  matching what an operator would want to cut.

### Relevant Considerations

- [P00] **MUD source is locally readable**: verify every id against
  `/home/aiwithapex/projects/duris/src/net/ws_handlers.h` and
  `docs/reference/api/durisweb.md` rather than inferring from durisweb.
- [P00] **Contract tests assert on source text**: this session adds no
  assertions to existing contract tests, but Session 07 will assert the registry
  is the sole id source - structure the module so that assertion is possible.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session:
- Unknown hook id lookup returning `undefined` and being treated as enabled
  downstream - the helper must make the absent case explicit
- A registry entry whose `mudPropertyKey` disagrees with what Session 02 writes,
  silently producing a hook that can never be disabled
- Duplicate ids or duplicate `webSettingKey` values passing unnoticed and
  colliding in Session 03's settings table

---

## 9. Testing Strategy

### Unit Tests

- All 14 entries present; exactly 13 toggleable, exactly 1 always-on
- Ids unique; `webSettingKey` unique; `mudPropertyKey` unique among non-null
- Every non-null `mudPropertyKey` matches `durisweb.hook.<id>` exactly
- Terminal entry has both keys null and `alwaysOn: true`
- Every non-terminal entry has a non-null `webSettingKey`
- Channel values are within the union; every channel has at least one hook
- Lookup returns the entry for a known id and `undefined` for an unknown one

### Integration Tests

- None. This module has no I/O and no collaborators yet.

### Manual Testing

- Cross-read the 9 MUD-emitting ids against `ws_handlers.h` and
  `docs/reference/api/durisweb.md`
- Confirm each `owner` path exists in `backend/src/services/`

### Edge Cases

- Unknown id passed to every exported helper
- Empty-string id
- Case-mismatched id (`Auction_New`) must not resolve

---

## 10. Dependencies

### External Libraries

- None. No new dependencies, per CONVENTIONS.md.

### Other Sessions

- **Depends on**: none
- **Depended by**: `phase00-session02-mud-side-toggles-and-state`,
  `phase00-session03-website-toggle-store`,
  `phase00-session06-hook-control-console`,
  `phase00-session07-contract-tests-and-docs`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

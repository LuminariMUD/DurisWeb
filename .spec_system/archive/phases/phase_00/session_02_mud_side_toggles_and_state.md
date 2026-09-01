# Session 02: MUD-side toggles and state reporting

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Status**: Not Started
**Estimated Tasks**: ~20
**Estimated Duration**: 3-4 hours

---

## Objective

Implement MUD_HANDOFF.md changes 1-5 and 8 in the MUD repository, with every
toggle defaulting to enabled so behavior is unchanged on landing.

---

## Scope

### In Scope (MVP)

- Change 1: `durisweb.hook.*` properties in `lib/duris.properties` (9 keys)
- Change 2: `durisweb_hook_enabled()` helper in `src/world/properties.c/.h`
- Change 3: guard each emitter in `src/net/ws_handlers.c`
- Change 4: `durisweb_hook_state` command, authenticated peers only
- Change 5: push state on `properties set` and `properties reload`
- Change 8: update `docs/reference/api/durisweb.md`,
  `docs/operations/CONFIGURATION.md`, `docs/operations/RUNBOOK.md`
- Reconcile MUD_HANDOFF.md status column

### Out of Scope

- TLS inside the MUD (withdrawn - reverse proxy terminates)
- Runtime secret reload (answered - not needed)
- Any website-side consumption (Session 04)
- Game logic

---

## Prerequisites

- [ ] Session 01 complete - hook ids final
- [ ] Ability to build and run the MUD locally

---

## Deliverables

1. MUD changes 1-5 implemented, all toggles defaulting to `1.000`
2. MUD documentation updated (change 8)
3. MUD_HANDOFF.md status column reconciled
4. Recorded answer: production value of `DURISWEB_PRIVATE_PRESENCE`

---

## Success Criteria

- [ ] `properties durisweb` lists all 9 keys at `1.000`
- [ ] Unknown hook id returns enabled; `0.000` returns disabled
- [ ] A disabled hook sends no frame on 4050 - verified by capture, not by
      trusting the website
- [ ] `durisweb_hook_state` returns the documented frame with `schema_version`
- [ ] Unauthenticated descriptors are rejected and closed
- [ ] Toggle change pushes state within 10 seconds
- [ ] Landing this session alone changes no observable behavior

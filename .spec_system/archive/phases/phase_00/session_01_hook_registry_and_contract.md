# Session 01: Hook registry and contract

**Session ID**: `phase00-session01-hook-registry-and-contract`
**Package**: backend
**Status**: Not Started
**Estimated Tasks**: ~16
**Estimated Duration**: 2-3 hours

---

## Objective

Define the single hook contract and build the registry that both repositories
key off, so every later session has one stable vocabulary to work from.

---

## Scope

### In Scope (MVP)

- Enumerate all 13 toggleable streams plus the always-on terminal
- Assign stable `snake_case` hook ids used identically on both ends
- Registry module: id, channel, direction, toggle key, MUD property key,
  always-on flag, owning service
- Document the contract a new hook must satisfy
- Verify every entry against the MUD source and
  `docs/reference/api/durisweb.md`
- Finalize MUD_HANDOFF.md changes 1-5 and 8 against the real ids

### Out of Scope

- Any toggle behavior or enforcement (Sessions 02-03)
- UI (Session 06)
- Changing what any hook carries

---

## Prerequisites

- [ ] PRD.md, PRD_UX.md, and MUD_HANDOFF.md reviewed
- [ ] MUD repo readable at `/home/aiwithapex/projects/duris/`

---

## Deliverables

1. `backend/src/hooks/registry.ts` with all 14 entries and their types
2. Contract documentation for adding a new hook
3. MUD_HANDOFF.md updated with final ids and property keys
4. Unit tests asserting registry completeness and id uniqueness

---

## Success Criteria

- [ ] All 13 toggleable hooks plus terminal are registered
- [ ] `wholist` and `admin_delete_character` are present
- [ ] Terminal is flagged always-on with no toggle key
- [ ] Every MUD-emitted hook maps to a `durisweb.hook.<id>` property key
- [ ] Ids verified against MUD source, not inferred
- [ ] No duplicate ids; registry is the only place ids are defined

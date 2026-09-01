# Session Specification

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Not Started
**Created**: 2026-09-01
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Package Stack**: C / C++

---

## 1. Session Overview

Session 01 fixed the hook vocabulary. This session implements the MUD half of
it: nine `durisweb.hook.*` properties, a guard on every emitter, and a way for
the MUD to tell the website what its toggles are set to.

Everything defaults to enabled. Landing this session alone must change no
observable behaviour - that is the phase's stated risk mitigation for cross-repo
work, and it lets the website side follow later without a coordinated release.

This is the only session whose deliverables live in a different repository. Work
happens on a branch in `/home/aiwithapex/projects/duris/`, is never pushed from
here, and is mirrored back into MUD_HANDOFF.md so the two repositories stay
reconcilable.

---

## 2. Objectives

1. Add nine hook toggle properties defaulting to `1.000`, generated from the
   registry rather than transcribed.
2. Add `durisweb_hook_enabled()` reading through the existing `get_property()`
   in-memory path, defaulting unknown keys to enabled.
3. Guard every MUD-side emitter so a disabled hook produces no frame at source.
4. Add `durisweb_hook_state`, authenticated peers only, and push state on
   change so the website sees a toggle within 10 seconds.
5. Update the MUD's own integration and operations documentation.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-hook-registry-and-contract` - supplies the nine ids,
      property keys, and the `mudSite` field naming each guard location

### Required Tools/Knowledge

- C/C++ toolchain (`g++`, `make`) for a compile check
- cJSON usage as already practised in `ws_handlers.c`
- The existing `properties` command semantics in `src/world/properties.c`

### Environment Requirements

- MUD repo clean, on a working branch, never pushed from this session

---

## 4. Scope

### In Scope (MVP)

- MUD administrator can enable or disable each hook independently on the MUD -
  nine `durisweb.hook.*` keys in `lib/duris.properties`
- MUD administrator can change any toggle without restarting the MUD - reuses
  `properties set`, which is already in-memory and immediate
- The MUD refuses to emit a disabled hook's events rather than emitting them
  for the website to discard - guard at the top of each emitter
- The MUD reports its toggle states over the existing authenticated bridge -
  `durisweb_hook_state` command plus an unsolicited push on change
- MUD documentation updated (`docs/reference/api/durisweb.md`,
  `docs/operations/CONFIGURATION.md`, `docs/operations/RUNBOOK.md`)

### Out of Scope (Deferred)

- TLS inside the MUD - *Reason: withdrawn; a reverse proxy terminates WSS and
  the listener stays loopback-only (PRD Resolved Decision 8)*
- Runtime secret reload - *Reason: answered; secrets are read per-verification
  and a key change lands at next restart (PRD Resolved Decision 6)*
- Website-side consumption of `hook_state` - *Reason: Session 04*
- Game logic of any kind - *Reason: PRD non-goal*

---

## 5. Technical Approach

### Architecture

Properties are the toggle store. `get_property()` is a bsearch over a sorted
in-memory array, so a guard costs a string format plus a binary search - no I/O
on the event path.

`durisweb_hook_enabled(id)` formats `durisweb.hook.<id>`, calls
`get_property(key, 1.0, false)`, and returns `value >= 0.5`. The default of 1.0
and the non-fussy flag together mean a missing key reads as enabled and logs
nothing, so an older `duris.properties` cannot silently disable a live
integration.

Guards go at the top of each emitter, before any cJSON allocation, so a disabled
hook costs nothing and leaks nothing.

`durisweb_hook_state` reuses the authenticated-service path already used by
`durisweb_auth`. State pushes reuse the same serializer, invoked from
`apply_properties()` when a `durisweb.hook.` key changes.

### Design Patterns

- **Fail open on the MUD, fail closed in aggregate**: an unknown MUD property
  reads enabled; the website's resolution engine is what makes the pair
  fail closed. This avoids a missing key disabling a working hook on upgrade.
- **Single serializer**: one function builds the `hook_state` frame for both the
  command response and the push, so the two cannot diverge.

### Technology Stack

- C/C++ as used in `src/net/ws_handlers.c` and `src/world/properties.c`
- cJSON for frame construction

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| none | All changes extend existing files | -- |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/duris.properties` | Nine `durisweb.hook.*` keys at 1.000 | ~12 |
| `src/world/properties.h` | Declare `durisweb_hook_enabled` and the change notifier | ~6 |
| `src/world/properties.c` | Implement the helper; notify on `durisweb.hook.` change | ~40 |
| `src/net/ws_handlers.h` | Declare `ws_cmd_durisweb_hook_state` and the push | ~6 |
| `src/net/ws_handlers.c` | Guard 6 emitters; add command, serializer, push, table entry | ~110 |
| `src/redis/redis_donation_worker.c` | Guard donation application | ~10 |
| `docs/reference/api/durisweb.md` | Document the command, frame, and suppression | ~35 |
| `docs/operations/CONFIGURATION.md` | Document the property family | ~20 |
| `docs/operations/RUNBOOK.md` | Add a disable-a-hook entry | ~15 |
| `.spec_system/PRD/MUD_HANDOFF.md` (durisweb repo) | Status column reconciled | ~10 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Nine `durisweb.hook.*` keys present, all `1.000`
- [ ] Unknown hook id reads as enabled; `0.000` reads as disabled
- [ ] Every one of the nine MUD-gated hooks has a guard at its source
- [ ] `durisweb_hook_state` returns the documented frame with `schema_version`
- [ ] Unauthenticated peers are rejected on `durisweb_hook_state`
- [ ] A toggle change pushes state to authenticated peers
- [ ] Landing this session changes no observable behaviour at defaults

### Testing Requirements

- [ ] Code compiles
- [ ] Manual verification of guard placement against the registry `mudSite`

### Non-Functional Requirements

- [ ] Guard is in-memory only - no disk or DB read on an event path
- [ ] No secrets or personal data introduced into logs

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Matches surrounding C style (tabs, brace placement, naming)

---

## 8. Implementation Notes

### Key Considerations

- `duris.properties` values are floats. Use `>= 0.5` rather than `== 1.0` so
  float round-tripping through `%.3f` cannot silently disable a hook.
- `player_presence` guards **two** emitters. Missing one leaves the website with
  players who never log out.
- `donation_delivery` is guarded in the Redis worker, not `ws_handlers.c`.

### Potential Challenges

- **Building the MUD may be slow or need deps**: mitigate by compiling only the
  touched translation units if a full build is impractical, and say so plainly
  rather than claiming a full build.
- **Existing style is tabs and K&R braces**: match it; do not reformat.

### Relevant Considerations

- [P00] **MUD source is locally readable**: guard locations come from the
  registry's `mudSite` field, verified in-file before editing.
- [P00] **Cross-repo coordination**: defaults preserve behaviour so this can
  land independently.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session:
- A guard placed after payload construction, so a disabled hook still allocates
  and still leaks timing/serialisation work
- `durisweb_hook_state` answering an unauthenticated descriptor, exposing
  configuration to any connected player
- Missing one of the two presence emitters, producing half-disabled presence

---

## 9. Testing Strategy

### Unit Tests

- The MUD has no unit test harness for this layer; verification is a compile
  check plus targeted source review against the registry.

### Integration Tests

- Deferred to Session 07, which tests delivery end to end once the website side
  exists.

### Manual Testing

- Confirm each of the nine guards sits at the top of its emitter
- Confirm the command table entry and the authentication check
- Confirm `duris.properties` parses (all nine keys present, float format)

### Edge Cases

- Missing property key -> enabled
- Value `0.4` -> disabled; `0.5` -> enabled
- Unauthenticated peer sending `durisweb_hook_state`
- Property change for a non-hook key must not trigger a push

---

## 10. Dependencies

### External Libraries

- None added. cJSON is already vendored and used.

### Other Sessions

- **Depends on**: `phase00-session01-hook-registry-and-contract`
- **Depended by**: `phase00-session04-bridge-state-and-transport-security`,
  `phase00-session07-contract-tests-and-docs`

---

## Next Steps

Run `/implement` to begin AI-led implementation.

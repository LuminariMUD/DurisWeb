# 0001. Hook Control Ownership and State

**Status:** Accepted

**Date:** 2026-09-01

## Context

DurisWeb and DurisMUD exchange data/control through five channels with different
owners and trust boundaries. Thirteen integration streams need website control,
but only eight have a MUD emitter or action that can be gated. Five streams are
website-owned, and the terminal must remain available as the incident recovery
path.

The systems also fail differently. A transient failure reading DurisWeb's own
settings should not disconnect every integration, while a missing MUD report
must not be interpreted as permission to run work that the MUD may have disabled.

## Decision

1. Keep one immutable registry of 14 rows: 13 website-toggleable hooks and one
   always-on terminal.
2. Assign a MUD property only to the eight hooks with an actual MUD enforcement
   site. Record the other five as MUD N/A.
3. Compute effective state from applicable owners. Unknown or unavailable
   foreign state is inactive; terminal is always-on but permission-gated.
4. Default an unreadable local website settings store to enabled while logging
   the failure; independent MUD gates continue to apply.
5. Accept MUD state only on an authenticated bridge connection, replace frames
   wholesale, clear on disconnect, and recover from a fresh report.
6. Reconcile fail-closed: disable the website first; enable the MUD first and
   the website last. Do not treat an acknowledgement as observed state.

## Consequences

- Ownership is truthful rather than forced into a uniform but false two-ended
  model.
- A database settings read failure preserves existing integrations, while an
  absent foreign report cannot activate one.
- Registry-generated tests cover all website gates, and exact cross-repository
  tests pin all eight MUD ids and five intentional N/A rows.
- Terminal availability remains operationally valuable but depends entirely on
  its stronger authorization and host sandbox boundaries.
- Future hooks must update registry, owner gates, tests, MUD documentation, and
  handoff status together.

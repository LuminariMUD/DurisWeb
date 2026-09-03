# Quarantined legacy item disposition

Decision date: 2026-09-04

## Decision

The 38,257 legacy player and locker item payload rows excluded by the
`legacy-target-wins-v1` import remain quarantined and are not eligible for bulk
activation. This is the final disposition for that import. No row may be copied,
reattached, renumbered, or inferred from a colliding numeric UID merely to
increase recovered counts.

This decision covers 13,246 player-item rows and 25,011 locker-item rows. The
reported duplicate-UID, artifact-vnum, and container-ancestry counts are
overlapping evidence dimensions, not mutually exclusive row classes. Because
the retained aggregate report cannot establish a unique owner and complete
lossless graph for every excluded row, the mutually exclusive disposition is:

| Disposition | Rows | Production action |
| --- | ---: | --- |
| Unproven legacy payload graph | 38,257 | Permanently excluded from the completed import |

"Permanently excluded" describes this import transaction. It does not authorize
deletion of the source evidence or prevent a future, separately approved
forensic recovery for a specifically proven graph.

## Why bulk recovery is rejected

- Legacy UID collisions do not establish item identity or ownership.
- Artifact vnums require current-world authority and cannot be restored as
  ordinary inventory.
- A child whose ancestry reaches excluded or cross-owner evidence cannot be
  safely attached in isolation.
- A correct recovery would have to update payload, metadata, parent/root,
  current-owner, opening-baseline, owner-revision, allocator, and ledger state
  as one MUD-authoritative operation. DurisWeb does not own that operation.
- The accepted production rows already pass uniqueness, topology, artifact,
  allocator, and declared-foreign-key checks. They must not be rewritten to
  recover ambiguous source material.

## Evidence retention

Keep the owner-only original dump, qualified stage, import report, and raw
description archives through at least 2027-03-03. At that date an authorized
operator must make and record a security/retention review; there is no automatic
deletion. Any earlier deletion or any retention beyond the reviewed period must
follow the project's protected-data policy and preserve the aggregate import
journal. Row-level UIDs, owners, descriptions, and account/player identifiers
must never enter Git, CI output, routine logs, or public issue discussion.

## Player support policy

DurisWeb must not promise automatic restoration or display quarantined payloads.
A player reporting missing legacy inventory may open a normal private support
request. Staff may compare the claim with protected evidence, but may not use a
numeric UID collision as proof. Any item restoration or compensation requires a
new, explicit MUD-authorized decision, current-world artifact review, a tested
backup, writer quiescence, and an auditable MUD-side transaction. Closing the
import disposition does not grant that authority.

## Future exception gate

A future recovery proposal must be scoped to a uniquely proven item graph and
must start as a separate tracked change. Before production mutation it must:

1. Prove a unique active owner, complete acyclic same-owner ancestry,
   non-artifact eligibility, and lossless metadata mapping from protected
   evidence.
2. Rehearse against a fresh production clone plus the qualified legacy stage.
3. Allocate fresh UIDs monotonically above the live allocator and preserve every
   existing production/imported row byte-for-byte.
4. Pass item uniqueness, topology, artifact, allocator, ownership ledger,
   baseline/revision, and dynamic foreign-key verification.
5. Obtain explicit operator authorization, a validated backup, writer
   quiescence, and a targeted rollback plan.

Until all five gates are satisfied, the only permitted state is retained,
inactive quarantine.

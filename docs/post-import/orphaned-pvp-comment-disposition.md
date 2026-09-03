# Orphaned legacy PvP comment disposition

Decision date: 2026-09-04

## Decision

The 37 legacy PvP comments whose referenced PK events are absent from the
qualified source remain outside production. They are a protected archival class
and a permanent skip from the completed `legacy-target-wins-v1` import.

The source rows remain only in the owner-controlled original dump and qualified
stage. DurisWeb must not attach them to a current or imported event based on a
numeric event ID, timestamps alone, similar participants, or comment text. No
placeholder event will be synthesized to make the comments render.

| Class | Rows | Production disposition | Evidence disposition |
| --- | ---: | --- | --- |
| Comment with absent source PK-event parent | 37 | Permanent import skip | Protected archive |

This resolves the import disposition without claiming that the historical
content never existed. "Permanent import skip" means the completed import will
not be reopened or patched in place. A later recovery of a complete historical
graph would be a new, separately authorized import.

## Preserved accepted policy

The two legacy comments whose battle parents survived remain valid accepted
examples. When their account-level authorship and event were proven but an
optional participant pointer was not, the importer preserved the comment and
cleared only that pointer. This rule may be reused only after the parent event
itself is semantically proven; it cannot rescue any of the 37 orphaned rows.

## Privacy and retention

Keep the owner-only original dump and qualified stage containing the 37 rows
through at least 2027-03-03. At that date an authorized operator must record a
security/retention review; there is no automatic deletion or publication. The
review may retain or securely retire the protected source according to the
project's data policy, but the aggregate journal and this disposition remain.

Comment text, author/account names, character or participant pointers, event
IDs, and row IDs must not be copied into Git, CI output, logs, tickets, or a
player-visible orphan archive. The protected source, not a new ad hoc export,
is the forensic record.

## Future recovery gate

A retained backup discovered later does not automatically reverse this
decision. A new tracked recovery may be proposed only when it can prove the
complete event graph without relying on colliding surrogate IDs. Before any
production mutation it must:

1. Prove one unambiguous source event, its chronological boundary, and all
   required participant relationships from an approved protected backup.
2. Validate account attribution and clear only optional character/participant
   pointers that cannot be proven.
3. Rehearse event, participant, and comment insertion together against a fresh
   production clone, allocating fresh surrogate IDs inside one transaction.
4. Prove referential integrity, event counters, API rendering, authorization,
   chronological separation, and repeat-execution idempotence.
5. Obtain explicit operator approval, a validated backup, writer coordination,
   and targeted rollback evidence.

Unless every gate passes, archival skip remains the only allowed disposition.

## User-facing behavior

The comments are not available on the current PvP timeline and are not eligible
for manual reattachment through DurisWeb. No public placeholder or unexplained
empty thread should be created. A historical-content inquiry can be handled
privately, but support staff must not reveal protected content or infer an event
relationship from its old ID.

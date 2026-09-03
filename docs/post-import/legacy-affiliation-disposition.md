# Legacy affiliation disposition

Decision date: 2026-09-04

## Decision

The 176 imported nonzero association IDs and 190 imported nonzero guild-status
bitsets normalized to zero by `legacy-target-wins-v1` remain zero. They are
retired legacy signals, not pending identifiers to be mapped automatically.

Current production associations, guild definitions, `guild_members`, and
`guild_ranks` remain authoritative. A legacy numeric association ID, bit
position, name resemblance, or historical membership claim cannot by itself
grant current membership, rank, forum visibility, administrative capability, or
profile affiliation.

| Legacy field | Affected accepted rows | Final import disposition |
| --- | ---: | --- |
| Nonzero association ID | 176 | Keep normalized to zero |
| Nonzero guild-status bitset | 190 | Keep normalized to zero |

These are field-level counts and may describe some of the same characters. They
must not be added together as a unique-player count.

## Authority and product behavior

- `player_data.assoc_id` may identify a current association only when set by a
  current MUD-authoritative membership operation.
- Current `guild_members` and rank state win every disagreement with retained
  legacy evidence.
- Forum guild ACLs, profile/guild display, and administrative permissions must
  continue to derive from current authoritative data. The legacy normalized
  values are never an alternate entitlement source.
- DurisWeb must not recreate world definitions, assign a guild, infer a rank, or
  edit the separate MUD repository as part of this disposition.

## Returning-player path

A returning player who expects an affiliation must use the current guild or
association admission process, or a private staff-support review when that
process is unavailable. Staff may consult protected legacy evidence as context,
but current guild authority must approve any membership or rank. Re-admission is
a new current-world decision; it is not a replay of the zeroed numeric value.

Any approved change must be performed through the MUD-authoritative workflow so
runtime state, `guild_members`, ranks, caches, forum ACLs, and profile display
remain consistent. A direct DurisWeb SQL update is not an approved recovery
path.

## Future exception gate

This decision may be revisited only for a specifically identified character in
a separate, access-controlled review. A proposed exception must establish all
of the following from protected semantic evidence:

1. A unique canonical legacy and current guild/association identity based on
   names, world definitions, membership history, and current authority, never
   numeric equality alone.
2. No conflicting current membership, rank, association, or target-world rule.
3. Explicit current guild/association authority approval for the resulting
   membership and rank.
4. Clone rehearsal covering MUD runtime loading, `guild_members`, profile/guild
   display, forum ACLs, and administrative permissions.
5. A validated backup, writer coordination, one targeted MUD-authoritative
   transaction, repeat-execution safety, and rollback evidence.

Without all five, the normalized zero is the correct permanent import state.

## Privacy and evidence

Character, account, guild, association, and row identifiers remain only in
protected operator artifacts. Routine diagnostics, CI, Git commits, pull
requests, and issue comments may contain aggregate counts and decisions only.

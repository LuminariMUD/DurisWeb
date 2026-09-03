# Combat frag baseline repair

The checked-in aggregate verifier covers every active account-mapped character
and all three required opening baselines:

```bash
pnpm --dir backend verify:combat-baselines
```

It prints counts only. It never returns a PID, account, character, current frag
total, or proposed opening value. Any nonzero missing or inconsistent count
fails the command.

This is a narrow combat-data readiness gate, not a general DurisWeb startup
preflight. Blocking unrelated web recovery on a pre-existing MUD-owned
reconciliation gap would not repair the gap. Run the verifier when accepting a
new character, before and after a combat-data release or repair, and in the
production acceptance matrix.

## Authoritative reconstruction

For a still-missing combat baseline, the immutable combat ledger can prove an
opening boundary only when its revisions are unique and contiguous through the
character's current `frag_revision`, and every recorded `frags_after` agrees
with the later deltas and current frag total. Under those conditions:

- `opening_revision = current frag_revision - ledger row count`
- `opening_frags = current frags - sum of ledger deltas`

A character with no combat-ledger rows is reconstructable at its current frags
and revision. Any gap, duplicate, non-terminal latest revision, or result drift
is ambiguous and must not be backfilled from a guess. The verifier reports only
the aggregate reconstructable/ambiguous split.

## Protected repair sequence

DurisWeb does not own writes to `combat_frag_baseline`, `combat_frag_ledger`, or
`player_data.frag_revision`. The repair must therefore be implemented or
approved by the MUD authority rather than as a web migration or direct web SQL
update.

1. At an approved writer-quiesced boundary, store affected PIDs and derived
   values only in a mode-0600 operator artifact.
2. Restore a fresh production backup into an isolated matching clone.
3. Re-run the aggregate verifier and prove every missing row is
   ledger-reconstructable. Stop on any ambiguous row.
4. In one reviewed transaction, lock the selected `player_data` and combat
   ledger rows, re-check the derivation, and insert only baselines still absent.
   Use a plain insert with a missing-row predicate; never replace or update an
   existing baseline.
5. Prove imported and previously valid baseline rows are byte-for-byte
   unchanged. Run combat, wallet, epic, dynamic foreign-key, schema, and MUD
   runtime verification on the clone.
6. Take and restore-test the production backup, obtain explicit authorization,
   repeat the targeted transaction while writers remain quiesced, and run the
   same postflight checks.

The issue is not resolved by a reconstructable count. Closure requires the
post-repair verifier to report zero missing combat, wallet, or epic baselines
and zero baseline/ledger mismatches.

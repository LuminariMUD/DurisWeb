# Pre-existing item topology repair

The 14 pre-existing production topology mismatches must first be classified at
an approved quiesced save boundary. The row-level working set stays in a
mode-0600 operator artifact. DurisWeb accepts only its aggregate attestation:

```bash
pnpm --dir backend verify:item-topology-attestation -- \
  --input /protected/operator/path/item-topology-attestation.json
```

The version-1 attestation assigns every mismatch exactly once to payload
parent/root, current owner, owner context, vnum, state, revision, a documented
allowed transition, or unclassified. It fails unless all 14 are classified,
imported items still contribute zero mismatches, and all preservation checks
remain zero. Version 1 intentionally accepts no allowed transition at a
quiesced boundary; proving one requires a reviewed contract version rather than
silently subtracting it from the total.

After a repair, the same command requires zero remaining topology categories,
zero imported mismatch, and zero collateral payload/history, UID, allocator, or
foreign-key drift.

## Classification input

The aggregate JSON has this exact shape:

```json
{
  "schemaVersion": 1,
  "boundary": "quiesced",
  "phase": "classification",
  "evidenceId": "opaque-save-evidence-0001",
  "expectedPreexistingMismatches": 14,
  "importedMismatches": 0,
  "payloadParentOrRoot": 14,
  "currentOwner": 0,
  "ownerContext": 0,
  "vnum": 0,
  "state": 0,
  "revision": 0,
  "documentedAllowedTransition": 0,
  "unclassified": 0,
  "unaffectedPayloadChanges": 0,
  "ownershipHistoryChanges": 0,
  "uidUniquenessViolations": 0,
  "allocatorViolations": 0,
  "foreignKeyOrphans": 0
}
```

The trusted producer is the official MUD topology/reconciliation checker, not a
DurisWeb query that redefines MUD ownership. Its protected evidence must retain
the item UID and category for operator investigation but emit only these counts
to this verifier.

## Repair sequence

1. Approve the maintenance boundary, perform a clean MUD save, and stop all item
   writers. Local web health is not evidence of quiescence.
2. Run the official checker and produce the protected classification plus this
   aggregate attestation. Stop if any row is unclassified.
3. Restore a fresh production backup and the frozen reference into isolated
   matching clones. Prove all 14 rows match the pre-import reference and no
   imported row appears in the mismatch set.
4. Rehearse only the repair supported by each classified cause. For parent/root
   drift, the MUD repair must prove a complete acyclic same-owner graph. Owner,
   vnum, state, or revision conflicts require their owning MUD reconciliation;
   they must not be rewritten as nesting.
5. Never regenerate UIDs, replace/delete payloads, disable foreign keys, or
   rewrite ownership history. Preserve every unaffected payload and ledger row
   byte-for-byte.
6. After rehearsal, produce a `post-repair` attestation and run item topology,
   allocator, ownership-ledger, currency/artifact, schema, runtime, and dynamic
   foreign-key checks.
7. Only after backup validation and explicit authorization may the identical
   targeted transaction run while production writers remain quiesced. Repeat
   the complete postflight and retain rollback evidence.

Classification alone does not close the defect. Closure requires a passing
`healthy-post-repair` attestation from the production quiesced boundary.

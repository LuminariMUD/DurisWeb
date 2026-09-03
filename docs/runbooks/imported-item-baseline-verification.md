# Imported item baseline verification

This verifier is the aggregate-only completion gate for the 68,284 ownership
baselines accepted by `legacy-target-wins-v1`. It does not discover or print
row identifiers. The authoritative MUD-side observer must create a protected
JSON observation from the same cohort at a declared live or quiesced boundary.

Run it from the repository root:

```bash
pnpm --dir backend verify:imported-item-baselines -- \
  --input /protected/operator/path/item-baseline-observation.json
```

The input must be an owner-owned, non-symlink regular file with mode `0600` and
exactly these schema-version-1 fields:

```json
{
  "schemaVersion": 1,
  "importId": "legacy-target-wins-v1",
  "boundary": "quiesced",
  "evidenceId": "opaque-save-evidence-0001",
  "importedBaselines": 68284,
  "persistedPayloads": 68284,
  "authoritativelyInMemory": 0,
  "explicitlyTransferredOrRetired": 0,
  "quarantined": 0,
  "invalid": 0,
  "unclassified": 0,
  "currentOwnerMismatches": 0,
  "vnumMismatches": 0,
  "revisionRegressions": 0,
  "zeroPayloadUids": 0,
  "duplicatePayloadUidExcess": 0,
  "unsafeAllocatorRows": 0
}
```

The classifications must total exactly 68,284. Live observations may classify
a payload as `authoritativelyInMemory` only when the MUD runtime supplies that
authority. A quiesced observation rejects every in-memory classification.
Invalid or unclassified baselines, owner/vnum/revision drift, zero/duplicate
payload UIDs, or an unsafe allocator make the command fail without identifying
the affected row.

## Quiesced acceptance

1. Obtain approval for the maintenance boundary and record the opaque evidence
   ID in the protected operator journal.
2. Complete the MUD's clean save and stop all item writers. Do not infer
   quiescence from DurisWeb health or a read-only SQL transaction.
3. Have the MUD-owned observer classify the complete imported cohort against
   player, locker, and pet payloads, current custody, ledger/revision state,
   quarantine, and the allocator. Keep its row-level working set protected.
4. Run this verifier on the aggregate observation. A successful
   `healthy-quiesced` result is required before classifying the previously
   missing live payload as an expected lifecycle transition.
5. If one row remains invalid or unclassified, retain the protected evidence
   and investigate its payload and ownership history. Do not synthesize,
   delete, renumber, or replace data to make the aggregate pass.

This command validates the privacy-preserving attestation; it deliberately does
not stop the MUD, query runtime memory, or mutate production.

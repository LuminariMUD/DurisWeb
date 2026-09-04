# Pre-existing item topology repair

The 14 pre-existing production topology mismatches must first be classified at
an approved quiesced save boundary. Row-level evidence stays in a protected
operator artifact. DurisWeb accepts only an immutable statement signed by the
official checker:

```bash
pnpm --dir backend verify:item-topology-attestation -- \
  --input /protected/operator/path/item-topology-attestation.json \
  --snapshot-id sha256:<approved-snapshot-digest> \
  --quiescence-evidence-id sha256:<approved-writer-stop-evidence-digest>
```

`ITEM_TOPOLOGY_CHECKER_PUBLIC_KEY` must contain the approved checker's Ed25519
SPKI public key in PEM form. Provision it through the locked operator profile;
do not accept a public key delivered with the evidence. The signing private key
must never be present on the web host.

The version-2 verifier authenticates the exact checker-produced statement,
binds it to SHA-256 identities for the quiesced snapshot and its writer-stop
evidence, and requires both to match the independently approved identifiers on
the command line. Never copy those expected identifiers from the attestation
being verified. This prevents a valid older statement from being replayed for
the current repair. The verifier derives every aggregate from signed per-row
classifications. It rejects duplicate evidence hashes, overlapping
classifications, imported rows, unclassified rows, caller-supplied aggregate
fields, and preservation drift. Version 2 intentionally accepts no allowed
transition at a quiesced boundary; proving one requires a reviewed contract
version.

After a repair, a separately signed `post-repair` statement must contain zero
row classifications and zero collateral payload/history, UID, allocator, or
foreign-key drift.

## Signed evidence contract

The protected JSON file is an exact envelope:

```json
{
  "schemaVersion": 2,
  "signatureAlgorithm": "Ed25519",
  "signedStatement": "<unpadded-base64url-of-the-exact-UTF-8-statement>",
  "signature": "<unpadded-base64url-Ed25519-signature>"
}
```

After base64url decoding, `signedStatement` has this exact shape:

```json
{
  "schemaVersion": 2,
  "checkerId": "durismud-item-topology-checker",
  "checkerVersion": "1.0.0",
  "boundary": "quiesced",
  "phase": "classification",
  "evidenceId": "opaque-save-evidence-0001",
  "snapshotId": "sha256:<64-lowercase-hex-characters>",
  "quiescenceEvidenceId": "sha256:<64-lowercase-hex-characters>",
  "rowClassifications": [
    {
      "rowEvidenceHash": "sha256:<64-lowercase-hex-characters>",
      "origin": "pre-existing",
      "category": "payloadParentOrRoot"
    }
  ],
  "invariantChecks": {
    "unaffectedPayloadChanges": 0,
    "ownershipHistoryChanges": 0,
    "uidUniquenessViolations": 0,
    "allocatorViolations": 0,
    "foreignKeyOrphans": 0
  }
}
```

The classification statement must contain exactly 14 unique rows. Each
`rowEvidenceHash` is the SHA-256 commitment to one private canonical evidence
record containing the snapshot ID, item UID, observed topology, expected
topology, origin, and exactly one category. The private records and the signed
statement are produced together by the official checker. The supported
categories are `payloadParentOrRoot`, `currentOwner`, `ownerContext`, `vnum`,
`state`, `revision`, `documentedAllowedTransition`, and `unclassified`.

The checker signs the exact bytes placed in `signedStatement`; reserialization
after signing invalidates the signature. The verifier never prints snapshot or
row evidence hashes.

## Repair sequence

1. Approve the maintenance boundary, perform a clean MUD save, and stop all item
   writers. Record the independently derived snapshot and writer-stop evidence
   digests for the verifier arguments. Local web health is not evidence of
   quiescence.
2. Run the official checker. It must hash the frozen snapshot and writer-stop
   evidence, build one private canonical evidence record per mismatch, include
   each record's hash once in the statement, then sign those exact statement
   bytes. Stop if any row is unclassified.
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
6. After rehearsal, produce and sign a new `post-repair` statement and run item
   topology, allocator, ownership-ledger, currency/artifact, schema, runtime,
   and dynamic foreign-key checks.
7. Only after backup validation and explicit authorization may the identical
   targeted transaction run while production writers remain quiesced. Repeat
   the complete postflight and retain the signed statement, private evidence,
   signer identity, and rollback evidence.

Classification alone does not close the defect. Closure requires a passing
`healthy-post-repair` attestation from the production quiesced boundary.

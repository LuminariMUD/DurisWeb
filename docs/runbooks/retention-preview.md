# Read-only retention preview

`pnpm --dir backend retention:preview` reports proposed age counts for
`analytics_events` (`page_views`, 30 days) and `login_history`
(`account_login_history`, 90 days). These are the unapproved proposals in the
[lifecycle inventory](../privacy-data-lifecycle.md#concrete-decisions-still-required),
version `2026-10-17-draft-1`. The command has no deletion implementation, policy
override or scheduled job. `execute` is refused. A preview cannot enable optional
analytics or satisfy retention/erasure acceptance.

Counts can include records that an eventual hold, request or exception would
protect. Those checks are not implemented here. No record is declared eligible
for deletion. Sessions, visitor-session relationships, audit/choice/delivery
evidence, archives/imports, MUD-owned data and all other classes are excluded.
Legacy `server_health_metrics.recorded_at` is a naive DATETIME without proven
UTC provenance, so it is excluded rather than converted by assumption.

## Run against an explicitly selected target

Read the checkout's configured environment and non-secret database endpoint
first, following [deployment target checks](../deployment.md#rehearse-database-changes).
Use the actual configured `host:port/database`; a mismatch fails before connecting.
This source was qualified only against disposable synthetic data. An operator
must have authority to inspect the selected environment. Keep credentials in
the existing backend configuration and use a dedicated SELECT-only identity
for the two preview tables where available. No MUD/Redis/provider connection
is needed by this command.

From the repository root, replace the example target and evidence path:

```bash
pnpm --dir backend retention:preview \
  --target 'configured-host:port/database' \
  --policy-version 2026-10-17-draft-1 \
  --checkpoint-out '/operator-private-evidence/preview-1.json'
```

The default is `dry-run`; that word can also precede the flags. Optional bounds
are `--batch-size` (default 100, maximum 500), `--max-candidates` (default 1000,
maximum 10000 per invocation) and `--time-budget-ms` (default 2000, maximum
10000). `--class analytics_events` or `--class login_history` restricts scope;
the default selects both, in that order. Unknown or duplicate flags/classes,
missing target/version, stale versions and invalid limits fail closed. `--help`
prints usage without connecting.

Each dedicated connection verifies the selected tables' exact source-owned
metadata, sets the next transaction to repeatable read and starts a consistent,
read-only snapshot. The database supplies one epoch for the run. Proposed
cutoffs use that epoch minus the proposed age; a timestamp exactly at the cutoff
is retained. Null/zero timestamps are excluded. The existing time indexes and
primary-key ordering support keyset pages; no OFFSET or unbounded COUNT is used.
Only IDs and epochs enter process memory, never account/IP/content/URL columns.
The driver keeps its normal metadata representation; selected cursor IDs are
explicit SQL strings so BIGINT precision is preserved without relaxing schema
checks.

The scan budget is monotonic and soft: it stops starting new pages after the
budget, while an in-flight query can finish later. Source/schema verification
precedes that scan budget. Every SQL operation has a five-second client timeout.
The connection is always destroyed; no pooled session or caller transaction is
reused. Data is never written, and read transactions end with rollback.

## Continue and interpret a bounded result

JSON output contains an operation ID, policy/version approval status, captured
epoch, per-class proposed cutoff, cumulative age-candidate counts, this-batch
count, scan completion and exclusions. It contains no cursor IDs or row data.
`complete: false` is a bounded partial observation, not a full count; inspect
`checkpointSaved`. Without an output checkpoint a later invocation starts over.
Even `complete: true` covers only the selected known-time age range within its
captured ID high water, not all website data or eligibility for deletion.

For the next page, retain the same target, policy and class order and choose a
new output filename:

```bash
pnpm --dir backend retention:preview \
  --target 'configured-host:port/database' \
  --policy-version 2026-10-17-draft-1 \
  --resume '/operator-private-evidence/preview-1.json' \
  --checkpoint-out '/operator-private-evidence/preview-2.json'
```

The checkpoint fixes the run ID, target hash, policy/rule signature, database
cutoff, per-class high-water IDs, cursors and cumulative counts. It is restricted
operational metadata: IDs can be linked back to records by an authorized
database user. Keep files outside Git in an operator-private directory. Files
are new-only, mode 0600, bounded to 16 KiB, and fsynced before success. Existing
files are never overwritten. Reads reject shared permissions, a different
owner, hard links, symlinks, non-regular/oversized files and invalid state.
Private checkpoint operations require POSIX ownership/no-follow support;
platforms without it can run a preview without saving/resuming a checkpoint.
The checkpoint format is validation, not a cryptographic signature or deletion
capability. Do not hand-edit a report to justify mutation.

A resumed invocation opens a fresh snapshot. Inserts above the captured ID
high water are excluded; concurrent deletes or timestamp edits can change
observations across invocations. The counts are an operator preview, not a
long-lived database snapshot, deletion plan or promise about current records.
Rule/target changes, future checkpoint clocks and schema drift refuse resume.

Failures print a static category and local reference, without raw database
errors, bindings or input contents. An unsuccessful scan produces no replacement
checkpoint; retain the last valid file and retry after diagnosis. An output-file
failure may leave an incomplete private file: preserve it separately if needed
and choose a new filename, never force overwrite. No source-defined retention
period for these private reports/checkpoints is approved yet; handle them as
restricted operational evidence pending that decision.

## Remaining retention work

Approved policies, protected holds and request coordination, a mutation engine
with durable ownership/checkpoints and eligibility rechecks, FK-safe disposal,
caches/objects/logs/provider handling, and protected backup/restore replay remain
separate required work in [P6/P7](../ongoing-projects/plan.md#p6--retention-enforcement-and-restore-handling-11).
This command installs no scheduler and grants no permission to delete data.

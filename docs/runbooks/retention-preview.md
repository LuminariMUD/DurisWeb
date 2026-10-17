# Read-only retention preview

`pnpm --dir backend retention:preview` reports proposed age counts for
`analytics_events` (`page_views`, 30 days) and `login_history`
(`account_login_history`, 90 days). These are the unapproved proposals in the
[lifecycle inventory](../privacy-data-lifecycle.md#concrete-decisions-still-required),
version `2026-10-17-draft-1`. The command has no deletion implementation, policy
override or scheduled job. `execute` is refused. A preview cannot enable optional
analytics or satisfy retention/erasure acceptance.

The preview evaluates recorded holds in its read snapshot and reports held and
unheld age counts separately. Other exceptions and pending subject requests are
not evaluated. An unheld age observation is not approval or eligibility for
deletion. Sessions, visitor-session relationships, audit/choice/delivery
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
for the two preview tables and `web_data_holds` where available. Exact schema
metadata must also be visible. In the qualified MariaDB 11.8.9 fixture,
table-level SELECT hid CHECK clauses; database-level `SHOW VIEW` made them
visible without granting data writes. MySQL's table-level reader needed no
additional metadata privilege. See [MariaDB privilege levels](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant).
Do not skip schema checks or silently broaden permissions: the CLI grants
nothing, and insufficient metadata visibility fails `schema_unverified`.
No MUD/Redis/provider connection
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
Candidate queries return only IDs, epochs and a hold flag, never account/IP/
content/URL columns. Account holds match the candidate's account inside SQL with
the reviewed database collation, including case/accent aliases; a null account
does not match an account scope. Global/class holds still cover null-account
rows. IPs and visitor identifiers are never used to infer account ownership.
The shared hold validator reads at most 1,001 unreleased hold records privately;
unknown/invalid state or more than 1,000 records (including expired intents still
awaiting closeout) refuses the preview. It never trims the ledger to fit.
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
epoch, hold observation epoch/count, per-class proposed cutoff, cumulative age,
held and unheld counts, this-batch count, scan completion and exclusions.
`activeHoldsObserved` counts active records in the validated ledger, not holds
applicable to every candidate. `eligibilityChecks: holds_only` and
`executionAvailable: false` preserve the incomplete enforcement boundary.
Reasons, approvers, account scope, cursor IDs and fingerprints are not output.
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

The version-2 checkpoint fixes the run ID, target hash, policy/rule signature,
database cutoff, active-protection fingerprint, per-class high-water IDs,
cursors and cumulative age/held counts. Version-1 files are refused; start a
fresh preview and retain old evidence privately. It is restricted
operational metadata: IDs can be linked back to records by an authorized
database user. Keep files outside Git in an operator-private directory. Files
are new-only, mode 0600, bounded to 16 KiB, and fsynced before success. Existing
files are never overwritten. Reads reject shared permissions, a different
owner, hard links, symlinks, non-regular/oversized files and invalid state.
Private checkpoint operations require POSIX ownership/no-follow support;
platforms without it can run a preview without saving/resuming a checkpoint.
The checkpoint format is validation, not a cryptographic signature or deletion
capability. Do not hand-edit a report to justify mutation.

A resumed invocation opens a fresh snapshot and revalidates protection before
scanning. A new active hold, release of an active hold, or changed scope/expiry
invalidates continuation (`checkpoint_holds_changed`). Natural expiry also
changes active protection. Start a fresh preview when this occurs.
The fingerprint covers active protection, not an authorization to delete.
Unreleased records are validated even when expired; private closeout preserves
their history. Inserts above the captured ID
high water are excluded; concurrent deletes or timestamp edits can change
observations across invocations. The counts are an operator preview, not a
long-lived database snapshot, deletion plan or promise about current records.
Rule/target changes, future checkpoint clocks, unreadable/invalid/over-limit
protection and schema drift refuse resume. Hold changes committed during an
invocation are outside its existing read snapshot; the next invocation observes
them. A mutation engine must recheck current protection at commit rather than
trusting this preview or checkpoint.

Failures print a static category and local reference, without raw database
errors, bindings or input contents. An unsuccessful scan produces no replacement
checkpoint; retain the last valid file and retry after diagnosis. An output-file
failure may leave an incomplete private file: preserve it separately if needed
and choose a new filename, never force overwrite. No source-defined retention
period for these private reports/checkpoints is approved yet; handle them as
restricted operational evidence pending that decision.

## Remaining retention work

The canonical `pnpm --dir backend retention` also defaults to this preview.
Its separate [gated SQL execution](retention-execution.md) prepares durable
ownership/progress, current-hold/eligibility rechecks and retired analytics-cache
cleanup for these two classes. Approval/enablement and both class approvals
remain false; preview files cannot authorize execution. The shared selector
signature has changed, so older version-2 checkpoints may also require a fresh
preview (`checkpoint_rules_changed`); retain old evidence privately.

Approved policies, other protected classes and request coordination,
objects/logs/provider handling, and protected backup/restore replay remain
separate required work in [P6/P7](../ongoing-projects/plan.md#p6--retention-enforcement-and-restore-handling-11).
This command installs no scheduler and grants no permission to delete data.

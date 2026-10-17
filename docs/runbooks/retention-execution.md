# Gated SQL retention

`pnpm --dir backend retention` defaults to the existing
[read-only preview](retention-preview.md). The prepared source has policy approval,
execution enablement and both class approvals **false**, with no approval
reference. Execution refuses before configuration/connection I/O. Command-line,
environment, browser choices and preview checkpoints cannot approve deletion.
The proposed 30-day analytics-event and 90-day login-history periods remain
unapproved. Isolated tests use a synthetic approved policy inside Jest only;
the actual CLI is tested refusing that operation.

The implementation prepares two explicit handlers, `analytics_events`
(`page_views`) and `login_history` (`account_login_history`). Every other class,
including MUD data, pending audit/delivery/request evidence, protected imports,
financial data, session credentials and the lifecycle ledgers, remains excluded.
This is not complete erasure, backup/restore protection or approved live retention.
There is no scheduler or HTTP execution endpoint.

## Approval and release prerequisites

A named owner must approve the purpose, period, exceptions and relevant notice
before a reviewed source change records the approval reference, enables execution
and approves each selected class. Keep the current flags false until that work,
the remaining P6/P7 integration and deployment acceptance are complete. An
enabled class does not approve another class. No runtime override is provided.

Rehearse the exact release against an isolated restored clone, preserve protected
recovery evidence and stop/drain all old website writers before the authorized
forward migration/cutover. Deploy the cache retirement everywhere before any
execution is enabled: historical analytics readers now use SQL directly, and
both router mounts send `Cache-Control: no-store`. An old backend must not keep
writing legacy analytics cache keys. Redis TTL is not removal evidence.

The actual configured SQL and cache endpoints must both be inspected and
explicitly confirmed. The run binds to SQL target plus Redis host/port/database,
configured cache username/transport and the fixed analytics namespace. A changed
identity cannot silently finish removal from a different store. The CLI does not
print credentials, grant permissions or modify deployment settings.

## Start or resume an authorized run

The following is a procedure template, not authorization. It is refused by the
current source. From the repository root, replace every example value:

```bash
pnpm --dir backend retention execute \
  --target 'configured-db-host:port/database' \
  --cache-target 'configured-cache-host:port/database-number' \
  --policy-version 'reviewed-policy-version' \
  --run-id '7a2e1940-0b23-466f-8f64-82d15aa69ef6' \
  --class analytics_events,login_history \
  --batch-size 100 --max-candidates 1000 --time-budget-ms 2000
```

Use a fresh lowercase UUID v4 for a new operation and preserve it with the private
release evidence. Reuse that UUID, target identity, policy and exact class order
to resume bounded work or recover an uncertain acknowledgement. Bounds may
change on resume: batch size is 1–500, invocation candidates 1–10,000 and the
soft monotonic time budget 1–10,000 ms. No preview-file resume/output flag is
accepted for execution. A new operation captures a database epoch and per-class
ID high water; subsequent invocations retain them and their UTC cutoffs.

Every dedicated worker connection sets its own session timezone to UTC before
reading or deleting candidates. Indexed timestamp predicates retain their range
access while repeated daylight-saving hours become unambiguous. Application-pool
and global timezone settings are untouched. This contract is part of the rule
signature. A run recorded by the earlier implicit-timezone implementation is
refused as `run_identity_conflict`; preserve its progress/evidence and review
current data before starting a new operation ID. Never overwrite stored rule
hashes or progress to bypass that refusal.

`web_retention_runs` atomically records cursor and aggregate actions with every
committed batch. It contains policy/rule/target identities and private cursor
metadata, never row payloads, accounts, IPs, URLs or credentials. A lost commit
acknowledgement can report failure even though the batch committed; retry the
same operation rather than creating unrelated work. A failed checkpoint rolls
back its data changes. Committed removal has no automatic data-restoration
rollback. An old/unknown policy, target, signature or malformed progress is
refused without rewriting history.

## Holds, ownership and eligibility

The reserved `retention-control-v1:state` settings row is not exposed through
generic settings. A worker claims a 30-second expiring lease with an opaque
owner/run identity. Every batch checks its token/expiry and renews ownership.
Control row locking prevents a successor from taking ownership during a SQL
transaction; an expired prior worker cannot change a successor's lease or data.
Lease cleanup failures report uncertainty; disconnect/expiry permits recovery.

Hold creation/release locks this same row before touching hold records.
Acknowledged protection therefore orders before a later deletion transaction.
A request arriving after deletion owns that lock waits and acknowledges only
after the earlier operation commits; it cannot recall completed work. A hold
acknowledged after dry-run is rechecked by execution. Expiry/global/class/account/
account-class semantics and database account collation match the preview.
Unknown/invalid or excessive unreleased protection stops mutation.

Each batch uses a fresh transaction on a dedicated connection with committed
reads and explicit row locks. Metadata locks precede exact table validation;
unexpected engines, triggers or incoming foreign keys refuse execution rather
than permitting an unreviewed cascade. Strict SQL mode and FK checks stay enabled.
The dedicated connection is destroyed afterward; pooled safeguards remain.
Selection and the actual DELETE both enforce the age predicate and current
recorded protection. Unknown/zero time is excluded and equality at cutoff is
retained. Held or newly ineligible records advance the scan as retained/skipped,
not deleted. Prepared bindings preserve large IDs and SQL-mode independence.

## Retired cache cleanup and results

Historical analytics no longer reads or populates `web_analytics:*`. This removes
the delayed-reader repopulation race. A bounded cleanup of old entries uses
[SCAN](https://redis.io/docs/latest/commands/scan/) and DEL batches of at most 100;
it never uses KEYS or touches another namespace. Count is a hint, so oversized
responses are bounded/refused. Five-second command deadlines preserve pending
state on network failure or unknown acknowledgement. A partial-page retry starts
over safely; a completed page stores its cursor.

The Redis identity from [INFO server](https://redis.io/docs/latest/commands/info/)
travels with the cursor. A server restart resets traversal rather than trusting
the old hash cursor. The cache principal needs INFO server, SCAN and DEL for this
owned namespace; the CLI grants nothing. Unreachable/invalid cache state remains
pending. Old keys containing raw legacy interval characters are removed through
safe Redis arguments without logging their names or values.

JSON results contain the operation/version/cutoff, aggregate scanned/held/deleted/
skipped counts, class completion, cache completion, work duration and outcome:

- `running`: more SQL scan work remains under the captured bounds.
- `awaiting_cache`: SQL scanning finished; copy removal is not confirmed.
- `complete`: the requested bounded SQL pass and configured retired cache cleanup
  are confirmed. Held rows remain retained. This is not all-copies erasure.

`workDurationMs` is cumulative monotonic work sampled before checkpoint writes;
it excludes later commit/lease cleanup waits and completed idempotent replays.
Exit 0 permits a successful bounded partial result; inspect `complete`. Exit 2
signals a recorded cache failure requiring retry. Exit 1 reports refusal/storage/
ownership uncertainty with a safe category/reference and no raw driver payload.
Ordinary logs/results contain no row/cursor/lease data; the private ledger has
indirectly linkable IDs and requires restricted operator access.

## Migration, evidence and remaining scope

Apply `20261017005000_web_retention_runs.ts` only within the authorized
[backup/clone release procedure](../deployment.md#rehearse-database-changes).
The forward contract covers one additional website table; the immutable baseline
and MUD schema are unchanged. Normal preflight is ledger-strict. Migration-only
recovery accepts the exact adjacent before/after shape after a lost DDL
acknowledgement. Down refuses run history and non-default/leased/invalid control
state, and removes only an unused default control row with an empty ledger.

No period for the run/control system's own records is approved; retain/restrict
them. Source flags remain off. Existing feature cleanup, physical media/caches
outside this namespace, generated exports, logs, backups, restore/removal replay,
pending subject requests and verified export/erasure remain required follow-ups.
The hold API still reports global enforcement unavailable. A website-only result
does not establish MUD/provider/CDN/device/backup disposal or prevent restore
resurrection; those acceptance gates remain open.

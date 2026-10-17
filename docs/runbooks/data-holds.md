# Website data hold records

This API records a request to preserve website data and its eventual release.
**It currently reports global `enforcementReady: false`: all cleanup/restore
consumers are not yet protected.** The source-disabled
[two-class SQL executor](retention-execution.md) consumes them transactionally;
general retention and restore integration remain required before P6 or live
protection can be accepted. The prepared [managed ZIP removal path](managed-archive-holds.md)
now uses durable admission with these records. Any active scope conservatively
blocks managed archive removal; a pending worker blocks acknowledgement until
fenced, with a retryable 409 rather than a false hold confirmation. Creating a
record does not pause image, upload or workspace cleanup, remove data, enable
retention or approve a policy. Complete copy/restore protection remains open.

## Access and private handling

`/api/admin/data-holds` requires an active signed website session and the
existing Overlord role. Other admin permissions do not substitute for that
role. POST actions also require the ordinary matching CSRF cookie/header.
Responses, including authorization failures, use `Cache-Control: no-store` and
vary by Cookie. There is no public listing, new delegated permission or UI.
Use the existing authenticated API tooling; never put cookies or tokens in a
ticket, shell history example or ordinary log.

Records contain account scope, private review reasons and operator attribution.
Use a concise purpose/reference and avoid unnecessary personal details. Access
to the hold API is independent of a subject's right to an export; future exports
must review private staff reasons and third-party information explicitly.

## Create and retry

`POST /api/admin/data-holds` accepts exactly:

```json
{
  "id": "7a2e1940-0b23-466f-8f64-82d15aa69ef6",
  "scope": { "kind": "global" },
  "reason": "Preserve records while the referenced review is open",
  "reviewAtEpoch": 1800000000,
  "expiresAtEpoch": null
}
```

Generate a fresh lowercase UUID v4 for each intent. The dates above are examples;
select the actual authorized review/expiry instants. Review must be strictly
after the database's creation epoch. Expiry is explicitly `null` for an
indefinite intent or an epoch at/after review. The database clock supplies the
creation and release instants. No application Date conversion or guessed
timezone participates in decisions. Reason is trimmed and bounded to 512
Unicode characters; the authenticated approver is recorded by the server.
Unknown fields, including a supplied approver, are refused.

Supported scope objects are:

- `{ "kind": "global" }`: intent for the planned website lifecycle domain.
- `{ "kind": "class", "classId": "analytics_events" }`: a registered class.
- `{ "kind": "account", "accountName": "VerifiedAccount" }`: explicit account
  intent; do not infer an account from an IP or free text.
- `{ "kind": "account_class", "accountName": "VerifiedAccount", "classId": "login_history" }`:
  both selectors.

The initial class registry contains only `analytics_events` and `login_history`.
Unknown classes require a reviewed registry/handler extension. Global/account
intent records do not establish MUD, provider, backup or current feature-cleanup
protection. Account names are bounded to 50 Unicode characters, preserve their
spelling and reject leading/trailing whitespace or controls. Historical account
intent does not require creating a MUD account or joining ownership by IP.

Successful create/retry returns 200 with `{ hold, enforcementReady, warning }`.
Reusing the same UUID, authenticated approver and exact normalized scope/reason/
dates returns the stored intent. A conflicting request is 409 and never updates
the first record. Replaying an expired or released intent returns that observed
state; it does not reactivate it. Use a new UUID for a new intent.

## Review, expiry and release

`GET /api/admin/data-holds/:id` returns the protected record. `status` is:

- `active`: unreleased and no expiry, or expiry is after database time.
- `expired`: unreleased with an expiry at/before database time.
- `released`: an explicit attributed release exists.

`reviewDue` is true only for an active intent at/after its review epoch. Review
and expiry never delete the record or its original reason/approver. A later
engine must apply these semantics and recheck holds in its mutation transaction.
The prepared SQL executor does so for its two registered classes, with all source
approval/enablement flags false. Hold create/release and SQL deletion acquire the
same short transaction control lock before accessing hold/run records. An
acknowledged hold orders before a later deletion; a request arriving after a
deletion owns the lock waits for that transaction and cannot undo completed work.

`POST /api/admin/data-holds/:id/release` accepts exactly
`{ "reason": "Review completed; reference recorded privately" }`. It preserves
the creation fields and adds the authenticated releaser, reason and database
epoch in one transaction. Exact actor/reason retries return the same outcome;
a different release against an already released record is 409. There is no
delete, edit or history-overwrite endpoint. To extend/change intent, create a
replacement with a new UUID, confirm it, then explicitly release the old one;
retain both histories.

## Bounded listing and failure recovery

`GET /api/admin/data-holds` lists unreleased records, including expired intents
still awaiting administrative closeout. Optional `includeReleased=true` includes
history; `limit` is 1–100 (default 50). The opaque UUID `after` cursor comes from
`nextCursor`. Pages order by ID and are observational across concurrent changes.
The unreleased scan explicitly uses the released/ID index so a growing closed
history cannot turn a small active page into a primary-key history scan. The
explicit history listing uses primary-key order.

Storage or invalid-record failures return 503 with a static category/reference
in ordinary diagnostics. No raw database error, bound reason, account, IP or
token is logged. On an uncertain acknowledgement, GET the same UUID or retry
the identical create/release. Do not create unrelated replacement IDs merely to
hide an unknown outcome. Failure preserves durable evidence; malformed records
require private operator investigation, not a forced release or purge.

Before stopping existing website writers, complete the
[legacy temporary-copy preservation gate](../deployment.md#legacy-temporary-copy-preservation-gate).
Apply `20261017004000_web_data_holds.ts` after the
[authorized backup/clone rehearsal](../deployment.md#rehearse-database-changes)
with those writers stopped,
before starting this API. The exact adjacent DDL shape can recover a lost Knex
acknowledgement; normal preflight remains ledger-strict. Down is allowed only
for an empty table and refuses active, expired, released or invalid history.
The [schema guide](../../backend/schema-baselines/README.md#website-data-hold-records)
describes that boundary. The immutable baseline is unchanged; this is one
additional website-owned table and has no MUD foreign key.

No retention period for the hold system's own records is approved. Retain and
restrict them pending that decision. Full database backups include this table;
that source behavior is not proof of verified backup/restore protection. P6
restore replay, request coordination, deletion/cleanup interception and approved
periods remain open. The [preview](retention-preview.md) now evaluates these
records in a read-only snapshot and refuses continuation after active protection
changes. That observation does not authorize deletion. Gated execution is a
separate operation with its own durable run identity and current-hold rechecks;
preview files are never execution authority. Preserve the run/control evidence
with hold history. Neither source qualification nor an API acknowledgement
establishes protection for live backups, provider copies or other cleanup paths.

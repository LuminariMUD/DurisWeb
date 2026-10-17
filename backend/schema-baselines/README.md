# Website schema baselines

`2026-10-16/` contains the explicit website schema at migration cutoff
`20261016160000_pvp_discord_audit_columns.ts`. It defines 77 website-owned
tables, their foreign-key creation order, and 126 nonsecret default rows.
It is source-owned schema, not a production dump or historical migration replay.
Treat a finalized version as immutable; later changes belong in new forward
migrations and updated baseline-plus-forward verification.

Run `pnpm --dir backend schema:check` from the repository root. This command
needs no runtime environment or database connection. It verifies the schema,
seed, per-table, historical TypeScript, and classified SQL checksums, checks
foreign-key creation order and ownership, and refuses unexpected historical
files. Sequence and timestamp names have separate cutoffs, derived from the
pinned historical names (`048_` and `20261016160000_` respectively). Later names
in either series remain outside this baseline's coverage. The backend quality
job runs this command, and failures identify the source file or violated invariant.
The command does not install a schema, mark historical migrations applied,
change Knex discovery, or certify an existing database.

## Contents and derivation

- `schema.sql`: explicit `CREATE TABLE` statements, without `IF NOT EXISTS`,
  in dependency order. No game table is created or altered, and no web foreign
  key points into the game schema. `server_reboots` is explicitly excluded:
  the MUD's immutable migration 0004 owns it, although it is absent from the
  older copied baseline's required-table list.
  Foreign-key references must use the canonical `REFERENCES \`table\` (`
  syntax. Other casing, quoting, qualification, or comments are rejected rather
  than partially parsed. The copied MUD ownership list is fingerprinted before
  any ownership decision.
- `seeds.json`: source-defined permission/role definitions and relationships,
  forum/web/wiki settings, continent reference definitions, and the stopped/
  unknown process singleton. No account permissions, account assignments,
  forum categories, sessions, profiles, map rooms, wiki objects, or player rows
  are populated. Installation timestamps use column defaults.
- `manifest.json`: source checksums and covered filenames, excluded MUD DDL
  and one-off SQL repair, MUD baseline identity, artifact/table checksums, and
  installed `SHOW CREATE TABLE` hashes for MySQL 8 and MariaDB 11. These are
  immutable derivation evidence. Runtime verification uses the stored metadata
  contract described below because equivalent restored schemas can render
  different `SHOW CREATE TABLE` text.

The schema was derived in a new, empty synthetic MySQL database from the
12 classified legacy web SQL artifacts followed by the 85 historical
TypeScript sources. Temporary minimal `accounts`/`pkill_event` shells satisfied
legacy mixed-ownership references during derivation; those shells and the
legacy-created `server_reboots` are excluded from the artifact. The MUD-only
account-character collation migration has no website effect and was omitted.
Hook seed derivation imported the same registry directly to avoid the public
barrel's runtime clients. These derivation accommodations are not an installer
or a rehearsal against an approved MUD schema.

The active builder settings routes also require `builder_settings`, which had
no historical schema source. Its definition is derived from their read/upsert
contract: account name, setting key/value, timestamps, and a unique account/key
pair. No account preferences are seeded. Both native database tests exercise
inserts, repeated updates, account isolation, and its installed-shape hash.

Every web text column/table uses the documented `utf8mb4_unicode_ci` collation,
making defaults explicit across both database families. A legacy table still
using another collation needs an inspected forward repair before adoption;
do not silently normalize or accept its fingerprint. Retain the historical
files and ledger. Unified `notifications` replaces the obsolete forum/builder
notification stores. The legacy admin crash endpoints read and update only
`crash` rows in `server_incidents`, exposing `started_at` as `crash_timestamp`;
they do not require the retired `crash_log` table. Forum subscription queries use
`user_account_name`, and subscriber notifications store their destination in
`link` and thread/post identifiers in JSON `data`. Native API/service regressions
exercise those paths against the unchanged bundle on both database families.
Explicit feature publication is still required for forum
taxonomy and wiki/map content.

## Operator procedure

This installer targets a shared database on MySQL 8 or MariaDB 11.8, after
the MUD owner has installed and verified its schema. It never supplies a game
baseline. Obtain the approved hash from an owner-reviewed schema/restore record;
an observed hash and matching table names alone do not prove game compatibility.
Keep application writers stopped while installing or adopting. Use an isolated
rehearsal first; shared-environment work requires its own release authorization.

With the backend environment selecting the intended target, substitute its
literal `host:port/database` and the approved external-schema SHA-256:

```bash
pnpm --dir backend schema:check
pnpm --dir backend schema:baseline inspect --target '<host>:<port>/<database>'
# With the DBA's protected configuration, before bootstrap:
pnpm --dir backend schema:lifecycle install \
  --target '<host>:<port>/<database>' \
  --runtime-user '<existing-website-sql-user>' --runtime-host '<its-mysql-account-host>'
pnpm --dir backend schema:baseline bootstrap \
  --target '<host>:<port>/<database>' --mud-schema-sha256 '<approved hash>'
pnpm --dir backend migrate:latest
pnpm --dir backend migrate:status
pnpm --dir backend schema:baseline verify \
  --target '<host>:<port>/<database>' --mud-schema-sha256 '<approved hash>'
```

`inspect` is read-only and reports the current external table-definition hash.
The [version 2 metadata helper](../../docs/runbooks/lifecycle-metadata.md) must
be explicitly installed first, even for an owner-run bootstrap. It reads system
metadata and needs no website table, so there is no circular dependency. Keep
the normal source/target/hash and maintenance approval requirements; installer
credentials come only from the protected backend configuration. Existing v1 is
preserved and never accepted as a substitute for v2.
The other actions require the explicit target/hash. Database credentials come
only from backend configuration. Bootstrap refuses populated historical ledgers,
unrecorded web objects, unsupported database families, wrong MUD names/hash,
changed inputs, table/metadata drift, and unexpected triggers on web/ledger
objects. It requires autocommit, foreign-key checks and a strict SQL mode rather
than silently changing session safeguards. DDL is nontransactional: each attempted table is journaled before its
creation, verified after creation, then acknowledged. A retry accepts only that
recorded expected partial shape. Seeds and their acknowledgement commit together.
An ambiguous commit can be retried without duplicating defaults.

The `web_schema_baselines` provenance record is separate from Knex history.
The Knex source verifies it and every web table before omitting covered
**unapplied** historical files. Applied filenames remain visible to Knex ledger
validation. Later migrations execute and roll back through the ordinary Knex
path; no historical rows are fabricated or cleared. Production preflight uses
the same coverage proof and still requires all feature-readiness checks.

Every post-cutoff `NAME.ts` must include a reviewed `NAME.schema.json` beside
it, containing `formatVersion: 1`, `fingerprint: "information_schema_v1"`,
`sha256` of the migration bytes and a `tables` object. Each
created or altered web table maps to its complete stored metadata
hashes, `{ "mysql8": "<sha256>", "mariadb11": "<sha256>" }`, after `up` on
the corresponding database family. A dropped table maps to `null`; a data-only
migration uses `{}`. Rehearse `up` and `down` on both families before recording
these shapes. Include every affected table, including changes to referencing
tables. Game tables and baseline/Knex metadata cannot be declared web-owned.
Both `up` and `down` check the SQL Knex emits before it reaches the driver,
including dynamically assembled SQL and schema-builder calls. Every DDL target,
rename destination and foreign-key reference must be declared in the contract;
MUD tables and provenance/Knex metadata cannot be declared. Data-only contracts
therefore cannot execute DDL. Supported forms are single-statement table DDL and
index DDL using unqualified canonical table names; indirect/executable-comment,
trigger/routine, cross-database and administrative DDL fail closed. Use ordinary
queries for data changes; stored calls and prepared statements are refused.
This guard preserves historical migration behavior and adds no database grants.
Do not edit the baseline manifest to record forward states: its hash identifies
existing installations. Missing/stale contracts and changed migration bytes
fail validation. Verification composes the baseline with contracts in actual
applied-ledger order, so repeated `latest`, rollback, status and preflight check
the installed forward state while still rejecting unrelated drift. Rolling back
restores the preceding expected state; new web objects must then be absent.

For a matching existing schema and complete historical ledger, replace
`bootstrap` with `adopt`. Adoption does not seed, replace user rows, alter schema,
or rewrite the ledger; it records adoption separately. Legacy collation/shape
differences are explicit refusals, requiring reviewed forward repair. Missing
history must be investigated, never filled with fictional applied names.

The historical sources omit the active builder route's `builder_settings`
table. The reviewed fresh baseline includes it. For an existing 85-migration
installation without that table, run the specific forward repair **before**
adoption, then use `adopt` and verify as above:

```bash
NODE_OPTIONS='--import tsx' pnpm --dir backend exec knex \
  migrate:up 20261016230000_repair_builder_settings.ts --knexfile knexfile.ts
```

This executes a real new migration and keeps all 85 historical ledger rows.
It journals creation intent in `web_settings`, verifies the exact source-owned
shape, and never replaces an existing matching table or seeds account data.
Its down retains preexisting stores; before adoption it can remove only an
empty repair-created store. User data and adopted-baseline ownership refuse
that rollback. Finish or reverse this repair before adoption; after adoption,
recovery must preserve the baseline's required table. This is an isolated
rehearsal procedure until a shared-environment release is separately authorized.

If installation fails, preserve the journal and correct the cause before rerun.
Do not delete it to make an arbitrary existing schema look fresh. For a recovery
decision to remove this install, `teardown` with the same target/hash drops only
objects recorded as created by it, in reverse FK order. It refuses adopted or
subsequently migrated stores, user data, changed seeds, and drifted objects.
Deletion progress is journaled for safe retry. It never calls historical downs,
drops game objects, or automatically restores deleted data. Existing Knex metadata
is retained; a production restore requires the separately authorized procedure.
If the final provenance-table drop committed but its acknowledgement was lost,
retrying teardown succeeds only when provenance and all declared web objects are
absent, the applied ledger is empty, and the approved external schema still
matches. This confirms an already absent store without deleting anything; a
partially present store without provenance is refused.

## Verification boundary

`webBaselineBundle.test.ts` covers altered artifacts/sources, unknown ownership,
duplicate objects, forbidden account assignments, both forward migration naming
series, strict foreign-key syntax, and actionable database-free CLI failures.
To opt into DDL/seed checks on **new disposable loopback servers**, use:

```bash
TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaselineBundle.test.ts
TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaseline.test.ts
```

The fixtures use passwordless root solely for administration on the explicitly selected ports,
refuse the standard production/development ports, create their own process-unique
database, and remove it only if they created it. They verify all installed
table hashes, foreign-key checks, absence of incoming game FKs, and unchanged
external sentinel objects/rows. Successful checks on MySQL 8.0.46 and MariaDB
11.8.9 prove the bundle's syntax and installed shape on those versions. Installer
tests additionally cover the real CLI, native Knex forward/down/forward without
fabricated history, synthetic existing-ledger adoption, DDL/seed interruption,
concurrency, drift/trigger refusal and limited teardown. Their MUD fixtures are
synthetic metadata/name sentinels. A full owner-verified MUD-schema rehearsal,
restored-existing-environment qualification, feature readiness, and deployment
acceptance remain separate requirements; these tests do not certify them.

For full-schema qualification, additionally point at a read-only checkout of
the MUD owner's published migration sources:

```bash
TEST_BASELINE_DB_PORTS=23336,23337 \
TEST_BASELINE_MUD_SOURCE=/path/to/DurisMUD/migrations \
pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaselineQualification.test.ts
```

The helper pins the bootstrap SQL and both manifests to the owner-published
digests at Duris commit `6d4d71e56547c71898247e73ccca74da75e0a9f6`, then verifies
the baseline identity, immutable SQL checksums, runtime head and normalized
metadata contract. A changed source requires explicit review and pin updates;
matching final metadata alone cannot approve altered SQL or manifests.
It applies SQL only to newly created disposable databases through a temporary
randomly authenticated account with grants confined to that database, escaping
database-name wildcards. The account is removed after success or failure;
global privileges, local-file loading and client shell commands are unavailable.
It never invokes MUD scripts or
invents owner migration history. The fresh web path checks empty-feature refusal,
synthetic feature publication, representative queries, and unchanged owner
metadata. The existing-web path genuinely executes the original web sources in
a synthetic derivation database, dumps only web tables and the real Knex ledger,
restores them beside the full owner schema, and verifies adoption preserves the
ledger, rows and owner metadata. It is not a production-data rehearsal.

## Stored metadata verification

`../schema-contracts/web-baseline-v1.json` pins native metadata signatures to this
immutable baseline manifest. The reader compares table engine/collation/options,
column order/type/default/nullability/text encoding/generated expressions,
index columns/order/prefixes/uniqueness/visibility, foreign-key targets/rules,
and exact CHECK clauses/enforcement. Engine-assigned CHECK names and mutable
auto-increment counters do not affect behavior and are excluded. Knex's ASCII
filename ledger accepts its three documented historical utf8mb4 collations;
website text columns still require the canonical collation.
The canonical tables have no explicit `CREATE_OPTIONS` or named partitions.
Both are checked in `information_schema` before comparing signatures, including
during adoption and forward verification. Partitioning or adding table options
therefore fails closed without changing existing immutable hashes.

Native qualification found matching column/index/FK metadata for canonical and
historical schemas on both engines. The sole accepted clause variation is
`forum_subscriptions`: ASCII `thread`/`category` literals carry different
charset introducers after historical replay. Both explicitly pinned forms pass
the complete subscription truth table; weakened CHECKs, changed nullability and
extra uniqueness constraints are rejected. Redundant per-column charset
rendering also no longer rejects a valid restored ledger. No schema repair or
new migration is needed for these rendering differences. New application schema
changes require forward migrations and versioned postconditions; never edit
these accepted baseline signatures to hide drift.

## Session credential cutover

This procedure is prepared for isolated rehearsal. Shared deployment requires
the recorded owner decision for a one-time website logout and advance notice.
Keep all website writers stopped/drained during the transition; do not restart
the separate MUD. The original baseline remains immutable.

After baseline installation/adoption and the builder repair, apply the two
specific forward migrations. Expansion adds nullable digest/epoch columns and
permits null legacy values. Verify the new writer during maintenance before
contraction discards all old sessions and removes the old columns:

```bash
NODE_OPTIONS='--import tsx' pnpm --dir backend exec knex \
  migrate:up 20261017000000_expand_web_session_credentials.ts --knexfile knexfile.ts
pnpm --dir backend schema:sessions --target '<host>:<port>/<database>'
NODE_OPTIONS='--import tsx' pnpm --dir backend exec knex \
  migrate:up 20261017001000_cutover_web_session_credentials.ts --knexfile knexfile.ts
pnpm --dir backend migrate:status
pnpm --dir backend schema:sessions --target '<host>:<port>/<database>'
```

The target must match configured connection identity before any query. The write
probe uses the actual session writer, a generated nonexistent account name, and
a random non-JWT; it neither creates a MUD account nor issues cookies. It checks
the digest and database-derived seven-day expiry and deletes the exact probe
row before reporting success. Failure leaves release acceptance incomplete.
Run both production preflight stages before resuming HTTP writers, then verify
real login/access/refresh/logout through the authorized release path.

Each DDL step recognizes only exact source-owned before/after metadata. Knex may
retry an adjacent session phase after DDL committed without its ledger
acknowledgement. Normal verification/preflight stays ledger-strict, rejects
pending migrations, and never accepts unrelated session drift. Expansion must
be recorded before cutover; rollback reverses cutover before expansion.

An authorized rollback uses targeted `knex migrate:down` in reverse order,
first `20261017001000_cutover_web_session_credentials.ts`, then
`20261017000000_expand_web_session_credentials.ts`. Both deliberately leave
sessions empty. Digests cannot reconstruct tokens, and old timestamp offsets
are never guessed or backfilled. Never restore session rows from an archive or
automatically restart old writers; keep authentication closed until the selected
binary/schema pair passes its approved recovery checks. New website backup
exports include session DDL without rows, including in shared-database mode.
The qualified historical column is `TIMESTAMP`. Unknown shapes, including a
naive `DATETIME` variant, are refused before mutation; inspect the deployed
shape and prepare an explicitly reviewed empty-session repair if it differs.

## Hook audit journal

`20261017002000_hook_audit_identity.ts` adds a nullable, uniquely indexed hook
event UUID to the web-owned audit table. Existing audit rows keep their values
and null identities. Apply the migration before deploying the journal worker.
Its unused schema down is reversible; once a receipt or attributed audit row
exists, down refuses rather than discarding attribution. Use a forward repair
or an authorized compatible recovery, never clear the journal to force rollback.

Each accepted website toggle and its minimal actor/old/new/UTC receipt commit
in one `web_settings` transaction. `PATCH /api/hooks/:id` optionally accepts an
`Idempotency-Key` UUID v4. Reusing it with the same actor/hook/value returns the
same `hook.change.event` receipt and fresh current hook status; it never undoes
a newer setting. Conflicting reuse is 409. A distinct same-state request is
another audited intent. Reconcile remains a fresh observed distributed action;
its website steps get distinct identities and do not deduplicate remote commands.

The worker runs independently of toggle acknowledgement, every five seconds
without overlapping polls. It scans at most 100 bounded envelopes, stops
starting more work after a two-second monotonic budget, and gives each database
query a five-second timeout. Pending events use capped backoff without a retry
limit or trimming. The reserved row's `description` carries the delivery marker;
JSON holds the immutable event and retry metadata. Completed receipts stay out
of the hot queue without duplicating status in the JSON. Publication and journal acknowledgement share a transaction;
the unique event identity resolves uncertain outcomes. Audit retries never write
the effective toggle. Prepared bindings preserve JSON without weakening SQL mode.

Authorized operators with `manage_mud_properties` can use:

- `GET /api/hooks/audit`: aggregate counts, oldest pending age, worker/scan
  observations and a safe last-failure category. `sinkReadable` proves only
  schema/read access, not successful publication. Pending-scan invalid counts and
  backlog must be assessed together. No journal payload or actor list is returned.
- `POST /api/hooks/audit/retry` with `{ "batchSize": 25 }`: one bounded forced
  retry (maximum 100). `busy: true` means another batch is already running.
  Ordinary authenticated state-change CSRF protection still applies.

Generic settings APIs exclude the reserved namespace, including collation-
equivalent lookup aliases. Invalid/oversized envelopes remain for investigation;
repair from preserved evidence rather than inventing attribution. Restoring audit
write permissions can drain a backlog across process restarts. Structural table
loss still refuses startup under the baseline contract; whole settings-storage
failure cannot persist a safety change. The terminal keeps its existing always-on,
permission-gated recovery role and underlying availability limits.

Acknowledgement retains the receipt. P6 owns approved delivered retention and
subject-request holds; pending/invalid events must never be deleted by age or
queue size. Only new hook audit rows have explicit UTC event timestamps; do not
reinterpret older naive audit timestamps or change pooled timezones.

## Forum image removal

`20261017003000_post_image_removal_intent.ts` adds nullable
`removal_requested_at_epoch BIGINT UNSIGNED` and an intent/ID index to the
website-owned `forum_post_images`. Apply it with website writers stopped,
after the ordinary backup and isolated forward rehearsal, before starting the
new image API, forum writers or hourly cleanup. The immutable baseline stays
unchanged. Production preflight requires this forward contract.

Removal commits the database clock's intent and clears `is_orphan` before
contacting object storage. Post/thread references remain null. Pending rows
cannot be adopted by a draft, including after a process restart or provider
timeout. Forum create/edit paths claim uploads in their content transaction.
A connection-scoped per-image lease prevents duplicate provider requests
without holding a SQL transaction across the network. The existing row holds
the account, object key/URL and intent needed for retry; no new queue is used.

The API and hourly job remove the row only after the S3
[DeleteObject 204 acknowledgement](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html#API_DeleteObject_ResponseSyntax)
and a committed metadata deletion. Delete-marker/version responses stay
pending. Disabled storage, provider failure, five-second request timeout,
unconfirmed response or a database failure retains recovery state. Restoring
storage permits retry through the existing clear action or hourly job; never
clear the intent or mark a row reusable to resolve a backlog. If the provider
succeeded before a database failure, the same unversioned key can be deleted
again. Diagnostics expose a fixed category and local reference, not provider
or SQL payloads.

Each cleanup scans at most 100 eligible rows, stops starting additional
deletions after a two-second monotonic budget, and bounds individual SQL and
provider requests at five seconds. A cursor advances past failures and wraps;
overlapping runs in the same process share one batch. New orphans keep the
existing one-hour age requirement; explicit pending removals retry regardless
of age. The budget is soft: an in-flight operation may finish after it.

Down is reversible only while every intent is null. It refuses pending or
uncertain work instead of discarding the retry record. The migration source
can recover only the exact adjacent before/after schema if nontransactional
DDL committed without a ledger acknowledgement; normal preflight still
requires the recorded forward shape. Unknown drift requires reviewed repair.
Source tests use a fake provider and real isolated MySQL/MariaDB; they do not
prove live provider deletion, CDN invalidation, backup deletion or the future
general retention/erasure workflow.

## Website data hold records

`20261017004000_web_data_holds.ts` creates one website-owned extension table
outside the immutable 77-table baseline. It records UUID/scope, private reason,
authenticated creation/release attribution, explicit review/optional expiry
epochs and database timestamps. There is no foreign key to a MUD table or new
permission seed. The Overlord-only [API/runbook](../../docs/runbooks/data-holds.md)
explicitly reports that deletion/cleanup and restore enforcement are not ready.
Do not claim that storing intent implements retention or live protection.

Run the ordinary backup/clone forward rehearsal with website writers stopped
before deploying the API. Both engines have exact metadata postconditions and
idempotent adjacent DDL recovery if creation/drop succeeded without its ledger
acknowledgement. Normal serving preflight still requires the correct ledger and
shape. Unknown drift is refused. Down drops only an empty table; any history,
including expired/released/invalid rows, refuses rollback. Preserve those rows
through an authorized compatible forward repair instead of clearing evidence.

## Gated retention run ledger

`20261017005000_web_retention_runs.ts` adds `web_retention_runs`, the second
extension outside the immutable baseline (79 application tables after both
extensions). An operation UUID binds policy/rule/SQL-and-cache target identities,
captured database epoch and bounded private JSON progress. SQL deletion and
cursor/action checkpoints commit together. The reserved `retention-control-v1:`
settings namespace contains only the worker lease/control state, excluded from
generic settings. Hold writes acquire that same control lock before hold rows.
See the [execution runbook](../../docs/runbooks/retention-execution.md).

All policy/class approvals and execution enablement remain false. No runtime
override or scheduler is installed. Before a future approved cutover, stop/drain
all old website writers and rehearse the exact forward path on a protected clone;
the new analytics readers retire the old Redis cache writers. Schema validation
and trigger/incoming-FK refusal remain strict on both database families.

Migration-only recovery accepts the exact adjacent before/after shape after a
lost DDL acknowledgement; normal preflight still requires the ledger. Down
refuses any run history or non-default/leased/invalid control state. It removes
only an unused canonical default control row with an empty run table. Retain
progress and hold history through compatible forward recovery; never clear the
ledger to make rollback pass. Its own retention period is unapproved, and these
records do not establish protected backup/restore replay.

# Website schema baselines

`2026-10-16/` contains the explicit website schema at migration cutoff
`20261016160000_pvp_discord_audit_columns.ts`. It defines 76 website-owned
tables, their foreign-key creation order, and 126 nonsecret default rows.
It is source-owned schema, not a production dump or historical migration replay.
Treat a finalized version as immutable; later changes belong in new forward
migrations and updated baseline-plus-forward verification.

Run `pnpm --dir backend schema:check` from the repository root. This command
needs no runtime environment or database connection. It verifies the schema,
seed, per-table, historical TypeScript, and classified SQL checksums, checks
foreign-key creation order and ownership, and refuses unexpected historical
files. Later migration names remain outside this baseline's coverage.
The command does not install a schema, mark historical migrations applied,
change Knex discovery, or certify an existing database.

## Contents and derivation

- `schema.sql`: explicit `CREATE TABLE` statements, without `IF NOT EXISTS`,
  in dependency order. No game table is created or altered, and no web foreign
  key points into the game schema. `server_reboots` is explicitly excluded:
  the MUD's immutable migration 0004 owns it, although it is absent from the
  older copied baseline's required-table list.
- `seeds.json`: source-defined permission/role definitions and relationships,
  forum/web/wiki settings, continent reference definitions, and the stopped/
  unknown process singleton. No account permissions, account assignments,
  forum categories, sessions, profiles, map rooms, wiki objects, or player rows
  are populated. Installation timestamps use column defaults.
- `manifest.json`: source checksums and covered filenames, excluded MUD DDL
  and one-off SQL repair, MUD baseline identity, artifact/table checksums, and
  installed `SHOW CREATE TABLE` hashes for MySQL 8 and MariaDB 11. The mutable
  auto-increment counter is excluded from installed-shape hashes; columns,
  defaults, nullability, indexes, constraints, engine and collation remain.

The schema was derived in a new, empty synthetic MySQL database from the
12 classified legacy web SQL artifacts followed by the 85 historical
TypeScript sources. Temporary minimal `accounts`/`pkill_event` shells satisfied
legacy mixed-ownership references during derivation; those shells and the
legacy-created `server_reboots` are excluded from the artifact. The MUD-only
account-character collation migration has no website effect and was omitted.
Hook seed derivation imported the same registry directly to avoid the public
barrel's runtime clients. These derivation accommodations are not an installer
or a rehearsal against an approved MUD schema.

Every web text column/table uses the documented `utf8mb4_unicode_ci` collation,
making defaults explicit across both database families. A legacy table still
using another collation needs an inspected forward repair before adoption;
do not silently normalize or accept its fingerprint. Retain the historical
files and ledger. Unified `notifications` replaces the obsolete forum/builder
notification stores. Explicit feature publication is still required for forum
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
pnpm --dir backend schema:baseline bootstrap \
  --target '<host>:<port>/<database>' --mud-schema-sha256 '<approved hash>'
pnpm --dir backend migrate:latest
pnpm --dir backend migrate:status
pnpm --dir backend schema:baseline verify \
  --target '<host>:<port>/<database>' --mud-schema-sha256 '<approved hash>'
```

`inspect` is read-only and reports the current external table-definition hash.
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
it, containing `sha256` of the migration bytes and a `tables` object. Each
created or altered web table maps to its complete normalized `SHOW CREATE TABLE`
hashes, `{ "mysql8": "<sha256>", "mariadb11": "<sha256>" }`, after `up` on
the corresponding database family. A dropped table maps to `null`; a data-only
migration uses `{}`. Rehearse `up` and `down` on both families before recording
these shapes. Include every affected table, including changes to referencing
tables. Game tables and baseline/Knex metadata cannot be declared web-owned.
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
duplicate objects, forbidden account assignments, and the database-free CLI.
To opt into DDL/seed checks on **new disposable loopback servers**, use:

```bash
TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaselineBundle.test.ts
TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaseline.test.ts
```

The fixtures use passwordless root solely on the explicitly selected ports,
refuse the standard production/development ports, create their own fixed-name
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

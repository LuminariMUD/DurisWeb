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

## Verification boundary

`webBaselineBundle.test.ts` covers altered artifacts/sources, unknown ownership,
duplicate objects, forbidden account assignments, and the database-free CLI.
To opt into DDL/seed checks on **new disposable loopback servers**, use:

```bash
TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand \
  src/db/__tests__/webBaselineBundle.test.ts
```

The fixtures use passwordless root solely on the explicitly selected ports,
refuse the standard production/development ports, create their own fixed-name
database, and remove it only if they created it. They verify all installed
table hashes, foreign-key checks, absence of incoming game FKs, and unchanged
external sentinel objects/rows. Successful checks on MySQL 8.0.46 and MariaDB
11.8.9 prove the bundle's syntax and installed shape on those versions. They do
not prove a supported fresh-MUD bootstrap, existing-ledger adoption, resumable
installation, migration-source transition, data readiness, or deployment.
Those acceptance boundaries remain in the execution plan until implemented.

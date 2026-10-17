# Authoritative lifecycle metadata

Lifecycle writes must not interpret privilege-filtered catalog counts as proof
that a table has no triggers or incoming foreign keys. A relationship in another
database can otherwise be hidden from the website account while still cascading
from its deletes. This was reproduced with disposable data on both supported
engines. MySQL also hides triggers without TRIGGER; MariaDB's visibility differs.
See [MySQL trigger visibility](https://dev.mysql.com/doc/refman/8.0/en/information-schema-triggers-table.html).

## Owner-installed read-only function

`web_lifecycle_metadata_v2` is a SQL SECURITY DEFINER function in the configured
website database. It accepts one canonical lowercase ASCII table name of at most
64 characters in its own database. The name is a bound metadata-filter value;
no SQL identifier or statement is constructed from it. Website callers select
targets from verified baseline/forward contracts or fixed lifecycle rules.
The baseline verifier covers newly declared forward tables without classifying
MUD-owned triggers as website triggers.
It returns only the requested target, format/body digest and trigger/incoming
reference counts. A directly authorized SQL caller can inspect these topology
counts for canonical names in this database; the function grants no ownership
or row access. It accepts no SQL, schema-qualified name, column or data selector,
and returns no external database names, rows, bindings or credentials.

This explicitly versioned contract replaces v1's six-target source. The installer
creates only absent v2, never changes/drops existing v1 or silently falls back
to it. Old v1 may coexist during an upgrade with all writers stopped; new code
requires v2 for schema verification, migration and lifecycle writes.

The installing DBA remains the definer and must retain direct global SELECT and
TRIGGER. These are existing administrator privileges; the command never grants
them or creates an account. Roles alone are insufficient. The function checks
authority on every invocation. MySQL partial revokes must already be disabled:
schema restrictions would undermine complete visibility. Do not change server
settings to bypass this check; unsupported/restricted installations keep
lifecycle writes unavailable pending an independently qualified solution.

Use a named definer with letters, digits, underscore, dot or hyphen in its user
name and those characters plus colon/percent in its host. The website account
needs only EXECUTE on this exact function in addition to its existing table
permissions. It needs no global SELECT, TRIGGER, PROCESS, SHOW_ROUTINE, ALTER
ROUTINE or additional database credentials.

## Explicit installation and verification

Installation is separate from Knex and never runs on application startup. A
shared/live operation still requires release authorization. Supply the DBA's
credentials through the approved protected backend environment for installation
only. Never put passwords in arguments, committed files or evidence.

```bash
pnpm --dir backend schema:lifecycle install \
  --target '<configured-host>:<port>/<database>' \
  --runtime-user '<existing-website-sql-user>' \
  --runtime-host '<its-exact-mysql-account-host>'
```

The account host identifies the MySQL account, not the connection destination.
The account must exist. The installer creates only an absent function, checks
its actual owner-visible body and attributes, verifies invocation and grants
only its EXECUTE permission. Identical state makes retry safe. Unknown/altered
state is preserved and refused. A lost response may leave the function or grant
installed: retry the exact command rather than replacing/dropping state. MySQL
binary logging may require the DBA's existing function-creation authority; the
tool never changes logging/trust settings or elevates itself.
MariaDB installation also requires its existing session SQL mode to include
`NO_AUTO_CREATE_USER`, preventing GRANT from creating an account after a race.

For a fresh installation, create/select the database and existing SQL account
through the normal owner procedure, then install v2 **before website bootstrap**
and forward migrations. No website table is required: this helper reads only
system metadata. It is independent of the baseline/provenance tables, so the
dependency is not circular. For an upgrade install v2 before preflight/new code.
Keep writers and concurrent DDL/grant changes stopped throughout authorized
offline adoption/cutover. The guard does not make nontransactional DDL concurrent-safe.

Restore normal website credentials, then run:

```bash
pnpm --dir backend schema:lifecycle \
  --target '<configured-host>:<port>/<database>'
NODE_ENV=production pnpm --dir backend exec tsx src/scripts/productionPreflight.ts --dependencies
```

These checks verify authoritative metadata access, not approved deletion or
absence of every table's side effects. Each lifecycle write checks its actual
targets under transaction metadata locks and refuses any trigger or incoming
reference, including references from another schema. No result is cached.
Missing rights/function, authority/parameter/security drift, unknown body digest,
malformed output or unavailable metadata refuses the write.

Baseline verification checks each source-owned target through v2; even
schema owners must supply the same proof. Session migration checks triggers and
incoming references before clearing credentials. Direct caller grants, roles,
or an ordinary empty catalog result never substitute for this proof. The checks
assign no additional website table, DDL, trigger or global privileges.

Ordinary runtime credentials cannot inspect routine bodies on either qualified
engine. The runtime digest comes from the function inspecting its actual stored
definition; the privileged installer independently verifies that body. This
detects accidental DDL drift. It is not a signature or a defense against a
malicious DBA substituting a dishonest implementation. DBAs are trusted here,
as they already control DDL, grants and data. See
[routine definition visibility](https://dev.mysql.com/doc/refman/8.0/en/show-create-procedure.html).

## Qualification and recovery

```bash
TEST_LIFECYCLE_METADATA_DB_PORTS=23436,23437 pnpm --dir backend test --runInBand \
  src/db/__tests__/lifecycleMetadataNative.test.ts
```

This opt-in creates named disposable databases/accounts on those qualification
ports, removing only successfully created fixtures. It proves restricted access,
hidden cascades, engine-specific trigger visibility, real CLI access, revoked
authority/execution, changed security/body and missing-function refusal. Never
use shared database services. Retention/hold fixtures also require the explicit
owner-installed helper before bootstrap, forward migrations and preflight.
Schema authority qualification additionally runs with
`TEST_SCHEMA_AUTHORITY_DB_PORTS=23436,23437` and
`TEST_BASELINE_MUD_SOURCE=<pinned-owner-migrations-directory>` against
`src/db/__tests__/schemaTriggerAuthorityNative.test.ts`. It covers real baseline/
cutover paths, hidden triggers/cascades, website CRUD without DDL/TRIGGER/global
grants, helper loss/version transition, owner triggers and unchanged owner schema.
MariaDB can hide FK-rule metadata from a SELECT-only principal; verification
refuses incomplete hashes rather than weakening the schema contract. Do not
change the schema to address missing visibility. A pure SELECT-only auditor is
not a portable full-schema verification profile; ordinary website CRUD is
separately qualified.

On failure preserve the routine and compare it as the DBA with
`lifecycleMetadataBody` in `backend/src/db/lifecycleMetadata.ts`. Do not grant
broad website rights, trust ordinary zero counts or bypass the guard. Errors
omit raw driver details; the CLI prints a static category and UUID reference.

For authorized rollback, stop lifecycle writers and retain their protected
progress/holds. Revert only to application behavior that keeps those operations
disabled. Once the DBA verifies the exact owned function and no remaining
caller, `DROP FUNCTION web_lifecycle_metadata_v2` removes it and its routine
grants. No account removal, data restoration or automatic rollback is performed;
new callers fail closed without the helper.
Retain v1 while any compatible caller still needs it. Removing that exact owned
routine is a separate verified DBA action after all old callers are drained;
the installer does not remove it or restore application rows.

This source prerequisite is not approved retention, complete archive protection,
erasure, backup replay or production acceptance.

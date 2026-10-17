# Development Guide

Lifecycle hold/control and SQL-cleanup writes require the explicit DBA-installed
[metadata guard](runbooks/lifecycle-metadata.md). The website credential receives
only EXECUTE on its read-only function; filtered catalog counts cannot prove
absence of triggers or external-schema references. Install it in isolated native
fixtures before dependency preflight. Startup never installs it or grants rights.

DurisWeb contains independent `backend/` and `frontend/` pnpm projects. There
is no root workspace manifest. Complete [Onboarding](onboarding.md), including
all three environment files, before running `./scripts/dev.sh`.

## Backend commands

| Command | Purpose |
|---|---|
| `pnpm --dir backend config:check` | Aggregate and report invalid backend configuration without connecting to dependencies |
| `pnpm --dir backend dev` | Run the TypeScript service with nodemon |
| `pnpm --dir backend build` | Compile TypeScript |
| `pnpm --dir backend test --runInBand` | Run Jest serially |
| `pnpm --dir backend format:check` | Check Biome formatting |
| `pnpm --dir backend lint` | Run ESLint |
| `pnpm --dir backend type-check` | Check TypeScript without output |
| `pnpm --dir backend verify:mud-writes` | Fail when a DurisWeb write to a MUD-owned table is missing from `backend/mud-write-allowlist.json` |
| `pnpm --dir backend migrate:status` | Inspect the selected Knex ledger |
| `pnpm --dir backend retention:preview --help` | Read-only proposed-age counts, explicit target/version and private continuation; see the [runbook](runbooks/retention-preview.md) |
| `pnpm --dir backend retention --help` | Defaults to read-only preview; separate SQL execution requires reviewed source approval and explicit SQL/cache targets; see the [runbook](runbooks/retention-execution.md) |

## Frontend commands

| Command | Purpose |
|---|---|
| `pnpm --dir frontend dev` | Run the configured Vite development server |
| `pnpm --dir frontend config:check` | Validate public and Vite configuration without starting a server |
| `pnpm --dir frontend build` | Type-check and build `dist/` |
| `pnpm --dir frontend preview` | Run the configured Vite preview server |
| `pnpm --dir frontend test:unit --run` | Run Vitest once |
| `pnpm --dir frontend format:check` | Check Biome formatting |
| `pnpm --dir frontend lint` | Run ESLint |
| `pnpm --dir frontend type-check` | Check Vue/TypeScript projects |
| `./frontend/scripts/check-palette-literals.sh` | Reject raw gray/cyan/zinc/slate/neutral/stone classes outside game-color tables |

On the production host, `frontend/dist` in the checkout is the live site, so a
`build` or `build-only` there publishes immediately. Build releases in a
detached worktree as [deployment](deployment.md#build-and-validate) describes.

## Theme and colors

The canonical [Design guide](DESIGN.md) covers the eclipse palette,
typography, components, layout, content, accessibility, and game-color
exceptions. Start with [colors and surfaces](DESIGN.md#colors-and-surfaces)
when changing tokens, and use its [verification guide](DESIGN.md#verification)
for UI work.

### Homepage assets and configuration

See [homepage assets and configuration](DESIGN.md#homepage-assets-and-configuration)
and [interaction and accessibility](DESIGN.md#interaction-and-accessibility)
in the Design guide. This heading remains so existing documentation links keep
working.

## Temporary planning workspace

`docs/ongoing-projects/` is a temporary human workspace. Before deleting a
working document, verify its claims, put still-actionable gaps in the issue
tracker, and integrate only accurate, nonduplicated contributor or operator
guidance into permanent documentation. Completed checklists, release diaries,
old host identities and speculative designs do not belong in lasting guides.
Keep sensitive release evidence and recovery artifacts outside the checkout.

## Complete quality matrix

```bash
./scripts/check-config-literals.sh
pnpm --dir backend config:check
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend verify:mud-writes
pnpm --dir backend schema:check
pnpm --dir backend test --runInBand
pnpm --dir backend build
pnpm --dir frontend config:check
pnpm --dir frontend format:check
pnpm --dir frontend lint
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
```

## Database contract checks

`pnpm --dir backend schema:check` validates the source-owned
[website schema bundle](../backend/schema-baselines/README.md) and its historical
checksums without opening a database connection. This is input verification,
not bootstrap, ledger adoption, or a change to Knex migration discovery.
Use the separate target-confirmed `schema:baseline` procedure for installation
or adoption. Knex verifies provenance before skipping covered unapplied history;
existing applied names stay visible, and later migrations still run normally.

`backend/mud-write-allowlist.json` is the operation-level inventory for direct
DurisWeb writes to MUD-owned tables. `verify:mud-writes` scans non-test backend
sources and fails on an unclassified or stale statement, a dynamic table target,
or divergence between its copied table fingerprint and the MUD migration
manifest. Classification documents a legacy or coordinated boundary; it does
not authorize new direct writes. The stable `DB-*` labels are defined in the
[shared database contract](ARCHITECTURE.md#shared-database-contract).

The verifier discovers standard CI and sibling-checkout layouts. For another
layout, pass its manifest explicitly as `--mud-manifest <path>`; this is a
tooling argument, not an application environment variable.

Knex loads only TypeScript migrations. Every excluded `.sql` artifact is
classified in `backend/migrations/sql-artifacts.json`, and production
configuration preflight rejects missing or stale classifications. Do not enable
all file extensions or replay the SQL set: it includes MUD-owned definitions,
one-off data repair, and legacy web definitions now covered by the versioned
baseline. The historical chain is not a zero-to-current bootstrap. The write
verifier also checks the complete baseline bundle's ownership and source
inventory; parameterized installer targets come only from that reviewed bundle.

For database tests, copy `backend/.env.test.example` to `backend/.env.test` and
use isolated credentials/data. Source-text security tests pin sensitive
boundaries; update them only when the new structure preserves the policy.

Auth/session tests create and remove synthetic accounts in that isolated
database; they do not require an existing player account. The PvP SQL contract
tests additionally require `TEST_PVP_DB_PORT` in `.env.test`, selecting a
disposable loopback MariaDB/MySQL instance with passwordless `root` access.
They create and drop only `pvp_snapshot_test` and refuse ports 3306 and 3307.
Leave the setting absent for a unit-only run; a full burn-in must provide the
disposable instance and run these checks without skips.

Image-removal integration tests use `TEST_IMAGE_DB_PORT`, loopback port 23436
or 23437 and database `durisweb_qualification_image_suite`. Provision the full
owner fixture plus the website baseline/forward migrations on that disposable
target; the suite refuses a different database or port. It exercises real
transactions, HTTP/CSRF, concurrent publication, retry and migration recovery
with a fake object-storage provider. It never contacts R2. Leave the setting
absent for a unit-only run; report skipped native coverage explicitly.

Retention-preview native tests use `TEST_RETENTION_DB_PORT` with the separately
provisioned full-schema `durisweb_qualification_retention_suite` on loopback
23436/23437. They exercise both database families, actual SELECT-only CLI
processes, hold scopes and same-snapshot ordering, changed-protection refusal,
offset/cutoff boundaries, private continuation, scale query plans and
unchanged rows. The opt-in is independent of image and privacy test databases;
absent opt-in skips these native cases.

The dedicated preview reader selects only `page_views`, `account_login_history`
and `web_data_holds`. MariaDB 11.8.9 additionally needs database-level `SHOW VIEW`
to expose CHECK metadata to the strict verifier; this is metadata visibility,
not a data-write grant. The CLI does not grant privileges or relax fingerprints.

Hold-record/API tests independently opt in with `TEST_DATA_HOLD_DB_PORT` for
`durisweb_qualification_hold_suite` on loopback 23436/23437. They use the full
owner/baseline/forward fixture and actual session/JWT, Overlord gate, CSRF and
hold transactions. Only the separate MUD account/role readers are stubbed;
no MUD row, file or process is changed. See the [hold runbook](runbooks/data-holds.md)
for the explicitly incomplete enforcement boundary.

Retention-execution tests independently opt in with
`TEST_RETENTION_EXECUTION_DB_PORT` (23436/23437), exact database
`durisweb_qualification_retention_execution_suite`, loopback
`CACHE_REDIS_PORT=23479` and `CACHE_REDIS_DB=13` (MySQL) or `14` (MariaDB). Provision a
disposable full owner/baseline/forward fixture. The private runner first confirms
that its cache database is empty and marks ownership with
`retention-execution-fixture-owner`; the suite refuses an unmarked target.
Never point it at a shared cache/database. These cases use a synthetic approved
policy inside Jest only, actual SQL/Redis, worker/hold concurrency and failure
injection. The actual child CLI still proves refusal before I/O with the shipped
source flags false. Unit-only runs skip this suite; no configuration variable
approves or enables retention. Historical analytics reads are SQL-only.

Do not commit `.env` files, dumps, account data, generated deployment output,
or backup archives. See [Configuration and Environments](environments.md) before
adding any new setting.

## Local MUD process monitoring

Process monitoring selects one `dms` or `dms_new` process whose working directory
is the canonical `MUD_DIR` and whose executable is under its `bin/server/`
(or its supported legacy `dms` path).
Regression fixtures and other checkouts are excluded. Missing, malformed, exited,
or ambiguous candidates report stopped. Uptime comes from the same process
snapshot as the PID, so process exit cannot turn an empty second lookup into an
invalid boot timestamp during WebSocket reconnection.

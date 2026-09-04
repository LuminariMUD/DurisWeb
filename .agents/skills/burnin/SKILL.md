---
name: burnin
description: >-
  Exhaustively qualify and repair a DurisWeb checkout in either isolated development or
  explicitly authorized live-production mode, including source gates, fresh backend/frontend
  builds, early forward migrations, dependency checks, runtime smoke tests, and recovery-safe
  service handling. Use for an explicit full burn-in or stability pass, not routine focused
  validation.
---

# Burn in DurisWeb

Drive the selected environment to one uninterrupted clean end-to-end pass after the last repair.
Do not treat separate partial passes as a clean burn-in.

## Preserve the architecture

Do not introduce new architecture during a burn-in unless it is critical. Work within and repair
the existing architecture. New architecture includes adding required packages or services, host
security profiles, service or network topology, persistence systems, or new mandatory deployment
gates. Hardening preferences, optional-feature failures, and making the burn-in pass more cleanly
are not critical. Critical means necessary to prevent active or imminent data loss, security
compromise, or production unavailability when the existing architecture cannot adequately address
the risk. If new architecture is critical, make only the smallest necessary change and record why
the existing architecture was insufficient.

## Select the target

Require the user to select `development` or `production`. If the request is ambiguous, inspect only
read-only state and ask before stopping a service, replacing an artifact, or connecting to a live
dependency. Never infer permission for production work from the checkout path or `NODE_ENV` alone.

From the repository root, inspect the worktree and read `README.md`, `docs/development.md`,
`docs/environments.md`, and the relevant mode reference:

- For development, read [references/development.md](references/development.md).
- For production, read [references/production.md](references/production.md) and all of
  `docs/deployment.md` before changing live state.

Production means the assets and dependencies actually selected by the active production unit:
its protected environment, `backend/dist`, `frontend/dist`, database, cache, MUD bridge, local
listener, and public ingress. A clone, preview server, mocked dependency, or disposable rehearsal
may provide prerequisite evidence but cannot prove a production burn-in passed.

## Control configuration precedence

Before any configuration check, Compose command, migration, build, test, preflight, or runtime
start, inventory which recognized DurisWeb variables are exported without printing their values.
Derive the names from the root, backend, frontend, test, and deployment environment contracts; also
account for Docker/Compose controls and every Vite mode file. Run commands from a scrubbed
application environment so only the deliberately selected mode files and explicit `NODE_ENV` can
supply those values; retain unrelated tool/session variables. This is required because process
variables override dotenv files and Compose/Vite inputs.

Read back the resolved non-secret mode, host, port, database name, Redis database/namespace, public
origins, and artifact/service paths before connecting. Compare that identity with independent
service, container, listener, and operator-provenance evidence. A loopback address, plausible name,
or valid `config:check` result does not prove a target is disposable or production.

## Run migrations early

Immediately after resolving each target database, inspect its migration status and record the exact
pending TypeScript migration names. DurisWeb's historical chain cannot bootstrap an empty MUD
schema: require an operator-approved compatible baseline rather than replaying legacy SQL.

Record hashes as well as names for every pending migration. Bring every disposable test database
forward before a database-backed suite, and bring the selected development database forward before
starting the development application. In production, discover pending work at the start, complete
the candidate build and backup/rehearsal gates in the production reference, then apply only that
identical rehearsed set before the production dependency preflight or service start. Recheck status
immediately afterward. No build, dependency preflight, or runtime pass can compensate for pending
or unverified migrations.

## Shared source gates

Record the exact commit, branch, worktree state, Node and pnpm versions, and installed lockfile
state. Preserve unrelated changes and never print environment values, credentials, player data, or
database rows. Read only the non-secret fields needed to establish environment identity and target
ownership.

In development, run these from the selected checkout. In production, run them first from the exact
protected candidate workspace required by the production reference; this list is not permission to
install into an active live checkout before recovery exists. Install both packages with their frozen
lockfiles, then run every maintained source gate:

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
./scripts/check-config-literals.sh
pnpm --dir backend config:check
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend verify:mud-writes
pnpm --dir frontend config:check
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
```

Run the full backend and frontend suites too:

```bash
NODE_ENV=test pnpm --dir backend test --runInBand
pnpm --dir frontend test:unit --run
```

Before the backend suite, remove inherited DurisWeb application variables from the test process,
then supply a complete `backend/.env.test` whose database/cache endpoints and names have been
read back without secrets and proven disposable. The test loader lets exported variables override
`.env.test` and lets `backend/.env` fill omissions; `NODE_ENV=test` by itself is therefore not
isolation. Refuse to run if any resolved test dependency could be production. Against the isolated
test database, run `migrate:status`, `migrate:latest`, and `migrate:status` before Jest; verify that
only the recorded pending set ran and none remain. Never use the production database or Redis for
Jest or test migrations.

Inspect complete output even when a command exits zero. Treat errors, warnings, crashes, hangs,
unexpected skips, open handles, flaky results, and credible defects as findings. Fix root causes
narrowly, add or update a focused regression for changed behavior, and do not weaken gates or hide
diagnostics. After a repair, run its focused check, the complete affected gate, and finally the
entire migration preparation, shared matrix, and selected mode's fresh-build and live sequence
again. Never edit a migration already recorded in a target ledger; add a new forward corrective
migration and rehearse/apply it through the same mode workflow.

## Completion

Finish only when the final source matrix, a fresh build, dependency checks, runtime acceptance,
log review, and stability soak all pass consecutively on the selected target after the last change.
Leave a successfully burned-in target healthy and running unless the user requested otherwise.
Unavailable credentials or another omitted required acceptance surface makes the result partial,
not clean.

Report the selected mode; starting and ending commits/worktree state; every command and result;
test counts and skips; repairs and regressions; artifact identities; dependency and endpoint
checks; log sources and observation interval; runtime/service state; and any genuine blocker.
Never describe skipped, substituted, rolled-back, or partial coverage as clean.

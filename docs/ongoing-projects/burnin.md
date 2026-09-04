# Production Burn-In Journal

## Scope and authority

- Started: 2026-09-04 UTC.
- Target: the live production assets selected by `durisweb-production.service`.
- Authority: full production DurisWeb burn-in, including the reviewed forward migration set,
  production artifact replacement, and recovery-safe application/tunnel service handling.
- Explicit boundary retained from the burn-in contract: no down migrations, ledger edits, manual
  schema changes, database restores, unsafe MUD-owned-table operations, configuration/credential
  changes, or restarts of the database, Redis, MUD, or unrelated ingress services.
- The separate DurisMUD repository is read-only evidence unless separately authorized.
- Sensitive values, credentials, player data, database rows, and IP addresses are intentionally
  excluded from this journal.

## Starting state

- Branch/commit: clean `master` at
  `71ae0e98d785c8cdc5a64e3a24dfca9689b319b7`, tracking `origin/master`.
- Commit timestamp/subject: `2026-09-04T11:23:54+03:00`, “Merge pull request #28 from
  LuminariMUD/fix/issue-14-item-topology-mismatches”.
- Toolchain: Node `v22.23.2`; pnpm `10.15.1`.
- Package lockfiles: backend 293981 bytes (mtime `2026-09-02 11:23:25.900398693 UTC`), frontend
  319910 bytes (mtime `2026-09-02 20:24:20.690228384 UTC`).
- Environment files present: mode-0600 `backend/.env`, `backend/.env.test`, and `frontend/.env`;
  checked-in example contracts are mode 0664.
- Live application unit: `durisweb-production.service`, active/running, result `success`, main PID
  `2293560`, active since `2026-09-03 19:48:39 UTC`, `NRestarts=0` at discovery.
- Unit identity: fragment at the service account's rendered application-unit link, working
  directory `<production-checkout>/backend`, protected backend environment file, entrypoint
  `<production-checkout>/backend/dist/index.js`; pre-start also requires
  `<production-checkout>/frontend/dist/index.html`.
- Unit dependencies at discovery: requires `durisweb-redis.service`; wants
  `duris-mariadb.service`; orders after MariaDB, Redis, and `duris-mud-production.service`.
- Other active named units include the DurisWeb private Redis and Cloudflare tunnel, DurisMUD
  Redis, and DurisMUD Cloudflare tunnel.
- Pre-existing finding: failed transient unit `durisweb-burnin-redis-20260903.service`. It is not
  in the live application unit's dependency graph and will be investigated before a new rehearsal.

## Command log

All commands were run from `<production-checkout>` unless noted. Output was reviewed in full unless
an entry says otherwise.

1. Read the complete burn-in skill and production reference, then `README.md`,
   `docs/development.md`, `docs/environments.md`, `docs/deployment.md`, `docs/CONVENTIONS.md`, and
   `docs/SECURITY-COMPLIANCE.md`. Result: production workflow, recovery requirements, migration
   boundary, source matrix, acceptance matrix, and soak requirements established.
2. `git status --short --branch`; `git rev-parse HEAD`; `git branch --show-current`;
   `git log -1`; `git diff --stat`. Result: clean starting worktree and identity recorded above.
3. Inventory environment-file metadata without values. Result: protected runtime/test/build inputs
   are present with the modes recorded above.
4. `node --version`; `pnpm --version`; lockfile `stat`. Result: toolchain and lockfile state recorded
   above.
5. User-systemd unit inventories plus `systemctl --user cat/show durisweb-production.service` for
   selected non-secret properties. Result: live target, artifact paths, dependency graph, and
   starting process state recorded above.

## Pending gates

- Recreate the exact-source candidate after the source repairs, repeat the full source matrix and
  fresh builds, and repeat the test/production-clone migration sequences from clean restores.
- Resolve the fail-closed wiki publication blocker: one committed MUD world source is not UTF-8.
  The MUD repository remains read-only under current authority, so no complete wiki generation may
  be published until that separate asset is corrected or the scope is explicitly changed.
- Resolve the missing configured terminal sandbox executable. Host package/configuration changes
  are outside the burn-in authority currently granted.
- Only after every blocking gate passes, perform the controlled live build/migration/cutover,
  complete public/browser/authenticated acceptance as available, and run the uninterrupted soak.

## Discovery evidence and findings

- Recognized ambient application/Vite variables: none. Only unrelated session `PATH` and `SHELL`
  matched the broad contract-token inventory, so they remain available to tools. There are no
  ambient `VITE_*` exports. Production commands will explicitly select `NODE_ENV=production`;
  isolated commands will use complete protected test/clone files without production fallback.
- All 48 keys in protected `backend/.env` match the running main process. Non-secret identity:
  `NODE_ENV=production`, loopback application/database/cache/MUD endpoints, app port 7770,
  MariaDB port 3307 and schema `duris`, private cache port 7778/database 0, MUD Redis port
  6380/database 0/namespace `duris:production:main`, `MUD_DATABASE_MODE=shared`, the configured
  site/API origin, the configured public static origin, and `<selected-MUD-checkout>`.
- Frontend production input precedence consists only of mode-0600 `frontend/.env`; all local,
  production-specific, and development-specific Vite mode files are absent, and ambient Vite
  overrides are absent. Public build inputs select `/`, the configured HTTPS API origin,
  its WSS application endpoint, and the configured static origin; allowed names are the configured
  apex and www alias.
- All optional integrations (donations, R2, push, Gemini, guild sync) are disabled. MUD Redis and
  the MUD WebSocket bridge are enabled. All four unsafe mutation gates are unset/closed.
- Rendered deployment selection is mode 0600, owned by the service account, and enables the
  DurisWeb Cloudflare tunnel while disabling Nginx. The selected unit links resolve into the
  protected render output's `systemd/` directory.
- The app/tunnel graph is verified: `durisweb-cloudflared.service` is `BindsTo=` and `PartOf=` the
  application. App, tunnel, private cache, database, MUD, MUD Redis, and MUD tunnel were all
  active with `Result=success` and `NRestarts=0`; the expected application/database/cache/MUD
  listeners were owned by the expected PIDs.
- Production terminal defect: configured `/usr/bin/bwrap` is absent; no executable named `bwrap`
  is installed under `/usr` or the service account's local tool tree. The admin terminal cannot be
  accepted unless separately authorized host-software/configuration work resolves this.
- Current artifact identities before mutation: backend entrypoint SHA-256
  `8fa8945b0725c4467b64836248721dc1fca2934046d1b4da8b9cf7ca1fc01977`; frontend index SHA-256
  `517649fa32750f2f06e379bec8bbb90af6ac2752e52e8d4b137d8a05f402482b`; deterministic backend
  tree digest `27b6677fba02f16521ee865a3e48187b26b7b524b3e1a0c76a2eae1e2713ed96`; frontend tree digest
  `0c00eae9d1164eb4f4130ce9f6a51607248e9fe036d10ee2536cbe5196872a9b`. Referenced assets are
  `index-Bzx-7WD6.js`, `index-DWnzV8Lv.css`, and `vendor-vue-BiZOgzBM.js` under `assets/`.
- Runtime/artifact drift: the app PID began at `2026-09-03 19:48:39 UTC`; current backend `dist`
  entrypoint mtime is `2026-09-03 20:45:33 UTC`, and the current source commit is newer still.
  Thus the old running process cannot prove current-source behavior. The frontend is read from disk
  and will be independently checked by asset identity.
- Read-only MariaDB identity: `10.11.14-MariaDB-0ubuntu0.24.04.1`, schema `duris`.
  `knex_migrations` and `knex_migrations_lock` exist; the historical lock table columns are
  `index,is_locked`; it contains exactly one unlocked row. The ledger has 82 entries, every applied
  entry exists in source, and exactly one of 83 checked-in TypeScript migrations is pending:
  `20260904010000_create_wiki_reference_generations.ts`, SHA-256
  `5c63d021ea747b1d9e31240bb4a26ba8bb49a994aad177714dcf3aebbb3ff954`.
- Procedural deviation: the first read-only invariant query assumed a conventional lock-table `id`
  column and failed with `ER_BAD_FIELD_ERROR` without mutation. The same shell invocation used a
  sequential separator, so the read-only Knex `migrate:status` ran after that failure and confirmed
  the one pending migration before the corrected read-only invariant proof completed. No migration
  was applied. The corrected query inspected the actual table columns and proved the required
  one-row/unlocked invariant.
- Pending migration scope: creates only DurisWeb-owned `wiki_reference_generations` with a reversible
  `down`; it does not touch a MUD-owned table. Current production has `wiki_objects` and `wiki_mobs`
  but both contain zero rows, and the generation table is absent. The current compiled dependency
  gate and wiki detail fallback therefore cannot pass until the reviewed migration and atomic wiki
  publication complete.
- Selected MUD evidence: checkout clean, branch `master`, commit
  `caeaecb0dd2a68a802702bcbc997ad4febd81631`, tree
  `0fae9afac06ffdd1427cccc8a85391e453eb7a1d`. No MUD file has been changed or MUD service operated.
- Baseline health: local and public `/health` both returned structured backend identity with
  database/cache `ok` before mutation.

## Additional commands completed

6. Derived recognized variable names from all root/backend/frontend/test/deployment contracts and
   every Vite mode file; inventoried ambient names only; parsed allowlisted non-secret protected
   values; compared every backend file key to `/proc/<main-pid>/environ`. Result: precedence and
   identity findings recorded above; no secret values printed.
7. `systemctl --user show` for app, tunnel, private cache, MariaDB, MUD, MUD Redis, and MUD tunnel;
   resolved unit symlinks; inspected listener ownership and process working directories. Result:
   live service graph recorded above.
8. Resolved and inspected `TERMINAL_SANDBOX_BIN`; searched executable paths/package state. Result:
   configured executable absent and no alternative installed.
9. Fingerprinted live `backend/dist`, `frontend/dist`, index references, and installed dependency
   inventories. Result: identities recorded above.
10. Inspected the prior 2026-09-03 burn-in state and failed transient Redis unit. Result: reusable
    acceptance/soak harness exists; the old first Redis launch failed because its private shared
    library path was omitted, exactly matching the documented loader warning. It is not live.
11. Direct read-only MariaDB queries followed by `NODE_ENV=production pnpm --dir backend
    migrate:status`. Result: invariant, ledger, and pending set recorded above; procedural deviation
    documented above.
12. Read the pending migration and related publisher/preflight references; recorded current MUD Git
    identities read-only; queried only wiki table presence/counts; probed local/public structured
    health. Result: migration is web-owned, wiki projection is empty, MUD checkout is clean, and
    baseline health is green.
13. Created `<protected-release-root>`; captured protected configuration/unit snapshots; archived
    both pre-burn-in artifact trees and dependency trees; created SHA-256 manifests. Result: complete
    rollback/reconstruction inputs preserved without journaling secrets.
14. Created a fresh transaction-consistent `mariadb-dump`, ran `gzip -t`, restored it independently
    into two private MariaDB instances, compared aggregate schema/count/ledger identities, and ran
    `mariadb-check`. Result: backup is readable and both restores match production.
15. Started private clone/test Redis instances with isolated credentials; ran scoped `PING` checks.
    Result: every candidate cache identity is reachable without production cache use.
16. Ran frozen backend/frontend candidate installs, native module imports, `config:check`,
    `verify:mud-writes`, `format:check`, `lint`, `type-check`, backend `test --runInBand`, frontend
    `test:unit --run`, and fresh package builds. Result: initial candidate matrix passed.
17. Ran `migrate:status`, `migrate:latest`, and `migrate:status` against both restored databases.
    Result: exactly the reviewed migration applied as batch 4; 83 complete, none pending.
18. Ran the documented and then corrected `wiki:publish` invocations, aggregate-only SQL checks, and
    compiled dependency preflight on the production clone. Result: the bad invocation failed before
    writes; corrected publication exposed the empty flag projection/species blocker.
19. Ran `sync-flags`, corrected `wiki:publish`, and compiled dependency preflight on the disposable
    clone. Result: the corrected operational order passes when tolerant pre-repair publication is
    used; source-drop warning remained and was investigated.
20. Read the DurisWeb parser/synchronizer/publication code and the DurisMUD race table/loader; ran
    byte-level encoding checks and a tracked runtime-flatfile UTF-8 scan. Result: authoritative race
    mappings are correct; exactly one relevant source file contains two invalid bytes.
21. Applied focused DurisWeb repairs with `apply_patch`; ran the three focused Jest suites,
    `format:check`, and `type-check`; corrected formatter-only differences with `apply_patch` and
    reran. Result: 32 focused tests and both checks pass.
22. Mechanically synchronized all Git-tracked repaired files into the candidate; compared all 1,083
    hashes; archived the exact tracked source; reran the full source matrix listed in step 16.
    Result: exact-source manifests match and every backend/frontend gate passes.
23. Dropped and recreated only the two disposable schemas, restored the validated dump into each,
    reran both three-step migration sequences, reran the full backend suite on the freshly migrated
    test database, and checked status again. Result: clean independent migration/test evidence.
24. Moved only prior candidate output trees into protected artifacts, rebuilt both packages from
    absent `dist` directories, hashed every output file, and ran compiled configuration preflight.
    Result: final artifact evidence recorded below.
25. Ran final clone `sync-flags`, repaired `wiki:publish`, aggregate SQL, dependency preflight, and
    both database checkers. Result: publication fails closed before SQL on the invalid input and the
    database remains consistent.
26. Extracted the protected pre-repair source and exact pre-burn-in backend artifacts into a private
    rollback directory; on the disposable clone only, published the tolerant projection and ran old
    and candidate compiled dependency preflights. Result: rollback artifacts accept the migrated
    schema and both preflights pass.
27. Reran production `migrate:status`, aggregate-only database state inspection, unit state/hash
    checks, and local/public health. Result: production remains unmodified and healthy.
28. Stopped the four explicitly named disposable MariaDB/Redis units and rechecked every live unit
    plus health. Result: disposable services inactive/success; live services unchanged.
29. Reran `check-config-literals.sh`, `git diff --check`, worktree inspection, and live-unit activity
    checks. Result: final static guards pass and all intended edits are enumerated below.
30. Revalidated the blocked boundary on the next goal continuation: resolved `bwrap`, checked the
    selected sandbox setting by name only, inspected MUD Git identity/UTF-8 validity, production
    migration status, application state, health, literal guard, and diff whitespace. Result: both
    blockers and every production invariant were unchanged.
31. Inspected the environment parser, static production preflight, rendered unit contract,
    terminal service, documentation, and existing preflight tests. Result: the static gate checked
    only that `TERMINAL_SANDBOX_BIN` was an absolute path; it did not verify host existence/type/mode.
32. Added a connection-free regular-file/executable check to production configuration preflight;
    updated tests and environment/deployment documentation; ran the two focused Jest suites plus
    backend formatting, lint, type checking, literal guard, and `git diff --check`. Result: 18 focused
    tests pass and absent sandbox now maps to static refusal status 78.
33. Reconstructed the stopped disposable test MariaDB from its protected data directory. An initial
    Redis reconstruction incorrectly used the production launcher, which requires a password and
    runtime directory even though the isolated test contract is intentionally no-auth; that transient
    process exited without creating a listener. The corrected explicit no-auth test Redis command
    started with the recorded library path. A first `redis-cli` probe omitted that library path and
    failed client-side; the corrected probe returned `PONG`. No production process was involved.
34. Resynchronized and compared all 1,083 tracked source files, archived them, reran the complete
    backend/frontend source matrix, rebuilt both packages from absent output directories, asserted
    compiled configuration refusal status 78, rechecked test migration status, then stopped both
    reconstructed test services. Result: full matrix/build green, 83 test migrations/none pending,
    and production remains healthy/unmodified.
35. Performed the third consecutive blocked-boundary audit. Resolved the configured sandbox binary,
    rechecked MUD worktree/commit/tree and strict UTF-8 decoding, executed the compiled candidate
    configuration preflight, inspected production migration/unit state, probed local/public health,
    and reran literal/whitespace guards. Result: the host binary remains absent, `newhaven.wld`
    remains invalid UTF-8 at the unchanged clean MUD identity, candidate preflight exits 78,
    production remains at 82 migrations with exactly the reviewed migration pending, every live
    service retains its original PID/restart state, both health probes return 200, and static guards
    pass.
36. Revalidated the resumed host boundary after the operator installed bubblewrap. The package is
    installed at `/usr/bin/bwrap` as version `0.9.0-1ubuntu0.1`; the prior compiled candidate's
    executable-only configuration preflight passes.
37. Ran a no-op bubblewrap launch with the user, IPC, UTS, cgroup, network-sharing, mount, and
    working-directory pattern used by the administrative terminal. Result: runtime setup fails at
    the UID map with permission denied. Independent readback shows unprivileged user namespaces
    enabled, AppArmor enabled with its additional unprivileged-userns restriction enabled, no
    bubblewrap attachment, and an independent `unshare --user --map-root-user` probe failing at the
    same UID-map boundary.
38. Ran the same no-op bubblewrap probe under the already-loaded `userbindmount` AppArmor profile,
    which is unconfined except for an explicit `userns` grant. Result: the sandbox succeeds, proving
    bubblewrap and the kernel namespace implementation work and isolating the missing executable
    attachment as the remaining host issue. This unrelated profile was diagnostic only and was not
    substituted into production configuration.
39. Repaired the production preflight to verify bubblewrap identity and execute a bounded no-op
    namespace probe; added a focused failure regression, a maintained executable-specific AppArmor
    profile, and deployment/configuration guidance. The two focused suites pass with 19 tests, Biome
    accepts all three touched TypeScript files, `git diff --check` passes, and the profile parses
    cleanly with AppArmor 4.0.1 when cache writes and kernel loading are disabled. An initial syntax
    command attempted the system cache and was denied before policy compilation; the corrected
    non-loading, no-cache command is the result counted here.
40. Mechanically synchronized the repaired checkout into the protected candidate and compared
    SHA-256 manifests across all 1,084 intended source files, including the new AppArmor profile.
    Result: live and candidate source match exactly. Both frozen installs were already current;
    pnpm repeated its existing ignored-build-script notices, so native imports and fresh builds were
    retained as the authoritative dependency proof.
41. Reran the non-database source matrix. Literal configuration, backend and frontend configuration,
    formatting, lint, and type checking passed; the frontend suite passed 34 files/121 tests. Two
    MUD-write verifier invocations were rejected before scanning, first because of an extra argument
    separator and then because the manifest path named the wrong repository location. The corrected
    invocation used the canonical MUD migration manifest and passed all 53 classified writes. The
    frontend chain outlived the first observation window; its existing process and evidence log were
    monitored to completion rather than restarted.
42. Restarted only the protected disposable test MariaDB and Redis on their previously proven
    loopback endpoints, verified authenticated database and cache readiness, and ran test
    `migrate:status`, `migrate:latest`, and `migrate:status`. Result: 83 migrations were complete
    before and after, none were pending, and `migrate:latest` made no change. The full backend suite
    then passed 101 suites/800 tests; its four error logs are the asserted preflight refusal cases
    and its sole warning is Node's existing experimental VM-modules notice.
43. Archived the prior candidate outputs and rebuilt from absent `dist` directories. A preliminary
    backend native-import command incorrectly included undeclared `esbuild` and stopped before
    compilation; the corrected declared-native-module probe passed, followed by both builds.
    Backend has 1,044 files with manifest SHA-256
    `d939637cc678370e09fa9694117a33edb485992f9f22496cff1221002d10f96f`; frontend has
    240 files with unchanged manifest SHA-256
    `903c69b02b1f64ac87d11918432f86c030481e26682744cf24b8c6a0d080c693` and main asset
    `assets/index-D28ltFkj.js`.
44. Ran the newly compiled candidate configuration preflight on the current host. It fails closed
    with status 78 and the precise required-namespace error, as designed. The two disposable test
    units were then stopped cleanly and both listeners closed. The untouched production service
    remains active on its resolved runtime port with PID `2293560`, `NRestarts=0`, and structured
    database/cache health passing.

## Isolated qualification and repair evidence

- Protected release root: `<protected-release-root>`, mode 0700, with mode-0600 snapshots under
  `config/`, `database/`, `artifacts/`, `dependencies/`, `source/`, and `evidence/`.
- Pre-burn-in artifact archives: backend SHA-256
  `4566d161a971cab9e14b57bfbf55d519d436342b34056435929a62d09f3fe641`; frontend SHA-256
  `b793b19c9657e98ae68fd5ca103b7dc1f2b9f5d39e052b3dd115b0ef2e9f8212`.
- Dependency reconstruction archives total 215 MiB; backend SHA-256
  `9b7e62df3e028fc4afab204173fa38c924ec9beb62a2996d3406d9ceaf8f6632`; frontend SHA-256
  `1c5a10d98a78f1d021970b5f617ff032002a5f16cb48513f58f1495ef7261bcb`.
- Initial transaction-consistent production dump: 22,829,924 compressed bytes, SHA-256
  `ff8a0c90fd15da8f405b657e6c92f5c74864764e719e4ee69e1db359e77a4c65`; compression test and
  dump stderr checks pass. A fresh final dump is still required immediately before any cutover.
- Two private MariaDB 10.11.14 instances and two private Redis instances were created on previously
  unused loopback ports for rehearsal and test work. Both database restores match production at 253
  tables, 1,625,379 summed rows, 2,339 columns, 941 indexes, 507 constraints, zero triggers,
  routines, or events, and metadata/count/ledger digest
  `dc26d57bd1b05b8810ad4c463302a34eebc20cd63e4175967bd98691879028ce`. `mariadb-check` passes all
  253 tables. Cache presence, general-cache, and test credentials each return `PONG` in their
  intended isolated service.
- Frozen candidate installs pass with 894 backend and 878 frontend packages, all reconstructed from
  the locked dependency graph. pnpm reported ignored native build scripts; direct `sharp`, `bcrypt`,
  and `node-pty` imports and both fresh builds pass, closing that warning.
- Candidate pre-repair source matrix passed configuration, 53 classified MUD-write callsites,
  formatting, lint, type checking, 101 backend suites/795 tests, and 34 frontend files/121 tests.
  Expected negative-path logs and Node's VM-module experimental warning were the only test output.
- Test-database migration rehearsal started with exactly the reviewed migration pending, applied it
  alone as batch 4, and ended at 83 applied migrations with none pending. Repeated status remained
  clean after the full test suite.
- Production-clone migration rehearsal likewise applied exactly the reviewed migration as batch 4
  and ended with no pending migration. The first wiki publication attempt used a documented pnpm
  invocation containing an extra separator; pnpm passed that separator to the script and source
  identity validation refused before a write. Repository deployment/backend documentation and a
  regression contract were repaired to use the pnpm-10-compatible invocation.
- The first correctly invoked clone publication staged and atomically published 20,158 objects and
  19,626 mobs, but dependency preflight then failed because every symbolic mobile race resolved to
  zero. Aggregate-only diagnosis proved that production's intentionally retained `builder_flags`
  projection was empty. The independent flag synchronizer was the missing operational prerequisite.
- Exploratory corrected clone sequence `sync-flags`, `wiki:publish`, dependency preflight passed:
  918 flags across 25 categories, 101 `mob_race` code rows, 20,158 objects, 19,626 mobs, 99 distinct
  published species including the zero/none value, and all 21 required-table/83-migration/cache
  dependencies healthy.
- That same staging run reported one skipped source under the zone index. Byte-level read-only
  diagnosis identified the actual input as `newhaven.wld`, not the `.zon` fallback shown by the old
  diagnostic: it contains two committed non-UTF-8 bytes. The MUD loader accepts raw bytes, while the
  documented DurisWeb filesystem boundary deliberately rejects invalid UTF-8. The MUD repository
  has not been edited.
- DurisWeb was repaired to fail closed before SQL when a wiki aggregate lacks applicable mobile
  class/race/flag metadata, and to refuse publication after any rejected source input. The zone
  index now reports the actual attempted sidecar. Operator documentation now requires the atomic
  flag sync before wiki publication. Focused regression verification passes 3 suites/32 tests.

## Procedural deviations during isolated setup

- Running `mariadb-install-db --version` unexpectedly attempted initialization at the system default
  data directory and failed permission checks. It did not change production. Subsequent disposable
  initialization used explicit private paths.
- One metadata capture used unsupported `START TRANSACTION READ ONLY WITH CONSISTENT SNAPSHOT` syntax
  and failed without mutation. A shell lacking `set -e` then printed a misleading local PASS label
  for a missing checker input. Neither result was counted; the corrected transaction and checker
  were rerun with fail-fast handling and produced the parity evidence above.
- The first isolated candidate policy invocation failed because recursive protective permissions had
  removed executable bits from seven tracked scripts. Only the Git-recorded executable modes were
  restored in the candidate, after which the policy ran.
- The literal-configuration guard found pre-existing production literals in reviewed documentation,
  including this rolling journal. Documentation was changed to portable symbolic names without
  weakening the guard; the guard then passed.

## Final repaired candidate qualification

- Repaired source was mechanically synchronized into the isolated candidate and compared across all
  1,083 Git-tracked files. The manifests are identical. The immutable tracked-source archive has
  SHA-256 `64f99213d3afcad2857cdc47709fcd46bfb4156c5eaed4ac001d9e8a4a63e834`.
- Exact repaired candidate source matrix: literal configuration guard pass; backend configuration
  pass; 53 classified MUD-write callsites pass; backend formatting, lint, and type checking pass;
  101 backend suites/798 tests pass; frontend configuration, formatting, lint, and type checking
  pass; 34 frontend files/121 tests pass.
- Both disposable databases were reset again from the validated production dump. Each began at 253
  tables, 82 ledger rows, and no wiki generation marker. Each applied only
  `20260904010000_create_wiki_reference_generations.ts` as batch 4 and ended with 83 completed
  migrations and none pending. The full backend suite then passed again against the freshly migrated
  test database; its final migration status remained clean.
- Fresh repaired builds started from absent output directories. Backend: native dependency imports
  pass, 1,044 files, artifact-manifest SHA-256
  `15921d92d271c90c1089d66e8f8ff91b89f5a5b95dfe52218e9092a3a34f041b`. Frontend: 240 files,
  artifact-manifest SHA-256
  `903c69b02b1f64ac87d11918432f86c030481e26682744cf24b8c6a0d080c693`, main bundle
  `assets/index-D28ltFkj.js`. Compiled candidate configuration preflight passes.
- Final clean-clone rehearsal: the flag synchronizer published 918 rows. Wiki publication then
  named `newhaven.wld`, refused exactly one rejected source input with status 1, and left
  `wiki_objects`, `wiki_mobs`, and `wiki_reference_generations` at 0/0/0. Dependency preflight
  correctly refused the unpublished generation. A follow-up aggregate query initially omitted the
  schema selection and failed read-only; the corrected query produced the recorded 918/0/0/0 proof.
- Relevant source scan checked all 1,955 tracked `.zon`, `.wld`, `.mob`, `.obj`, and `.shp` inputs.
  `newhaven.wld` is the only invalid UTF-8 text flatfile and contains exactly two non-ASCII bytes,
  both byte `0x92`. Binary/tool assets outside those runtime source extensions were not treated as
  text failures.
- Rollback compatibility was proven on the disposable migrated clone. The archived pre-repair
  publisher was used only there to materialize the projection after the 918-row flag sync. Both the
  exact pre-burn-in compiled dependency preflight (12 required tables) and the repaired candidate
  compiled dependency preflight (21 required tables) pass with all 83 migrations. The archived and
  candidate backend entrypoints share SHA-256
  `8fa8945b0725c4467b64836248721dc1fca2934046d1b4da8b9cf7ca1fc01977`.
- No dedicated staff/test-account credential contract was found in repository configuration or the
  protected release evidence. Authenticated production lifecycle checks therefore remain
  unavailable unless a dedicated account is explicitly supplied and confirmed; no player account
  will be repurposed.

## Production boundary at blocked cutover

- Production remains unmodified: 82 completed migrations, exactly the reviewed migration pending,
  one unlocked lock row, empty builder flags/object/mob projections, and no generation-marker table.
- The application remains the original main PID, active since the recorded starting timestamp with
  `NRestarts=0`; its backend/frontend entry hashes remain the pre-burn-in values. Local and public
  health both return HTTP 200.
- Controlled cutover, live frozen install/build, migration, flag/wiki publication, service cycle,
  acceptance matrix, and soak were not started because the candidate cannot pass the complete wiki
  publication gate and the configured terminal sandbox executable is absent.
- An OS package candidate for `bubblewrap` exists, but it is not installed. Package installation is
  host-level mutation beyond current burn-in authority. Correcting `newhaven.wld` requires an
  explicitly authorized change and clean commit in the separate MUD repository so the publisher can
  bind a new immutable source revision/tree.
- Passwordless sudo is unavailable to the service account, so a host administrator must install the
  sandbox package even if continuation is authorized. The MUD source file is writable by the service
  account, but it remains untouched pending explicit separate-repository authority.
- The four disposable MariaDB/Redis rehearsal and test services were stopped cleanly after evidence
  capture; their protected data directories and logs remain available. Production app, tunnel,
  database, private cache, and MUD services remain active with their original PIDs/restart counters,
  and local/public health remain HTTP 200.

## Sandbox preflight repair qualification

- `TERMINAL_SANDBOX_BIN` is now part of the connection-free static release gate: its resolved path
  must be a regular executable file. A missing, directory, or non-executable target is a
  `ConfigurationError`, producing systemd `ExecCondition` refusal status 78 rather than a late
  administrative-terminal failure.
- Exact tracked-source manifests match across 1,083 files. Latest immutable tracked-source archive
  SHA-256: `b3d74bf194f8c5a82fe04d69681b799421bf9bc3d787c7db4806008288855ed9`.
- Latest complete candidate matrix: literal guard; backend configuration; 53 MUD-write callsites;
  backend formatting/lint/type checking; 101 suites/799 tests; frontend configuration,
  formatting/lint/type checking; and 34 files/121 tests all pass.
- Latest fresh backend artifact tree: 1,044 files, manifest SHA-256
  `0a2ff1f0863c128374529cb712c54ab18ce5dfb326cfca396a732f07ccc77349`.
  Latest fresh frontend artifact tree: 240 files, manifest SHA-256
  `903c69b02b1f64ac87d11918432f86c030481e26682744cf24b8c6a0d080c693`.
- Compiled candidate configuration preflight on the current host exits exactly 78 with only the
  actionable sandbox executable issue. This is the expected blocking result until a host
  administrator installs the configured binary.
- Latest post-userns-repair backend artifact tree: 1,044 files, manifest SHA-256
  `d939637cc678370e09fa9694117a33edb485992f9f22496cff1221002d10f96f`. The frontend artifact
  manifest remains byte-identical. The strengthened compiled preflight now exits 78 on the actual
  namespace denial rather than accepting an unusable executable.

## Authorized DurisMUD source repair

- Explicit authority was received to correct the separate DurisMUD repository and push the repair
  to `master`. No MUD process, generated world output, database, or player data was operated.
- Before editing, the MUD checkout was clean. `origin/master` had advanced independently, so the
  checkout was fast-forwarded to `3b705d6e9942aef9e758d4b598b6cd3b7d996508`; the upstream changes
  did not touch `areas/wld/newhaven.wld`.
- The two Windows-1252 `0x92` bytes in `newhaven.wld` were replaced with ASCII apostrophes at the
  possessives `Solars' wings` and `Solar's drawn back arrow`. The staged change was exactly two
  insertions and two deletions in that one file, with its `100644` mode preserved.
- Validation passed: `git diff --check`; strict UTF-8 decoding of `newhaven.wld`; strict decoding of
  all 1,957 tracked `.zon`, `.wld`, `.mob`, `.obj`, and `.shp` inputs with zero failures; and the
  DurisWeb strict flatfile parser loading all 100 rooms from zone 352. An initial inline parser
  command failed in the runner before application code because eval mode did not support top-level
  `await`; the async-wrapped rerun passed and is the result counted here.
- Commit `de76f3ada73503d8805a1c45a27822c73c364f3e` (`fix(world): normalize Newhaven text
  encoding`) has tree `99c857450ab756f38f594a70377c386ad7db1289` and parent
  `3b705d6e9942aef9e758d4b598b6cd3b7d996508`. The commit was pushed to `origin/master`, the remote
  ref was independently verified at the same commit, and the MUD worktree is clean and up to date.

## Current resume status

- Recorded after three consecutive goal turns reached the same verified external boundary.
- The full production burn-in is not complete and must not be represented as complete. No safe
  in-scope step can cross the remaining fail-closed gate without an external state change.
- The DurisMUD source condition is satisfied by the clean, pushed revision recorded above.
- Bubblewrap is now installed, but its direct runtime probe remains denied by the host's AppArmor
  unprivileged-userns restriction. The remaining resume condition is for a host administrator to
  install and load the reviewed `deploy/templates/apparmor/durisweb-bwrap` profile, after which both
  the direct namespace probe and freshly compiled configuration preflight must pass.
- On resume, do not reuse the time-sensitive backup/rehearsal boundary. Revalidate source/worktree,
  create a fresh protected production dump, restore it independently, repeat the exact migration,
  flag-sync/wiki-publication/dependency rehearsal, then proceed through controlled cutover,
  acceptance, and the full soak only if every gate passes.

## Fresh production rehearsal and migration

- A fresh timestamped protected release boundary was created under the service account's state
  directory with mode `0700` and private evidence files at mode `0600`. It contains exact
  configuration, unit, AppArmor, source, dependency, and prechange artifact snapshots plus checksums
  and recovery material. Secrets and the host-specific boundary path are not recorded in this
  journal.
- Production MariaDB was verified as 10.11.14 on the configured private endpoint. Before cutover it
  had 82 completed migrations, only
  `20260904010000_create_wiki_reference_generations.ts` pending, and exactly one unlocked Knex lock
  row. A transaction-consistent dump including routines, events, triggers, and binary-safe values
  was restored into an isolated MariaDB 10.11.14 instance. All 253 table counts matched exactly.
  A separately isolated Redis 7 endpoint used scoped authentication and no production cache keys.
- The final stable cutover dump is
  `database/production.cutover.sql.gz` in that boundary with SHA-256
  `7ecb671d0717dd63b5fa9c634cf6b12ed5ed4fa024cc296179fb8d2d78790b7f`. That exact dump was
  independently restored and used for the final rehearsal. The rehearsal applied the one migration
  in batch 4, reached 83 completed migrations with none pending, synchronized 918 builder flags in
  25 categories, and published 20,202 objects plus 19,717 mobs from the selected MUD source. The
  generated child counts and source identity were consistent, and compiled configuration and
  dependency preflights passed with 21 required tables and 83 migrations.
- The selected MUD checkout was clean and fast-forwarded after the encoding repair to commit
  `70e13e8fd48cec87aea5481c3cab60e1e6280009`, tree
  `1169f0f694f8fe6907178938c15415338a0c9c61`. Its intervening upstream changes were limited to
  documentation, scripts, and tests; the repaired world source remained present. The live wiki
  publication is bound to this immutable commit/tree.
- The rehearsed migration was applied to production. Production now has all 83 migrations complete,
  the new migration in batch 4, none pending, and one unlocked lock row. Production flag sync wrote
  918 rows, production wiki publication wrote 20,202 objects and 19,717 mobs with the exact source
  identity above, and the compiled dependency preflight passed all 21 required tables and configured
  Redis dependencies. This forward database state is live and must be preserved.

## Controlled cutover recovery and systemd sandbox repair

- Operator deployment configuration now explicitly selects the configured loopback and public
  health endpoints. Its prior private copy remains in the protected boundary. Re-rendering initially
  proved the existing systemd and Redis output byte-identical.
- A recovery acceptance run exposed that `systemctl show` returns properties in its own order rather
  than the request order. `deploy/scripts/recover-deployment` was corrected to parse keyed values.
  The full backend suite passed 101 suites/801 tests after that repair, and commit
  `7fd072c50a4f3c049abd47b8100765bb83d79757` (`fix(deploy): parse keyed systemd state`) was pushed
  to `origin/master`.
- During the controlled cutover only the DurisWeb application and website tunnel were cycled; the
  production database, private Redis, and MUD supervisor were retained. Fresh application builds
  matched their qualified candidates. The migrated schema and generated wiki data were retained,
  but startup correctly failed closed when the compiled terminal-sandbox probe ran inside the
  production systemd protections.
- Exact transient-unit probes isolated two independent controls. `RestrictNamespaces=true` denied
  the namespace set bubblewrap needs, so the maintained application unit now allow-lists
  `user ipc uts cgroup mnt`. With that correction, any systemd filesystem namespace protection such
  as `PrivateTmp=true`, `ProtectSystem=full`, or `ProtectKernelTunables=true` still caused AppArmor
  attachment to fail at a disconnected namespace path. The full production probe reported
  `bwrap: stat on /proc/self/ns/cgroup failed: Permission denied`. Removing the filesystem
  protections is not an acceptable remedy.
- Availability was recovered using the exact protected prechange backend artifact and prior unit,
  whose compatibility with the migrated schema had already passed on the disposable clone. The
  forward migration and published reference data remain live. The user application is healthy as
  PID 3537039 with `Result=success` and `NRestarts=0`; the website tunnel is healthy as PID 3537041
  with the same result and restart count; private Redis remains PID 72100. Both configured local and
  public health endpoints return HTTP 200 with database and cache checks `ok`. The running backend
  entrypoint remains the recovered prechange artifact with SHA-256
  `8fa8945b0725c4467b64836248721dc1fca2934046d1b4da8b9cf7ca1fc01977` until the sandbox gate is
  fully satisfied.
- The host administrator installed and reloaded the then-current tracked profile as `root:root 0644`.
  Verification found exact installed/tracked SHA-256
  `ffc3505684428b12603778bf19f3204ea473af700e1d9e257b109139eff7d152`. A direct interactive probe
  passes, but the full systemd probe continues to fail at the disconnected cgroup namespace path.
- The maintained AppArmor carrier profile now adds `attach_disconnected` to its existing
  `unconfined` flag. This permits profile attachment through systemd's mount namespace while the
  explicit `userns` grant remains the only AppArmor permission added and the host-wide restriction
  remains enabled. The profile parses cleanly without a kernel load, and regression tests assert both
  this flag and the systemd namespace allow-list. The corrected tracked profile SHA-256 is
  `9b0fb0c7710aa6682b23d290b7c4daceb2a4f92390661a18ca42e6ebd8ea7841`; the installed profile still
  has the prior hash and therefore requires one more privileged install/reload before live cutover
  can resume.

## Systemd sandbox repair qualification

- `git diff --check`, the production-literal guard, shell syntax checks for all maintained deployment
  scripts, and an AppArmor parser dry run pass. Backend formatting, lint, type checking,
  configuration validation, and the 53-entry MUD-write allow-list all pass from the isolated
  candidate.
- The focused deployment/profile regression run passes 2 suites/20 tests. The full backend run
  passes 101 suites/801 tests. A fresh TypeScript build contains 1,044 files with manifest SHA-256
  `e4851fae7d71b3d84fd7253ec2986465200bce50b11bc553d0312938ad14b248`; its runtime entrypoint
  remains byte-identical at SHA-256
  `8fa8945b0725c4467b64836248721dc1fca2934046d1b4da8b9cf7ca1fc01977`.
- The freshly compiled configuration preflight passes with 83 available migrations and the compiled
  dependency preflight passes with 21 required tables, 83 completed migrations, and all configured
  Redis dependencies healthy on the isolated rehearsal endpoints. One initial compiled-preflight
  invocation was made from the monorepo root, where the process correctly refused the absent backend
  environment; the rerun from the production service's backend working directory is the passing
  result recorded here.
- A fresh configuration render contains `RestrictNamespaces=user ipc uts cgroup mnt`; systemd's
  verifier accepts the application, private Redis, and website tunnel units. The remaining gate is
  host installation/reload of the corrected AppArmor profile followed by the same full transient-unit
  probe, controlled application cutover, endpoint and browser acceptance, and the required soak.

# Website security, privacy, and schema implementation plan

Status: **implementation in progress**. Updated 2026-10-16.

Current checkpoint: engineering through P4, the UTC correction, first P5
collection closure and browser storage-denial repair are published for review
(#39, #41–#47). The source-backed lifecycle registry is now published for review;
remaining P5 notice/choice implementation and P6–P7 are still open.
Policy/approval and live-release gates remain open; no production rollout is implied.

Single working plan for [#7](https://github.com/LuminariMUD/DurisWeb/issues/7),
[#8](https://github.com/LuminariMUD/DurisWeb/issues/8),
[#9](https://github.com/LuminariMUD/DurisWeb/issues/9),
[#10](https://github.com/LuminariMUD/DurisWeb/issues/10),
[#11](https://github.com/LuminariMUD/DurisWeb/issues/11),
[#12](https://github.com/LuminariMUD/DurisWeb/issues/12),
[#13](https://github.com/LuminariMUD/DurisWeb/issues/13), and
[#14](https://github.com/LuminariMUD/DurisWeb/issues/14).

Implementation branch: `branch/issues-7-14-security-privacy-baseline`.
Source reviewed: `master` at
[`ade01ddcea70c0448825a0b4ab3e8ba77982aae4`](https://github.com/LuminariMUD/DurisWeb/commit/ade01ddcea70c0448825a0b4ab3e8ba77982aae4).
All eight issues were open with no comments when read. Their older `3f0ddc9`
references are context; the findings below come from the pinned checkout.

## Scope and authority

Implementation is authorized, including local isolated verification, commits,
pushes, and focused review-ready PRs. Stack dependent PRs as each chunk is ready.
Deployment, production session invalidation, shared-environment migrations,
destructive retention, and operations in the separate DurisMUD repository remain
outside this request. Keep this single evolving execution plan current.

## Execution record and continuation

- **PR #39 review closeout (2026-10-16):** all five findings are valid,
  including the two outdated inline locations inherited from merged parents.
  Outcome: reject table-option/partition drift, authenticate every owner
  fixture input against published digests, enforce database-scoped SQL import,
  resolve forum notification posts on their actual page, and isolate concurrent
  native fixture names. Non-goals: deployment, master merge, release tags,
  production/MUD operations, or starting another implementation phase.
- **Ablation:** retain the existing immutable signatures and reject noncanonical
  options/partitions before hashing. Pin the existing bootstrap/manifests and
  remove unused returned hashes. Use one temporary database account rather than
  extending the SQL text filter into a parser. Preserve existing notification
  URLs and resolve their post ID through the thread reader, with stable
  timestamp/ID ordering, rendered anchors, same-thread navigation and stale
  request suppression. No dependency, migration or new configuration is needed.
- **Proof:** `TEST_BASELINE_DB_PORTS=23336,23337
  TEST_BASELINE_MUD_SOURCE=/home/aiwithapex/projects/duris/migrations
  pnpm --dir backend test --runInBand
  src/db/__tests__/webBaselineQualification.test.ts
  src/db/__tests__/webBaseline.test.ts
  src/services/__tests__/forumSubscriptionsBaseline.test.ts
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts`
  passes **63 tests / 4 suites** on MySQL 8.0.46 and MariaDB 11.8.9.
  A final rerun of `webBaselineQualification.test.ts` with the same opt-ins
  passes **11 tests**, including the added self-consistent manifest/SQL case
  and adoption-time partition refusal. Checks include partition/option drift,
  changed/self-consistent owner inputs, cross-schema INSERT/DROP and global DDL
  denial, account cleanup, approved full-owner imports, restored adoption,
  active-post paging, equal-timestamp ties, and missing/deleted/other-thread
  targets. Evidence: `/tmp/durisweb-pr39-review-native.log`.
- **Full application proof:** `bash /tmp/durisweb-pr39-run-suite.sh` executes
  the actual `pnpm --dir backend migrate:latest`, configuration/dependency
  preflights, and `pnpm --dir backend test --runInBand` against a process-unique
  full-owner synthetic database and private Redis: **117 suites / 1,162 tests
  pass**. The full backend run deliberately omits the separately opted-in native
  baseline tests. Evidence: `/tmp/durisweb-pr39-review-full-backend.log`.
  Two simultaneous executions of `TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir
  backend test --runInBand src/services/__tests__/forumSubscriptionsBaseline.test.ts
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts` each pass
  **16 tests**, proving collision-free names on the same servers.
- **Frontend proof:** `pnpm --dir frontend test:unit --run` passes **238 tests /
  49 files**; the subsequent focused `pnpm --dir frontend test:unit --run
  src/views/__tests__/ThreadViewLinks.spec.ts` passes **4 tests**, adding the
  out-of-order response regression. `node /tmp/durisweb-pr39-browser.mjs`
  passes at 1440x1000 and 390x844 on
  `http://127.0.0.1:25373/forum/thread/1#post-55`, then navigates to `#post-7`
  in the same mounted view. Actual requests carry the target IDs; anchors are
  rendered and scrolled into view. Identity, content, framework overlay and
  screenshot checks pass with synthetic API responses. Browser plugin not
  available; existing Playwright was used. Expected anonymous-auth 401 messages
  and the preexisting Vue Router `next()` deprecation are recorded separately
  from unexpected console/page errors (none).
- **Quality commands:** both packages' `format:check`, `lint`, `type-check`,
  and `build`; `pnpm --dir backend schema:check`;
  `pnpm --dir backend verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes);
  `./scripts/check-config-literals.sh`;
  `./frontend/scripts/check-palette-literals.sh`; frontend `config:check`
  using `/tmp/durisweb-pr39-frontend-env.sh`; and `git diff --check` pass.
  Changed TypeScript was formatted with each package's `pnpm --dir <package>
  exec biome format --write <changed files>`. Dependencies use the committed
  frozen lockfile. No hosted-CI wait, live browser/data acceptance, physical
  device test, shared migration, MUD operation or deployment is claimed.
- **Git decision:** master `8946860` is already an ancestor of #39. Preserve
  published history because #41 depends on this branch; carry these repairs
  forward without changing its session implementation. No rebase, squash or
  tag is needed. Leave #39 open/non-draft and ready for a normal merge that
  preserves the child ancestry. Independent worktrees remain untouched.
- **Website Changelog draft:** after a future authorized deployment verifies
  this fix live, reconcile existing entries and publish a public item titled
  **Forum notifications open the right reply**, using the verified release
  date/version and content `<ul><li>Forum reply and mention notifications now
  open the referenced post, including replies on later pages of a thread.</li></ul>`.
  It remains unpublished because this task ends at merge readiness.

- Worktree: `/tmp/durisweb-security-privacy-plan-20261016`; the original checkout
  has independent issue #30 work and must remain untouched.
- Starting branch: `branch/issues-7-14-security-privacy-baseline` at `a4c5e51`;
  base `origin/master` is `ade01dd`. No PR existed for this branch at kickoff.
- **First chunk: P1 / #13. Outcome:** no IP, provider payload, URL, token, or
  raw exception reaches GeoIP/cache diagnostics; normal lookups and fallback
  decisions remain available. **Non-goals:** provider/transport policy, consent,
  database changes, production operations, and a generic logging framework.
  **Files:** GeoIP utility, its reachable Redis diagnostics, focused tests,
  security record, and this plan. **Proof:** mocked provider and Redis failures
  with sentinels across all logger arguments, successful/cache/local/batch
  behavior, backend format/lint/types/build, and whitespace review.
- **Ablation:** reuse existing GeoIP/cache helpers and Jest. Fixed diagnostic
  categories plus locally generated references suffice; no retry service,
  dependency, logger adapter, configuration option, or alternate provider is
  needed. Redis sanitization is required because command errors include cache
  keys containing IPs. Provider responses require type validation so malformed
  successes cannot escape the documented null-on-failure contract.
- **Owner input:** The owner and contact were supplied in the planning session.
  Retention periods, public controller wording, external-provider commitments,
  and one-time logout have not yet been approved. Continue independent work;
  ask only when a consequential decision is essential, in plain language, with
  a concrete proposal. No automatic deletion or public policy claim may infer
  approval from the owner's contact details. P0/P5/P6/P7 release gates remain open.
- Node `v24.15.0`, pnpm `12.10.1`; backend dependencies installed from the frozen
  lockfile in this worktree. No production or provider access has occurred.
- **P1 verification:** `pnpm --dir backend test --runInBand
  src/utils/__tests__/geoip.test.ts` passes 25 tests with real cache helpers and
  mocked Redis/provider boundaries. Pre-fix tests reproduced diagnostic leaks.
  `pnpm --dir backend format:check`, `lint`, `type-check`, and `build` pass.
  No database, MUD-write, frontend, browser, provider, or production check is
  needed or claimed for this diagnostics-only chunk. The full backend suite
  is deferred to the P2 synthetic baseline, not represented as passing here.
- **P1 Website Changelog:** no entry needed: diagnostic minimization and
  malformed-provider rejection do not add reader-visible website behavior.
  No release, tag, deployment, or public news publication is claimed.
- **Base refresh:** concurrent Discord PRs #32–#35 landed while P1 was being
  verified. Merged `origin/master` at `fa7127e` without rewriting either history;
  no P1 implementation file changed upstream. P2 must include its two new
  migrations (`20261016150000_pvp_discord_delivery.ts` and
  `20261016160000_pvp_discord_audit_columns.ts`); the initial 83-file count below
  is historical. Revalidated P1 and backend gates on the combined tree.
- **Published P1:** [PR #36](https://github.com/LuminariMUD/DurisWeb/pull/36),
  open and ready for review, branch head `b299239`. The local and remote head
  matched, ahead/behind was `0 0`, and the worktree was clean after publication.
- **P2 delivery split:** publish the baseline inputs/checker as P2a first;
  stack the installer/adoption/migration transition as P2b. Each remains a
  focused reviewable chunk; #14 stays open until all P2 acceptance passes.
- **Delivered P2a / #14. Outcome:** an explicit website-only baseline and
  checksummed input verification, with native DDL/seed proof on both supported
  database families. **Non-goals:** running historical MUD alterations,
  copying a production schema/data dump, deploying, or fabricating historical
  ledger rows. **Files:** baseline artifacts/module/scripts, Knex discovery,
  tests, and development guides. **Proof:** isolated MySQL 8.0.46 and MariaDB
  11.8.9, checksum/ownership tests, per-table installed schema fingerprints,
  unchanged external sentinel objects/rows, and required backend gates.
  Two newly created disposable containers use loopback ports 23336/23337;
  the existing development databases and MUD services remain untouched.
- **P2 ablation:** derive the final web schema from checked-in schema inputs
  in an empty synthetic scratch database, then install that explicit snapshot.
  Historical replay is derivation evidence only, never the supported bootstrap.
  One manifest supplies checksums, ownership and covered names to both the CLI
  and migration/preflight paths; do not add an alternate legacy bootstrap.
- **P2a inputs:** 77 explicit website tables, 126 nonsecret seed rows, 85 pinned
  historical TypeScript migrations, all 14 legacy SQL artifacts checksummed
  (12 schema sources; MUD accounts DDL and one-off emoji repair excluded).
  `server_reboots` is MUD-owned despite its absence from the old required-table
  list; all MUD source DDL was cross-checked for collisions with web candidates.
  The only collision was `server_reboots`, now explicitly excluded. Exact
  derivation and collation choices are recorded in the bundle README.
- **P2a native proof:** `TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend
  test --runInBand src/db/__tests__/webBaselineBundle.test.ts`: 11 tests pass,
  including both native engines, all 76 installed schema hashes and seed
  inserts. These use external sentinels, not an approved full MUD schema.
  The installer, authoritative MUD target check, interruption/retry, teardown,
  existing-ledger adoption, preflight and Knex transition remain P2b work. No
  fresh-install/upgrade/deployment acceptance claim is made by P2a.
- **P2a release news:** no reader-visible change; no Website Changelog entry
  needed for versioned contributor inputs and the database-free checker.
- **P2a completion checks:** `pnpm --dir backend schema:check`,
  `pnpm --dir backend format:check`, `pnpm --dir backend lint`,
  `pnpm --dir backend type-check`, `pnpm --dir backend build`,
  `pnpm --dir backend verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53
  classified writes), and `git diff --check` pass. Changed TypeScript was
  formatted with `pnpm --dir backend exec biome format --write` on the three
  new source/test files and `package.json`. The full backend/frontend matrix,
  runtime feature/preflight readiness, full MUD-schema rehearsal, and production
  acceptance remain unperformed; no claim exceeds the checks above.
- **Published P2a:** [PR #37](https://github.com/LuminariMUD/DurisWeb/pull/37),
  open/non-draft, head `f80592b`, stacked on #36. Exact local/remote head,
  ahead/behind `0 0`, and a clean worktree were verified.
- **Delivered P2b** on `branch/issue-14-web-schema-bootstrap`: guarded
  bootstrap/adoption/verify/teardown, durable per-DDL progress, transactional
  seed/provenance acknowledgement, and migration/preflight coverage. Require
  an explicit target and owner-approved external-schema hash, fail on unknown
  web objects or partial history, and preserve every existing ledger row.
  No shared service or database will be touched during qualification.
- **P2b implemented:** dedicated `web_schema_baselines` provenance; named
  installation lock; strict/autocommit/FK preconditions; pending/completed DDL
  journal; atomic seed/ack commit; native installed-table and ledger checksums;
  trigger/drift/unknown-object refusal; adoption preserving original rows;
  limited, restartable teardown refusing user data or modified defaults.
  `schema:baseline` confirms the configured target before connecting. Its
  observed external-schema hash is explicitly not owner approval.
- **P2b migration transition:** custom Knex source keeps applied names visible,
  skips only covered unapplied history after revalidation, and requires an
  explicit baseline for a fresh database. Production preflight uses the same
  coverage and checks immutable source inputs during configuration validation.
  SQL classifications now point at the versioned artifact; the historical SQL
  and TypeScript migration bytes and existing ledgers are unchanged.
- **P2b ablation:** the baseline shares the existing ownership inventory through
  one small reader used by the baseline and write verifier; this avoids a
  circular dependency on the CLI verifier. No second bootstrap, speculative
  upgrade reconciler, SQL-mode relaxation, generic job framework or fabricated
  ledger records were added. Snapshot hashing ignores only the actual table
  auto-increment option, preserving identically named text/default values.
- **P2b proof:** `TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test
  --runInBand src/db/__tests__/webBaseline.test.ts
  src/db/__tests__/webBaselineBundle.test.ts src/utils/__tests__/geoip.test.ts
  src/scripts/__tests__/productionPreflight.test.ts
  src/scripts/__tests__/mudWriteAllowlist.test.ts` passes **85 tests / 5 suites**
  on MySQL 8.0.46 and MariaDB 11.8.9. Native tests include actual CLI credentials/
  target refusal, Knex forward/down/forward with only the real forward name in
  its ledger, ambiguous seed commit, DDL interruption with a fresh connection,
  synthetic existing-ledger adoption, no overwrite on repeat, concurrent lock,
  schema/metadata/trigger refusal, session-invariant refusal, refusal of a
  matching unrecorded table appearing after initial inspection, and safe teardown.
  Before the final run, a temporary missing verifier constant was repaired;
  the final stable tree has no failing tests. Retained synthetic test logs:
  `/tmp/durisweb-p2b-publication-tests.log` (no production/provider data).
- **P2b checks:** `pnpm --dir backend schema:check`, `format:check`, `lint`,
  `type-check`, `build`, `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  and `git diff --check` pass. Only changed TypeScript/package/configuration
  files were formatted with `pnpm --dir backend exec biome format --write`.
  `/tmp/duris` is a read-only source symlink for the existing verifier test's
  sibling-layout discovery; no MUD repository file or process was changed.
- **P2b remaining acceptance (P2c):** the MUD table fixtures are name/metadata
  sentinels, not the complete owner-approved MUD schema. Still qualify an
  authoritative full MUD baseline, a restored synthetic existing web schema
  including supported collation repairs, representative application queries,
  and dependency/data-readiness preflights. The complete backend/frontend suites
  and production acceptance have not been run. #14 remains open. No new forward
  migration was needed for the standalone provenance installer; native tests
  exercise a later reversible synthetic migration through actual Knex.
- **Next-stage constraint:** P3 and later schema changes must update
  baseline-plus-forward postconditions in the verifier, leaving the versioned
  baseline artifact immutable. Never bypass its drift refusal or edit historical
  migration bytes to get a later stage green.
- **P2b release news:** contributor/operator tooling only; no visitor-visible
  website change, no Website Changelog entry, tag or production operation.
- **Published P2b:** [PR #38](https://github.com/LuminariMUD/DurisWeb/pull/38),
  open/non-draft, code head `d612723`, stacked on #37 → #36. Exact published
  head, ahead/behind `0 0`, and clean worktree verified. No merges requested.
- **Continuation:** finish P2c's full-source/synthetic-schema qualification and
  repair only evidenced legacy differences before claiming #14 complete. P3 session changes
  remain unstarted. Original checkout `.env` and `backend/.env` are absent,
  verified without reading any credentials; do not infer a configured local or
  production target from existing Docker container names. Continue with the
  dedicated disposable containers and explicit synthetic credentials. Owner
  policy/release questions remain deferred until genuinely necessary.
- **Current chunk: P2c** on `branch/issue-14-baseline-qualification`, based on
  #38 at `4c5b8c1`. PR #38's API and remote ref both matched that full published
  head, with a clean worktree and `0 0` ahead/behind. #37's hosted checks passed;
  #38's latest hosted checks were pending when read (local gates passed).
  **Outcome:** qualify full source-owned MUD schema inputs plus existing web
  layouts, repair evidenced web-only drift, and exercise representative queries
  and readiness checks. **Non-goals:** operating the MUD repository/server,
  shared DB changes, copied production dumps, or invented owner migration rows.
  **Files:** focused qualification fixtures/tests, any demonstrated forward web
  repair and its verification contract, appropriate guides, and this plan.
  **Proof:** pinned owner SQL/metadata contracts as read-only fixture inputs,
  two disposable engines, fresh and restored synthetic web paths, unchanged
  owner metadata, and the required package gates. No MUD repository script has
  been run; owner source files are being inspected only.
- **P2c full owner inputs:** the owner-published
  `bootstrap_multithread_safe.sql` plus 43 immutable apply files were read and
  checksum-verified against the manifest, assembled privately, then loaded
  only into the two dedicated disposable databases. No owner tool/script was
  invoked and no owner ledger rows were invented. The pinned head is
  `0043_news_acknowledgement`, with **198** runtime tables. Assembled SQL SHA-256
  is `0eeafb7f255de210748b49336968bf19037d5b6601061d78e96bbd816dc75c59`;
  input evidence is `/tmp/durisweb-owner-schema-inputs-20261016/inputs.json`.
  The owner's published normalized metadata fingerprints matched exactly:
  MySQL `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`,
  MariaDB `995f0c9f1a726dc25e3ce1104627ebff02e0414e7d2e48595f94de7ce3b0e8e2`.
  Website bootstrap succeeded on each and preserved both fingerprints exactly.
- **P2c native proof:** a source-only fixture helper and native tests reproduce
  the full-owner check, validate real readiness readers, and build a genuinely
  executed historical *synthetic fixture* for web-only dump/restore/adoption.
  Historical replay is solely test-data derivation, never the supported
  installer. All 85 original Knex ledger rows and synthetic application rows
  survive restore/adoption unchanged. Both owner metadata hashes remain exact.
  A new private Redis container on loopback port 23379 serves only these tests;
  no existing development/production cache was touched. The two native suites
  pass **28 tests** on MySQL 8.0.46 and MariaDB 11.8.9:
  `TEST_BASELINE_DB_PORTS=23336,23337 TEST_BASELINE_MUD_SOURCE=
  /home/aiwithapex/projects/duris/migrations pnpm --dir backend test --runInBand
  src/db/__tests__/webBaseline.test.ts
  src/db/__tests__/webBaselineQualification.test.ts`. Evidence:
  `/tmp/durisweb-p2c-native-regressions.log`.
- **P2c evidenced repairs:** historical replay/restore exposed false drift
  refusals from raw `SHOW CREATE TABLE` formatting: redundant per-column
  charset declarations in Knex metadata, and ASCII literal charset introducers
  in the subscription CHECK. Native probes proved all table/column/index/FK
  metadata identical; no collation or schema repair migration is justified.
  Runtime verification now compares stored metadata using the versioned
  `schema-contracts/web-baseline-v1.json`, pinned to the original immutable
  manifest and checksum. Only the two source-equivalent subscription CHECK
  signatures are accepted per engine; a complete eight-case truth table proves
  behavior. Changed nullability, extra uniqueness, and weakened CHECK semantics
  are refused. The original baseline artifacts and historical migrations stay
  byte-for-byte unchanged. This is the single runtime verification path.
- **P2c actual command regression:** `pnpm --dir backend migrate:latest` exposed
  Knex discarding the custom migration source when `directory` was also set.
  Removed the conflicting option; the source owns discovery. Native CLI tests
  now prove an uninitialized database is refused, then a baseline succeeds with
  an empty historical ledger. The two-engine focused regression passes:
  `TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand
  src/db/__tests__/webBaseline.test.ts --testNamePattern="actual operator CLI"`.
  Evidence: `/tmp/durisweb-p2c-cli-regression.log`. Fixture databases and users
  include process identities so simultaneous reviews cannot share/drop them.
- **P2c broad qualification:** full configuration and dependency preflights
  pass on both engines against new full-owner + website fixtures and private
  Redis. Feature readiness uses explicitly synthetic forum/wiki/map publication;
  an empty schema still fails readiness. The first complete backend run passed
  114 suites but found one older account-service suite depended on a real
  account and silently skipped character assertions without data. It now
  creates/cleans its own unique synthetic account/character and always checks
  the character behavior. The complete rerun passes **1,116 tests / 115 suites**.
  No production
  account or data is used. Private runner:
  `/tmp/durisweb-run-p2c-suite.mts`; logs:
  `/tmp/durisweb-p2c-full-suite-mysql.log`,
  `/tmp/durisweb-p2c-preflight-mariadb.log`.
- **P2c checks and limits:** `node --import
  ./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-run-p2c-suite.mts
  23336` runs `pnpm --dir backend migrate:latest`, both preflight modes, and
  `pnpm --dir backend test --runInBand` with explicit synthetic configuration;
  the `23337 preflight-only` invocation repeats both preflights on MariaDB.
  The full suite includes opt-in PvP fixtures on disposable port 23337; the
  separately completed 28 baseline-native tests are not repeated by that run.
  `pnpm --dir backend schema:check`, `format:check`, `lint`, `type-check`,
  `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  `build`, and `git diff --check` pass. Changed TypeScript was formatted with
  `pnpm --dir backend exec biome format --write` followed by full format checking.
  No frontend/browser/live/provider check was run for this backend-only chunk.
  P2 is source-complete with isolated fresh/upgrade evidence; release acceptance
  remains P8. No visitor-visible change needs Website Changelog publication.
  No dependency, DDL repair, release tag, merge, deployment or shared operation
  was introduced. Next engineering stage: P3 sessions (#7/#8).
- **Published P2c:** [PR #39](https://github.com/LuminariMUD/DurisWeb/pull/39),
  open/non-draft, code head `97eaf82`, stacked on #38 → #37 → #36. The exact
  full local/remote/PR head matched, ahead/behind was `0 0`, and the worktree
  was clean. #14's engineering acceptance is complete across this stack;
  review/merge and P8 production acceptance remain separate.
- **PR #37 review repairs:** all six findings were validated and addressed.
  Reuse the ownership fingerprint helper, separate the sequence/timestamp
  coverage cutoffs, reject noncanonical foreign-key syntax, retain actionable
  CLI errors without JSON input excerpts, run `schema:check` in backend CI,
  and define the active routes' missing `builder_settings` table without
  seeding account data. No installer, service, dependency, or new configuration
  surface was needed. The finalized bundle now includes 77 tables.
- **Review proof:** the new regressions reproduced eight failures before the
  fixes. `TEST_BASELINE_DB_PORTS=23336,23337 pnpm --dir backend test --runInBand
  src/db/__tests__/webBaselineBundle.test.ts
  src/scripts/__tests__/mudWriteAllowlist.test.ts` passes 43 tests, including
  all 77 installed hashes, unchanged external sentinels and builder-settings
  insert/update/account isolation on MySQL 8.0.46 and MariaDB 11.8.9. Backend
  format/lint/type-check/build/schema and MUD-write gates pass. Local workflow
  coverage also passes frontend format/lint/type-check/palette checks and the
  configuration literal guard. The latter exposed an existing deployment
  address in this plan, repaired in its own commit. Full application suites,
  frontend build/browser, bootstrap/adoption and production checks were not
  required or run for these input-verifier repairs. No public news is needed.
- **Stack decision:** current master `fa7127e` is already an ancestor; retain
  PR #36 as the dependency and PR #38 as the child. PR #38 integrated the updated
  parent at `2ed1a28`, preserving both review histories. No tag, squash, merge to master, deployment,
  shared database migration, or MUD operation is part of this review closeout.
- **PR #38 review closeout:** both findings reproduced and repaired. New forward
  migrations carry checksummed per-family schema contracts; the shared verifier
  composes applied states in ledger order, preserving rollback and rejecting
  unrelated drift. The immutable baseline and historical migration bytes are
  unchanged by these repairs. A fully absent web store is a safe teardown retry
  only with an empty ledger and the approved external-schema identity; orphaned
  web objects and incorrect identities still fail closed.
- **Reachable CLI repair:** the full isolated rehearsal exposed Knex discarding
  the custom source when `migrations.directory` was also supplied. Remove that
  conflicting option. Regression tests invoke the actual operator CLI and
  `migrate:latest` twice, rollback and status without replaying historical files
  or inventing ledger rows. The parent ownership fingerprint helper moved into
  the existing shared reader to preserve the noncircular dependency boundary.
- **Final local proof:** Node 26.11.1 / pnpm 12.10.1; dedicated disposable ports
  24336 (MySQL 8.0.46), 24337 (MariaDB 11.8.9), and 24379 (Redis). The five
  focused suites pass 100 tests, including multi-migration state transitions,
  add/drop states, drift refusal and fresh-connection teardown retries before
  and after the final DDL acknowledgement. The full backend suite passes all
  114 suites / 1,126 tests against a fresh source-derived schema and synthetic
  account/character data. Backend format/lint/types/build/schema/MUD-write,
  frontend workflow format/lint/types/palette, configuration literals, and
  whitespace checks pass. Earlier fixture collision and empty-account failures
  were isolated fixture issues, corrected before this final run.
- **Limits and news:** frontend unit/build/browser and production acceptance
  were not needed or run for these backend operator changes. The full approved
  owner-schema/restored-environment qualification and feature-readiness work
  remain P2c obligations; #14 stays open. No shared/production database, MUD
  process, provider, deployment, or public changelog operation occurred. There
  is no reader-visible website change requiring a Website Changelog entry.

- **Current continuation: integrate parent reviews into P2c.** #37/#38 advanced
  to `f6ad133` while P3 was in progress. Merged that parent without rewriting
  history (`4d845dd`). The newly included `builder_settings` table is genuinely
  absent from the 85 historical sources, so previous P2c completion evidence
  predates this requirement. Qualification is reopened until its real legacy
  forward repair and updated native/full-suite checks pass. No finalized
  historical migration was edited. The 77-table parent artifact remains intact.
- **Integration ablation:** reuse the parent's per-migration forward contracts
  and ledger-order composition with the existing stored-metadata reader. Require
  `information_schema_v1` fingerprints explicitly; do not retain a second raw
  DDL verification path. Regenerated the baseline metadata contract only to bind
  the reviewed parent manifest and its newly added builder table. Added the
  targeted `20261016230000_repair_builder_settings.ts` with durable creation
  intent, exact-shape refusal, and ownership/data-safe rollback before adoption.
  Existing histories get one truthful forward row; no old row is fabricated.
- **P3 saved continuation:** branch `branch/issues-7-8-session-credentials`
  still starts at `21b7ed0`. Its unfinished changes are retained in the named
  stash `p3-session-credentials-before-parent-review-integration` (including
  untracked source/migrations). HTTP credential/failure tests passed eight
  tests; native DDL/timezone proof has not passed. The initial fault injector
  attempted to assign Knex's read-only `raw` property; fix the fixture via its
  client query method. On resume, merge this qualified #39 head first and reuse
  the shared forward contracts, dropping P3's redundant separate contract JSON.
  Dedicated P3 containers on 23436/23437 and Redis 23479 hold no shared data;
  changing their defaults for the timezone matrix is permitted. Never change
  defaults on the baseline/review/development containers.
- **Parent-integration proof:** `TEST_BASELINE_DB_PORTS=23336,23337
  TEST_BASELINE_MUD_SOURCE=/home/aiwithapex/projects/duris/migrations pnpm
  --dir backend test --runInBand
  src/db/__tests__/webBaselineQualification.test.ts` passes five tests. It now
  genuinely executes the builder repair up/down/up before dump/restore,
  preserves every original historical row, checks actual per-account builder
  preferences, refuses data loss, and refuses rollback across adoption. A
  separate native CLI/forward regression passes four tests on both engines.
  The full backend rerun passes **1,127 tests / 115 suites**, and both native
  configuration/dependency preflights pass with 86 real migration sources.
  Logs: `/tmp/durisweb-p2c-parent-restored.log`,
  `/tmp/durisweb-p2c-parent-cli-forward.log`,
  `/tmp/durisweb-p2c-parent-full-suite.log`, and
  `/tmp/durisweb-p2c-parent-maria-preflight.log`. The initial integration run
  exposed a missing shared family export and a copied-migration test fixture
  lacking its relative source layout; both were repaired. Other installer tests
  passed in that run; only affected paths were repeated. Required backend gates
  and a strict standalone TypeScript check of the new migration pass.
- **Final refreshed-base qualification:** merged `origin/master` at `3bea138`
  after its reviewed admin/forum repairs landed, preserving both histories.
  The resulting tree passes **1,128 tests / 116 backend suites** with the same
  full-owner synthetic fixture and private dependencies; evidence is
  `/tmp/durisweb-p2c-final-full-suite.log`. The actual CLI regression additionally
  proves preexisting builder preferences survive migration up/down on both
  engines (`/tmp/durisweb-p2c-parent-preexisting.log`, two passing tests).
  Final `schema:check`, `format:check`, `lint`, `type-check`,
  `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  `build`, and `git diff --check` pass. The new migration also passes
  `pnpm --dir backend exec tsc --ignoreConfig --noEmit --module nodenext
  --moduleResolution nodenext --target ES2022 --esModuleInterop --strict
  --skipLibCheck migrations/20261016230000_repair_builder_settings.ts`.
  Its formatting used Biome through `--stdin-file-path=src/repairBuilderSettings.ts`
  because the repository format scope excludes migration files; its forward
  contract was updated to the exact formatted bytes. P2's reopened engineering
  acceptance is now complete again. Shared deployment/production acceptance
  remains outside this work. No new public news is required for the source-owned
  installation/adoption tooling; no release tag or live change was made.
- **Current chunk: P3 / #7 + #8**, branch
  `branch/issues-7-8-session-credentials`, based on #39 at `21b7ed0`.
  **Outcome:** SHA-256 refresh credentials, database-epoch expiry, and one
  coordinated, explicitly destructive offline session cutover with reversible
  empty-session schema rollback. **Non-goals:** refresh rotation, changing the
  seven-day lifetime, changing unrelated pool timezones, production logout or
  deployment. **Files:** session service/credential boundary, auth route,
  two new forward migrations, session-specific postconditions, preflight,
  existing tests plus native transition/timezone/route regressions, and guides.
  **Proof:** real login/refresh/access and database failure; both native engines;
  app/database timezone matrix and DST epochs; expand/cutover/contract and empty
  rollback/retry; exact owner metadata and unchanged pool safeguards.
- **P3 ablation:** reuse Node crypto, Knex and the existing session service.
  Two explicit migrations separate expansion from cutover/contraction. Each
  atomic DDL statement must recognize only its exact before/after signatures.
  The migration source may recognize an adjacent exact phase to recover an
  ambiguous nontransactional DDL acknowledgement; normal verification/preflight
  stays strict to the ledger phase and refuses pending migrations. This avoids
  a new migration journal/service or public configuration flag. Historical
  baseline signatures stay immutable; session-specific forward signatures are
  versioned separately. New writers never read or store raw refresh JWTs.
- **P3 resumed after integration:** based on #39 at `c01c81f`; the named stash
  remains as a backup until publication. Its changes are restored and adapted
  to the shared per-migration `information_schema_v1` contracts. Removed the
  redundant separate session-contract JSON and checksum reader. Native
  fault injection now uses the actual Knex client query boundary. HTTP fixtures
  use scoped synthetic users, avoiding test defaults replacing an empty root
  password. Ordinary baseline/preflight verification remains strict; recovery
  is confined to exact adjacent session phases, with no unrelated forward
  session change already applied. Both rollback directions require an empty
  store after a recovered acknowledgement.
- **P3 proved boundaries:** native cutover/rollback and actual HTTP checks pass
  on MySQL 8.0.46 and MariaDB 11.8.9. Each engine covers three database defaults
  (`+00:00`, `+03:00`, `-07:00`), three application zones (`UTC`,
  `Asia/Jerusalem`, `America/Los_Angeles`) and eight DST-adjacent epochs: **144
  date/zone cases**. Signed, still-valid JWTs fail HTTP access and refresh at
  equality and 60 seconds after database expiry. Wrong digest/token/account/SID,
  deleted rows, nullable legacy fields and digest replay fail; new expanded
  writes are digest-only. Every DDL direction recovers a lost acknowledgement;
  rollback leaves an empty exact prior schema. A transaction-scoped corrupted
  ledger is refused and rolled back without fabricating any historical record.
  Owner-published metadata remains exact. Evidence:
  `/tmp/durisweb-p3-native-cutover.log` (three tests).
- **P3 export boundary:** ordinary backup downloads previously dumped every
  shared-database session row. The backup writer now streams ordinary data plus
  session DDL only, using structured process arguments and a private output
  file; neither password arguments nor shell interpolation are needed. Both
  engines prove restored ordinary rows survive and session rows are absent,
  including a separate-MUD target without a session table. Source backup
  filenames/archives and old historical backups were not operated on. Evidence:
  `/tmp/durisweb-p3-backup-snapshot.log` (two tests). Existing pool sampling now
  observes minimum clock skew over 60 seconds with bounded round-trip/precision
  handling; it never changes safeguards or clocks.
- **P3 maintenance proof:** `schema:sessions --target` runs the actual writer
  with a random non-JWT and generated nonexistent account name, checks the
  digest/epoch lifetime and deletes its exact transient row. Native tests prove
  target refusal and expanded-schema success. This supplies the planned
  pre-contraction write checkpoint without an HTTP maintenance server, MUD
  account writes, new configuration, credential fallback, or extra service.
  The release guide retains stopped/drained writers and the pending one-time
  logout approval. Website Changelog draft for the eventual verified release:
  **Safer website sign-ins** — “We strengthened website sign-in security. You
  will be asked to sign in again after this update.” No publication is authorized
  or claimed here; no new owner question is needed during engineering.
- **Merged-parent closeout:** PR #38 landed on master at `8946860`. Refreshed
  #39 without rewriting history and retained the emitted-DDL ownership guard.
  Native fixtures now use the versioned metadata contract format, a complete
  copied project layout and the real forward ledger before synthetic changes.
  Ten two-engine CLI/forward/ownership checks pass; the full #39 backend tree
  passes **1,162 tests / 117 suites** with the existing full-owner synthetic
  runner. Required backend gates pass. An initial dependency-directory symlink
  caused pnpm installation warnings; replaced it with a real frozen install
  and repeated the full suite and actual two-engine CLI tests successfully.
  Evidence: `/tmp/durisweb-pr39-final-parent-native.log`,
  `/tmp/durisweb-pr39-final-parent-suite.log`,
  `/tmp/durisweb-pr39-final-parent-cli.log`. Temporary refresh worktree:
  `/tmp/durisweb-pr39-parent-refresh-20261016`. Retarget #39 to master now its
  prerequisite is merged. P3 remains a separate dependent implementation.

- **P3 final source qualification:** refreshed the dependency to #39 at
  `4b3677f`; its merge changed only this plan relative to the tested P3 tree.
  The full P3 backend run passes **1,172 tests / 119 suites**. Both engines pass
  contracted `schema:sessions` and configuration/dependency preflight through
  `/tmp/durisweb-run-p3-suite.mts` (23436 full suite, 23437 preflight-only).
  Logs: `/tmp/durisweb-p3-final-full-suite.log` and
  `/tmp/durisweb-p3-maria-preflight.log`.
- **P3 exact focused commands:**
  `TEST_SESSION_DB_PORTS=23436,23437 TEST_BASELINE_MUD_SOURCE=
  /home/aiwithapex/projects/duris/migrations pnpm --dir backend test --runInBand
  src/db/__tests__/webSessionCutover.test.ts` passes three tests, including the
  complete 144-case HTTP matrix, every DDL recovery direction and the actual
  expanded write-probe CLI (`/tmp/durisweb-p3-final-native-cutover.log`).
  `TEST_BASELINE_DB_PORTS=23336,23337 TEST_BASELINE_MUD_SOURCE=
  /home/aiwithapex/projects/duris/migrations pnpm --dir backend test --runInBand
  src/db/__tests__/webBaseline.test.ts
  src/db/__tests__/webBaselineQualification.test.ts --testNamePattern=
  "actual operator CLI|altered baseline tables|undeclared MUD DDL|full owner-schema|owner schema fixture"`
  passes 15 tests; unchanged installer cases are deliberately not repeated.
  Restored genuine legacy history reaches the same session forward schema with
  its historical rows unchanged (`/tmp/durisweb-p3-final-baseline-native.log`).
  `CACHE_REDIS_PORT=23479 CACHE_REDIS_DB=15 TEST_BACKUP_DB_PORTS=23436,23437
  pnpm --dir backend test --runInBand src/services/__tests__/backupService.test.ts
  --testNamePattern="backup snapshots omit"` passes both native dump/restore
  tests. Focused auth/teardown/lifecycle/pool tests pass 23 tests in four suites
  (`/tmp/durisweb-p3-unit.log`); the full run repeats these and all other backend
  suites with opt-in PvP SQL fixtures on the private second engine.
- **P3 gates/limits:** backend `schema:check`, `format:check`, `lint`,
  `type-check`, `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  `build`, and whitespace checks pass. Both new migration files additionally
  pass standalone `tsc --ignoreConfig --noEmit --module nodenext
  --moduleResolution nodenext --target ES2022 --esModuleInterop --strict
  --skipLibCheck`. No dependency was added. The baseline bytes are unchanged.
  No frontend/browser, provider, shared database or production check was run.
  No existing backup, MUD repository/process, shared service, live session or
  release tag was changed. Engineering is ready for review; the explicit P3
  release gate and P0/P5–P8 policy/operational requirements remain open.
- **Published P3:** [PR #41](https://github.com/LuminariMUD/DurisWeb/pull/41),
  open/non-draft, code head `5e66605`, stacked on #39 at `4b3677f`. Exact local,
  remote and PR head matched; ahead/behind was `0 0` and the worktree clean.
  The latest base refresh still showed master `8946860` and unchanged #39.
  The named pre-integration stash remains private recovery evidence until review
  closeout; current code and all replacements are committed and pushed.
  Next independent engineering chunk: P4 / #9 durable toggle attribution.
  Keep #7/#8 open for their explicitly pending release acceptance. No owner
  interruption is needed to continue P4.
- **Current chunk: P4 / #9**, branch `branch/issue-9-toggle-audit-journal`,
  based on #41 at `5350529`. **Outcome:** every accepted website safety change
  commits an immutable actor/old/new/UTC-event receipt in the same InnoDB
  `web_settings` transaction. A separate bounded publisher converges to one
  audit row after sink outages/restart/ambiguous acknowledgement. **Non-goals:**
  new messaging infrastructure, MUD command idempotency, blanket log cleanup,
  unapproved retention/deletion or production operations. **Files:** hook
  settings/journal, generic settings boundaries, hooks routes, lifecycle,
  one audit-event identity migration/forward contract, focused/native tests,
  ADR/security/operator documentation and this plan. **Proof:** actual DB
  failure/retry/concurrency/cache and route authorization, both engines,
  immutable owner metadata, required backend gates and review-ready publication.
- **P4 ablation and semantics:** reuse settings rows, transactions and the
  existing polling lifecycle pattern; no separate outbox table, Redis queue,
  lease service or queue trimming. The journal namespace is `hook-audit-v1:`.
  A UUID is both request and event identity. Website-only PATCH accepts a caller
  identity; repeated identity reuses its immutable change receipt and reports
  current state without reverting a newer change. Conflicting reuse fails.
  Distinct identities, including same-state requests and each reconciliation
  website step, create distinct events. Reconcile remains a fresh observed
  distributed operation, with no claim of remote-command deduplication. Pending
  events retry indefinitely with bounded backoff; no retention runs in P4.
- **P4 native findings and repairs:** the first native run exposed a reserved
  SQL alias in audit lookup; the event stayed pending and was recoverable. Use
  an unambiguous alias and quote the timestamp identifier. Concurrent duplicate
  inserts then reproduced a lock-upgrade deadlock; roll back the failed INSERT
  before reading the immutable receipt without a lock upgrade. The audit lookup
  likewise needs no row lock because the journal row serializes publishers and
  the audit event identity is unique. This permits a SELECT/INSERT-only sink.
  Both engines subsequently pass real process-restart/write-permission recovery,
  crash after audit insert, commit ambiguity, bounded malformed queues and newer
  toggle preservation. New UTC provenance uses one database epoch without
  changing session timezones. Required table/schema loss still refuses startup
  under #14; the recovered outage qualification concerns audit-write availability,
  while authoritative settings storage must remain transactional and available.
- **P4 SQL-mode regression:** a real `NO_BACKSLASH_ESCAPES` session reproduced
  an accepted setting with an unreadable escaped JSON value under ordinary
  query interpolation. Journal parameters now use the driver's prepared binding
  protocol; fixed transaction commands remain unchanged. No SQL safeguard is
  relaxed. The new native regression checks durable JSON and audit delivery
  under that mode, then restores the exact original session mode.
- **Separate observed follow-up:** generic raw settings timestamps append `Z`
  to naive database text. That is wrong when the database session offset differs
  from UTC. Correct this as its own focused change after the journal chunk;
  P4's hook event/provenance path already uses explicit epoch conversion.
- **P4 qualified so far:** 52 focused/native tests pass on each engine through
  `/tmp/durisweb-run-p4-suite.mts <23436|23437> hook-only`, including real
  process death after insert, separate process restart under denied audit writes,
  all commit uncertainty, distinct/duplicate concurrency, protected namespace,
  cache races, nontransactional refusal, UTC provenance and no-backslash mode.
  Both published 198-table MUD metadata fingerprints remain exact. The full
  backend run passes **1,194 tests / 119 suites** before the final collation-
  alias read guard; only that boundary needs a focused repeat. Genuine restored
  web history plus all forwards passes five native qualification tests on both
  engines, preserving two legacy null-identity audit rows and every old ledger
  row. Logs: `/tmp/durisweb-p4-hook-native.log`,
  `/tmp/durisweb-p4-hook-maria.log`, `/tmp/durisweb-p4-full-suite.log`, and
  `/tmp/durisweb-p4-legacy-native.log`.
- **P4 limits/news:** no retention or subject-request mutation is introduced;
  pending/invalid receipts and attributed audit identities refuse schema down.
  Operator APIs expose safe aggregates and bounded retries under the existing
  MUD-properties permission. No frontend change is needed. Admin Website
  Changelog draft: **Reliable safety-setting history** — “Safety-setting changes
  now keep a durable record and recover their audit entries after temporary
  failures.” Publish only after an authorized, verified live release. No live
  control, MUD process, existing backup, shared database, tag or news publication
  is part of this source qualification.

- **P4 pending-queue regression:** a one-event batch failed to reach new pending
  work behind completed receipts. Keep delivery state in the reserved row's
  existing `description` and select pending/invalid records directly; JSON keeps
  only event/retry data, with no duplicate status representation. Publication
  still updates that row and audit together. This reuses storage and avoids
  trimming, extra tables or a second scanner. A native backlog regression proves
  completed history cannot consume the pending-work batch. The final envelope
  and status encoding remain version 1, not yet deployed.

- **P4 final refreshed verification:** merged #41 at `7fd35ba` without rewriting
  history, including its reviewed forum repairs, owner-fixture pins/least-privilege
  loader and table-option guards. The final backend run passes **1,196 tests /
  119 suites** with 89 real source migrations; dependency/data-readiness preflight
  passes before and after tests and the published owner metadata remains exact
  (`/tmp/durisweb-p4-publication-full-suite.log`). Each engine's focused runner
  passes 53 tests; the later safe-route-log sentinel case passes in the focused
  boundary run and full suite. Eleven refreshed original/restored owner-schema
  tests pass (`/tmp/durisweb-p4-refreshed-legacy-native.log`). Reused unaffected
  installer/session matrix evidence instead of repeating it.
- **P4 commands/gates:** `/tmp/durisweb-run-p4-suite.mts 23436` runs the full
  backend suite, real schema write probe and configuration/dependency preflights;
  `23437 hook-only` repeats the control/settings/API qualification on MariaDB.
  Native legacy qualification uses `TEST_BASELINE_DB_PORTS=23336,23337
  TEST_BASELINE_MUD_SOURCE=/home/aiwithapex/projects/duris/migrations pnpm --dir
  backend test --runInBand src/db/__tests__/webBaselineQualification.test.ts`.
  Backend `schema:check`, `format:check`, `lint`, `type-check`,
  `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  `build`, standalone strict migration `tsc` with the P3 flags, and whitespace
  checks pass. Frontend frozen install, format/lint/types, all unit tests (**239 /
  49 files**) and build pass to cover the inherited forum dependency. Build uses
  explicit public test-only API/WebSocket/static endpoints and Vite host/port
  values; no `.env` or secret is written. Logs:
  `/tmp/durisweb-p4-refreshed-frontend.log`,
  `/tmp/durisweb-p4-refreshed-frontend-build.log`.
  No dependency changed. Temporary private debug scripts were removed; synthetic
  qualification logs/fixture generators remain as recovery evidence. No browser,
  provider, production or shared-environment operation was run. P4 engineering
  is ready for review; P6 policy/holds and live acceptance remain separate.

- **Published P4:** [PR #42](https://github.com/LuminariMUD/DurisWeb/pull/42),
  open/non-draft, code head `1ab23ac`, stacked on #41 at `7fd35ba`. Exact local,
  remote and PR head matched; ahead/behind `0 0` and a clean worktree were
  verified. Final checks include the source-safe hook-route log sentinel and
  least-privilege fixture grants. No merge, tag, deployment or live verification
  is claimed. Next: the recorded standalone raw-settings UTC correction, then
  notice/analytics choice and the remaining privacy lifecycle work.

- **Configuration guard follow-up:** `branch/session-probe-config-guard` starts
  at #43 `b0d8e0a`. **Outcome:** distinguish the existing protected child-process
  session fixture from production configuration readers. **Non-goals:** relaxing
  runtime configuration ownership or exempting the whole test-helper directory.
  **Files:** literal-check script and this plan. **Proof:** the check previously
  failed on `src/test/sessionTimezoneProbe.ts`; exclude only that exact fixture,
  then prove a temporary production-source environment read still fails. The
  fixture refuses execution before imports unless explicitly opted into a
  disposable loopback target. No runtime/session behavior or dependency changes.
  `bash -n scripts/check-config-literals.sh`, the real guard and
  `git diff --check` pass. `/tmp/durisweb-verify-config-guard.py` confirms the
  guard rejects a temporary production-source read, then removes that sentinel.
  No runtime/build/database test or Website Changelog entry is needed for this
  source-tool classification correction. Leave it review-ready without a tag.

- **Current follow-up:** `branch/settings-utc-provenance` starts at #42
  `4b28587`. **Outcome:** generic raw-settings timestamps represent the stored
  instant as UTC, including a truthful unknown/null value. **Non-goals:** schema
  changes, pool timezone changes, historical backfills or UI redesign. **Files:**
  backend settings reader/type, matching frontend type, existing configuration
  tests and this plan. **Proof:** real TIMESTAMP rows read under a +03 database
  session while the app is UTC, null timestamp handling, required package gates
  and a focused review-ready PR. Use SQL epoch extraction; remove the old Date/
  naive-text formatting branches rather than adding a timezone workaround.

- **UTC follow-up proof:** the pre-fix native check reproduced a three-hour
  shift: stored `2026-03-27T01:02:03Z` returned as `04:02:03Z` under a +03
  database session. Epoch extraction now returns the original UTC instant and
  `null` for unknown/invalid timestamps; the frontend type reflects nullability.
  Both native runners pass **55 focused tests** with dependency preflight and
  exact owner metadata before/after. Logs: `/tmp/durisweb-settings-utc-before.log`,
  `/tmp/durisweb-settings-utc-mysql.log`,
  `/tmp/durisweb-settings-utc-maria.log`. The backend required format/lint/types/
  build and whitespace gates pass. Frontend `format:check`, `lint`, `type-check`,
  `test:unit --run` (**239 tests / 49 files**) and `build` pass with explicit
  synthetic public build configuration. `pnpm --dir backend verify:mud-writes
  --mud-manifest /home/aiwithapex/projects/duris/migrations/migration_manifest.json`
  passes (53 classified writes). Logs:
  `/tmp/durisweb-settings-utc-frontend.log` and
  `/tmp/durisweb-settings-utc-frontend-build.log`.
  No schema/migration, stored value, cache
  policy, pool state or MUD behavior changes. Unaffected full-backend/session
  matrix evidence is reused; no new full/backend browser/live claim is made.
  Prepared admin release wording: “Website-setting update times now show the
  correct UTC instant when server timezones differ.” Publish only after live
  verification; no tag, production or changelog operation occurred.

- **Published UTC follow-up:** [PR #43](https://github.com/LuminariMUD/DurisWeb/pull/43),
  open/non-draft at code head `beba0f2`, stacked on #42 at `4b28587`. Local HEAD,
  remote head and API head match, ahead/behind is `0 0`, and the worktree is
  clean. No rebase, merge, tag or live operation is needed. Next independent
  engineering stage is P5: inspect both analytics mounts, direct service callers,
  CSRF exemption and unconditional client tracking before defining the smallest
  enforceable choice boundary. Keep optional providers disabled until approved;
  do not infer policy/retention approval from the supplied contact details.

- **P5 first engineering chunk / #10:**
  `branch/issue-10-stop-unconsented-analytics` starts at #43 `b0d8e0a`.
  **Outcome:** stop optional website analytics before approved notice/choice
  controls exist, including old clients and the alternate API mount. Remove
  the ungated writer so a direct service call cannot bypass the closure. Remove
  the browser identifier/timers/field collection and clear the known legacy
  identifier on startup, without breaking storage-denied browsers.
  **Non-goals:** declaring P5 complete, approving policy/retention/provider terms,
  deleting historical analytics, changing security/MUD analytics, replacing the
  read-only admin dashboard, or deployment. **Files:** browser analytics startup,
  HTTP tracking route, obsolete backend writer/validator, CSRF exemption, focused
  tests, API/security docs and this plan. **Proof:** old/forged/unknown payloads
  denied through both mounts; CSRF enforced; no database/provider calls; client
  storage cleanup and no tracking work; required gates in both packages and a
  synthetic browser navigation/refresh/storage-denial check.
- **P5 ablation:** removing the unapproved path is sufficient for this first
  chunk; no new environment switch, cookie, database table, migration or
  placeholder consent mechanism is justified yet. Keep P5's full notice/receipt/
  withdrawal/minimization acceptance open. Follow with a versioned server-owned
  choice boundary and accessible notice/preferences, using a concrete policy
  proposal for the still-unapproved consequential details. A client-only banner
  would leave the alternate mount and direct writer open.
- **P5 closure source checks:** before-fix tests reproduced accepted legacy
  events at both mounts, the public CSRF bypass and a retained browser ID.
  `pnpm --dir backend test --runInBand
  src/routes/__tests__/webAnalyticsValidation.test.ts
  src/middleware/__tests__/canonicalHost.test.ts
  src/utils/__tests__/geoip.test.ts` now passes **48 tests / 3 suites**.
  Backend `format:check`, `lint`, `type-check`, `build` and `verify:mud-writes
  --mud-manifest /home/aiwithapex/projects/duris/migrations/migration_manifest.json`
  pass (53 classified writes). Frontend `test:unit --run` passes **241 tests /
  50 files**, and `format:check`, `lint`, `type-check`, `config:check`, `build`
  and `./frontend/scripts/check-palette-literals.sh` pass. The build uses
  `/tmp/durisweb-p5-frontend-env.sh` with synthetic loopback URLs, no env file.
  No schema, retained row or provider call is changed; previous native schema/
  timezone evidence remains applicable. No new full backend/native run is claimed.
- **Separate gate repair:** the actual `./scripts/check-config-literals.sh`
  found a protected P3 test-probe classification issue. It is repaired separately
  in [PR #44](https://github.com/LuminariMUD/DurisWeb/pull/44) (`49ba05f`),
  with a negative production-source sentinel proving the guard remains enforced.
  Integrate that focused parent before publishing this chunk.
- **Browser qualification in progress:** Browser plugin not available; installed
  Playwright 1.63.0 is used against `http://127.0.0.1:25474` built preview with
  synthetic API replies and fresh browser contexts. Login → Back to Home →
  refresh proves no tracking request and legacy-ID cleanup in fresh/legacy
  profiles. Denying all browser storage reveals existing uncaught reads in
  `ChangelogBanner` and `useNotifications`; keep that repair as a separate next
  change, then repeat desktop/mobile qualification. First blocking service-worker
  registration was a test-fixture error; use real isolated service workers for
  this built preview, without claiming live acceptance. No new browser dependency
  or provider is used. Full P5 choice/notice acceptance remains open.
- **P5 first release draft:** after an authorized release verifies this source
  live, reconcile existing Website Changelog entries and publish: “Optional
  website visit tracking is paused while privacy choices are prepared.” This
  describes the actual paused state; do not announce accept/withdraw controls
  before they exist. No live publication, tag or release is claimed now.

- **Published P5 collection closure:**
  [PR #45](https://github.com/LuminariMUD/DurisWeb/pull/45), open/non-draft at
  `069f7b5`, is stacked on #44. Local/remote/API heads match, ahead/behind `0 0`,
  clean checkout verified. Its full browser qualification follows the separate
  storage-denial repair below; the approved notice/choice outcome remains open.
- **Observed browser-storage repair:** `branch/browser-storage-preferences`
  starts at #45 `069f7b5`. **Outcome:** blocked preference storage must not throw
  during notification initialization or changelog-banner account changes and
  dismissal. Unknown notification preference fails closed; explicit actions can
  work for the current page without falsely claiming they were saved.
  **Non-goals:** a repository-wide storage framework, changing permission prompts,
  analytics collection, server persistence, or broad unrelated cleanup.
  **Files:** `useNotifications`, `ChangelogBanner`, focused existing-domain tests
  and this plan. **Proof:** denied reads/writes through mounted components,
  successful browser permission despite a failed preference write, ordinary
  persisted behavior, frontend gates, and the same real built browser matrix.
  Use local guarded accesses; no dependency or configuration is needed.
- **Storage repair proof:** `pnpm --dir frontend test:unit --run
  src/composables/__tests__/useNotifications.spec.ts
  src/components/changelog/__tests__/ChangelogBanner.spec.ts` initially reproduced
  four failures plus an unhandled write exception. After the repair, the full
  `pnpm --dir frontend test:unit --run` passes **250 tests / 52 files**, including
  account switches and new-update dismissal invalidation when storage is denied.
  Frontend `format:check`, `lint`, `type-check`, `build`, palette literal guard,
  configuration literal guard and `git diff --check` pass. Changed files were
  formatted with `pnpm --dir frontend exec biome format --write <changed files>`.
  Logs: `/tmp/durisweb-storage-preferences-before.log`,
  `/tmp/durisweb-storage-preferences-frontend.log`,
  `/tmp/durisweb-storage-preferences-build.log`. Backend source is unchanged
  from the qualified P5 collection closure; no new backend/native run is claimed.
- **Completed closure/browser proof:** `node /tmp/durisweb-p5-closure-browser.mjs`
  passes all six cases: 1440×1000 and 390×844, each with fresh storage, the legacy
  identifier and all storage reads/writes/removals denied. The real built app
  loads the login route, uses Back to Home navigation, renders meaningful home
  content and survives refresh. Zero tracking/provider requests and no unexpected
  console/page errors occur; expected anonymous-auth 401 and existing router
  deprecation messages are classified separately. The old ID is absent where
  storage permits inspection. Page identity, title, no-overlay and desktop/mobile
  screenshots are verified. Logs: `/tmp/durisweb-p5-closure-browser.log`; images
  `/tmp/durisweb-p5-closure-{1440,390}-{fresh,legacy,denied}.png` stay outside Git.
  Preview is local/synthetic, not production, device, full consent or legal
  acceptance. No historical analytics are deleted. No deployment/tag/public
  Changelog operation occurred. Additional future release wording: “Notification
  and website-update controls handle browsers that cannot save preferences.”

- **Published storage repair:** [PR #46](https://github.com/LuminariMUD/DurisWeb/pull/46),
  open/non-draft at code head `266058e`, stacked on #45 `069f7b5`. Exact local,
  remote and PR heads match; clean checkout and ahead/behind `0 0` verified.
  #45's description now links the separately proven browser repair. Keep all
  focused PRs open for review, with normal ancestry preserved; no tag/merge
  is justified. Preview is stopped after qualification. Private reproduction
  logs and generators remain outside Git; the one-time writer-removal script
  was removed after its source change was committed.
- **Next continuation:** worktree `/tmp/durisweb-security-privacy-plan-20261016`,
  branch `branch/browser-storage-preferences`. Start a dependent branch from its
  published head. P5 is deliberately incomplete: the current source has no
  optional writer, client identifier, consent cookie or analytics enable switch.
  Inspect existing shell/router/mobile navigation and same-origin CSRF plumbing,
  prepare a truthful versioned public-notice draft and concrete minimized policy
  proposal, and implement the choice receipt/state machine without silently
  approving provider transfers or retention periods. Acceptance/refusal/expiry/
  withdrawal/cross-tab/in-flight ordering must precede any future reintroduction
  of collection. Do not mark #10 complete for the temporary closure alone.
  P6/P7 still need their complete engineering and approved lifecycle decisions;
  production rollout remains outside this request.

- **P0 registry prerequisite for remaining P5–P7:**
  `branch/privacy-processing-registry` starts at #46 `1761613`.
  **Outcome:** a source-backed lifecycle inventory covering every website table,
  post-baseline credential/audit overlays, mixed journal/settings data, indirect
  subject links, externally owned records and non-SQL copies. **Non-goals:**
  approving periods, legal/controller claims, enabling analytics, implementing
  deletion/export from table names, or inspecting live personal data. **Files:**
  permanent lifecycle guide, its security-record link and this plan. **Proof:**
  exact 77-table baseline coverage, all listed columns/joins checked against the
  pinned DDL and current migrations/callers, explicit approval gaps and source
  references, relative links and whitespace. This documentation is required by
  P0 and will drive the notice and P6/P7 allowlists; no generic registry framework
  or production configuration is needed for discovery.
- **Registry output:** [website data lifecycle inventory](../privacy-data-lifecycle.md)
  records exact table coverage, personal fields/selectors, time candidates,
  restricted evidence, indirect relationships, post-baseline session/audit
  overlays, pending journals, external ownership, non-SQL copies and proposed
  owner decisions. It distinguishes an authorization lifetime from physical-row
  retention, capabilities from active provider transfers, and soft deletion from
  verified erasure. No P0 approval checkbox or P5 completion claim is inferred.
- **Registry verification:** `/tmp/durisweb-check-privacy-doc.py` confirms exact
  **77 distinct baseline table rows**, no missing/extra/duplicate tables, existing
  local links, session/audit overlays and the minimum import-evidence hold.
  Listed fields were inspected against the full pinned DDL; current service
  boundaries confirm the session replacement, backup omission, audit namespace,
  mixed/indirect records, image-deletion recovery gap and permission-gated admin
  GeoIP transfer. `pnpm --dir backend schema:check` verifies 77 tables and 85
  pinned historical sources. No data source, provider or production was queried.
- **Contact/guard boundary:** recording the owner's supplied email is required
  for a useful handoff. The deployment-literal guard initially rejected that
  legitimate contact. Exempt only its exact complete inventory line, with no
  whole-document exception. `bash -n scripts/check-config-literals.sh`, the real
  guard, `/tmp/durisweb-check-privacy-guard.py` and `git diff --check` pass.
  Negative cases prove a real hostname elsewhere in the same inventory, or
  appended to the allowed contact line, still fails. No backend/frontend runtime,
  database, migration, browser or build rerun is needed or claimed for this
  documentation plus shell-guard change. No Website Changelog entry is needed:
  it does not add a public page or change live behavior.

- **Published registry:** [PR #47](https://github.com/LuminariMUD/DurisWeb/pull/47),
  open/non-draft at code/document head `65d756d`, stacked on #46 `1761613`.
  Exact local, remote and PR heads match; ahead/behind `0 0` and a clean worktree
  are verified. No tag, merge or production action is justified. Current branch:
  `branch/privacy-processing-registry`; original checkout remains untouched.
  Continue P5 from this published head, using the permanent lifecycle inventory
  to draft the notice and a separate versioned server-owned choice contract.
  Proposed periods remain unapproved; runtime collection remains absent.

Follow [conventions](../CONVENTIONS.md), [development](../development.md),
[architecture](../ARCHITECTURE.md), [security](../SECURITY-COMPLIANCE.md), and
[design](../DESIGN.md). Preserve existing safety gates and the MUD's schema and
mutation authority. A copied MUD table fingerprint is a verification input,
not permission to modify those tables. No production data, credentials,
provider responses, dumps, or private operational evidence belong in this file.

The source review establishes engineering gaps, not a legal determination or a
claim about current production settings. Processing purposes, periods,
exceptions, request handling, and provider commitments need a named owner's
approval. These decisions are implementation/release prerequisites, not reasons
to leave this planning deliverable incomplete.

## Original findings checked against the pinned starting source

These describe the starting revision. The execution record and phase checkboxes
above/below distinguish current source implementation from pending live rollout.

### #7 — Replayable refresh tokens: confirmed

[Login](../../backend/src/routes/auth.ts) writes the raw refresh JWT into
`web_sessions.refresh_token`.
[Session validation](../../backend/src/services/sessionService.ts) compares it
verbatim, with account, session ID, and database expiry predicates. Access
middleware also checks the session row, so revoking the row affects access as
well as refresh. Preserve that binding.

The current [JWT constants](../../backend/src/middleware/auth.ts) and cookie
lifetimes are **30 days**, whereas login creates a **7-day database session**.
The security record's seven-day token wording is imprecise. Keep the effective
seven-day session ceiling unless a separate product decision changes it.
[Production preflight](../../backend/src/scripts/productionPreflight.ts) also
requires the raw token column to hold at least 512 characters; changing only the
login and comparison code would leave the deployment contract wrong.

### #8 — Timezone-dependent expiry: source risk confirmed; schema qualified

Login binds a JavaScript `Date`; validation uses `expires_at > NOW()`.
[The mysql2 pool](../../backend/src/db/connection.ts) uses `dateStrings: true`
without a serialization timezone. Its invariant check compares session/server
timezones, not JavaScript serialization with database interpretation.

However, [the checked-in legacy DDL](../../backend/migrations/006_create_forum_tables.sql)
declares `expires_at TIMESTAMP`, not DATETIME. No live schema or historical
exploit was inspected/reproduced in this planning task. A future migration must
inspect `information_schema`, support explicitly tested existing shapes, and
reject unknown drift. Simply substituting `UTC_TIMESTAMP()` for `NOW()` can
still be wrong when comparing a session-converted TIMESTAMP.

### #9 — Durable toggle history gap: confirmed, with existing attribution

[setHookEnabled](../../backend/src/hooks/hookSettingsService.ts) persists the
setting and its `updated_by`/`updated_at`, invalidates caches, then attempts the
separate `admin_action_log` insert. Thus the latest actor already survives an
audit failure, but complete old/new transitions and stable event identities do
not. Its `previous` value also comes from the process cache, which is not a
serialized previous value during concurrent requests. The
[existing tests](../../backend/src/hooks/__tests__/hookSettingsService.test.ts)
cover ordinary attribution, effective state, and terminal refusal, not durable
recovery across audit outage/crash/retry.

### #10 — Optional analytics has no consent boundary: confirmed

[analytics.ts](../../frontend/src/services/analytics.ts) creates a persistent
localStorage identifier before sending initial and delayed route events;
[main.ts](../../frontend/src/main.ts) initializes it unconditionally.
[The route](../../backend/src/routes/webAnalytics.ts) accepts anonymous events
and adds IP/user-agent data; [the service](../../backend/src/services/webAnalyticsService.ts)
calls GeoIP before inserting `page_views` and `visitor_sessions`.

No processing-notice route or analytics consent implementation was found in the
router, shell, tracking service, or backend collection path. The router is
mounted at both `/api/analytics` and `/api/admin/analytics/web` in
[index.ts](../../backend/src/index.ts): enforce collection policy inside the
shared route/service so the second mount cannot bypass it. The account-name
branch is conditional on `req.user`, but this route does not install optional
authentication. Do not infer that present-day events reliably identify logged-in
accounts, or join anonymous browsing to accounts by IP.

### #11 — General retention is missing; some cleanup already exists

No common policy inventory or general bounded retention runner was found.
Existing behavior includes [backup count retention](../../backend/src/services/backupService.ts),
[one-hour orphan-image cleanup](../../backend/src/services/postImageService.ts),
[invalid push-endpoint removal](../../backend/src/services/pushNotificationService.ts),
and [per-account notification deletion](../../backend/src/services/unifiedNotificationService.ts).
These are useful components, not a comprehensive schedule. Orphan-image cleanup
currently removes the database record even after an object-deletion failure;
it must not be reused as proof of completed erasure without repairing that
recovery behavior within this work.

### #12 — Complete account export/erasure is absent in the website

Profile/character administration, session revocation, push deletion, and feature
CRUD exist, but the inspected routes/services contain no complete verified
subject-request lifecycle. Authentication depends on MUD account flatfiles via
[accountService](../../backend/src/services/accountService.ts), so deleting web
rows alone neither erases the game account nor prevents website recreation.

The copied [MUD ownership inventory](../../backend/mud-write-allowlist.json)
already names `account_erasure_requests`, `account_erasure_stores`,
`account_erasure_evidence`, and `account_erasure_tombstones`. This is evidence of
an external ownership contract, **not** proof that a usable website integration
or deployed MUD workflow exists. Confirm that contract with the MUD owner before
planning its adapter; do not create competing web tables with those names.

### #13 — Unsafe GeoIP logs: confirmed beyond the two IP branches

[geoip.ts](../../backend/src/utils/geoip.ts) logs IP/provider messages on refusal,
raw exceptions on catch, and untrusted `statusText` on HTTP failure. Its Redis
keys contain IPs; [cache helpers](../../backend/src/db/redis.ts) also log raw
errors, which need a sentinel test for command/key leakage on this call path.
The helper is called by optional analytics and an administrative lookup in
[admin.ts](../../backend/src/routes/admin.ts). Treat those purposes separately.
The source uses an HTTP provider endpoint; transport/provider policy belongs
with #10, rather than silently changing lookup/access behavior in #13.

### #14 — Bootstrap gap: confirmed; historical replay is not the solution

There are **83 TypeScript migration files** at the reviewed revision and **12**
SQL artifacts classified `baseline-pending-conversion` in
[sql-artifacts.json](../../backend/migrations/sql-artifacts.json).
[Knex](../../backend/knexfile.ts) uses the TypeScript chain. The count describes
source files, not a verified live ledger.

The historical chain relies on absent web tables and includes MUD-touching
compatibility migrations. Its later
[contract repair](../../backend/migrations/20260902143000_preserve_mud_runtime_contract.ts)
is not permission to repeat earlier alterations. A baseline must describe the
final website schema, including unified `notifications` instead of recreating
obsolete notification tables. Exclude MUD-owned `005_create_accounts_table.sql`
and one-off `017_fix_emoji_icons.sql` repair. A database containing the approved
MUD schema but no website schema is the bootstrap target; a completely blank
SQL database is not a substitute for the MUD-owned baseline.

## Delivery order and shared decisions

Use small, reviewable implementation commits on the linked branch. Refresh
`origin/master` and recheck affected findings before starting each stage.

1. **P0: inventory and decisions** establishes ownership and policy inputs.
2. **P1: GeoIP diagnostics (#13)** is independent and can be completed first.
3. **P2: reproducible schema (#14)** creates the common fixture/upgrade path.
4. **P3: sessions (#7 + #8)** shares one schema and logout rollout.
5. **P4: toggle attribution (#9)** establishes durable audit recovery.
6. **P5: notice and consent (#10)** uses the approved inventory; implementation
   may proceed alongside P3/P4 after P2, but release needs the policy decision.
7. **P6: retention (#11)** uses P0 policy, P2 schema, P4 pending-event rules,
   and P5 consent/notice semantics.
8. **P7: export and erasure (#12)** reuses P3 revocation, P6 lifecycle primitives,
   and approved MUD/provider handoffs.
9. **P8: integration/release qualification** reconciles all acceptance evidence.

P1 need not wait for policy approval. P3/P4 need not wait for privacy-copy
approval. No destructive job, public policy claim, or MUD adapter should guess
missing owner decisions. No issue is complete merely because its plan or schema
has landed.

## P0 — Inventory and owner decisions

- [ ] Name the processing-policy owner, operational approver, and MUD contact in
  the implementation record. Approve controller/contact details, purposes,
  relevant providers/transfers, optional versus necessary processing, human
  review of suspicion scoring, request verification, and handling of objections.
- [ ] Produce a source/schema-backed registry per data class: tables/columns and
  non-SQL stores, authoritative owner, subject keys, purpose, timestamp/cutoff,
  retention period, deletion versus anonymization, holds, access restrictions,
  provider/cache/backup copies, and verification query. Periods remain explicitly
  **unapproved** until signed off; never default an unknown class to purge.
- [ ] Include sessions; `page_views`/`visitor_sessions`; login/connection/IP and
  reverse-DNS projections; profiles/stats; all forum authorship, reactions,
  subscriptions, mentions, polls/votes/history; unified notifications; PvP web
  comments/reactions/quotes; push endpoints/keys; R2 profile and post media;
  donations/outbox; bans; permission/moderation/admin/builder/terminal/deploy/
  backup records; operational metrics/incidents; suspicion evidence and Gemini
  `full_results`; consent, request, export, and pending-audit records introduced
  here. Derive exact tables from migrations and current readers/writers.
- [ ] Reconcile external authority against the pinned MUD manifest; table names
  or the presence of a historical web migration do not establish web ownership.
  Include read-only MUD export categories and separately coordinated mutations.
- [ ] Inspect provider feature gates and operator attestations before declaring
  a transfer active. Gemini is guarded by `GEMINI_ENABLED` and a key in
  [its implementation](../../backend/src/services/geminiSuspicionAnalyzer.ts).
  Do not enable Gemini or expand issue #18's rollout scope here.
- [ ] Record treatment of backups, logs, CDN/browser copies, and restored data.
  Privacy erasure cannot promise removal from an immutable backup immediately;
  require bounded expiry/access rules and reapplication of completed removals
  before a restored service accepts traffic.
- [ ] Preserve the minimum **2027-03-03 review boundary**, with no automatic
  deletion, for [quarantined items](../post-import/quarantined-item-disposition.md)
  and [orphaned comments](../post-import/orphaned-pvp-comment-disposition.md).
  Resolve current protected evidence locations privately; retired-host paths
  are not evidence of present copies.

Exit: every scoped data class has an owner and disposition, policy decisions
have a named approver, and unknown/external classes remain excluded from
mutation. Durable documentation is added to the appropriate guides during
implementation, with this file remaining the single execution plan.

## P1 — Safe GeoIP diagnostics (#13)

- [x] Replace all GeoIP failure logging with fixed categories such as
  `provider_http_failure`, `provider_refusal`, `invalid_response`, and
  `lookup_exception`. Only allow a validated numeric HTTP status and bounded
  locally generated operation reference; never include IP, URL, statusText,
  provider message/body, exception object/message/stack, or request headers.
- [x] Validate untrusted response data with strict types rather than adding new
  `any`. Preserve cache TTL, cache hit/local-IP behavior, null-on-lookup-failure,
  and the existing VPN/proxy fallback/access semantics.
- [x] Exercise failures through Redis helpers as well as the GeoIP logger. If
  injected command errors leak the IP-bearing cache key, minimally sanitize
  those helper diagnostics too; do not stop at the direct GeoIP call sites.
- [x] Add focused mocked tests for HTTP refusal including hostile statusText,
  provider `status: fail`, network rejection, malformed JSON/response, cache
  failure, successful/cache/local lookup, and batch behavior. Assert synthetic
  IPv4/IPv6, URL, token, and payload sentinels are absent from **all** logger
  arguments, while safe categories remain observable.
- [x] Update the GeoIP finding after verification; leave provider disclosure and
  transport disposition to P5.

Exit: failure behavior is preserved and sentinel tests cover every reachable
GeoIP diagnostic branch without contacting the provider.

## P2 — Versioned website baseline and honest provenance (#14)

Design direction: an explicit, versioned **current web schema baseline**, with
a checksummed provenance record and a reviewed migration-source
transition. Do not globally enable SQL discovery or replay historical MUD DDL.

- [x] Derive a website-only schema artifact from all current migrations,
  runtime queries, and preflight requirements. Record baseline version, artifact
  checksums, exact covered migration filenames/checksums/cutoff, expected web
  tables/columns/indexes/FKs/defaults/collations, required nonsecret seed settings,
  and the compatible MUD baseline identity/fingerprint. Archive legacy SQL as
  classified provenance; replace each pending classification only when its
  replacement is accounted for. Do not copy a production dump into Git.
- [x] Implement explicit bootstrap and verify commands under
  `backend/src/scripts/`, with a new baseline module/manifest outside the
  historical migration discovery set. Refuse a wrong MUD fingerprint, unknown
  populated web schema, unexpected ledger, ambiguous ownership, or a target
  lacking an explicit approved identity. Installation is never automatic at
  application startup.
- [x] Bootstrap only after the owner-provided MUD schema is in place. Create
  website objects in FK order without new incoming FKs to MUD tables. Treat
  MySQL/MariaDB DDL as nontransactional: persist progress and verify each step;
  interrupted/repeated runs may resume only exact expected partial shapes.
  Never accept an arbitrary existing object merely because `IF NOT EXISTS`
  would skip it.
- [x] Use a separate web-baseline provenance record to attest what was actually
  installed. A verified baseline may supersede only its exact covered historical
  migrations for a fresh database. Adapt Knex migration discovery/status and
  production preflight together: keep already-applied historical names visible
  for existing ledgers, omit only explicitly covered **unapplied** history on
  verified fresh installs, and execute all later migrations normally. Validate
  manifest/file checksums and schema postconditions before accepting coverage.
  Never insert fictitious historical `knex_migrations` rows, clear a ledger, or
  change previously applied files to conceal drift.
- [x] Existing environments retain their original ledger. Verify their web
  schema/ledger, record adoption separately if needed, and apply only new
  forward migrations. Unsupported older/drifted shapes get an explicit
  diagnostic and a reviewed forward repair, not automatic reconciliation.
- [x] Make baseline teardown ownership-aware and limited to objects created by
  that install, refusing populated/adopted stores unless the approved recovery
  procedure permits it. Give every new migration a tested `down`; document
  irreversible data effects separately. Never use historical rollback across
  the MUD contract boundary.
- [x] Rehearse: approved empty MUD schema → baseline → forward changes;
  synthetic restored existing web schema/ledger → same forward changes;
  interrupted bootstrap; rerun; changed checksum; missing/unknown objects;
  wrong MUD identity; forward/down/forward for each new migration. Exercise
  MySQL 8 and the supported MariaDB deployment family, documenting exact
  versions. Compare normalized web postconditions and MUD fingerprints before
  and after, not only migration exit codes.
- [x] Verify representative session, forum/profile/permissions, analytics,
  settings/hook, notification, changelog, and wiki queries, plus configuration
  and dependency preflights. Feature readiness may still require explicit wiki
  publication/forum taxonomy; schema presence alone must not fabricate data.
- [x] Update README, backend guide, onboarding, development, architecture,
  deployment, and preflight tests to describe the supported paths and recovery.

Exit: both clean setup and existing-ledger upgrade reach equivalent required
web schema; historical ledgers and MUD schema remain intact. The baseline
becomes the synthetic fixture foundation for all later stages.

## P3 — Session digests and timezone-independent expiry (#7, #8)

Use a single coordinated session cutover. The proposed target row stores
`refresh_token_digest BINARY(32)` and `expires_at_epoch BIGINT UNSIGNED` (UTC
Unix seconds), retaining session ID/account binding and appropriate indexes.
Integer expiry avoids both mysql2 Date serialization and TIMESTAMP/DATETIME
conversion. Compare it with the database's current epoch (`UNIX_TIMESTAMP()`),
with expiry exclusive at the boundary. Keep existing pool safeguards; this
change need not change the timezone of unrelated MUD or website queries.

- [x] Add one session-credential helper using Node crypto SHA-256 over the exact
  issued JWT bytes. Validate nonempty string input; missing/undefined refresh
  tokens must not fall through to access-only lookup. Digest at insert and
  refresh comparison. Keep raw JWTs only in the HTTP-only client cookie and
  transient processing; forbid tokens/digests in logs, exports, and diagnostics.
- [x] Keep signature/type checks before refresh lookup and retain session/account
  predicates, access revocation, logout, permission checks, password-change
  teardown, and terminal/WebSocket authorization. Do not silently add refresh
  rotation or extend the effective seven-day database lifetime. Document the
  current 30-day JWT/cookie versus seven-day session distinction accurately.
- [x] Add new forward migrations and update row types, fixtures, preflight,
  baseline postconditions, and incident/configuration documentation together.
  Keep a finalized baseline immutable; update baseline-plus-forward verification.
  Choose an explicit expand/cutover/contract sequence: add nullable new columns
  and permit nulls in legacy credential/expiry columns during the transition;
  stop/drain old website writers during an authorized release; invalidate all
  legacy session rows; deploy code that refuses incomplete/digestless rows;
  verify new writes; remove the replayable column and obsolete expiry column
  and enforce target nullability. No raw/digest dual-read fallback.
- [x] The invalidation intentionally also discards uncertain legacy expiry
  interpretations. Inspect and record the old column type in rehearsal; do not
  guess offsets or backfill still-valid sessions from naive historical values.
  Make migrations reject unsupported shapes. Rehearsal records `TIMESTAMP`;
  an unknown/naive `DATETIME` shape requires a separately reviewed empty-session
  repair, never guessed offsets or backfilled credentials.
- [ ] **Release gate:** obtain the operator's global-logout decision and advance
  user-facing wording; inspect the actual deployed shape, stop/drain writers,
  run the write checkpoint and cutover, and verify live auth before closing the
  security findings. Source engineering does not satisfy this operational gate.
- [x] Implement reversible **schema** changes, with empty sessions on rollback.
  A digest cannot reconstruct a raw token; do not restore bearer rows from a
  backup or restart old raw-token writers as an automatic rollback. If an old
  binary needs the old schema, keep authentication closed until the authorized
  empty-session rollback and preflight pass.
- [x] Extend existing
  [session service](../../backend/src/services/__tests__/sessionService.test.ts),
  [lifecycle](../../backend/src/services/__tests__/sessionLifecycle.test.ts),
  [auth binding](../../backend/src/middleware/__tests__/authSessionBinding.test.ts),
  [password teardown](../../backend/src/routes/__tests__/passwordChangeSessionTeardown.test.ts),
  and [pool invariant](../../backend/src/db/__tests__/sessionInvariants.test.ts)
  coverage. Add route-level login/refresh tests proving database contents cannot
  be replayed and DB failure never issues/authorizes a session.
- [x] Test valid/wrong/empty/malformed token, wrong account/session, expiry,
  deletion/revocation, signature/type failure, and incomplete legacy rows.
  Exercise real isolated MySQL/MariaDB with application `TZ=UTC`,
  `Asia/Jerusalem`, and a negative-offset zone, database defaults `+00:00`,
  `+03:00`, and a negative offset, plus dates on both sides of DST transitions.
  Run separate processes where necessary to test actual Date serialization
  behavior. A still-signed JWT with a database session expired by 60 seconds
  must fail **both HTTP access and refresh**, including equality boundaries.
- [x] Prove normal UTC acceptance, retention cutoff behavior, and no changes to
  SQL mode/isolation/FK/timezone safeguards or MUD fingerprints. Distinguish
  timezone independence from clock synchronization; monitor excessive system
  clock skew without claiming this work eliminates it.

Exit: no new stored JWTs; old sessions are invalid by design; all session
consumers honor the same binding and expiry across the timezone matrix. Close
security findings only with the required implementation and rollout evidence.

## P4 — Durable toggle journal and audit recovery (#9)

Preferred design: persist a minimal immutable event in **the same `web_settings`
storage domain as the toggle**, under a reserved journal-key namespace, in the
same transaction. This avoids making the safety write depend on the availability
of `admin_action_log` or a separately unavailable audit table. The existing
[settings schema](../../backend/migrations/037_web_settings.ts) supports bounded
JSON event values. Record this design and failure limits in the
[hook-control ADR](../adr/0001-hook-control-ownership-and-state.md).

- [x] Lock/read the actual setting row, handling the absent-key/default-enabled
  case deterministically. Persist actor, hook ID, previous/new boolean values,
  UTC event time, unique event ID, and an idempotency/request identity. Commit
  the setting and journal together, then invalidate both hook/settings caches
  before returning the effective state. Do not derive old state from cache.
- [x] Keep the audit sink outside that transaction. A separate bounded worker
  reads pending events and appends `property_change` entries. Add a nullable
  uniquely indexed event identity to the web-owned audit table via a new
  migration; publish/ack transactionally or recover by that identity after an
  ambiguous commit. A retry must neither duplicate the audit entry nor erase a
  newer toggle. Reuse the lifecycle/backoff ideas of the existing
  [donation outbox](../../backend/src/services/donationOutboxService.ts), not its
  unrelated delivery or raw-error handling.
- [x] Reserve journal keys from generic settings read/update endpoints, bulk
  settings views, public configuration, and ordinary hook-key matching. Validate
  every envelope; cap individual event size and worker batches. Pending events
  cannot be dropped by a retention job or a full-queue trimming policy. Expose
  safe aggregate backlog/age/health and retry controls to authorized operators.
- [x] An audit-table outage must leave the toggle effective and attribution
  recoverable across process restart. If authoritative settings storage itself
  cannot commit, return a failed control operation and retain the previous
  durable state; do not claim success or fabricate durability. Document this
  existing storage-availability limit and the always-on terminal recovery path.
- [x] Define duplicate request and same-state semantics explicitly: reuse the
  recorded result for the same idempotency identity; conflicting reuse fails;
  a separate repeated request follows the documented no-op/event policy.
- [x] Test audit sink failure before/after insert, ambiguous acknowledgement,
  restart after toggle commit and after audit insert, duplicate/concurrent
  requests, absent settings, queue backlog, worker retries, malformed journal,
  settings commit failure, cache refresh, and MUD mismatch/unknown states.
  Assert terminal and unknown-hook refusal still happen before mutation.
- [x] Use bounded safe error categories, never raw SQL/errors/IP/secrets.
  Define the P6 boundary: pending/invalid records cannot be trimmed; completed
  receipts remain until approved retention/subject-hold handling is implemented.
- [ ] **P6 dependency:** implement approved delivered retention and subject-request
  holds before enabling any purge or erasure affecting journal/audit attribution.

Exit: a successful safety toggle has recoverable actor/old/new/event identity
and remains effective through an audit outage, with exactly one audit event
per accepted event identity after recovery.

## P5 — Public notice and enforceable analytics choice (#10)

- [ ] Publish an accessible pre-login privacy route using the existing shell,
  router, brand components, and desktop/mobile navigation. Include the approved
  owner/contact, purposes, categories, necessary security processing, optional
  analytics, providers/transfers, retention, user requests, and human review of
  profiling. Version the notice and choice policy. Do not claim disabled or
  unverified provider features are live.
- [ ] Provide accept/refuse choices and a persistent way to withdraw. Unknown,
  refused, expired, unreadable, or obsolete-policy state means no optional
  collection. Do not create `analytics_session_id`, gather optional fields, or
  schedule/send events before acceptance. Store only the minimal necessary
  preference before optional collection, and disclose that preference storage.
- [ ] Replace unconditional tracking with an explicit consent state machine.
  Cover initial navigation, delayed route timers, page refresh, cross-tab
  changes, login/logout, and storage denial. Withdrawal cancels queued work,
  removes legacy/current optional identifiers, and prevents recreation. Login
  is not consent; logout must not accidentally accept or join another person's
  browsing history. Old cached clients must fail closed at the server.
- [ ] Add a server-owned versioned choice receipt, issued only by an explicit
  same-origin, CSRF-protected choice action. Bind it to a browser choice with
  secure cookie handling and minimal identifiers; validate current policy,
  expiry/revocation, and server collection enablement before any enrichment,
  storage, or provider call. A client `consent: true` field alone is insufficient.
  Reuse existing CSRF plumbing; audit the present track exemption in
  [csrf.ts](../../backend/src/middleware/csrf.ts) and cover both router mounts.
- [ ] Apply validation at the common collection boundary, including any direct
  service callers. Define consent-revision ordering for in-flight requests:
  recheck before enrichment/persistence, reject stale queued events, and
  document that an already completed transfer cannot be recalled by UI
  cancellation. A failed preference write must not enable collection.
- [ ] Minimize collection to approved fields. Prefer route templates without
  query strings/fragments, coarse geography only when approved, and no account
  linkage, raw IP storage, screen dimensions, full referrer, or UTM values unless
  each has an approved purpose. Prevent secrets/private identifiers in URL/title
  fields. The retention schedule follows what is actually kept.
- [ ] Keep optional analytics and necessary security processing separate.
  Administrative GeoIP lookup needs its own documented purpose and permissions.
  Review the HTTP GeoIP transfer explicitly: disable optional enrichment until
  approved transport/provider terms are configured; never guess that switching
  the current endpoint to HTTPS is supported. Keep provider outage nonfatal to
  the website and avoid fallback transfers to an unapproved service.
- [ ] Test fresh visitor/refusal/acceptance/withdrawal/reacceptance, initial and
  delayed routes, cross-tab/login/logout, stale policy, disabled storage,
  stale/forged receipt, direct API/alternate-mount bypass, CSRF, provider/DB
  failure, and in-flight withdrawal. With synthetic browser fixtures assert
  both network silence and absence of optional storage before choice. Verify
  notice/preferences by keyboard and at phone/tablet/desktop widths.

Exit: published notice matches approved processing; rejected/no choice causes
no optional storage or provider transfer on either frontend or backend path.

## P6 — Retention enforcement and restore handling (#11)

- [ ] Convert P0's approved registry into explicit allowlisted per-class
  handlers. No generic `DELETE` over every table with `created_at`, no dynamic
  ownership inference, and no MUD ledger/game evidence/protected archive purge.
  Include new session/consent/request/export/audit-journal data in the registry.
- [ ] Implement a backend CLI with dry-run as the initial/default operational
  mode, explicit target/policy version, bounded batch size/time budget, and a
  stable UTC cutoff captured once per run. A scheduled invocation uses the same
  engine. Add indexes through new migrations for each real selection predicate;
  verify query plans on synthetic scale fixtures.
- [ ] Use keyset continuation, short transactions, restartable checkpoints,
  deterministic ordering, and an expiring ownership lock to prevent duplicate
  workers. Recheck eligibility and holds in the mutation transaction, including
  holds acquired after dry-run. Delete dependent rows in FK-safe order or apply
  the approved unlink/anonymization operation; do not disable FK checks.
- [ ] Support explicit holds, reasons, approver, review/expiry, and restricted
  access. Undelivered hook/donation events and unfinished subject requests are
  ineligible until their approved lifecycle allows removal. Never erase the
  evidence needed to finish or retry an operation.
- [ ] Include caches, R2 objects, generated exports, log rotation, and provider
  tasks. Persist external deletion work before unlinking the last durable
  reference; retry failures and verify provider responses. Existing orphan
  cleanup must retain failed object work instead of reporting it erased.
- [ ] Keep run evidence aggregate: policy version, class, cutoff, counts,
  duration, outcome categories, and operation ID. No row content, account/IP
  list, object URL, or raw SQL/provider error in ordinary logs. Bound retention
  of the lifecycle system's own records.
- [ ] Integrate backup policy with existing count-based controls: document
  maximum age, holds, protected copies, access and expiry, and test a restored
  copy reapplying erasure/retention records before exposure. Do not rewrite MUD
  backups through the unsafe website restore path. A retention operation has
  no automatic data-restoration rollback; pause and diagnose failures, and use
  separately authorized protected recovery when needed.
- [ ] Test before/exactly-at/after cutoff, UTC/offset cases, multiple batches,
  dry-run zero writes, restart/overlap, concurrent hold, FK ordering, external
  deletion failure, stale cache, held/pending events, and attempted cross-owner
  targets. Prove protected import classes remain excluded before and after
  their review date. Use two accounts to detect collateral deletion.
- [ ] Update the notice and operator runbook with actual periods, scheduler
  cadence, dry-run review, lock recovery, monitoring, and restore procedures.
  Start with an approved scoped dry run before enabling scheduled mutation.

Exit: approved classes expire/anonymize predictably with bounded work, holds
and ownership boundaries survive adversarial fixtures, and recovery does not
silently resurrect erased data.

## P7 — Verified export and erasure/anonymization (#12)

- [ ] Implement a website-owned request lifecycle with opaque request IDs,
  subject identity, type, policy version, verified-at evidence, authorized
  operator where required, per-store progress, retry state, and final outcome.
  Use distinct names from MUD-owned `account_erasure_*` tables. States distinguish
  requested, verified, running, awaiting external owner, partial failure,
  completed with declared exceptions, and rejected/cancelled.
- [ ] Require authenticated ownership and recent verification using the existing
  account authentication authority; a long-lived cookie alone is insufficient
  for destructive action or an export. Provide the approved private assisted
  path for a person unable to log in. Never accept account identity from an
  arbitrary body parameter or authorize by matching an email/IP. Rate-limit,
  enforce CSRF, audit safely, and test case/collation variations of account names.
- [ ] Build explicit per-store export selectors/serializers from P0. Export only
  this subject's authorized data, with a schema version, generation time,
  categories, omissions/retention reasons, and ownership boundaries. Include
  relevant MUD-owned records through an approved read-only/owner-provided path;
  unresolved external categories prevent a claim of complete account export.
- [ ] Exclude passwords/hashes, tokens/digests, push auth keys, signing secrets,
  private staff evidence, and other accounts' personal data. Select/review mixed
  notification, mention, moderation, vote, quote, and Gemini multi-account JSON
  records deliberately; do not dump entire joined rows or infer anonymous
  analytics identity by IP. Define the private review path for sensitive records.
- [ ] Generate bounded streamed/paginated output with consistent snapshot or
  documented cutoff semantics. Deliver through a subject-authorized expiring
  download with `Cache-Control: no-store`, no public R2 URL, no payload logging,
  and no service-worker/CDN cache. Bind download/retry to the verified subject;
  expire and delete temporary output, including partial files after crashes.
- [ ] For erasure, establish a website request fence before mutation so new
  login/profile sync/notifications/uploads cannot recreate data mid-request.
  Revoke all sessions and terminate affected active terminal/WebSocket sessions,
  remove subscriptions, and clear relevant caches. Durable suppression and
  account-name reuse must follow the MUD owner's identity policy; do not claim
  full erasure while flatfile authentication can immediately recreate the user.
- [ ] Apply per-category deletion/anonymization under the approved policy.
  Retained forum/PvP/community material needs stable unattributed display and
  intact relationships/counts; strip unnecessary author/IP/profile links and
  handle quoted/embedded personal data. Financial, moderation, and audit
  exceptions must be narrow, access-restricted, disclosed, and time-bounded.
  An opaque pseudonym is still personal data when a mapping remains.
- [ ] Use durable per-store tasks for R2/CDN/provider deletion and MUD handoff.
  Confirm the external MUD erasure protocol/authority and its receipt/status
  rather than writing those tables or calling player wipe/legacy restore.
  Manual owner confirmation is an explicit pending step until verified. Do not
  mark media/provider work done after an exception or an unverified request.
- [ ] Make duplicate requests/idempotent retries safe across SQL commit,
  external calls, process termination, and ambiguous responses. Keep enough
  protected progress/tombstone information to prevent recreation and reapply
  erasure after restore; give that information its own retention/access rules.
- [ ] Finish with independent per-store verification queries, session/access
  denial checks, object/provider outcomes, cache checks, and an exception ledger.
  A zero-row primary delete is not proof of completion. Notify the requester
  through the approved in-product/private process only once the actual outcome
  can be explained, including retained and external-owner categories.
- [ ] Test unauthenticated/cross-account/operator access, stale verification,
  download expiry/replay, credential exclusion, mixed-subject rows, duplicate
  requests, concurrent writes/holds, partial SQL/provider failure, restart,
  referential integrity, active-session teardown, non-recreation, and restore
  replay with two synthetic subjects. Verify public retained content remains
  usable without exposing the erased subject's identity.
- [ ] Add request/status UI and public instructions under the design contract.
  Document user verification, staff handling, provider/MUD handoff, exceptions,
  timeframes approved by the owner, and final verification evidence.

Exit: a verified subject can obtain the defined protected export and complete
website erasure/anonymization, with external ownership and retention exceptions
accurately represented. Do not close #12 on a website-only success if required
MUD/provider steps are still pending.

## P8 — Integrated verification and release closure

### Required checks during implementation

Run commands from the repository root. Use the narrowest relevant new/existing
tests per stage, followed by the affected package's format/lint/type checks.
P2/P3/P4/P6/P7 require database/ownership verification. Cross-package changes
require both packages. At integrated acceptance, run the full matrix below
against isolated, synthetic, explicitly selected dependencies:

```bash
./scripts/check-config-literals.sh
pnpm --dir backend config:check
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend verify:mud-writes
pnpm --dir backend test --runInBand
pnpm --dir backend build
pnpm --dir frontend config:check
pnpm --dir frontend format:check
pnpm --dir frontend lint
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
git diff --check
```

The MUD manifest path and supported test schema must be supplied deliberately;
a minimal web-only fixture is insufficient for the backend suite. Database
qualification must include the new bootstrap/upgrade/rollback harness, session
timezone matrix, outbox crash injection, consent race/bypass tests, retention
cutoff/hold/ownership tests, and export/erasure partial-failure tests. Add exact
new command names here when implemented; these are not existing scripts yet.
Use mocked providers and browser fixtures, never real visitor evidence.

Record every command and its actual outcome/skips in the implementation
handoff. Unit tests alone do not prove database schema, browser choice behavior,
external deletion, or deployment. Hosted CI status does not replace local
runtime/database evidence. Do not rerun unrelated suites after a docs-only
change merely to imply implementation coverage.

### Future authorized rollout

- [ ] Approve policy/periods, supported schema adoption, global logout, and the
  exact release SHA. Rehearse new migrations and recovery against approved
  isolated targets before any shared-environment operation.
- [ ] Follow [deployment](../deployment.md): protected recovery evidence,
  detached build artifacts, preflight, controlled website cutover, session
  invalidation, and verified backend/frontend identity. Keep Cloudflare tunnel
  ingress intact. MUD operations remain separately owned/authorized.
- [ ] Start optional analytics disabled until approved notice/choice behavior
  is verified. Start retention in dry-run and subject-request workers with
  reviewed synthetic/operator acceptance. Monitor safe aggregate failures,
  pending audit events, overdue work, and partial provider/MUD outcomes.
- [ ] On failure, stop the affected collection/destructive worker and preserve
  its journal. Authentication rollback keeps old sessions invalid; retention
  rollback never automatically restores personal data; baseline rollback never
  weakens or deletes MUD schema.
- [ ] Prepare user-facing release notes during implementation, including the
  forced sign-in and where privacy choices/requests live. After live acceptance,
  use [news-update](../../.agents/skills/news-update/SKILL.md), reconcile existing
  entries, publish via `/admin/changelog` or `/api/changelog`, and verify both
  saved content and public `/news?tab=changelog` rendering. Use Website Changelog,
  not MUD News. A draft does not satisfy publication.
- [ ] Update security findings, configuration, incident response, onboarding,
  deployment, privacy notice, and lifecycle runbook to match verified behavior.
  Link per-issue commits/tests/release evidence and close each issue only when
  its own completion criteria are met. No compliance or complete-erasure claim
  may exceed the verified scope.

### Acceptance traceability

- #7: P3 digest-only persistence, binding/failure tests, logout and rollback.
- #8: P3 inspected legacy shapes, epoch contract, real timezone/DST HTTP tests.
- #9: P4 durable event identity, toggle priority, crash/retry/concurrency proof.
- #10: P0/P5 approved notice, frontend/server choice, withdrawal/provider proof.
- #11: P0/P6 periods/holds, bounded enforcement, protected archives and restore.
- #12: P0/P7 verified identity/export, per-store erasure and external completion.
- #13: P1 safe logging of every GeoIP failure path and unchanged lookup behavior.
- #14: P2 versioned bootstrap, existing-ledger upgrade, schema/MUD proof/recovery.

## Planning-publication verification

This task's checks are documentation-only: inspect the current issues and
source contracts, validate this plan's relative links and issue/stage coverage,
check whitespace and the one-file diff, then verify the committed remote blob,
exact branch head, ahead/behind `0 0`, clean worktree, and issue links after push.
No application, database, browser, migration, provider, build, or production
acceptance test is claimed by this plan. The runtime checks above are future
implementation work and were not run for this documentation-only publication.

No Website Changelog entry is needed for this commit: it changes only the
implementation plan and makes no reader-visible website change.

## PR review repair — 2026-10-17 current objective

The user now requests all outstanding code-review findings to be addressed,
starting with the oldest open PR. This supersedes the earlier implementation
timebox and next-phase directions. Preserve the published branches, repair each
affected PR, and carry its changes forward through the dependent stack with
ordinary merges. No merge to master, deployment, production data change or new
feature is part of this review task.

The complete GraphQL scan covered all 27 open PRs, all review-thread pages,
review bodies and discussion comments. The initial queue has 24 unresolved
findings across 11 PRs. PR #39's five old findings are resolved and its latest
review reports no findings; #41–#45 have no outstanding review findings.
Other PRs without findings still need inherited fixes carried forward.

| PR | Initial findings | Review status |
| --- | --- | --- |
| #46 | 1: enable notifications after a first permission grant with blocked storage | Fixed; 7 focused and 253 full frontend tests pass |
| #48 | 3: stale GET cookie clearing, actionable safe diagnostics, native fixture port binding | Pending |
| #49 | 3: pending refusal, temporary visibility changes, compact confirmation/focus | Pending |
| #50 | 2: safe forum failure context, shared pool starvation during R2 deletion | Pending |
| #54 | 1: DST-ambiguous retention cutoff comparisons | Pending |
| #55 | 1: unavailable restore controls still offered by the UI | Pending |
| #62 | 3: account-bound backup cache, cancellation file identity, failed-upload bulk cleanup | Pending |
| #63 | 2: incident/maintenance preservation prerequisites, all legacy upload suffixes | Pending |
| #64 | 3: quiet CLI, same-device mount boundaries, supported database filenames | Pending |
| #65 | 3: protected-root mount aliases, suffix length, named bundle/payload revalidation | Pending |
| #66 | 2: separate MUD database credentials, abort-signal compatibility | Pending |

**#46 outcome:** one explicit granted notification-permission request enables
the current-page preference even when storage reads/writes are unavailable.
Files: the existing notification composable and its tests. Proof: a failing
regression reproduces the disabled state after a successful grant; then verify
actual notification construction, refusal/default behavior and frontend gates.
Ablation keeps the existing permission/preference flow and adds no persistence
adapter or retry mechanism. A future verified release may announce that enabling
notifications works on the first attempt with blocked browser storage; existing
release authorization and news-update rules still apply.

**#46 proof:** the new first-grant regression failed before the fix.
`pnpm --dir frontend test:unit --run
src/composables/__tests__/useNotifications.spec.ts
src/composables/__tests__/useChangelog.spec.ts` ran the matching notification
file: seven pass (no file matched the second path). The full frontend run then
passed 253 tests / 52 files. `python3 /tmp/durisweb-image-quality.py frontend`
passes format, lint, types, configuration, palette, full unit tests and build.
`git diff --check` passes. No backend/database/provider or new rendered-layout
check is needed or claimed for this composable-only behavior correction.
Evidence: `pr46-{red,focused,quality}.log` in the private review directory.

Private review evidence: `/tmp/durisweb-review-20261017/`; the current worktree
is `/tmp/durisweb-security-privacy-plan-20261016` and switches to each existing
PR branch in sequence. Preserve unrelated review worktrees and recovery stashes.

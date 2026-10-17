# Website security, privacy, and schema implementation plan

## Current handoff — read this first

**#63 route precedence follow-up:** maintenance admission now inventories and
reconciles every overlapping zone Worker route and no-script exclusion, preserving
the previous map for rollback and verifying saved assignments plus overlap paths.
This closes a bypass not established by representative hostname probes alone.
Official Cloudflare route documentation was checked; docs/config/whitespace checks
pass. No deployed Worker or production route was changed.

### Historical checkpoints

**#62 final cancellation race repair:** the worker pins the inspected inode,
atomically captures the shared filename into an exclusive private removal
directory, compares captured identity, and unlinks only the captured name.
Replacement before capture is retained; replacement after capture stays at its
original name and refuses success. Retained custody directories block inspection
and absence-based retry after interruption. No SQL schema or provider changes.
The private operation namespace remains trusted to the website service identity;
this does not claim isolation against arbitrary same-UID hostile filesystem writes.

Focused command `pnpm --dir backend test --runInBand archiveUnlinkProcess
managedArchiveTarget` passes eight tests, including both replacement schedules
and interrupted-custody refusal. Backend format/lint/type/MUD-write/schema/build
pass via `python3 /tmp/durisweb-image-quality.py backend`. Native upload/removal
qualification passes 63 tests/six suites on each engine with `/tmp/durisweb-run-archive-suite.mts
<23436|23437> upload-archive` under the existing Node/tsx command. Both post-test dependency preflights pass;
owner metadata remains unchanged and owned fixtures are cleaned. Logs: `pr62-custody-{tests,quality,mysql,maria}.log`.
Release-note draft: “Backup cancellation preserves unexpected replacement files
for review.” Publish only after a separately authorized verified release.

### Historical checkpoints

**Latest continuation — PR #62 generated inspection:** a valid 65 MiB


**#64 final inventory repairs:** time exhaustion before the second selected root
now retains the first observation and records an explicit unstarted timed-out
root. Output validates scanned root identities/mount IDs before writing and
acknowledgement. A renamed/replaced root cannot become an evidence destination.
`pnpm --dir backend test --runInBand legacyBackupInventory`: 36 tests/two suites
pass, including actual CLI coverage and both new regressions. Backend format,
lint, type-check, MUD-write, schema and build gates pass via
`python3 /tmp/durisweb-image-quality.py backend`. Logs:
`pr64-final-{tests,quality}.log` in the private review directory. No SQL,
frontend or production change. Carries #63 keeper ordering `a3cf203`.

### Historical checkpoints


**#63 final ordering repair:** establish and verify the independent private-directory
keeper before Worker deployment or any ingress checks. The deployment checklist
and maintenance guide now use the same sequence: keeper, all-host ingress fence,
writer closure, inventory/preservation, then authorized service operations.
Documentation checks: `git diff --check` and `./scripts/check-config-literals.sh`
pass. Existing isolated systemd keeper rehearsal remains valid; no application
source, production service or Cloudflare account was changed.

### Historical checkpoints

**Latest continuation — #63 remaining ingress/restart paths:** #64's six
findings are published/resolved as `5fa2ee8` / `d0fe178`, carried through #65
`106783b` and #66 `3c10f0e`. The shared mapping integration passes 57 tests/four
suites, backend gates/build and native preservation mount checks.

Current branch is `branch/legacy-upload-preservation-gate`. The two P1 docs
findings now require an explicit Worker Route and maintenance acceptance for
every configured public website/API hostname, including aliases and separate
API/web-socket hosts. Canonical redirects are explicitly insufficient. The
example routes include canonical and alias hosts; the guide requires the
actual complete deployed hostname inventory and cookie-free, empty refusal
probes before inventory. It does not activate Cloudflare configuration.

The incident runbook now gates all direct/dependency website restarts, including
flatfile and credential recovery. Discord environment changes and the standalone
data-hold migration procedure also link preservation before stopping writers.
A repository-wide search distinguished operational restart instructions from
descriptions of automatic restart and development-only process lifecycle.
The existing writer fence and independent temporary-directory protection remain.

Validation passed: inspected `canonicalHost.ts` and the Worker route behavior, parsed the
example TOML, checked changed relative links/anchors and configuration literals,
and ran `node --test deploy/maintenance/worker.test.mjs` (**10 passed**). The added case exercises
routed canonical, alias and separate API URLs with synthetic session cookies,
requiring refused POST/upgrades and zero origin calls. It does not prove real
Cloudflare Routes are installed; the runbook requires per-host live acceptance
during a separately authorized window. No application package or production
operation is changed or claimed.

Published as `c87c7ad`; `PRRT_kwDOVA2-8c6thjFP` and
`PRRT_kwDOVA2-8c6thyo3` have verified replies/resolved state. The ledger now has
**55 verified closeouts**, with **six known remaining findings** before a new
scan: #62's conditional removal, #65's payload fence, and #66's four export
findings. Carry through #64–#66 and continue #65 while #62's unresolved
inode-conditional removal guarantee stays explicit. No visitor news is needed.

### Earlier published repairs and inventory

**Inventory integration into #65:** the parent carry preserves the exported
`legacyMountId` used by preservation and shares `legacyDirectoryAliases` through
its existing error translation, removing the duplicate mountinfo mapper.
Combined inventory/preservation tests pass **57 / four suites**, backend gates/
build pass, and the native preservation fixture passes six aliases, independent
control, bundle admission and final mount checks. Evidence:
`pr65-inventory-carry-{tests,quality,mounts}.log`. No payload-acknowledgement fence
fix is claimed. Continue the carry into #66, then return to #63's two P1 docs gaps.
**Latest continuation — PR #64 inventory fixes published:**
current branch is `branch/legacy-backup-copy-inventory`, starting at `16e54bd`.
#63's keeper correction is published/resolved as `a2947cc` / `1ce3854` and
carried through #64 `16e54bd`, #65 `2dce32f` and #66 `c970e73`.

All six current #64 findings have focused repairs/proof: private-output mount
aliases are rejected using the same mountinfo mapping as the preservation tool;
source/configured symlink and proc-root aliases are refused; owner read/write
bits are set explicitly despite a restrictive umask; the cooperative deadline
covers root/staging metadata calls with descriptor cleanup; and acknowledgement
retains the output fd through directory sync, verifies its requested name/
metadata, and reads back the bounded JSON. Every opened output descriptor is
closed even if another close fails. No source bytes are read or modified.

The review's exact 1,000-copy/no-extra-entry case already passed in current
source. A related real boundary bug was reproduced and fixed: ordinary trailing
entries were incorrectly treated as a 1,001st copy. Tests cover 999/1,000/1,001
copies and that mixed-entry case. Five initial unit/CLI cases and the native
output-alias case failed before repair; five additional evidence-acknowledgement
cases reproduced false success, including mutation before the first metadata
checkpoint. **34 tests / two suites now pass**, with backend format/lint/types/
MUD-write/schema/build gates. A descriptor-capture typing error was corrected
before the final green run.

The native private-mount fixture passes five same-device traversal boundaries,
four output aliases (both roots and descendants) and independent output control.
It unmounts and removes only its own temporary fixture. Final logs:
`pr64-all-{final,quality-final,mounts-final}.log`. Earlier red evidence:
`pr64-boundaries-red.log`, `pr64-mounts-red.log`, `pr64-ack-red.log`.
Commands: `pnpm --dir backend test --runInBand
src/services/__tests__/legacyBackupInventory.test.ts
src/scripts/__tests__/legacyBackupInventory.test.ts`;
`python3 /tmp/durisweb-image-quality.py backend`; and the committed
`legacyBackupInventoryMounts.native.ts` through Node/tsx inside
`unshare --mount --propagation private`. No frontend, SQL/provider or production
rerun is claimed for this filesystem/CLI chunk.

Fresh scan before publication: **14 unresolved threads / 47 verified closeouts**.
It added the current #64 acknowledgement finding plus two new #63 P1 findings:
[all public hostnames](https://github.com/LuminariMUD/DurisWeb/pull/63#discussion_r4303270514)
(`PRRT_kwDOVA2-8c6thjFP`) and
[remaining direct restart paths](https://github.com/LuminariMUD/DurisWeb/pull/63#discussion_r4303374602)
(`PRRT_kwDOVA2-8c6thyo3`). #64 is now published as `5fa2ee8` and all six
threads have verified replies/resolved state. The ledger contains **53 verified
closeouts**, with **8 known remaining threads** before another scan: #62 (1),
#63 (2), #65 (1), #66 (4). Carry #65/#66, then return to those documentation gaps. #62's inode-conditional removal guarantee,
#65's payload fence through acknowledgement and #66's four export findings
remain open. Reuse `legacyDirectoryAliases` from the inventory module when
updating the preservation caller instead of retaining two mapping implementations.
No visitor release news is needed for these operator-tool corrections.

### Earlier published repairs and inventory

**Published PR #63 restart protection:** #62 inspection fix
`fecc543` and closure `d6b1337` are published and carried through #63 `a48a576`,
#64 `3574006`, #65 `1f5946a` and #66 `8771bd0`. The remaining #62 unlink race
stays unresolved; a private renamed path is not by itself an atomic inode-
conditional deletion against arbitrary same-UID namespace mutation. Do not
claim it fixed by shrinking the check/unlink interval.

Current branch is `branch/legacy-upload-preservation-gate`. Its P1 restart
finding is addressed by requiring independently retained systemd private
temporary directories before inventory. The guide specifies a separate active
keeper using `PrivateTmp`/`JoinsNamespaceOf`, exact original identity and directory
checks, no stop coupling, target-version rehearsal, continued writer fencing and
persistent protected copies before keeper release. A watchdog pause alone is
explicitly insufficient. No service template or production restart policy changes.

Actual disposable local systemd 255 rehearsals passed for **user and system
managers**, each with negative no-keeper and positive keeper cases. Source
SIGKILL/automatic restart removes the original temporary file without a keeper;
with a keeper, the original inode/bytes survive both crash/restart and an explicit
source stop, and are cleaned only after keeper stop. Fixture copies were verified
before cleanup; all owned transient units were stopped. An initial fixture PID
polling typo was corrected before the successful runs. Logs:
`pr63-private-tmp-{user,system}.log`; runner
`/tmp/durisweb-private-tmp-rehearsal.py`. These are WSL-only fixture operations,
not production or MUD service work. The runbook requires target-host rehearsal
rather than treating local systemd behavior as universal acceptance.

Published as `a2947cc`. Thread `PRRT_kwDOVA2-8c6thGOP` has a verified reply
and resolved state. The ledger contains **47 verified closeouts**; **11 known
threads remain** before a new scan: #62 (1), #64 (5), #65 (1), #66 (4).
Carry #64–#66, then address #64's inventory findings. No package/runtime change
or visitor changelog entry is needed. Preserve #62's still-open removal
guarantee while fixing these independent findings.

### Earlier published repairs and inventory

**Published PR #62 generated inspection:** a valid 65 MiB
mysqldump archive is refused by the old shared upload limit and accepted by the
repaired generated path. The first standalone probe used a disallowed filename;
it was discarded as evidence and rerun with an accepted filename against the
original inspector and repaired source. The corrected red/green results are
`pr62-large-{red,green-final}.log`.

Generated inspection now streams past unrelated mysqldump data lines and keeps
only the existing summary tables. It retains the validated inherited descriptor,
selected-summary memory/result caps and child isolation. Only generated archives
receive the 120/121-second child/parent budgets; uploads retain the 64 MiB total
SQL and 15/16-second limits. No parser framework, temporary SQL file or new service
was added. Actual `listBackupContents` returns the expected summary for the large
generated archive on both engines, while uploading the same bytes remains retained
and unconfirmed. Seven streaming tests cover chunk boundaries, UTF-8/escaping,
a huge unrelated INSERT, selected-SQL bounds and incomplete definitions.

Two-engine runs pass **136 tests / eight suites** each, including the native
large-file case, existing upload/archive cases and backup parser regressions.
An INSERT-recognition regex was falsely classified as a MUD write by the lexical
scanner; it was replaced by explicit literal-prefix/next-character comparison,
keeping the complete table prefix visible and leaving the verifier/allowlist
unchanged. Final seven streaming tests, actual child large-file probe and backend
format/lint/types/MUD-write/schema/build gates pass after that adjustment.
The two-engine runs precede that equivalent recognition adjustment; no extra
full native rerun is claimed. Logs: `pr62-large-{mysql,maria,unit-final,
quality-final,green-final}.log`. Frontend is unchanged from the access repair's
324-test/gates/build proof; no fresh browser, provider or production run.

The access chunk is published as `8fbfb01` with closure record `c123f78`, and
carried through #63 `32191a7`, #64 `42f3b22`, #65 `8316719` and #66 `dce5986`.
All three access/duplicate threads are verified resolved. Current branch is #62.
The inspection repair is published as `fecc543` and thread
`PRRT_kwDOVA2-8c6tgzDk` has a verified reply/resolution. The ledger now contains
**46 verified closeouts**, with **12 known unresolved threads** before a fresh
scan: #62 (1), #63 (1), #64 (5), #65 (1), #66 (4). Carry this parent through
#63–#66 next. #62's remaining finding is the cancellation validate/unlink race;
a second stat, synchronous unlink or a file-content lease alone does not make
pathname deletion conditional on the validated inode.

Draft release note addition: “Generated backups remain inspectable when unrelated
database tables make the SQL dump exceed the upload inspection limit.”

### Earlier access repair and full inventory

**Published access repair — PR #62, 2026-10-17:** currently working
on `branch/backup-upload-records` in the same plan worktree. Its published starting
head is `3b81636`; #66 now includes the earlier parent carry and full handoff as
`eebbcf3`, with no pending merge. This checkpoint supersedes the inventory's
older checkout/publication instructions below.

The foreign-upload reference leak and same-account role downgrade cache reuse
are repaired and qualified. Numeric backup reads now give the same plain 404 for
missing and foreign uploads; ownership errors no longer carry the stored UUID,
and ordinary logs do not expose it. Vue Query keys include the role as well as
account, so a downgrade discards the displayed privileged result and cancels its
in-flight request. The duplicate contents-identity report is already addressed
by `268b455`: recorded identity reaches the inspector, which reads the validated
inherited descriptor.

Three actual-route response regressions failed before repair; all **25** route
tests now pass. Both new mounted Vue Query downgrade regressions pass, including
a late privileged response; focused backup tests total **22**. Full frontend
passes **324 tests / 58 files**, and both package gates/builds pass. Actual SQL/
filesystem upload/archive suites pass **60 tests / six suites on each engine**,
including foreign-owner non-disclosure and descriptor replacement. The first
frontend red run also exposed a queued one-shot test mock leaking after an
expected failure; reset that mock per case before final green verification.
Logs: `pr62-role-{red,green}.log`, `pr62-access-{red,green,mysql,maria,
backend-quality,frontend-quality}.log` under the private evidence directory.
No full backend, fresh browser/provider or production run is claimed.

**Published and verified:** `8fbfb01` contains this access-only repair. The three
threads `PRRT_kwDOVA2-8c6tgzDj` (duplicate), `PRRT_kwDOVA2-8c6tgzDl`
(404 privacy) and `PRRT_kwDOVA2-8c6thD7n` (role cache) have verified GitHub replies
and resolved state. The closeout ledger now has **45** records; **13 known
threads remain**: #62 (2), #63 (1), #64 (5), #65 (1), #66 (4), before a new scan.
Next: carry this published parent repair through #63–#66, then return to #62's
large generated-backup inspection and validate/unlink race. These two remaining
safety/functionality gaps are not fixed by this access-only chunk.
Draft release note, to publish only after verified release: “Backup lists refresh
when staff permissions change, and inaccessible uploads no longer expose their
private reference.”

### Full inventory snapshot before this follow-up

**Verified 2026-10-17 at 15:18 UTC. The latest continuation above takes precedence;
the older execution journals are historical evidence, not instructions to repeat work.**

**3 project PRs are merged, 27 are open, and 16 review threads remain unresolved
on #62–#66.** The review repair ledger contains **42 distinct published and
resolved findings**; #39 has five additional older resolved threads. Newly
reported findings remain open even where a preceding test run passed. All 27
open PRs were non-draft and had four successful hosted checks on their remote
heads at this snapshot. This does not mean the project is finished, approved,
merged or deployed.

The complete project **cannot responsibly be promised within one hour**:
full erasure, complete export/request tracking, general retention, approved
policy and live release acceptance remain unfinished. The hour below prioritizes
the existing defects and ends with verified, reviewable publication and an exact
remainder. It does not redefine partial functionality as completion.

**Ablation scope:** outcome = an accurate, usable continuation plan covering
finished work, unfinished work, every project branch/PR and immediate priorities.
Files = this document only. Proof = fetched Git refs, complete GitHub review-thread
pages, issue state, publication ledger and retained/fresh checks. New feature
implementation, release operations and additional reports are outside this
documentation change. Repeated contradictory handoffs were consolidated here;
the prior text remains in Git at `917ac5599e7bda3c87715782d7130ee1235b58e9`.

### Where the work actually is

- Continue in `/tmp/durisweb-security-privacy-plan-20261016` on
  `branch/account-data-export`, attached to [PR #66](https://github.com/LuminariMUD/DurisWeb/pull/66).
  The authoritative plan is this file in that worktree. Windows path:
  `\\wsl.localhost\Ubuntu\tmp\durisweb-security-privacy-plan-20261016\docs\ongoing-projects\plan.md`.
- Before this documentation commit, local HEAD is `917ac5599e7bda3c87715782d7130ee1235b58e9`;
  fetched remote #66 is `8cf161f448aef15d2b13da923094a58a527fbbe5`. Local is **18 commits
  ahead, zero behind**, with no uncommitted runtime changes or merge in progress.
  `917ac55` is the ordinary merge of #65's latest head. Only the plan needed merge
  conflict resolution; source merged automatically. Publishing this document
  also carries those already-published parent repairs into #66. No #66 defect
  listed below has been repaired by this documentation change.
- Original checkout `/home/aiwithapex/projects/durisweb` is clean on `master` =
  `origin/master` = `89468603a61ab44d9e3be1651c9dd6fce5a17a12`.
  The originally requested `branch/issues-7-14-security-privacy-baseline` is
  the already-merged #36 branch; its plan is not the latest cumulative handoff.
- All project branches through #65 match their fetched upstream except the
  preserved older local #37/#38 review copies, which lag by 3 and 6 commits.
  #66's pending carry is the only ahead branch with an upstream.
- Preserve older recovery stashes `1c8d1dd304401fe58de11758a2dd7330b699a770` and
  `bbda2896e1c515687d542f6d6e215de7ee364d63`. The task-owned #65 stash
  `c468c969d46fac566c466734972f86ac483c3afe` was restored, published, and removed.
  Do not reapply it.
- `branch/legacy-owner-fence` is a local-only abandoned investigation at
  `2774928e8638`, with no upstream or PR and no distinct shipped guard.
  Do not resume it by default.
- No local or remote tags exist at this snapshot. No release tag is warranted
  by a documentation update. No master merge, deployment, shared migration,
  production logout/deletion or separate MUD operation is part of this handoff.

### What is implemented and what remains

“Implemented” means source plus the recorded isolated verification; the remaining
review findings below qualify those results. Issues #7, #8, #9, #10, #11, #12 and
#14 are still open; #13 is closed.

| Issue / phase | Implemented and verified | Still unfinished |
| --- | --- | --- |
| #13 / P1 — safe diagnostics | GeoIP/cache errors use bounded categories and references, with identifying-value regression tests. PR #36 is merged and #13 is closed. | No further source work identified for this issue; no new live verification is claimed. |
| #14 / P2 — reproducible schema | Versioned 77-table website baseline, immutable inputs, guarded installer/adoption/ledger transition, full owner-schema qualification, upgrade/recovery and two-engine tests. #37/#38 merged; #39 open. #58/#60 add authoritative metadata checks. | Review/merge remaining source; use the exact supported procedure and metadata v2 during any separately authorized installation. No production migration acceptance exists. |
| #7 + #8 / P3 — refresh credentials and expiry | SHA-256 refresh digests, session/account binding, UTC epoch expiry, expand/cutover/contract migrations, empty-session rollback, preflight, access/refresh/DST/offset and revocation tests. #41 open; #43/#44 are related follow-ups. | Review/merge, explicit one-time logout decision, deployed-schema inspection and authorized cutover/live auth proof. Existing sessions have not been invalidated by this task. |
| #9 / P4 — safety-toggle attribution | Atomic setting/journal write, idempotent bounded audit recovery, protected journal namespace, safe diagnostics and outage/crash/retry/concurrency tests. #42 open. | Review/merge and future release verification. Approved retention and subject-request treatment of delivered journal/audit records remain part of P6/P7. |
| #10 / P0/P5 — notice and optional analytics | Public draft `/privacy` page and contact, browser choice state machine, server-owned receipts, same-origin/CSRF checks, withdrawal/race/storage-denial handling, minimized optional events and synthetic browser proof. #45–#49 open. | Approved final notice, purposes/providers/transfers/periods and release acceptance. `approved`, `collectionEnabled` and `retentionReady` remain false in `backend/src/config/privacyPolicy.ts`; optional collection is unavailable. The proposed 180-day preference period is not approved. |
| #11 / P6 — retention | Inventory; bounded preview; private hold records; hold-aware continuation; source-disabled executor for **`analytics_events` and `login_history` only**; durable progress and cache cleanup; managed archive hold/removal/upload recovery; legacy discovery and individual preservation tools. #50–#65 open. | Approved periods/rules; remaining per-class handlers and feature cleanup; own-ledger periods; subject-request coordination; provider/media/cache/log copies; whole legacy-copy ownership/adoption and pre-teardown preservation; independently protected removal evidence and restore replay; operational acceptance. General retention is not enabled. |
| #12 / P7 — account export and erasure | Fresh current-password/session verification; bounded consistent download of eleven selected website categories; subject/collation isolation; explicit omitted categories; private JSON response and working privacy-page download control. | Complete durable request lifecycle, approved assisted verification, remaining/mixed/external export categories, erasure/anonymization and non-recreation, request/status UI, MUD/provider completion and complete-request verification. This partial download does not close #12. |
| P8 — integration and release | Per-chunk tests/builds and draft release wording are retained. | Final complete-feature integration, reviewed release identity, required owner decisions, authorized rollout and live Website Changelog verification. Source checks do not close these gates. |


Max (Moshe) is the user-supplied policy/operational/MUD
contact; [the lifecycle inventory](../privacy-data-lifecycle.md) records his email.
Naming a contact did not approve destruction periods, final controller wording,
provider commitments, assisted identity verification or the one-time logout.
Do independent engineering without asking again for the contact. The source
still has `approved: false`, `collectionEnabled: false` and `retentionReady: false`
in `backend/src/config/privacyPolicy.ts`. Do not silently turn these on to meet
a deadline. Phase-wide unchecked boxes below describe unfinished acceptance,
not an instruction to reimplement already-qualified components.

### Published repair checkpoints and retained proof

The 42 review closeouts are recorded with exact commit, reply URL and resolved
state in `/tmp/durisweb-review-20261017/closed-findings.json`. The current GitHub
scan confirms them; the counts below exclude new unresolved findings.

| PR | Resolved in this review run | Published repair / retained proof |
| --- | ---: | --- |
| #46 | 1 | `5a820ac`: notification permission works with denied browser storage. |
| #48 | 4 | `e7cb0cf` + `d43f94c`: cookie/CSRF recovery, safe failure references, port guard and matching API contract; 39 native tests on each engine. |
| #49 | 7 | `39319e5` + `64d30b7`: refusal/focus, auth hydration, saved-choice refresh, navigation tracking and privacy navigation; 287 frontend tests plus browser checks. |
| #50 | 4 | `06dd143` + `ab40c42`: isolated deletion connections, safe references, retryable URLs when final counting fails; 34 native tests per engine, 300 frontend tests. |
| #54 | 4 | `9ee08fa` + `3e68def` + `89bea79`: UTC checks, selected-class cache approval/CLI close, durable rollback fence; 26 native tests per engine. |
| #55 | 1 | `3446b1b`: unavailable restore controls stay disabled, inspection stays available; 294 frontend tests and desktop/phone browser checks. |
| #57 | 1 | `213b803`: wait for list reconciliation, block duplicates and failed-refresh retries until explicit recovery; 316 frontend tests and browser checks. |
| #62 | 5 | `3062017` + `268b455`, formatting `3b81636`: account-scoped cache, upload removal admission, opened-descriptor download/inspection and upload-aware generated-busy selectors; 60 native tests / six suites on each engine, 322 frontend tests, browser at 1440/768/390. **Five later threads remain below.** |
| #63 | 5 | `949537e` + `958e305`: all writer-stop gate links, maintenance ordering and exact duplicate-plan removal. Documentation checks; latest carry `48c73d2`. **One later P1 thread remains.** |
| #64 | 3 | `10fe5bc`: quiet actual package command, mount identity and accepted legacy suffixes; 21 tests, native aliases/control. Latest carry `9d502eb`. **Five later threads remain.** |
| #65 | 6 | `1cc5581` + `d20fe20`: root alias refusal, named identity, both receipts/exact bundle entries, parent payload rehash and mount admission; 44 tests / four suites plus native alias, substitution and remount checks. **One later payload-acknowledgement thread remains.** |
| #66 | 1 | `8cf161f`: download works without AbortSignal.any/timeout, listeners/timer cleaned up; 21 focused tests, 339 frontend tests and real shared-DB API browser download. **Four threads remain.** |

No latest combined full backend, provider/live-production or physical-device
acceptance is claimed. Historical tests reproduce particular boundaries;
they do not establish that a later race, leak or missing topology is fixed.

### Every project PR and branch

Fetched/API heads below are **the snapshot before publishing this plan**;
#66 advances when this plan and its pending parent carry are pushed. A zero
unresolved-thread count is not review approval. “Base” names the real PR base,
not a suggested master merge.

| PR | State / unresolved threads | Branch | Base | Remote head | Delivered chunk |
| --- | --- | --- | --- | --- | --- |
| [#36](https://github.com/LuminariMUD/DurisWeb/pull/36) | Merged | `branch/issues-7-14-security-privacy-baseline` | `master` | `b299239449e9` | Remove identifying data from GeoIP and cache diagnostics |
| [#37](https://github.com/LuminariMUD/DurisWeb/pull/37) | Merged | `branch/issue-14-web-schema-baseline` | `master` | `55aafe917485` | Define and verify versioned website schema inputs |
| [#38](https://github.com/LuminariMUD/DurisWeb/pull/38) | Merged | `branch/issue-14-web-schema-bootstrap` | `master` | `303030a4077f` | Add guarded website baseline installation and migration coverage |
| [#39](https://github.com/LuminariMUD/DurisWeb/pull/39) | Open; 0 unresolved | `branch/issue-14-baseline-qualification` | `master` | `b339562f3e9d` | Qualify fresh and restored website baselines on full owner schemas |
| [#41](https://github.com/LuminariMUD/DurisWeb/pull/41) | Open; 0 unresolved | `branch/issues-7-8-session-credentials` | `branch/issue-14-baseline-qualification` | `7fd35baceac8` | Protect refresh credentials and make session expiry timezone independent |
| [#42](https://github.com/LuminariMUD/DurisWeb/pull/42) | Open; 0 unresolved | `branch/issue-9-toggle-audit-journal` | `branch/issues-7-8-session-credentials` | `4b28587612a6` | Keep safety-toggle attribution durable through audit outages |
| [#43](https://github.com/LuminariMUD/DurisWeb/pull/43) | Open; 0 unresolved | `branch/settings-utc-provenance` | `branch/issue-9-toggle-audit-journal` | `b0d8e0a0c885` | Report website-setting timestamps as UTC instants |
| [#44](https://github.com/LuminariMUD/DurisWeb/pull/44) | Open; 0 unresolved | `branch/session-probe-config-guard` | `branch/settings-utc-provenance` | `49ba05fb0abd` | Recognize the session test probe in configuration checks |
| [#45](https://github.com/LuminariMUD/DurisWeb/pull/45) | Open; 0 unresolved | `branch/issue-10-stop-unconsented-analytics` | `branch/session-probe-config-guard` | `069f7b50d42e` | Stop optional website analytics before privacy choices are ready |
| [#46](https://github.com/LuminariMUD/DurisWeb/pull/46) | Open; 0 unresolved | `branch/browser-storage-preferences` | `branch/issue-10-stop-unconsented-analytics` | `5a820ac9086c` | Handle blocked storage in notification and changelog preferences |
| [#47](https://github.com/LuminariMUD/DurisWeb/pull/47) | Open; 0 unresolved | `branch/privacy-processing-registry` | `branch/browser-storage-preferences` | `558544ee90e6` | Inventory data lifecycles for privacy and account requests |
| [#48](https://github.com/LuminariMUD/DurisWeb/pull/48) | Open; 0 unresolved | `branch/privacy-choice-receipts` | `branch/privacy-processing-registry` | `d43f94cbfbb0` | Enforce server-owned privacy choices before optional collection |
| [#49](https://github.com/LuminariMUD/DurisWeb/pull/49) | Open; 0 unresolved | `branch/privacy-browser-choices` | `branch/privacy-choice-receipts` | `64d30b7edaac` | Add public privacy information and safe browser choices |
| [#50](https://github.com/LuminariMUD/DurisWeb/pull/50) | Open; 0 unresolved | `branch/post-image-deletion-recovery` | `branch/privacy-browser-choices` | `ab40c42a279b` | Preserve retry state for forum image removal |
| [#51](https://github.com/LuminariMUD/DurisWeb/pull/51) | Open; 0 unresolved | `branch/retention-readonly-preview` | `branch/post-image-deletion-recovery` | `47c61d2a48bc` | Add bounded read-only retention previews |
| [#52](https://github.com/LuminariMUD/DurisWeb/pull/52) | Open; 0 unresolved | `branch/privacy-data-hold-records` | `branch/retention-readonly-preview` | `2c0421cd0ee7` | Record private data hold intent and release history |
| [#53](https://github.com/LuminariMUD/DurisWeb/pull/53) | Open; 0 unresolved | `branch/retention-hold-aware-preview` | `branch/privacy-data-hold-records` | `9096acec3c04` | Account for holds in retention previews and continuation |
| [#54](https://github.com/LuminariMUD/DurisWeb/pull/54) | Open; 0 unresolved | `branch/retention-sql-enforcement` | `branch/retention-hold-aware-preview` | `89bea792d543` | Prepare gated SQL retention with transactional holds |
| [#55](https://github.com/LuminariMUD/DurisWeb/pull/55) | Open; 0 unresolved | `branch/restore-lifecycle-boundary` | `branch/retention-sql-enforcement` | `0641201b72e1` | Close legacy restore bypasses until protected recovery exists |
| [#56](https://github.com/LuminariMUD/DurisWeb/pull/56) | Open; 0 unresolved | `branch/backup-deletion-recovery` | `branch/restore-lifecycle-boundary` | `c28d07772d47` | Keep backup deletion failures retryable and await UI outcomes |
| [#57](https://github.com/LuminariMUD/DurisWeb/pull/57) | Open; 0 unresolved | `branch/backup-action-acknowledgement` | `branch/backup-deletion-recovery` | `213b8030e3a5` | Wait for confirmed backup actions and retain refused work |
| [#58](https://github.com/LuminariMUD/DurisWeb/pull/58) | Open; 0 unresolved | `branch/lifecycle-metadata-visibility` | `branch/backup-action-acknowledgement` | `ba9e1fcc2ea7` | Require authoritative metadata before lifecycle writes |
| [#59](https://github.com/LuminariMUD/DurisWeb/pull/59) | Open; 0 unresolved | `branch/managed-archive-hold-barrier` | `branch/lifecycle-metadata-visibility` | `d678688a7fa7` | Fence managed archive cleanup against preservation holds |
| [#60](https://github.com/LuminariMUD/DurisWeb/pull/60) | Open; 0 unresolved | `branch/schema-trigger-authority` | `branch/managed-archive-hold-barrier` | `ad1b7e98e980` | Require authoritative schema and session side-effect checks |
| [#61](https://github.com/LuminariMUD/DurisWeb/pull/61) | Open; 0 unresolved | `branch/stream-backup-archives` | `branch/schema-trigger-authority` | `cff99db4cebc` | Stream backups without temporary SQL copies |
| [#62](https://github.com/LuminariMUD/DurisWeb/pull/62) | Open; 5 unresolved | `branch/backup-upload-records` | `branch/stream-backup-archives` | `3b81636a6029` | Track backup uploads durably and honor preservation holds |
| [#63](https://github.com/LuminariMUD/DurisWeb/pull/63) | Open; 1 unresolved | `branch/legacy-upload-preservation-gate` | `branch/backup-upload-records` | `48c73d28adf3` | Preserve legacy temporary copies before old service shutdown |
| [#64](https://github.com/LuminariMUD/DurisWeb/pull/64) | Open; 5 unresolved | `branch/legacy-backup-copy-inventory` | `branch/legacy-upload-preservation-gate` | `9d502ebe57b3` | Inventory legacy backup copies privately before preservation |
| [#65](https://github.com/LuminariMUD/DurisWeb/pull/65) | Open; 1 unresolved | `branch/legacy-copy-preservation` | `branch/legacy-backup-copy-inventory` | `d20fe20d10ce` | Preserve legacy backup bytes with kernel file leases |
| [#66](https://github.com/LuminariMUD/DurisWeb/pull/66) | Open; 4 unresolved | `branch/account-data-export` | `branch/legacy-copy-preservation` | `8cf161f448ae` | Add password-verified partial website data downloads |

#39 targets master; #41 targets #39; #42–#66 each target the preceding listed
PR. Carry repairs through each intervening branch using ordinary merges and
verify remote parity. Earlier review fixes are carried through #65 and into
local #66 `917ac55`. Do not recreate branches or force-push the stack.

Other surviving branches are accounted for below; the Discord/Mudlet work is
outside this project's unfinished scope. Historical deleted dependency branches
are not active work.

| Other branch | Local head | Remote head | Associated PR / purpose |
| --- | --- | --- | --- |
| `branch/issue-30-discord-payload-bounds` | `a25f16b1f251` | `a25f16b1f251` | [#35](https://github.com/LuminariMUD/DurisWeb/pull/35) (merged) |
| `branch/issue-30-discord-status` | `09ea84026073` | `09ea84026073` | [#34](https://github.com/LuminariMUD/DurisWeb/pull/34) (merged) |
| `branch/issue-30-discord-transport` | `87dd4619828e` | `87dd4619828e` | [#32](https://github.com/LuminariMUD/DurisWeb/pull/32) (merged) |
| `branch/issue-30-durable-discord` | `6e33525905b4` | `6e33525905b4` | [#33](https://github.com/LuminariMUD/DurisWeb/pull/33) (merged) |
| `branch/legacy-owner-fence` | `2774928e8638` | — | No PR; local investigation |
| `feat/mudlet-gui-page` | — | `465b2dbf1218` | [#29](https://github.com/LuminariMUD/DurisWeb/pull/29) (merged) |
| `master` | `89468603a61a` | `89468603a61a` | Integration base |

Preserved worktrees: original master checkout; the existing detached Kilo
`hulking-poppyseed` checkout; `/tmp/durisweb-pr37-review-20261016`;
`/tmp/durisweb-pr38-review-20261016`; `/tmp/durisweb-pr39-parent-refresh-20261016`;
`/tmp/durisweb-pr41-pr39-carryforward-20261016`;
`/tmp/durisweb-session-probe-guard-20261016`; and the current plan worktree.
Do not reset or remove them to simplify this handoff.

### Exact unresolved review queue — 16 threads

These are reported findings, not 16 independently reproduced defects. Inspect
the current source before repair. Two #62 threads are marked outdated by GitHub;
outdated is not resolved. The contents-identity report appears covered by
`268b455` and should first be compared with its retained regression, avoiding a
duplicate implementation. All thread identifiers are retained in the linked
GitHub record and private `pr-N.json` snapshots.

**PR #62: 5 unresolved.**

- [P2: Bind content inspection to the registered upload identity](https://github.com/LuminariMUD/DurisWeb/pull/62#discussion_r4302951387); GitHub marks outdated.
  Compare with the already-published descriptor/identity fix `268b455` and its replacement regression; if fully covered, reply with that exact proof and resolve this duplicate. Do not assume an outdated marker proves closure.
- [P2: Preserve inspection for generated backups over 64 MiB](https://github.com/LuminariMUD/DurisWeb/pull/62#discussion_r4302951389); GitHub marks outdated.
  Keep large generated backups inspectable without unbounded allocation. Reproduce the >64 MiB / parsing-deadline case and distinguish generated versus untrusted uploaded archive limits.
- [P2: Do not disclose foreign upload references in 404 responses](https://github.com/LuminariMUD/DurisWeb/pull/62#discussion_r4302951392).
  Make foreign-owner and missing-ID 404 responses indistinguishable; never return another owner's stored upload reference. Exercise status, download and contents as two accounts.
- [P2: Include authorization scope in the backup cache key](https://github.com/LuminariMUD/DurisWeb/pull/62#discussion_r4303060089).
  Include effective authorization scope in cached backup visibility or invalidate on auth transitions. Test the same account returning after an overlord-to-manager downgrade.
- [P2: Unlink the file identity the worker validated](https://github.com/LuminariMUD/DurisWeb/pull/62#discussion_r4303159577).
  Close the validation-to-unlink replacement gap. Reproduce replacement at the destructive boundary; retain/refuse uncertain work until a removal fence protects the selected identity. An extra path stat alone is insufficient.

**PR #63: 1 unresolved.**

- [P1: Protect copies from the unit's own automatic restart](https://github.com/LuminariMUD/DurisWeb/pull/63#discussion_r4303076408).
  Protect the sole legacy namespace against the service's own Restart=always/crash before lengthy inventory/copy/reconciliation. Pausing a separate watchdog does not provide that guarantee; do not perform live shutdown/rollout while this remains unproved.

**PR #64: 5 unresolved.**

- [P2: Reject bind aliases of selected roots for private output](https://github.com/LuminariMUD/DurisWeb/pull/64#discussion_r4303087831).
  Reject private evidence destinations that are bind aliases of a selected root or descendant. Add native mount-ancestry refusal proof.
- [P2: Check directory exhaustion before enforcing the copy cap](https://github.com/LuminariMUD/DurisWeb/pull/64#discussion_r4303087841).
  Allow exactly 1,000 recognized copies when the directory is exhausted; refuse the next copy. Check the 999/1,000/1,001 boundaries.
- [P2: Enforce the deadline during per-copy traversal](https://github.com/LuminariMUD/DurisWeb/pull/64#discussion_r4303087846).
  Pass the cooperative deadline through each per-copy filesystem traversal and check between operations; test several individually slow calls.
- [P2: Preserve owner access to the evidence file](https://github.com/LuminariMUD/DurisWeb/pull/64#discussion_r4303087848).
  Ensure the saved evidence remains mode 0600 with owner read/write access under a restrictive umask; verify non-root reopen before acknowledging.
- [P2: Reject noncanonical configured backup roots](https://github.com/LuminariMUD/DurisWeb/pull/64#discussion_r4303087852).
  Reject a noncanonical configured BACKUP_DIR itself, including symlink/proc-root aliases, before comparing the selected canonical root.

**PR #65: 1 unresolved.**

- [P2: Keep payload bytes stable through acknowledgement](https://github.com/LuminariMUD/DurisWeb/pull/65#discussion_r4303181751).
  Keep payload writes excluded through the final success acknowledgement in copy and offline verification. Reproduce a same-length mutation after the last payload check; checking only directory metadata does not establish stable payload bytes.

**PR #66: 4 unresolved.**

- [P2: Read credentials from the configured MUD database](https://github.com/LuminariMUD/DurisWeb/pull/66#discussion_r4302129789).
  Read account credentials through mudPool and web sessions through the web pool, at initial and final authorization checks. In shared mode reuse the held connection to avoid nested checkout deadlock. Trace real requireAuth through accountService and permissionService: their MUD reads must use the configured MUD authority, while web profile reads remain on the web pool. Prove the actual endpoint in shared and separate databases on MySQL/MariaDB.
- [P2: Report unexpected export failures](https://github.com/LuminariMUD/DurisWeb/pull/66#discussion_r4302854931).
  Log only safe unexpected-failure category/code and a generated reference also returned to the client. Assert no password, request payload, SQL, bindings or raw error leaks.
- [P2: Translate timeout aborts into a user-facing error](https://github.com/LuminariMUD/DurisWeb/pull/66#discussion_r4302854932).
  Distinguish the internal 20-second timeout from caller cancellation. Show a stable retry message for the timeout, preserve quiet caller cancellation, and cover timeouts while reading the body.
- [P2: Index reactions by export owner](https://github.com/LuminariMUD/DurisWeb/pull/66#discussion_r4302854936).
  Add a reversible forward (user_account_name,id) index for forum_reactions, including forward schema contracts. Do not edit immutable baseline/applied migrations. Test up/down/replay and EXPLAIN on meaningful synthetic scale on both engines.

### Critical one-hour execution plan

These allocations describe the requested 60-minute window; they **do not reset
an external deadline**. If less time remains, shorten implementation and protect
the final verification/publication period. The target is verified progress on
the existing PRs, with an exact unfinished-work handoff.

1. **Minutes 0–5: establish the exact starting point.** Read this section,
   refresh only refs/reviews that may have moved, confirm clean status and the
   latest #66 handoff. The inventory and combined package checks recorded here
   are already done; reuse them unless relevant source changes. Keep optional
   collection, destructive retention and unavailable restore gated. The P1 #63
   preservation gap blocks any legacy shutdown/rollout regardless of PR order.
2. **Minutes 5–35: repair oldest outstanding PR #62 first.** Verify/close the
   duplicate contents-identity finding, then prioritize foreign-reference
   disclosure, role-cache exposure and cancellation's destructive race.
   Preserve large generated-backup inspection. Reproduce each material defect
   and use the smallest repair; stop adding unrelated machinery. Commit/push
   each proven focused repair and resolve only the threads its proof covers.
   If a sound destructive-operation fence cannot be qualified in this window,
   leave that action fail-closed and explicitly unfinished; do not claim a
   path-based check solves the race.
3. **Use remaining implementation time in stack order:** #63 crash-safe
   preservation prerequisite; #64's five inventory defects as one focused
   chunk; #65 payload fence through acknowledgement; then #66's database
   authority, safe diagnostics, timeout message and forward owner index.
   Each item has concrete proof requirements above. Do not skip parent
   propagation or treat the four export changes as full erasure/export delivery.
4. **By minute 35, reserve time for verification; by minute 50, publish.**
   Run changed-path tests and required package gates; use both native SQL
   engines for the export authority/index changes and the native mount/lease
   fixtures for file-safety changes. Reuse valid prior proof. Push ordinary
   parent carries, confirm exact PR head equality, post evidence-backed review
   replies, and read back resolution. A test failure gets a concrete repair or
   an explicit remaining item, never a blanket green claim.
5. **Minutes 50–60: leave a truthful review handoff.** Refresh all review
   pages once, update this top section with actual commits/tests/remaining
   findings, and verify clean worktree and upstream parity. Do not start a
   late feature chunk or wait indefinitely for repeated bot reviews.
   Remaining issues stay open. If all 16 findings are not closed, state the
   exact remainder; even closing all of them does not complete P6/P7/P8.

Do not spend this hour rebuilding completed baseline/session/consent features,
re-running unchanged broad suites, creating another inventory/report framework,
reviving the owner-fence experiment, or implementing an unreviewed erasure
system. After review repair, the separate original-project completion path is:
approved registry decisions → remaining per-store retention/restore evidence →
complete request/export/erasure and external-owner workflows → integrated
qualification → separately authorized release/live verification. These are real
remaining requirements, not optional polish.

### Verification and recovery commands

**Fresh at `917ac55` for this handoff:** both package formatting, lint,
type-check and builds pass; backend MUD-write inventory and immutable schema
checks pass; frontend configuration/palette checks and **343 tests / 60 files**
pass. These check the pending parent carry before publication. The documentation
edit adds no runtime changes.

Commands executed through `python3 /tmp/durisweb-image-quality.py backend` and
`python3 /tmp/durisweb-image-quality.py frontend`:

```bash
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend verify:mud-writes
pnpm --dir backend schema:check
pnpm --dir backend build
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend config:check
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
```

Fresh logs: `/tmp/durisweb-review-20261017/handoff-backend-quality.log` and
`handoff-frontend-quality.log`. The frontend wrapper uses synthetic loopback
URLs on 25475/25476; it does not load or contact production. Final document
checks are `git diff --check`, `./scripts/check-config-literals.sh`, PR/branch
inventory comparison and local Markdown link/heading checks.

**Not rerun for this documentation update:** full backend tests, native SQL
suites, browser runtime/provider tests, lease/mount fixtures, physical devices
and production acceptance. Retained native evidence remains available; no
new claim is made for separate-database export, which is still broken.

Private retained evidence lives in `/tmp/durisweb-review-20261017`:
`latest-scan.log`, `pr-N.json`, `open-prs.json` and `closed-findings.json`.
Relevant recent logs: `pr62-reader-final-{mysql,maria}.log`,
`pr62-reader-quality-closeout.log`, `pr62-reader-frontend-quality.log`,
`pr62-reader-browser.log`, `pr65-ack-{red,focused,full-focused,quality-final}.log`.
The committed tests, not temporary scripts alone, define the regression cases.

Reusable isolated runners (inspect their ownership assertions before reuse):
`/tmp/durisweb-run-archive-suite.mts <23436|23437> upload-archive` and
`/tmp/durisweb-run-account-export-suite.mts <23436|23437> export-only`. They
provision the full owner schema plus website baseline/forward migrations and
clean up only their marked synthetic database/user/cache/root. The export
runner currently proves **shared mode only**; it needs a second owned MUD
database for the unresolved separate-mode test. MySQL 8.0.46 uses 23436,
MariaDB 11.8.9 uses 23437; private Redis is 23479, DBs 13/14. Do not substitute
the development, other review or production ports. Serialize suites sharing
a fixture database/cache.

Relevant source tests: `backend/src/services/__tests__/accountExportNative.test.ts`,
`backupUploadsNative.test.ts`, the legacy inventory/preservation service and CLI
tests, and `legacyCopyPreservationMounts.native.ts`. The latter needs a private
mount namespace on owned temporary roots. Browser helpers retained in `/tmp`:
`durisweb-review-browser62.mjs` and `durisweb-review-export-browser.mjs`.
Temporary evidence is local, not portable; preserve it until its needed proof
is in the PR/documentation. Never commit fixtures, credentials or player data.

The fresh review scanner is `/tmp/durisweb-review-scan-current.py`; regenerate
its input using `gh pr list --state open --limit 100 --json
number,title,url,headRefName,baseRefName,headRefOid,isDraft,createdAt,updatedAt,reviewDecision,statusCheckRollup`.
It checks pagination on review threads, review bodies and discussion comments.
Do not rely on old counts after a new push. The sequential closeout helper
`/tmp/durisweb-review-close.py PR THREAD_ID BODY_FILE` verifies local/remote head,
posts and reads back the exact reply, then resolves and rereads the thread.
It requires explicit evidence in the body and must not run while changing branches.

No reader-visible website behavior changes in this documentation commit;
no Website Changelog entry is needed. Existing implementation release drafts
remain drafts until the described release is verified live.

---

The following sections retain prior evidence and the original acceptance scope.
Their dated branch states, unresolved counts, “current” labels and next-step
instructions are superseded by the handoff above. Consult them for reproduction
details, not as the current task queue.

## Historical evidence — follow-up reviews #48–#50

**Fresh queue / #66 browser fix:** three missing AbortSignal static-method cases
reproduce the download failure. The existing request now uses one local
AbortController and a 20-second timer, forwards caller cancellation, and removes
both timer/listener in `finally` after response-body processing. Focused service
and actual AccountDataExport component tests pass 21 cases; full frontend gates
are running after correcting test assertion style to satisfy ESLint. The first
focused command named a nonexistent AccountExportControl test and ran only the
17 service cases; the corrected command runs both actual files. No backend code
has been changed for #66's separate-database finding yet.

Before switching branches, publish the qualified browser-only repair. Then work
oldest-first through these exact new findings:

- #57 `PRRT_kwDOVA2-8c6tgIxc`: await backup-list reconciliation before allowing
  an uncertain create-backup retry; return the query invalidation promise.
- #62 `PRRT_kwDOVA2-8c6tgRI0`: download the opened, identity-validated upload
  descriptor, not a pathname that can be replaced before streaming.
- #62 `PRRT_kwDOVA2-8c6tgRI1`: exclude upload rows from generated-backup busy state.
- #63 `PRRT_kwDOVA2-8c6tgQO0`: link the preservation gate from every remaining
  direct writer-stop instruction, including retention and schema guides.
- #63 `PRRT_kwDOVA2-8c6tgQO4`: remove the duplicated preservation-order journal block.
- #63 `PRRT_kwDOVA2-8c6tgQO7`: activate/confirm the maintenance notice before the
  preservation gate, while still requiring actual writer closure.
- #65 `PRRT_kwDOVA2-8c6tgeC0`: revalidate both named receipts and exact bundle
  contents at final acknowledgement, alongside bundle/payload checks.
- #65 `PRRT_kwDOVA2-8c6tgeC3`: parent must hash payload bytes after worker exit
  and bind that read to unchanged metadata before success.
- #65 `PRRT_kwDOVA2-8c6tgeC6`: bundle/payload/receipt descriptors must remain on
  the protected root's qualified mount, including replacement at bundle open.

#66's remaining database-authority work must test the real authenticated route
with separate owned web/MUD databases. `accountService` currently routes MUD
account tables through the web pool; `permissionService.getCharacterInfo` joins
MUD-owned player/leaderboard/association tables through that pool too (avatar
reads remain web-owned). Existing password UPDATE is authorized by DB-10; do not
add new MUD writes. Export must verify credentials via the MUD pool and session
via web SQL, including the final check. Reuse the held web connection when both
pools are identical to avoid nested pool-checkout deadlock. Existing native
export tests exercise actual auth and must cover both topologies; a mocked
credentials helper alone is insufficient. Current evidence/helper scripts are
retained in the private review directory and this file's recovery record.

**#66 browser-only final proof:** full frontend gates/build pass **339 tests /
60 files**; the corrected focused pair passes 21. A fresh backend build followed
by `node --import ./backend/node_modules/tsx/dist/loader.mjs
/tmp/durisweb-review-export-browser-suite.mts 23436 export-browser` passes actual
compiled-API downloads at 1440/390 with both AbortSignal static methods removed
in the browser. Wrong-password, changed-account, anonymous and no-analytics
checks also pass (five export requests). This is shared-database proof only;
the separate-database review remains open. Logs: `pr66-frontend-quality-final.log`,
`pr66-frontend-focused-final.log`, `pr66-compat-{backend-build,browser}.log`.
No backend source changed in this repair. Configuration/whitespace checks pass.
Publish/resolve the browser finding, then return to #57 as listed above.

**#65 repair:** filesystem locations are derived from held descriptor mount IDs
and kernel mount roots, including aliases under a nested filesystem. Copying
refuses a destination reachable inside either declared source root or above the
selected source; it repeats that check before acknowledgement. Copy and offline
verification re-resolve the named bundle/payload and compare their identities to
the open descriptors immediately before success. Capturing the payload identity
before final sync also catches observed late in-place changes. The inherited
255-byte filename rule accepts a real 214-character upload extension; an actual
copy and subsequent independent verification pass. The preservation package
command had the same reproduced dotenv-output issue as inventory and now sets
quiet mode itself, with a package-invocation test that removes inherited quiet.

Before repair, copy/verify each accepted a renamed bundle and the package test
reported dotenv stderr; a root-isolated native alias fixture also accepted an
unsafe destination. An initial parser draft rejected unrelated namespace-handle
mount roots such as `net:[...]`; validation now applies to the opened filesystem's
records, preserving ordinary operation. Final focused tests pass **41 / four
suites**, including six namespace/late-write scenarios, real per-file lease
operations and the existing Python lease suite. The new
`legacyCopyPreservationMounts.native.ts` fixture, run with the same private
`unshare --mount --propagation private`/Node loader recipe as #64, passes six
actual alias cases and an independent copy/verification control. It includes
spaces in mount paths and a target reachable through a different-device child
mount. Only its owned home-directory fixture is mounted and cleaned.
Logs: `pr65-{red,focused,focused-final,quality}.log`; native output is in tool
evidence. Backend quality gates/build are running. No receipt format, worker
algorithm, storage service or whole-cohort authorization is added. No frontend,
SQL/provider or production operation is claimed. Publish once the gates pass,
resolve #65, then continue #66's database-authority and browser-cancellation fixes.

**#65 final gates:** backend format/lint/types/MUD-write/schema/build and
configuration/whitespace checks all pass. The 41 focused cases include the
existing eight-case Python native lease suite; both committed native mount
fixtures have passed in private namespaces. No runtime source changed after
these results. Retain ordinary/incomplete bundles for review as documented;
no visitor news is needed for these operator-tool corrections.
**#64 repair:** the documented package script sets dotenv quiet mode itself;
its CLI test invokes that script with no inherited quiet setting. Inventory
validates mount IDs on opened directory/file descriptors, so same-device binds
at the dump, staging root, database directory, SQL member or upload cannot be
classified as an ordinary in-root copy. It accepts single-component SQL names
with the configured punctuation/Unicode. The already-published #65 filename
helpers are brought back to this first inventory consumer, including original
upload suffixes/extensionless names; the arbitrary 200-character suffix cap is
omitted while retaining the 255-byte component bound. This also prepares #65's
later suffix finding for inherited closeout. No content read, writer fence,
adoption, removal or new dependency is added.

Five unit/CLI regressions failed before repair (dotenv stderr and four configured
SQL names), then 21 tests pass across the two inventory files. A native fixture
failed before repair on a same-device mounted dump; after repair it passes five
bind boundaries plus an ordinary-file control, preserving source bytes. Run the
committed `backend/src/services/__tests__/legacyBackupInventoryMounts.native.ts`
only in a fresh private mount namespace: `unshare --mount --propagation private
<node> --import <backend>/node_modules/tsx/dist/loader.mjs <fixture>`, as root.
Actual local Node: `/home/aiwithapex/.nvm/versions/node/v24.15.0/bin/node`;
actual backend: `/tmp/durisweb-security-privacy-plan-20261016/backend`.
All mounts/files are synthetic beneath one owned temporary directory and are
unmounted/removed in its `finally`. This is not a production mount operation.
The check uses [Linux fdinfo mount IDs](https://man7.org/linux/man-pages/man5/proc_pid_fdinfo.5.html).
Logs: `pr64-{red,focused,quality}.log`; native stdout is retained in tool output.
Backend gates/build are running. Publish only after they pass, then resolve #64
and carry into #65. The frontend remains unchanged from qualified #62.

**#64 final checks:** backend format/lint/types/MUD-write/schema/build gates pass;
configuration and whitespace guards pass. The 21 CLI/service tests and native
five-bind/one-control result above are final for unchanged runtime. No broad
backend, frontend, SQL/provider or production rerun is needed or claimed for
this filesystem/command correction. Runbook links and the Linux mount-ID
reference were checked. No visitor news is needed for this operator-only tool.
**#63 documentation repair:** the incident Redis restart procedure and standalone
maintenance stop procedure now explicitly require the existing legacy-copy gate
before an operation can tear down the old application's private temporary files.
The deployment gate now covers the stable upload prefix with the original suffix
or no suffix. Source verification: `220c991:backend/src/routes/admin.ts` appends
`path.extname(file.originalname)` and accepts `application/zip`, so `.dump`, `.ZIP`
and extensionless files were valid inputs. No new runtime behavior or approval
flow is added. Files: the three existing operator guides and this plan. Verify
their relative links/anchor, diff and config-literal guard; no application test
rerun is needed for the text correction. The backend/frontend trees match the
qualified #62 parent. No visitor changelog entry is needed for operator-doc fixes.
Publish and resolve these two threads, then continue #64's three findings.

**#62 review repair:** account-dependent backup queries now include the signed-in
account in their key, disable anonymous reads, consume cancellation signals and
apply progress updates to the same scoped key. Cancellation compares the present
file against its durable registration and passes that identity to the managed
remover for admission-time rechecking. Bulk failed cleanup excludes upload-marked
filenames, and the UI counts only eligible generated backups. No new lifecycle,
storage or query framework is introduced. Files: existing backup services,
composable/API/view, focused tests, cleanup runbook and plan.

Two Vue Query regressions and the pre-/post-inspection replacement cases failed
before repair. The first bulk test had an incomplete synthetic row (missing the
required `ip_address` field); after correcting it, a controlled old-query run
reproduces deletion of two rows instead of only the generated failed backup.
The fixed query was restored immediately afterward. Focused frontend tests pass
16 and the current full suite passes 318 / 58 files; native final reruns and the
small Clear Failed display correction are still being qualified. Evidence is
under `pr62-*` in the private review directory. The earlier 54/55 archive-test
result is incomplete and is not acceptance. Do not publish until final native,
frontend and rendered checks pass. All three review threads remain open.

The corrected native matrix subsequently passes 55 cases on each engine; final
frontend gates/build pass 318 / 58 files, and recovery/cancellation browser checks
pass at 1440/768/390 with Clear Failed excluding retained uploads. Following the
other deletion caller exposed a reachable bypass through generic delete-by-ID;
a native regression confirms it removed a registered upload without its
cancellation identity. The remover now requires that identity for every upload-
marked filename, preserving the explicit cancellation path. The final 56-case
matrix and backend gates are being rerun for that small additional admission fix.

**#62 final proof:** `node --import ./backend/node_modules/tsx/dist/loader.mjs
/tmp/durisweb-run-archive-suite.mts 23436 upload-archive` and the same with
`23437` each pass **56 tests / six suites**, covering the reported cases, the
generic deletion bypass, real multipart/filesystem handling, worker fencing,
holds and recovery. Owner/schema preflights match and owned fixtures are cleaned.
`python3 /tmp/durisweb-image-quality.py backend` and its frontend mode pass all
required checks/builds; frontend has **318 tests / 58 files**. Focused Vue Query
tests pass 16, proving visible-account isolation and cancellation of a stale
response. `node /tmp/durisweb-review-browser62.mjs` passes at 1440/768/390 with
recovery acknowledgement, hold refusal, explicit retry, retained failed uploads
and the corrected Clear Failed count. Phone/tablet screenshots were inspected.
Whitespace and configuration guards pass. Final logs: `pr62-closeout-{mysql,
maria,backend-quality}.log`, `pr62-final-{frontend-quality,browser}.log` and
`pr62-frontend-focused.log`. No full backend, physical-device, provider or live
production acceptance is claimed. Future admin news: “Retained backup uploads
stay private when switching accounts and remain available for review until
explicit cancellation; bulk failed-backup cleanup leaves them in place.”
Publish this repair and resolve all three threads, then carry it into #63's
documentation repairs. Keep #64–#66 open for the remaining eight findings.

**Final retention carry-forward:** #54's class/CLI and rollback repairs are
integrated through #60 merge `f2422b6`. The actual metadata-v2 execution runner
passes 26 tests / two suites on each of 23436/23437, including cache class
approval, real CLI connection closure, rollback races and interruption recovery.
Backend gates/build pass; frontend source is unchanged from the previously
qualified integration. Logs: `pr60-final-retention-{mysql,maria,quality}.log`.
No test process remains running. Continue to #61 and #62 without redoing these
unchanged checks. The older 16-finding snapshot below is superseded by the
verified closeout of all three #54 threads.

**#60 integration / next review queue:** #58 final `1a61f1e` and #59 merge
`a12acc3` are pushed. #60 merge `7867992` preserves inherited runtime; its
metadata-v2 fixture is qualified by the original
`/tmp/durisweb-run-execution-suite.mts` with `23436 execution-only` and
`23437 execution-only` using the Node/tsx invocation recorded above: 20 tests /
two suites per engine pass. Backend quality gates/build pass. Frontend and
image/retention service sources match their qualified parents; logs are
`pr60-integration-{mysql,maria,quality}.log`. No test process remains running.

The fresh complete scan (`latest-scan.log` in the private review directory)
confirms #48/#49/#50/#55 are resolved and adds these #54 findings:

- [Gate analytics cache deletion on selected class approval](https://github.com/LuminariMUD/DurisWeb/pull/54#discussion_r4302619613)
  (`PRRT_kwDOVA2-8c6tgBmR`).
- [Serialize rollback with retention workers](https://github.com/LuminariMUD/DurisWeb/pull/54#discussion_r4302619615)
  (`PRRT_kwDOVA2-8c6tgBmT`).
- [Close Redis before the retention CLI returns](https://github.com/LuminariMUD/DurisWeb/pull/54#discussion_r4302619617)
  (`PRRT_kwDOVA2-8c6tgBmV`).

These are unaddressed; source policy remains disabled. Next inspect/reproduce
them on #54, preserving rollback evidence and the existing worker control
protocol. #61–#66 still lack the parent repairs; #62's three original findings
and #63–#66's ten others remain open. Do not resume unrelated feature work.

**#58 integration:** #57 final head `252f16a` is pushed. #58 merge `7d590f8`
retains both the authoritative metadata check and the UTC retention import;
no predicate/hold check was dropped. `node --import
./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-review-execution-v1-suite.mts
23436 execution-only` and the same with `23437` each pass 20 tests / two suites.
This runner retains #58's metadata-v1 installation and omits only the later v2
fixture preparation unavailable on this historical branch. Backend quality gates
and build pass; the frontend tree exactly matches qualified #57. Logs:
`pr58-integration-{mysql,maria,quality}.log`. Continue the parent carry-forward.

**Carry-forward through #57:** parent merges #51 `47c61d2`, #52 `2c0421c`,
#53 `9096ace`, #54 `ade5bf2`, #55 `d1d8b9a`, #56 `536fa43` are pushed.
The inherited image/privacy runtime matches its qualified parent. #57 merge
`a0b9899` resolves the backup-view conflict by retaining its async acknowledgement,
error and cancellation handling together with every #55 restore availability
control. `python3 /tmp/durisweb-image-quality.py frontend` passes all gates/build
and 313 tests / 58 files; `node /tmp/durisweb-review-availability55.mjs` passes
stored/uploaded inspection and disabled modes at 1440/390 widths on the combined
build. Logs: `pr57-integration-{quality,browser}.log`. Backend changes are inherited
unchanged, with no new backend runtime or production claim. Plan-only conflicts
retain the cumulative handoff plus the newer review evidence.

Latest: #50's two follow-ups are pushed as `ab40c42` and verified resolved;
parent integration is pushed through #60 (`9050fee`) with its two-engine
retention proof. See the [complete latest carry-forward handoff](https://github.com/LuminariMUD/DurisWeb/blob/9050fee/docs/ongoing-projects/plan.md).
A fresh scan found three new #54 findings, for 16 unresolved in total. Current
branch is #54; first fix restricts analytics-cache work to the selected approved
class and refuses old/inconsistent saved runs that request cache work outside
that class. Files: execution service, existing native tests and this plan.
Then finish rollback/worker serialization and standalone CLI Redis cleanup;
carry these repairs through the stack before continuing #62–#66. No policy is
enabled and no production operation is authorized.

**#54 publication / rollback continuation:** class/CLI fixes are pushed as
`3e68def`; both review threads are replied to and verified resolved. Fourteen
findings remain from the last scan. The remaining rollback race reproduces:
a worker starting immediately before DROP was allowed to finish after the
empty-ledger check. The repair locks the existing control row, refuses history
or active/unknown control state, and commits a worker-rejected rollback fence
before DDL. It removes that fence only after confirming the ledger is absent;
an interrupted rollback resumes through the same guarded down path. No applied
migration file, schema definition, dependency or new worker lock is changed.
The focused native race now passes. Final two-engine tests also exercise a
failure after the fence commits but before DROP, plus the existing lost-DDL-
acknowledgement recovery. Required backend checks are running; record their
actual results before publication. Files: schema helper, native tests, runbook
and plan. This does not authorize any shared migration or live deletion.

**#54 rollback final proof:** the existing isolated execution runner with
`23436 execution-only` and `23437 execution-only` each passes 26 tests / two
suites, including both new race/interruption cases and real guarded migrations
with lost DDL acknowledgements. Backend format/lint/types/MUD-write/schema/build
checks pass via `/tmp/durisweb-image-quality.py backend`; whitespace/config
guards pass. Logs: `pr54-rollback-{red,focused,mysql,maria,quality}.log`.
The applied migration and immutable schema contract are untouched. No frontend,
full-backend or production rerun is claimed. Next publish/resolve this final
#54 thread, carry all three repairs forward, and resume #62's three findings.

**#54 class/CLI repair proof:** four native regressions failed before repair:
login-only approval erased analytics cache, an inconsistent saved cache task was
accepted, and successful/failed CLI cleanup left the real Redis connection ready.
Execution now initializes cache work only for selected analytics, rechecks its
approval immediately before cleanup, and rejects out-of-class pending cache
state. The CLI closes the cache client it used in `finally`; module import alone
does not open Redis, and application-only execution retains shared-client use.
`node --import ./backend/node_modules/tsx/dist/loader.mjs
/tmp/durisweb-review-execution-suite.mts 23436 execution-only` and the same with
`23437` each pass 24 tests / two suites. Native CLI tests verify return codes and
the actual Redis connection's `end` status before fixture reconnection.
The focused approval/cache suites pass eight tests; backend quality gates,
MUD-write/schema checks and build pass. Logs: `pr54-class-cli-{red,unit,mysql,
maria,quality}.log` in the private review directory. No frontend/runtime-provider
or production check is claimed. Publish these two findings separately; the
rollback race remains open and is the next action. No visitor news is needed
for this disabled operator path; the runbook records class and connection rules.

The active work is oldest-first PR review repair. The complete project/branch
inventory, unfinished P0–P8 scope and recovery priorities are preserved in the
[cumulative handoff](https://github.com/LuminariMUD/DurisWeb/blob/562d1210b96de09f8003c6663c05291749c6e6a2/docs/ongoing-projects/plan.md).
That snapshot found 21 unresolved findings; #55 is now committed/pushed as
`3446b1b214ca2d0836ef03b111086ba9019f2ca5`, its thread is verified resolved, and
20 remain from that scan. The restore UI used its unchanged retained 294-test
and desktop/phone proof. No production operation occurred.

Current #48 follow-up corrects only the API contract: status never clears a
receipt, invalid receipts use the existing CSRF-bound recovery, and a credential
rotated during a transaction can still return 403. The implementation and native
tests already prove this behavior. Files: API reference and this plan. Proof:
direct route/service/lifecycle inspection, `git diff --check`, and the config
literal guard. No runtime tests are rerun for this documentation correction.
Publish/reply/resolve this #48 thread, then carry it into #49 and repair its four
new findings (initial authentication, status refresh, navigation events, route
identity). Preserve #55's published UI fix when subsequently carrying the stack.
No release-news entry is needed for correcting contributor API documentation.

**#48 closeout / #49 continuation:** contract fix `d43f94c` is pushed and its
thread verified resolved; 19 findings remain from the refreshed queue. #49 has
the parent repair through ordinary merge `da7d422`. Four regressions reproduce:
two unit failures for saved-choice visit splitting and aborted prior navigation
requests; rendered failures for two visits after delayed signed-in hydration and
two controls groups on `/privacy/`. Runtime changes move coordinator startup
after the existing session restoration, preserve visits on status-only refresh,
retain each in-flight navigation controller until completion/cancellation, and
use the privacy route name in the shell. No queue, retry policy or dependency is
added. Files: existing App/main/coordinator and tests, lifecycle guide and plan.
Proof target: the two focused files, all frontend gates/build and rendered
startup/trailing-slash/manual-refresh checks plus the existing privacy scenarios.
Initial focused run passes 32 tests; final full/browser results follow below.

**#49 final follow-up proof:** focused privacy/control tests pass 32; all frontend
gates and build pass via `python3 /tmp/durisweb-image-quality.py frontend`, with
287 tests / 55 files. `node /tmp/durisweb-review-browser49-new.mjs` proves real
App startup with delayed signed-in restoration produces one initial event,
manual refresh preserves the nonce, and `/privacy/` renders one controls group
and the current-page marker. `node /tmp/durisweb-review-browser49.mjs` also passes
the four retained desktop/phone refusal, withdrawal and visibility scenarios.
The initial native-fetch unit fixture was corrected to reject on abort as the
browser does; the corrected pre-fix run still fails both regressions. Logs:
`pr49-new-{red-valid,focused,quality,browser}.log`, `pr49-{auth,route}-red.log`
and `pr49-regression-browser.log` in the private review directory. Configuration
and whitespace guards pass. No backend/native/provider/live test rerun is
needed or claimed. Future privacy-release wording may include accurate visit
counts and a single privacy controls group; live news stays unpublished.

**#50 follow-up outcome:** preserve committed removal results even if the final
pending-count lookup fails: return the known counts/URLs with `remaining: null`
and a safe diagnostic reference. The client validates that explicit partial
shape, drops only unavailable previews and keeps retry feedback visible.
Whole-request batch errors and single-image errors share their service/route/
response reference. Files: existing image service, forum route, API parser,
carousel, their tests, API guide and plan. Ablation reuses the current partial
result instead of adding an error-response parser or a new operation framework.
Two native/API regressions and two frontend regressions failed before repair;
13 focused frontend checks now pass, including invalid partial acknowledgements.
Required two-engine and package verification is in progress; do not claim it
completed until the result below is recorded.

**#50 final follow-up proof:** `node --import
./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-review-image-suite.mts
23436 image-only` and the same invocation with `23437` each pass 34 tests /
two suites, including actual deletion, API response and log-reference checks.
Owned fixture preflights/fingerprints match and cleanup completed. Both modes of
`python3 /tmp/durisweb-image-quality.py backend|frontend` pass required gates
and builds; the full frontend suite passes 300 tests / 57 files. The 13 focused
frontend cases include mounted carousel feedback and selective preview removal.
`git diff --check` and config-literal checks pass. Logs: `pr50-new-*` in the
private review directory. No full backend suite, fresh visual-layout, live
provider or production test is claimed; the existing rendered warning is reused.
Future forum-release wording: “Image cleanup keeps confirmed removals out of
your draft even if checking the remaining images fails, and offers retry.”
Publish this source, close the two threads, then carry parents through #51–#61
before #62; preserve #55's independently published UI fix.


## Retained verification and historical execution

The remaining records preserve original commands, results and limitations.
All older words such as “current”, “next”, “ready” and “complete” refer to their
dated checkpoint; the current handoff and outstanding queue above govern.
Historical acceptance is not a fresh rerun or proof against newer findings.

## Review repair evidence — original findings and completed repairs

At the review-task kickoff, the user requested all outstanding code-review findings to be addressed,
starting with the oldest open PR. The live queue at the top now also includes seven later findings. Preserve the published branches, repair each
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
| #48 | 3: stale GET cookie clearing, actionable safe diagnostics, native fixture port binding | Fixed; 39 native cases pass on each database engine |
| #49 | 3: pending refusal, temporary visibility changes, compact confirmation/focus | Fixed; 30 focused, 285 full frontend tests and rendered checks pass |
| #50 | 2: safe forum failure context, shared pool starvation during R2 deletion | Fixed; 32 image/API cases per engine and both package gates pass |
| #54 | 1: DST-ambiguous retention cutoff comparisons | Fixed; execution 20 and preview 26 cases pass on each engine |
| #55 | 1: unavailable restore controls still offered by the UI | Implemented/tested locally; uncommitted, unpublished, thread unresolved |
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

**#46 publication/carry-forward:** fix `5a820ac` is pushed and its review thread
is replied to and resolved. #47 has no findings; parent merge `558544e` is pushed,
and its entire frontend tree matches the tested #46 frontend. #48 now contains
that repair through an ordinary parent merge, without rewriting history.

**#48 outcome:** status GETs cannot remove a concurrently rotated cookie;
storage failures carry a safe operation/stage, allowlisted error code, rollback
outcome and a reference shared with the client; native tests refuse a pool port
different from their explicit opt-in before importing the pool. Files: existing
privacy service/routes/tests plus a small safe-code selector needed by this and
the reviewed forum-error path. Proof: stale receipt and diagnostics regressions
failed before repair; a mismatched-port import incorrectly succeeded before
the guard change. Add native rotation, corrupt-record, commit/rollback and
safe-code checks, then run the two-engine fixture and required backend gates.
This retains the current protocol and diagnostic boundaries without a new
storage/logging service or policy change.

**#48 final proof:** `node --import
./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-review-p5-suite.mts
23436 privacy-only` and the same command with `23437` each pass 39 tests / four
suites, including actual routes, transactions, rollback, cookie rotation and
concurrent choices. The runner uses owned empty Redis DBs 13/14 and cleans its
database/user/cache; before/after owner fingerprints and preflights match.
`pnpm --dir backend test --runInBand src/utils/__tests__/safeFailureCode.test.ts`
passes three pure diagnostic cases. The explicit mismatch command with
`TEST_PRIVACY_DB_PORT=23436 DB_PORT=23437 DB_HOST=127.0.0.1
DB_NAME=durisweb_qualification_privacy_suite` and Jest's
`--testNamePattern=__guard_only_no_cases__` now refuses module import with zero
tests, before pool construction; it previously exited successfully.
`python3 /tmp/durisweb-image-quality.py backend`, configuration literal and
whitespace checks pass. Frontend source remains byte-identical to the already
qualified #46/#47 tree; no additional frontend/browser or full-backend rerun is
claimed for this correction. Source policy gates remain false.

Removing the unsafe GET clear exposed a reproduced lost-Set-Cookie retry gap.
Status and explicit retry now fall back to the current CSRF-bound identity,
using the authority already available when a receipt is absent. Invalid cookies
cannot authorize their named record. Native cases cover both stable/rotated CSRF
and a forged cookie naming a different browser, preserving that browser's valid
choice. This adds no new endpoint, credential format or account linkage.
The added rollback regression initially recursed through an already mocked
checkout; its setup was corrected before both final green native runs.
Evidence: `pr48-*` logs in the private review directory. Future privacy-release
wording covers reliable saved choices; diagnostic/fixture repairs need no
separate visitor announcement, and nothing is published live here.

**#48 publication:** `e7cb0cf` is pushed, all three review threads have evidence
replies and verified resolved state, and #49 now contains the repairs through
an ordinary parent merge. No published commit was rewritten.

**#49 outcome:** preserve an in-flight refusal and permit only cancellation of
pending acceptance; revalidate consent on returning to a tab while preserving
the same visit and avoiding duplicate route events; keep compact confirmations
mounted and focusable after their own action. Files: existing privacy service,
control component and their tests. Five pre-fix failures reproduce the reviewed
behaviors. Proof also covers hidden navigation, first visibility, withdrawal
during hiding, and preserving focus that moved to another control. Ablation
adds only pending-decision/route state and local confirmation state; no new
storage, event queue, endpoint or consent policy is introduced.

**#49 proof:** `pnpm --dir frontend test:unit --run
src/services/__tests__/privacy.spec.ts
src/components/privacy/__tests__/PrivacyControls.spec.ts` passes 30 tests.
`python3 /tmp/durisweb-image-quality.py frontend` passes format/lint/types,
configuration/palette, full tests (285 / 55 files) and build. The backend tree
is identical to qualified #48 and its evidence is reused. Configuration literal
and whitespace checks pass. `node /tmp/durisweb-review-browser49.mjs` verifies
the fresh build with isolated synthetic APIs/real HttpOnly cookie handling:
desktop/phone keyboard refusal remains one refusal while pending, compact
confirmation stays visible and focused, pending acceptance can still be
withdrawn, returning to a tab revalidates without an extra view, hidden navigation
adds one event under the same nonce, and server withdrawal blocks later events.
Screenshots `pr49-confirmation-{1440,390}.png` were visually checked. The browser
fixture's WebSocket interception was corrected after its first run exposed an
unhandled local fixture connection; no error category was merely ignored.
A further regression prevents passive refresh from moving confirmation focus
again. This is rendered Chromium/phone-viewport evidence, not physical-device
or live collection acceptance. Policy flags remain false. Private proof:
`pr49-{red,focused-closeout,quality-final,browser-closeout,passive-focus-red}.log`.
Future privacy-release wording includes stable choices and accessible
confirmation; no live changelog publication occurs during this review repair.

**#49 publication:** `39319e5` is pushed and its three threads have evidence
replies and verified resolved state. #50 contains the fixes through its parent
merge. Seven of the initial 24 findings are closed at that checkpoint.

**#50 outcome:** R2 removal retains its cross-process advisory lease on a
dedicated database connection, capped at two operations per process. It no
longer occupies the ten-slot application pool during provider waits. Existing
intent, attachment guards, provider acknowledgement, retry and lock-release
semantics are preserved. The four forum create/update failure paths now record
a safe stage/allowlisted code and return the matching reference. Files: image
service/tests, forum routes and lifecycle/plan documentation. Ablation reuses
the #48 safe-code selector and existing database/R2 contracts; no queue, pool
registry, migration or new configuration setting is introduced.

**#50 proof:** five pre-fix native failures reproduce the pool dependency and
missing reference/context on all four write routes. The new concurrency case
occupies all ten application-pool connections, proves two removals still reach
the held provider, rejects a third, then verifies lock release and retry.
`node --import ./backend/node_modules/tsx/dist/loader.mjs
/tmp/durisweb-review-image-suite.mts 23436 image-only` and the same with `23437`
each pass 32 tests / two suites (14 image unit cases and 18 native/API cases).
Full-owner schema/bootstrap/migrations, session/configuration/dependency probes
and before/after owner fingerprints pass on both engines. The private runner
owns empty Redis DBs 13/14 and removes its SQL database/user/cache afterward.
`pnpm --dir backend test --runInBand
src/services/__tests__/postImageDeletion.test.ts
src/utils/__tests__/safeFailureCode.test.ts` passes 17 tests.
`python3 /tmp/durisweb-image-quality.py backend` and the frontend equivalent
pass all required format/lint/types/build gates, MUD-write/schema checks and
frontend configuration/palette/full tests (294 / 57 files). Configuration
literal and whitespace checks pass. No broad backend rerun or new browser
layout/provider acceptance is claimed; actual HTTP image/forum outcomes are
covered by the native suite and frontend response tests.

The image native guard had the same missing pool-port binding as #48. It now
checks typed host/port/database against the opt-in. A mismatched
`TEST_IMAGE_DB_PORT=23436 DB_PORT=23437` test import that previously succeeded
now refuses before executing any tests. Fault injection covers pooled and
dedicated connections so existing deletion/publication race tests remain real.
Evidence: `pr50-{red,unit,mysql,maria,backend-quality,frontend-quality,
port-before,port-after}.log`. Future forum-release wording can mention that
slow image removal does not occupy the website query pool; no live operation
or Website Changelog publication is performed in this review task.

**#50 publication/carry-forward:** `06dd143` is pushed and both review threads
have evidence replies and verified resolved state. Nine initial findings are
closed. Parent repairs were carried through #51 (`af51c06`), #52 (`2d68945`)
and #53 (`e56f8ee`), all pushed; their relevant runtime file blobs match the
qualified parent repairs. #54 now includes them via local merge `0ff746b`.
Its sole merge conflict was documentation: retain #54's corrected historical
publication wording and append the complete current review ledger.

**#54 outcome:** pin only dedicated retention preview/execution sessions to UTC
before indexed timestamp queries. Keep row locks, epoch validation, indexes and
application/global session settings intact. Include the timezone contract in
rule signatures so earlier checkpoints/runs cannot silently resume with changed
semantics. Files: candidate contract, preview/executor, their focused tests and
operator/plan docs. MySQL reproduced a second-fold run reporting complete after
deleting only one of two eligible rows in each class. Existing row locks prevented
the first attempted concurrent-edit fixture; that invalid test was replaced
with real repeated-hour/keyset cases rather than weakening the locks. Both
occurrences, exclusive cutoff boundaries, one-row traversal, read-only snapshots
and rejection of old signatures are covered. Native guard checks also bind the
configured database port to their opt-in. No rule period, source approval flag,
migration or production action changes.

**#54 proof:** `node --import ./backend/node_modules/tsx/dist/loader.mjs
/tmp/durisweb-review-execution-suite.mts 23436 execution-only` and the same
with `23437` each pass 20 cases / two suites. The corresponding
`/tmp/durisweb-review-retention-suite.mts <port> retention-only` passes 26 cases /
two suites on each engine. This covers both named-zone fall-back occurrences,
strict cutoff boundaries, one-row traversal/continuation, old-signature refusal,
holds, restart/ownership and actual read-only CLI behavior. The pure preview
query contract explicitly permits only the fixed UTC session setter before its
read-only transaction; its 12 cases also pass separately. Initial MariaDB preview
qualification found that existing exact statement expectation needed this
deliberate addition, after which the full command passed. Fixture state, owner
fingerprints and configuration/dependency probes remain valid on both engines.
The private runners target this pre-metadata-v2 PR's actual schema contract;
later #58/#60 install requirements are not silently removed from newer source.

Both native fixture guards reject mismatched database ports with zero tests
executed (`TEST_RETENTION_DB_PORT` or `TEST_RETENTION_EXECUTION_DB_PORT` set to
23436 with `DB_PORT=23437` and the corresponding private target names/cache).
`python3 /tmp/durisweb-image-quality.py backend`, configuration literal and
whitespace checks pass. Frontend source is identical to qualified #53/#50 and
its evidence is reused; no additional broad backend/frontend/browser/provider
or live-retention acceptance is claimed. Evidence: `pr54-*` logs. No visitor
changelog entry is needed for a source-disabled operator retention correction;
the runbooks now explain UTC sessions and preserving incompatible old evidence.

**#54 publication:** `9ee08fa` is pushed, its thread has an evidence reply and
verified resolved state, and #55 now contains the repairs through its parent
merge. Ten of the initial findings are closed.

**#55 outcome:** match the permanently closed server restore boundary in the
admin interface. Keep stored/uploaded contents inspection available, label it
as inspection, show the unavailable reason before action, disable every restore
mode/confirmation and guard both submit handlers. Suppress advice to stop the
MUD for this unavailable action. Files: the existing backup view and docs only.
Ablation keeps this at the availability boundary; the later #57 acknowledgement
and cancellation changes remain in their own PR. An initial broader promise-test
experiment was removed from this chunk; it is not needed when the actions are
unavailable. Preserve this explicit UI gate when carrying through #56/#57/#62.
Proof: rendered tests with valid selections in all three restore modes must send
zero restore requests while inspection/creation/download remain available, on
desktop and phone layouts, followed by required frontend checks.

**#55 retained proof at handoff:** `python3 /tmp/durisweb-image-quality.py
frontend` passes 294 tests / 57 files and required frontend gates/build.
`node /tmp/durisweb-review-availability55.mjs` passes stored/uploaded inspection
and disabled restore modes at 1440 and 390 widths, with zero restore/cancel
requests and no unexpected console/layout failures. The UI change remains
uncommitted and its review thread remains open; publishing this document does
not publish that runtime fix.

**#55 runtime publication preparation:** source diff and retained browser output
rechecked; desktop/phone screenshots show the unavailable notice and disabled
controls. `git diff --check` and the configuration literal guard pass. No runtime
byte changed after the 294-test/build/browser proof, so those checks are reused.
The news-update draft for a future verified admin release is: “Backup contents
remain available to inspect and download. The backup page now clearly explains
that website restore is unavailable and disables its restore controls.” No live
entry is published before an authorized verified release.

### Recovery result — selected account-data download

- **Outcome and scope:** one authenticated `POST /api/privacy/export` performs
  a fresh database-backed password check and active-session check, reads eleven
  allowlisted categories in a read-only consistent snapshot, rechecks current
  credentials/block/session state, then returns a private JSON attachment.
  It excludes collation aliases, other subjects, stored credentials, push keys,
  mixed payloads and unreviewed external/staff records. It refuses oversized
  categories/output before responding. The page clears the password, blocks
  duplicate submissions and discards a pending or mismatched-account response.
- **Ablation:** reuse existing authentication, CSRF, rate limiting and privacy
  page. No migration, dependency, provider call, durable export file, queue,
  signed/replayable download URL, generic job framework or service controller
  is added. Read-only retries start a fresh verification/snapshot. The response
  explicitly says `completeAccountExport: false`; missing P7 outcomes stay open.
- **Files:** `backend/src/services/accountExportService.ts`, the existing
  `backend/src/routes/privacy.ts`, one native API/database test, privacy-test
  cleanup, frontend request helper/control/tests and existing privacy page,
  the [runbook](https://github.com/LuminariMUD/DurisWeb/blob/ff152f4001dbe6d6a5ad18d9eea39a07b5a4791b/docs/runbooks/account-data-export.md), lifecycle/security records
  and this plan. All changes belong to this download or its verification.
- **Native proof:** `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-account-export-suite.mts 23436 export-only` and the same
  command with `23437` each pass **16 real route/database tests** on MySQL
  8.0.46 and MariaDB 11.8.9. The fixture installs the full owner schema,
  metadata v2, baseline and current migrations; configuration/dependency/session
  preflights pass. Owner metadata matches before/after on each engine. Two
  synthetic accounts cover all categories, current versus cached credentials,
  case/accent identity, CSRF/origin, anonymous/expired/revoked access,
  password/block/revocation changes during generation, snapshot/pool invariants,
  row limits, safe errors and attempt limits.
- **Full backend regression:** `node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436` runs
  `pnpm --dir backend test --runInBand`: **1,361 passed / 141 suites**, **69
  optional native skips / five whole suites**. The 16 export cases are among
  those skips and were run separately on both engines above. This run does not
  enable the optional two-engine backup-dump matrix; retain its earlier proof.
  Post-test dependency preflight and owner metadata match.
- **Privacy regression:** with explicitly selected local test ports,
  `DB_PORT=23436 DB_NAME=durisweb_unit_no_connect CACHE_REDIS_PORT=23479
  CACHE_REDIS_DB=13 pnpm --dir backend test --runInBand
  src/services/__tests__/privacyChoiceService.test.ts
  src/config/__tests__/privacyPolicy.test.ts` passes **7**, skips **10 native**
  cases and exits cleanly. An earlier run exposed an open Redis handle caused
  by the new authenticated route import. Its owned process was stopped after
  identifying it; test teardown now closes that client, and native export tests
  defer connection-bearing imports until their opt-in setup. The full run above
  proves skipped suites do not leave that handle open.
- **Package checks:** `python3 /tmp/durisweb-image-quality.py backend` passes
  backend `format:check`, `lint`, `type-check`, `verify:mud-writes` (53 classified
  writes), `schema:check` (unchanged 77-table/85-source baseline) and `build`.
  `python3 /tmp/durisweb-image-quality.py frontend` passes frontend
  `format:check`, `lint`, `type-check`, `config:check`, palette guard,
  `test:unit --run` (**313 tests / 60 files**) and `build`.
  Initial focused frontend tests passed 14; the full run includes the subsequent
  malformed-response redaction case. Initial backend test typing issues were
  fixed before the final native runs/gates.
- **Rendered end-to-end proof:** `node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-account-export-suite.mts 23436 export-browser` serves the
  fresh built frontend and compiled real privacy API against the owned SQL/Redis
  fixture. Installed Playwright/Chromium is used because the Browser plugin is
  unavailable. Desktop 1440×1000 and phone 390×844 both download and parse the
  correct JSON, exclude the other subject/credentials, clear the input, reject
  wrong passwords and render without overflow or page errors. A changed
  authentication cookie yielding another account's otherwise valid response is
  rejected by the client. Anonymous visitors get sign-in, no password form.
  Five real export requests and zero optional analytics requests are observed.
  Screenshots `/tmp/durisweb-account-export-{1440,390}.png` were visually checked.
  This is synthetic local acceptance, not a physical-phone or production test.
- **Source/docs checks:** `./scripts/check-config-literals.sh` and
  `git diff --check` pass. A duplicated contact-email literal introduced by the
  prior handoff was replaced with a link to the canonical inventory; no guard
  was weakened. Affected files were formatted using package Biome commands.
  No runtime source changed after the successful browser/full-suite checks;
  final native reruns also qualify the adjusted test-import setup.
- **Evidence:** `/tmp/durisweb-account-export-{mysql-final,maria-final,
  backend-full,backend-final,frontend-quality,browser,privacy-regression-final}.log`,
  the browser runner and screenshot paths above. Fixtures and browser server
  are created/removed by their owning runners. Retain private proof outside Git.
- **Remaining:** durable full request tracking, complete approved export and
  assisted/mixed-data review, erasure/anonymization/non-recreation, MUD/provider
  coordination, wider P6 coverage, policy and live-release gates. This source
  increment does not close #12 or declare compliance.
- **Future release news draft:** “You can download selected profile and
  community activity data from Privacy & choices after verifying your password.
  The download explains which information needs a separate assisted request.”
  Use the news-update workflow only after an authorized verified live release.
- **Publication:** [PR #66](https://github.com/LuminariMUD/DurisWeb/pull/66)
  is OPEN/non-draft/MERGEABLE, from `branch/account-data-export` onto
  `branch/legacy-copy-preservation` (#65 at `a0ce5ee`). Code checkpoint
  `f0aa36161dbde464fd4494ef9df346c7114c24d2` matched local, remote branch and PR
  API at initial publication; ahead/behind was `0 0` and the checkout was clean.
  All four hosted checks on that code head passed by 08:55 UTC, alongside the
  required local gates and real-path proof. This follow-up only records the
  handoff; its final commit may advance the PR without changing runtime source.
  No new implementation branch,
  release tag, merge or deployment is created during closeout.
- **Next session:** begin with #66's final published head in the same isolated
  checkout. The current bounded download is ready for review. Prioritize the
  remaining P7 request lifecycle/complete approved export and erasure, together
  with necessary P6 copy/hold coordination; use the explicit full-scope list
  above. Reuse this evidence and do not rerun unrelated green suites or resume
  the standalone ownership-sealing experiment as the default next step.

## Original scope and authority

These are historical implementation bounds. Current priority and status are
recorded at the top; no expired cutoff is renewed by this document.

Implementation is authorized, including local isolated verification, commits,
pushes, and focused review-ready PRs. Stack dependent PRs as each chunk is ready.
Deployment, production session invalidation, shared-environment migrations,
destructive retention, and operations in the separate DurisMUD repository remain
outside this request. Keep this single evolving execution plan current.
All older stop/drain release instructions are subject to the
[legacy temporary-copy preservation gate](../deployment.md#legacy-temporary-copy-preservation-gate):
inventory and satisfy preservation/hold/fencing requirements before stopping an
old `PrivateTmp` unit. Namespace teardown is itself a copy-removal path.

## Historical execution record and evidence

The entries below preserve original commands, outcomes and limits. Their
then-current branches, PR states and next-step directions are historical;
use the current handoff above for present state and priority.

<details>
<summary>Earlier execution journal and per-chunk verification</summary>

- **P6d2b2e protected per-copy preservation (2026-10-17, qualified/published as #65):** branch
  `branch/legacy-copy-preservation` starts at #64 `ab09779`. Outcome: copy a
  selected legacy file into an exclusive private protected bundle, using a Linux
  kernel read lease to refuse existing/competing writers, verify actual payload
  bytes and retain crash/unknown work with durable immutable receipts. Cover raw
  SQL, staging SQL and old uploaded files without executing or restoring them.
  Non-goals: automatic service freeze/stop, source deletion, inferred account
  ownership, managed adoption, global writer closure/enforcement or production
  operation. Files: one descriptor-only Python stdlib lease worker, Node CLI/
  bundle lifecycle, shared legacy layout/identity helpers, native worker/CLI
  tests and operator/plan docs. Proof: real leases, active/competing writer
  refusal, copied-byte verification, private sync/partial/retry receipts,
  source/root identity, compiled entry point and required backend checks.
  Ablation avoids a service-control framework, native npm/FFI dependency or a
  second metadata database. Python 3 is an explicit operator-tool prerequisite
  because Node exposes no `F_SETLEASE` primitive; the HTTP app does not use it.
- **Freezer investigation (owned local fixture only):** systemd 255 and cgroup
  v2 are present. A unique transient user unit with `PrivateTmp=true` actually
  pauses/resumes its writer via freeze/thaw without tearing down the temporary
  directory. The first fixture placed its helper in host `/tmp`, which the
  private namespace hides; the corrected helper uses an owned home-directory
  fixture. All fixture units/files are stopped/removed and no live unit is
  touched. Preserve `/tmp/durisweb-probe-private-tmp-freeze.py` and its two logs.
  Upstream [systemd](https://github.com/systemd/systemd/blob/main/man/systemctl.xml)
  documents automatic thaw before unit jobs, and the
  [kernel freezer docs](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
  permit process migration out of a frozen group. Thus an observed frozen flag
  is not durable global fencing/adoption authority; do not manufacture one.
  The per-file lease is a narrower, real byte-copy guard, while the required
  whole-cohort shutdown/preservation gate and later adoption remain open.
- **P6d2b2e implementation and ablation:** a standalone operator Node command
  confirms the configured canonical backup root and explicit original upload
  root/name/physical hash, selects one raw SQL/staging member/upload and opens
  descriptors without following aliases/links. The destination is an exclusive
  private UUID bundle outside sources and volatile paths, on reviewed local
  storage. A synced `prepared.json` precedes any bytes in 0600 `payload.bin`.
  The isolated Python stdlib worker receives only descriptors, byte/time bounds
  and expected physical hash, no application environment/credentials or shell.
  Its actual kernel read lease refuses an open writer or writable mapping and
  observes competing write-open/truncate breaks. It copies and independently
  reads back the destination under that guard, with a 128 MiB address-space cap.
  Parent identity/source/size checks and private `complete.json`/directory sync
  precede acknowledgement. Active/unavailable leases or unknown work retain
  original/receipts/partial payload, without destructive cleanup. There is no
  new queue, table, web/API exposure, automatic service-control mechanism or
  source mutation. Read leases do not prevent unlink/rename/namespace teardown
  and do not prove global old-writer closure; source provenance/ownership,
  whole-cohort fencing, holds/adoption and complete recovery stay unapproved.
  See the Linux [file-lease contract](https://man7.org/linux/man-pages/man2/F_SETLEASE.2const.html).
- **Recovery and issues repaired:** every copy requires an explicit UUID; a
  same-ID retry cannot overwrite or hide existing work. Separate `verify`
  validates strict private receipt/payload shapes, actual hashes and sync
  without the original namespace/file, application environment, SQL or Python.
  Incomplete/failed work cannot self-promote. Root substitution, source changes,
  unknown sync and close acknowledgements remain review-required with the same
  UUID. All remaining descriptors close even when an earlier close fails, which
  is required to release a lease duplicated into a killed worker. Failures also
  keep bounded verified worker hash/size evidence when copying completed before
  a later check failed; that evidence is not overall completion. These private
  receipts and exact bytes are an additional operator store with no approved
  period/erasure disposition; retain and protect every state. Persistence,
  encryption, independent storage and ownership still need operator review.
- **Legacy-layout compatibility:** inspection of `parseDatabase` confirms that
  database names use required strings, not the initial ASCII filename subset.
  Shared component predicates now cover legitimate spaces/Unicode SQL member
  names and original MIME-accepted uppercase/non-ZIP/absent upload suffixes.
  Separators/control characters, malformed generated prefixes and unsafe nodes
  remain refused/unknown. Recognizing an uploaded filename never certifies ZIP
  contents. Inventory still grants no snapshot, writer or deletion authority.
- **P6d2b2e exact proof:** `pnpm --dir backend test --runInBand
  src/services/__tests__/legacyBackupInventory.test.ts
  src/scripts/__tests__/legacyBackupInventory.test.ts
  src/services/__tests__/legacyCopyPreservation.test.ts
  src/scripts/__tests__/legacyCopyPreservation.test.ts` passes **32 / 4**.
  Its native wrapper also runs **8 real Python lease cases**, not eight extra
  Jest tests. Direct `python3 -I -B
  backend/scripts/__tests__/legacyFileLeaseWorker.test.py` passes those eight
  cases independently. Actual ext4/tmpfs, binary byte preservation, existing
  writers, competing kernel write opens, writable mappings, zero-byte files,
  source/target identity, private modes, source disappearance, corrupted/linked
  payloads, duplicate/incorrect IDs, traversal, unavailable interpreter, fresh
  process/env-free verification, hung-worker kill/lease release and lost sync/
  close acknowledgements are covered. Native fixtures contain synthetic bytes
  only and all own home/tmpfs directories/processes are cleaned.
  `TEST_BACKUP_DB_PORTS=23436,23437 node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436` expands to full
  `pnpm --dir backend test --runInBand`: **1,363 pass / 141 suites**, 53 optional
  native skips / 4 whole suites. The final failed-receipt worker-evidence field
  and Python repository naming cleanup were then checked with the final focused
  32/4, native eight, required package gates and compiled probe; the global
  suite was not repeated solely for those local changes. Full owned
  owner/baseline/92-migration/metadata-v2 qualification and before/after
  configuration/dependency preflights pass; owner metadata remains
  `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`.
- **Final gates and evidence:** `python3 /tmp/durisweb-image-quality.py backend`
  runs format:check/lint/type-check/verify:mud-writes/schema:check/build, all pass
  (53 classified writes; unchanged 77-table/85-source immutable baseline).
  `./scripts/check-config-literals.sh`, privacy registry/local-link checks and
  whitespace pass. `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-legacy-preservation-compiled-probe.mts` runs the freshly built
  Node CLI with the shipped Python worker, then verifies in a fresh Node process
  with no environment, original source or TS loader; private binary bytes match.
  `pnpm --dir backend backup:preserve-legacy --help` passes. Retain
  `/tmp/durisweb-legacy-preservation-{final-focused,backend-final,quality,
  compiled,help,close,final-paths}.log`,
  `/tmp/durisweb-legacy-lease-worker-final.log`, the compiled probe and the
  earlier freezer experiment as required evidence. Initial patch/fixture test
  placement failures were repaired without weakening refusal/retention claims.
  No dependency package, migration, policy/collection flag, tag, merge,
  deployment/logout, selected production file/namespace or MUD operation is
  introduced. Python 3 is an explicit optional operator-tool prerequisite;
  actual selected-host installation remains a release check. Frontend/browser,
  physical-device, provider and separate full schema/session replay were not
  repeated for this operator-only filesystem command. Future verified-release
  admin news draft: “Individual older backup files can be preserved privately
  with verified bytes. Unconfirmed copies remain available for staff review.”
  No Website Changelog publication occurs before authorized live acceptance.
- **Next after per-copy publication:** refresh parent/PR/master state and
  continue from the published head in the same isolated worktree. Finish
  whole-cohort/namespace pre-teardown fencing/preservation and verified
  ownership/adoption of every legacy copy, including unknown layouts and
  active/interrupted writers. A verified individual payload is not #63 release
  admission. Keep independently protected current hold/run/request evidence,
  compatible offline restore-removal replay, other P6 handlers and own-ledger
  periods, every P7 requirement and named policy/provider/release approval gates
  intact. No user question is needed for continued independent engineering.
- **P6d2b2e publication:** code head
  `7c3e92df29d36cb91bb7722959bb0566dc92f678` is pushed in open/non-draft
  [PR #65](https://github.com/LuminariMUD/DurisWeb/pull/65), base
  `branch/legacy-backup-copy-inventory` (#64 final `ab09779`), and attached here.
  Readback confirms OPEN/MERGEABLE, correct base/head, exact local/remote/API
  SHA, ahead/behind `0 0`, clean worktree and whitespace. Hosted backend/frontend
  quality jobs were running; required local proof above is complete. Master
  remains `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and an ancestor.
  Authoritative cleanup checks find zero owned preservation fixture directories
  and no remaining transient freezer fixture units. Retain required private
  logs/probes and recovery stashes `1c8d1dd`/`bbda289`. Continue from the final
  publication-doc commit in `/tmp/durisweb-security-privacy-plan-20261016` after
  refreshing PR/parent/master. This closeout edits only the plan; do not repeat
  runtime suites for it. No merge, tag, deployment, shared-file/process/namespace
  or MUD operation is performed. Full P6/P7 and named policy/release gates remain
  incomplete and the goal stays active.

- **P6d2b2d private legacy-copy discovery (2026-10-17, qualified/published as #64):** branch
  `branch/legacy-backup-copy-inventory` starts at #63 `1b37db7`. Outcome: an
  explicit-root, bounded, read-only inventory of the traced legacy raw SQL,
  staging and OS-temp upload layouts, saved exclusively as private physical
  identity evidence. Distinguish completed selected-root enumeration from
  partial/changed/unsafe observations and never infer ownership, writer closure
  or deletion admission from names/status/age. Non-goals: namespace attachment,
  content inspection/copying, SQL or provider access, adoption/removal, live
  operations or declaring global enforcement ready. Files: one read-only
  filesystem service/CLI, existing command index, focused filesystem/CLI tests,
  operator/developer docs and this plan. Proof: actual synthetic layouts,
  symlinks/hardlinks/unsafe nodes, bounded/changed/partial scope, private exclusive
  output and no payload/ordinary-path disclosure, plus backend required gates.
  Ablation drops speculative SQL correlation and another durable table/queue:
  a numeric filename is only a hint and cannot supply missing writer/ownership
  proof. Reuse existing filesystem/identity conventions, and explicitly select
  the actual old upload root; never default to the current process's `/tmp`.
- **P6d2b2d result and limits:** the CLI confirms canonical configured
  `BACKUP_DIR` and an optional explicitly selected actual old upload root, with
  a recorded mount-domain hash. It never resolves a user root through symlink,
  `/proc/<pid>/root` or descriptor aliases, attaches to another namespace, reads
  payloads or connects to SQL/Redis/providers. Anchored directory descriptors
  prevent root/path replacement from redirecting enumeration. Exact regular
  SQL/upload and one-member staging shapes receive bounded physical metadata;
  unsafe links/hardlinks/special/cross-device nodes, malformed layouts and
  detected changes remain unconfirmed. Other legacy-prefixed names, including
  MIME-accepted uppercase/non-ZIP suffixes from the old uploader, are counted
  as unknown without disclosing unrecognized names. Numeric IDs are only hints,
  not inferred ownership. Directory/file observations cannot certify a snapshot:
  concurrent writes and timestamp granularity can hide a change. Reports always
  declare `snapshotConsistent: false`, `writerFenceVerified: false` and
  `deletionAdmission: unavailable`, even with completed selected-root enumeration.
- **Further ablation:** the managed unlink worker's local-filesystem allowlist
  is not a read-only discovery requirement. Remove that copied restriction so
  an actual old tmpfs upload root can be observed, while recording filesystem/
  root identity and conferring none of the mutation protocol's guarantees.
  Fixed 10,000-entry/1,000-copy per-root caps, a shared five-second cooperative
  scan budget and 1 MiB output bound limit work without pretending to resume an
  unstable directory. A stalled kernel call is not a hard-bounded operation.
  Only a new exclusive owner-only output file outside scanned roots is written,
  with file and parent sync and no overwrite. Destination persistence and
  independent protection still need separate verification. Ordinary output is
  UUID/scope/aggregate categories only. Exit 2 marks incomplete, unsafe or
  unknown scope; exit 0 never authorizes admission or claims global coverage.
- **P6d2b2d exact proof:** `pnpm --dir backend test --runInBand
  src/services/__tests__/legacyBackupInventory.test.ts
  src/scripts/__tests__/legacyBackupInventory.test.ts` passes **16 / 2**. Actual
  ext4 and tmpfs fixtures cover traced layouts, no SQL-file access-time/content
  changes, symlinks/hardlinks/FIFO, malformed/unknown suffixes, both real caps,
  substituted-root anchoring, observed directory changes, private output/aliases/
  overwrite refusal, wrong configured root and the actual source CLI. An initial
  drift test assumed distinct filesystem clock ticks; it now forces observable
  timestamp drift and the report explicitly disclaims snapshot consistency.
  `python3 /tmp/durisweb-image-quality.py backend` runs
  format:check/lint/type-check/verify:mud-writes/schema:check/build; all pass
  (53 classified writes; unchanged 77-table/85-source immutable baseline).
  `./scripts/check-config-literals.sh`, the privacy registry/local-link checker
  and `git diff --check` pass. `node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-legacy-inventory-compiled-probe.mts` runs the freshly built CLI
  in a separate Node process without a TS loader, verifying private aggregate
  output and unchanged fixture bytes. `pnpm --dir backend backup:inventory
  --help` also passes. Retain `/tmp/durisweb-legacy-inventory-{focused-final,
  quality,compiled,help}.log` and the compiled probe as qualification evidence.
  All fixture files are task-owned and removed; no selected live root or
  namespace was scanned. Full DB/native/backend, frontend/browser, physical
  device/provider/live tests are not repeated for this standalone filesystem
  CLI, which the HTTP application does not import and which changes no
  database/HTTP/UI behavior.
  No dependency, migration, new policy/collection flag, release tag, merge,
  deployment, logout or MUD operation is introduced. No Website Changelog entry
  is needed for this operator-only discovery command.
- **Next after discovery publication:** first refresh the current PR stack and
  use its final published head in the existing isolated worktree. Implement and
  prove actual legacy-writer fencing and pre-teardown preservation/adoption;
  discovery is an input, never approval or substitute for those requirements.
  Preserve all unknown roots/layouts and apply the #63 release gate before any
  old-service shutdown. Continue independent protected current evidence and
  offline restore-removal replay, remaining P6 handlers/own-ledger periods and
  all P7 subject-request work. Global enforcement remains unavailable and named
  policy/release decisions are still open; no user question is currently needed.
- **P6d2b2d publication:** code head
  `c58c833390bc66b6a63fb682eea586352b555af6` is pushed in open/non-draft
  [PR #64](https://github.com/LuminariMUD/DurisWeb/pull/64), base
  `branch/legacy-upload-preservation-gate` (#63 final `1b37db7`), and attached
  here. Readback confirms OPEN/MERGEABLE, correct base/head, exact local/remote/
  API SHA, ahead/behind `0 0`, clean worktree and whitespace. Hosted quality
  jobs were running; required local checks above are complete. Master remains
  `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and an ancestor. Continue in
  `/tmp/durisweb-security-privacy-plan-20261016` from the final publication-doc
  commit after refreshing the stack. Retain required private qualification
  evidence and stashes `1c8d1dd`/`bbda289`. This closeout edits only the plan;
  do not repeat runtime suites for it. No merge/tag/deployment or selected live
  root/namespace operation is performed. The full P6/P7 and policy/release scope
  remains incomplete and the goal stays active.

- **P6d2b2c preservation-order repair (2026-10-17):** branch
  `branch/legacy-upload-preservation-gate` starts at #62 `3d68697`.
  Outcome: prevent the prepared release sequence from stopping an old service
  before legacy temporary uploads are preserved and holds reconciled. Non-goals:
  actual rollout, namespace/process/file operations, disabling `PrivateTmp` or
  claiming adoption/removal is already implemented. Files: deployment and the
  two archive runbooks plus this plan. Proof: trace the pinned old uploader and
  maintained systemd unit against upstream systemd lifecycle semantics, then
  verify exact ordering, links and whitespace. This is a separate real defect
  discovered before the inventory implementation, not a replacement for P6/P7.
  `git show 220c991:backend/src/routes/admin.ts` shows OS-temp uploads with no
  durable ownership; `git show 220c991:backend/src/services/backupService.ts`
  shows `temp_<id>.sql`/`temp_staging_<id>` and unconditional unlink/rm. The
  maintained unit sets `PrivateTmp=true` and depends on the cache. Upstream
  [systemd execution docs](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)
  and [temporary-directory guide](https://github.com/systemd/systemd/blob/main/docs/TEMPORARY_DIRECTORIES.md)
  confirm private temporary-directory teardown when the service stops. Thus
  “stop all old writers, then inventory/adopt” can already lose evidence.
  The initial deployment gate requires the actual old
  mount namespace, verified protected bytes/consistency/hold-compatible teardown
  and a writer fence that does not first destroy that namespace. Existing
  four-hour watchdog pause limits are explicit; the tunnel stays configured.
  No guessed PID, current host `/tmp`, completed row, old age, healthy process
  or second copy can substitute for the required proof. Until the remaining
  discovery/adoption/fencing is implemented and rehearsed, release stays gated.
  Ablation keeps this to ordering/documentation; no new flag, automatic service
  action or speculative systemd workaround is added. Backend/frontend/runtime/
  database/browser checks are not repeated for this documentation-only repair.
  Verify with whitespace and the existing privacy registry/link checker; no
  Website Changelog entry is needed for this contributor/operator instruction.
- **Next implementation:** continue bounded private legacy-copy discovery from
  this branch after publication, identifying raw SQL/staging/old-upload layouts
  without reading contents, following links or inferring writer closure. Use
  an explicitly selected actual old upload root, not an `os.tmpdir()` fallback.
  A report must identify partial/changed/unknown scope and never admit deletion.
  Then implement verified adoption/fencing with current protected evidence and
  offline replay, plus remaining P6 handlers and all P7 requirements. No named
  policy approval or user question is necessary for this independent engineering.
- **Preservation-order publication:** documentation head
  `0f08e6c6f74988b7a32e4c338f09ba9cc2f4aedc` is pushed in open/non-draft
  [PR #63](https://github.com/LuminariMUD/DurisWeb/pull/63), base
  `branch/backup-upload-records` (#62 final `3d68697`), and attached here.
  Readback confirms OPEN/MERGEABLE, correct base/head, matching local/remote/API
  SHA, ahead/behind `0 0`, clean worktree and whitespace. The existing registry
  checker verifies exact 77-table coverage, local references and required gates.
  No runtime tests are needed for this documentation-only correction. Continue
  from the final publication-document commit in the same isolated worktree;
  do not run the described release or alter live services/files. Source P6/P7
  engineering remains available and the full goal stays active.

- **P6d2b2b durable uploads (2026-10-17, qualified/published as #62):** branch
  `branch/backup-upload-records` starts at #61 `0bc2641`. Outcome: persist upload
  ownership and writer identity before accepting bytes, write exclusive private
  ZIPs under the configured persistent backup root, close/fence writers before
  cleanup, use the managed hold-aware remover for every cancellation/rejection,
  keep unknown outcomes retryable after restart, and bound untrusted inspection
  outside the website process. Actor checks apply to opaque references, never
  client filesystem paths. Non-goals: enabling restore/global enforcement,
  inventing retention periods, dropping legacy files, deployment or MUD writes.
  Files: existing backup rows plus private settings receipt, controlled Multer
  storage, managed-removal receipt lookup, isolated inspector/shared pure parser,
  API/client recovery handling, focused/native/browser tests and docs/plan.
  Proof: multipart success/truncation/abort/invalid/budget paths, wrong actor and
  old path refusal, real file/SQL/hold/restart/unknown-ack cases on both engines,
  bounded child failure, UI retained-work flows and affected package gates.
- **P6d2b2b ablation:** uploads are managed ZIPs, so reuse `mud_backups`, the
  existing root, private settings storage, retention-control lock and one-shot
  remover instead of adding another queue/table/unlink protocol. An explicit
  filename marker distinguishes uploads and excludes them from existing manual
  count pruning; no age policy is inferred. Add only an O(1) per-backup receipt
  link for truthful cancellation replay and a writer receipt for interrupted
  receiving/inspection. Ordinary settings never expose those private receipts.
  The existing restore refusal stays unconditional. Budget-exhausted inspection
  means unconfirmed/review-required, not invalid or safe to discard.
- **P6d2b2b implementation:** private `backup-upload-v1:` receipts and marked
  existing backup rows are committed before bytes; the request holds no cleanup
  authority in a client path. The compatibility `tempPath` response/body contains
  only the upload UUID. Files are exclusive 0600 under persistent `BACKUP_DIR`.
  Multer never unlinks; cancellation and known-invalid/oversized rejection use
  the existing managed remover. An exact completed receipt link is required
  for cancellation replay, not merely missing SQL/file state. A replaced index
  must match a terminal failed prior receipt; dangling/invalid history refuses
  admission. Generic settings hide both internal namespaces and collation aliases.
  Marked uploads do not participate in ordinary manual/hourly count pruning.
  Owner/overlord controls apply to list/status/contents/download/cancel/recover;
  closed uploads can be downloaded or cancelled after reload. Restore is still
  unavailable and no new expiry period is invented.
- **Writer/inspection boundary:** close/flush/directory sync precede the
  inspection checkpoint. Receiving recovery requires proven old writer exit;
  inspection recovery can close the already fenced writer immediately. Neither
  age nor missing bytes proves a live writer stopped. Phase comparisons prevent
  a late inspector from overwriting recovery. File/root physical hashes must
  still match. Untrusted ZIP/SQL inspection runs in a credential-free read-only
  child with no extraction/SQL, 192 MiB V8 heap, 15-second own/16-second parent
  deadlines, 10,000 entries, 64 MiB SQL, 5,000 account/character items each and
  256 KiB summary limits. Budget/parser/storage uncertainty is review-required
  and retained. This validates a supported format/summary, never restore safety.
  Pure SQL parsing is moved once and shared with existing parser consumers;
  obsolete OS-temp uploader/path/deletion APIs and their mocks are removed.
- **Limit-race repair found during qualification:** actual small-limit Multer
  truncation can occur while durable registration awaits SQL. The storage
  listener now attaches synchronously before that await. Multer retains one
  excess byte to distinguish exactly-at-limit from oversized; the bounded receipt
  permits that byte and closes the truncated writer accurately. A 128-byte
  native test threshold verifies the actual path with 129 retained bytes and
  hold-aware refusal; it is not a claim of transferring a 500 MiB fixture.
  Production keeps the existing 500 MiB limit and permits only one file/part,
  without text fields. Real HTTP disconnect closes its writer and retains bytes.
- **P6d2b2b exact qualification:** `TEST_BACKUP_DB_PORTS=23436,23437 node
  --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436` expands to
  `pnpm --dir backend test --runInBand`: **1,330 pass / 137 suites**, 53 optional
  native skips / 4 whole suites, on the full verified owner/baseline/92-migration/
  metadata-v2 fixture. Final one-part limiting and the new dangling-link case
  are covered by the subsequent final targeted matrices:
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436 upload-only` passes **17 / 2**;
  the same command with `23437 upload-archive` passes **52 / 6**, including the
  existing actual removal/worker/identity/hold suite. The runners use only owned
  MySQL 23436/MariaDB 23437 and Redis 23479 DB13/14, preserve MUD fingerprints
  (`403c2a…d23`, `995f0c…e2e2`), and pass configuration/dependency preflights
  before/after with all temporary SQL/users/files cleaned. SQL/retention flags
  remain false. See the earlier fixture identity record for complete hashes.
  Final `pnpm --dir backend test --runInBand
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts
  src/services/__tests__/backupUploadPath.test.ts` passes **24 / 2** after stale
  mocks are removed. Native cases cover all four hold scopes, wrong owner,
  receiving/restart/recovery, implicit multipart-error cleanup, truncation/abort,
  malformed/budget outcomes, changed identity, count-pruning exclusion, unknown
  registration COMMIT and missing/dangling receipt refusal. Request identity
  alone is a fixture; native handlers do not establish real JWT/CSRF acceptance.
- **Package and browser proof:** `python3 /tmp/durisweb-image-quality.py backend`
  runs format:check/lint/type-check/verify:mud-writes/schema:check/build, all pass
  (53 classified MUD writes; unchanged 77-table/85-source baseline). Frontend
  equivalent runs format:check/lint/type-check/config:check/palette/unit/build,
  all pass, **299 tests / 58 files**. Registry/link checks and whitespace pass.
  `node /tmp/durisweb-upload-compiled-probe.mjs` exercises the built inspector/
  worker against a real private ZIP without a TS loader/application environment.
  Browser plugin is unavailable; existing Playwright Chromium at loopback
  `127.0.0.1:25477`, desktop 1440x1000 and phone 390x844, verifies pending
  acknowledgement, recovery after reload, held cancellation/no false success,
  same-UUID retry, uncertain upload list refresh, CSRF header, page identity,
  content/overlay/console and viewport. `node
  /tmp/durisweb-upload-recovery-browser.mjs` passes both contexts. Screenshots
  `/tmp/durisweb-upload-{held,retained}-{1440,390}.png` were visually checked;
  the phone history uses its existing horizontal table scroll with wrapped
  actions, not page overflow. Its owned Vite PID/cwd was verified and stopped.
  Logs are `/tmp/durisweb-upload-{backend-full,backend-quality-final,
  native-mysql-final,archive-maria-final,frontend-quality,route-unit-final,browser}.log`.
  Initial fixture/lint failures and the discovered real limit race were repaired;
  final qualification is green. Obsolete one-time AST editing scripts are removed;
  keep qualification scripts/evidence and unrelated recovery stashes intact.
- **Release news and next work:** prepare an admin changelog entry for the
  future authorized verified release: “Uploaded backups remain visible after
  interruptions. Staff can recover or cancel retained uploads, and preservation
  holds prevent cleanup. Uncertain archive inspection keeps files for review.”
  Publish only after deployment acceptance and reconcile existing entries then.
  No dependency/migration, policy/collection flag, release tag, merge, deployment,
  logout or shared/provider/MUD operation is introduced. Full baseline/session
  replay, physical devices, provider and live acceptance are not repeated for
  this chunk. Next from the published head: verified legacy OS-temp upload and
  `temp_<id>.sql`/`temp_staging_<id>` discovery/adoption/fencing, preserving actual
  writer uncertainty. Continue independent protected current evidence/offline
  replay, other P6 handlers/own-ledger periods and all P7 requirements. Global
  `enforcementReady` remains false; owner decisions remain unapproved but no
  user question is needed for the next engineering step.
- **P6d2b2b publication and takeover:** code head
  `ba7869bf0ff37b08c6da2380bb37464a9803ef3c` is pushed in open/non-draft
  [PR #62](https://github.com/LuminariMUD/DurisWeb/pull/62), base
  `branch/stream-backup-archives` (#61 final `0bc2641`), and attached here.
  Readback confirms OPEN/MERGEABLE, correct base/head, exact local/remote/API SHA,
  ahead/behind `0 0`, clean worktree and whitespace. Hosted backend/frontend
  quality jobs were running; required local proof above is complete. Master
  remains `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and an ancestor. Continue
  in `/tmp/durisweb-security-privacy-plan-20261016` from this branch's final
  publication-document commit, first refreshing PR/parent/master state. Keep
  qualification evidence and stashes `1c8d1dd`/`bbda289` intact. The publication
  closeout changes this plan only; do not repeat runtime suites for it. This is
  one qualified copy boundary, not complete P6/P7 or release approval.
- **P6d2b2a, stream new archives (2026-10-17, qualified/published as #61):** branch
  `branch/stream-backup-archives` starts at #60 `220c991`. Inspection finds a
  raw SQL file and a second staging-directory SQL copy for every new backup,
  each removed outside hold admission, plus shell-based ZIP invocation.
  Outcome: stream the session-free dump directly into one private managed ZIP;
  close/reap writers before reporting the archive complete or failed, preserve
  failed ZIPs for the existing hold-aware removal path, and use safe traceable
  creation failures. Preserve actual SQL/ZIP compatibility and positive start
  acknowledgement. Non-goals: pretending uploaded archives or pre-existing
  legacy temporary copies are protected/erased, approving periods, enabling
  restore/global enforcement, deployment or MUD/provider operations. Files:
  existing producer/dump module, focused/native tests and operator/plan docs.
  Proof: real MySQL/MariaDB session-free ZIP/restore, process/stream failure and
  private-mode/no-temporary-copy cases, real producer/hold retries, affected
  backend gates/full suite and a focused PR on #60.
- **P6d2b2a ablation:** eliminate future SQL/staging files instead of building
  removal journals for unnecessary new copies. Reuse the installed Archiver 8
  named ZIP implementation already used by the builder; no new dependency,
  settings or migration. Retain database rows through the existing managed
  archive boundary. Legacy files need separately verified discovery/adoption/
  fencing; uploads still need a durable ledger instead of OS temporary storage
  and Multer's implicit cleanup. Keep those full P6d2b2/P7 requirements open.
- **P6d2b2a qualified result (2026-10-17):** one exclusive mode-0600 ZIP now
  contains `database/database.sql`, streamed through the installed Archiver 8
  implementation. Both passes keep the existing session-row exclusion contract;
  credentials remain in the dump child's environment, never shell/password
  arguments. No new raw SQL/staging files or shell ZIP command remain. Completion
  waits for child close, ZIP/output completion, file flush/close and directory
  sync. Failure closes output/reaps the fresh owned child and retains the ZIP
  for existing hold-aware removal; no PID from durable state is signalled.
  Existing count-pruning ordering and completed-new/held-old behavior remain.
  Registration, dump startup/exit, archive I/O/stream/sync and unconfirmed status
  errors use static categories and UUID references; actor/IP bindings, paths,
  stderr and credentials do not enter API or ordinary diagnostics.
  The obsolete raw-dump file API and staging/zip implementation were removed,
  including tests' stale source-slice contract. Its configured-MUD-database,
  no-restore-executor and session-empty acceptance requirements remain intact.
- **P6d2b2a exact proof:** `pnpm --dir backend test --runInBand
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts
  src/services/__tests__/databaseBackupArchive.test.ts
  src/services/__tests__/backupDeletionRecovery.test.ts
  src/services/__tests__/productionReviewRegression.test.ts` passes **43 / 4**.
  Real owned child processes exercise both passes, no-session sources, nonzero
  dump exits, startup failure, exclusive-open preservation, withheld completion,
  mid-stream output failure and no extra SQL/staging files. Error assertions
  inspect only synthetic selected values, never print an inherited environment.
  `TEST_BACKUP_DB_PORTS=23436,23437 node --import
  ./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-run-archive-suite.mts
  23436` expands to full `pnpm --dir backend test --runInBand` on the explicitly
  owned full owner/baseline/92-migration/v2 fixture: **1,313 pass / 136 suites**,
  **53 native skips / 4 entire suites** (14 image, 10 privacy, 8 hold, 9 preview,
  12 SQL execution). The separate optional metadata/schema-native matrices were
  not selected; their source is unchanged and #60's results are retained. Both
  real database clients create ZIPs using a quote/dollar-containing synthetic
  password, inspect the actual entry, and restore ordinary rows with empty
  `web_sessions`; no raw SQL disk file is used by that round trip.
  `/tmp/durisweb-run-archive-suite.mts 23437 archive-only` under the same Node
  loader passes **35 / 4** on MariaDB; MySQL's corresponding matrix runs in the
  full suite. The actual producer proves mode 0600/no extra workspace, completed
  new archives despite held pruning, and a failed retained archive protected
  until hold release. The prior partial-ZIP test now observes actual failed
  progress rather than waiting for the removed SQL unlink. Owner fingerprints
  remain the MySQL/MariaDB hashes recorded under #60; pre/post configuration/
  dependency probes pass and only owned fixtures are removed.
  `python3 /tmp/durisweb-image-quality.py backend` passes `pnpm --dir backend
  format:check`, `lint`, `type-check`, `verify:mud-writes` (**53**), `schema:check`
  (**77 / 85 historical**) and `build`. Config literals, exact privacy inventory/
  local references and `git diff HEAD --check` pass. Evidence:
  `/tmp/durisweb-stream-archive-{focused-final,full-final,maria-final,gates-final}.log`.
  Initial failures were a typed mock overload and stale source-slice expectation;
  these were corrected without weakening configured-source/restore boundaries.
  A second Biome pass normalized a chained response; final formatting is clean.
  Frontend/browser, full baseline/session replay, other native lifecycle/provider/
  physical-device or live acceptance were not repeated for this producer change.
  No dependency, migration, approval/collection flag, production operation,
  merge or release tag is introduced. Release-news draft: “New database backups
  are created without extra temporary SQL copies. Unconfirmed creation keeps
  recovery work visible for staff investigation.” Publish only with authorized
  verified release news; no live entry is written for this source PR.
- **P6d2b2a publication:** code head
  `be48d7f463d808eb36439d095badcffad1b7edbc` is pushed in open/non-draft
  [PR #61](https://github.com/LuminariMUD/DurisWeb/pull/61), base
  `branch/schema-trigger-authority` (#60 final `220c991`), and attached here.
  Initial readback verifies OPEN/MERGEABLE, correct base/head, exact local/remote/
  API SHA equality, ahead/behind `0 0`, clean worktree and whitespace. Hosted
  quality jobs were running; local qualification above is complete. Master
  remains `8946860` and an ancestor. No history rewrite, merge, release tag,
  deployment or live operation occurred. The publication closeout edits only
  this plan; do not repeat runtime suites for it.
- **P6d2b2a continuation:** from #61's final published head,
  implement durable uploaded-archive ownership/admission and truthful validation,
  cancellation and rejection cleanup. Multer currently owns OS-temp paths and
  implicit limit/error removal; success for an invalid cancellation path and
  raw upload/parser diagnostics must be repaired in that store boundary. Include
  bounded inspection, unknown writer/restart outcomes and actor authorization.
  Existing `temp_<id>.sql`/`temp_staging_<id>` artifacts still require verified
  legacy discovery/adoption/fencing rather than age-based deletion. Preserve
  independent current evidence/offline replay, all remaining P6/P7 handlers and
  own-ledger periods. Global enforcement remains unavailable; this removes
  unnecessary new copies, not those remaining requirements.
- **Schema/session metadata authority (2026-10-17, qualified/published as #60):** both
  `webBaseline.verifyNoWebTriggers` and `migrateWebSessionSchema` accept an empty
  ordinary catalog query without establishing visibility. Outcome: prove absence
  of triggers under the caller's actual permissions before schema adoption or
  credential cutover; refuse incoming session references before its destructive
  clearing too. Retain ordinary bootstrap and reduced-runtime verification,
  without a circular dependency on a not-yet-installed schema/helper.
  Non-goals: new website privileges, credential/policy approvals, applied
  migration edits, deployment, real logout or MUD operations. Files: shared
  metadata authority/guard, the two existing consumers, native qualification and
  operator docs/plan. Proof: reproduce with a hidden synthetic trigger through
  actual verifier/migration paths, then qualify both supported engines, positive
  restricted-account paths, missing/revoked authority and unchanged owner schema.
- **Reproduction and ablation:** the MySQL restricted account reports zero
  triggers, accepts baseline coverage despite a real web-setting trigger, and
  permits credential cutover while a hidden DELETE trigger captures a synthetic
  session ID (1 captured / 0 retained). MariaDB exposes these particular triggers
  and rejects them. Evidence: `/tmp/durisweb-schema-authority-red.log`.
  Keep one metadata implementation and introduce explicit function version 2:
  one canonical current-schema table selector (lowercase ASCII, max 64), used
  only as a bound metadata-filter value. Callers choose owned names from the
  verified baseline/forward contracts or fixed lifecycle rules. The six-target
  v1 definition is not silently changed,
  replaced or accepted as v2. Owners and restricted callers use the same helper;
  install it first, since it reads system metadata and needs no website tables.
  Session clearing checks authoritative incoming references too, so
  a foreign-schema cascade cannot substitute for a hidden trigger. This avoids
  circular bootstrap setup, global website privileges, another SQL credential,
  duplicate function bodies, schema/column/data selectors or dynamic SQL.
  The schema adapter shares the exact routine/body/output validation used by
  runtime lifecycle calls. Stop writers/DDL during approved offline changes;
  this metadata check does not make nontransactional DDL concurrent-safe.
- **Further ablation from the working prototype:** remove the direct-grant
  lookup branch entirely. The helper can be installed in an empty database
  before owner schema or website bootstrap; it does not depend on the schema
  it verifies. One proof for owners and reduced callers avoids separate privilege
  inference rules. Native fixture setup and operator order now make that explicit.
  A SELECT-only MariaDB probe also demonstrates filtered FK-rule metadata and
  strict refusal; the normal website CRUD profile (no DDL/TRIGGER/global grant)
  is separately qualified. No schema hash was weakened to accept missing rows.
- **Forward-compatibility correction:** the existing real-Knex qualification
  declares a new website table; a frozen 82-name helper would incorrectly block
  that supported forward contract. Remove the frozen list and aggregate branch,
  keeping the bounded, current-schema metadata-only selector above. It delegates
  no row or DDL access; website ownership still comes from source contracts,
  which the SQL guard and schema fingerprints enforce. Refresh the legacy
  replay's stale expected ledger with the three already published image/hold/
  retention migrations; preserve every original historical row.
- **Qualified schema/session result (2026-10-17):** hidden triggers now stop
  baseline verification and credential cutover, with the synthetic session
  retained and the capture table empty. A foreign-schema CASCADE remains invisible
  to the ordinary caller but is refused for both owner/restricted cutover paths,
  retaining parent and child. Website CRUD without DDL/TRIGGER/global grants
  verifies the full supported schema; MUD-owner triggers are not misclassified.
  Missing v2 refuses even a caller with a schema TRIGGER grant. Installation
  in an empty database proves no table dependency; old v1 is preserved, never
  silently replaced or used as v2. New canonical forward tables remain supported
  while malformed, uppercase, newline, injected and cross-schema selectors are
  refused without granting row access or constructing SQL.
- **Exact final proof:**
  `TEST_SCHEMA_AUTHORITY_DB_PORTS=23436,23437
  TEST_BASELINE_MUD_SOURCE=/home/aiwithapex/projects/duris/migrations
  pnpm --dir backend test --runInBand
  src/db/__tests__/schemaTriggerAuthorityNative.test.ts` passes **19 tests /
  one suite**, including 18 native cases on MySQL 8.0.46/MariaDB 11.8.9.
  `TEST_BASELINE_DB_PORTS=23336,23337 TEST_BASELINE_MUD_SOURCE=<same pinned source>
  pnpm --dir backend test --runInBand src/db/__tests__/webBaselineQualification.test.ts
  src/db/__tests__/webBaseline.test.ts` passes **48 / 2**, including actual
  historical SQL/85-source replay, adopted data/ledger preservation, all current
  forward entries, raw/schema/down MUD-DDL rejection, new declared forward
  tables, interrupted bootstrap/teardown/seeds and exact schema drift checks.
  `TEST_SESSION_DB_PORTS=23436,23437 TEST_BASELINE_MUD_SOURCE=<same pinned source>
  pnpm --dir backend test --runInBand src/db/__tests__/webSessionCutover.test.ts`
  passes **3 / 1**: full owner schema, actual lost-DDL acknowledgement recovery,
  empty rollback, HTTP access/refresh expiry and binding across three app zones,
  three database offsets and DST-adjacent epochs on both engines. These two
  dedicated servers' global time zones are restored by the qualified fixture.
  `TEST_BACKUP_DB_PORTS=23436,23437 TEST_LIFECYCLE_METADATA_DB_PORTS=23436,23437
  node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436` runs the full backend suite after
  explicit v2-before-bootstrap setup: **1,323 pass / 135 suites**, **53 optional
  native skips / 4 entire suites** (14 image, 10 privacy, 8 hold, 9 preview,
  12 SQL executor). The v2 metadata/real CLI selector/authority cases run on both
  engines inside that full suite; the 18 new schema-native cases use the separate
  explicit opt-in above. Archive qualification on MariaDB via
  `/tmp/durisweb-run-archive-suite.mts 23437 archive-only` passes **35 / 4**;
  MySQL's same matrix is included in the full suite.
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts <23436|23437> execution-only` passes
  **15 / 2 per engine**. The equivalent
  `/tmp/durisweb-run-hold-suite.mts <23436|23437> holds-only` passes **16 / 2
  per engine**, run sequentially for their shared qualification cache. Each
  runner passes pre/post configuration/dependency checks and unchanged owner
  fingerprints (`403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`
  MySQL; `995f0c9f1a726dc25e3ce1104627ebff02e0414e7d2e48595f94de7ce3b0e8e2`
  MariaDB). Final evidence lives under `/tmp/durisweb-schema-authority-`: red,
  focused-final, baseline-final, session-final, full, archive-maria,
  execution-{mysql,maria}, hold-{mysql,maria} and gates-final `.log` files.
- **Qualification repairs and limits:** the first fixed-list prototype failed
  legitimate new-table composition; canonical bound metadata queries preserve
  that existing acceptance instead of weakening it. A fixture startup exceeded
  the old 30-second hook while multiple fresh full schemas were being built.
  Setup now has a bounded 90-second budget, unique per-process names, and cleanup
  joins setup before reading ownership flags or closing connections. The one
  leftover evidence database was inspected (only the expected empty capture
  table, no active connections) and removed; old principals were checked without
  reading credential hashes. Evidence is `/tmp/durisweb-schema-fixture-cleanup.log`.
  The hold test's repeated offline whole-schema up/down/recovery cycle receives
  a 120-second test budget; production query/worker/work limits stay unchanged.
  All final cases pass. A format check raced a formatter during an initial
  parallel qualification; subsequent formatting/gates are sequential and pass.
  Temporary diagnostic wrappers/probes/cleanup scripts were removed. Preserve
  required public tests, private actual runners and logs, not abandoned generators.
  `python3 /tmp/durisweb-image-quality.py backend` passes final
  `pnpm --dir backend format:check`, `lint`, `type-check`, `verify:mud-writes`
  (**53 classified**), `schema:check` (**77 tables / 85 historical sources**) and
  `build`, after the last fixture-only edits. `./scripts/check-config-literals.sh`,
  `python3 /tmp/durisweb-check-privacy-doc.py` and `git diff HEAD --check` pass.
  Frontend/browser, provider, physical-device, image/privacy/preview native
  matrices and live acceptance were not rerun for this backend prerequisite.
  Immutable baseline/migration bytes and source approval flags are unchanged.
  No shared environment, real logout, real backup/MUD/provider operation, merge
  or release tag is authorized or performed. No separate live changelog entry
  is published for this unshipped internal prerequisite; include its setup/safety
  changes in the planned security/privacy release after live acceptance.
- **Schema/session publication:** code head
  `4b5e797de8f6b18a02c41b55cf4a367017bbfe3b` is pushed in open/non-draft
  [PR #60](https://github.com/LuminariMUD/DurisWeb/pull/60), base
  `branch/managed-archive-hold-barrier` (#59 `5c2cc1a`), and attached to this chat.
  Initial readback confirms OPEN/MERGEABLE, correct base/head, exact
  local/remote/API SHA equality, ahead/behind `0 0`, clean worktree and whitespace.
  Hosted quality jobs were running; local evidence above is complete. Master
  remains `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and is an ancestor of the
  tested stack. No history rewrite, merge, release tag or production operation
  is needed/performed. This publication closeout changes documentation only;
  do not repeat runtime suites for it.
- **Next-session entry after #60:** continue P6d2b2's durable uploaded-archive and
  dump/staging workspace admission/recovery with truthful cancellation,
  validation/failure/expiry cleanup. Update any older private fixture runner to
  install v2 before bootstrap and grant its existing SQL principal EXECUTE before
  restricted migrations, as the current archive/hold/execution/preview runners do.
  Preserve independent current evidence/offline replay, remaining class handlers,
  own-ledger periods and all P7 requirements. Engineering is still available;
  no owner question is currently necessary.
- **P6 metadata visibility prerequisite (2026-10-17, qualified and published as #58):** an actual
  external-schema `ON DELETE CASCADE` fixture was invisible to the website
  account's `KEY_COLUMN_USAGE` query; managed archive deletion incorrectly
  succeeded. Direct `TRIGGERS` counts also hide rows without the relevant
  privilege. This affects the existing control and SQL-retention checks too.
  Outcome: require authoritative metadata before lifecycle writes, including
  hidden triggers and references from any schema. Non-goals: production changes,
  broad website-account grants, new credentials/accounts, policy approval or
  changing the immutable baseline. Files: one shared metadata guard and explicit
  DBA installation/check command, existing lifecycle callers, focused native
  regressions and operator docs. Proof: exercise the real restricted website
  account on MySQL 8 and MariaDB 11, preserve rows on hidden relationships,
  reject missing/changed guard or revoked authority, and rerun affected gates.
- **Ablation after native investigation:** a definer view remains filtered on
  MySQL, and scoped routine EXECUTE/ALTER does not expose the function body.
  A definer function using the global InnoDB dictionary fails to load for an
  unprivileged MySQL caller. Use one DBA-installed, read-only definer function
  with the existing catalogs instead; its definer must have direct global
  SELECT/TRIGGER and MySQL partial revokes must be disabled. The website receives
  only EXECUTE on that function. Installation independently checks the body;
  runtime validates attributes, its self-inspected body digest, bounded counts,
  target and current authority. This detects accidental definition/privilege
  drift; database administrators remain trusted, as they already control DDL
  and data. No dynamic SQL, view, global website grant, metadata connection pool,
  new secret, or automatic startup installation is needed.
- **Result and proof:** the actual restricted account now sees the previously
  hidden cross-schema cascade through the guarded result; the real SQL executor
  refuses it with both parent and child retained. Normal invocation/CLI setup,
  idempotent installation, unknown-function preservation, restricted target
  names, hidden MySQL triggers, changed body/security, missing execution and
  revoked global SELECT/TRIGGER are qualified on both engines. The hold HTTP
  endpoint returns 503 with no row/acknowledgement when the helper is absent;
  its general warning no longer falsely claims intent was recorded on errors.
  Dependency preflight requires the helper, without installing it. MariaDB
  installation requires existing `NO_AUTO_CREATE_USER` to prevent an implicit
  account creation race; no server setting is changed. DBA trust and the
  self-inspected runtime digest's limits are explicit in the
  [runbook](https://github.com/LuminariMUD/DurisWeb/blob/ff152f4001dbe6d6a5ad18d9eea39a07b5a4791b/docs/runbooks/lifecycle-metadata.md).
- **Commands and actual results (2026-10-17):**
  `TEST_LIFECYCLE_METADATA_DB_PORTS=23436,23437 pnpm --dir backend test --runInBand
  src/db/__tests__/lifecycleMetadataNative.test.ts
  src/services/__tests__/retentionControl.test.ts
  src/services/__tests__/dataHoldService.test.ts` passes **30 tests / 3 suites**;
  the final full run below also qualifies the later SELECT-revocation assertions
  and final installer/CLI source. Initial fixture-only failures identified the
  MySQL binary-log administrator requirement and benign dotenv stderr; those
  were corrected without changing server settings or weakening the guard.
  `TEST_BACKUP_DB_PORTS=23436,23437 TEST_LIFECYCLE_METADATA_DB_PORTS=23436,23437
  node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts 23436` expands to
  `pnpm --dir backend test --runInBand` after full owner/baseline/92-migration
  fixture setup and explicit helper installation: **1,310 pass / 132 suites**,
  **41 skipped tests / 3 entire suites** (14 native image, 10 native privacy,
  8 native hold, 9 native preview). Session-free backup dump/restore tests use
  both engine ports; hooks/native SQL execution and both restricted metadata
  fixtures run. Full evidence is
  `/tmp/durisweb-metadata-full-mysql-final.log`.
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts 23437 execution-only` passes **15 / 2**
  on MariaDB (source-gate/native executor), including the new hidden external FK
  case. `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-hold-suite.mts <23436|23437> holds-only` passes **16 / 2 per
  engine**, including the later missing-helper HTTP case. Each runner verifies
  configuration/dependencies, owner metadata before/after, and cleans only its
  explicitly owned synthetic fixtures. MySQL owner hash remains
  `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`;
  MariaDB remains `995f0c9f1a726dc25e3ce1104627ebff02e0414e7d2e48595f94de7ce3b0e8e2`.
  `python3 /tmp/durisweb-image-quality.py backend` expands to
  `pnpm --dir backend format:check`, `lint`, `type-check`, `verify:mud-writes`
  (**53 classified**), `schema:check` (**77 tables / 85 historical sources**),
  and `build`, all pass on final source. `./scripts/check-config-literals.sh`,
  `python3 /tmp/durisweb-check-privacy-doc.py` and `git diff --check` pass.
  Frontend gates/browser, native baseline replay, image/privacy/preview opt-ins,
  provider, production and physical-device checks were not rerun for this
  backend prerequisite. No shared environment, real backup, provider, MUD or
  global logout was operated. No Website Changelog entry is published before
  an authorized verified release; include these preservation checks in the
  already planned security/privacy release news.
- **Publication:** code/proof commit `de23f0ba0c5e72a9fbdf8bada198ebaa7f7fa93a`
  is pushed in non-draft [PR #58](https://github.com/LuminariMUD/DurisWeb/pull/58)
  on `branch/backup-action-acknowledgement` (#57), and attached to this chat.
  Readback confirms the correct base/head, OPEN/MERGEABLE status, exact
  HEAD/remote/API SHA equality, ahead/behind `0 0`, clean worktree and whitespace.
  Hosted quality checks were running at first readback; the local evidence
  above is complete. `origin/master` remains
  `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and is an ancestor of this stack.
  This publication update changes documentation only; runtime tests are not
  repeated for it. No PR was merged and no release tag was created.
- **Immediate continuation:** restore the archive-barrier stash onto #58 and use `assertLifecycleMetadata`
  for all locked archive/journal/hold targets before repeating both engine
  matrices and the original hidden cross-schema regression. Inspect the other
  direct trigger-absence consumers in `webBaseline.ts` and `webSessionSchema.ts`
  as a separate prerequisite: their bootstrap/cutover authority must also be
  explicit before any approval or shared adoption. Do not silently expand this
  six-target runtime helper or make baseline bootstrap depend on itself.
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

- **P5 server-owned choice chunk:** `branch/privacy-choice-receipts` starts at
  #47 `ce3224b`. **Outcome:** versioned accept/refuse/withdraw receipts with
  same-origin CSRF actions, digest-only credentials, revision ordering, expiry,
  fail-closed direct collection and atomic minimized event/session writes.
  **Non-goals:** owner approval, live collection, a new database/service/secret,
  GeoIP enrichment, historical cleanup, full UI or P6/P7 completion. **Files:**
  policy/choice service, privacy route, shared tracking route, reserved-setting
  filters, isolated service/HTTP tests, API/inventory docs and this plan.
  **Proof:** real MySQL/MariaDB receipt/event/withdraw transactions, CAS races,
  stale/forged/expired policy/receipt denial, direct service calls, both tracking
  mounts, same-origin/CSRF guards, rollback/failure diagnostics, generic-setting
  exclusion, native owner/schema invariants and required backend gates.
- **P5 ablation decision:** reuse the existing InnoDB `web_settings` storage
  domain and a dedicated `privacy-choice-v1:` namespace, excluded from generic
  readers/writers just like hook receipts. A new table/migration or separate
  Redis revocation service is unnecessary. One bounded JSON receipt per browser
  choice contains no account/IP and only a credential digest, versions/revision,
  decision and database epochs. An existing necessary CSRF token binds first
  choices via a domain-separated HMAC; no pre-choice analytics identifier is
  created. Explicit actions issue/rotate an opaque HTTP-only receipt cookie.
  Row locks linearize collection and withdrawal, with optimistic revisions for
  competing actions. Optional visit nonces are accepted only behind a current
  receipt; only allowlisted route families enter atomic event/session writes.
  No enrichment/provider call, raw URL/title or account linkage is introduced.
- **Policy gate:** source-owned draft policy remains unapproved and collection
  disabled. No environment/admin shortcut may authorize it. Tests exercise an
  explicitly approved synthetic policy through module mocks and real database
  transactions; distinguish that qualification from the shipped disabled state.
  Approval, P6 retention readiness and full client/notice acceptance must all be
  resolved before a future source change can enable collection. The proposed
  preference lifetime is not treated as an approved retention rule.
- **P5 server proof:** the real private runner
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-p5-suite.mts 23436` passes the complete backend suite:
  **1,217 tests / 121 suites**. The same runner with `23437 privacy-only` passes
  **33 tests / 4 suites** on MariaDB 11.8.9, including all new native cases.
  It provisions a full-owner synthetic database, verifies 89 migrations and
  readiness before/after, uses private Redis, and removes only its own database/
  account afterward. Both owner fingerprints are unchanged (198 tables).
  Native privacy tests use independent `TEST_PRIVACY_DB_PORT`, exact database
  `durisweb_qualification_privacy_suite`, and dedicated loopback ports 23436/23437;
  a hook-only opt-in cannot accidentally activate this suite. The optional flag
  is documented in `backend/.env.test.example`. No shared target is accepted.
- **Covered behavior:** first and repeated choice revisions, explicit refusal /
  withdrawal / reacceptance, persisted digest-only credentials, no pre-choice
  row/identifier, expired/forged/obsolete/stale/invalid/oversized receipt denial,
  direct collection bypass attempts, both HTTP mounts, same-origin/CSRF and
  HTTP-only cookie behavior, unknown policy/disabled collection/retention gates,
  generic-settings namespace/collation exclusion, minimal canonical rows and
  atomic rollback, sanitized errors and an ambiguous preference commit that
  never issues a credential. Both in-flight orderings are demonstrated with
  real blocked database statements. Native test teardown closes its own Redis
  connection and drains transactions even if an assertion fails.
- **Verification repair:** initial race observation relied on InnoDB transaction
  snapshots that did not reliably represent a locking read, and an actual-auth
  import left a native test Redis connection open. MySQL now observes the
  identified wait edge through performance-schema; MariaDB observes its specific
  still-executing statement and server elapsed time while a barrier holds the
  conflicting transaction. The final assertions check the actual accepted or
  rejected event and retained row counts after release. No timing-only outcome
  assertion or transaction/SQL safeguard relaxation substitutes for that proof.
- **Notice binding repair:** a focused pre-fix check showed that a request without
  a notice version reached storage even when the notice had changed. Require
  exact notice **and** choice versions before storage. Evidence:
  `/tmp/durisweb-p5-notice-binding-before.log`. Final full/native runs above
  include the repaired contract. Native logs:
  `/tmp/durisweb-p5-receipts-full-backend.log`,
  `/tmp/durisweb-p5-receipts-maria.log`. The earlier MySQL focused qualification
  log `/tmp/durisweb-p5-receipts-mysql.log` predates the additional notice-binding
  test; use the final full run as current MySQL evidence.
- **Quality checks:** backend `format:check`, `lint`, `type-check`, `build`,
  `verify:mud-writes --mud-manifest
  /home/aiwithapex/projects/duris/migrations/migration_manifest.json` (53 writes),
  configuration-literal guard, lifecycle-inventory coverage and `git diff --check`
  pass. Changed TypeScript was formatted with backend Biome. No dependency,
  schema/migration, pool safeguard or MUD behavior changed. The frontend was
  unchanged; its existing 250-test/browser evidence is retained, without a fresh
  frontend/build/browser or full consent-flow claim. Public release news remains
  the prior paused-analytics draft until the client/notice and approved release
  exist; no new reader-visible feature is announced for this disabled server
  preparation. No production/shared migration/provider/deployment/tag operation.

- **Published server-owned choices:**
  [PR #48](https://github.com/LuminariMUD/DurisWeb/pull/48), open/non-draft at code
  head `56c94ae`, stacked on #47 `ce3224b`. Exact local, remote and PR heads
  match; clean worktree, ahead/behind `0 0` and committed whitespace verified.
  Keep review ancestry intact; no merge/tag/deployment is needed. One-time
  observer-repair script removed after committing its result; private fixture
  generators/runners and qualification logs remain outside Git.
- **Next P5 client contract:** start a dependent branch from this published head.
  Read `GET /api/privacy` as necessary preference state; unapproved/unavailable,
  unreadable, expired or mismatched versions always stop optional storage and
  requests. Render the accessible pre-login notice/preferences using the existing
  shell/brand/navigation. The copy needs owner review; do not call it approved.
  Bind explicit actions to both `noticeVersion` and `choiceVersion` plus revision.
  Stop locally and broadcast withdrawal before submitting it; surface unsaved
  writes without re-enabling from a failed response. Serialize competing actions
  across tabs, including first grants, and refresh state before explicit retries.
  Receipt cookies are opaque/shared; the client never reads or manufactures them.
  A visit nonce may exist only after acknowledged current acceptance; discard it
  and queued/in-flight work on withdrawal, unknown state or account transitions.
  Reset visit identity on login/logout without treating login as consent. Prove
  fresh/refused/accepted/withdrawn/reaccepted, cross-tab/storage-denied, delayed
  navigation, policy changes and network silence using synthetic browser cases.
  Backend gates remain false until approval, retention readiness and full client
  acceptance are actually satisfied. No source preparation closes #10 by itself.

- **P5 browser/notice chunk:** `branch/privacy-browser-choices` starts at #48
  `58c33a0`. **Outcome:** accessible pre-login privacy page and persistent desktop/
  mobile access, explicit accept/refuse/withdraw controls, validated versioned
  state, local/network silence before acknowledgement, cross-tab ordering,
  expiry/storage/network/account-transition handling and synthetic browser proof.
  **Non-goals:** policy approval, enabling server collection, legal completeness,
  provider transfers, retention/erasure execution, new dependencies or redesign.
  **Files:** privacy controller/content/view/control, existing shell/router/nav/
  startup/auth watcher, shared CSRF getter, focused tests, guide/guard and this plan.
  **Proof:** real rendered notice/control navigation at desktop/tablet/phone,
  keyboard/focus/layout checks; fresh/refused/accepted/withdrawn/reaccepted and
  delayed/in-flight/cross-tab/storage-denied/policy/failure/account cases; payload/
  identifier/timer/network assertions; required frontend and affected backend gates.
- **Browser ablation:** use Web Locks to serialize necessary preference reads and
  explicit writes; BroadcastChannel/storage events stop peers before withdrawal.
  Keep one local `off`/`accepted` safety preference, corroborated by the current
  server receipt. Failed writes keep the browser off. No persistent analytics
  identifier or title-delay timer is needed: a memory-only nonce and allowlisted
  router name suffice. Track only after successful navigation and confirmed
  acceptance; abort one active optional request and clear its nonce on stop.
  Missing safe synchronization/necessary storage means no optional collection;
  refusal/withdrawal can still attempt the authoritative server action.
  Notice/contact content is source-owned and explicitly draft until reviewed.
  The server's approval/collection/retention gates remain unchanged and false.
- **Client/source proof:** `pnpm --dir frontend test:unit --run` passes
  **274 tests / 55 files**. The focused privacy service/view/control/navigation
  command covers accepted/refused/withdrawn transitions, failed saves and cookie
  read-back, unsupported/denied storage and synchronization, obsolete/malformed/
  expired metadata, account changes, nonce reset, stale in-flight responses and
  idempotent coordinator cleanup and failed initial navigation. No grant/identifier is derived from login,
  local storage alone, or a POST acknowledgement whose cookie was rejected.
  Both equal-style choice buttons and saved/unsaved status announcements are
  exercised. Test fixture contract checks were moved into explicit test assertions
  (and strict mock responses) to satisfy the existing no-standalone-expect rule.
- **Rendered proof:** `node /tmp/durisweb-privacy-client-browser.mjs` qualifies
  the actual built frontend on `http://127.0.0.1:25474` with synthetic API replies,
  real HttpOnly cookie handling, native Web Locks and BroadcastChannel. Browser
  plugin not available; installed Playwright 1.63.0 is used. Twelve scenarios
  include desktop 1440×1000, tablet 800×1000 and phone 390×844; anonymous Browse/
  More navigation, page URL/title/content, no framework overlay or horizontal
  overflow, keyboard check/refuse/accept, refusal → accept → withdrawal → reaccept,
  private-route minimization/no referrer, refresh nonce changes, two-tab delayed
  first-choice serialization, actual optional-fetch abort on withdrawal, storage
  denial, missing synchronization, rejected cookies, failed withdrawal, obsolete
  notice and login/logout. Failed preference requests have inline errors, no
  general outage dialog and no replay. All denied/unknown cases send zero optional
  events; completed pre-withdrawal work is accurately distinguished from later work.
- **Browser evidence/limits:** log `/tmp/durisweb-privacy-client-browser.log`;
  screenshots `/tmp/durisweb-privacy-notice-{1440,800,390}.png`, visually inspected.
  Expected anonymous-auth 401, the existing Vue Router deprecation, the deliberate
  failed-choice 503 and Chromium's local service-worker preload-hint mismatch
  warning are classified separately; no unexpected app/page errors remain.
  Modules render correctly despite the unused preload hint; no unrelated PWA
  redesign is included. This is synthetic browser evidence with simulated policy
  approval, not live provider, physical-device, real approved-policy or production
  acceptance. Backend source is unchanged from #48's 1,217/full and 33/native
  qualification; that proof is retained, not claimed as a fresh backend run here.
- **Public copy and guards:** the page calls the notice draft and exposes the
  supplied privacy contact, categories, separate security/optional purposes,
  provider uncertainty, retention/request limits and human-review contact. It
  describes what statistics store, without promising to suppress ordinary HTTP
  transport information. The existing exact contact-line exception is extended
  only to the source-owned email declaration; shell syntax/current guard and
  `/tmp/durisweb-check-privacy-client-guard.py` prove other deployment literals,
  including text appended to that declaration, still fail. The lifecycle guide
  distinguishes the proposed server receipt lifetime from the browser safety bit.
  No approval, compliance or all-copies erasure claim is made.
- **Client quality commands:** frontend `format:check`, `lint`, `type-check`,
  `config:check`, `build`, palette guard, configuration literal guard,
  lifecycle-inventory coverage and `git diff --check` pass. Builds use explicit
  synthetic public loopback values from `/tmp/durisweb-p5-frontend-env.sh`, not an
  env file. Logs: `/tmp/durisweb-privacy-client-full-unit.log`,
  `/tmp/durisweb-privacy-client-final-focused.log`,
  `/tmp/durisweb-privacy-client-build.log`. No dependency, backend runtime, schema,
  migration, shared database or MUD operation changed. No production, deployment,
  tag or public news operation occurred.
- **Privacy release draft:** after future authorized live verification, reconcile
  Website Changelog entries and publish **Privacy information is easier to find**:
  “Read current privacy information and contact details from Browse or More.
  Optional visit statistics remain paused while privacy work continues.” Do not
  announce an approved notice, active optional collection or completed subject
  erasure. Keep the approval/retention gates false until their own proof exists.

- **Published browser choices:**
  [PR #49](https://github.com/LuminariMUD/DurisWeb/pull/49), open/non-draft at code
  head `9b8dcb3`, stacked on #48 `58c33a0`. Exact local, remote and PR heads
  match; clean worktree, ahead/behind `0 0` and committed whitespace verified.
  Final checks include the cookie read-back, keyboard accept/refuse, actual
  in-flight fetch abort and startup-readiness failure guard. No merge/tag/live
  operation is needed. Local preview is stopped after qualification; screenshots,
  browser/native logs and reproducible private runners remain outside Git.
- **Next continuation:** use `/tmp/durisweb-security-privacy-plan-20261016`,
  branch `branch/privacy-browser-choices`, and start a new dependent branch from
  its published head. First repair the already identified post-image/R2 deletion
  recovery gap as a separate focused change: a failed/disabled object deletion
  must retain the database retry identity, for both user orphan deletion and
  hourly cleanup. Inspect handlers/callers and reuse current feature gates; do
  not contact providers or delete live data. Then implement P6 bounded dry-run /
  approved-rule/hold/restore controls and P7 verified request/export/erasure
  tracking. The full lifecycle inventory and proposed decisions are in the
  permanent guide. All unapproved classes remain excluded from destructive
  execution; pending/invalid audit/delivery and protected imports stay retained.
  Ask only when a consequential missing decision actually blocks further work,
  with the concrete source/policy proposal ready to review and plain wording.
  P5 public/provider/period approval and P8 live release remain open; do not
  mistake isolated synthetic acceptance for those approvals.

- **Image-removal recovery prerequisite:** `branch/post-image-deletion-recovery`
  starts at #49 `7f07bc9`. **Outcome:** confirmed origin-object deletion precedes
  removal of its retry row; disabled/failing/unacknowledged storage keeps that
  row, durable deletion intent prevents reuse after uncertain provider outcomes,
  and batch counts/UI report only confirmed removals. **Non-goals:** general P6/P7
  jobs, approved retention periods, a new queue/table/service, upload-format or
  content-policy changes, provider/CDN-wide erasure, or live operations. **Files:**
  one nullable removal-intent column/index with reversible guarded migration/contract,
  image deletion/linking and atomic forum publication, HTTP handlers, bulk consumer,
  focused native/HTTP/component tests, API/lifecycle docs and this plan.
  **Proof:** pre-fix provider failure/disabled regressions; real MySQL/MariaDB
  retry/rollback/concurrent-link cases with a fake provider; partial batch/route/
  UI counts and safe diagnostics; bounded cleanup/timeout behavior; both packages'
  required gates and a focused stacked PR. No actual provider is contacted.
- **Image ablation:** reuse `forum_post_images` as the durable retry reference
  and the existing hourly job. A new worker/table/state framework is unnecessary.
  One removal helper serves the API and cleanup, commits intent before the
  provider request and deletes metadata only after its documented acknowledgement.
  A connection-scoped lease prevents duplicate workers without holding a database
  transaction across the network. Link/delete decisions use the same image row
  lock; publishers link in their own transaction before committing content. Bounded
  batches and an in-process cursor prevent retained failures from causing an
  unbounded cleanup loop or permanently hiding later eligible rows; this is not
  the future general retention engine. Keep the existing one-hour orphan age.
  Bulk replies distinguish confirmed deletions from unconfirmed attempts; the
  present carousel consumer must show that partial result and refresh its count.
- **Evidence-driven scope correction:** the initial lock-only repair passed
  disabled/failure acknowledgement cases, but cannot prevent reuse after a
  timed-out external request or process crash. The current publisher also links
  images after commit without awaiting the result; edits never link new images.
  Both are concrete paths to cleanup deleting published media. Use the explicit
  nullable `removal_requested_at_epoch` field, not an overloaded boolean/timestamp
  or a generic task framework. Pending images remain unattachable until deletion
  is confirmed. Create/edit publication must atomically validate/link managed
  images, roll back on pending-removal conflicts, and keep other notification
  work outside the transaction. Untracked external image URLs retain their
  existing content semantics. The bulk UI drops only confirmed/unavailable
  managed previews while retaining the durable retry record for failed removal.
  Claiming intent also clears `is_orphan`, so older link/cleanup predicates cannot
  adopt or discard the pending row. New status/cleanup paths explicitly include
  marked rows; unmarked old non-orphans remain excluded. Already completed URL
  removal does not add a new existence guarantee for arbitrary external HTML.
- **Image source qualification:** the pre-fix regression run failed 12 cases,
  demonstrating discarded retry references, unconfirmed provider results and
  false cleanup counts. The final real-database fixtures pass on MySQL 8.0.46
  and MariaDB 11.8.9: 14 native transaction/HTTP/migration cases plus 13 narrow
  deletion/parser cases. They cover disabled/failing/timeout/uncertain storage,
  failure after provider acknowledgement, retry after process restart, all four
  atomic create/edit paths, concurrent publisher/remover ordering, connection
  lease refusal/release, partial bulk/status/CSRF/409 behavior, bounded fair
  cleanup and guarded down/exact lost-DDL-ack recovery. Both final dependency
  preflights accept 90 migrations; all 198 copied owner tables retain their
  original fingerprints. No provider is contacted.
  HTTP cases mount the real forum router and CSRF middleware with a typed
  synthetic authenticated identity; unchanged JWT/session authentication is
  covered by P3 and the full suite, not re-created by this image fixture.
- **Image exact verification commands:** with the dedicated synthetic fixture,
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-image-suite.mts 23436` provisions the full published owner
  schema, website baseline and forwards, runs configuration/dependency preflight
  and `pnpm --dir backend test --runInBand`, then rechecks readiness/ownership
  and removes only its own database/user. **1,234 tests / 123 suites pass**;
  ten unchanged P5 receipt native cases are deliberately not repeated (their
  two-engine proof is recorded above), and no shared/live database is used.
  The same runner with `23437 image-only` runs
  `pnpm --dir backend test --runInBand
  src/services/__tests__/postImageDeletion.test.ts
  src/services/__tests__/postImageRemovalNative.test.ts`: **27 tests / 2 suites
  pass**. Logs: `/tmp/durisweb-image-full-mysql.log` and
  `/tmp/durisweb-image-removal-maria.log`.
- **Image package/browser gates:** both packages' `format:check`, `lint`,
  `type-check` and `build` pass; backend `verify:mud-writes` (53 classified
  writes), `schema:check`, frontend `config:check`, palette guard, configuration
  literal guard and `git diff --check` pass. The new migration additionally
  passes `pnpm --dir backend exec tsc --ignoreConfig --noEmit --strict
  --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext
  --esModuleInterop migrations/20261017003000_post_image_removal_intent.ts`.
  `pnpm --dir frontend test:unit --run` passes **283 tests / 57 files**, including
  three mounted editor and six API-result cases. Installed Playwright Chromium
  (browser plugin unavailable) renders the real Tiptap carousel: four checks
  pass at 1440px/390px for partial retry, successful retry and whole-request
  failure, safe feedback, preserved linked previews and no horizontal overflow
  or page errors. Screenshots were inspected; the temporary harness was removed.
  Logs/runners remain outside the checkout at `/tmp/durisweb-image-*`.
  Initial frontend config/dev checks correctly refused absent local settings;
  explicit loopback fixture settings fixed the harness. Standalone TS6 needed
  `--ignoreConfig`; its corrected check passed. An initial Maria fixture run
  found accidentally nested test declarations; the declarations were repaired
  and all 27 cases rerun successfully. No application gate was bypassed.
- **Image lifecycle/news boundary:** permanent API, schema/recovery, deployment,
  development and exact 77-table lifecycle inventory now describe the intent
  and partial acknowledgement. Future verified-live Website Changelog draft:
  **Image removal retries are clearer** — “Image removals that cannot finish
  remain available to retry. The forum editor now shows pending removals and
  keeps drafts from reusing images already awaiting removal.” Reconcile and
  publish only after authorized live acceptance. No CDN/backup-wide erasure,
  approved retention, general P6/P7 completion, merge, tag or release is claimed.
- **Published image recovery:** [PR #50](https://github.com/LuminariMUD/DurisWeb/pull/50),
  open/non-draft, code head `2596039cea900a6de83e58f05fc6402dd6ca0818`,
  stacked on #49 `7f07bc9`. The code push was read back: local/remote/API head
  matched, ahead/behind `0 0`, and the worktree was clean. The follow-up plan
  closeout is documentation only. Latest fetched master remains `8946860`;
  #49 is unchanged and open. Keep this PR ready for review; do not merge,
  tag, deploy or use shared databases. The existing named P3 recovery stash
  and unrelated original-checkout work remain preserved.
- **Next continuation after #50:** continue in the isolated worktree
  `/tmp/durisweb-security-privacy-plan-20261016` from the published image branch.
  Re-read P6/P7 and the permanent lifecycle inventory, choose a bounded next
  engineering chunk with ablation and start a dependent branch. P6 default
  dry-run, explicit policy/target, holds and protected restore handling remain
  unimplemented. Do not invent approved periods or allow destructive execution
  for unapproved classes. Image recovery supplies a prerequisite only; owner
  policy/provider/period decisions, complete P5 acceptance and all P8 live
  release steps remain open. Ask only when a necessary consequential decision
  actually blocks further independent work.

- **Current P6a: read-only retention preview**, branch
  `branch/retention-readonly-preview`, starts at #50 `45b6387`.
  **Outcome:** an explicit-target/version CLI previews the inventory's proposed
  30-day raw analytics-event and 90-day login-history cutoffs in bounded,
  deterministic pages, can continue from a private checkpoint, and prints only
  aggregate counts. Every result remains an unapproved age candidate, never an
  assertion of deletability. **Non-goals:** destructive execution, invented
  periods, holds/mutation/restore acceptance, a scheduler, new database tables,
  provider calls or MUD operations. Those P6/P7 requirements remain open and
  follow in dependent chunks. **Files:** fixed draft policy, preview service and
  CLI/package command, focused unit/native tests, permanent operator/lifecycle
  guidance and this plan. **Proof:** real MySQL/MariaDB CLI, before/exact/after
  cutoff and offset cases, bounded continuation/restart, read-only credentials
  and transaction proof, high-water/exclusion/query-plan checks, malformed input/
  checkpoint and safe failure tests, plus required backend gates and a PR.
- **P6a ablation:** use existing timestamp indexes and primary IDs, a dedicated
  read-only connection/transaction and an optional private checkpoint file.
  No new queue, schema, generic table inference, policy override or mutation
  branch is needed to review proposed counts. Existing source-owned metadata
  checks establish exact table/time/index shapes before scanning. The metrics
  table's legacy naive `recorded_at DATETIME` has no proven UTC provenance;
  exclude it rather than inventing conversion. Session physical-row delay,
  visitor relationships, audit/choice/delivery evidence, held/request/protected
  content, external copies and every unlisted class remain explicitly excluded.
  Checkpoints fix policy/rule signature, target, cutoff and ID high water, and
  contain no account, IP, URL, credential or row payload. A resumed preview has
  a new read snapshot and is observational across concurrent changes; it can
  never authorize a later deletion. No owner question is necessary for this
  non-destructive engineering chunk.
- **P6a implementation/proof:** the CLI defaults to a read-only preview and
  refuses execution, unknown/protected classes, target/version mismatch and bad
  limits before connecting. A fresh owned connection starts a repeatable-read,
  consistent read-only transaction; the database supplies a fixed epoch and
  per-class ID high water. Exact selected-table metadata is verified, only
  cursor IDs/epochs are selected, and 5-second SQL timeouts plus a default
  2-second monotonic scan budget bound pages. Optional new-only 0600 private
  checkpoints support restart without printing cursors; they reject shared/
  linked/oversized/invalid files and rule/target/clock mismatches. Reports say
  `policyApproved: false`, `executionAvailable: false` and
  `eligibilityChecks: not_evaluated`; held/exception records may appear among
  age candidates, so these counts must never authorize deletion.
- **P6a exact verification commands:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-retention-suite.mts 23436` provisions the full owner fixture,
  website baseline/90 migrations and isolated cache, runs
  `pnpm --dir backend test --runInBand`, then rechecks readiness and owner
  fingerprints and removes only its created database/user. **1,233 tests /
  124 suites pass**; 24 opt-in cases are deliberately skipped (14 image native
  cases retain #50's two-engine proof; ten privacy native cases retain P5's
  proof). The new retention cases run, not skip. Final focused runs with
  `23436 retention-only` and `23437 retention-only` invoke
  `pnpm --dir backend test --runInBand
  src/services/__tests__/retentionPreview.test.ts
  src/services/__tests__/retentionPreviewNative.test.ts`: **13 tests / 2 suites
  pass on each engine**. Eight unit and five native cases cover cutoff -1/0/+1,
  epoch 1/unknown time, +00/+03/-07 offsets, exact BIGINT paging, multi-process
  continuation/high-water exclusion, two synthetic subjects, preserved rows,
  malformed input/state/files, scan budget and safe failure. The actual CLI
  works with SELECT on only the two preview tables. EXPLAIN over 1,000 rows per
  class proves both existing time indexes and no filesort; no new index or
  schema is needed. All 198 copied owner-table fingerprints remain unchanged.
- **P6a gates/evidence:** backend `format:check`, `lint`, `type-check`,
  `verify:mud-writes` (53 writes), `schema:check`, `build`, configuration/
  dependency preflight, `./scripts/check-config-literals.sh`, lifecycle inventory
  and `git diff --check` pass. `pnpm --dir backend retention:preview --help`
  passes without opening dependencies. After extending both scale-index cases,
  focused two-engine suites and backend format/lint/type checks pass again;
  unchanged unrelated full-suite checks and build results are reused. Logs:
  `/tmp/durisweb-retention-full-mysql.log`,
  `/tmp/durisweb-retention-mysql.log`, `/tmp/durisweb-retention-maria.log`,
  `/tmp/durisweb-retention-backend-gates.log`; runner and diagnostic probes stay
  outside Git. No frontend/browser, live/provider or MUD runtime operation was
  run for this backend CLI chunk. No dependency, runtime setting or migration
  was added. No Website Changelog entry is needed: this is an operator-only
  read tool; it changes no visitor feature or deployed retention behavior.
- **P6a issues found/resolved:** initial native tests rejected schema metadata
  because global large-number string options changed information-schema numeric
  fields. Use explicit `CAST(id AS CHAR) AS cursor_id` only on selected IDs;
  retain normal metadata representation and unchanged strict fingerprints.
  MariaDB then exposed `FROM_UNIXTIME(0) = NULL`, producing false empty counts;
  use epoch 1 and an ID-zero initial cursor, including valid epoch-1 rows.
  Both defects are reproduced by private disposable probes and covered by the
  final two-engine cases. No schema guard was weakened. Operator/lifecycle/
  security guides record proposed counts, private indirectly linkable cursor
  evidence, unresolved retention and the absence of destructive execution.
- **Published P6a:** [PR #51](https://github.com/LuminariMUD/DurisWeb/pull/51),
  open/non-draft, code head `b695f432cd58eca338bd3f51a20898acb8158eb4`,
  stacked on #50 `45b6387`. The published code was read back: local, remote
  and API heads match, ahead/behind `0 0`, worktree clean. This final plan
  closeout is documentation only. Hosted checks were queued/running at creation;
  local source/native gates above pass. #50's hosted backend/frontend checks
  now pass, and its source head is unchanged. Latest fetched master remains
  `8946860`. No merge, tag, shared migration, deployment or provider operation
  is justified. Original-checkout work and the named P3 stash remain preserved.
- **Next continuation after #51:** use the same isolated worktree from this
  published branch. Trace existing operator permission/identity and the exact
  account/class selectors before the P6 hold primitive. Implement restricted,
  durable hold scope/reason/approver/review/expiry plus tests and a required
  forward schema contract, then the gated mutation/continuation/ownership and
  restore handling. A preview is observational and must not become a deletion
  authorization. Recheck holds/eligibility in any later mutation transaction;
  pending/invalid delivery or audit evidence and protected imports remain
  excluded. Do not invent approved periods or enable a scheduler. Full P6,
  P7, P5 approval/provider readiness and P8 live release still remain open.
  Continue independent engineering without a new owner question unless a
  consequential necessary decision actually blocks that work.

- **Current P6b: durable hold records**, branch
  `branch/privacy-data-hold-records`, starts at #51 `3bd3b2c`.
  **Outcome:** Overlord-only, no-store/CSRF-protected API records explicit
  global/class/account/account-class hold scope, immutable creation reason and
  approver, database UTC creation/review/optional expiry, and an attributed
  explicit release without deleting history. Create retries reuse a caller UUID
  and conflicting reuse refuses; expiry changes observed status, not the row.
  The API explicitly reports `enforcementReady: false`. **Non-goals:** a new
  permission framework, UI, general deletion engine, automatic pruning,
  invented policy periods, current feature-cleanup interception or live
  operations. Holds must be consumed/rechecked by the later mutation/restore
  engine before P6 acceptance or live protection is claimed. **Files:** one
  website-owned table with reversible guarded migration/forward contract and
  exact interrupted-DDL recovery; hold service/router/server mount, focused
  unit/native/HTTP tests, permanent lifecycle/operator/API docs and this plan.
  **Proof:** two-engine actual migration/up/down/lost-ack refusal, durable
  create/release/idempotency and failure preservation, scope/date validation,
  real auth/Overlord/CSRF routing, bounded listing, safe diagnostics and required
  backend gates, followed by a focused stacked PR.
- **P6b ablation:** reuse `requireAuth`/`requireOverlord` and the current CSRF
  boundary. No new permission seed/grants or delegated authority is needed.
  Use one explicit hold table: `web_settings` has a 100-character key and a
  generic settings purpose; scoped hold queries, private reasons, lifecycle
  history and expiry need their own typed store. Preserve creation/release
  attribution in that row rather than adding an outbox or event framework.
  Class scopes initially name the two explicit preview classes; unknown classes
  refuse until a reviewed handler extends the registry. Global/account intent
  is recorded for the eventual website lifecycle engine, with enforcement
  unavailable and existing feature cleanup unchanged at this checkpoint.
  Add no unused concurrency adapter now: mutation/hold serialization and
  read-only preview integration follow with their real consumers in P6c.
- **P6b final implementation/proof:** one new `web_data_holds` table extends
  the immutable 77-table baseline to 78 application tables, with no MUD foreign
  key, permission seed or new dependency. Protected no-store routes reuse real
  signed-session authentication, Overlord and CSRF checks. Create/release record
  authenticated actors in the same transaction as the intent/outcome; exact UUID
  retries preserve history, conflicting scope/reason/actor/date or release
  identities refuse. Expiry/review status uses the database clock; expired,
  released and invalid evidence remains stored. Listing is keyset-paged 1–100,
  with an explicit unreleased-index scan over closed history. Every authorized
  reply warns `enforcementReady: false`; no deletion/cleanup/preview/restore
  consumer is claimed at this stage.
- **P6b exact checks:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-hold-suite.mts 23436` provisions the pinned full owner,
  website baseline/91 migrations and isolated cache, runs
  `pnpm --dir backend test --runInBand`, then rechecks dependency readiness and
  owner fingerprints and drops only its created database/user. **1,243 tests /
  125 suites pass**; 29 unchanged opt-in cases are skipped (14 image, ten privacy
  and five preview native cases retain their prior two-engine proof). The seven
  new hold native cases run. With `23437 holds-only` the runner invokes
  `pnpm --dir backend test --runInBand
  src/services/__tests__/dataHoldService.test.ts
  src/services/__tests__/dataHoldNative.test.ts`: **15 tests / 2 suites pass**.
  Eight unit and seven native cases cover all scopes, review/expiry/UTC offsets,
  twenty competing-create pairs, release conflicts, missing/forged/revoked
  credentials, non-Overlord denial despite other admin grants, CSRF, malformed
  bodies/cursors, retained invalid rows, SQL/log sentinels, actual lost commit
  acknowledgements, 1,000 closed + 120 pending rows, captured actual query plans,
  guarded down, lost-DDL-ack recovery, normal-preflight refusal during that gap
  and unknown schema drift. Only the separate MUD account/role readers are
  fixture stubs; JWT/session storage, middleware, router and hold SQL are real.
- **P6b gates/evidence:** backend `format:check`, `lint`, `type-check`,
  `verify:mud-writes` (53 classified writes), `schema:check`, `build` and both
  configuration/dependency preflights pass. The new wrapper passes
  `pnpm --dir backend exec tsc --ignoreConfig --noEmit --strict --skipLibCheck
  --target ES2022 --module NodeNext --moduleResolution NodeNext
  --esModuleInterop migrations/20261017004000_web_data_holds.ts`.
  Configuration literal, exact baseline inventory/local-reference and whitespace
  guards pass; the inventory separately describes the additional hold table.
  Evidence: `/tmp/durisweb-holds-full-mysql.log`,
  `/tmp/durisweb-holds-maria.log`, `/tmp/durisweb-holds-backend-gates.log` and
  `/tmp/durisweb-run-hold-suite.mts`. All 198 copied owner-table fingerprints
  are unchanged. No frontend/browser rerun is needed for this backend-only API;
  no UI or visitor feature changed. No Website Changelog entry is needed until
  an actual visible/released capability exists. No live/shared database,
  provider, MUD process/file, migration or deployment operation was performed.
- **P6b defects resolved before publication:** MariaDB's enabled snapshot
  isolation reproduced `ER_CHECKREAD` in all twenty controlled competing-insert
  pairs after an initial consistent read. Creation now uses a metadata-lock-only
  empty locking read and an insert-first database date predicate, then reads
  the winning row for update. An exact expired replay still resolves its stored
  intent. The controlled probe and twenty native pairs pass without adding a
  retry loop or weakening isolation. MySQL rewrote CHECK literal charsets after
  ALTER; explicit ASCII literals in this new, unapplied hold DDL keep exact
  before/after metadata stable on both engines. Profiles were re-derived; no
  existing migration or generic schema normalization changed. MySQL could also
  choose a primary history scan; the actual unreleased path now explicitly
  uses its declared index, verified by captured-query EXPLAIN. A Winston/Jest
  overload assertion was corrected without weakening its log-sentinel check.
  Private probes `/tmp/durisweb-hold-concurrency-probe.mts` and
  `/tmp/durisweb-hold-drift-probe.mts` retain the reproductions outside Git.
- **Published P6b:** [PR #52](https://github.com/LuminariMUD/DurisWeb/pull/52),
  open/non-draft, code head `8751e6f2506760d3c733fce5ceeb3ba1765684ad`,
  stacked on #51 `3bd3b2c`. The code push was read back: local/remote/API head
  matched, ahead/behind `0 0`, and the worktree was clean. This final plan
  closeout is documentation only. Hosted checks are queued/running at creation;
  #51's backend/frontend hosted checks pass and its head is unchanged. Master
  remains `8946860` at the latest refresh. No merge/tag/live operation is
  warranted. Preserve the original checkout's independent work and the named
  P3 recovery stash.
- **Next continuation after #52:** continue from this published branch in
  `/tmp/durisweb-security-privacy-plan-20261016`. P6c must connect holds to real
  consumers: preview eligibility reporting/checkpoint invalidation, serialized
  hold creation/release versus SQL mutation, and eligibility/hold rechecks at
  commit. Introduce coordination only alongside those consumers and prove a hold
  acquired after dry-run blocks mutation. Implement the explicitly gated
  per-class mutation/continuation/ownership and restore/copy handling from P6;
  unknown/unapproved classes and pending/invalid delivery/audit/request evidence
  remain excluded. The current hold API still reports enforcement unavailable;
  existing image/feature cleanup and restore need integration before that claim
  changes. Retention/notice/provider approvals, P7 verified export/erasure and P8
  live-release acceptance remain open. No new owner question is needed for
  independent engineering; do not infer approval of periods or destructive
  operation from the supplied contact details.

- **Current P6c1: hold-aware read-only preview**, branch
  `branch/retention-hold-aware-preview`, starts at #52 `8ed66d1`.
  **Outcome:** the existing explicit-target/version preview reports held and
  unheld age counts using global/class/account/account-class holds in the same
  read-only snapshot; a private continuation refuses changed active protection,
  expired hold state or old checkpoint format. Unknown/malformed/unreadable or
  excessive unreleased hold state fails closed before reporting counts.
  **Non-goals:** deletion, mutation/hold serialization, new schema/dependencies,
  policy approval, cache invalidation or restore acceptance. Those remain
  required P6c2/P6d work; execution stays unavailable. **Files:** shared pure hold
  parsing/snapshot reader, existing preview/CLI/checkpoint and focused tests,
  permanent runbooks/lifecycle/API guidance and this plan. **Proof:** same-snapshot
  global/class/account/collation/null/expiry behavior, changed-hold resume refusal,
  malformed/unreadable/over-limit protection, SELECT-only actual CLI and unchanged
  records on MySQL/MariaDB, existing pagination/offset regressions, backend gates
  and a focused stacked PR.
- **P6c1 ablation:** reuse the existing snapshot and keyset scan, and the hold
  table's released/ID index. Share the existing validated hold parser without
  importing the pooled/MUD connection layer into the standalone preview.
  Correlated SQL evaluates account holds with the established database collation;
  no account/IP/content field from candidate tables enters application output.
  Bind private continuation to a fingerprint of active protection so earlier
  counts cannot silently survive a new/released/expired hold. Keep age counts
  distinct from deletion eligibility; other exceptions/requests are not yet
  evaluated. Add no unused lock/lease/execution abstraction: the actual SQL
  mutation consumer and Redis analytics-cache handling follow in their own PR.
- **P6c1 proof:** the preview checks exact metadata for its two candidate tables
  and `web_data_holds`, validates at most 1,000 unreleased records in the same
  read-only connection, and counts active global/class/account/account-class
  protection through SQL. Candidate account fields stay inside SQL; database
  case/accent collation and null-account behavior are covered. Reports expose
  age/held/unheld totals and aggregate hold observation time/count, with
  `eligibilityChecks: holds_only` and execution unavailable. Private version-2
  checkpoints bind counters to active-protection fingerprints; version 1,
  changed/released/expired active protection and malformed/unreadable/over-limit
  state refuse continuation. Other exceptions and requests remain unevaluated;
  no result authorizes deletion. The shared pure parser preserves the hold API
  without opening a pool or MUD/Redis connection in the standalone preview.
- **P6c1 exact verification:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-retention-suite.mts 23436` runs
  `pnpm --dir backend test --runInBand` on the full pinned owner/baseline/forward
  fixture: **1,249 tests / 125 suites pass**. Its 31 opt-in skips are 14 image,
  ten privacy and seven hold native cases. The seven hold cases were freshly
  rerun below; unchanged image/privacy native proofs are retained above. With
  `23437 retention-only`, the same runner executes
  `pnpm --dir backend test --runInBand
  src/services/__tests__/retentionPreview.test.ts
  src/services/__tests__/retentionPreviewNative.test.ts`: **21 tests / 2 suites
  pass** (12 unit, nine native). The MySQL focused run also passes all 21.
  Both engines cover all scopes, collated aliases, null-account/global/class
  behavior, exact expiry, a committed hold between validation and candidate
  scanning, resume invalidation, private SELECT-only CLI restart, unreadable/
  invalid/excessive protection, old cutoff/offset/big-ID/pagination regressions
  and captured timestamp/hold-index query plans over 1,000 rows per class.
- **P6c1 parser/API regression proof:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-hold-suite.mts 23436 holds-only` and the same command with
  `23437 holds-only` run
  `pnpm --dir backend test --runInBand
  src/services/__tests__/dataHoldService.test.ts
  src/services/__tests__/dataHoldNative.test.ts`: **15 tests / 2 suites pass on
  each engine** after extraction. Actual signed-session/Overlord/CSRF and hold
  SQL/recovery behavior is preserved. No MUD reader/process/file operation ran;
  only the separate account/role readers are fixtures. All 198 owner table
  fingerprints and the 91-migration readiness contract remain unchanged.
- **P6c1 gates/evidence:** backend `format:check`, `lint`, `type-check`,
  `verify:mud-writes` (53), `schema:check`, `build`, both dependency/configuration
  preflights, configuration-literal/inventory/reference and whitespace guards
  pass. `pnpm --dir backend retention:preview --help` passes without dependency
  connections. Logs: `/tmp/durisweb-hold-preview-full-mysql.log`,
  `/tmp/durisweb-hold-preview-mysql.log`, `/tmp/durisweb-hold-preview-maria.log`,
  `/tmp/durisweb-hold-preview-gates.log`, `/tmp/durisweb-hold-parser-mysql.log`
  and `/tmp/durisweb-hold-parser-maria.log`. New modules/tests have no dependency,
  migration or runtime setting. No frontend/browser rerun or Website Changelog
  entry is needed for this operator-only read enhancement. No live/shared
  database, provider, deployment, tag or merge operation was performed.
- **P6c1 issues resolved:** native assertions were corrected for the root
  driver's string COUNT, both class results and the new hold-index query in
  EXPLAIN capture. The strict null protection-flag case now refuses unverified
  state. The shared pure parser extraction initially left one mapper reference;
  type checking caught and corrected it. MariaDB 11.8.9 table-only SELECT hid
  CHECK clauses; a disposable two-engine probe established that database-level
  `SHOW VIEW` exposes the required metadata without data writes. The MariaDB
  fixture adds only that metadata privilege while selecting data from three
  tables. The CLI grants nothing; no schema fingerprint, safety check or source
  privilege requirement was bypassed. Private reproduction:
  `/tmp/durisweb-hold-reader-metadata-probe.mts`. Permanent guides now describe
  version-2 private evidence, hold-only observations and the remaining mutation/
  cache/request/restore work.
- **Published P6c1:** [PR #53](https://github.com/LuminariMUD/DurisWeb/pull/53),
  open/non-draft, code head `a843c6ae763c4e17ada79c70b8865f8632b9f901`,
  stacked on #52 `8ed66d1`. The published code was read back: local/remote/API
  heads match, ahead/behind `0 0`, worktree clean. This final closeout changes
  only the plan. Hosted checks were queued/running at creation; #52's hosted
  backend/frontend checks pass and its head is unchanged. Latest master remains
  `8946860`. No merge, tag, deployment or shared operation is justified.
- **Next continuation after #53:** continue from this branch in the isolated
  `/tmp/durisweb-security-privacy-plan-20261016` worktree. P6c2 must add the actual
  explicitly policy-gated SQL mutation consumer, durable run/cursor/count
  evidence and ownership/expiry, with hold creation/release serialized against
  each mutation and fresh eligibility/hold checks at commit. Keep approved=false
  in prepared source; no CLI/environment/body shortcut can approve destruction.
  Use only explicit reviewed class handlers and preserve all unknown/held/
  pending/protected classes. Read current `webAnalyticsService.ts`: historical
  analytics reads cache `web_analytics:*` for five minutes. Deletion acceptance
  needs cache fencing/invalidation with failure recovery and the concurrent
  reader/write race addressed; TTL alone is not proof. Then finish restore/copy
  handling and P7 verified requests/export/erasure. Global hold API enforcement
  remains unavailable until the real relevant deletion/cleanup/restore paths
  consume it. P0/P5 policy/provider/period and P8 live gates remain open. Continue
  independent engineering; ask only for a necessary consequential decision.

- **Current P6c2: gated SQL retention**, branch
  `branch/retention-sql-enforcement`, starts at #53 `8c23534`.
  **Outcome:** explicit-target/version/run-ID execution for the two reviewed
  SQL classes, gated by immutable source approval/enablement and per-class
  approval; durable UTC/high-water/cursor/count evidence, expiring worker
  ownership and transaction-time hold/eligibility rechecks. Hold writes share
  the same short transaction control lock, so acknowledged protection orders
  before deletion. Historical analytics reads stop using Redis caches, and a
  bounded restartable cleanup confirms old `web_analytics:*` copies removed
  before execution reports completion. Default preview remains read-only.
  **Non-goals:** approving any period, scheduler/live mutation, other store
  handlers, physical backups/restore replay, MUD/provider operations or P7.
  Source approval and execution remain false. **Files:** one run ledger with
  guarded migration/contract, a reserved existing settings control row, shared
  selectors, execution/CLI/cache cleanup and hold transaction integration,
  focused unit/native/HTTP evidence, permanent docs and this plan.
  **Proof:** both database engines plus isolated Redis, holds acquired after
  preview and concurrent hold ordering, exact cutoff/offset/restart/lease/unknown
  acknowledgement/rollback cases, safe counts and errors, cache failure/retry
  without stale repopulation, excluded/protected stores and required backend
  checks, then a focused stacked PR.
- **P6c2 ablation:** remove the optional eight-function analytics read cache
  rather than add generations, Redis fencing scripts or a second cache path.
  Old keys still require explicit bounded cleanup and durable pending state;
  TTL alone is not acceptance. Add one run table for transactional progress and
  use a reserved `web_settings` singleton for worker lease/control ordering;
  no separate worker/control table, queue, adapter framework or new config is
  needed. One current selector implementation serves preview and execution.
  Keep all unapproved/unknown classes, pending journal/request evidence and
  protected archives out of mutation. Restricted hold history remains retained.
- **P6c2 final source:** `pnpm --dir backend retention` defaults to read-only
  preview. Separate `execute` requires exact configured SQL **and Redis**
  targets, policy version, lowercase UUID v4 run identity and bounded class/
  batch/candidate/time inputs. The immutable shipped policy has global approval,
  enablement and both class approvals false, with no approval reference; it
  refuses before configuration/database/Redis I/O. There is no runtime override,
  scheduler or HTTP executor. Synthetic approval is confined to Jest fixtures;
  the real child CLI still refuses. Both classes use the existing age indexes
  and a shared literal allowlist; all other classes are excluded.
- **P6c2 durability and ordering:** one new `web_retention_runs` table records
  UTC cutoff/high-water/cursor, safe action counts, cumulative work duration and
  pending cache traversal atomically with each SQL batch. A reserved
  `retention-control-v1:state` settings row holds a 30-second expiring owner/run
  lease and orders hold create/release before later deletion. Dedicated
  READ COMMITTED transactions lock control, revalidate current holds and the
  actual DELETE predicate, and checkpoint only acknowledged affected rows.
  Expired workers cannot overwrite a successor. Unknown COMMIT acknowledgement
  remains retryable by the same run ID. Trigger/incoming-FK/schema drift refuses
  mutation; FK/strict/autocommit checks remain enabled. Normal preflight is
  ledger-strict; only exact adjacent migration DDL shapes recover lost acks.
  Down refuses any run history or non-default/leased/invalid control state.
- **P6c2 copy handling:** all eight analytics getters now read SQL directly,
  and both administrative router mounts are no-store before authentication.
  Bounded SCAN/DEL of only `web_analytics:*` is required before completion;
  failures remain durably pending, with a server-identity-bound cursor that
  restarts after Redis restart. Partial pages restart safely. Explicit target
  binding includes the configured cache endpoint/database/username/transport;
  a changed target cannot silently certify a different copy. All older cache
  writers must be stopped/drained before any future enabled execution. No
  other cache namespace, provider/CDN/browser/log/backup copy is certified.
- **P6c2 exact verification:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts 23436` provisions its own full-owner/
  baseline/92-migration database and empty-start owned Redis DB 13, runs actual
  migration/session/configuration/dependency probes, then
  `pnpm --dir backend test --runInBand`: **1,265 tests / 129 suites pass**,
  with **40 native cases skipped** (14 image, 10 privacy, seven hold, nine
  preview). Fresh hold/preview regressions below cover their skipped cases;
  image/privacy retain the earlier qualified evidence, not a fresh rerun.
  `/tmp/durisweb-run-execution-suite.mts 23436 execution-only` and the same
  command with `23437` each pass **15 tests / two suites**. Both use real
  MySQL 8.0.46 / MariaDB 11.8.9 and Redis 23479, isolated DBs 13/14. Their
  runner refuses a nonempty cache before claiming ownership and cleans only
  its own confirmed fixture. All dependencies/owner hashes pass again after
  the tests; no actual MUD row/file/process or provider was changed.
- **P6c2 regression commands:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-hold-suite.mts 23436 holds-only` and the same with `23437`
  each pass **15 tests / two suites**, including actual signed-session,
  Overlord/CSRF, hold storage/ordering and migration recovery. The corresponding
  `/tmp/durisweb-run-retention-suite.mts 23436 retention-only` and the same
  with `23437` each pass **21 tests / two suites**. No frontend source changed;
  no fresh frontend/browser,
  live data acceptance, provider or physical backup/restore test is claimed.
- **P6c2 gates/evidence:** `python3 /tmp/durisweb-image-quality.py backend`
  executes backend `format:check`, `lint`, `type-check`, `verify:mud-writes`
  (53 classified writes), `schema:check` and `build`; all pass. Frozen lockfile
  dependencies are reused. `./scripts/check-config-literals.sh`,
  `python3 /tmp/durisweb-check-privacy-doc.py` (exact immutable 77-table coverage,
  unique rows, local references and protected date) and `git diff --check`
  pass. Configuration/dependency preflight, actual forward migration and
  session write probes also pass inside each private fixture runner. Evidence:
  `/tmp/durisweb-execution-{mysql,maria}.log`,
  `/tmp/durisweb-execution-full-mysql.log`,
  `/tmp/durisweb-execution-{hold,preview}-regression-{mysql,maria}.log` and
  `/tmp/durisweb-execution-gates.log`. Keep these private runners/logs and the
  contract derivation script outside Git for reproduction.
- **P6c2 findings resolved:** require the explicit cache identity as well as
  SQL target; bind SCAN continuation to Redis server identity; preserve legacy
  cache keys containing raw interval control characters through safe Redis
  arguments; retain pending state on unconfirmed cleanup; accept an unchanged
  saved checkpoint only after exact read-back. Synthetic test setup was fixed
  for accidental nested cases and actual engine-specific control-lock wait
  observation, and paused workers are drained before fixture teardown. Final
  two-engine suites and the full backend pass with all runtime guards enabled.
- **P6c2 release news draft:** after a separately authorized and verified live
  release, reconcile [news-update](../../.agents/skills/news-update/SKILL.md)
  and publish: “Historical analytics now refresh directly from the database.”
  Do not announce active retention or complete erasure. No live changelog entry
  was written; this is prepared source awaiting review and release.
- **P6c2 remaining scope:** all periods, destructive approval and deployment
  remain unapproved. Full P6/P7 is open: existing feature cleanup and other
  per-class handlers, pending subject-request fences, physical/provider copies,
  the ledgers' own periods, protected backup/restore-removal replay and verified
  export/erasure. The hold API deliberately retains global
  `enforcementReady: false`. No merge, tag, release, shared migration or live
  operation occurred. Continue independent engineering; no owner question is
  currently necessary.
- **Published P6c2:** [PR #54](https://github.com/LuminariMUD/DurisWeb/pull/54),
  open/non-draft, code head `7ea3636bf6186af8d9ff6492baf681a598c5bf42`, base
  `branch/retention-hold-aware-preview` (#53 `8c23534`). Remote master remains
  `89468603a61ab44d9e3be1651c9dd6fce5a17a12` and is already an ancestor;
  #53's latest backend/frontend CI checks pass. Preserve the published stack;
  no history rewrite, merge or release tag is needed. Initial #54 read-back
  confirms OPEN/non-draft/MERGEABLE, matching local/remote/API code heads,
  ahead/behind `0 0` and a clean worktree. Hosted checks were queued/running;
  local proof above is complete. This documentation closeout is pushed as a
  normal follow-up commit and final head/cleanliness is reverified afterward.
- **Next-session entry after P6c2:** fetch and read #54 plus the current stack
  state before branching from its final published head. Continue in the
  isolated `/tmp/durisweb-security-privacy-plan-20261016` checkout; preserve
  original checkout changes, recovery stash `bbda289` and private fixture
  evidence. Apply ablation before the next implementation. Inspect the actual
  backup/restore and feature-cleanup consumers for P6d, then prepare the
  smallest source change that prevents unprotected exposure and preserves
  durable removal/hold evidence. Do not claim current SQL cleanup prevents
  restore resurrection. Keep required restore replay, additional eligible
  class handlers, own-ledger periods and P7 verified requests/export/erasure
  explicit; do not reduce the project to these two classes. Source flags stay
  false pending policy/period and operational approval. No actual backup
  deletion/restore, shared migration, production/MUD/provider operation or
  global logout is authorized. Continue independently; ask the owner only for
  a consequential decision that engineering cannot resolve.

- **Current P6d1: close legacy restore bypasses**, branch
  `branch/restore-lifecycle-boundary`, starts at #54 `56508c0`.
  **Outcome:** both stored/upload restore endpoints remain authenticated and
  permission checked, then refuse even if the old unsafe switch is true; direct
  service calls also refuse before archive/SQL/process work. Remove the obsolete
  asynchronous row-merge executor so no alternative service entry can launch
  it. Preserve backup creation, inspection/download, historical restore records
  and pure parsing compatibility. **Non-goals:** approving or implementing a
  MUD restore protocol, actual restore/deletion, complete backup policy, archive
  hold/expiry integration or restore-removal replay. Those remain P6d/P7 work.
  **Files:** shared static refusal reason/type, existing gate/service/router and
  unused progress wiring, focused regression tests, operator/API/privacy docs
  and this plan. **Proof:** real admin router with unsafe configuration enabled,
  direct service calls with SQL/file/process spies, existing backup/parsing and
  session-free snapshot coverage, full backend and required package gates;
  publish a focused PR stacked on #54.
- **P6d1 ablation:** remove the unsafe executable pipeline and its only progress
  producer rather than add another environment switch, readiness framework or
  incomplete archive-replay adapter. Keep one static refusal contract shared by
  HTTP and service callers. The historical override remains parseable for
  configuration compatibility but cannot open this source-disabled operation.
  A supported restore still needs independently protected current evidence,
  offline replay/verification and MUD ownership; do not represent closure as
  completed restore acceptance.
- **P6d1 final behavior:** `databaseRestore` always resolves closed without
  consulting configuration; the historical `ALLOW_UNSAFE_DATABASE_RESTORE`
  setting remains parseable for compatibility but cannot enable it. Both
  stored/uploaded admin POST routes retain authentication and
  `manage_mud_backup`, then return static `503 operation_gated` without an
  enabling instruction or echoed input. Both public service signatures remain
  compatible and throw `DatabaseRestoreUnavailableError` before invocation
  SQL, filesystem, archive or process work. The row-merge launcher, temporary
  SQL execution, restore record creation, action handlers and unused progress
  producer/wiring are removed. Backup creation, contents/download, upload
  validation/cancellation, MUD-running observation and historical restore status
  remain. No migration, dependency, new flag or frontend change is needed.
- **P6d1 scope evidence:** the removed merge allowlist contains account/game
  tables, not the two website retention classes or hold/run/control ledgers.
  It could recreate account/game data without consulting current lifecycle
  evidence and bypassed the MUD's recovery contract; it did not implement full
  website recovery. Its closure must not be reported as tested offline replay
  for an operator-restored website dump. That replay, independently protected
  current evidence and physical archive holds/expiry remain required P6 work.
- **P6d1 exact focused proof:** `pnpm --dir backend test --runInBand
  src/middleware/__tests__/mutationGate.test.ts
  src/services/__tests__/backupRestoreUnavailable.test.ts
  src/services/__tests__/productionReviewRegression.test.ts
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts` passes
  **30 tests / four suites**. Actual Express admin routes refuse full/account/
  character requests with the cached unsafe configuration true, retain 401/403
  access checks, and touch neither storage nor restore services. These router
  tests stub authentication/permission providers; they do not claim a new JWT/
  CSRF integration drill. Separate service tests observe no SQL, filesystem,
  archive-open or child-process calls for all three modes. Gate tests also
  verify both historical setting values and unchanged other mutation gates.
- **P6d1 full proof:** `TEST_BACKUP_DB_PORTS=23436,23437 node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts 23436` passes **1,276 tests / 130 suites**,
  with **40 separately opted-in native cases skipped** (14 image, 10 privacy,
  seven hold and nine preview). Hold/preview retain #54's fresh two-engine
  evidence; image/privacy retain their earlier qualification. This run includes
  both actual session-free backup dump/empty-target restore cases on MySQL
  8.0.46 and MariaDB 11.8.9, preserving ordinary rows and omitting session
  credentials, plus backup parsers and the current SQL execution fixture.
  Native target databases/users/files are process-owned synthetic fixtures,
  never actual MUD or shared backup data. The full fixture's actual forward
  migration/session/configuration/dependency probes pass before tests and
  dependency/owner verification pass afterward (92 migrations, owner hash
  `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`).
- **P6d1 quality/evidence:** `python3 /tmp/durisweb-image-quality.py backend`
  runs backend `format:check`, `lint`, `type-check`, `verify:mud-writes`
  (53 classified writes), `schema:check` and `build`; all pass. Changed TS was
  formatted with backend `pnpm exec biome format --write`. Configuration
  literal regression, the exact 77-table lifecycle inventory/reference checker
  and `git diff --check` pass. Logs:
  `/tmp/durisweb-restore-boundary-focused.log`,
  `/tmp/durisweb-restore-boundary-full-mysql.log` and
  `/tmp/durisweb-restore-boundary-gates.log`. The initial service test's partial
  child-process mock omitted node-cron's `fork` import; it now preserves the
  other real exports and spies only the removed execution boundary. An unused
  `os` import left by pipeline removal was removed after lint reported it.
  Final focused/full/gate runs pass. Later edits are documentation/comments
  only; no repeated runtime suite is needed. No fresh frontend/browser, live
  acceptance, physical production-backup recovery or provider operation is
  claimed.
- **P6d1 release news draft:** prepare an admin-only Website Changelog entry
  after separately authorized live acceptance: “Restoring account or game data
  through the website is unavailable while protected recovery is completed.
  Backup creation and viewing remain available.” Reconcile with
  [news-update](../../.agents/skills/news-update/SKILL.md) at release; no live
  entry has been written. This restriction is qualified source, not deployment.
- **P6d1 next requirement:** preserve and enforce holds when existing automatic
  count-based/manual/failed-backup cleanup removes archives, including failure
  handling that retains durable file identity. Inventory actual source paths
  before choosing a minimal implementation; do not introduce unapproved age
  periods or silently claim aggregate restore/erasure acceptance. Then continue
  independently protected restore-removal evidence/replay, remaining classes
  and P7. Do not operate MUD backups or services in this engineering task.
- **Published P6d1:** [PR #55](https://github.com/LuminariMUD/DurisWeb/pull/55),
  open/non-draft, code head `8123679f5b2af6e0e378f7be04598ea62ce32b23`, base
  `branch/retention-sql-enforcement` (#54 `56508c0`). Latest #54 hosted backend/
  frontend checks pass. Master remains `8946860` and is already an ancestor;
  preserve the published stack with ordinary commits. Initial read-back
  confirms OPEN/non-draft/MERGEABLE, matching local/remote/API code heads,
  ahead/behind `0 0` and clean worktree. #55 hosted checks were running; the
  local proof is complete. This plan closeout is a normal follow-up commit,
  with final head/cleanliness verified after push. No merge, tag, deployment,
  shared migration, real restore, actual MUD operation or live changelog write
  occurred.
- **Next-session entry after P6d1:** fetch and inspect #55/parent/master before
  branching from its final head. Continue in the same isolated worktree,
  preserving original checkout changes, stash `bbda289`, all needed private
  runners/logs and owner fixture evidence. For P6d2 inspect
  `backupService.ts`'s `deleteBackup`, `deleteFailedBackups`, automatic
  `cleanupOldBackups`, list-time record pruning and uploaded-file cancellation/
  cleanup before editing. Current cleanup ignores active holds and suppresses
  unlink failures while removing the database identity; resolve that actual
  boundary with durable, retryable outcomes and truthful API results. Mixed
  database/flatfile archives require conservative preservation unless scope
  can be verified. Reuse the existing control lock/hold validation only where
  their actual concurrency contract fits; do not hold a long SQL transaction
  across unbounded filesystem/provider work or invent approved periods.
  Full P6/P7, own-ledger retention, independent restore replay and named policy/
  provider/live acceptance remain open. Source destructive/collection flags
  stay false. Continue independent engineering and ask only for a necessary
  consequential owner decision.

- **Current P6d2a: truthful archive deletion prerequisite**, branch
  `branch/backup-deletion-recovery`, starts at #55 `0736f4f`.
  Source inspection found suppressed unlink failures followed by record deletion,
  bulk bypass of the common path, list-time identity pruning, duplicate
  second-resolution archive filenames and a frontend success toast before the
  request settled. **Outcome:** retain retry identity on unconfirmed deletion,
  share one deletion path, refuse unfinished/shared/unsafe targets, avoid new
  name collisions, retain missing-file records for review, and await the actual
  UI mutation. A completed backup must not become failed solely because older
  archive cleanup failed. **Non-goals:** new approved periods, active hold
  enforcement, physical expiry/restore replay or live archive operations; these
  remain mandatory next work. **Files:** existing backup service/routes and
  composable, a safe typed failure, focused filesystem/HTTP/UI tests, docs/plan.
  **Proof:** real temporary files, unlink/SQL partial failures/retry, API errors,
  actual asynchronous frontend mutation, full affected package gates and a
  focused stacked PR.
- **P6d2a ablation:** retain the existing backup record as recovery identity
  rather than add a second deletion ledger before the hold barrier's real
  contract is established. Fix lost identity and false acknowledgement first
  as a separately reviewable prerequisite. A short pre-unlink hold snapshot
  would race an acknowledged hold; an expiring SQL lease cannot fence a delayed
  filesystem unlink. P6d2b must use durable admission/recovery ordering without
  holding a long SQL transaction across filesystem work, and must not silently
  clear an ambiguous in-flight deletion. Do not claim protection from this
  prerequisite alone.
- **P6d2a final source:** manual removal, failed-backup cleanup and existing
  count pruning share one checked unlink/metadata-removal path. Eligible
  completed/failed records require one reference to a canonical filename;
  pending/in-progress/shared/unsafe targets are refused. Non-ENOENT filesystem
  errors retain the record; only confirmed unlink/absence permits the exact
  ID/filename/status-bound DELETE. SQL errors are safely reported for retry,
  including an already absent file; an unconfirmed committed DELETE may later
  appear as not found. Bulk cleanup stops on the first failure without a false
  success/count, retaining later work. Listings neither prune missing files'
  identities nor infer writer death from 30 minutes of age. A newly completed
  backup remains completed if older cleanup fails. New timestamp-plus-UUID
  filenames prevent concurrent new archives sharing a path. The frontend now
  returns the actual deletion promise, propagates failure and invalidates the
  list on both outcomes. No new migration/dependency/setting is needed.
- **P6d2a focused proof:** `pnpm --dir backend test --runInBand
  src/services/__tests__/backupDeletionRecovery.test.ts
  src/routes/__tests__/adminAccountPermissionIdValidation.test.ts` passes
  **24 tests / two suites**. Adding `TEST_BACKUP_DB_PORTS=23436,23437` passes
  **26 tests / two suites** after the final test extensions. These exercise real
  temporary files with canonical `mud_backups` DDL on MySQL 8.0.46 and MariaDB
  11.8.9, injected unlink/SQL failures, missing-file retry, shared references,
  exact metadata deletion, safe API/log errors and preserved writer/list
  evidence. Both native cases also execute the actual asynchronous backup
  writer, mysqldump and ZIP on their process-owned database and files: a new
  archive remains completed while an older shared archive is retained and
  cleanup is safely reported. Only disposable loopback databases
  `durisweb_backup_removal_<process-id>` and owned temporary files are used.
  No actual MUD, shared archive or provider is touched.
- **P6d2a full backend proof:** `TEST_BACKUP_DB_PORTS=23436,23437 node --import
  ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-execution-suite.mts 23436` passes **1,289 tests / 131 suites**,
  with the same **40 separately opted-in native cases skipped** (14 image,
  10 privacy, seven hold and nine preview). Their earlier P5/P6 qualification
  is retained, not claimed as fresh. This full run includes the two session-free
  backup snapshot/empty-target restore cases; the two new archive-removal/
  publisher native cases were subsequently added and pass in the focused
  26-test command above. No runtime behavior changed after the full run;
  later changes extend tests and clarify comments/docs. Native-focused and
  backend quality checks pass after those extensions. The full fixture's
  actual 92-migration/session/configuration/dependency probes and post-test
  dependency/owner checks pass; owner metadata remains
  `403c2a9941ce5746491919b2cc8cd91bed55b959adc681a66f0fceef04b90d23`.
- **P6d2a frontend/gates:** `pnpm --dir frontend test:unit --run
  src/composables/__tests__/useBackups.spec.ts` passes both deferred success/
  failure cases with the actual Vue Query client and a mounted Vue harness.
  `python3 /tmp/durisweb-image-quality.py frontend` passes format/lint/type,
  configuration/palette checks, **285 tests / 58 files** and build using its
  explicit private loopback configuration. Backend's corresponding helper
  passes format/lint/type, MUD-write verification (53 classified writes),
  schema contract validation and build. Changed files were formatted with
  each package's `pnpm exec biome format --write`; frozen dependencies remain
  unchanged. Config literal, lifecycle registry/local-reference and
  `git diff --check` pass. The first type check caught an unchecked optional
  row in the test fixture; explicit narrowing fixes it and all final gates pass.
  No fresh browser/visual/device acceptance is claimed for the composable-only
  frontend change; no live acceptance or real archive operation is claimed.
- **P6d2a evidence/news:** private logs
  `/tmp/durisweb-backup-recovery-{focused,native,full-mysql}.log` and
  `/tmp/durisweb-backup-recovery-{backend,frontend}-gates.log` retain exact
  commands/results. After separately authorized live release, reconcile
  [news-update](../../.agents/skills/news-update/SKILL.md) and prepare admin
  news: “Backup removal now waits for confirmed cleanup and keeps failed work
  available for retry. The page reports the actual result and refreshes the
  list.” This is a future-release draft; no live changelog write occurred.
- **P6d2a required continuation:** P6d2b must add durable archive-removal
  admission/recovery ordering with hold creation/release. Do not replace it
  with a stale snapshot check or an expiring worker lease around an uncancellable
  filesystem operation. The current source still reports global protection
  unavailable and does not enforce archive holds. Own-ledger periods,
  maximum age, independently protected restore replay, other classes and P7
  remain open. Preserve original checkout work and stash/private evidence;
  continue independently without asking for a new approval of engineering.
- **Published P6d2a:** [PR #56](https://github.com/LuminariMUD/DurisWeb/pull/56),
  open/non-draft, code head `10b856e8c40e0e56c153b5a94ca18b4a993fc4ae`, base
  `branch/restore-lifecycle-boundary` (#55 `0736f4f`). Latest #55 hosted backend/
  frontend checks pass; master `8946860` is already an ancestor. Initial PR
  read-back is OPEN/non-draft/MERGEABLE with matching local/remote/API code
  heads, ahead/behind `0 0` and clean worktree. #56 hosted checks were running;
  local verification is complete. Push this normal documentation closeout and
  verify final heads/cleanliness again. No merge, tag, deployment, shared
  migration, actual backup/MUD operation or live changelog write occurred.
- **Next-session entry after P6d2a:** fetch and inspect #56/parents/master,
  then continue from its final published head in the same isolated worktree.
  Preserve original checkout changes, stash `bbda289` and private runners/logs.
  First finish the related false-acknowledgement defect observed in
  `useBackups.ts`: creation/restore methods still expose fire-and-forget
  `mutate` despite awaited view handlers (only deletion is repaired in #56).
  Trace all callers and fix those as a focused follow-up, including rejection
  from the now-unavailable restore endpoint, without re-enabling that operation.
  Then implement P6d2b's actual durable archive-removal/hold admission barrier.
  Include writer-failure partial archive cleanup and uploaded-file cancellation/
  validation cleanup in the store audit, not just manual/count/failed-record
  deletion. Age alone cannot prove a writer died; preserve pending/in-progress
  evidence until a verified recovery path fences old work. Do not acknowledge
  protection while an earlier uncancellable unlink may still remove a copy,
  clear ambiguous in-flight state merely on lease expiry, or hold a long SQL
  transaction across filesystem work. The prior proposed snapshot-only guard
  was deliberately not implemented because it would race hold acknowledgement.
  Continue the full P6/P7 scope: archive holds/approved age, independently
  protected current evidence and offline replay, remaining handlers, own-ledger
  periods and verified subject requests/export/erasure. Source approvals remain
  false; no live/MUD/provider/backup operation is authorized. No owner question
  is currently necessary for the independent engineering work.

- **Current P6d2a2: backup action acknowledgement**, branch
  `branch/backup-action-acknowledgement`, starts at #56 `2fdfb36`.
  **Outcome:** expose actual promises for backup creation/stored/uploaded restore,
  await all view callers, show failure without closing the dialog or losing
  uploaded-file/selection identity, and block duplicate/cancel actions while
  awaiting an outcome. Success needs a positive acknowledged operation ID;
  failed backup starts refresh the list because an unknown response may follow
  acceptance. **Non-goals:** enabling restore, new backend behavior, archive hold
  admission or new data periods. **Files:** existing composable/view/tests,
  operator docs and plan. **Proof:** deferred success/failure/invalid-ack cases
  with real Vue Query; actual rendered pending/refusal and retained selection/
  upload flows with synthetic API responses; frontend required checks/build,
  then a focused PR stacked on #56.
- **P6d2a2 ablation:** use existing Vue Query mutation promises and one combined
  pending flag; no extra request queue, retry mechanism, settings or readiness
  layer. Keep the existing selections and dialogs until acknowledged acceptance.
  A small shared acknowledgement check serves three actual calls. Browser
  plugin/`browser` skill is not listed, so use installed Playwright with recorded
  fallback and private screenshots; no DurisWeb dependency is added.
- **P6d2a2 final scope adjustment:** all three start methods now expose real
  promises and require `success: true` with a positive safe integer operation
  ID. Backup starts refetch on either outcome; stored/upload restore views
  await, retain selection/upload identity on refusal and share actual pending
  state. Upload cancellation now awaits `success: true`, blocks conflicting
  restore/close actions and retains its path/dialog on unconfirmed cleanup.
  One local cancellation-pending flag and one inline error serve these real
  controller states. The rendered check found a toast-only error obscured by
  earlier notifications; both dialogs now show the static error persistently.
  Uploaded-file copy describes inspection rather than promising recovery.
- **P6d2a2 refusal classification:** the shared client previously dispatched a
  global outage for every HTTP 503, including the deliberate restore gate.
  Exact `503 operation_gated` now rejects locally without an outage notice or
  request replay. Unexpected 500/server/connection failures keep the ordinary
  availability signal. This is necessary for the actual restore-refusal UI;
  no backend gate or authority is changed.
- **P6d2a2 exact unit/quality proof:** `pnpm --dir frontend test:unit --run
  src/composables/__tests__/useBackups.spec.ts
  src/services/__tests__/apiAvailability.spec.ts` passes **28 tests / two files**.
  Deferred accepted/refused backup, stored restore and uploaded restore calls
  use the real Vue Query client; false/invalid operation acknowledgements create
  no pending restore. Availability tests prove deliberate 503 refusal is local,
  unexpected HTTP 500 still signals, and no request is replayed.
  `python3 /tmp/durisweb-image-quality.py frontend` passes frontend
  `format:check`, `lint`, `type-check`, `config:check`, palette guard, full
  **296 tests / 58 files**, and `build`, with the helper's explicit loopback
  build configuration. Changed TS/Vue was formatted with frontend
  `pnpm exec biome format --write`. A conditional-expect lint finding in the
  new tests was corrected to unconditional outcome assertions; final checks
  all pass. Config literal, lifecycle inventory/local-reference and whitespace
  checks pass. No backend source/migration changed; no fresh backend/database/
  provider/physical-device or live acceptance is claimed.
- **P6d2a2 rendered QA:** flow under test is
  `http://127.0.0.1:25477/admin/mud/backup` → start/restore/cancel → remain
  pending until acknowledgement and preserve refused work with a visible result.
  Browser plugin/`browser` skill is absent. Installed Playwright Chromium
  (`node .../playwright/cli.js --version`: 1.63.0) runs
  `node /tmp/durisweb-backup-ack-browser.mjs` against the actual Vite app,
  actual view/router and synthetic authenticated/API responses at **1440x1000
  and 390x844**. No actual backend operation is sent.
  Identity (URL/title Duris), meaningful content, absent framework overlay,
  console health, screenshots and interaction checks pass at both sizes.
  Each case observes one backup start only after response; stored/uploaded
  account restores remain open through delayed 503 refusal, keep both selected
  accounts and show a persistent inline error without a site-wide outage.
  Submit/Cancel/Escape cannot discard in-flight work. Uploaded cancellation is
  delayed, then synthetically refused with 409; the dialog and path survive,
  a second explicit Cancel sends the same path and closes only on success.
  Raw server/cancellation sentinels are absent from the UI. No document
  horizontal overflow or unexpected console/page error is observed; deliberate
  503/409 resource messages and the existing Vue Router `next()` deprecation
  are separately expected. Six screenshots are retained; desktop restore and
  mobile upload/cancellation views were inspected, including the formerly
  obscured error now readable inside the dialog. This is emulated
  Chromium QA, not physical mobile or live authentication/recovery acceptance.
- **P6d2a2 retained evidence and tooling:** logs
  `/tmp/durisweb-backup-ack-{focused,browser,frontend-gates,vite}.log`, private
  browser script and `/tmp/durisweb-backup-ack-{stored,uploaded,cancel}-{1440,390}.png`
  remain outside Git. The frontend dev server was launched with explicit
  `VITE_*` loopback URLs, host 127.0.0.1 and port 25477, then stopped after its
  listener/PID/cwd were verified as this isolated checkout. No shared service
  was stopped. A `pnpm --dir` browser-version check unexpectedly bootstrapped
  the separate tooling checkout's declared dependencies and generated an
  untracked lockfile. No tracked tooling source changed; that generated file
  is preserved at `/tmp/durisweb-tooling-bootstrap-pnpm-lock-20261017.yaml`
  and the tooling checkout's porcelain status is empty afterward. Subsequent
  checks invoke the installed Node CLI directly. DurisWeb dependency files
  are unchanged; no browser installation command or DurisWeb dependency change
  was made.
- **P6d2a2 release news draft:** after separately authorized verified live
  release, reconcile [news-update](../../.agents/skills/news-update/SKILL.md)
  and publish admin guidance: “Backup tools wait for the server's result.
  Refused restore or upload cleanup keeps your selections and shows the problem
  in the open dialog.” No live changelog entry was written. Website restore
  remains source-disabled; no client change enables it or approves recovery.
- **P6d2a2 next requirement:** resume the full P6d2b archive hold admission and
  recovery barrier after this focused UI prerequisite. Client retention of an
  uploaded path is not a durable server ledger. Audit stored and partial
  archives, upload validation/cancellation/expiry, and all independent cleanup
  consumers. The current cancellation service can acknowledge an invalid path
  without deleting anything; repair truthful server outcomes and durable work
  as part of that store boundary, with actual hold ordering. Keep protected
  independent evidence/offline replay, other classes, own-ledger periods and
  all P7 requirements open. Do not replace them with a UI-only or stale-snapshot
  guard. Continue engineering autonomously; no owner question is currently needed.
- **Published P6d2a2:** [PR #57](https://github.com/LuminariMUD/DurisWeb/pull/57),
  open/non-draft, code head `3e4b0a28be2c7fce22568fdd50c50753bce2632f`, base
  `branch/backup-deletion-recovery` (#56 `2fdfb36`). Latest #56 hosted backend/
  frontend checks pass. Master remains `8946860` and is already an ancestor;
  keep the stack without history rewrite. Initial #57 read-back confirms
  OPEN/non-draft/MERGEABLE, matching local/remote/API code heads, ahead/behind
  `0 0` and a clean checkout. Hosted checks were running; local QA is complete.
  Push this normal plan closeout and reverify final heads/cleanliness. No merge,
  tag, release, shared migration, live archive/restore/MUD/provider operation or
  changelog publication occurred.
- **Next-session entry after P6d2a2:** refresh #57/parents/master and continue
  from its final published head in the same isolated worktree. Preserve original
  checkout work, stash `bbda289`, private fixture runners/logs, six browser
  screenshots and tooling-bootstrap recovery evidence. The backup UI
  acknowledgement prerequisite is now qualified; proceed to the actual P6d2b
  server-side archive hold admission/recovery barrier. Inspect every stored/
  partial/uploaded copy removal path and its callers before selecting the
  smallest complete ordering protocol. A hold acknowledged after an earlier
  dry run must protect an unremoved archive; admission and hold writes need
  shared durable ordering. Do not claim that a pre-unlink snapshot or expiring
  SQL ownership alone fences a delayed filesystem operation. Crash/restart
  recovery must not clear ambiguous deletion intent while an old worker can
  still complete. Include real filesystem/SQL and concurrent hold/restart/
  uncertain acknowledgement proof, safe aggregate results and protected history.
  Keep the whole P6/P7 scope, including independent current evidence and offline
  replay, other classes, own-ledger periods, verified requests/export/erasure
  and truthful provider/MUD boundaries. All source approval/collection/execution
  flags stay false pending the named decisions; no live operation is authorized.
  Continue autonomously and ask only for a consequential decision that cannot
  be resolved by independent engineering.

- **Current P6d2b1: managed archive hold admission**, branch
  `branch/managed-archive-hold-barrier`, started at #57 `5ffeb05` and now stacks
  on #58 `8916de3` after metadata qualification.
  **Outcome:** serialize managed archive removal with hold creation/release
  through the existing retention control lock and a durable non-expiring
  removal journal. Any active validated hold conservatively preserves an
  indivisible archive. Commit admission before disk work, then use one isolated
  unlink worker; do not release protection admission until that worker has
  closed or its original process is proven gone. Preserve ambiguous work and
  immutable receipts; retries/restarts cannot allow a late unlink after hold
  acknowledgement. Keep failed partial ZIPs and their backup records for the
  same managed-removal path. **Non-goals:** approved periods, enabling retention,
  live operations, whole-backup/copy acceptance or all P6/P7 completion.
  Uploaded archives and dump/staging workspaces are the dependent P6d2b2 scope;
  they must not be represented as protected by this first consumer. **Files:**
  one private settings journal, Linux process identity and one-shot worker,
  managed-removal service, existing hold/backup/settings/error consumers,
  focused/native/failure/concurrency tests and operator/lifecycle/plan docs.
  **Proof:** actual SQL and filesystem on both engines, all hold scopes,
  prepared/armed admission races, delayed/early worker replies, process exit/
  namespace/PID reuse, unknown SQL acknowledgements, restart recovery and strict
  private namespace/schema checks; required backend gates/full suite, then a
  focused stacked PR.
- **P6d2b1 ablation:** reuse `web_settings` for one active pointer plus retained
  UUID receipts, rather than add a new table, queue or configurable purge layer.
  A one-shot Node worker is needed because an async unlink cannot be cancelled
  by expiring a SQL lease. It gets no application credentials, uses no shell,
  and self-exits on timeout/IPC disconnect. The parent never sends a real signal
  to a PID read from durable state; recovery uses only identity/existence checks.
  Prepared work can be atomically abandoned before worker authorization; armed
  work can clear only after close/proven original-worker exit, never elapsed
  age. Unknown boot/PID namespace or inaccessible identity fails closed for
  operator review. SQL transactions never span worker/disk waits. Keep global
  enforcement unavailable while uploads, workspaces and other cleanup/restore
  consumers remain open. Production's `PrivateTmp=true` is also why upload
  persistence needs its own dependent change rather than a claim of protection
  for current temporary uploads.
- **P6d2b1 implementation checkpoint / prerequisite found:** managed admission,
  isolated worker, private journal, hold integration and operator UI are
  implemented but not yet published. Focused SQL/filesystem/race/recovery cases
  pass on both engines (34 cases/four suites), full backend passed 1,299 cases
  with 52 explicit native skips, and package gates/compiled-worker/browser
  checks pass at the checkpoint below. A stronger external-schema FK probe
  then reproduces a real blocker: `KEY_COLUMN_USAGE` is privilege-filtered, so
  the application principal misses a referencing CASCADE from a separate
  schema and incorrectly permits removal. Trigger metadata also requires
  visibility privileges; an empty catalog query is not authoritative absence.
  Retain the failing probe `/tmp/durisweb-archive-cross-schema.log` and do not
  publish the barrier while this requirement is unproven.
- **New required prerequisite:** prepare a focused shared lifecycle metadata
  safety change from #57, then stack managed admission on it. A database-owner
  installed read-only, definition-verified metadata function can return only
  trigger/incoming-reference counts for the current schema while the website
  retains ordinary credentials. Do not solve this by granting the website
  global PROCESS/data visibility or treating filtered zero counts as proof.
  Apply the authoritative check to the existing SQL retention/control consumers
  as well as this barrier. Explicit administrative installation/verification
  is source/rehearsal work only; no live grant or database operation is allowed.
- **P6d2b1 integration resumed (2026-10-17):** #58 is published and the barrier
  recovery stash has been applied without dropping it. Two textual conflicts
  were resolved by retaining both metadata/admission mocks and both lifecycle
  inventory paragraphs. The barrier now checks all locked settings/hold/backup
  tables through #58's authoritative helper before worker admission and final
  SQL removal. Missing authority reports review-required protection rather than
  trusting filtered zero counts. Requalification, rendered error states, final
  publication and the dependent upload/workspace work remain outstanding.
- **P6d2b1 qualified result (2026-10-17):** the originally failing external-schema
  CASCADE case now retains the file, parent and child, creates no removal receipt
  and starts no worker. The test also proves the ordinary application query
  still sees zero references; only #58's narrow helper establishes absence.
  All four active hold scopes preserve the whole indivisible archive, including
  holds created after a candidate was observed. The real producer retains a
  completed new backup when count pruning is held, and failed partial ZIPs
  use the same protected removal path. Expiry is database-clock based; invalid
  or excessive protection is retained/refused, never trimmed.
  Native fault cases cover prepared cancellation, delayed unlink/early success,
  file replacement, absent-file SQL failure plus held retry/release, unknown
  arm/final COMMIT acknowledgements, stopped/partially completed batches,
  hold acknowledgement between entries, fresh-process recovery, unknown process
  domain, strict schema/trigger/incoming-reference checks and private-prefix
  SQL-collation aliases. The production-built worker separately confirms removal
  without a TypeScript loader or application credentials.
- **P6d2b1 final commands and evidence:**
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts <23436|23437> archive-only` passes
  **35 tests / 4 suites per engine**, with the strengthened hidden-FK assertions
  in the full MySQL run and final MariaDB run. The runner expands to
  `pnpm --dir backend test --runInBand` with the archive native, real worker,
  hold-unit and process-identity test files after full isolated owner/baseline/
  92-migration fixture setup and explicit metadata-helper installation.
  `TEST_BACKUP_DB_PORTS=23436,23437 TEST_LIFECYCLE_METADATA_DB_PORTS=23436,23437
  node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-archive-suite.mts 23436` runs the full backend suite:
  **1,320 pass / 134 suites**, **53 optional native skips / 4 entire suites**
  (14 image, 10 privacy, 8 hold, 9 preview, 12 SQL executor). The full log is
  `/tmp/durisweb-archive-authoritative-full.log`.
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-run-hold-suite.mts <23436|23437> holds-only` separately passes
  **16 / 2 per engine**; missing authority now yields review-required HTTP 409
  with no hold acknowledgement. `node --import
  ./backend/node_modules/tsx/dist/loader.mjs /tmp/durisweb-run-execution-suite.mts
  <23436|23437> execution-only` passes **15 / 2 per engine** after the integration.
  One existing concurrency observer initially watched only the pooled hold
  connection; admission now blocks earlier on its fresh recovery connection.
  The observer follows that actual connection and still proves the real SQL
  lock wait and completion order. One overlapping MySQL attempt correctly
  refused a cache database owned by the still-running archive fixture; it was
  rerun only after that exact process completed and cleaned its own cache.
  No unrelated keys were removed. All runners pass pre/post dependency checks
  and unchanged owner fingerprints recorded under #58 above.
  `python3 /tmp/durisweb-image-quality.py backend` passes final backend
  `format:check`, `lint`, `type-check`, `verify:mud-writes` (**53**), `schema:check`
  (**77 / 85 historical**) and `build`. The same helper with `frontend` passes
  `format:check`, `lint`, `type-check`, `config:check`, palette guard, full
  **296 tests / 58 files**, and `build`; these final frontend gates were repeated
  successfully after the last bulk-warning adjustment.
  `node --import ./backend/node_modules/tsx/dist/loader.mjs
  /tmp/durisweb-archive-worker-probe.mts compiled` reports ready/removed.
  Config literals, lifecycle exact inventory/local references and whitespace
  checks pass. Native baseline replay, remaining image/privacy/preview opt-ins,
  providers, physical devices, non-ext4 filesystems and production were not
  freshly qualified; source changes do not claim those acceptances.
- **P6d2b1 rendered result:** browser plugin/`browser` skill is absent, so the
  installed Playwright Chromium fallback runs
  `node /tmp/durisweb-archive-held-browser.mjs` against the actual Vite app at
  `http://127.0.0.1:25477/admin/mud/backup`, with synthetic authenticated API
  responses only. Three states (held/busy/review) at **1440x1000 and 390x844**
  pass actual manual and failed-batch flows (**12 attempted actions**): static
  human-readable feedback, validated reference, no false success/raw server
  detail/global outage/request replay, and visible in-bounds toolbar controls.
  Batch failures all warn that earlier removals may already have completed.
  Copy now describes automatic counts as targets because holds/unconfirmed
  work may preserve older archives. The mobile toolbar wraps instead of
  clipping controls. Six screenshots are retained; mobile held and desktop
  review states were visually inspected. Expected synthetic 409 resource
  messages and the existing router deprecation are recorded separately from
  unexpected console/page errors. Final evidence is
  `/tmp/durisweb-archive-authoritative-browser-final.log` and
  `/tmp/durisweb-archive-{archive_held,removal_in_progress,recovery_unverified}-{1440,390}.png`.
- **Release-news draft:** “Managed backup archives are kept while preservation
  holds are active. Cleanup problems retain recovery records and show a clear
  status so staff can investigate and retry.” Reconcile with the live Website
  Changelog only during an authorized verified release; no entry is published
  for these unshipped PRs. No source approval/collection/retention flag changed.
- **P6d2b1 publication:** code head
  `0edcdb08d92f75519eaa4c396dac7f10ce9bd153` is pushed as open/non-draft
  [PR #59](https://github.com/LuminariMUD/DurisWeb/pull/59), base #58
  (`branch/lifecycle-metadata-visibility`, final `8916de3`), and attached to this
  chat. Initial readback verifies OPEN/MERGEABLE, exact local/remote/API heads,
  ahead/behind `0 0`, clean worktree and whitespace. Hosted quality jobs were
  running; local qualification above is complete. Master remains `8946860`
  and is already an ancestor, so no history rewrite, merge or tag is needed.
  The owned Vite fixture listener was verified by PID/cwd and stopped after
  browser acceptance. Retain private runners, logs/screenshots, the compiled
  worker probe, required pre-fix reproduction stash `1c8d1dd` and unrelated
  recovery stash `bbda289`. The obsolete archive-runner generator was removed;
  it must not overwrite the finalized qualification runner. This closeout edits
  documentation only; do not repeat runtime suites for it.
- **P6d2b1 next:** from #59's final published head, address the
  already identified baseline/session trigger-visibility consumers as a focused
  prerequisite before shared adoption. Continue P6d2b2's durable upload/SQL-dump/
  staging workspace records and their real cancellation/validation/failure/
  expiry removal paths. These require the same hold/fencing guarantee, not an
  immediate unlink or a stale snapshot. Keep independently protected current
  evidence, approved maximum age, compatible offline restore replay, remaining
  classes, own-ledger periods and every P7 subject-request requirement open.
  Keep all managed-barrier changes, fixtures and evidence intact while making
  the prerequisite independently reviewable.

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

</details>

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

- [x] Record the user-supplied processing-policy, operational and MUD contact:
  Max (Moshe); his contact details are in the lifecycle inventory.
- [ ] Approve controller/contact details, purposes,
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

Checked items below record source and isolated synthetic verification. They do
not approve policy, provider transfers or a live release. The public copy is
explicitly draft; the first notice/approval item and purpose/provider gates remain
open, and server approval/collection/retention-readiness flags remain false.

- [ ] Publish an accessible pre-login privacy route using the existing shell,
  router, brand components, and desktop/mobile navigation. Include the approved
  owner/contact, purposes, categories, necessary security processing, optional
  analytics, providers/transfers, retention, user requests, and human review of
  profiling. Version the notice and choice policy. Do not claim disabled or
  unverified provider features are live.
- [x] Provide accept/refuse choices and a persistent way to withdraw. Unknown,
  refused, expired, unreadable, or obsolete-policy state means no optional
  collection. Do not create `analytics_session_id`, gather optional fields, or
  schedule/send events before acceptance. Store only the minimal necessary
  preference before optional collection, and disclose that preference storage.
- [x] Replace unconditional tracking with an explicit consent state machine.
  Cover initial navigation, delayed route timers, page refresh, cross-tab
  changes, login/logout, and storage denial. Withdrawal cancels queued work,
  removes legacy/current optional identifiers, and prevents recreation. Login
  is not consent; logout must not accidentally accept or join another person's
  browsing history. Old cached clients must fail closed at the server.
- [x] Add a server-owned versioned choice receipt, issued only by an explicit
  same-origin, CSRF-protected choice action. Bind it to a browser choice with
  secure cookie handling and minimal identifiers; validate current policy,
  expiry/revocation, and server collection enablement before any enrichment,
  storage, or provider call. A client `consent: true` field alone is insufficient.
  Reuse existing CSRF plumbing; audit the present track exemption in
  [csrf.ts](../../backend/src/middleware/csrf.ts) and cover both router mounts.
- [x] Apply validation at the common collection boundary, including any direct
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
- [x] Test fresh visitor/refusal/acceptance/withdrawal/reacceptance, initial and
  delayed routes, cross-tab/login/logout, stale policy, disabled storage,
  stale/forged receipt, direct API/alternate-mount bypass, CSRF, provider/DB
  failure, and in-flight withdrawal. With synthetic browser fixtures assert
  both network silence and absence of optional storage before choice. Verify
  notice/preferences by keyboard and at phone/tablet/desktop widths.

Exit: published notice matches approved processing; rejected/no choice causes
no optional storage or provider transfer on either frontend or backend path.

## P6 — Retention enforcement and restore handling (#11)

Source progress: P6a/P6b/P6c1 are published; P6c2's gated two-class executor
prepares the CLI, ownership/checkpoints and transaction-time hold rechecks below.
All execution/approval flags remain false. These phase-wide checkboxes remain
open because other classes, request coordination, copy/restore handling and
approved/live acceptance are still required; see the execution record for exact
completed coverage and the next branch.

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

Recovery progress: the selected, synchronous website download and fresh
verification path are implemented and qualified above. Phase-wide checkboxes
remain open because they include complete request tracking, approved assisted
handling, omitted categories and erasure. Do not treat the partial download as
complete P7 acceptance.

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
  full erasure while the external account authority or another writer can recreate the user.
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

## Original planning-publication verification

The initial planning-only publication used documentation checks: inspect the current issues and
source contracts, validate this plan's relative links and issue/stage coverage,
check whitespace and the one-file diff, then verify the committed remote blob,
exact branch head, ahead/behind `0 0`, clean worktree, and issue links after push.
That original publication claimed no application, database, browser, migration,
provider, build or production acceptance. Subsequent implementation and its
actual runtime checks are recorded in the execution record above; remaining
phase checkboxes distinguish unfinished acceptance from qualified source.

No Website Changelog entry was needed for that original documentation-only
commit. Later implementation entries record release-news drafts and the
requirement to publish them only after an authorized verified live release.

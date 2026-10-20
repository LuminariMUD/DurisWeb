# Duris #107: browser stat method choice

Status: implementation, paired local acceptance and PR #73 review repairs complete; merge-qualified. Worktree `/home/aiwithapex/projects/durisweb-issue107`, branch
`branch/issue-107-stat-choice`, based on master `70288bf4583b`.

Parent: https://github.com/LuminariMUD/Duris/issues/107
Server plan: https://github.com/LuminariMUD/Duris/blob/branch/issue-107-first-entry-vitals/docs/ongoing-projects/plan.md
Server review order: Duris #236 (Telnet), #237 (authoritative socket protocol),
#238 (creation responses/account projection), #239 (first-entry vitals).

## Outcome and ablation

Keep the existing Vue wizard and design. Add the pre-roll Default/Advanced choice,
server-acknowledged Advanced acceptance/reset, four bonuses from capabilities,
recoverable errors and one pending mutation. Keep qualitative labels and existing
swaps, with karma displayed but immutable. Old servers retain their existing
five-bonus/reroll flow and receive no new accept/reset commands. There are no
backend, database, dependency, balance, numeric-display or production changes.

The same loading/pending state covers the concrete socket mutations; no generic
workflow framework or new service is needed. All five production files are the
existing wizard/event/view/store/command path. The mobile creation container now
scrolls: a 320x568 browser reproduced the Next button clipped by the fullscreen
shell. Existing large stat grids use two columns on narrow screens.

## Wire contract

Capabilities: `chargen_options.statMethods` contains default and advanced, with
`bonusCount: 4`. Missing capabilities select the old-server UI.
`roll_stats` sends `{race, method}` only after the choice. New responses carry
`method`, `phase` (rolling/bonuses/ready), labels and remaining bonuses.
Only Advanced/rolling shows Reroll. Next sends `accept_stats` and waits for
`stats_accepted`; Default's first roll is already accepted.
Back across stat steps and Cancel send `reset_chargen`, wait for `chargen_reset`,
then clear stats and navigate. Failed operations preserve labels/counts and leave
controls available. One mutation stays pending until its response or error;
unrelated options responses cannot release it. Disconnect and successful
creation clear local attempt/capability state.

## Validation

- Eight focused component/real-Pinia/socket tests pass. The component suite covers
  no pre-choice roll, Default preselection/no Reroll/four awards, Advanced reroll
  and acceptance acknowledgement, cap-error recovery, label-independent stat
  buttons, reset/back/cancel acknowledgement and old-server fallback.
- Including the existing credential/socket suite: 13 tests pass.
- Frontend format:check, lint and type-check pass. Production build passes with
  explicit local endpoints; output is ignored under frontend/dist. The package
  build and a direct build-only both produced fresh assets/PWA output.
- Browser plugin is not available; regular Playwright drives installed Chrome
  155.0.8059.41. Local URL is http://127.0.0.1:5179/play. The actual frontend
  wizard/store/composable communicates with an isolated changed flat-file MUD.
  Only unrelated website HTTP/bootstrap/map-data and backend-notification socket
  responses are fixtures. No MUD creation request/response is mocked.
- Initial minimal-world browser run completed Default, real capped-stat error
  recovery and a luck swap. Full-world acceptance replaced that run because the
  minimal fixture lacks the real tutorial room. Full-world server journeys
  independently pass both methods plus missing-method legacy Default, including
  ten saved numeric stats and name-collision retry.

## Completed paired acceptance and handoff

Chrome 155.0.8059.41 completed Default at 1280x900 and Advanced at 320x568 against
the changed full-world MUD. Both methods completed four bonuses, optional swaps,
creation, durable save, server restart and saved-character login to tutorial room
22800 without repeating creation. The authoritative saved stats were identical
before/after restart (Str/Dex/Agi/Con/Pow/Int/Wis/Cha/Kar/Luk):

- Default: `[92,94,92,90,88,89,90,90,89,93]`.
- Advanced: `[96,86,91,82,86,88,84,82,85,92]`.

The actual browser also proved cap-error recovery, Advanced reroll/acceptance,
acknowledged Back and Cancel, a fresh default choice after Cancel, no premature
roll, repeated luck swaps, keyboard Space/arrow selection, vertical scrolling and
no horizontal overflow. Rapid navigation exposed the hometown metadata race
repaired below. Its browser retry waits for hometown metadata and sends only one
options request. A pending-mutation error also releases the request even if an
unrelated metadata response has cleared the loading indicator.

The initial map error came from an incorrect peripheral HTTP fixture; matching
the actual map API nodes/edges contract removed it. Final game-entry/relogin
checks have no application console errors or framework overlay. The existing
Vue Router next() deprecation warning is recorded as a baseline warning. The
radio library selects on an asynchronous focus callback, so arrow-key checks
used physical key-down duration; no keyboard workaround was added.

A separate server repair also updates vitals after detached starter equipment
publication. A fresh browser character changed from the entry 1/1 snapshot to
35/35 at kit readiness, before reconnect, and rendered the correct HP. The server
account card also preserves level 1 on the next login.

Screenshots and redacted socket evidence are outside both repositories under
`C:/Users/apexw/.codex/visualizations/2026/10/20/01a159e0-f002-79e3-9650-209e90903eb9/`:
`stat-choice-desktop.png`, `stat-choice-default-review.png`,
`stat-choice-mobile.png`, `stat-choice-advanced-review.png`,
`stat-choice-fresh-entry.png`, `stat-choice-browser-evidence.json`.
The final format/lint/type-check/build and all 13 focused/credential tests pass.
No additional implementation work remains. The owner receives the review stack;
merge/integration and deployment/news publication remain separate steps.

Release order is MUD first, website second. The adjacent changelog JSON is an
unpublished local draft. Reconcile existing admin drafts/entries and set its
actual release version before eventual separately authorized deployment/news
publication. No release, live changelog write or production action occurred.

### Browser race repair

The real phone Cancel/restart loop reproduced a race: rapid Next actions could
reach the method choice before the race's hometown response arrived, skipping
hometown selection. Hometown requests now clear stale choices and keep the
wizard loading until acknowledgement; failures retain the race step for retry.
The parent/child options request is deduplicated, so a late duplicate options
response cannot release that wait. Focused component and actual-store/socket
regressions cover the pending/error/retry path.

## PR #73 review repair, 20 October 2026

All five inline comments were checked against head `461ca507ea8e` and current
master `70288bf4583b94710c981fe35609de0e2b26ad71` before editing:

- `4327249020`: already fixed in that head. System errors consult both loading
  and pending state. Added real-store/socket tests for both options and hometown
  metadata arriving before a pending mutation's error.
- `4327249029` and `4327551557`: reproduced. Validate all four modern stat
  response types even when stats are absent. Roll, acceptance and bonus responses
  require an integer counter from zero through four; swaps retain the existing
  counter. Invalid responses preserve stats and release pending/loading for retry.
- `4327249036`: reproduced. Pass mutation state separately to the wizard. Cancel
  stays available during initial metadata loading, but pending mutations, reset
  and acceptance still block it. Modern cancellation retains reset acknowledgement.
- `4327551570`: reproduced for all six mutation types. The copyover close path
  clears the lost creation attempt while retaining the reconnect banner/flow.
  Socket tests reauthenticate, reload capabilities and start a new attempt.

Fourteen new cases failed against the previous code. After repair, the focused
wizard/socket/credential run passes 66 tests; the full frontend run passes 64
files and 439 tests. No framework, dependency, backend, database or server changes
were needed. Existing helpers and suites provide the complete repair/proof path.

Commands and results for this repair (run from this worktree root):

- `pnpm --dir backend install --frozen-lockfile`: passed.
- `pnpm --dir frontend install --frozen-lockfile`: passed.
- `pnpm --dir frontend exec biome format --write src/composables/__tests__/useMudConnectionChargen.spec.ts src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts src/components/mud/chargen/MudCharacterCreate.vue src/composables/useMudConnection.ts src/views/MudClientView.vue`: passed.
- `pnpm --dir frontend test:unit --run src/composables/__tests__/useMudConnectionChargen.spec.ts src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts`: reproduced 14 failures before repair.
- `pnpm --dir frontend test:unit --run src/composables/__tests__/useMudConnectionChargen.spec.ts src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts src/composables/__tests__/useMudConnectionCredentials.spec.ts`: passed, 66 tests.
- `pnpm --dir frontend test:unit --run`: passed, 439 tests on Node 26.11.1.
- `pnpm --dir frontend format:check`, `pnpm --dir frontend lint`,
  `pnpm --dir frontend type-check`, `./frontend/scripts/check-palette-literals.sh`: passed.
- `./scripts/check-config-literals.sh`, `pnpm --dir backend format:check`,
  `pnpm --dir backend lint`, `pnpm --dir backend type-check`,
  `pnpm --dir backend verify:mud-writes`, `pnpm --dir backend schema:check`: passed
  on Node 26.11.1. Schema verification inspected no database.
- `pnpm --dir frontend config:check` and `pnpm --dir frontend build`: passed
  on supported Node 24.15.0 with explicit process-only local configuration:
  `VITE_BASE_URL=/`, `VITE_API_URL=http://127.0.0.1:7770`,
  `VITE_WS_URL=ws://127.0.0.1:7770/ws`, `VITE_STATIC_URL=http://127.0.0.1:5183`,
  `FRONTEND_DEV_HOST=127.0.0.1`, `FRONTEND_DEV_PORT=5183`,
  `FRONTEND_PREVIEW_HOST=127.0.0.1`, `FRONTEND_PREVIEW_PORT=4183`,
  `FRONTEND_ALLOWED_HOSTS=localhost,127.0.0.1`. No environment files were added.
- `pnpm --dir frontend dev` with the same local configuration and
  `node C:/Users/apexw/.codex/visualizations/2026/10/20/01a15a36-6cfd-7b71-b1f0-492e1f12ac26/pr73-browser.cjs`: passed.
  Chrome 155 at `/play`, 1280x900, 768x1024 and 320x568: actual view/store/wizard,
  keyboard cancellation, loading cancellation, pending/error control state and
  no horizontal overflow. No page/runtime errors or Vite overlay; existing
  Router deprecation warning only. HTTP and notification transport were fixtures;
  no MUD was contacted. Browser plugin unavailable; used bundled Playwright.
  Screenshots and JSON evidence stay beside that temporary script outside Git.
- `git diff --check`, ancestry checks and `git merge-tree --write-tree origin/master HEAD`: passed.

The earlier real full-world game journeys above were not repeated; this run
qualifies the review repairs with actual socket handlers and rendered UI.
Backend tests/build, shared database checks, migrations, production and server
operations were not run: no backend/schema change or deployment is in scope.
Hosted CI completion is not a gate; its source-owned checks passed locally.

Git: master is already an ancestor of this branch; PR #73 is the only open
website PR, with no dependent website branch to carry forward. Preserve the two
implementation commits and add one focused repair commit, then use a normal
push. Squash is suitable when the owner merges. No release tag, merge, production
action or MUD change is part of this handoff. The primary checkout is untouched.

Website Changelog: the existing adjacent unpublished draft already covers the
error/cancellation improvements. Retain it for the future release; reconcile
saved drafts/entries and publish only after authorized deployment acceptance.

## Merge qualification, 20 October 2026

The merge request's latest review (`4327802720`) identified the same invalid-response
lock on legacy servers. All stat-response types now validate labels and required
counters before changing state. Only modern responses require method/phase;
counter bounds follow the existing four/legacy-five capability setting. Swaps
retain their previous counter. Errors preserve prior stats and release the pending
mutation so a valid retry succeeds. The existing validation matrix now covers both
protocols; no second validator, new dependency or server change was needed.

Outcome: merge the complete website companion with recoverable modern and legacy
stat responses. Non-goals: server PR integration, deployment or database operations.
Files: the existing socket handler/test and this handoff. Proof: 21 new legacy
cases failed before the handler repair; all 87 focused tests and all 460 frontend
tests (64 files) passed afterward on Node 24.15.0 / pnpm 12.10.1.

Commands run from this worktree root:

- `pnpm --dir frontend exec biome format --write src/composables/__tests__/useMudConnectionChargen.spec.ts`
  and `pnpm --dir frontend exec biome format --write src/composables/useMudConnection.ts`: passed.
- `pnpm --dir frontend test:unit --run src/composables/__tests__/useMudConnectionChargen.spec.ts`:
  reproduced 21 legacy failures before repair (49 existing tests passed).
- `pnpm --dir frontend test:unit --run src/composables/__tests__/useMudConnectionChargen.spec.ts src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts src/composables/__tests__/useMudConnectionCredentials.spec.ts`:
  passed, 87 tests.
- `pnpm --dir frontend test:unit --run`: passed, 64 files / 460 tests.
- `pnpm --dir frontend format:check`, `pnpm --dir frontend lint`,
  `./frontend/scripts/check-palette-literals.sh`, `pnpm --dir frontend type-check`: passed.
- `./scripts/check-config-literals.sh`, `pnpm --dir backend format:check`,
  `pnpm --dir backend lint`, `pnpm --dir backend type-check`,
  `pnpm --dir backend verify:mud-writes`, `pnpm --dir backend schema:check`: passed.
  The schema check opened no database.
- `pnpm --dir frontend config:check`, `pnpm --dir frontend build`: passed, using
  the same process-only local configuration listed in the review-repair section.
- `git diff --check`: passed. Exact base/head/merge-tree verification is required
  again immediately before the guarded GitHub squash merge.

Backend tests/build/config:check, native database tests, browser/game journeys,
MUD operations and production operations were not repeated for this socket-only
repair. Earlier browser/full-world evidence remains historical, as recorded above.
The existing local changelog draft already covers recovery from creation errors;
it remains unpublished because this task merges source without deploying it.

Current master is an ancestor and no dependent website PR exists. Use one normal
repair push and a guarded squash merge; no rebase, force-push or release tag is
needed. The linked Duris issue cannot yet be completed because server PRs
#236, #237, #238 and #239 are still open. Record website integration on that issue;
unfinished server implementation, rather than production acceptance, is its
remaining work. The separately maintained MUD checkout is outside this task.

### Final acceptance-response review

The pre-merge review-thread check stopped the merge when new comment `4327908643`
arrived. Its invalid-phase lock reproduced for `stats_accepted` with both `rolling`
and `ready` while acceptance was pending. The boundary now requires `bonuses` for
that pending acknowledgement, preserving stats and releasing the error path for
retry. The wizard regression also checks that its local acceptance flag releases
Cancel/Next after an error and can successfully retry.

Read-only inspection of Duris #237's `ws_cmd_accept_stats` confirmed that duplicate
acknowledgements deliberately preserve the current phase, including `ready`.
The browser retains those valid ready duplicates outside a pending acceptance;
an unconditional bonuses-only restriction would incorrectly reject them. No
server checkout or source was changed.

`pnpm --dir frontend test:unit --run src/composables/__tests__/useMudConnectionChargen.spec.ts src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts`
reproduced two failures before the repair. The same three-suite focused command
listed above then passed 90 tests, and `pnpm --dir frontend test:unit --run` passed
all 463 tests in 64 files. The formatter command was repeated for the handler and
both listed test files. Frontend `format:check`, `lint`, palette check, `type-check`,
`config:check` and `build` were repeated successfully with the same local process
configuration. The unchanged backend quality results and stated verification
limits above still apply. The existing unpublished changelog draft covers this
additional creation-error recovery as well.

# Duris #107: browser stat method choice

Status: implementation and paired local acceptance complete; ready for review. Worktree `/home/aiwithapex/projects/durisweb-issue107`, branch
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

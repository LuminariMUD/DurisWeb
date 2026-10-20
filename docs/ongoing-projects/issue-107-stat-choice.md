# Duris #107: browser stat method choice

Status: implemented and locally tested, pending completion of paired full-world
browser acceptance. Worktree `/home/aiwithapex/projects/durisweb-issue107`, branch
`branch/issue-107-stat-choice`, based on master `70288bf4583b`.

Parent: https://github.com/LuminariMUD/Duris/issues/107
Server plan: https://github.com/LuminariMUD/Duris/blob/branch/issue-107-websocket-stat-choice/docs/ongoing-projects/plan.md
Server review stack: Duris #236 (Telnet), then #237 (authoritative socket protocol).

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

- Six focused component/real-Pinia/socket tests pass. The component suite covers
  no pre-choice roll, Default preselection/no Reroll/four awards, Advanced reroll
  and acceptance acknowledgement, cap-error recovery, label-independent stat
  buttons, reset/back/cancel acknowledgement and old-server fallback.
- Including the existing credential/socket suite: 11 tests pass.
- Frontend format:check, lint and type-check pass. Production build passes with
  explicit local endpoints; output is ignored under frontend/dist. The package
  build and a direct build-only both produced fresh assets/PWA output.
- Browser plugin is not available; regular Playwright drives installed Chrome
  155.0.8059.41. Local URL is http://127.0.0.1:5179/play. The actual frontend
  wizard/store/composable communicates with an isolated changed flat-file MUD.
  Only unrelated website HTTP/bootstrap/map-data and backend-notification socket
  responses are fixtures. No MUD creation request/response is mocked.
- Initial minimal-world browser run completed Default, real capped-stat error
  recovery and a luck swap. Full-world acceptance is in progress because the
  minimal fixture lacks the real tutorial room. Full-world server journeys
  independently pass both methods plus missing-method legacy Default, including
  ten saved numeric stats and name-collision retry.

## Remaining work

Finish full-world browser creation and save/restart/relogin for Default and
Advanced, with saved numeric comparisons, keyboard and 320x568 scroll checks.
Then publish final evidence and pin both repository heads in the parent plan.
A baseline Vue Router next() deprecation warning predates this change; the first
map error was an incorrect peripheral HTTP test fixture, corrected to the map
API's nodes/edges shape. No map product change was made.

Release order is MUD first, website second. The adjacent changelog JSON is an
unpublished local draft. Reconcile existing admin drafts/entries and set its
actual release version before eventual separately authorized deployment/news
publication. No release, live changelog write or production action occurred.

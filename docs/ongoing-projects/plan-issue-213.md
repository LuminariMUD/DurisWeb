# Duris #213 browser hometown parity

Tracking: https://github.com/LuminariMUD/Duris/issues/213.
Required server change: https://github.com/LuminariMUD/Duris/pull/315, stacked
on https://github.com/LuminariMUD/Duris/pull/314.
Server's full handoff: `Duris/docs/ongoing-projects/plan-issue-213.md`.

Worktree `/home/aiwithapex/projects/durisweb-issue213`, branch
`branch/issue-213-hometown-parity`, from fetched master `7147e6b`.
Review: https://github.com/LuminariMUD/DurisWeb/pull/91, commit `9eb92e3`.
The primary DurisWeb checkout was clean and left unchanged. No deployment,
database publication, environment-file edit or dependency-graph change is part
of this work. Dependencies were installed offline from the frozen lockfile.

Outcome: request hometowns for the selected race/alignment, accept only the
latest matching response context, wait for current options before advancing,
and clear an invalid selection after back navigation or side/race changes.
Single-choice responses still advance automatically. Unspecified hometowns
are omitted from creation JSON; the new server intentionally rejects a supplied
`-1` sentinel. Town labels wrap on phones. No eligibility policy is duplicated
in Vue, no extra request ID or new dialog is needed, and no new dependency was
added. Files: existing chargen component, connection, store, view, protocol
types and their two focused tests, plus this handoff.

Verification, October 24, 2026:

- `pnpm --dir frontend test:unit --run src/components/mud/chargen/__tests__/MudCharacterCreate.spec.ts src/composables/__tests__/useMudConnectionChargen.spec.ts`:
  107 tests passed. Includes race/side refresh, stale contexts, pending-step
  refusal, invalidation after Back, Firbolg options and optional-home encoding.
- `pnpm --dir frontend format:check`, `lint`, `type-check` and `build` passed.
  Build/Vite used explicit loopback public settings, without a `.env` file.
- Browser plugin not available; regular Playwright Chromium used the existing
  cached browser, without downloading another browser or adding a dependency.
  `http://127.0.0.1:15173/play` loaded with the expected title, meaningful
  content and no framework overlay or page exceptions. The existing Vue Router
  `next()` deprecation warning is unchanged.
- Actual browser account registration and hometown requests used the disposable
  flat-file MUD at server commit `491df3ca6`, booted with the complete generated
  authored world. Only unrelated website shell/site-config HTTP endpoints were
  stubbed. Hometown options and WebSocket responses were not mocked.
- Firbolg displayed Ugta/Ailvio/Plane of Life and required selection. Good
  Thri-kreen displayed Payang/Ailvio/Plane of Life; after selecting Plane of
  Life, Back -> Evil produced the currently available single racial choice and
  skipped the hometown screen. Back -> Good restored its three options and
  required a fresh selection. New evil tutorial choices are still awaiting
  server content/proc delivery.
- Desktop 1280x900 and phone 390x844 were inspected. Phone labels initially
  clipped; a single-column phone layout and wrapping fixed them. Screenshots
  and the temporary browser/lifecycle scripts remain outside the checkout at
  `/tmp/issue213-browser-*.png`, `/tmp/issue213-browser.py` and
  `/tmp/issue213-browser-server.py`. The executable scripts are focused local
  QA support, not the final full-journey runner.

Remaining #213 acceptance: evil authored copies and mechanical/reference parity,
their compiled procedures and creation choices, actual character creation into
those tutorials, complete lessons/quests, oversized-race traversal, XP/death/home
persistence through relog/restart on both backends, and rendered level warning.
Keep server and client protocol changes coordinated before release. Neither
this review chunk nor the menu proof closes the parent issue.

The browser fixture initially omitted `DURIS_WEBSOCKET=TRUE`; enabling the
listener fixed its connection refusal. Repeated synthetic registrations also
hit the normal registration throttle, so the fixture now reuses its account.
An independent pre-existing registration bug was reproduced: the browser
accepted digits in an account name, while the MUD accepts only letters and
underscores (3-14 characters). It was repaired separately in
https://github.com/LuminariMUD/DurisWeb/pull/92, commit `aeeab8a`, with six
focused tests, normal frontend checks/build and a Chromium rejection check.
It is independent of this branch and has no server protocol dependency.

## Prepared Website Changelog text

Unpublished draft, using the repository's `.agents/skills/news-update/SKILL.md`.
Reconcile with the actual accepted deployment and existing entries before any
authorized publication; no release version/date or deployed state is claimed.

Title: **Hometown choices follow your character's side**

```html
<h3>Play</h3>
<ul>
  <li>Character creation refreshes hometown choices when you change race or
  alignment and clears choices that no longer apply. The wizard waits for the
  current options before continuing.</li>
  <li>Firbolgs can choose Ugta, Outpost of Ailvio or Plane of Life. Hometown
  names also wrap clearly on phone screens.</li>
</ul>
```

Publication must wait for matching server/client release acceptance. Do not
announce Wutvr or Plane of Chaos until their remaining delivery is accepted.

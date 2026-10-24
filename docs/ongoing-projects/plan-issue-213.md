# Duris #213 browser hometown parity

Tracking: https://github.com/LuminariMUD/Duris/issues/213.
Required server change: https://github.com/LuminariMUD/Duris/pull/315, stacked
on https://github.com/LuminariMUD/Duris/pull/314.
Full evil content/routes: https://github.com/LuminariMUD/Duris/pull/320 and
https://github.com/LuminariMUD/Duris/pull/331, with dummy-dispatch dependency
https://github.com/LuminariMUD/Duris/pull/328. Browser acceptance is ready in
https://github.com/LuminariMUD/Duris/pull/333; zero-loss resurrection is repaired
independently in https://github.com/LuminariMUD/Duris/pull/332.
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
  Life, the early server-only protocol chunk still offered one evil racial
  choice. That early result is superseded by the complete server acceptance below.
- Desktop 1280x900 and phone 390x844 were inspected. Phone labels initially
  clipped; a single-column phone layout and wrapping fixed them. Screenshots
  are now retained with the maintained full-journey evidence described below.

The maintained server runner `tests/async/run_issue213_browser_journey.py` now
passes against **both flat-file and disposable MariaDB** with the full authored
world and this frontend at `9ac53ca` (frontend code remains `9eb92e3`). It verifies
Firbolg's three choices, neutral Good -> Evil -> Good invalidation with all three
evil options, registration, stat allocation, four malformed/opposite-side
submissions with no player allocation, real evil Thri-kreen creation, the
Chaos lesson gate, guide reward, stream, Grubruk map request and racial departure.
All three saved home fields read back as 67745 on each backend. The actual
uppercase level-30 warning renders at font weight 700 and was visually inspected.
No page exception remains; only the existing Vue Router deprecation is recorded.
An early map-panel exception came from the test's unrelated HTTP map-data fixture
using the wrong response shape and was fixed in the fixture.

Run from the server worktree with a live loopback frontend:

```sh
python3 tests/async/run_issue213_browser_journey.py --server bin/server/dms_flatfile --backend flatfile --frontend-url http://127.0.0.1:15173 --frontend-source /home/aiwithapex/projects/durisweb-issue213 --browser-executable /home/aiwithapex/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
tests/async/with_disposable_mariadb.sh python3 tests/async/run_issue213_browser_journey.py --server bin/server/dms_new --backend mariadb --frontend-url http://127.0.0.1:15173 --frontend-source /home/aiwithapex/projects/durisweb-issue213 --browser-executable /home/aiwithapex/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
```

Evidence is under the server's `bin/qualification/issue213/browser-{backend}.json`
and accompanying logs/screenshots, including binary/world/frontend IDs and saved
home/render checks. The runner creates a fresh authority per invocation; no
external scratch script or existing account is required.

Remaining #213 acceptance is the expanded native service/quest and protected/
unprotected death/restart matrix. Content/procedure integration, exhaustive
eligibility, authored/generated equality and all loaded NPC mechanical pairs
are qualified in the server handoff. Native Ogre/Firbolg basic routes already
passed on both backends; the expanded matrix is still in progress.
Keep server and client protocol changes coordinated before release. Neither
this review chunk nor the menu proof closes the parent issue.

The early browser fixture initially omitted `DURIS_WEBSOCKET=TRUE`; enabling the
listener fixed its connection refusal. Repeated registrations in that old
shared fixture hit the normal throttle; the maintained runner starts fresh.
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
  <li>Evil adventurers, including Ogres, can choose Plane of Chaos or Wutvr for
  the two optional introductions before continuing to their racial hometown.</li>
  <li>All races and sides are protected from death experience/level loss below
  level 30. A bold warning announces when normal death penalties begin.</li>
</ul>
```

Publication must wait for matching server/client release acceptance, including
the remaining native qualification and review of the linked server stack.

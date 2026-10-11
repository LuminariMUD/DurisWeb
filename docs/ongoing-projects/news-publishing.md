# News publishing issues

Investigated 2026-10-11. Status: all scoped fixes implemented and verified; not deployed.
Checked DurisWeb revision `8eb87b9` and the sibling Duris revision `5b000951c`.

The investigation found that the news page served current database content,
but announcements selected an old entry and editor saves exceeded the write limit. These
issues belong to DurisWeb. Browser push is also disabled in production; that
is a configuration choice, not a delivery failure.

## Implementation progress

- 2026-10-11: Re-fetched public news (still 54,922 characters) and confirmed
  the first range is September 15–21, 2026. Implemented date-range/title
  headings, section boundaries and wrapped bullets, with mocked delivery tests.
  The isolated announce route now selects `09/15/26 - 09/21/26` and exactly
  **37 complete bullets**, stopping before September 7–14.
- Fixed an additional preservation defect: processing MUD text as HTML
  changed command placeholders and ampersand color codes.
  News now has a **250,000-character** text validator; other content keeps
  its existing HTML validation and 50,000-character limit.
- Real TipTap load/edit verification of the public document passed: every
  original visible character, whitespace and per-character color is preserved.
  An untouched save retains the original bytes; edited text uses equivalent
  normalized color spans (the test edit produced 55,019 characters).
- A disposable MariaDB instance with networking disabled passed real
  content-service and HTTP route writes/reads for the original document, editor
  output and 250,000-character bound; 250,001 characters was rejected. Read-only
  production schema inspection confirmed `mud_info.content` is `MEDIUMTEXT`;
  no migration is needed. Notification delivery was mocked.
- Push wording now makes configuration explicit. Announcements invalidate the
  news cache even when that date was already dismissed; saving also invalidates
  the administrator’s cache. Load failures disable saving, and backend validation
  messages are displayed verbatim.
- Production deployment, live news writes, announcements, push activation and
  MUD operations were not performed.

## Current flow and ownership

- The website and production MUD share `duris_prod.mud_info`, with one
  `name = 'news'` row containing the whole news history and MUD color codes.
- `/news` uses `GET /api/content/news`, returning `{ news }`. The additional
  `GET /api/news` route returns the same text as `{ content }`. See
  [NewsView.vue](../../frontend/src/views/NewsView.vue),
  [newsApi](../../frontend/src/services/api.ts), and
  [contentService](../../backend/src/services/contentService.ts).
- `/admin/news` requires `manage_news`. Saving calls `PUT /api/content/news`;
  the subsequent optional announcement calls `POST /api/content/news/announce`.
  See [NewsAdminView.vue](../../frontend/src/views/admin/NewsAdminView.vue) and
  [content routes](../../backend/src/routes/content.ts).
- [notifyNewsUpdate](../../backend/src/services/unifiedNotificationService.ts)
  broadcasts `NEWS_UPDATED` to connected website clients, attempts browser
  push, and stores notifications for accounts found in login history. These
  notifications link to `/news`; announcing does not import or edit content.
- The Website Changelog tab is separate, backed by `website_changelog` and
  `/api/changelog`.

On the investigation date, the database row and both public news APIs matched
the sibling MUD's `lib/information/news` exactly: **54,922 characters**, headed
**Updated: September 21, 2026**. Both APIs returned HTTP 200 on `duris.sbs`
and `www.duris.sbs`, and directly from the local backend.

## Issue 1: Announcements select December 2025 news

**Owner:** DurisWeb backend, [newsParser.ts](../../backend/src/utils/newsParser.ts).

**Before the fix:** The parser only recognized a line consisting of a standalone numeric date.
The newest content instead has a heading starting `09/15/26 - 09/21/26`,
followed by a title. The parser skips the newer sections and selects the first
older standalone date it recognizes: **12/13/25**, with **nine bullet items**.
This was reproduced with the deployed parser against the live API response.

An announcement of the current content would therefore advertise December 13,
2025. The modal also suppresses a date already dismissed in that browser for
the same account, so selecting the old date can hide the popup entirely.
See [NewsAnnouncementModal.vue](../../frontend/src/components/NewsAnnouncementModal.vue).

- [x] Make announcement extraction support the current date-range headings
  and existing standalone-date entries without silently falling through to
  historical news.
- [x] Verify that the current document selects the September 15–21, 2026
  section, stops at its boundary, and handles wrapped bullet text.
- [x] Add focused parser and announce-route coverage with notification
  delivery mocked. Retain coverage for legacy dates and unparseable content.

## Issue 2: Existing news cannot pass the save validator

**Owner:** DurisWeb backend content validation and frontend news editor.

**Before the fix:** The news PUT route called `processContentForWrite`, which uses the shared
**50,000-character** limit in
[contentParser.ts](../../backend/src/utils/contentParser.ts). Existing news
already has 54,922 characters. Running the editor conversion helpers
`htmlToAnsi(ansiToHtmlWithStyles(news))` produces **56,066 characters**, which
also fails validation with:

```text
Content exceeds maximum length of 50000 characters
```

The conversion probe exercises the helpers, not a rendered TipTap session.
The backend rejection of the current raw content is independently reproduced.
The route returns HTTP 400 on this validation error before writing the row.

- [x] Give MUD news an appropriate bounded content limit without unnecessarily
  changing unrelated forum limits.
- [x] Verify that the existing document can be loaded, edited, and saved in
  an isolated environment while preserving its text and MUD color codes.
- [x] Cover the current document size, the selected upper bound, and invalid
  input in focused validation and route tests.

## Configuration follow-up: Browser push is disabled

Production has `PUSH_ENABLED=false`. On 2026-10-11,
`GET /api/push/vapid-public-key` returned HTTP 503 with
`{"error":"push notifications not configured","enabled":false}`.
The existing [deployment qualification record](burnin.md) also records push
among the disabled optional integrations.

**Before the fix:** The announcement dialog said it would send push notifications to
subscribers. WebSocket popups and stored account notifications are separate
delivery paths. See
[pushNotificationService.ts](../../backend/src/services/pushNotificationService.ts).

- [x] Make the announcement UI reflect push availability, or explicitly state
  that push delivery depends on configuration.
- **Separate optional rollout:** If browser push is wanted, configure and verify
  it separately. Enabling it is outside this issue’s scope; it remains disabled.

## Existing refresh behavior and MUD boundary

Editing Duris's tracked `lib/information/news` alone does not publish it to the
website. The MUD's `scripts/import_help_to_prod.sh` explicitly imports that
file into `mud_info`; website editor saves update the database without writing
back to the tracked file. A later file import can overwrite website edits.

The MUD copies news into its display string at boot. Plain immortal `page`
reloads that string after a database edit. The once-per-minute `mud_info` map
refresh does not update the separate display string used by `do_news`.
`page help` and `page info` do not perform that news reload. This is existing,
documented behavior, not a newly identified MUD defect; see the sibling
[help content pipeline](../../../duris/docs/content/HELP_SYSTEM.md) and
[information cache documentation](../../../duris/docs/operations/information-cache.md).
No separate MUD ongoing-project issue is needed for the findings above.

The website considers its cached news query fresh for five minutes; becoming
stale does not itself trigger a fetch, and there is no polling.
Window-focus refetching remains disabled. The fix makes `NEWS_UPDATED`
invalidate the query before popup dismissal checks: active news pages refetch
and inactive cached news becomes stale for the next visit. A successful editor
save also invalidates that browser’s news query. See
[useNews](../../frontend/src/composables/useNews.ts),
[query defaults](../../frontend/src/main.ts), and
[WebSocket handler](../../frontend/src/composables/useWebSocket.ts).

## Read-only reproduction

From an **isolated checkout containing these changes**, with dependencies and
a fresh backend build, run the following. It fetches public news and invokes
local parsing/conversion helpers; it does not save content or send notifications. It tests
the selected checkout’s compiled backend; do not build into the live checkout
to run this probe.

```bash
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { parseLatestNewsEntry } from './backend/dist/utils/newsParser.js';
import { processNewsForWrite } from './backend/dist/utils/contentParser.js';
import { JSDOM } from './frontend/node_modules/jsdom/lib/api.js';
import { ansiToHtmlWithStyles, htmlToAnsi } from './frontend/src/utils/ansiParser.ts';

const { news } = JSON.parse(execFileSync('curl', [
  '--fail', '--silent', '--show-error', '--max-time', '20',
  'https://duris.sbs/api/content/news',
], { encoding: 'utf8' }));
const { window } = new JSDOM('');
Object.assign(globalThis, { document: window.document, Node: window.Node, HTMLElement: window.HTMLElement });
const latest = parseLatestNewsEntry(news);
const converted = htmlToAnsi(ansiToHtmlWithStyles(news));
console.log({
  characters: news.length,
  announcementDate: latest?.date,
  announcementItems: latest?.items.length,
  rawValidation: processNewsForWrite(news).error,
  convertedCharacters: converted.length,
  convertedValidation: processNewsForWrite(converted).error,
});
JS

curl --silent --show-error --max-time 20 --write-out '\nHTTP %{http_code}\n' \
  https://duris.sbs/api/push/vapid-public-key
```

This probe checks conversion helpers, not the mounted editor. The implementation
verification also mounted the actual `NewsAdminView`/TipTap in jsdom, performed
an edit and Save click, then replayed the captured request through the real
content route/service against disposable MariaDB. Delivery was mocked; no real
browser push or WebSocket broadcast was sent. No production save, announcement,
import, restart, configuration change or deployment was performed.

## Verification commands and evidence (2026-10-11)

- `pnpm --dir backend test --runInBand src/utils/__tests__/newsParser.test.ts src/utils/__tests__/contentParser.test.ts src/routes/__tests__/contentValidation.test.ts`
  — focused permanent parser, validator and route tests. The final run also
  included the temporary `src/routes/__tests__/newsIsolatedPersistence.test.ts`
  probe: **4 suites, 71 tests passed**, including the real database round trip.
- `pnpm --dir frontend test:unit --run src/views/admin/__tests__/NewsAdminView.spec.ts src/utils/__tests__/ansiParser.spec.ts src/components/__tests__/NewsAnnouncementModal.spec.ts`
  — focused editor, conversion, escaped rendering and WebSocket/cache coverage.
  The temporary `src/views/admin/__tests__/NewsCurrentDocument.spec.ts` probe
  additionally checked the actual 54,922-character document, including every
  original character’s display color. Both temporary probes were removed after
  verification; public content snapshots and disposable database files are not
  part of the change.
- `pnpm --dir frontend test:unit --run src/views/admin/__tests__/NewsAdminView.spec.ts`
  — 5 tests passed, including raw ANSI editing with whitespace preserved.
- Database qualification used `mariadb-install-db` and `mariadbd --no-defaults`
  with a new `/tmp/durisweb-news-db` data directory, Unix socket, and
  `--skip-networking`. Only `news_test.mud_info` and a test audit table were
  created. `mariadb-admin --no-defaults --socket=/tmp/durisweb-news-db/socket -u root shutdown`
  stopped the disposable instance afterwards.
- Initial checks found a typed auth-fixture omission, a formatting difference,
  and an unused test import; these were corrected. The live-document probe’s
  first draft also used the synthetic fixture accidentally and assumed 38
  bullets. It was corrected to read the captured public document; an independent
  section/line count verified **37**, matching the parser and announce route.

| Command | Result |
|---|---|
| `pnpm --dir backend format:check` | Pass |
| `pnpm --dir backend lint` | Pass |
| `pnpm --dir backend type-check` | Pass |
| `pnpm --dir backend verify:mud-writes` | Pass; 53 classified writes |
| `pnpm --dir frontend format:check` | Pass |
| `pnpm --dir frontend lint` | Pass |
| `pnpm --dir frontend type-check` | Pass |
| `./frontend/scripts/check-palette-literals.sh` | Pass |
| `pnpm --dir backend build` | Pass in isolated worktree |
| `pnpm --dir frontend build` | Pass in isolated worktree; existing chunk-size warning |
| `pnpm --dir frontend test:unit --run` | 195 passed, 1 unrelated existing failure |
| `pnpm --dir frontend test:unit --run src/composables/__tests__/useSiteConfig.test.ts` | Reproduces the same existing failure alone |
| `git diff --check` | Pass |

The unrelated failure is `useSiteConfig.test.ts:39`: its mock returns
`Duris SBS`, but it expects the stored value `DurisSBS`. Both the test and its
implementation are byte-identical to `HEAD`. They were left unchanged. The
first full-suite run also exceeded the default timeout on the new large editor
fixture under concurrent build load. Reducing the synthetic fixture’s node count
while keeping it above 50,000 characters fixed that timeout; the final full run
passes all news tests.

Builds ran under `/tmp/durisweb-news-qualification`, created with
`git worktree add --detach /tmp/durisweb-news-qualification HEAD` and overlaid
with the working changes. All changed runtime files were compared against the
built sources and matched. Installed dependencies were linked from this checkout;
pnpm’s automatic dependency preflight warned that the symlink was not a real
hoist directory, but both build commands completed successfully using the existing
installed graph. No manifests or lockfiles changed, and live `dist` directories
were not written.

Targeted formatting used `pnpm --dir backend exec biome format --write` and
`pnpm --dir frontend exec biome format --write` on the changed files before
rerunning the package-wide format checks. Source/test/config inspection used
`rg`, `cat`, `sed`, `git status` and `git diff`. Public content was fetched with
`curl --fail --silent --show-error --max-time 20 https://duris.sbs/api/content/news`;
a read-only mysql2 metadata query confirmed the production column type. The
read-only compiled-helper probe above returned **54,922 raw characters**, the
**September 15–21 range**, **37 items**, **55,011 converted characters**, and
`null` for both validation errors. The push endpoint still returns HTTP 503
with `enabled: false`.

The full backend suite and a real-browser end-to-end session were not run.
Backend verification used the affected suites and disposable database round
trips; frontend verification used the full suite and the mounted editor. Live
push delivery and production deployment remain unverified and outside this
change’s acceptance criteria.

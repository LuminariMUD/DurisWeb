# PvP logs end-to-end audit — 2026-10-16

Tracking issue: [#31 — Fix remaining PvP log correctness gaps](https://github.com/LuminariMUD/DurisWeb/issues/31).
Notification delivery/polling work also overlaps [#30](https://github.com/LuminariMUD/DurisWeb/issues/30).

## Implementation handoff — issue #30 (2026-10-16)

The audit below is retained as dated evidence, not a description of current
source. Commit `194f2e3` on `master` repairs the #31 implementation findings;
#31 is closed. Issue #30 remains open for durable Discord delivery. Current
implementation baseline: `e2aba2fad3e1026afa2c8efea089f59ac248f1a6`.

**Outcome:** discover every eligible battle without count queries, keep Discord
progress independent of WebSocket/push, persist pending and confirmed delivery,
retry transient/rate-limit failures, recover after restart, and expose actionable
operator status. Preserve delay/privacy, manual posts, test messages, browser
notifications, and frag polling.

**Non-goals:** production deployment, enabling automatic posts, real Discord
messages/gameplay, MUD changes, historical snapshot reconstruction, or a general
notification framework. No release tag is warranted before a release exists.

**Files:** the existing Discord/PvP polling/services and their tests; one new
reversible website-owned migration and a delivery service for persistence;
existing admin routes, API client, and Web Settings view for status/retry; this
handoff and the permanent API/configuration guides. No new dependency or broker.

**Proof:** mocked HTTP outcomes; existing serial poll tests; isolated MariaDB
tests for discovery, delay boundaries/changes, concurrency, durable state,
restart and crash windows; permission/route and mounted admin UI tests; both
packages' required format/lint/type checks, applicable builds and MUD-write
verification. Tests must prove delivery through the worker/API, not only helpers.

### Focused PR sequence and current status

1. **Transport outcomes** — branch `branch/issue-30-discord-transport`.
   Structured confirmed/retry/failed outcomes, sanitized event-linked errors,
   rate-limit deadlines, destination pinning, stable nonce support, and overlap
   prevention. Published as [PR #32](https://github.com/LuminariMUD/DurisWeb/pull/32),
   implementation commit `a39a1a0bdb0824a9397ac0d887de6dd84da5e8d1`;
   head `3a33250` includes `master`'s added ablation skill (`ade01dd`).
2. **Durable delivery and discovery** — stack on chunk 1. Persist first-enable
   boundaries, pending/retry/delivered state and destination ownership; replace
   fire-and-forget Discord dispatch with an independent bounded worker. Avoid
   using public list count queries for event discovery. Implemented on
   `branch/issue-30-durable-discord`; published as
   [PR #33](https://github.com/LuminariMUD/DurisWeb/pull/33), based on PR #32.
   Implementation commit `015df5d`, head `570256d` includes the parent update.
3. **Operator status and acceptance** — stack on chunk 2. Show last automatic
   success, pending/failed/uncertain work and sanitized errors, with an authorized
   retry action. Complete lifecycle tests, documentation, release draft and
   requirement-by-requirement audit. Implemented on `branch/issue-30-discord-status`;
   SQL/route/UI and browser checks pass. Published as
   [PR #34](https://github.com/LuminariMUD/DurisWeb/pull/34), head `dfed2f5`,
   based on PR #33.
4. **Large announcement bounds** — final review reproduced HTTP 400 for a
   normal 15-participant battle because the original renderer exceeded Discord's
   field limit. A separate focused fix on `branch/issue-30-discord-payload-bounds`
   preserves all participant POV links across fields and bounds oversized
   legacy content with an explicit full-roster link notice. Publication follows
   this commit, stacked on PR #34.

### Lifecycle policy to implement and prove

- First activation of a destination establishes a durable existing-event ID
  boundary. Earlier events, including currently embargoed ones, are not
  automatically backfilled; operators can post specific visible battles manually.
- After activation, pausing stops automatic sends but retains pending work and
  discovers new work. Resuming drains that backlog in bounded batches, always
  rechecking the current privacy delay. Restart preserves the same boundary.
- A new configured channel establishes its own boundary. Existing queued work
  stays with its original channel; it is never silently sent to a replacement.
  Switching back resumes that channel's retained state.
- A successful manual post satisfies automatic delivery for that event and
  destination; later explicit manual posts remain intentional reposts. Manual
  and automatic attempts must share the same concurrency boundary.
- Transient failures remain pending with capped exponential backoff; Discord's
  requested rate-limit wait is a lower bound. Authentication/permission/channel
  failures pause the destination until explicit operator retry; invalid-event
  payload failures remain visible without blocking unrelated battles.
- A delivery attempt uses a persisted nonce. Discord only checks nonce uniqueness
  for the past few minutes, with no durable exactly-once guarantee. Timeouts,
  lost success responses and a crash after send/before persistence are uncertain
  outcomes. Recovery retains that uncertainty and may duplicate a post when
  retrying outside Discord's deduplication window; confirmed persisted successes
  are never automatically retried. No silent success or discarded pending work.

Transport references: [Discord message creation](https://docs.discord.com/developers/resources/message#create-message)
and [rate limits](https://docs.discord.com/developers/topics/rate-limits).

### Chunk 1 verification

- `pnpm --dir backend test --runInBand src/services/__tests__/discordService.test.ts src/services/__tests__/pvpPolling.test.ts`: 29 passed.
- `pnpm --dir backend format:check`, `lint`, `type-check`, and `build`: passed.
- `git diff --check`: passed.
- The first test run exposed a fixed-value test clock; the clock now advances
  with the fixture, and the exact rate-limit deadline passes. No application
  behavior was weakened to accommodate the fixture.
- No database/schema change, frontend change, shared-service operation, or real
  Discord request occurs in this chunk. Full backend/database/frontend suites
  and live delivery were not run. The existing scheduler still lacks durable
  retries until chunk 2; structured transport results alone do not close #30.

### Release news draft (unpublished)

Admin entry, title **Reliable PvP Discord announcements**:
`<p>Automatic PvP announcements retain pending battles across website restarts
and retry temporary Discord failures while respecting the battle visibility
delay.</p><p>Web Settings shows delivery progress and problems requiring attention.
Pausing retains a backlog; a new channel starts with future battles. Manual posts
remain available. An interrupted delivery can occasionally be duplicated when
retried.</p>`

This describes the full intended release, not chunk 1 alone. Reconcile the final
claims and existing Website Changelog entries after an authorized deployment;
publish only once that exact release is verified live. No live entry was changed.

### Chunk 2 verification and continuation

- `TEST_PVP_DB_PORT=34931 pnpm --dir backend test --runInBand src/services/__tests__/pvpDiscordDelivery.test.ts src/services/__tests__/discordService.test.ts src/services/__tests__/pvpPolling.test.ts src/services/__tests__/pvpService.test.ts src/routes/__tests__/adminAccountPermissionIdValidation.test.ts src/services/__tests__/webSettingsConfiguration.test.ts src/services/__tests__/productionReviewRegression.test.ts --silent`: **103 passed**, seven suites, including 17 durable-delivery SQL cases.
- `pnpm --dir backend format:check`, `lint`, `type-check`,
  `verify:mud-writes` (53 classified writes), and `build`: passed.
- Both `up` and `down` of the actual new migration ran against disposable MariaDB
  10.11.14 on port 34931; fixture schemas were removed by suite teardown. No
  shared environment or MUD table was migrated.
- The initial existing PvP calendar fixtures inherited the host timezone;
  explicitly setting UTC **after** `changeUser` (which resets session variables)
  corrected the fixture. All 35 existing PvP service cases now pass, including
  the no-count polling assertion. Runtime timestamp interpretation is unchanged.
- A database trigger simulated receipt persistence failing after a successful
  send. The row remained `sending`; recovery waited its deadline, reused its
  nonce, preserved uncertainty, and never retried the confirmed receipt again.
- The migration is loaded dynamically in its SQL test, matching the separate
  Knex migration runner and keeping migrations outside the application build's
  `src` root. Production migrations, real Discord calls, full package suites,
  frontend checks, and live acceptance were not run for this backend chunk.
- Next: implement a permission-protected status/retry API and Web Settings UI;
  cover retry authorization, failed/uncertain state, last automatic success,
  paused backlog and channel history; finish acceptance and current Git audit.

### Chunk 3 verification and continuation

- Backend: the chunk 2 command plus
  `src/routes/__tests__/pvpIdValidation.test.ts` passed **162 tests in eight suites**.
  The SQL suite now includes 19 delivery cases, including status contents,
  preserved automatic receipts after manual repost, and operator retry without
  bypassing pause/cooldown. Route tests cover authenticated permission gates,
  read-only uncached status, explicit retry, busy state, and sanitized 503 errors.
- `pnpm --dir frontend test:unit --run`: **226 passed in 47 files**.
  Six new mounted Web Settings tests cover blocked/paused status, links, retry,
  unavailable/recovery, rejected toggle rollback, test-message compatibility,
  and unauthorized entry. The six tests were rerun after adding keyboard focus
  restoration to Refresh when the completed retry control disappears.
- Both packages: format, lint, type checks and build passed. Also passed:
  `pnpm --dir backend verify:mud-writes`, `./scripts/check-config-literals.sh`,
  `./frontend/scripts/check-palette-literals.sh`, and `git diff --check`.
  Frontend build used explicit local fixture URLs/ports, with no environment
  file or production output changed.
- Browser plugin not available. Existing Python Playwright 1.58 with cached
  Chromium **153.0.8010.12** exercised the real application route
  `http://127.0.0.1:5176/admin/web-settings`, with all API/Discord-facing data
  intercepted as synthetic fixtures. The default Playwright browser revision
  was absent; selecting an already-cached Chromium required no installation.
- Verified page/title/content, no framework overlay, no runtime exceptions,
  four viewport widths (390/768/1024/1440), no page/panel horizontal overflow,
  Enter-to-retry once, pending-disabled state, focus restoration, refreshed
  paused status, toggle rollback on busy, and unavailable-state recovery.
  Inspected screenshots for mobile blocked, desktop retried, and unavailable
  states. Screenshots and temporary harness remain outside Git under
  `/tmp/durisweb-issue30-browser`; these are local fixture evidence, not live acceptance.
- Browser console: only intentionally injected HTTP 400/503 failures plus the
  existing Vue Router `next()` deprecation warning. The first harness run acted
  before retry/status completion and encountered the expected availability
  modal; waiting for the completed state and dismissing that modal corrected the
  harness. No application assertion was weakened.
- Remaining before completion: final acceptance and focused code review,
  publish/read back the last PR and current stack heads, then stop temporary
  services. Full backend suite, real account/session/Discord delivery, shared
  migrations, production release and changelog publication remain unperformed.

### Final implementation acceptance audit

Checked against every #30 acceptance item, rather than treating the historical
#31 closure or passing helper tests as completion:

1. **All newly eligible events, ties, multiple batches:** actual SQL discovery
   and worker tests deliver 104 new same-timestamp events across passes. The
   missing-record query also finds a lower-ID event committed after a higher ID.
2. **Privacy delay and changes:** SQL tests cover exact release, hidden fresh
   events, zero delay, raised delay on queued work, and a change between sends.
   Both manual and automatic attempts query the shared visibility predicate.
3. **Bounded cadence and no overlap:** startup schedules Discord and existing
   PvP/frag work on the positive 30-second constant. Real concurrent SQL workers,
   manual sends and toggle changes cannot share the database lock. The HTTP
   transport separately refuses overlapping sends.
4. **Rate limits, server errors, timeouts:** mocked transport classifies the
   response and honors fractional retry instructions; real SQL retains pending
   work, deadlines, uncertainty and the same nonce through later worker calls.
5. **Authentication/permission failures:** persistent failed/event and blocked/
   destination state prevents repeated calls, with actionable UI text and an
   explicit authorized retry action.
6. **Restart/crash recovery:** discovery has no memory cursor; persisted receipts
   prevent repeat automatic sends. Trigger-injected receipt failure leaves
   `sending`, recovery waits the attempt deadline and retains ambiguity, then
   reuses the same nonce. Exactly-once delivery is explicitly not promised.
7. **Lifecycle/manual interaction:** SQL tests and the permanent guide cover
   first enable, pause/resume, destination switch/back, manual success, intentional
   manual repost and failed repost preserving a prior receipt. Operator retry
   preserves pause and cooldown. No automatic historical backfill is introduced.
8. **Existing consumers:** Discord dispatch is removed from browser publication
   and owns a separate timer. WebSocket/push publication and frag polling retain
   their calls and cadence; existing poller, PvP route/view and regression tests
   pass. Manual/test transport and rendered controls retain their workflows.
9. **Safe proof:** all Discord requests were mocked, persistence tests used the
   disposable MariaDB, and browser APIs were intercepted as synthetic fixtures.
   No real channel traffic is required or claimed.

The additional payload regression failed against the prior renderer with
`status: failed` under a mock enforcing Discord's published embed limits. After
the repair, all 15 POV links survive and oversized legacy data remains within
the title/field/count/6,000-character bounds with an explicit full-roster notice.
`pnpm --dir backend test --runInBand src/services/__tests__/discordService.test.ts`
passes 27 tests; combined with the isolated delivery suite, **46 passed**.
Backend format/lint/type/build/whitespace checks were rerun for this final patch.
Other unchanged checks retain the chunk 3 evidence above.

All implementation acceptance is satisfied locally. The deliverable is the
focused PR stack for review, not a production release. Merge in order from the
bottom, retarget each dependent PR after its parent lands, and refresh current
base/head before merging. No release tag was created. Deployment still requires
the new migration, environment/configuration checks, normal release acceptance,
and publication/read-back of the prepared Website Changelog entry. Full backend
suite, live account/session/channel tests, and physical-device/other-engine
browser acceptance are not claimed.

## Verdict

**New combat logs are reaching the live website correctly, but the feature does
not pass a complete correctness review.** Capture, persistence, public log
delivery, equipment privacy, and desktop/mobile viewing work for the recent
battles inspected. Confirmed defects remain in delayed-event visibility,
filtering, statistics, dates, notifications, and comment counts.

This is an investigation and findings deliverable. No application repair,
production migration, configuration change, restart, deployment, backfill, or
live gameplay was performed by this audit. Tests that write data used a separate
disposable MariaDB instance. Browser notification fixtures were injected only
into the test browser; no message was sent to subscribers or Discord.

The [October 14 investigation](2026-10-14-pvp-missing-details-investigation.md)
described repaired source that was not yet deployed. That deployment status is
now historical: current production data, API behavior, and served frontend
assets demonstrate that the snapshot and historical-display repairs are active.
The old report's statement that no migration was needed is also historical;
current MUD source includes migration `0041_pkill_log_capacity`, and production
already has the required `MEDIUMTEXT` log column.

## Scope and evidence boundaries

Inspected the website source, compiled/served assets, public HTTPS and local
origin responses, live database in read-only transactions, paired MUD capture
and transaction code, executable codec/SQL tests, and real browser interactions.
The configured `MUD_DIR` identifies the separate game repository; this checkout
is the website. PvP ingestion uses MUD-owned SQL tables, not a missing Redis
subscription or a website import job.

Source revisions at inspection:

- Website: `98379c89e43e113284b796289e280b713ad2b0c1`.
- MUD: `b149b3ada6e8c9c1e041ad864772195173fef7c6`.

Both worktrees started clean. During this audit, independent edits appeared in
`backend/src/routes/pvp.ts`, its route tests, and `docs/api/README_api.md`.
Those pagination changes were preserved, inspected, and included in the final
focused test run. They were still absent from live API behavior on the final
probe. This report does not claim authorship or deployment of those edits.

Live executable identity and service state were inspected; checkout HEAD alone
is not proof of the exact running MUD revision. Runtime hashes, screenshots,
and temporary test tooling remain outside the checkout. No participant names,
account identifiers, raw combat logs, credentials, or player records are included
here. Observations were made on October 16, approximately 10:03–10:15 UTC.

## What works in production

The database contained five events and eleven participant rows, with no orphaned
participants or empty events. All five events link to `combat_outcome`. All
eleven participants are in-room records. The six participant rows belonging to
events 3–5 have formatted descriptions and nonempty log/equipment snapshots.

| Battle | Participants | Stored log lengths, characters | Stored equipment lengths, characters | Public equipment snapshots |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 0 | 0 | 0 |
| 2 | 2 | 0 | 0 | 0 |
| 3 | 2 | 37,028–46,321 | 1,739–1,923 | 1 |
| 4 | 2 | 35,068–46,020 | 1,413–1,716 | 1 |
| 5 | 2 | 27,475–33,663 | 1,285–1,499 | 1 |

- Every participant's live API `log` equals its stored SQL snapshot exactly.
  Every API `equip` equals the snapshot when the player's visibility bit is
  enabled and is `null` otherwise. `respect_webinfo_toggle=true`; only three
  participant rows currently permit equipment disclosure.
- `pvp_delay_minutes=15`. Main list/search/detail queries apply the delay.
  A fresh isolated event is absent from the list and its detail lookup returns
  `null`, while older events remain available. Current production events were
  already older than the delay, so this boundary was exercised with fixtures.
- All five live detail APIs return HTTP 200. List, search, leaderboard,
  autocomplete, analytics, comments, and interaction-stat responses checked
  through the public tunnel match the local origin. Both health endpoints return
  200; their changing health metadata is not asserted to be identical.
- Numeric level search finds historical name-only records. Player autocomplete
  returns six identities; the kills leaderboard returns five entries without
  blank names. Invalid detail ID `0` returns 400; a valid nonexistent ID returns
  404.
- Public HTML references the local served entry asset; the public battle-detail
  JavaScript chunk matches the corresponding served file byte for byte.
- Browser list → **View Details** → battle 5 → alternate POV works. The URL's
  `pov` parameter changes, logs render with colors, equipment and maximized-log
  dialogs open/close, and battle 1 explains missing logs and privacy-hidden
  equipment. Mobile equipment/comments/log tabs work at 390 × 844.

### Capture and persistence contract

In the MUD, `src/combat/fight.c:820` captures formatted identity, bounded
equipment, and `PlayerLog::read(LOG_PUBLIC, MAX_LOG_LEN)` on the game thread.
`combat_outcome_command.h` defines payload v3 with owned strings, up to fifteen
participants, 65,535 equipment bytes and 99,999 log bytes per participant.
Legacy v1/v2 payloads decode with empty snapshots. The repository writes event,
participant snapshots, outcome, and associated ledger changes within the
critical-command transaction; replay is idempotent.

Current production `pkill_info.log` is nullable `MEDIUMTEXT` and `equip` is
non-null `MEDIUMTEXT`, both `utf8mb4`. The MUD SQL harness passes maximum-size
and escaped-content storage, rollback/retry, replay, and legacy TEXT-capacity
upgrade checks. The codec suite passes all five tests.

The earlier persistence limit remains: successful commit is atomic, but the
pre-commit queue is in memory. This audit does not establish crash survival for
accepted commands that have not committed. It also does not establish recovery
of the missing snapshots in battles 1–2. Deploying a reader cannot recreate
historical text that was not stored.

## Findings requiring follow-up

### 1. High — delayed battle information is available through secondary APIs

The advertised setting says how long to wait before showing new battles.
Only `getPvPEvents` and `getPvPEventDetail` in
[pvpService.ts](../../backend/src/services/pvpService.ts) load/apply that delay.
Leaderboards, player statistics, autocomplete, analytics, favorites, comments,
and interaction counts do not consistently enforce it. The character-profile
history query in `forumService.ts:2638` also lacks the cutoff.

**Executed reproduction:** with a synthetic event stamped `NOW()` and a
15-minute delay, list/detail conceal it, but leaderboard and player statistics
identify its participants; player/location autocomplete and timeline include
it; favorites expose its event ID; comments and interaction stats are readable.
The fixture can also favorite/comment on it before release. Character-profile
history was source-reviewed, not separately fixture-executed.

This is early disclosure of battle metadata and interactions; it is **not**
evidence that the detail API exposes embargoed raw logs or private equipment.
Apply one visibility rule to every public battle-derived read and interaction
target. Add a fresh-event test across the complete public route set.

### 2. Medium — participant filters remove other participants from the result

`getPvPEvents` filters the same `p` rows used by `GROUP_CONCAT` to construct teams.
Filtering by player, class, race, level, or alignment therefore produces partial
battle cards instead of complete teams for matching battles. Count and data
queries also differ: the data join requires `inroom=1`, the count join does not.

**Live reproduction:** filtering for one historical killer returns a card with
one killer and zero victims, despite its detail having two killers and one
victim. **SQL reproduction:** filtering for an out-of-room participant reports
`total=1` with zero returned events.

Select matching event IDs using an `EXISTS` predicate or separate participant
alias, then aggregate all displayable participants. Align count/data eligibility
and explicitly decide whether out-of-room participants should match searches.
Cover all participant filter types and both team sizes in regression tests.

### 3. Medium — statistics use descriptions and prefix matching as identity

`getLeaderboard` groups by the entire `player_description`. A level, class,
guild, or formatting change can split one PID into multiple standings entries.
`getPlayerStats` uses `LIKE '%] NAME%'`, allowing a name to match a longer name.

**SQL reproduction:** the same PID captured as level 50 and level 51 becomes two
one-kill leaderboard entries. Querying synthetic `Alpha` also counts the death
of `Alphabeta`, yielding two kills/one death instead of two kills/zero deaths.
One live PID already has multiple descriptions, but the current live kills
leaderboard itself has five distinct names; duplicate live standings are not
claimed.

Aggregate by stable battle participant identity, choose presentation metadata
separately, and perform exact name resolution. Preserve historical records when
current character rows are absent. Autocomplete similarly deduplicates names
after SQL pagination, which can yield short/incomplete pages as history grows.

### 4. Medium — “Date To” excludes almost the entire selected day

The UI sends a date-only value. `getPvPEvents` compares it with `e.stamp <= ?`,
which treats that date as midnight at its start.

**Live reproduction:** `date_from=2026-10-16&date_to=2026-10-16` returns zero;
changing only `date_to` to `2026-10-17` returns the three October 16 battles.
A noon SQL fixture on a selected single-day range is also excluded.

Define the timezone of calendar filters and translate the end day into an
exclusive next-day bound. Test midnight, midday, and the following midnight.

### 5. Medium — timezone-naive API timestamps are parsed as browser-local time

Database `NOW()` and UTC agree on this host. The API returns strings such as
`2026-10-16 03:34:39`, without an offset. Both PvP views call
`format(new Date(dateString), ...)`.

**Browser reproduction:** in `America/New_York`, the battle time parses to
`2026-10-16T07:34:39.000Z`, four hours after the stored UTC instant. The display
continues to show the server wall-clock hour without explaining that convention.

Publish timestamps with an explicit timezone and choose either clearly labeled
server time or correctly converted local time. Test at least UTC and a non-UTC
browser, including date boundaries. Do not change historical values by treating
current character or browser settings as evidence of their original timezone.

### 6. Medium — in-app and browser notifications link to an unsupported route

[App.vue](../../frontend/src/App.vue) and
[useNotifications.ts](../../frontend/src/composables/useNotifications.ts) use
`/pvp/battle/:id`; the router defines `/pvp/:id`.

**Browser reproduction:** inject a synthetic `NEW_PVP_EVENT` into the browser's
intercepted socket, click **Click to view details**, and navigation reaches
`/pvp/battle/5` without rendering the battle. Directly opening that URL fails the
same check. The same injected event successfully invalidates/refetches the PvP
list, so the client refresh callback works.

Use the canonical battle route in both notification paths and add a click-through
test. `pushNotificationService.ts` already uses `/pvp/:id`; do not conflate that
separate push-delivery path with the two broken links.

### 7. Medium — notification polling couples release delay to polling frequency

In [index.ts](../../backend/src/index.ts), `checkForNewEvents` fetches only one
latest visible event. The timer interval is `pvpDelayMinutes * 60 * 1000`, fixed
at startup. This is source-confirmed behavior, not a measured live burst test.

- At the current 15-minute delay, an already-open page may wait roughly another
  polling interval after a battle becomes eligible. Multiple newly eligible
  events produce a notification only for the latest one.
- Changing the delay does not recreate the running interval. A zero-delay start
  supplies `setInterval(..., 0)`, resulting in a rapid timer rather than a sensible
  independent polling cadence. Async polls can overlap.

Use a positive independent interval, prevent overlap, and fetch every event
after the cursor in a deterministic order. Test zero delay, changed settings,
multiple events per poll, reconnect, and timestamp ties. No production setting
was changed to exercise the zero-delay case.

### 8. Medium — advanced search drops sort order; live pagination is inconsistent

The frontend sends `sort_by=likes` to `/search` when advanced filters are active,
but that route does not put `sort_by` into `SearchFilters`. An isolated route
probe confirms `/events` forwards `likes`, while `/search` forwards no sort.
Thus **Popular** silently becomes date order when an advanced filter is used.

Other live probes: `/api/pvp/players?limit=-1` returns 500, and
`/api/pvp/search?limit=1000` reports a limit of 1000 while the service caps its
query at 100. Nonnumeric level filters are silently ignored.

**Concurrent work:** the independent source changes now normalize pagination
across these routes; their added tests pass in the final run. Final live probes
still reproduce the 500 and inconsistent limit. Sorting and level/date filter
validation remain separate gaps. Validate filters centrally, forward sort order,
and verify normalized response metadata after any separately authorized release.

### 9. Low — deleting a comment does not update the stored comment count

`createBattleComment` increments `pkill_event.comment_count`;
`deleteBattleComment` only marks the comment deleted. No production trigger
maintains these counters.

**SQL reproduction:** create and delete one comment; stats still report one
comment while no nondeleted comment remains. The API returns a deleted
placeholder, so decide explicitly whether the badge counts visible contributions
or retained thread slots. If it is intended to count active comments, decrement
atomically and idempotently; account for replies and repeated deletion.

Current production has zero comments, likes, and favorites, with consistent
counters. This is a fixture-confirmed behavior, not an existing live-count
incident. Like/duplicate-like/unlike transactions passed the fixture lifecycle.

### Additional limits

- Class-matchup analytics reads at most 1,000 matchup rows without deterministic
  ordering. Its totals are not a complete-history guarantee at larger scale.
- Group-side `KILLER` semantics include assists; the MUD maps killer-group roles
  to that legacy string. Do not reinterpret these statistics as final blows
  without a deliberate contract change.
- The existing custom dialogs lack dialog semantics and Escape-key dismissal.
  Mouse close controls work. Keyboard/accessibility qualification remains open.

## Browser verification

Browser plugin not available. Used existing cached Playwright and Chromium
140.0.7339.186 with its existing local library directory; installed nothing.
Public HTTPS was used with real production APIs except the explicitly described
browser-only event and long-log fixtures.

| Check | Result |
| --- | --- |
| Route/title identity and meaningful content | Passed for `/pvp`, `/pvp/1`, `/pvp/5` |
| Framework overlay, page errors, console errors/warnings, failed HTTP responses | None observed in the final main flow |
| Desktop 1440 × 1000 | List, detail, POV switch, equipment, maximize, close passed |
| Mobile 390 × 844 | Detail, equipment/comments/log tabs passed; no page-width overflow |
| Historical empty state | Missing log and privacy explanation rendered correctly |
| Long-log fixture | 1,000-line preview expands to all 1,501 synthetic lines |
| Browser event fixture | List refetch passed; notification navigation failed as finding 6 |
| Non-UTC context | Reproduced finding 5 |
| Screenshots | Desktop/mobile and equipment/empty-state evidence inspected; retained privately outside Git |

Initial automation assumed anchor-based list navigation and standard dialog
roles/Escape handling. Those assumptions were corrected to the actual **View
Details** and **Close** controls before reporting the final results. The remaining
notification failure is an application defect, not a locator timeout.

## Commands, results, and limitations

Commands ran from the website root unless stated otherwise. `$PVP_AUDIT_DIR`
denotes the private temporary directory outside both checkouts. The disposable
SQL server used loopback port 34897 and fixture-only credentials; production
credentials were loaded only in memory for read-only inspection.

| Command / probe | Result |
| --- | --- |
| `TEST_PVP_DB_PORT=34897 pnpm --dir backend test --runInBand src/services/__tests__/pvpService.test.ts src/routes/__tests__/pvpIdValidation.test.ts` | Initial 16 passed; final 52 passed after concurrent pagination tests appeared; all three real SQL contract cases ran |
| `pnpm --dir frontend test:unit --run src/views/__tests__/BattleDetailView.spec.ts src/utils/__tests__/ansiParser.spec.ts` | 15 passed |
| `pnpm --dir backend format:check` | Passed, 281 files |
| `pnpm --dir backend lint` | Passed |
| `pnpm --dir backend type-check` | Passed |
| `pnpm --dir backend verify:mud-writes` | Passed, 53 classified writes |
| `pnpm --dir frontend format:check` | Passed, 642 files |
| `pnpm --dir frontend lint` | Passed |
| `pnpm --dir frontend type-check` | Passed |
| `./scripts/check-config-literals.sh` | Passed |
| MUD: `python3 tests/async/test_combat_outcome_transactional_cutover.py` | 5 passed |
| MUD: `TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=34897 TEST_DB_USER=<fixture-user> TEST_DB_PASSWORD=<fixture-password> bash tests/async/run_combat_outcome_schema_mysql.sh` | Passed: snapshots, limits, rollback/retry, replay, ledgers, legacy capacity/preservation tests |
| `node "$PVP_AUDIT_DIR/live-audit.mjs"` and inline Node mysql2/HTTP probes | Live inventory, public/origin comparison, schema/settings, exact SQL/API content and privacy comparisons, date/validation reproductions |
| `node "$PVP_AUDIT_DIR/sql-audit.mjs"` | Current service source transpiled into a temporary module with an isolated SQL pool/settings adapter; reproduced findings 1–4 and 9 and verified privacy/like lifecycle |
| `node "$PVP_AUDIT_DIR/route-audit.mjs"` | Current Express router with a recording service adapter confirmed dropped search sorting |
| `LD_LIBRARY_PATH=<existing-browser-libraries> node "$PVP_AUDIT_DIR/browser-audit.mjs"` | Seven main checks passed; unsupported notification URL check failed |
| Same invocation for `browser-probe.mjs` and `browser-events.mjs` | Page diagnosis; client-only socket event, timezone and long-log checks |
| `git diff --check` and report-link checks | Passed on final documentation review |

Supporting commands: `pwd`, `rg --files`, `rg -n`, `cat`, `sed`, `head`, `tail`,
`ls`, `command -v`, `ps`, `git status --short`, `git diff`, `git diff --stat`,
`git rev-parse HEAD`, and corresponding read-only `git -C` calls in the MUD;
`systemctl [--user] show/list-units` inspected state. Python helpers inspected
`/proc` executable identity/hashes, checked the unused fixture port, and edited
temporary probe scripts. `mktemp -d`, `mariadb-install-db --no-defaults`, and
`mariadbd --no-defaults` created/ran the disposable instance. Fixture setup issued
CREATE/INSERT/UPDATE/DROP only there. `mariadb-admin --no-defaults
--socket=<temporary-socket> -uroot shutdown` stopped it, and the process handle
confirmed exit. `chmod 700` protects the temporary evidence directory.

Discovery/diagnostic failures: project-local `pnpm --dir frontend exec playwright
--version` was unavailable; cached tooling worked. Several guessed source paths
were absent. The first settings query used incorrect column names and was
corrected to `setting_key`/`setting_value` inside a read-only transaction. The
first MUD SQL invocation supplied a password to the disposable server's
passwordless root; it failed authentication before setup, then passed using a
dedicated fixture user. A temporary browser script had a syntax error before
launch; it passed after correction. Negative schema-verifier messages in the
MUD harness are expected refusal cases; the final command exited zero.

Not run: full package suites, new production builds, production preflights,
live authenticated likes/favorites/comment posting, real combat generation,
live delayed-release/burst timing, external notification delivery, crash/restart
recovery, or other browser engines. Existing unit route authentication is
mocked; isolated service mutation tests do not establish live account/session
authorization. Builds were unnecessary for this documentation-only audit and
would risk replacing served artifacts in this production checkout. Package
configuration and palette gates were not run because no configuration or UI
source was changed by this audit. No Website Changelog entry is needed for
this findings-only deliverable.

## Suggested repair order and acceptance

1. Close delayed-event disclosure across all public surfaces; use fixtures to
   prove both concealment before the cutoff and release afterward.
2. Correct event selection/team aggregation, stable player identity, inclusive
   calendar dates, explicit timestamp zones, and advanced-search sorting.
3. Fix notification routes and independent polling/cursor behavior; cover a burst
   of events and a real rendered click-through without sending external messages.
4. Finish/review the separate pagination repair and decide comment-count semantics.
5. After an authorized release, repeat the public/origin/browser checks and verify
   a newly committed battle from SQL through delayed public rendering. Preserve
   equipment privacy and document historical snapshots that remain unavailable.

Keep live gameplay, external notifications, and recovery exercises separate from
this read-only production investigation. These findings are not a claim that
every failure mode or authenticated interaction has been qualified.

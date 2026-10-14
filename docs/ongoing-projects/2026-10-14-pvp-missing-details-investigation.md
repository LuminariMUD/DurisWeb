# PvP missing details investigation

Investigated on 2026-10-14 UTC. Status: source repair complete and validated in both repositories; not deployed.

## Repair progress

- [x] Capture formatted descriptions, equipment, and public logs before handing
  the outcome to the persistence worker; persist snapshots atomically.
- [x] Version the payload; verify v1/v2 decoding, maximum-size serialization,
  bounded fields, database round trips, rollback, retry, and operation-ID replay.
- [x] Handle name-only historical records and filter by captured numeric level.
- [x] Allow all returned participants to be selected and explain missing/hidden data.
- [x] Finish final package checks and isolated builds; record verification limitations.
- [x] Record validated artifacts and production rollout status.

Implementation decisions and results:

- Payload v3 carries owned equipment/public-log strings; v1/v2 decode with empty
  snapshots. The database writer saves these with the existing outcome
  transaction. Game-thread capture restores formatted level/class/name/guild/race
  details before death changes equipment or level. Only public log text is copied.
- Equipment appends are bounded to the existing buffer capacity. Limits remain
  65,535 equipment bytes and 99,999 public-log bytes per participant. All 15
  participants at both limits pass serialization; maximum-length, heavily escaped
  fields also round-trip through MariaDB. The command payload ceiling is 3 MiB,
  with 128 KiB for encoded metadata. Coordinator admission retains its 64 MiB budget.
- Website readers accept bare names, return captured levels, and use numeric
  level filtering. Formatted descriptions with space-padded single-digit levels
  retain their class metadata. Missing historical class/race/guild details are
  not reconstructed from current character state.
- Detail selection includes participants without logs. Desktop and mobile
  equipment controls distinguish privacy-hidden equipment from absent snapshots.
  Existing delay, in-room filtering, role semantics, and privacy settings remain.
- Focused tests now pass: 5 MUD capture/codec tests, critical-command codec,
  admission and coordinator tests, the MariaDB transaction harness, 16 backend
  service/route/SQL cases, and 8 frontend mounted-view cases. SQL fixtures use a
  dedicated disposable instance and synthetic credentials; production data has
  not been modified.
- Both isolated website builds and the MUD production-profile candidate built
  successfully after the final changes. Required website format, lint, type,
  palette, configuration-literal, and MUD-write checks pass. The disposable
  database was shut down after verification.

Persistence limitation: this repair uses the existing in-memory writer queue.
A committed outcome and its snapshots are atomic and replay is idempotent;
a crash can still lose commands that have not committed. Clean shutdown and
copyover attempt to drain the queue. No pre-commit crash journal or historical
snapshot recovery is introduced. This clarifies the original recommendation's
use of “durable persistence”; it does not claim crash survival before commit.

No production rollout has occurred. Source and staged artifacts are distinct
from the currently running MUD/backend and served frontend assets.

### Repair verification record

Commands ran from the relevant repository root. Website builds used a separate
protected staging directory (`PVP_WEB_STAGE` below), with installed dependencies
linked in; production `backend/dist` and `frontend/dist` were not overwritten.
SQL runs used a dedicated temporary MariaDB server, loopback port 34763, and
fixture-only schemas and credentials. No checkout environment was used by the
MUD database wrapper. Temporary server/schema setup and removal were confined
to that instance.

| Command | Result |
| --- | --- |
| `TEST_PVP_DB_PORT=34763 pnpm --dir backend test --runInBand src/services/__tests__/pvpService.test.ts src/routes/__tests__/pvpIdValidation.test.ts` | 16 passed, including 3 real SQL cases |
| `pnpm --dir frontend test:unit --run src/views/__tests__/BattleDetailView.spec.ts` | 8 passed; actual mounted view and selection control, mocked API |
| `pnpm --dir backend format:check` | Passed, 278 files |
| `pnpm --dir backend lint` | Passed |
| `pnpm --dir backend type-check` | Passed |
| `pnpm --dir backend verify:mud-writes` | Passed, 53 classified writes |
| `pnpm --dir frontend format:check` | Passed, 639 files |
| `pnpm --dir frontend lint` | Passed |
| `pnpm --dir frontend type-check` | Passed |
| `./frontend/scripts/check-palette-literals.sh` | Passed |
| `./scripts/check-config-literals.sh` | Passed after replacing a host-specific URL in this report with its configured-origin placeholder |
| `pnpm --config.verifyDepsBeforeRun=false --dir "$PVP_WEB_STAGE/backend" build` | Passed |
| `pnpm --config.verifyDepsBeforeRun=false --dir "$PVP_WEB_STAGE/frontend" build` | Passed; existing large-chunk warning remains |
| `python3 tests/async/test_combat_outcome_transactional_cutover.py` | 5 passed; capture ownership/public-only logs, v1/v2 decoding, v3 codec, malformed/oversize refusal, full 15-participant maximum-size encoding |
| `python3 tests/async/test_critical_command_codec.py` | Passed |
| `python3 tests/async/test_critical_command_admission.py` | Passed |
| `python3 tests/async/test_critical_command_coordinator.py` | Passed |
| `bash tests/async/run_combat_outcome_schema_mysql.sh` with explicit `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD` fixture settings | Passed; rich/max-length snapshots, rollback after partial insertion, identical-command retry, replay without duplicates, existing ledger behavior |
| `nice -n 10 make -C src -j2 dms_new BUILD_PROFILE=production DMS_BINARY=../bin/pvp-validation/dms_new` | Passed; candidate output only |
| `./scripts/format.sh` in the MUD | Changed lines formatted |
| `./scripts/format.sh --check` in the MUD | Passed during commit/push follow-up after whitespace-only cleanup of the three files with pre-existing namespace formatting drift. All 5 focused capture/codec tests also passed again. |
| `git diff --check` in both repositories | Passed |
| Python local-link and staged-entry-asset checks | Passed; all 40 referenced entry assets exist |

Additional command record: `pnpm --dir <package> exec biome format --write`
formatted the changed package files; `git status`, `git diff`, `git show HEAD:<path>`,
`clang-format --assume-filename`, `rg`, `cat`, `sed`, `tail`, `stat`, and small
Python file/fixture helpers supported review and artifact verification. Private
build logs and source/artifact hashes were recorded outside the checkout.
`mariadb-admin --no-defaults --socket=<temporary-socket> -uroot shutdown`
cleanly stopped the disposable server. `git check-ignore` confirms the earlier,
separate generated-statistics ignore rules remain in place.

Resolved validation failures: the initial MUD build exposed missing declarations
for the restored capture calls; the guild include and existing equipment-helper
prototype fixed them. Initial test expectations were corrected for initial POV
watcher timing and retained race color codes. The SQL wrapper correctly refused
an empty fixture password and a reused fixture database; fixture-only credentials
and recreation of only that disposable schema allowed the successful final run.
The first staged package invocation warned about automatic dependency verification
on symlinked dependencies; the final commands above disable that verification and
build successfully without installing or changing dependencies.

Browser validation was attempted using the existing Chromium executable and a
local synthetic fixture server. Chromium cannot start because `libXdamage.so.1`
is unavailable; `--version` and `ldd` confirm the missing library. No browser
packages were installed. Mounted desktop/mobile control tests pass, but actual
browser layout, screenshots, console behavior, and authenticated flows remain
unverified. Full package suites, production preflights, and live combat gameplay
were not run; validation was limited to the affected behavior and required
package gates. No production migration, settings change, restart, or backfill ran.

### Candidate artifacts and activation

Both repositories were published directly to `master` at the owner's request.
The MUD repair is commit `40f125b3a`, followed by formatting-only commit
`d27e2b5ec`; the website repair is commit `247638b`. Production activation
remains pending.

These SHA-256 identities refer to the isolated validation builds, not live
artifacts. Rebuild from published `master` before deployment: the MUD candidate
predates the later formatting cleanup and a concurrent new-character default
change already published separately to MUD `master`.


| Candidate | SHA-256 |
| --- | --- |
| Backend `dist/services/pvpService.js` | `6fa6ec42a0ee1a7705f1e34bfb138d950f8c2381ab1fc649397613b02189b259` |
| Frontend `dist/index.html` | `b9befc19c6491af8cdeaf713b50d5c9759529e5041093e29aea817f3504c76a6` |
| MUD production-profile `dms_new` | `90032e2e0ae047cba8c1dbbe0bfa568143fa5059b591ef0d9ac3ed58aca41065` |

No schema migration is needed. A later authorized release must publish the
website backend/frontend together and activate the MUD candidate through its
normal controlled restart/copyover procedure, with the existing deployment
preflight and recovery gates. Drain accepted work before replacing the MUD;
the old executable does not understand v3 payloads. Preserve the previous
binaries/assets for rollback. The Cloudflare ingress remains required.

After activation, verify name-only historical entries, numeric level search,
leaderboard/autocomplete identities, no-log selection, and privacy messages.
Verify a newly recorded controlled battle has formatted descriptions and
captured public snapshots in SQL, then verify the delayed public response with
privacy enforcement. Existing battle #1 still has no recoverable log/equipment
snapshot established by this investigation; deploying cannot recreate it.

The sections below record the original investigation and its validation, before
the repair. References to unchanged code and unrun checks below describe that
initial investigation only; current repair results are recorded above.

## Investigation scope

Scope: the production `/pvp` list, battle #1 at `/pvp/1`, its public APIs,
the stored battle, and the paired MUD's persistence implementation. Only this
report was added; no application, MUD, database, settings, or deployment changes
were made. Participant names, account identifiers, raw logs, and credentials are
intentionally excluded from this report.

## Findings

The battle reaches the website successfully, but the MUD's transactional combat
writer does not persist its combat logs or equipment snapshots, and captures
only names where the website expects formatted participant descriptions. The
website then compounds the problem by parsing those descriptions for identity
and metadata, and by allowing POV selection only for participants with logs.

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| High | Combat logs and equipment snapshots are absent at the source | All three stored participant rows have zero-length `log` and `equip`. The MUD writer explicitly inserts empty strings into both columns. Reloading the page cannot restore them. |
| High | Participant description contract was lost | All three descriptions are name-only. Names disappear from parsed leaderboard/autocomplete results, level/class/race metadata is missing, and level search excludes the battle despite populated numeric levels. |
| Medium | Empty logs make the detail page's selection flow unusable | Both POV options and automatic selection exclude participants without logs. For this response there are zero options; the page's fallback asks the visitor to select a participant. This follows from source and the publicly served bundle; browser interaction was not executed. |
| Expected privacy behavior | Equipment is also withheld by `webinfo` | `respect_webinfo_toggle=true`, and the equipment visibility bit is off for all three participants. The API returns `equip: null`, even though the underlying stored value is an empty string. Restoring snapshots must preserve this privacy gate. |

## Production evidence

At inspection, the database contained one `pkill_event` and three `pkill_info`
rows. Battle #1 has a matching `combat_outcome` row, tying it to the transactional
writer. All three participants are marked `inroom=1`, so the website's in-room
join is not dropping anyone from this particular event. All three still have
matching `player_data` rows.

Read-only observations, confirmed again before completing the report:

| Surface | Result |
| --- | --- |
| `GET /pvp` | HTTP 200; application HTML references the same entry asset as local `frontend/dist/index.html`. |
| `GET /api/pvp/events?limit=1` | HTTP 200; one event, two killer-side participants and one victim. |
| `GET /api/pvp/events/1` | HTTP 200; three participants, each with an empty log, a name-only description, and `equip: null`. Numeric participant levels are present. |
| `GET /api/pvp/search?level_min=50` | HTTP 200; zero results, although all three captured numeric levels meet this threshold. |
| `GET /api/pvp/stats/leaderboard?type=kills&period=all` | HTTP 200; two entries, both with empty `playerName`, `class`, and `race`, and `level: 0`. |
| `GET /api/pvp/players` | HTTP 200; empty array despite the three participants. |
| `GET /api/pvp/analytics/class-matchups?period=all` | HTTP 200; empty array because the required class metadata cannot be parsed. |
| SQL snapshot lengths | `CHAR_LENGTH(log)=0` and `CHAR_LENGTH(equip)=0` for all three rows. No description starts with a bracketed numeric level. |
| SQL website settings | PvP delay is 15 minutes; equipment visibility respects `webinfo`. The event is already past the delay. |

The detail and leaderboard JSON responses from the public hostname and the
configured local origin were identical. The public
`/assets/BattleDetailView-yMg9_Ccs.js` matched the local served build byte for
byte by SHA-256 comparison. That bundle contains the same log-only selection
filters and empty-state prompts as the inspected Vue source. The public HTML
was not byte-identical to local HTML, so only its entry-asset identity, not full
HTML equivalence, is asserted.

These checks establish that the missing fields exist in production persistence
and API responses; the symptoms are not explained by a frontend asset mismatch,
the 15-minute delay, or a public-versus-origin API discrepancy.

## Where the data is lost

MUD paths below are relative to the paired MUD checkout, separate from DurisWeb.

1. `src/combat/fight.c:818`, `combat_outcome_add_participant`, captures level and
   racewar along with the participant's identifiers and reward information.
   At line 853 it assigns `GET_NAME(ch)` to `entry.description`. It does not
   capture the former formatted level/class/name/guild/race description.
2. `src/combat/combat_outcome_command.h:46` defines the participant payload.
   It has a bounded description field, but no combat-log or equipment fields.
   The codec in `src/combat/combat_outcome_command.c` therefore cannot carry
   those snapshots across the worker boundary.
3. `src/combat/combat_outcome_repository.c:329` inserts into
   `pkill_info(...,player_description,equip,log,inroom,leader)`. The values
   following the escaped description are explicitly `''` and `''`.
4. DurisWeb's [detail query](../../backend/src/services/pvpService.ts) at
   lines 256–338 reads these stored fields. It returns the stored log and
   description and applies the separate equipment privacy gate at lines
   271–277. The route does not fetch another combat-log source.

### Regression provenance

MUD commit `65ae3d71be20f038dbf941adf196e27bc77575a1`,
`feat: batch pvp combat outcomes` (2026-08-27), introduced the name-only capture
and empty snapshot writes. Its `src/fight.c` diff replaces the death path's
`sql_save_pkill(...)` calls with `submit_pvp_outcome(...)`.

The parent revision's `src/sql.c:1820–1872` shows the former contract:

- `get_pkill_player_description` formats level, class, name, guild, and race.
- `store_pkill_info` calls `get_equipment_list(ch, buf, 1)`.
- It copies `GET_PLAYER_LOG(ch)->read(LOG_PUBLIC, MAX_LOG_LEN)`.
- It inserts those captured values into `player_description`, `equip`, and `log`.

The regression is therefore a loss of presentation snapshots during the
transactional persistence cutover. This is source-history attribution, not a
claim that the currently running executable was built from today's checkout
HEAD. The live rows and linked outcome independently demonstrate the affected
behavior.

Inspected revisions:

- DurisWeb: `1de9debcf435d28f50eb92ac92bb7115f1ff24aa`.
- DurisMUD: `ca64ba6203b16c849780004f72cd15a8776fecaa`.

## Website consequences

The list and team cards render `player_description` directly. With the current
records they can show names, but no captured level, class, race, or guild.

[Backend name extraction](../../backend/src/utils/stringUtils.ts) at line 35
requires a closing bracket followed by a name. A bare name produces an empty
string. In [pvpService.ts](../../backend/src/services/pvpService.ts):

- Leaderboards at lines 408–427 parse metadata from descriptions instead of
  using the captured numeric level.
- Player autocomplete at lines 627–689 rejects rows with an empty parsed name.
- Level filters at lines 111–123 extract a number from the description rather
  than filtering `p.level`.
- Class/race/alignment filters and class-matchup analytics also depend on the
  formatted description. Their absent metadata cannot be recreated by parsing
  the current strings more carefully.

[BattleDetailView.vue](../../frontend/src/views/BattleDetailView.vue) repeats
the bracket-based name parser at line 32, so name-only participants do not
enter its account-verification lookup or become verified profile links.
This is a source-derived consequence; profile navigation was not browser-tested.

The same view filters participants by truthy `log` for automatic POV selection
at lines 210–235 and for selector options at lines 284–315. The current response
leaves `selectedPovId` unset and produces no options. Desktop and mobile fallbacks
then say “Select a participant to view their combat log.” Equipment selection
also depends on that selected participant. Even a future equipment-only record
would remain inaccessible through this selection flow unless the UI is changed.

### Additional role-contract observation

The outcome stores one `killer_group` role, but `pkill_info` exposes both
killer-side participants as `KILLER`. The current repository maps both roles
to that string. This is not established as a new regression: the legacy writer
also wrote killer-group members as `KILLER`. Preserve or deliberately clarify
that semantics when fixing the snapshot contract; changing it blindly would
also affect analytics that use `pk_type = 'KILLER'`.

## Recommended repair scope

1. **Restore MUD presentation snapshots at the event boundary.** Capture the
   formatted description, public combat log, and equipment while the game-loop
   state is valid. Carry immutable, bounded data through the existing durable
   persistence mechanism and write it with the corresponding event/participant.
   Keep worker code free of live character pointers and game-state access.
   Account for payload size limits, maximum participant count, command-version
   compatibility, retries, replay, and crash recovery. Do not restore synchronous
   SQL calls on the game loop or add an untracked best-effort write after commit.
2. **Make website readers handle existing name-only records.** Provide a safe
   name fallback in both parsers and use captured `p.level` for level filtering
   and metadata where appropriate. Show unavailable class/race information
   honestly; current character metadata is not necessarily the battle-time value.
3. **Repair the empty-log UI.** Explicitly say when no combat logs were captured.
   Allow participant/equipment selection independently of log availability, and
   avoid prompting for an impossible selection. Preserve equipment privacy;
   a hidden snapshot and an absent snapshot should not be described as identical
   states if the API can safely distinguish them.
4. **Add tests for the cross-repository data contract.** Cover rich snapshots,
   legacy name-only rows, no-log and equipment-only participants, numeric level
   filtering, autocomplete/leaderboard identity, and `webinfo` on/off. Verify
   snapshots survive serialization, persistence, retries, and public rendering
   using isolated fixtures and a test database.

The existing MUD
`tests/async/test_combat_outcome_transactional_cutover.py:108–123` checks routing
and explicitly asserts that the submission function contains neither
`GET_PLAYER_LOG` nor `get_equipment_list`. Its codec fixture supplies only a
description. These tests do not establish snapshot completeness; revise them
to preserve the worker-safety requirement while proving capture and delivery.
The website's existing `pvpIdValidation.test.ts` mocks the PvP service and checks
route ID handling, so it cannot detect these storage/description regressions.

### Recovery of this existing battle

The stored event retains participant identity, numeric levels, room/time, and
outcome information, but its equipment and log snapshots were never written
by this path. A frontend release or SQL reindex cannot reconstruct them.
The MUD's `PlayerLog` is a bounded in-memory buffer (`src/player/player_log.h`);
it is not evidence of a durable battle-time archive.

No archival recovery has been proven. A separately retained, trustworthy
battle-time source would be needed to restore historical logs/equipment or
missing class/race/guild snapshots. Current equipment and current character
metadata must not be presented as exact historical snapshots. Any later data
repair needs its own reviewed scope. Disabling `webinfo` enforcement would
neither restore missing data nor be an appropriate repair.

## Verification and limitations

All network probes used public GETs, plus GETs to the configured local origin
for comparison. Database inspection used a dedicated mysql2 connection, loaded
credentials in memory, began `START TRANSACTION READ ONLY`, selected only the
needed rows/settings and diagnostic fields, then rolled back and closed it.
No application services were imported to perform the SQL inspection.

The final assertion probe checked API shape, empty logs/equipment responses,
description format, filter failure, missing parsed identities, public/origin
equivalence, database snapshot lengths, privacy flags, and the outcome link.
`git diff --check` and report-link validation passed. Worktree review confirmed
that this report is the only added task artifact; the pre-existing untracked
`backend/public/` directory was preserved, and the MUD worktree remained clean.

Browser plugin not available. `pnpm --dir frontend exec playwright --version`
failed because Playwright is not installed; Python Playwright was also absent.
No dependencies were installed. Browser DOM, screenshots, console checks,
desktop/mobile interactions, and authenticated flows were not tested. UI claims
above distinguish source/bundle evidence from executed browser evidence.

No package source was changed. Backend/frontend unit suites, `format:check`,
`lint`, `type-check`, builds, and `verify:mud-writes` were not run for this
documentation-only investigation. No MUD test harnesses, migrations, operational
scripts, restarts, settings changes, or gameplay actions were run. In particular,
building the production frontend checkout would publish assets and was not
needed to investigate this issue.

### Command record

Read-only inspection commands used in the investigation:

- `pwd`, `git status --short`, and `git rev-parse HEAD` in DurisWeb; matching
  `git -C /home/staging/duris status --short` and `rev-parse HEAD` in the MUD.
- `rg --files`, `rg -n`, `cat`, `sed -n`, `head`, and `tail` to inspect the
  repository instructions, root/package READMEs, development/conventions/security
  guides, PvP services/routes/types/views, database configuration, settings,
  test setup and PvP tests, MUD combat writer/payload/tests, legacy schema
  references, and player-log implementation. `ls -ld` checked documentation and
  dependency directories. The frontend debugging skill was read while assessing
  browser tooling; its browser workflow was not executed.
- `curl --fail --silent --show-error --max-time 25
  <public-origin>/api/pvp/events?limit=3` (using the configured production origin) and inline
  `node --input-type=module` GET probes for every endpoint in the evidence table,
  the public/local-origin comparisons, HTML entry-asset inspection, and the
  SHA-256 comparison of the served detail chunk.
- Inline `node --input-type=module` mysql2 queries for event/participant counts,
  description/log/equipment lengths, numeric levels, in-room flags, matching
  player existence, equipment visibility bits, the two relevant website
  settings, the combat-outcome link, and outcome roles. All successful database
  queries ran inside a read-only transaction.
- `git -C /home/staging/duris blame -L 845,854 -- src/combat/fight.c`;
  `blame -L 320,340 -- src/combat/combat_outcome_repository.c`; path-limited
  `git log -6`; and `git log --all -S 'GET_PLAYER_LOG(ch)->read'` for the old and
  current SQL paths. `git show -s 65ae3d71be`, `git show
  65ae3d71be^:src/sql.c`, and the `65ae3d71be` fight diff established provenance.
- `command -v playwright chromium chromium-browser google-chrome`,
  `pnpm --dir frontend exec playwright --version`, Python `importlib.util.find_spec`,
  and filename searches under existing cache/tool directories assessed browser
  availability. No browser or package installation was performed.
- `systemctl --user show` / `systemctl show` with only state/PID/start-time/path
  properties, and a Python `/proc` executable/working-directory inspection,
  checked process context. Guessed website unit names were absent; these probes
  are not used to infer website health, which was verified by HTTP.
- `date -u`, final read-only Node assertions, `git diff --check`, a Python report
  integrity/link check, and final status/diff review verified this deliverable.

Discovery failures had no production effect: the web browsing tool could not
open the supplied URL, but direct HTTPS requests succeeded; some historical
or guessed paths (`db/`, `combat_outcome.h`, `player_log.c`, and `siteConfig.ts`)
did not exist; the first direct dotenv file import failed before connecting
to SQL and was replaced with package resolution through `createRequire`.

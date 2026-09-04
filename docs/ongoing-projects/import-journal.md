# Legacy `prod.sql` import journal

## Scope and safety contract

- Requested: import `/home/duris/prod.sql` into the game's database without
  destroying existing data; record anything that does not import cleanly.
- Journal started: 2026-09-03 UTC.
- This file contains no credentials or row-level private data.
- Target resolved from `duris/.env`: production, loopback
  `127.0.0.1:3307/duris`, explicitly allow-listed.
- Initial service state: `duris-mud-production.service` and
  `durisweb-production.service` were both active.
- Source file mode is `0600`; size is 345,366,975 bytes.
- Verified source SHA-256:
  `8f882d16be743b42467890f7714052d64b1cf8eca75be89c77efaeb3d7e5cc44`.
  It is byte-for-byte the same dump covered by
  `duris/docs/persistence/LEGACY_DUMP_IMPORT.md`.
- Initial read-only target inventory: MariaDB 10.11.14, 249 base tables,
  immutable migration head 0008, 82 recorded DurisWeb migrations, 7 accounts,
  12 account-character rows, and 12 player rows. Eleven other target
  connections were active.
- The target identifies its MUD baseline as `fresh_bootstrap` and contains no
  `legacy_import_*` preservation archives. Therefore the documented prior
  reference import into a development database is not evidence that this live
  target already contains the dump.

## Critical finding

`duris/scripts/import_legacy_dump.py` is a guarded **replacement** importer,
not a merge tool. It backs up the target, drops all target tables/views/routines/
events, restores the dump, and migrates it. It deliberately rejects production.
Using or weakening that path here would violate the requirement to preserve
existing data, so it has not been run against the game database.

## Planned non-destructive path

1. Fingerprint and inspect the source offline.
2. Inventory the live target read-only and determine whether this exact dump was
   already imported by the documented 2026-08-31 process.
3. Restore and migrate the dump only in an isolated staging database.
4. Take and validate a fresh owner-only production backup before any merge.
5. Quiesce all writers, compare every table/key/row class, and insert only rows
   with a proven non-conflicting mapping. Never use blanket `REPLACE`,
   `INSERT ... ON DUPLICATE KEY UPDATE`, truncate, drop, or disable integrity
   safeguards on production.
6. Leave ambiguous/conflicting rows unchanged and record them below.
7. Verify both the MUD runtime contract and DurisWeb behavior before restarting.

## Import results and exceptions

### Staging attempt 1

- Result: safely failed during legacy migration step 143, before immutable
  migration application.
- Cause: the copied production environment retained `REDIS=TRUE`; the migration
  correctly refused its Redis cleanup because the isolated SQL target used
  `ENVIRONMENT=development`, not `local`.
- Recovery: the guarded importer automatically wiped the partial staging schema
  and restored its pre-attempt empty backup. Verified afterward: zero staging
  tables and zero staging connections.
- Impact: no production SQL or Redis mutation. Retry will set `REDIS=FALSE` in
  the staging-only environment; Redis is irrelevant to an offline SQL import.

### Staging attempt 2

- Result: all 143 legacy migration steps completed with Redis disabled, and the
  immutable runner advanced the isolated copy, but the final runtime verifier
  rejected its normalized metadata fingerprint.
- Expected MariaDB fingerprint:
  `92dd682008ba94f8aecc63595dc46f9d6f1f865adecd174e58e2a2ce14220f2c`.
- Observed staging fingerprint:
  `65932399e1d39ce1d11bcdb2be005d1da2312472670dd2239b24020db91d0aa5`.
- Recovery: automatic rollback again restored the staging schema to its empty
  pre-attempt state.
- Production comparison: the current live database passes the same read-only
  runtime verifier. The mismatch is isolated to legacy-dump convergence and
  will be diagnosed in staging; the verifier will not be weakened.

### Staging qualification

- Root cause of the fingerprint mismatch: the legacy migration sequence left
  one obsolete foreign key on `user_profile_stats.account_name`. No migration
  was bypassed or altered.
- The isolated legacy database was then advanced through the eight current
  DurisWeb migrations that post-date the dump. Those migrations removed the
  obsolete metadata and brought the isolated copy to all 82 recorded web
  migrations.
- Result: the current MUD runtime compatibility verifier passes unchanged on
  the staged legacy data. The qualified stage contains 257 base tables and
  1,773,796 rows (aggregate counts only).
- Eight tables exist only in the qualified legacy stage:
  `builder_notifications`, `forum_notifications`,
  `legacy_import_player_item_extra_descr`,
  `legacy_import_player_pet_item_extra_descr`,
  `legacy_import_server_reboots`, `players_core`,
  `prepstatment_duris_sql`, and `siege_objects`. Final disposition: the three
  `legacy_import_*` tables were copied as inert preservation archives;
  `forum_notifications` (2 obsolete rows) was explicitly skipped; the other
  four tables are empty and were not added to production.

### Candidate merge preparation

- Created an owner-only, transaction-consistent snapshot of the live target at
  `duris/tmp/legacy-import-work-20260903/production-analysis-snapshot.sql`
  (mode `0600`) without stopping or mutating production.
- Restored that snapshot into isolated database
  `duris_import_candidate_20260903`. It is the candidate on which the merge
  will be exercised first; production is still untouched.
- Source/target schemas share 249 tables. Four need special treatment:
  `account_login_history` and `forum_categories` differ only in column order,
  while `admin_action_log` and `wipe_history` have incompatible column types or
  shape. Inserts will always name columns explicitly; the two truly
  incompatible tables are excluded.
- A unique-key collision audit found 328 structurally new accounts and 773
  structurally new player rows. Existing target rows win every collision;
  source rows are never used to update or replace them.
- Legacy item identifiers require quarantine rather than a blanket copy. Across
  the three largest item payload tables, 38 rows have a missing/zero UID and
  23,366 rows are excess occurrences of duplicated UIDs. No nonzero legacy UID
  overlaps a current production UID. Only globally unique, nonzero UIDs with a
  valid and unambiguous ownership/container chain will be eligible; ambiguous
  rows and their descendants will be skipped and counted. The live UID
  allocator will only be advanced monotonically if eligible legacy items are
  ultimately inserted.
- Legacy `pages` contains 15 rows whose title is absent from the snapshot, but
  only 14 distinct such titles. Because title is not a database unique key,
  this source-side duplicate remains pending semantic review rather than being
  silently deduplicated.

### Candidate merge qualification

- A second frozen copy of the production snapshot was restored as
  `duris_import_reference_20260903`. It is never a merge target and provides a
  row-for-row preservation oracle for the candidate.
- Candidate attempt 1 stopped before canonical commit because
  `notifications.data` uses the current web schema's binary JSON collation,
  while the migrated source uses the database collation. The source values are
  valid `utf8mb4` JSON; the candidate now uses one explicit, lossless collation
  conversion for that column. Raw preservation archives created before the
  failed transaction were discarded with the disposable candidate rebuild.
- Candidate attempt 2 stopped before canonical commit because the fail-closed
  inventory found five non-empty tables without an explicit decision. The four
  stale corpse tables were classified as skipped; the append-only
  `zone_touches` history was classified for surrogate-ID remapping. The
  disposable candidate was rebuilt again.
- Candidate attempt 3 stopped before canonical commit because a validation
  query detected 12 missing combat-frag baselines. Those 12 were proven to be a
  pre-existing condition in the frozen production snapshot. The merge creates
  and validates baselines for every imported character but does not rewrite
  current characters merely to repair an unrelated prior condition.
- The final candidate run completed. The run is transactionally marked by dump
  SHA-256 so a repeat cannot duplicate remapped append-only history.

#### Candidate rows accepted

- Identity and character state: 328 accounts, 783 players, 783 exact
  account-character mappings, 119 account banks, and 673 account/IP rows.
  Opening currency, epic, and combat-frag baselines were created for every
  imported player; bank baselines were created for all 119 imported banks.
- Player components include 20,307 affects, 17,239 languages, 20,542 skills,
  1,259 timers, 673 undead-slot rows, 192 spellbooks, 57 recipes, 183 epic-bonus
  selections, 54,422 epic-gain rows, 764 leaderboard rows, 779 IP-state rows,
  14 offline messages, 363 progress rows, 5,160 world-quest rows, and 19,663
  shop-trophy rows.
- Items: 36,993 player items and 31,253 locker items passed the global UID,
  ownership, artifact, and container-ancestry checks. All 38 pet items were
  retained by allocating fresh UIDs above every legacy/current UID. Matching
  canonical item metadata was copied, and 68,284 baseline/current custody rows
  plus 715 owner-revision rows were created. The allocator moved monotonically
  from 25,000,001 to 53,582,089 in the candidate. The largest imported player
  inventory is 1,159 items, below the runtime limit of 4,096.
- Lockers and ships: 115 lockers, 136 chests, 71 access grants, 6 chest-log
  rows, 216 ships, 864 ship-armor rows, 216 crew rows, and 3,456 slot rows.
- Community/content: all 107 forum categories, 9 threads, 11 posts, 5 images,
  5 reactions, and 9 subscriptions; 1,674 notifications; 3 user profiles; 4
  website changelog rows and 99 reads; 5 missing `mud_info` entries; and 14
  source-only help pages (one row chosen for each distinct missing title).
- Append-only history: 158,139 log rows, 256,292 statistics rows, 195,092 page
  views, 2,180 visitor sessions, 54,037 health metrics, 648 normalized reboot
  rows, 505 zone-touch rows, 187 PK events, 802 PK participant rows, and 2 PvP
  comments whose referenced battle survived. Surrogate IDs are newly allocated
  only after proving the source history ends before the current history begins.
- Preservation archives copied verbatim: 289,015 raw player-item-description
  rows, 441 raw pet-item-description rows, and 648 raw reboot rows.

#### Candidate conflicts, normalization, and quarantine

- Current target rows always win: one account, one bank, one account/IP row,
  two player rows, three `mud_info` entries, and all 1,738 overlapping help-page
  titles were left unchanged. Twenty-nine considered player-skill rows also
  collided with current target keys and were left unchanged. Ninety-two
  account-character rows were not exact mappings to a newly accepted player;
  the one duplicate missing help-page title was not inserted twice.
- Current world association/guild definitions do not match the old database.
  Rather than attach players to the wrong guild, 176 imported nonzero
  association IDs and all 190 nonzero guild-status bitsets were reset to zero.
  Their final import disposition keeps those values normalized to zero in favor
  of current authority; see
  [legacy affiliation disposition](../post-import/legacy-affiliation-disposition.md).
  Seven forum-thread and nine forum-post character IDs that no longer identify
  an imported character were cleared, while their account-attributed content
  was preserved. Two imported PvP comments had unusable participant pointers;
  those pointers were cleared.
- Item evidence covered 107,172 rows in all UID-bearing payload tables. It
  contains 7,293 duplicated-UID groups (23,332 excess occurrences), affecting
  30,482 otherwise owner-eligible player/locker rows; 477 eligible rows use an
  artifact vnum; and 6,610 further rows have ancestry that reaches excluded or
  ambiguous evidence. Consequently 13,246 player-item payload rows and 25,011
  locker-item payload rows were not activated. Their associated canonical
  metadata was also left out. Raw descriptions remain in the preservation
  archive and the original dump/stage remains intact. The final disposition is
  retained, inactive quarantine with no bulk recovery; see
  [quarantined legacy item disposition](../post-import/quarantined-item-disposition.md).
- Three lockers and three chests were excluded for target identity conflict or
  obsolete association ownership; two locker-access grants then lacked an
  accepted visitor. Two ships belonged to conflicted players. The source also
  contains 1,236 ship-armor rows, 309 crew rows, and 32 slot rows without an
  accepted ship parent; foreign-key checks remained enabled and rejected no
  accepted row.
- Thirty-seven PvP comments reference PK events absent from the source dump and
  were left out rather than attached to a same-numbered unrelated event. Their
  final disposition is a permanent skip from this import with protected source
  retention; see
  [orphaned PvP comment disposition](../post-import/orphaned-pvp-comment-disposition.md).

#### Whole-table policy skips from the non-empty source

- Current authority/control: `account_bound_reward_pwipe_state` (1),
  `item_uid_allocator` (1; handled by monotonic advance), `level_cap` (1),
  `season_reset_state` (1), `mud_process_state` (1), `mud_schema_baselines` (1),
  `mud_schema_history` (8), `mud_schema_migration_state` (1),
  `mud_schema_migrations` (1), `knex_migrations` (82), and
  `knex_migrations_lock` (1).
- Security/admin/session: `admin_account_roles` (5), `admin_action_log` (142;
  also schema-incompatible), `admin_permission_audit` (5),
  `admin_permissions` (28), `admin_role_permissions` (29), `admin_roles` (4),
  `multiplay_whitelist` (2), `player_granted_cmds` (1),
  `suspicious_accounts` (14), `terminal_logs` (21,742),
  `terminal_sessions` (68), and `web_sessions` (195).
- Live transactional/temporary state: artifacts/binds (96/56/85 rows across
  `artifacts`, `artifacts_mortal`, `artifact_bind`); auctions and their old
  pickup/bid rows (249/248/30/67); boons and progress (46/1,835); corpses and
  their item payload/metadata (24/114/27/61); shopkeepers and their active
  state (70/517/161/842); and `server_incidents` (71, potentially unresolved or
  public).
- Current world/static/generated state: `associations` (3), `guilds` (3),
  `guild_members` (163), `guild_ranks` (24), `classes` (31), `races` (101),
  `zones` (355), `timers` (4), ship cargo prices/modifiers (200 each),
  `builder_flags` (590), all older wiki cache tables (409,254 rows in total),
  `wiki_settings` (2), and `forum_settings` (10). Supported publication of the
  currently empty object/mob generations remains tracked in
  [DurisWeb #8](https://github.com/LuminariMUD/DurisWeb/issues/8) and
  [DurisWeb #9](https://github.com/LuminariMUD/DurisWeb/issues/9).
- Operational/workflow data not portable to this installation:
  `deployment_log` (31), `gemini_analysis_log` (5), `mud_backups` (19),
  `help_file_suggestions` (48, superseded page IDs), and the obsolete
  stage-only `forum_notifications` (2).

#### Candidate verification

- Current runtime metadata contract: pass (174 required tables, immutable head
  0008).
- DurisWeb migrations: 82 completed, zero pending.
- Frozen-row proof: all 233,656 pre-existing rows across all 249 original
  tables remain byte-for-byte present. The only expected existing-row change is
  the monotonic `item_uid_allocator` advance. Three unkeyed static tables were
  also proven unchanged by count and database checksum.
- Foreign-key audit: all 123 declared relationships have zero orphan rows.
- Currency, epic, combat, item, artifact/guild, boon/zone, and auction
  reconciliation queries all report zero mismatches.
- Item topology: zero imported mismatch and zero pet mismatch. The checker sees
  14 mismatches, all 14 proven byte-for-byte pre-existing in the frozen target;
  none was introduced by this merge.

### Final production preflight

- Both production writers were stopped cleanly. Verified immediately before
  backup: MUD inactive, web inactive, and zero remaining connections to
  `duris`.
- Fresh owner-only backup:
  `duris/tmp/legacy-import-work-20260903/production-premerge-20260903T185345Z.sql`
  (mode `0600`, 54,129,150 bytes), SHA-256
  `227269e7ea6d3d61c01060d00bb645f6d4ea8aecb94ecccd05fa2e1f7d2638e1`.
- MariaDB's logical dump serialization rounded 110 single-precision
  `zones.frequency_mod` values on a test restore. The maximum observed delta
  was approximately 0.0000023842; no live value changed. An owner-only recovery
  companion was therefore created at
  `duris/tmp/legacy-import-work-20260903/production-premerge-20260903T185345Z-zones-float.sql`
  (mode `0600`, 23,760 bytes), SHA-256
  `84fbede59e52c6f6992cd82b61c968c712ed2ceaeeae853295e4879bbedd64cb`.
- The main backup plus companion were restored into
  `duris_import_final_reference_20260903`. All 235,313 live pre-merge rows in
  all 249 tables then matched the recovery copy exactly. This final reference
  will also be used to prove the merge did not change or remove an existing
  row.
- Live pre-merge runtime contract passes, DurisWeb has 82 completed and zero
  pending migrations, and the production database still has zero connections.

### Production merge and verification

- Result: **completed successfully**. The canonical production transaction
  committed at `2026-09-03T18:56:36.618227Z`. Its durable
  `legacy_import_runs` marker contains the exact source SHA-256, source size,
  import version `legacy-target-wins-v1`, and valid aggregate-only JSON report.
  The committed production counts match the qualified candidate counts above.
- The merge used insert-only, target-wins DML. It performed no delete,
  truncate, replacement, or blanket upsert. The sole existing-row operation
  was the guarded monotonic `item_uid_allocator` advance from 25,000,001 to
  53,582,089; its automatic `updated_at` timestamp advanced with it.
- Immediately after commit and before either writer restarted, production had
  253 base tables and 1,619,901 rows. The only four tables added to the original
  249-table schema are `legacy_import_runs` and the three inert preservation
  archives. Archive counts exactly match their source counts: 289,015 raw
  player-item-description rows, 441 raw pet-item-description rows, and 648 raw
  reboot rows.
- Frozen-row proof against `duris_import_final_reference_20260903`: all 235,313
  pre-merge rows across all 249 original tables remain present with identical
  values. The two nonempty unkeyed static tables also match by exact count and
  extended database checksum. There were zero preservation failures after
  accounting for the explicitly allowed allocator value/timestamp advance;
  an empty pre-merge `epic_bonus` table now legitimately holds 183 imports.
- Current MUD runtime compatibility passes unchanged (174 required tables,
  immutable head 0008). DurisWeb still has all 82 migrations complete and zero
  pending. `mysqlcheck --check --silent duris` passes.
- All 123 declared foreign-key relationships were audited dynamically: zero
  orphan relationships and zero orphan rows. Currency, epic, combat, item,
  artifact/guild, boon/zone, and auction reconciliation checks have zero
  unexpected mismatches. The known 12 current characters without a combat-frag
  baseline are all proven pre-existing; imported characters introduced zero
  missing baselines.
- Official item-nesting evidence has zero invalid roots. Its 14 drift rows are
  all proven pre-existing in the frozen reference; imported rows account for
  zero. All 38 imported pet items match their payload parent/root, current
  owner, ownership baseline, owner identity, vnum, state, and revision.
- Post-restart verification: `duris-mud-production.service` and
  `durisweb-production.service` are both active/running with zero restarts. The
  MUD health endpoint reports `healthy` with persistence `ready`; the web health
  endpoint reports `ok` with database and cache both `ok`. A second probe passed
  for each service. Production still exposes one valid marker for this dump,
  783 imported players, and 68,284 imported item-ownership baselines.
- Recovery and forensic material was deliberately retained rather than
  cleaned up: the original dump, fresh main backup and exact-float companion,
  qualified stage, disposable candidate/reference databases, final frozen
  reference, and merge script remain available. The production recovery pair
  is:
  `duris/tmp/legacy-import-work-20260903/production-premerge-20260903T185345Z.sql`
  plus
  `duris/tmp/legacy-import-work-20260903/production-premerge-20260903T185345Z-zones-float.sql`,
  with the SHA-256 values recorded in the preflight section above.

Anything not imported smoothly is recorded in the staging attempts, conflict/
normalization/quarantine section, and whole-table policy-skip inventory above.
No ambiguous legacy row was used to overwrite current production data.

## Post-import application and runtime audit

Audit window: 2026-09-03 19:03-19:55 UTC. This follow-up was performed after
the production transaction and writer restart. All database inspection in this
section was read-only; no import was replayed, no migration was run, and no MUD
database row was changed.

### Outcome

- The committed import remains internally consistent. Its marker, aggregate
  report, accepted identities, ownership baselines, preservation archives, and
  current foreign-key graph all passed the post-import checks below.
- The public website outage was not a database or application failure and did
  not require a host, MUD, or web-application reboot. The origin on loopback
  port 7770 was healthy, but `durisweb-cloudflared.service` had been stopped for
  import maintenance at 18:53:38 UTC and was omitted from the 19:02 writer
  restart. Cloudflare consequently returned HTTP 530/error 1033 while local
  `/health`, `/`, and `/api/site-config` continued to work.
- Starting only `durisweb-cloudflared.service` at 19:24:02 UTC restored public
  HTTP 200 responses. The tunnel registered four connections and loaded the
  expected `duris.sbs`/`www.duris.sbs` ingress routes. Neither the MUD nor the
  web application was restarted to resolve that outage.
- The audit also exposed a separate schema-drift defect in the forum profile
  projection: every existing profile route, including both imported and
  pre-existing profiles, returned HTTP 500 because `getUserProfile` read the
  removed `frag_leaderboard.money` and `frag_leaderboard.balance` columns. This
  was a code defect, not malformed imported data. The query now reads canonical
  wallet and bank denominations from `player_data`, using the same copper
  conversion already used elsewhere in the application. A regression contract
  was added. The remaining review and durable-test work is tracked in
  [DurisWeb #7](https://github.com/LuminariMUD/DurisWeb/issues/7).
- The profile repair was compiled, passed the production preflights, and was
  released with a deliberate DurisWeb-only restart at 19:48 UTC. The MUD PID
  remained unchanged. All seven current profile routes then returned valid
  HTTP 200 responses both locally and through Cloudflare.

### Durable import evidence

- `legacy_import_runs` still contains exactly one marker. Its SHA-256, source
  size (345,366,975 bytes), import version (`legacy-target-wins-v1`), completion
  time (`2026-09-03T18:56:36.618227Z`), and JSON report all validate.
- The marker report classifies 70 imported tables. For every one, the qualified
  stage count still equals `source_rows`; there are zero source-count
  mismatches. Every current production table count is at least the report's
  committed `inserted` count; there are zero below-import-count tables. Normal
  live append and lifecycle activity was not mistaken for import drift.
- A fresh dynamic audit of all 123 declared foreign-key relationships found
  zero violating relationships and zero orphan rows.
- The three preservation archives retain the expected counts and continue to
  match the stage/candidate checksums. Current checksums are 4,097,517,792 for
  raw player-item descriptions, 1,358,063,138 for raw pet-item descriptions,
  and 1,842,988,780 for raw reboot rows.
- All 329 source accounts are present. The 328 inserted account passwords match
  their source bytes; the single name collision correctly retained the target
  password. All 335 current account passwords have a recognized bcrypt prefix.
  No password or account identifier was printed during this audit.
- All 783 accepted imported players retain their exact active account-character
  mapping. Wallet, epic-balance, and combat-frag opening baselines exist for all
  783; bank baselines cover the 119 accepted imported banks. Accepted component
  counts match the marker report, including the expected 29 target-wins skill
  collisions.
- Twelve active, account-mapped target characters still lack a combat-frag
  baseline. The frozen reference proves that all 12 predate the import, while
  wallet and epic baselines are complete. Targeted repair is tracked in
  [DurisWeb #13](https://github.com/LuminariMUD/DurisWeb/issues/13).
- There are 96 `player_data` rows without an active account-character mapping,
  but the qualified candidate has the same 96 and none belongs to the 783
  accepted import mappings. This is retained pre-existing/candidate state, not
  post-commit loss.

### Item, container, and ownership follow-up

- The live payload currently contains 37,401 player items, 31,253 locker items,
  and 38 pet items. Across those 68,692 rows there are zero null/zero UIDs and
  zero duplicate UID groups or excess occurrences.
- All 68,284 import ownership baselines still have a current owner whose vnum
  matches and whose revision is not behind the opening revision. Current totals
  are 68,810 owner rows and 753 owner-revision rows. The allocator is
  54,582,089, safely above the maximum persisted payload UID of 53,636,178.
- At the later live snapshot, 68,283 of the 68,284 imported baseline UIDs were
  present in one of the three SQL payload tables. The one absent payload still
  has an active current-owner row, a valid active player mapping, matching vnum,
  and a non-regressed revision. The immediate quiesced post-commit validator
  had found zero imported topology mismatches, so this is consistent with an
  item loaded into the running MUD's in-memory lifecycle; that interpretation
  was not proven by inspecting or changing the separate MUD repository. It is
  recorded here for comparison at the next quiesced save and tracked in
  [DurisWeb #12](https://github.com/LuminariMUD/DurisWeb/issues/12).
  The aggregate attestation contract and quiesced acceptance steps are checked
  in as the
  [imported item baseline verifier](../runbooks/imported-item-baseline-verification.md).
- The official topology checker separately retains 14 mismatches proven
  byte-for-byte pre-existing in the frozen target; imported items account for
  zero of them. Classification and repair are tracked in
  [DurisWeb #14](https://github.com/LuminariMUD/DurisWeb/issues/14).
- Imported player, locker, and pet container ancestry has zero cross-owner
  mismatches. All 216 retained ships resolve to a current player and have the
  expected four armor rows, one crew row, and 16 slot rows. All 71 locker access
  rows resolve by the schema's locker-owner name key.

### Application projections and public acceptance

- Forum storage retains 107 categories, 9 threads, 11 posts, 5 images,
  5 reactions, and 9 subscriptions. Anonymous `/api/forum/categories` exposes
  four categories because the other active categories are authenticated,
  role-based, or guild-scoped; this is ACL filtering, not missing import data.
  Latest and popular activity routes both return HTTP 200 on their canonical
  `/api/forum/activity/*` paths. The separate empty-target provisioning and
  readiness gap remains tracked in
  [DurisWeb #10](https://github.com/LuminariMUD/DurisWeb/issues/10).
- All 1,674 imported notifications have valid JSON where data is present, and
  there are no missing recipient or triggering-account references. Their
  authenticated UI was not exercised without a user credential.
- The imported content projections are usable: all 14 source-only help-page
  details returned nonempty HTTP 200 responses; the retained PvP event/comment
  sample returned both imported comments; 187 events and 802 participant rows
  remain represented; changelog, news, guide, statistics, reboot, status,
  auction, wiki, and frag/PvP aggregates returned structured responses.
- An empty ordinary `/api/server/reboot/history` response is expected because
  that route represents host-monitor history. The 648 normalized imported MUD
  reboots are exposed by `/api/server/reboot/mud-history`, which returns data.
- A canonical 37-route anonymous sweep through `https://duris.sbs` passed all
  expected statuses after correcting two exploratory non-route paths to the
  documented forum activity paths. The protected `/api/zones` route returned
  its expected HTTP 401; the other 36 checks returned HTTP 200. No route
  returned a 5xx response.
- Public `/health` reports `ok` with database and cache both `ok`. Public and
  local site configuration responses match, the root document is served, and
  the deployed `ForumView`, `GuideView`, `PvPListView`, `StatusView`, and
  `UserProfileView` chunks match the local frontend artifacts byte-for-byte.
- The initial startup warning that `logs/log/comm` was unavailable occurred
  while the MUD was still creating that file. The regular file now exists with
  owner-only access, and the later web startup produced no corresponding
  unavailable warning. No permission was weakened.

### Profile repair release and rollback evidence

- Source changes are limited to
  `backend/src/services/forumService.ts` and the existing regression-contract
  suite in
  `backend/src/services/__tests__/productionReviewRegression.test.ts`.
- A mode-0700, secret-free release/rollback set is retained at
  `/home/duris/.local/state/durisweb-profile-repair-20260903-T3rxTa`. Its
  reconstructed HEAD rollback tree SHA-256 is
  `2104e6cf8b6793a171282c3dad98f7f6e67222a704c96c662deae23b9ea6cc6b`;
  the deployed candidate tree SHA-256 is
  `5709e3c8278ae37fab2b9e7cc550cde5b96adacd81f2eb8d79d3590e5170d1fa`.
  The deployed `backend/dist` tree matches that candidate digest.
- After cutover, DurisWeb, its Cloudflare tunnel, and the MUD were all
  active/running with zero failure restarts. The MUD process was not restarted.
  DurisWeb reauthenticated to the MUD WebSocket, applied hook state, and logged
  no application errors during acceptance.

### Verification record and limitations

- Passed: `pnpm --dir backend format:check`, `pnpm --dir backend lint`,
  `pnpm --dir backend type-check`, `pnpm --dir backend build`, and
  `pnpm --dir backend verify:mud-writes` (53 classified writes).
- Passed twice around release:
  `node dist/scripts/productionPreflight.js --configuration` and
  `node dist/scripts/productionPreflight.js --dependencies`. They found all
  82 migrations, 12 required tables, and configured Redis dependencies healthy.
  `pnpm migrate:status` also reported 82 complete and zero pending migrations.
- Passed:
  `pnpm --dir backend test --runInBand src/services/__tests__/productionReviewRegression.test.ts`
  (12/12), including the profile-query regression. A compiled direct-call check
  then evaluated all seven profiles against production successfully, followed
  by 7/7 local and 7/7 public HTTP profile checks after release.
- The full `pnpm --dir backend test --runInBand` run was not green: 75 suites
  and 614 tests passed, while six database-backed suites (69 test cases) could
  not connect to the explicitly isolated test MySQL endpoint on port 7779; the
  isolated Redis endpoint on port 7780 was also absent. The failures were
  dependency connection refusals rather than assertion failures. The retrying
  Redis handle kept Jest open after its final summary and was interrupted. No
  test was redirected to production and no test dependency was provisioned as
  part of this production audit.
- No frontend source changed, so frontend format/lint/type/unit/build gates were
  not rerun. The already deployed frontend was instead checked at its public
  document, configuration, route, and asset boundaries.
- Interactive browser screenshot, console, responsive-layout, and click-flow QA
  remains unverified because no Browser connector is available and this checkout
  has no installed Playwright command. Authenticated login, notification,
  profile-edit, and administrator flows were not attempted without credentials.

### Operational follow-up

`durisweb-cloudflared.service` is enabled and has `BindsTo=`/`PartOf=` links to
the web application. The later deliberate application restart proved that this
relationship correctly stopped and restarted an already-active tunnel. The
import maintenance sequence was different: it stopped the tunnel as an
independent unit, then started only the MUD and web writers. An enabled unit is
not automatically re-added to that partial start transaction. Maintenance that
stops units individually must therefore restart the complete enabled service
group and require both unit state and a public health probe before declaring
recovery. Omitting that acceptance step—not the import data or the unit's normal
restart propagation—caused this incident.
Executable complete-group recovery and acceptance tracking is in
[DurisWeb #11](https://github.com/LuminariMUD/DurisWeb/issues/11).

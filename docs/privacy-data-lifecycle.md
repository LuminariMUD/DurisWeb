# Website data lifecycle inventory

This is the engineering inventory for notice/choice, retention, and subject
requests ([implementation plan](ongoing-projects/plan.md), issues #10–#12).
It describes prepared source, not a production-data inspection or approved
privacy policy. Max (Moshe), contact `zusuk@duris.sbs`, was supplied as the
decision contact. Public controller wording, provider commitments, periods and
destructive rules still require his approval. Do not interpret contact details
as that approval.

## Authority and verification rules

The [immutable website baseline](../backend/schema-baselines/2026-10-16/manifest.json)
contains 77 website tables. The rows below account for every one. Exact column
definitions and relationships are in its [DDL](../backend/schema-baselines/2026-10-16/schema.sql).
The current session and hook-audit migrations supersede the baseline's old
credential columns; they are called out below. Knex and baseline provenance are
additional operational metadata, not missing application tables.

The later `20261017004000_web_data_holds.ts` and
`20261017005000_web_retention_runs.ts` add two website-owned extension tables,
for 79 application tables after both forward migrations. The immutable
77-table inventory below remains unchanged. `web_data_holds` selects a scoped
account through `account_name`; `created_by`/`released_by` are separate operator
roles. UUID, class/global scope, private reason/release reason, review/expiry/
release epochs and `created_at`/`updated_at` preserve the hold's history.
The [restricted API](runbooks/data-holds.md) still reports global enforcement
unavailable. Preview reports held/unheld observations and binds continuation to
active protection. The source-disabled [two-class SQL executor](runbooks/retention-execution.md)
rechecks holds within deletion transactions. Prepared
[managed ZIP admission](runbooks/managed-archive-holds.md) serializes recorded
holds with file removal; other feature cleanup, uploads/workspaces and restore
remain unprotected. No table-wide subject export or purge is authorized, and no
period for this ledger is approved. Retain expired/released/invalid records;
operator evidence needs separate subject/privacy review before export.

`web_retention_runs` has no account selector. Its operation UUID, policy/rule/
target hashes, captured epoch and private progress JSON preserve bounded scan
cutoffs/high-water/cursors, aggregate held/deleted/skipped counts, cumulative
work duration and pending legacy-cache traversal, including Redis server identity.
The reserved `retention-control-v1:state` settings row holds the expiring worker
lease and serializes hold writes with deletion. Neither is exposed by generic
settings or ordinary logs/results. IDs remain indirectly linkable; retain and
restrict this operational evidence pending its own period/export decision.

The DBA-installed [lifecycle metadata function](runbooks/lifecycle-metadata.md)
is a read-only operational schema object, not another application-data table.
Version 2 exposes per-table trigger/reference counts and its source digest,
without row access or dynamic SQL. Callers select source-owned website targets;
the verifier covers provenance/ledger and declared forward tables too.
Restricted website privileges cannot establish absence of external-schema
references or MySQL triggers through ordinary catalog counts; lifecycle writes
require authoritative checks before mutating their targets. Installation and
source qualification do not imply production adoption or retention approval.

The reserved `archive-removal-v1:` settings namespace adds an active pointer
and retained UUID receipts without a new table. Kind, backup ID/filename,
root/file hashes, database epochs, phase/outcome and Linux worker identity
preserve managed-removal evidence. There is no account/IP or archive-content
payload; backup IDs/filenames remain indirectly linkable to historical operator
records. Generic readers exclude the namespace and SQL-collation aliases.
Its own period is unapproved: retain/restrict pending, completed and invalid
evidence; subject exports require staff/third-party review rather than a raw
settings dump. Ordinary diagnostics contain only category/reference.

Each row lists subject-selection fields or a necessary relationship, and a time
field that could support an approved cutoff. A time field is **not** an approved
retention period. Every general period/disposition is **unapproved**. Existing
feature cleanup is recorded separately; it does not authorize a new purge.
Unknown classes and external ownership always remain excluded from mutation.

For a verified request, direct selectors are bound parameters. Match only the
verified account and its owner-confirmed character identifiers; do not infer
identity from matching IPs, names in free text, or a visitor identifier. A safe
operator verification pattern is `SELECT COUNT(*) FROM <listed_table> WHERE
<listed_subject_predicate>`, followed by explicit, bounded column selection.
The table and predicate come from a reviewed allowlist, never request input.
For relationship rows, use the described join and count child IDs before/after;
do not delete the parent first. Free text/JSON and other people's records need
review/redaction rather than an assertion that a SQL name match is complete.

Website authority here means schema ownership. It does not grant an ordinary
user access to another person's content, security evidence or staff records.
Subject exports must redact third-party data and restrict staff/security evidence.
All changes remain subject to request/legal/security holds, approved evidence
exceptions and the [import quarantine boundary](post-import/quarantined-item-disposition.md).
Never purge pending/invalid audit or external-delivery evidence to meet a size cap.

## Authentication, profiles and safety

| Website table | Subject selection and personal fields | Time basis / disposition decision |
|---|---|---|
| `web_sessions` | `account_name`; opaque `id`, digest credential | Current `expires_at_epoch`, `created_at`; revoke on verified erasure, never export credentials |
| `account_login_history` | `account_name`, owner-confirmed `character_name`; IP, hostname, client/version | `timestamp`; restricted security history, period/holds pending |
| `user_profiles` | `account_name`; email, bio, location, website, avatar/banner URLs | `created_at`, `last_seen_at`; remove profile and coordinate media copies |
| `user_profile_stats` | `account_name`; contribution/reputation projections | `first_post_at`, `last_post_at`; recompute/remove with content disposition |
| `user_bans` | `account_name`, `banned_by`, `unbanned_by`; reason | `banned_at`, `unbanned_at`; review safety hold, actor and subject separately |
| `suspicious_accounts` | `account_name`, `reviewed_by`; score, evidence, review notes | `flagged_at`, `reviewed_at`; restricted profiling, human review and objections required |
| `gemini_analysis_log` | `full_results` JSON and summary can describe several accounts/IPs | `analysis_timestamp`, `created_at`; inspect structured evidence, redact other subjects, provider disposition pending |
| `push_subscriptions` | `account_name`; endpoint, `p256dh`, `auth`, user-agent | `created_at`, `last_used_at`; unsubscribe and remove keys, never export reusable subscription secrets |

[Session credentials](../backend/src/services/sessionService.ts) now use
`refresh_token_digest BINARY(32)` and `expires_at_epoch`; the historical
`refresh_token`/`expires_at` columns are absent after cutover. Their seven-day
authorization lifetime is implemented; physical expired-row retention is a
different decision. [Database backup exports](../backend/src/services/databaseBackupDump.ts)
omit session rows, including expanded pre-cutover shapes. Older archives remain
an operational inventory item; no existing archive has been altered here.

The [Gemini analyzer](../backend/src/services/geminiSuspicionAnalyzer.ts) is gated
by configuration and writes aggregate JSON plus per-account evidence. Source
capability is not proof it runs live. Do not enable it as part of privacy work.

## Forums and community content

| Website table | Subject selection and relationships | Time basis / disposition decision |
|---|---|---|
| `forum_categories` | `archived_by`; guild/access names and descriptions | `created_at`, `archived_at`; shared structure, redact attribution if approved, retain category integrity |
| `forum_category_permissions` | `account_name`, `character_pid`, `created_by`; guild rules | `created_at`; remove personal grants, retain shared rules |
| `forum_threads` | `author_account_name`, `author_character_pid`, `deleted_by`; IP, title/content | `created_at`, `updated_at`, `deleted_at`; pseudonymization/content review must preserve thread relationships |
| `forum_posts` | `author_account_name`, `author_character_pid`, `deleted_by`; IP, content; thread/parent links | `created_at`, `edited_at`, `deleted_at`; review quotes and other participants before redaction |
| `forum_post_images` | `account_name`; post/thread links, object key/URL, original filename | `created_at`, `linked_at`, `removal_requested_at_epoch`; retain pending retry identity until origin-object deletion is acknowledged |
| `forum_mentions` | `mentioned_account_name`, `mentioned_by_account_name`, `post_id` | `created_at`; remove/rewrite references as approved, include both subject roles |
| `forum_reactions` | `user_account_name`; post/thread links and emoji | `created_at`; remove attributable reaction and recompute projections |
| `forum_subscriptions` | `user_account_name`; thread/category and preference | `created_at`; remove subscriptions, cease deliveries |
| `forum_polls` | `created_by_account`; `thread_id`, question | `created_at`, `expires_at`; preserve shared poll/option relationships where content is retained |
| `forum_poll_options` | Join `poll_id` to `forum_polls`; free-text options may identify people | `created_at`; not an independent account selector |
| `forum_poll_votes` | `voter_account`; poll and option IDs | `voted_at`, `updated_at`; remove attribution/recompute totals under approved anonymity rules |
| `forum_poll_vote_history` | `voter_account`; old/new option IDs | `changed_at`; an anonymous poll's history is still attributable |
| `forum_moderation_log` | `moderator_account`; target IDs, original content, reason | `created_at`; target-subject joins differ for posts/threads/categories, restricted evidence review |
| `forum_permission_audit` | `changed_by`; `target_key`, old/new values may identify targets | `changed_at`; inspect target format and payloads, no blind text replacement |
| `forum_settings` | `updated_by`; mutable values can contain authored text | `updated_at`; configuration is not a user-wide deletion target |
| `notifications` | `account_name`, `triggered_by_account`, `triggered_by_character`; message/link/data | `created_at`, `read_at`; recipient and actor roles differ, remove queued delivery links too |
| `pvp_battle_comments` | `account_name`, `character_pid`; content, quoted text, participant/event/parent links | `created_at`, `updated_at`; account erasure does not authorize modifying the MUD battle record |
| `pvp_battle_favorites` | `account_name`, `event_id` | `created_at`; remove personal favorite |
| `pvp_battle_likes` | `account_name`, `event_id` | `created_at`; remove personal reaction and recompute displayed totals |
| `help_file_suggestions` | `submitted_by`, `reviewer_account`; notes/text/IP | `submitted_at`, `reviewed_at`, `updated_at`; approved public help content and private review evidence differ |
| `website_changelog` | `created_by`; published content can contain attribution | `created_at`, `updated_at`; preserve public release history, review names/content |
| `website_changelog_reads` | `account_name`, `changelog_id` | `read_at`; remove personal read receipts |

Current readers/writers: [forum service](../backend/src/services/forumService.ts),
[poll service](../backend/src/services/pollService.ts),
[image service](../backend/src/services/postImageService.ts),
[notifications](../backend/src/services/unifiedNotificationService.ts),
[PvP routes](../backend/src/routes/pvp.ts),
[help suggestions](../backend/src/services/helpSuggestionService.ts), and
[changelog](../backend/src/services/changelogService.ts).
Soft deletion alone is not erasure: original text, moderation copies, quotes,
images and backup/provider copies need their own outcomes.

## Administration, building and operations

| Website table | Subject selection and personal fields | Time basis / disposition decision |
|---|---|---|
| `admin_permissions` | Shared permission definitions/descriptions, no account column | `created_at`; retain definitions, review authored text only |
| `admin_roles` | `created_by`; shared role definition | `created_at`, `updated_at`; preserve shared role integrity |
| `admin_account_permissions` | `account_name`, `granted_by` | `granted_at`; remove personal grant, review grantor attribution |
| `admin_account_roles` | `account_name`, `granted_by` | `granted_at`; remove personal assignment, preserve shared role |
| `admin_role_permissions` | Join `role_id` to shared role, no account column | `created_at`; not account-owned records |
| `admin_permission_audit` | `account_name`, `target_account`; notes, IP, target IDs | `created_at`; restricted audit/holds, actor and target both relevant |
| `admin_action_log` | `account_name`; target, notes, old/new values, legacy IP; new `hook_event_id` | `timestamp`; correlate hook receipt before any approved retention |
| `builder_activity_log` | `account_name`; IP, zone/entity names | `created_at`; restricted accountability evidence |
| `builder_flags` | Source-authored definitions, no account column | `created_at`, `updated_at`; retain shared game metadata |
| `builder_settings` | `account_name`; per-account key/value | `created_at`, `updated_at`; remove personal settings, inspect values |
| `builder_mentions` | `mentioned_account`, `mentioned_by_account`; entity links | `created_at`; recipient and actor roles differ |
| `builder_proc_requests` | `requested_by`, `assigned_to`; descriptions | `requested_at`, `updated_at`; review authorship/assignment and shared work history |
| `builder_zone_comments` | `account_name`, `character_name`; content/HTML, parent/request IDs | `created_at`, `updated_at`; shared discussion/content redaction review |
| `builder_zone_info` | `owner_account`; description/HTML | `created_at`, `updated_at`; reassign ownership, preserve shared zone data |
| `builder_zone_info_history` | `account_name`; changed field/details | `changed_at`; history can retain removed description content |
| `builder_zone_permissions` | `account_name`, `granted_by`; zone grant | `granted_at`; remove personal grant and review grantor attribution |
| `deployment_log` | `account_name`, IP; Git/compile output | `created_at`; outputs may contain paths, names or other evidence; restrict/review |
| `mud_backups` | `created_by`, IP; filename/error metadata | `started_at`, `completed_at`; archive contents and catalogue require separate treatment |
| `mud_restores` | `created_by`, IP; selected `accounts`/`characters`, errors | `started_at`, `completed_at`; retain restore/removal coordination evidence |
| `mud_control_log` | `account_name`, IP; reason, output/errors | `started_at`, `completed_at`; restricted operations evidence |
| `mud_process_state` | `started_by`; process state | `last_start_time`, `last_stop_time`, `updated_at`; preserve current runtime state |
| `terminal_sessions` | `account_name`; process/session state | `started_at`, `ended_at`; terminate active access before request completion |
| `terminal_logs` | Join `session_id` to `terminal_sessions.id`; raw terminal `data` | `timestamp`; high-sensitivity content, do not export raw secrets/output by default |
| `server_health_metrics` | No subject identifier; counts, process/resource metrics | `recorded_at`; operational aggregate, keep separate from identifiable incidents |
| `server_incidents` | Snapshots, last command, backtrace, logs, notes can identify many people | `started_at`, `ended_at`, `created_at`; no reliable account column, restricted review/redaction |
| `wipe_history` | `executed_by`; excluded players, backup path, notes/IP/errors | `executed_at`; destructive-operation evidence, quarantine/holds apply |
| `web_settings` | `updated_by`; mixed configuration, repair intents and reserved hook receipts | `updated_at`; classify namespace before action, never generic account/key purge |

Current [hook receipts](../backend/src/hooks/hookToggleJournal.ts) use reserved
`hook-audit-v1:` keys with immutable actor/old/new/event identity and one delivery
marker. They contain no IP. Pending or invalid receipts must remain recoverable;
the delivered receipt and its unique audit sink event must share retention/hold
decisions. No implemented subject-request hold or delivered purge is claimed.

The prepared [privacy choice service](../backend/src/services/privacyChoiceService.ts)
adds a separate `privacy-choice-v1:` namespace in this same table. Subject
verification uses the opaque browser credential and its digest, not an account
or IP join. Fields are format, notice/choice versions, decision, revision,
credential digest, changed epoch and expiry epoch. The key derives from an HMAC
of the existing necessary CSRF token; raw CSRF/cookie secrets are not stored.
Generic settings APIs exclude both internal namespaces. Invalid choice records
remain fail-closed; physical-row retention/holds and verified browser-request
handling still belong to P6/P7. The draft policy prevents issuance in prepared
source, so the proposed preference lifetime remains unapproved and inactive.

[Terminal](../backend/src/services/terminalService.ts),
[operations](../backend/src/services/mudControlService.ts),
[builder](../backend/src/services/zoneCommentService.ts),
[permissions](../backend/src/services/adminPermissionService.ts),
[deployment](../backend/src/services/deploymentService.ts),
[backups](../backend/src/services/backupService.ts), and
[incident readers](../backend/src/services/serverHealthService.ts) are the relevant
access boundaries. Exports cannot make staff-only evidence public.

## Donations, external delivery and optional website analytics

| Website table | Subject selection and personal fields | Time basis / disposition decision |
|---|---|---|
| `donations` | `account_name`; Ko-fi name/email/message, amount/currency, provider message ID | `created_at`; financial retention/identity redaction needs explicit decision |
| `donation_outbox` | Join `donation_id` to `donations.id`; character/message/event ID | `created_at`, `published_at`, `available_at`; do not erase pending/ambiguous delivery evidence |
| `web_donation_totals` | `account_name`; projected total | `updated_at`; recompute/anonymize with source financial decision |
| `web_pvp_discord_deliveries` | Event/channel/message IDs, `delivered_by`; correlate public battle participants through MUD-owned source | `created_at`, `delivered_at`, `updated_at`; external message deletion and delivery evidence differ |
| `web_pvp_discord_destinations` | Channel ID and event boundary, no direct account column | `activated_at`, `created_at`, `updated_at`; shared external destination configuration |
| `page_views` | Legacy visitor `session_id`, optional account, IP, URL/title/referrer/UTM, user-agent/screen, geography | `created_at`; new source collection is closed; historical data/period still pending |
| `visitor_sessions` | Legacy `session_id`, optional account; entry/exit/referrer, device/geography | `first_seen`, `last_seen`; do not join a visitor to an account by IP |

[Donations](../backend/src/services/donationService.ts),
[outbox](../backend/src/services/donationOutboxService.ts),
[Discord delivery](../backend/src/services/pvpDiscordDelivery.ts), and the
[read-only historical website dashboard](../backend/src/services/webAnalyticsService.ts)
own these paths. Both old website tracking URLs are closed under the draft
policy. A prepared common collector can accept only a versioned receipt,
revision, opaque visit nonce and allowlisted route family after all source gates
are approved/ready. Its atomic page-view/session writes contain only a derived
visit pseudonym, canonical route template and database time; the other legacy
fields remain null. No optional enrichment/provider call occurs. Receipt
issuance and collection remain inactive. The prepared public draft and client
controls validate the receipt, including actual-cookie read-back, cross-tab
ordering, expiry and failures. A visit nonce exists only in page memory after
confirmation, and is reset on stop or account changes. This does not approve the
notice/period proposals or establish live collection acceptance.

Historical analytics readers now use SQL directly, and both administrative
router mounts send `Cache-Control: no-store`. They no longer populate/read
`web_analytics:*`; gated SQL retention includes bounded removal of legacy keys
from the explicitly confirmed cache target. All old cache-writing website
processes must be stopped/drained before any authorized execution is enabled.
Other Redis namespaces and provider/browser/backup copies remain separate.

## Shared publication metadata without an account selector

These 13 website tables hold shared reference/publication data. Their absence
of a subject column does not prove free text can never contain a name. Retain
shared game/publication integrity; review a specific identifying text claim
against its authoritative source instead of deleting all reference rows.

| Website table | Identity / time basis |
|---|---|
| `wiki_continents` | Continent ID/name; `created_at` |
| `wiki_map_positions` | Room number/names; `created_at`, `updated_at` |
| `wiki_mobs` | Zone/mob number, names/descriptions; `created_at`, `updated_at` |
| `wiki_mob_flags` | Zone/mob number and flag ID; parent publication |
| `wiki_objects` | Object number, names/descriptions; `created_at`, `updated_at` |
| `wiki_object_affects` | `object_vnum`, affect location/modifier; parent publication |
| `wiki_object_classes` | `object_vnum`, class; parent publication |
| `wiki_object_races` | `object_vnum`, race; parent publication |
| `wiki_object_slots` | `object_vnum`, slot; parent publication |
| `wiki_object_spell_effects` | `object_vnum`, effect name; parent publication |
| `wiki_reference_generations` | Source revision/tree, counts; `published_at` |
| `wiki_settings` | Setting key/value; `updated_at`, review arbitrary values |
| `wiki_zone_entrances` | Room/zone numbers/names; `created_at` |

Source:
[wiki publication](../backend/src/services/wikiPublication.ts) and
[wiki generation](../backend/src/services/wikiGeneration.ts).

Additional technical tables: `web_schema_baselines` stores baseline derivation
and installation progress; `knex_migrations` and `knex_migrations_lock` store
migration names/timing and coordination. They are not account-owned lifecycle
targets. Never rewrite provenance to make an erasure or rollback appear complete.

## MUD authority and other copies

The [copied MUD inventory](../backend/mud-write-allowlist.json), checked against
the owner's manifest, is authoritative for the ownership boundary. It includes
accounts/characters, IP/connection history, inventory/lockers, guild/game state,
auctions and PvP records, plus owner-managed `account_erasure_requests`,
`account_erasure_stores`, `account_erasure_evidence` and
`account_erasure_tombstones`. `server_reboots` is additionally MUD-owned in the
website baseline. All MUD-owned tables remain excluded from website lifecycle
mutation unless a separately approved owner protocol explicitly permits it.
Those erasure-table names do not establish a usable deployed request adapter.
Website-only success cannot mean complete account erasure.

| Copy/store | Subject/content and access | Required treatment / current evidence |
|---|---|---|
| MUD account flatfiles, character files, connection/game logs | Credentials/account/character identities, events and commands; separate MUD authority | Website authentication depends on these files; coordinate owner erasure/tombstone before declaring recreation prevented |
| Database/flatfile backup archives and uploaded recovery archives | Can contain many subjects, credentials in older archives and staff evidence; operator-only | Inventory actual locations privately; expiry/access and restore reapplication pending; no archive deletion authorized |
| Quarantined imports and orphaned PvP-comment evidence | Protected source/recovery evidence | Preserve at least the **2027-03-03 review boundary**; see both [item](post-import/quarantined-item-disposition.md) and [comment](post-import/orphaned-pvp-comment-disposition.md) records |
| Redis cache and process memory | Profile/permission/publication/analytics query caches, presence and pending work | Trace exact service keys and invalidate derived copies after authorized changes; TTL alone does not prove erasure or cover durable copies |
| Browser storage, cookies and service-worker cache | Login/CSRF cookies, MUD session credentials, client preferences/history, drafts, cached public API responses | Session revocation and browser cleanup differ; never promise clearing someone else's device remotely. Current source removes legacy analytics ID when storage permits |
| R2 and CDN/browser media copies | Avatar/banner and forum image objects, URLs and filenames | Delete only verified owned object keys, retain retry identity on failure, define CDN expiry/invalidation; losing the DB row is not proof the object is gone |
| Logs, terminal output, crash/core files and Git/compile output | May contain identifiers, paths, commands or secrets; restricted host/operator access | Inventory live locations privately; minimize/redact and protect evidence; console-only Winston transport is not evidence of host/journal retention |
| Retention preview reports/checkpoints | Aggregate age/held/unheld report; private version-2 checkpoint has target hash, operation/version/cutoff, active-protection fingerprint and class cursor/high-water IDs, which remain indirectly linkable | Optional local POSIX 0600 files outside Git, no row payload or credentials; period unapproved, restrict as operator evidence; changed active protection invalidates continuation, never authorize deletion from these counts |
| Retention run/control evidence | Private SQL run ledger and reserved settings lease; cursors/high-water IDs, target/rule hashes and cache-server traversal identity, no row payload | Retain/restrict pending approved period; SQL batches record actions atomically, incomplete cache removal stays pending; source execution remains disabled and backup/restore protection is not established |
| Ko-fi | Donor metadata received by webhook; provider's own records | Verify provider responsibilities/retention separately; website deletion does not remove provider records |
| Discord | Published game/notification payload and message identifiers | Gated delivery/source contract; identify individual messages and owner-approved removal method, preserve pending/ambiguous outcome evidence |
| Gemini | Account/character/IP/login evidence can be sent when feature enabled | Leave disabled pending purpose/provider/human-review approval; do not claim active transfer from source capability alone |
| GeoIP provider | Administrative connection-log lookup can send an IP over the current HTTP endpoint | Optional analytics path removed; current endpoint requires `view_connection_logs`. Its external-transfer purpose/transport still needs approval. No guessed HTTPS switch or fallback provider |
| Browser push providers | Subscription endpoint and delivery payload | Explicit browser permissions/subscription removal; provider acknowledgement and retained-copy limits need review |
| Cloudflare ingress | Requests transit the required ingress; media/CDN is a separate role | Operator must attest account/provider logging, access, location and expiry; never disable required ingress as a privacy shortcut |

Provider feature gates, configured recipients and actual live retention are
unverified here. No provider API or live store was contacted. Permanent source
references: [security inventory](SECURITY-COMPLIANCE.md#third-party-transfers),
[configuration ownership](environments.md), [R2 service](../backend/src/services/r2Service.ts),
[post images](../backend/src/services/postImageService.ts),
[logger](../backend/src/utils/logger.ts), and
[incident response](runbooks/incident-response.md).

Both legacy website restore endpoints and their service entry points now refuse
regardless of the historical unsafe switch. The asynchronous row-merge executor
is removed so it cannot reintroduce account/game rows through a website path
that does not consult current lifecycle evidence. Its old allowlist did not
include the two website SQL retention classes or the hold/run ledgers; closing
this path does not implement replay for a full operator-restored website dump.
Backup creation and inspection
remain available. This closure does not implement approved archive expiry or
offline restore-removal replay; retain independent current lifecycle evidence
and follow the [operator recovery boundary](deployment.md#application-restore-boundary).

## Concrete decisions still required

The following is a proposal for owner review, not an approved schedule or legal
retention claim. Engineering can prepare dry-run/hold/request handling while
these decisions remain pending; destructive execution must remain unavailable.

- Keep optional website analytics off until the notice and choice controls are
  approved. If reintroduced, propose route-family counts with a fresh opaque
  visit identity, no account/IP/user-agent/title/referrer/UTM/screen/geography
  collection, and a 30-day raw-event limit. Coarse aggregate reporting must not
  retain an individual visit identifier. No GeoIP/provider transfer is needed.
- Propose a 180-day server receipt lifetime for an explicit analytics choice, with
  policy-version expiry and immediate withdrawal. Choice receipt identity is
  necessary preference data, separate from a visit identifier. Approve its
  retention and treatment of refused/withdrawn receipts before issuance. The
  browser separately retains a minimal `off`/`accepted` safety setting until a
  new confirmed choice or browser-data clearing; it has no visit/account ID and
  cannot authorize collection without the current server receipt.
- Propose 90 days for identifiable login/security history, 365 days for staff
  audit/operation evidence, and 30 days for ordinary operational metrics.
  Holds, active investigations, pending delivery and protected imports override
  an ordinary cutoff. Incidents with raw command/log evidence need separate
  review rather than inheriting the aggregate-metric policy.
- Expired login authorization already stops at the database epoch. Propose
  removal of expired/revoked session rows in bounded runs; approve the exact
  physical-row delay. Never restore old raw credentials to recover a session.
- Profile, subscription and reaction data can be removed after a verified
  request. Propose pseudonymizing authorship while reviewing forum/builder/PvP
  text, quotes and other people's participation; do not silently destroy shared
  discussions or assume a display-name change removes personal content.
- Donor/financial records, historical backups, raw terminal/incident evidence,
  MUD-owned records and provider copies need a named disposition/period before
  destructive rules can be written. No universal default applies to them.
- Approve the public controller/contact wording, active providers/locations,
  human review and objection route, request identity verification and the
  one-time website logout before release. The owner contact is available;
  those operational/legal decisions remain unapproved.

## Open engineering dependencies

The [read-only preview](runbooks/retention-preview.md) can inspect the proposed
30-day analytics-event and 90-day login-history age ranges with bounded pages,
an explicit target/version and private continuation. It evaluates validated hold
scope/expiry in the same read snapshot, and refuses changed protection on resume.
Other exceptions and subject requests remain unevaluated; it cannot delete data. Metrics with naive time
provenance and every unlisted class remain excluded. The prepared
[SQL executor](runbooks/retention-execution.md) has durable bounded progress,
expiring ownership, transaction-time hold/eligibility rechecks and retired-cache
cleanup for only those two classes. All source approvals and enablement remain
false; no scheduler or live deletion is approved. Hold intent records retain
the restricted API and global `enforcementReady: false` because other deletion/
cleanup and restore paths remain open. Protected
export, request/erasure journal and restore-removal replay are unimplemented. Any new
consent/request/export store must be added here with exact ownership, selectors,
cutoff and copy handling before its lifecycle can be considered complete.

Forum image removal records a durable intent before contacting R2 and retains
the retry row on disabled storage, failure, timeout or an unconfirmed response.
Pending images cannot be attached; forum create/edit operations link managed
images in the publication transaction. The existing hourly cleanup retries
pending work and keeps the one-hour rule for newly abandoned uploads, with
bounded batches. See the [schema and recovery procedure](../backend/schema-baselines/README.md#forum-image-removal)
and [API result contract](api/README_api.md#forum-image-removal). This source
repair is qualified on disposable databases; live rollout and provider/CDN-copy
handling remain unverified. It does not establish general erasure, restore
replay, approved retention periods or deletion of cached/backup copies.
Existing backup count pruning, per-account notification deletion and invalid
push-endpoint cleanup are feature mechanisms, not proof of the proposed periods
above.

Prepared [archive cleanup recovery](runbooks/backup-archive-cleanup.md) retains
file identity on unconfirmed deletion, routes failed/manual/count cleanup through
one path, refuses unfinished/shared/unsafe targets, and preserves list-time
evidence. New names avoid simultaneous archive collisions. This repairs retry
and acknowledgement behavior. Managed ZIP removal now enforces holds through
durable admission and process fencing, while transient/upload copies, approved
maximum age and offline restore-removal replay remain explicit P6 gaps.

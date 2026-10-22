# DurisWeb HTTP API

The Express application is assembled in `backend/src/index.ts`. Its listener,
public site URL, and ingress origin are required environment/deployment values.
The configured ingress forwards the SPA, `/api`, `/ws`, and `/kofihook` to the
Express origin.

There is no OpenAPI document or generated client. Route modules and their
tests remain the executable source of truth; this page documents stable entry
points and security boundaries rather than duplicating every handler.

## Common Endpoints

| Method | Path | Authentication | Purpose |
|--------|------|----------------|---------|
| `GET` | `/health` | Public | MySQL/Redis readiness; 200 `ok` or 503 `degraded` |
| `GET` | `/api/ping` | Public | Plain-text latency probe (`pong`) |
| `GET` | `/api/site-config` | Public | Browser-safe site configuration |
| `POST` | `/kofihook` | Ko-fi verification token; CSRF-exempt | Bounded, rate-limited donation webhook |
| `GET` | `/api/status` | Public | Limited MUD runtime status |

## Route Groups

`GET /api/admin/web/settings` requires the existing front-page management
permission. Its `updated_at` values are ISO 8601 UTC instants derived from the
stored database timestamp, or `null` when the instant is unknown. A database
session offset never changes the reported instant. Internal hook journal rows
and the retired webhook secret remain excluded.

Forum post links use `/forum/thread/:id#post-:postId`. The thread reader passes
the fragment's positive safe integer as `postId` to
`GET /api/forum/threads/:id?page=1&limit=50&postId=:postId`. After the existing
thread/category access checks, the API selects the page containing that active
post, ordered by creation time and ID, and returns its actual `pagination.page`
and `pagination.pages`. Missing, deleted or other-thread posts do not resolve a
destination. The view scrolls to the rendered post and handles fragment changes
within the current thread; ordinary pagination still uses the requested page.

| Prefix | Route Module | Surface |
|--------|--------------|---------|
| `/api/auth` | `routes/auth.ts` | Login, logout, refresh, current user, password/session actions |
| `/api/pvp` | `routes/pvp.ts` | PvP battles, comments, reactions, reports |
| `/api/news` | `routes/news.ts` | Public news |
| `/api/forum` | `routes/forum.ts` | Forums, profiles, images, subscriptions, polls |
| `/api/admin` | `routes/admin.ts` | Permissioned administration, operations, backups, settings |
| `/api/admin/users` | `routes/userManagement.ts` | Permissioned account/character management |
| `/api/admin/git` | `routes/git.ts` | Permissioned MUD repository status/actions |
| `/api/content` | `routes/content.ts` | Managed MUD help/news/MOTD/information content |
| `/api/frag` | `routes/frag.ts` | Frag rankings and player/account summaries |
| `/api/zones` | `routes/zones.ts` | Zone list/status and bounded mutations |
| `/api/status` | `routes/status.ts` | Public health history/incidents |
| `/api/server/reboot` | `routes/serverReboot.ts` | Reboot history/statistics |
| `/api/mud` | `routes/mudControl.ts` | Permissioned MUD process status/control |
| `/api/builder` | `routes/builder.ts` | Builder data, editing, validation, access, comments |
| `/api/wiki` | `routes/wiki.ts` | Wiki/game reference data and updates |
| `/api/help` | `routes/help.ts` | MUD help-file lookups |
| `/api/guide` | `routes/guide.ts` | Guide categories and help search |
| `/api/guide/suggestions` | `routes/helpSuggestions.ts` | Authenticated guide suggestions/moderation |
| `/api/notifications` | `routes/notifications.ts` | Authenticated notifications |
| `/api/analytics` | `routes/webAnalytics.ts` | Retired tracking endpoint and protected analytics reads |
| `/api/privacy` | `routes/privacy.ts` | Public choice status and same-origin CSRF choice actions; unapproved policy stays disabled |
| `/api/admin/analytics/web` | `routes/webAnalytics.ts` | Protected web analytics alias |
| `/api/auction` | `routes/auction.ts` | Auction reads, default-gated bid/buy actions, and MUD-authoritative admin removal |
| `/api/push` | `routes/push.ts` | VAPID key and authenticated subscriptions |
| `/api/changelog` | `routes/changelog.ts` | Changelog reads and permissioned management |
| `/api/public/statistics` | `routes/publicStatistics.ts` | Public faction activity, date, and overlap statistics |
| `/api/hooks` | `routes/hooks.ts` | Permissioned hook state, website toggle, and reconciliation |

Some route modules contain both public and protected handlers. Do not infer
authorization from the prefix alone; inspect the handler middleware and tests.

## Website data hold records

The separate [website data hold API](../runbooks/data-holds.md) at
`/api/admin/data-holds` is Overlord-only, signed-session authenticated and
no-store; POST create/release retain CSRF checks. It records scoped intent,
private reasons and immutable creation/release attribution with bounded history
pages. It explicitly returns global `enforcementReady: false`: existing feature
cleanup and restore paths do not consume these records. The separately
[gated SQL executor](../runbooks/retention-execution.md) rechecks them within
two-class deletion transactions and shares a control lock with hold writes;
all source approvals/enablement remain false. A recorded hold is not a claim
of live protection. Generic settings exclude the reserved
`retention-control-v1:` namespace, including SQL-collation aliases.

Both historical web-analytics router mounts send `Cache-Control: no-store` and
vary by Cookie before authentication. Their eight readers use SQL directly;
they no longer read/populate legacy `web_analytics:*` Redis entries. This changes
no authorization or response shape. Bounded legacy-key removal belongs to the
separate gated executor, not a dashboard request.

## Backup archive cleanup

Backup removal is described separately in the
[archive cleanup runbook](../runbooks/backup-archive-cleanup.md). Individual
deletion returns success only after unlink/confirmed absence and record removal;
pending/in-progress/shared/unsafe targets are refused. The failed-backup batch
stops on its first unconfirmed removal and returns no false success/count; prior
items may already be removed. Deletion failures use static `reason`/`reference`
with 409 for invalid/active/shared/held or review-blocked targets, or 503 for
unconfirmed storage/file work. Listings retain missing-file identities and do
not infer writer death from age. Prepared [managed ZIP admission](../runbooks/managed-archive-holds.md)
now orders holds with removal through a private durable journal and isolated
worker. Hold writes can return a retryable 409 before confirmation while an
earlier worker may still unlink; no error response claims a hold was recorded.
Global readiness stays false because uploads/workspaces, other cleanup and
general restore replay remain open.

## Forum image removal

All image status/list/removal routes require login. State changes retain the
ordinary same-origin CSRF check. `GET /api/forum/images/status` reports
`pendingImages` (unattached uploads plus requested removals), `pendingRemovals`,
`maxImages` and `canUpload`. Requested removals still count against the upload
limit until their origin-object deletion is confirmed.

`DELETE /api/forum/images/orphans` returns `{ deleted, failed, remaining,
unavailableImageUrls }`. `deleted` counts acknowledged origin removals whose
metadata removal committed; `failed` counts attempted removals that could not
be confirmed. `remaining` is the current pending count, including work beyond
this bounded batch. It can exceed `failed`. `unavailableImageUrls` contains at
most 100 owned uploads durably marked unavailable by this request, including
unconfirmed removals; the editor drops those previews and preserves other
images. A 200 reply can represent partial progress. If the final count query
fails after committed work, `remaining` is `null` and `reference` matches the
safe diagnostic; confirmed counts and unavailable URLs are retained. The editor
still drops those previews and keeps retry feedback visible until the remaining
work can be checked. A whole-request failure is 503 with a matching diagnostic
`reference` and must not be displayed as successful clearing.

`DELETE /api/forum/images/:id` returns success only for a confirmed owned,
unattached origin removal. Missing, foreign or already attached rows return 404;
storage failure, timeout, uncertain acknowledgement or a concurrent removal
returns 503 with a fixed retry message and matching diagnostic `reference`.
The database retains retry identity.
These acknowledgements do not certify removal from CDN caches or backups.

Thread/post create and edit link managed uploads before committing content.
An owned image awaiting removal causes 409 and rolls back publication; remove
that reference from the draft and retry. Existing external-image URL behavior
is unchanged. See [migration and recovery](../../backend/schema-baselines/README.md#forum-image-removal)
before deploying these writers.

## PvP pagination

PvP event lists, advanced search, player/location autocomplete, and favorites
clamp `page` to 1–10,000 and `limit` to 1–100. Missing or nonnumeric values use
page 1 and the endpoint's default limit: 50 for events/search, 20 for
autocomplete/favorites. Popular-location analytics uses the same limit bounds
with a default of 10. Response pagination reports the normalized query values.

## PvP participant snapshots

PvP descriptions, equipment, and public combat logs are battle-time snapshots
written by the MUD. The website does not substitute current character state for
missing historical data. Name-only historical descriptions remain valid for
player lookup, leaderboards, and autocomplete; unavailable class/race metadata
stays empty. Level filters use the stored numeric `pkill_info.level`, and list
participant summaries include that captured `level` alongside `description`.

The MUD publication contract is nullable `pkill_info.webinfo_at_capture`:
`1` permits publication, `0` withholds it, and `NULL` means unknown. Only `1`
can permit a POV. The MUD owns this column, its migration, and capture-time
classification; DurisWeb never creates or backfills it. A missing column or
unexpected value withholds snapshots while retaining battle metadata. Schema
availability is checked on reads, so a later MUD migration needs no website
restart. Metadata-query failures fail the request closed.

`GET /api/pvp/events/:id` includes a `pov_status` for each participant:

| Status | Meaning | `log` and `equip` |
| --- | --- | --- |
| `public` | Capture allowed publication and any current-state gate passed | Stored values; null/empty means no snapshot was captured |
| `private` | Capture opted out, or the enabled current-state gate found webinfo off | Both `null` |
| `unavailable` | Capture permission is unknown/invalid, schema is absent, or the enabled current-state gate has no character privacy record | Both `null` |

When `respect_webinfo_toggle` is enabled, the character's **current saved**
`player_data.act2` webinfo bit must also be on. Disabling that admin setting
skips only this current-state gate: it never overrides a private or unknown
capture. Later opt-in cannot publish an opted-out or unknown capture. Previously
permitted snapshots hidden only by the current flag become visible again after
saved opt-in. Missing current characters are unavailable while this gate is on;
when it is off, only their captured permission decides publication.

The API omits withheld payloads in SQL, including equipment embedded in logs.
There is no owner/admin bypass. `webinfo` controls outgoing publication, not a
reader's access to permitted opponents. The detail view allows selection of
every participant, honors explicit `?pov=` links, defaults to a permitted POV,
and distinguishes privacy from missing snapshots on desktop, mobile, and in
dialogs. Public battle metadata and other participants remain available.

Stored comment quote text and its line/participant pointers use the same gate;
deleted comments and unresolvable quote origins also hide these fields. Creating
a quote requires a permitted POV and a valid line number. The server derives
the text from that log instead of trusting the supplied `quotedText`. Ordinary
user-written comment bodies are not log excerpts generated by the API and are
not automatically rewritten by a privacy change.

PvP HTTP responses use `Cache-Control: no-store`; the service worker uses the
network for PvP and removes old PvP entries from `api-cache` when activated.
Battle detail queries refetch on a new mount and are discarded when unused.
Refresh open pages after privacy changes and activate the updated service
worker during rollout. None of this retracts information already delivered.

Existing snapshots without authoritative capture permission remain withheld;
today's flag must not be used to backfill historical consent. Before a MUD
writer sets `1`, it must suppress private channels and prevent buffered text
from webinfo-off periods reappearing after opt-in. Website filtering cannot
recognize misclassified private text inside an otherwise permitted log.

Every public battle-derived response uses `pvp_delay_minutes`, including statistics,
autocomplete, analytics, favorites, comments, and profile histories/counts. Reads
and interactions targeting a still-hidden battle return the same 404 as a missing
battle. Changing the delay takes effect on subsequent queries.

Participant filters match an in-room participant and return the complete in-room
teams. Statistics combine snapshots by PID and resolve exact names from stored
history, including characters no longer present in `player_data`. Autocomplete
pages distinct identities before returning suggestions. Kills retain the MUD's
existing killer-side/assist semantics; they are not a final-blow count.

Both event-list and advanced-search routes accept `sort_by=date|likes`. Calendar
filters use the database server's calendar (UTC in the production deployment);
`date_to` includes that entire day. Invalid dates, hours, advanced level ranges,
and unsupported sort/alignment values return 400. Battle timestamps in list,
detail, favorites, statistics, and profile history are ISO 8601 instants with an
explicit UTC offset, derived from the database's timestamp interpretation.

Browser PvP notifications poll every 30 seconds independently of the release delay.
Serial batches use timestamp and ID ordering to deliver every newly eligible
battle after the startup cursor, including tied timestamps. A restart begins
at the newest visible battle and does not replay historical notifications.
Notification links use `/pvp/:id`. Battle dialogs support keyboard focus and
Escape dismissal through the shared dialog primitives.

Discord has an independent persistent queue, retry deadlines, and destination
boundaries; it does not inherit the browser startup cursor. See
[Discord delivery](../discord-delivery.md) for pause/resume, manual posting,
channel changes, required migration, and uncertain-delivery recovery.

Comment counts include retained thread slots. Deleting a comment replaces its
body with `[deleted]`, preserving its replies and its contribution to the count;
repeated deletion does not decrement the count.

## MUD news publishing

For visual treatment and game-color rules, see the
[Design guide](../DESIGN.md#game-content-and-charts). This section owns the
news data, editing, and publishing contract.

MUD news is the complete plain-text history, including MUD color codes, in
`mud_info` with `name = 'news'`. It is separate from the Website Changelog,
which uses `website_changelog` and `/api/changelog`.

| Method | Path | Contract |
|---|---|---|
| `GET` | `/api/content/news` | Public, returns `{ news }` |
| `GET` | `/api/news` | Public, returns the same text as `{ content }` |
| `PUT` | `/api/content/news` | Requires `manage_news`; body `{ content }` updates the database |
| `POST` | `/api/content/news/announce` | Requires `manage_news`; announces the first dated section without editing or importing content |

The checked-in news validator accepts nonempty strings up to 250,000 JavaScript
string characters, rejects unsupported control characters, and preserves text
instead of treating it as HTML. Other managed HTML content keeps its separate
50,000-character limit. Render news with text escaping so command placeholders,
ampersands and color codes survive safely. The editor retains original bytes
for an untouched save; an edit can normalize color-span encoding while retaining
the visible text, whitespace and colors.

Announcement headings support `M/D/YY` or `M/D/YYYY`, optionally a date range
and a title separated by a dash or colon. `-` and `*` introduce bullets;
indented continuation lines are joined. Parsing stops at the next dated section
and refuses an invalid or empty first section instead of advertising an older
entry. Delivery broadcasts `NEWS_UPDATED`, attempts configured browser push,
and stores notifications for accounts drawn from login history. An announcement
does not guarantee push delivery when push is disabled or no subscription exists.

The website query has a five-minute freshness window, with no polling or
window-focus refetch. Becoming stale alone does not fetch new content.
`NEWS_UPDATED` invalidates the news query before checking whether its popup
date was dismissed; an editor save invalidates that browser's query too.
See [publishing and MUD refresh](../deployment.md#publish-mud-news) for the
database/file/runtime ownership boundary. As with any release, verify installed
artifacts before relying on the checked-in contract.

## Default-closed MUD mutation routes

Several legacy routes remain addressable for compatibility but return HTTP 503
with `error: "operation_gated"` unless an operator explicitly opens their unsafe
mutation gate. Database restore remains unavailable regardless of its old switch:

| Route family | Gate |
|---|---|
| `POST /api/auction/listings/:auctionId/bid` and `/buy` | `auctionWrites` |
| Player/locker duplicate-item delete and bulk-delete routes under `/api/admin/dupes` | `itemDeletes` |
| `POST /api/admin/mud/wipe/execute` | `playerWipe` |
| `POST /api/admin/backup/restore` and `/api/admin/backup/upload/restore` | `databaseRestore` (source-disabled; no runtime override) |

Read-only auction and duplicate diagnostics are unaffected. Administrative
auction removal is also unaffected because it already delegates to the MUD's
authoritative critical command. The `ALLOW_UNSAFE_*` settings do not supply the
missing safety contracts and should remain closed in ordinary deployments; see
[Configuration and Environments](../environments.md#unsafe-mutation-gates).

The backup page keeps stored/uploaded content inspection available and explains
that restore is unavailable; all restore modes and confirmations are disabled.
Both restore routes still require authentication and `manage_mud_backup` before
their static 503 refusal. The response gives a safe explanation and no
`enableWith` instruction, new operation ID or echoed request payload. Direct
`createRestore` / `createRestoreFromUpload` service calls throw
`DatabaseRestoreUnavailableError` (`code: restore_unavailable`) before archive,
SQL or process work; the obsolete asynchronous executor is removed. Backup
creation, inspection/download, uploaded-archive validation/cancellation and
historical restore status remain under their existing permissions. This is not
an implementation of protected physical recovery or complete restore-removal
replay; use the separately authorized
[operator recovery procedure](../deployment.md#application-restore-boundary).

The backup page waits for acknowledged operation starts and preserves restore
selections/upload identity after refusal. Upload cancellation also waits for
an acknowledged result; failure keeps its dialog and retry reference. Restore
and cancellation failures render inside the open dialog. A declared HTTP 503
`operation_gated` response is an operation refusal, so the shared client rejects
it without showing a site-wide outage or replaying the request. Other server
and connection failures retain the ordinary availability warning behavior.

## Authentication and CSRF

- Login issues HTTP-only `access_token` and `refresh_token` cookies. Protected
  handlers use `requireAuth`, which verifies the access JWT and the associated
  live `web_sessions` row before loading permissions.
- Authorization may require game level/role, a granular permission, or both.
  Overlord role bypasses granular admin permissions.
- State-changing requests use a double-submit `csrf_token`: send the cookie
  value as `x-csrf-token`. Safe methods are exempt.
- `/kofihook` is the explicit CSRF exemption. The
  Ko-fi route independently requires a constant-time verification-token match,
  validates a bounded payload, rate limits requests, and acknowledges only
  durable recording.
- Both `POST /api/analytics/track` and the alias
  `POST /api/admin/analytics/web/track` return `410` for CSRF-valid requests.
  Optional website collection is closed pending approved notice/choice controls
  and retention readiness. No browser claim of consent enables it. The prepared
  policy disables receipt issuance and collection; neither route calls a
  geolocation provider. Invalid CSRF still returns `403`. The protected
  historical dashboard remains available; this does not delete earlier records.
- Credentialed CORS accepts only `ALLOWED_ORIGINS` (plus requests with no
  browser Origin header).

Raw refresh-token storage and session timezone semantics are open findings; see
the [security record](../SECURITY-COMPLIANCE.md).

## Privacy choice contract

The source-owned [draft policy](../../backend/src/config/privacyPolicy.ts) is
unapproved, with collection and retention-readiness gates disabled. No runtime
environment flag or generic admin setting can approve it. The following contract
is prepared for reviewed policy/client integration; it is not a live feature claim.

- `GET /api/privacy` is public and returns noncached notice/choice versions,
  `choicesAvailable`, `collectionAvailable`, decision (`unknown`, `accepted`,
  `refused`, `withdrawn`), revision, nullable database expiry epoch and
  `receiptValid`. It never issues a receipt or optional visit identifier.
  It never clears a receipt cookie, including an invalid, obsolete or expired
  one: a delayed status response must not remove a concurrently rotated cookie.
  An invalid receipt cannot authorize its named record. Status and explicit
  retries use the current CSRF-bound identity when the receipt is invalid,
  allowing recovery from a lost cookie update without changing another browser's
  choice. Refresh status before an explicit choice retry; only an acknowledged
  choice POST replaces the cookie. Unapproved policy returns unknown/unavailable
  without reading or writing a preference.
- `POST /api/privacy/choice` requires an explicit same-origin request (`Origin`
  equal to the configured website origin, no cross-site fetch metadata), the
  double-submit CSRF cookie/header, and body
  `{ noticeVersion, choiceVersion, decision, revision }`.
  Unknown fields, coerced decisions and invalid revisions are refused. Competing
  changes use the current revision; an outdated revision is `409`. Invalid
  browser context or a credential rotated during the transaction is `403`.
  An already-invalid receipt uses the CSRF-bound recovery described above.
  Refresh before an explicit retry. Failure
  must leave the client locally stopped and visibly unsaved. Both notice and
  choice versions must match, even if only the notice changed.
- Only an acknowledged choice transaction issues/rotates the opaque HTTP-only,
  SameSite Strict, root-path cookie; production additionally uses Secure and the
  `__Host-privacy_choice` name (`privacy_choice` outside production). Only a
  domain-separated SHA-256 credential digest is retained. The existing necessary
  CSRF token binds a first choice via an HMAC; no analytics identifier is created
  beforehand. A client-supplied `consent: true` has no authority.
- Choice records use the reserved `privacy-choice-v1:` namespace in InnoDB
  `web_settings`, excluded from generic settings readers/writers including
  collation-folded aliases. They store only format, versions, decision, revision,
  digest and database epochs; no account or IP. Invalid records are retained and
  fail closed. Preference expiry does not assert physical-row retention.
- After **all** source release gates are approved and ready, tracking accepts
  exactly `{ route, visitNonce, choiceVersion, revision }` with a current receipt
  and CSRF token. The server maps an allowlisted route family to a canonical
  template, derives a visit pseudonym and writes the page-view/session pair in
  one transaction. No raw path, query, fragment, title, account, IP, referrer,
  UTM, user-agent, screen or geography field is accepted or enriched. Both old
  tracking mounts call this same authorization/persistence boundary.
- Collection and choice updates lock the same receipt row. An event whose lock
  precedes withdrawal completes before withdrawal is acknowledged; one ordered
  afterward fails. Revision/credential rotation rejects stale queued events and
  other tabs' old grants. An already completed write/transfer cannot be recalled
  by browser cancellation. There are no optional provider transfers in this path.

The prepared browser state machine validates this contract and confirms the
actual receipt cookie with a read-back before creating a memory-only visit nonce.
Cross-tab actions are serialized; refusal/withdrawal, unreadable/expired/obsolete
state and account transitions stop optional work. Its local safety setting never
authorizes collection by itself. The public notice is explicitly draft. Owner
policy approval and P6 retention/hold handling remain release gates; do not enable
the prepared collector because isolated tests exercise a synthetic approved policy.

## Hook Control API

All hook endpoints require authentication plus `manage_mud_properties` (or
overlord access).

| Method | Path | Body | Result |
|--------|------|------|--------|
| `GET` | `/api/hooks` | None | Registry rows with website, MUD, effective, provenance, resource, and sanitized transport state |
| `PATCH` | `/api/hooks/:id` | `{ "enabled": boolean }` | Changes only the website-owned toggle and records actor context |
| `POST` | `/api/hooks/:id/reconcile` | `{ "enabled": boolean }` | Sets applicable ends in fail-closed order and reports complete/warning state |

Hook ids must be exact registry values and `enabled` must be a JSON boolean.
Terminal mutation is rejected. The frontend should render the returned observed
state rather than applying an optimistic result.

## WebSockets and the MUD Bridge

The browser-facing WebSocket uses `/ws` on the DurisWeb server for terminal,
streaming, and application events. Authenticated clients obtain a five-minute,
session-bound capability from `GET /api/auth/websocket-token` for subscriptions,
builder streams, and deployment requests. Every operation retains its session,
level, and permission checks. `GET /api/auth/terminal-token` issues a separate
terminal-only capability; neither capability authenticates ordinary HTTP
requests. Initial socket identity is hydrated from the HTTP-only access cookie.

The application WebSocket is distinct from the backend's outbound
privileged MUD bridge, whose endpoint is required through `MUD_WS_URL`. A
loopback `ws://127.0.0.1:4050` value is a local example, not an application
default. Hook state and reconciliation behavior is implemented by the
[state client](../../backend/src/hooks/mudHookStateClient.ts) and
[reconciliation service](../../backend/src/services/hookReconcileService.ts),
with the matching MUD side documented and tested in the separate MUD
repository.

Remote MUD bridge endpoints require `wss:` and certificate validation. Never
put the HMAC bridge secret in browser code or a `VITE_*` setting.

## Error Shape and Limits

Most JSON errors use `{ "error": "message" }`; validation handlers may return
structured `errors`. Body limits, route-specific rate limits, and resource-id
validators live in middleware/route code. Clients should handle 400, 401, 403,
404, 409, 413, 429, 500, and dependency-related 503 responses according to the
specific endpoint contract.

## Documentation Gap

A complete OpenAPI contract, schema examples, and generated-client workflow do
not exist. Adding them requires a dedicated inventory/reconciliation of the
large route surface; this page must not be treated as an exhaustive endpoint
schema.

### Public faction activity

`GET /api/public/statistics/available-dates` lists the newest 30 recorded UTC
calendar days. `GET /api/public/statistics/faction-activity?date=YYYY-MM-DD`
returns the MUD's recorded samples for that UTC day. Both use the same cutoff:
only complete days ending at least 24 hours ago are published. For example,
on October 18 the newest eligible day is October 16. Yesterday, today and
future days return an empty data array. Invalid calendar dates return 400;
database failures return 500, rather than an empty success.

The authoritative source is the MUD-owned `statistics` table, read through
`mudPool`. The MUD's operational statistics job already writes these samples;
no website importer or migration is required. `illithids_count` supplies the
existing `neutrals` series; staff counts are not included. The separate daily
account-login export from Duris PR #41 contains no faction breakdown and is
not this page's data source. Historical responses are cached for ten minutes;
the date-list cache changes at UTC midnight. The page selects the newest
published date, displays UTC times, and offers retry on load failure.

### Public faction overlap

`GET /api/public/statistics/faction-overlap?days=7|14|30` (default 14)
summarizes when goods and evils are online together over the newest published
days, by UTC hour of day. The window is `[cutoff - days, cutoff)` with the
same cutoff as faction activity, so it never includes anything fresher than
that page. Each populated dated UTC-hour entry in `hours` carries its epoch-second
`timestamp`, `samples`, `bothSamples`
(at least one goods and one evils player online), goods/evils peak and
average, and goods/evils averages over only the overlapping samples. Hours
without samples are omitted. `firstDate`/`lastDate` are the UTC days that
actually had samples (null when none). Any other `days` value returns 400;
database failures, invalid source counts (null, negative or fractional), or
out-of-range rows return 500 without caching a successful summary. Results are
cached in Redis and in the process for ten minutes, with at most one process
entry per allowed window. Entries change at UTC midnight; publication eligibility
is still checked before returning a local result. Concurrent misses share one
read per window. Failed reads are shared for a 60-second retry cooldown, preventing
repeated aggregate queries when Redis or SQL is degraded. SQL has a two-second
server statement limit on MySQL and MariaDB and a 2.5-second client timeout.
The entire read, including cache access and pool acquisition, has a four-second
response deadline; expiry returns 503 and destroys an active query connection.
An unfinished read stays shared until its underlying I/O settles, even after
the deadline or a UTC-day change. A connection acquired after expiry is released
without querying. No pooled session setting is changed. The route allows 30 requests per minute per client,
then returns 429. The first detected forward clock jump or a rollback making an in-flight
window ineligible returns 503 without publishing data. The shared publication
clock is guarded by elapsed monotonic time and eligibility is rechecked after I/O.
After detecting a forward correction, later requests recover using the conservative
monotonic timeline, capped by wall time. The clock never re-anchors to the advanced
wall time, so a permanent correction cannot release history early or disable it indefinitely.

The `/statistics/faction-overlap` page converts each dated bucket to the viewer's
historical local hour before combining counts, peaks and sample-weighted averages.
Daylight-saving transitions therefore use the offset at each sample date;
half-hour zones start at `:30`. It ranks the top five overlap hours using
unrounded shares and draws peak goods and evils per hour. Missing hours are
zero-filled in the browser and have a distinct no-data color; measured zero
overlap uses the heat scale's zero color. Percentages are rounded only for text.
One day's missing start times are filled at the newest observed minute offset.
Across a half-hour DST change, additional observed start times remain separate
and are explained above the single-row, horizontally scrollable daily chart;
they do not create a second day of empty placeholders or claim identical windows.

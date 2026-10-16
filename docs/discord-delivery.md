# Discord PvP delivery

The bot transport reports a confirmed message ID, a retryable outcome, or a
failure requiring intervention. Authentication, permission, missing-channel,
and invalid-payload errors do not trigger an immediate retry. A timeout, server
error, or missing success message ID is uncertain: Discord may have accepted
the message. Logs identify the battle and a fixed error code, never response
content or credentials.

Requests respect Discord's retry headers/body and stop further local sends until
that deadline. Concurrent calls wait their turn, so a slow manual/test request
cannot discard an automatic battle as busy. The queue advances after failures,
and checks configuration and rate-limit deadlines again when each turn starts.
Manual posts and test messages retain their existing success/error response.

Queued callers can pin a channel and provide a persisted nonce; a changed channel
is rejected before any request. Reusing that nonce reduces duplicate delivery
within Discord's short deduplication window. It does not establish exactly-once
delivery after an arbitrary outage. Explicit manual reposts omit the nonce.

See the [official message API](https://docs.discord.com/developers/resources/message#create-message)
and [rate-limit contract](https://docs.discord.com/developers/topics/rate-limits).

Large teams are split across embed fields so normal 15-participant battles keep
their POV links without exceeding Discord's 1,024-character field limit. Titles,
individual oversized legacy descriptions, and the total embed are bounded. If
even one legacy participant's text or POV link cannot fit, the announcement explicitly directs readers to the
linked battle for the full roster; stored battle data is never truncated.

## Durable scheduling and lifecycle

Apply migrations `20261016150000_pvp_discord_delivery.ts` and
`20261016160000_pvp_discord_audit_columns.ts` before starting the new backend.
They create two website-owned tables with standard IDs and timestamps, without
mutating MUD records. The audit-column migration preserves existing receipts and
keys; its `down` removes only the added metadata columns. The original migration's
`down` removes delivery state; rolling it back loses deduplication receipts
and activation boundaries, so preserve those tables before an intentional rollback.
Do not run the whole historical migration chain against an empty MUD database.

Discord runs independently of browser WebSocket/push notifications every 30
seconds. Each pass discovers and sends at most 100 events in timestamp/ID order.
Discovery selects eligible events above the fixed activation ID cutoff that are
missing a delivery record; no moving delivery cursor or full public-list count
can skip a late commit above that cutoff. Each attempt reloads
the enabled setting and privacy delay and checks the same release predicate as
the public API. Already-sent messages cannot be retracted by raising the delay.

- **First enable:** commit the current maximum event ID as a destination boundary
  in the same transaction as the enabled setting. Older events, including ones
  still embargoed, are excluded from automatic backfill. This is an ID cutoff,
  not a transaction-commit-time boundary: an earlier reserved ID at or below the
  cutoff remains excluded even if its transaction commits after activation.
  Use an explicit manual post for such a visible battle. Late commits with IDs
  above the cutoff remain discoverable regardless of their commit order.
  When upgrading an
  already-enabled installation or selecting a new channel, this initialization
  occurs on the first worker pass. Use manual posts for specific visible history.
- **Pause/resume:** pausing stops sends, retains pending work, and continues
  bounded discovery. Resume drains that backlog subject to the current delay.
  Restart keeps the same boundary and receipts. A missing bot configuration
  stops discovery until configuration is restored; subsequent discovery catches up.
- **Destination change:** the new channel starts at its own boundary; old work
  is never retargeted. Switching back resumes the old channel, including battles
  since its activation that occurred while another channel was configured.
- **Manual posts:** work while automation is disabled and respect the delay.
  Success satisfies automatic delivery for that event/channel. Further manual
  posts are intentional reposts; their failure does not erase a prior receipt.
- **Retries:** transient failures use exponential backoff from 30 seconds to one
  hour. A Discord rate-limit deadline can extend that wait. Failures delay the
  destination as well as the event, preventing a burst of failures across the
  queue. Authentication/permission/missing-channel and unclassified HTTP failures
  block the destination;
  invalid payloads fail that event and allow unrelated battles to continue.

A database advisory lock serializes workers, manual posts, and auto-post toggle
changes across processes sharing a database. A toggle change during an active
send returns a busy error; retry it after that attempt finishes. Polls never
overlap the current owner. Delivery results and destination backoff/block state
commit in one transaction, so a database failure cannot save only half the policy.
Delivery state is committed before the HTTP request;
an interrupted `sending` row waits at least 30 seconds before uncertain recovery.
An accepted request whose receipt cannot be saved is retried with the same nonce
and marked uncertain. This is **at-least-once recovery**, not exactly-once
delivery: after Discord's nonce window, retries can duplicate an accepted post.
Persisted confirmed successes are not retried automatically.

Status reads use one consistent database snapshot. Other-destination counts include
both saved outstanding deliveries and eligible battles that will be discovered
when that destination is selected again, without double-counting saved receipts
or including undiscovered battles still under the privacy delay. Reading status
does not queue or send those battles.

Web Settings and its delivery controls are available to accounts with
`manage_front_page`, including delegated managers without an immortal level.
For those managers, the Admin navigation link opens Web Settings directly.

## Operator status and recovery

Web Settings → Discord Integration shows the current destination, pause/block
state, pending/failed counts, uncertain attempts, last confirmed automatic post,
and up to 50 recent outstanding or uncertain entries with battle links. Retained
work for other channels is counted separately. Status failures are shown as
unavailable rather than an empty healthy queue. Use **Refresh status** for a new
read; status reads never send a message.

After correcting credentials, channel permissions, or rejected content, use
**Retry failed deliveries**. It requeues only failed rows for the currently
configured destination and clears its block. It does not turn automatic posting
on, resend confirmed deliveries, or shorten an existing cooldown. A paused
queue stays paused. The retry action can return busy while another attempt is
running; refresh before trying again. The independent **Send test message** and
per-battle manual-post action retain their existing behavior.

`GET /api/admin/discord/delivery` and `POST /api/admin/discord/delivery/retry`
require authentication and `manage_front_page` (or overlord access). The GET
response has `Cache-Control: no-store`; errors return 503 without database
details. Retry returns 409 when busy/unconfigured and 503 for a persistence
failure. The response contains no bot credentials, nonce, raw response, or player
payload. Times are UTC ISO strings rendered in the operator's local timezone.

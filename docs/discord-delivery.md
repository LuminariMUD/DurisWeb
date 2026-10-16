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

## Durable scheduling and lifecycle

Apply migration `20261016150000_pvp_discord_delivery.ts` before starting the new
backend. It creates two website-owned tables and does not mutate MUD records.
Its `down` removes delivery state; rolling it back loses deduplication receipts
and activation boundaries, so preserve those tables before an intentional rollback.
Do not run the whole historical migration chain against an empty MUD database.

Discord runs independently of browser WebSocket/push notifications every 30
seconds. Each pass discovers and sends at most 100 events in timestamp/ID order.
Discovery selects eligible events missing a delivery record; no moving delivery
cursor or full public-list count can skip a late commit. Each attempt reloads
the enabled setting and privacy delay and checks the same release predicate as
the public API. Already-sent messages cannot be retracted by raising the delay.

- **First enable:** commit the current maximum event ID as a destination boundary
  in the same transaction as the enabled setting. Older events, including ones
  still embargoed, are excluded from automatic backfill. When upgrading an
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
  queue. Authentication/permission/missing-channel failures block the destination;
  invalid payloads fail that event and allow unrelated battles to continue.

A database advisory lock serializes workers, manual posts, and auto-post toggle
changes across processes sharing a database. A toggle change during an active
send returns a busy error; retry it after that attempt finishes. Polls never
overlap the current owner. Delivery state is committed before the HTTP request;
an interrupted `sending` row waits at least 30 seconds before uncertain recovery.
An accepted request whose receipt cannot be saved is retried with the same nonce
and marked uncertain. This is **at-least-once recovery**, not exactly-once
delivery: after Discord's nonce window, retries can duplicate an accepted post.
Persisted confirmed successes are not retried automatically.

Operator status and recovery controls remain the next chunk of
[issue #30](https://github.com/LuminariMUD/DurisWeb/issues/30); this intermediate
backend change must be deployed with that follow-up to provide the complete workflow.

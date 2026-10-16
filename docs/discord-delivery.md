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

The durable scheduler, lifecycle policy, and operator status are tracked by
[issue #30](https://github.com/LuminariMUD/DurisWeb/issues/30). Until that work is
integrated, the existing in-memory scheduler still consumes failed attempts;
transport classification alone does not provide restart recovery.

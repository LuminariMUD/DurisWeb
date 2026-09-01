# Security & Compliance

> Cumulative security posture and GDPR compliance record. Updated between phases via /carryforward.
> **Line budget**: 1000 max | **Last updated**: Phase 00 (2026-09-01)

---

## Current Security Posture

### Overall: NEEDS REVIEW

| Metric | Value |
|--------|-------|
| Open Findings | 8 GDPR baseline + 2 High (SEC-TZ-1 session expiry, SEC-RT-1 refresh tokens) |
| Critical/High | 2 |
| Medium/Low | 0 |
| Phases Audited | 1 implementation audit (Phase 00 validation PASS) |
| Last Clean Phase | -- |

---

## Open Findings

Active security or GDPR issues requiring attention. Ordered by severity.

### Critical / High

**SEC-TZ-1: Session expiry depends on app and database sharing a timezone.**

`sessionService.ts:27` tests `expires_at > NOW()`. `expires_at` is written by
mysql2 from a JS `Date`, serialized as a local-time string in the **application
host's** timezone, and compared against `NOW()` in the **database server's**
timezone. If the two diverge, session expiry is silently wrong by the offset.

Observed directly in Phase 00 Session 03 while building a test database: with
the app host at UTC+3 and MySQL at UTC, a session expired 60 seconds earlier
still authenticated successfully, and would have kept authenticating for
another three hours. Aligning the database timezone made the existing
regression test pass.

- **Severity**: High. Silently extends authenticated session lifetime, and
  fails open rather than closed.
- **Detection**: none. Nothing compares the two timezones or alarms on drift.
- **Remediation**: store and compare in UTC explicitly (`UTC_TIMESTAMP()`, or a
  `timezone: 'Z'` mysql2 connection option), or assert at startup that the
  application and database timezones agree and refuse to boot otherwise.
- **Status**: Open. Not introduced by Phase 00; found by it.

**SEC-RT-1: Refresh tokens are stored verbatim, in a database shared with the MUD.**

`routes/auth.ts:107-116` generates a refresh JWT and inserts it unchanged into
`web_sessions.refresh_token`. Nothing hashes it; `sessionService.ts:17` compares
the raw value with `AND refresh_token = ?`. The column is `VARCHAR(512)`,
consistent with storing a full JWT rather than a digest.

The severity is raised by an architectural fact confirmed in Session 03:
durisweb has no database of its own - it shares the MUD's `duris_dev` schema. So
the blast radius is not just durisweb operators. Anyone with read access to the
MUD's database, any MUD database backup, and any SQL-injection reachable from
either codebase yields a set of live, directly replayable session tokens.

- **Severity**: High. Read access to one table is sufficient to impersonate
  every currently logged-in user until their tokens expire (7 days).
- **Detection**: none. A replayed token is indistinguishable from the real one.
- **Remediation**: store a SHA-256 digest and compare digests; the token stays
  only in the client cookie. This is a contained change - one insert site and
  one comparison - but it invalidates existing sessions on deploy.
- **Status**: Open. Confirmed in Phase 00 Session 04, answering the question
  raised in the Session 01 survey.

### Medium / Low

*No open findings.*

---

## MUD Integration Surface

The website and the MUD server are coupled through five distinct channel types,
each with its own trust boundary. This is the subject of Phase 00. Baseline from
code survey on 2026-09-01.

**Both sides are inspectable.** The MUD server source (C) is checked out locally
at `/home/aiwithapex/projects/duris/` and referenced by durisweb through
`MUD_DIR`. Every claim in this section can and should be verified against the
MUD source rather than inferred from the durisweb side alone -- in particular
`src/net/ws_auth.h`, `src/net/ws_handlers.c`, and `src/net/comm.c` for the
channel 1 auth contract, and `logs/log/comm` for what channel 3 actually
ingests.

### Channels

| # | Channel | Direction | Implementation | Authentication |
|---|---------|-----------|----------------|----------------|
| 1 | MUD WebSocket bridge (port 4050) | MUD -> web | web: `mudAuctionClient.ts` / MUD: `src/net/ws_auth.h`, `src/net/ws_handlers.c`, `src/net/comm.c`, `src/net/gmcp.c` | HMAC-SHA256 over a connection-bound challenge, keyed by `DURISWEB_SECRET` |
| 2 | Scoped Redis pub/sub | MUD <-> web | `utils/scopedRedis.ts`, `donationOutboxService.ts`, `playerEventSubscriber.ts` | Per-scope Redis username/password, namespace + season epoch scoping |
| 3 | Flatfile and log ingestion | MUD -> web | web: `mudConnectionLogSync.ts`, `logWatchService.ts`, `mudAccountParser.ts`, `mudFlagParser.ts`, `mudGuildParser.ts`, `zoneBuilderParser.ts` / MUD: `logs/log/comm`, `Accounts/`, `Players/` | None -- filesystem trust via `MUD_DIR` |
| 4 | Process control | web -> MUD | web: `mudControlService.ts`, `serverRebootService.ts`, `deploymentService.ts` / MUD: `scripts/cycle_mud.sh` | Application-level admin permissions only |
| 5 | Interactive terminal | web -> host | `terminalService.ts` (node-pty + bubblewrap + tmux) | Admin permission plus per-session authorization |

### Trust Boundary Notes

- **Channel 1** is the privileged bridge. `resolveMudWebSocketUrl` rejects URLs
  carrying credentials, queries, or fragments and requires `ws:`/`wss:`. The
  default is `ws://127.0.0.1:4050`; plaintext is accepted only for loopback,
  and a non-loopback host is refused. WSS explicitly uses
  `rejectUnauthorized: true`. `DURISWEB_SECRET` is fail-closed and must be at
  least 32 bytes; the backend retries `DURISWEB_SECRET_PREVIOUS` exactly once
  after current-key rejection. Frontend code is contract-tested to never
  reference either secret. A deployed certificate-valid reverse proxy remains
  an operator-owned production acceptance, not a repository claim.
- **Channel 3 is unauthenticated by construction.** Anything that can write to
  `${MUD_DIR}/logs/log/comm` (locally `/home/aiwithapex/projects/duris/logs/log/comm`)
  or the flatfiles under `Accounts/` and `Players/` controls what the website ingests,
  including the account and IP records that feed `suspicious_accounts`.
  Session 05 now contains paths under a canonical MUD root, rejects traversal,
  escaping symlinks, oversized/NUL/invalid-UTF-8 input and truncated records,
  bounds search work, isolates per-hook unavailability, and backs off retries.
  Host filesystem trust remains the authentication boundary.
- **Channel 4 executes shell processes.** `mudControlService.ts:116` runs `pgrep`
  through `execAsync`, and `:310` spawns `setsid ./cycle_mud.sh`.
  `deploymentService.ts` spawns `git`. Argument construction and permission
  gating are the controls that matter here.
- **Channel 5** grants an authenticated admin a shell. The bubblewrap sandbox
  binds `MUD_FOLDER` as `/` and unshares user, IPC, UTS, and cgroup namespaces,
  but deliberately uses `--share-net` and a shared PID namespace so tmux
  sessions persist. `/tmp` is bind-mounted read-write and the generated
  `/tmp/.duris_bashrc-${sessionId}` path is predictable.
- Existing regression coverage lives in
  `services/__tests__/integrationSecurityContract.test.ts`,
  `services/__tests__/terminalSessionAuthorization.test.ts`,
  `utils/__tests__/websocketAccess.test.ts`, and
  `utils/__tests__/scopedRedis.test.ts`. These encode the contracts established
  by the recent hardening commits and must not regress.

### Phase 00 Hook-Control Security Controls

- One immutable registry defines 14 rows: 13 website-toggleable hooks and an
  always-on terminal. Exactly eight have a MUD property; five correctly report
  MUD N/A.
- Website delivery is synchronously suppressed at every registered owner
  boundary. MUD emitters return before payload construction; admin deletion
  refuses before payload parsing; donation events are drained/dropped before
  application.
- MUD state is accepted only from the authenticated bridge, validated as a
  schema-v1 boolean map, replaced wholesale, and cleared on disconnect. Missing
  or omitted foreign state is unknown/inactive.
- The authenticated `durisweb_hook_set` command validates auth before data,
  accepts only the exact eight ids, a real boolean, and a non-empty bounded
  request id, then persists through `.new` plus rename before push/ack.
- Reconciliation disables the website first and enables it last. Ack alone is
  insufficient; the website waits for observed MUD state, and partial failure
  leaves the website gate closed.
- Hook status and transport surfaces expose sanitized state/provenance only;
  they do not return secrets, URL credentials, query/fragment content, source
  payloads, IPs, or player data.
- Regression coverage is registry-generated for all 13 website gates, exhaustive
  for all eight MUD gates and reconnect states, and cross-checked against MUD C
  sources, properties, and operator docs.

**Delivery status**: DurisMUD commits `28aa1100` and `246d4510` are pushed on
`feat/durisweb-hook-toggles` and intentionally unmerged. The no-merge topology
is a maintainer instruction, not an incomplete security control in the branch.

### Open Questions for Phase 00 - RESOLVED

All closed; see the Resolved Decisions section of PRD.md for the evidence.
Summary: (0) MUD source read; (1) `wss://` supported, on-host stays `ws://`
with a non-loopback guard; (2) MUD host is same-trust-domain, channel 3 gets
parser hardening as defence in depth, justified by `isalpha`-only character
names at `src/account/nanny.c:2444`; (3) secret lives in per-host `.env`, no
schedule, rotation via the previous-secret window; (4) permissions stay
separate - `mud_control` vs `terminal_access`; (5) replay protection confirmed
adequate - 32 random bytes, 30s expiry, minute-bound HMAC, attempt throttling.

Original questions retained for the record:

0. Read the MUD side first. `/home/aiwithapex/projects/duris/src/net/ws_auth.h`
   and `ws_handlers.c` define the authoritative channel 1 contract; questions 1-5
   should be answered against that source, not against durisweb alone.
1. Is channel 1 ever expected to cross a host boundary? If so, `wss:` and
   certificate validation become mandatory rather than optional.
2. What is the threat model for channel 3? If the MUD host is fully trusted,
   say so explicitly; if not, parser hardening and provenance checks are needed.
3. Is `DURISWEB_SECRET` rotatable without downtime, and where is it stored?
4. Do channels 4 and 5 share a permission model, or can they diverge?
5. Is there replay protection on the channel 1 challenge beyond
   connection-binding?

---

## GDPR Compliance Status

### Overall: NEEDS REVIEW

The application collects and processes personal data across accounts, forums,
web analytics, donations, and anti-multi-account detection. No consent, retention,
or erasure mechanism has been identified in the codebase. Baseline established by
code survey on 2026-09-01; not a legal assessment.

### Personal Data Inventory

| Data | Location | Purpose | Notes |
|------|----------|---------|-------|
| Account name | `accounts`, and as FK across most tables | Identity, authorization | Primary key; user-chosen, links all other records |
| Email address | `accounts.email`, `user_profiles.email` | Account recovery, MUD account linkage | Imported from MUD flatfile |
| Refresh tokens | `web_sessions.refresh_token` | Session persistence | Stored in plaintext column (VARCHAR 512) |
| IP address | `page_views.ip_address`, connection logs, `admin_action_log`, `wipe_history`, builder/deployment/backup logs | Analytics, geolocation, audit, abuse detection | 28 column references across migrations |
| Reverse DNS hostname | connection tracking tables | Abuse detection | Added 20251113210000 |
| User agent, device, browser, OS, screen size | `page_views` | Analytics | Fingerprint-adjacent when combined |
| Geolocation (country, city) | `page_views` | Analytics | Derived from IP via ip-api.com |
| Referrer and UTM parameters | `page_views` | Attribution | |
| Visitor session id | `page_views.session_id`, `visitor_sessions` | Analytics | Ties pseudonymous visits together, incl. pre-login |
| Profile fields (bio, avatar URL, website, location) | `user_profiles` | Public profile | User-supplied free text |
| Forum content, reactions, poll votes, mentions | `forum_*` tables | Community features | `forum_poll_vote_history` retains non-anonymous vote records |
| Donor email, donor name, amount, message | `donations` (`kofi_email`, `kofi_name`) | Donation tracking, account linkage | Financial data tied to identity |
| Ban and moderation records | `user_bans`, `forum_moderation_log`, `admin_action_log` | Moderation | |
| Suspicion scores and evidence | `suspicious_accounts.evidence` | Multi-account detection | JSON with shared IPs and overlapping sessions; automated profiling |
| Push subscription endpoints | push notification service | Web push delivery | |

### Third-Party Transfers

| Recipient | Data sent | Mechanism |
|-----------|-----------|-----------|
| Google Gemini (`gemini-2.5-flash`) | Account name, character name, IP address, timestamps per login event | `geminiSuspicionAnalyzer.ts` -- automated profiling sent to an external LLM |
| ip-api.com | Visitor IP addresses | `utils/geoip.ts` geolocation lookups |
| Ko-fi | Donation webhook payloads incl. donor email and name | `routes/kofi.ts`, `donationService.ts` |
| Discord | Notification content | `discordService.ts` |
| Cloudflare R2 | User-uploaded images | `r2Service.ts` |
| Web Push endpoints (browser vendors) | Push payloads | `pushNotificationService.ts` |

### Compliance Checklist

| Requirement | Status | Notes |
|------------|--------|-------|
| Data collection has documented purpose | GAP | No privacy notice or processing record found in repo |
| Consent obtained before data storage | GAP | No consent or cookie banner found; analytics tracks visitors pre-login |
| Data minimization verified | PARTIAL | `page_views` stores IP, user agent, geo, and screen size per view. However presence feeds already minimize by default: `DURISWEB_PRIVATE_PRESENCE` must be exactly `TRUE` for account names, IP addresses, or client metadata to be included. Confirm its production value. |
| Deletion/erasure path exists | GAP | No account deletion or anonymization code found; `ON DELETE CASCADE` exists on some tables but no deletion entry point |
| Retention limits enforced | GAP | No retention, purge, or cleanup job found for analytics, connection logs, or audit tables |
| No PII in application logs | GAP | IP addresses logged in `utils/geoip.ts:81,103` and `mudConnectionLogSync.ts:131` |
| Third-party transfers documented | GAP | See table above; none documented outside this file |
| Automated profiling disclosed | GAP | Gemini-based suspicion scoring runs without a documented subject-information path |
| Credentials stored securely | GAP | Confirmed: `web_sessions.refresh_token` stores the raw JWT. See SEC-RT-1 |

---

## Dependency Security

### Current Vulnerabilities

*No dependencies audited yet.*

---

## Resolved Findings

*No resolved findings yet.*

---

## Phase History

| Phase | Sessions | Security | GDPR | Findings Opened | Findings Closed |
|-------|----------|----------|------|-----------------|-----------------|
| 00 | 7 | Validation PASS; repository controls complete | Baseline gaps remain | 2 High | 0 |

---

## Recommendations

Phase 00 closeout priorities, 2026-09-01:

1. Decide whether GDPR applies to this deployment (player residency, hosting region). If it does not, mark the GDPR section N/A with that rationale rather than leaving gaps open.
2. Make an explicit rollout decision for `SEC-RT-1`: digest refresh tokens and
   accept that deployment invalidates every existing session.
3. Remediate `SEC-TZ-1` with explicit UTC storage/comparison or a fail-fast
   startup timezone assertion.
4. Treat the Gemini transfer as a high-priority item -- account names and IP
   addresses leave the system to an external LLM for automated profiling.
5. Define retention for `page_views`, connection logs, and audit tables --
   nothing currently expires -- and establish an account erasure path.
6. Before networked production, have the deployment operator prove the live
   MUD reverse proxy is reached over certificate-valid WSS. Do not weaken the
   non-loopback plaintext block or certificate verification to pass rollout.

---

*Auto-generated by /initspec. Updated by /carryforward between phases.*

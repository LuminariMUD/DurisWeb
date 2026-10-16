# Security & Compliance

> Cumulative security posture and GDPR record.
> **Line budget**: 1000 max | **Last updated**: 2026-10-17

---

## Current Security Posture

### Overall: AT RISK

| Metric | Value |
|--------|-------|
| Open Security Findings | 3 named: 2 High, 1 Low |
| GDPR Baseline | 7 gaps, 3 partial controls (source status; deployment unverified) |
| Phases Audited | 1 (Phase 00, 7/7 sessions validated) |
| Last Clean Phase | None |

Phase 00's scoped changes validated successfully and materially strengthened
the MUD integration boundary. The project is still at risk because two
auth/session findings remain High and privacy lifecycle requirements are not
implemented. The dependency audit below is dated evidence, not a current
dependency-security guarantee.

---

## Open Findings

### High

#### SEC-RT-1: Refresh tokens are stored as directly replayable JWTs

- **Introduced/confirmed**: [P00-S04], raised from the Session 01 survey.
- **Affected package**: `backend`.
- **Original evidence**: `routes/auth.ts` inserted the refresh JWT verbatim into
  `web_sessions.refresh_token`; `sessionService.ts` compares the submitted raw
  token. DurisWeb and the MUD share this database.
- **Impact**: Read access through either codebase, a MUD database backup, or SQL
  injection yields active bearer tokens for every logged-in user. Replays are
  indistinguishable from legitimate refresh requests and tokens last up to
  seven days.
- **Source remediation**: `sessionService.ts` stores/compares exact-byte SHA-256
  digests in `BINARY(32)`. Raw JWTs remain only in HTTP-only cookies and transient
  verification; lookup/insert failures discard driver errors containing bindings.
  Backup exports retain session DDL and omit all session rows. The coordinated
  migration discards every old session rather than backfilling credentials.
- **Status**: Open pending approved logout/deployment and live verification;
  [issue #7](https://github.com/LuminariMUD/DurisWeb/issues/7). Isolated source
  proof does not certify deployment or sanitize older retained backups.

#### SEC-TZ-1: Session expiry can fail open when host timezones differ

- **Introduced/confirmed**: [P00-S03].
- **Affected package**: `backend`.
- **Original evidence**: The application wrote `expires_at` from a JavaScript `Date`,
  while `sessionService.ts` compares it with database `NOW()`. With the app at
  UTC+3 and MySQL at UTC, a token already expired by 60 seconds continued to
  authenticate and would have remained valid for nearly three more hours.
- **Impact**: Authenticated sessions silently outlive their intended expiry.
- **Source remediation**: `expires_at_epoch BIGINT UNSIGNED` is written as
  database `UNIX_TIMESTAMP()+604800` and compared exclusively with that same
  clock. No application Date serialization, timezone fallback, or old expiry
  conversion participates. Both engines pass HTTP access/refresh rejection at
  expiry and 60 seconds after expiry across three app zones, three database
  offsets and eight DST-adjacent epochs. Pool safeguards remain intact; existing
  sampling warns on observed application/database clock skew over 60 seconds.
- **Status**: Open pending approved cutover/deployment and live verification;
  [issue #8](https://github.com/LuminariMUD/DurisWeb/issues/8). Timezone independence
  does not guarantee synchronized clocks.

### Medium / Low

#### SEC-3-2: Toggle and audit writes are not atomic

- **Introduced/confirmed**: [P00-S03].
- **Severity**: Low, accepted for now.
- **Affected package**: `backend`.
- **Original evidence**: `hookSettingsService.ts` committed the safety toggle before its
  audit insert. If the audit write fails, the changed toggle remains and the
  error is logged, but no audit record exists.
- **Impact**: A control change can lose its durable attribution during a
  database partial failure.
- **Source remediation**: a minimal actor/old/new/UTC receipt commits with the
  toggle in `web_settings`. A separate bounded worker appends and acknowledges
  one uniquely identified audit row, preserving pending attribution across
  write outages, restarts and ambiguous acknowledgement. Generic settings
  cannot read/edit journal keys; worker errors contain safe categories only.
- **Status**: Open pending deployment verification;
  [issue #9](https://github.com/LuminariMUD/DurisWeb/issues/9). Do not silently
  make the incident safety control contingent on audit availability.

---

## MUD Integration Security Baseline

### Trust Channels

| # | Channel | Direction | Authentication / Boundary | Phase 00 Result |
|---|---------|-----------|---------------------------|-----------------|
| 1 | WebSocket bridge, port 4050 | MUD -> web | HMAC-SHA256 challenge with current/previous secret | Authenticated state/set protocol; remote plaintext refused; TLS verification explicit |
| 2 | Scoped Redis pub/sub | Both | Redis credentials plus namespace and season epoch | Legacy flat channels rejected by contract |
| 3 | Flatfiles and connection log | MUD -> web | Trusted filesystem under `MUD_DIR` | Canonical containment, bounded strict parsing, per-hook health; still unauthenticated by construction |
| 4 | Process control | Web -> MUD host | Admin permissions and constrained command construction | Existing permission/rate-limit contracts retained |
| 5 | Interactive terminal | Web -> host | Admin permission plus live per-session authorization | Always-on recovery path; bubblewrap deliberately shares network and PID namespace |

### Hook-Control Guarantees

- **[P00-S01/S07] Registry and ownership**: 14 immutable rows; 13 website
  toggles, eight MUD-backed hooks, five intentional MUD N/A hooks, and one
  always-on terminal recovery path. Generated behavior tests are cross-checked
  against the exact MUD tuple.
- **[P00-S02/S07] Source suppression**: MUD emitters return before payload
  construction; deletion authenticates and gates before payload parsing;
  disabled donations are dropped before application.
- **[P00-S03/S06] Server-authoritative UI**: Permission checks, optimistic-
  update refusal, mismatch/unknown display, audit context, and safe reconcile
  ordering are covered by backend and frontend tests.
- **[P00-S04/S07] Connection-scoped foreign state**: State is accepted only
  from an authenticated bridge, schema-validated, replaced wholesale, cleared
  on disconnect, and recovered only from a fresh report. Missing state is
  unknown/inactive.
- **[P00-S04] Transport and rotation**: `ws:` is allowed only on loopback;
  non-loopback requires `wss:`; URL credentials/query/fragment are rejected;
  certificate verification is explicit; the previous secret is tried exactly
  once after current-key rejection.
- **[P00-S05] Flatfile boundary**: Reads are realpath-contained and reject
  traversal, escaping symlinks, non-regular files, oversized or growing files,
  NUL, invalid UTF-8, truncated records, and unbounded search work. Failures are
  isolated per hook and exposed without raw paths or payloads.
- **[P00-S07] Cross-repository validation**: 13 website gates, eight MUD gates,
  five N/A owners, reconnect recovery, source guards, configuration, properties,
  state frames, and operator docs are pinned by executable contracts.

### Delivery and Operational Acceptance

- Website and MUD releases require independently verified source and runtime
  identities. A historical branch handoff does not identify the deployed binary.
- Repository tests cannot prove production transport. Before any cross-host
  bridge rollout, an operator must demonstrate a
  certificate-valid WSS connection without weakening the plaintext or
  certificate policies.
- Public browser WSS and the privileged MUD bridge are separate channels.
  Select transport according to the configured topology; plaintext privileged
  connections are restricted to loopback. Health probes and release acceptance
  are described in the [deployment guide](deployment.md).
- Tunnel credential separation and canonical-host CSRF routing remain tracked
  in [issue #6](https://github.com/LuminariMUD/DurisWeb/issues/6) and
  [issue #4](https://github.com/LuminariMUD/DurisWeb/issues/4), respectively.

---

## GDPR Compliance Status

### Overall: NON-COMPLIANT BASELINE

The repository processes personal data for accounts, community features,
analytics, donations, operations, and automated suspicion scoring. At baseline, no privacy
notice, pre-login analytics consent, general erasure workflow, or retention
enforcement was identified. This is an engineering inventory, not legal advice;
deployment jurisdiction and controller/processor roles still require owner
review.

The prepared #10 source closes unapproved optional website collection. The
browser removes its retired `analytics_session_id` when storage permits, and
requires a current server choice plus a confirmed cookie before creating a
memory-only visit nonce. Draft privacy information and controls are public before
login, with desktop/mobile access. Cross-tab ordering, expiry, failed writes and
account transitions stop optional work. Historical records and protected
dashboard reads remain. Prepared server-owned choice
receipts now enforce versions/revisions, digest credentials, expiry and atomic
collection/withdrawal ordering. The draft policy disables issuance and collection;
an approved synthetic policy is used only in isolated tests. Final notice/provider/
period approval, retention readiness and live verification remain necessary
before optional collection can return. Deployment is unverified.

### Personal Data Inventory

The [table-by-table lifecycle inventory](privacy-data-lifecycle.md) accounts for
all 77 website baseline tables, current credential/audit overlays, indirect
subject links, separately owned MUD records and non-SQL/provider copies. It is
an engineering input; the proposed periods and public wording are unapproved.

| Data | Package / Location | Purpose | Retention / Deletion |
|------|--------------------|---------|----------------------|
| Account and character names | `backend`; shared MUD `accounts` and related tables | Identity, login, authorization, game linkage | No general erasure path identified |
| Email addresses | `backend`; `accounts.email`, `user_profiles.email` | Recovery and account linkage | No documented retention |
| Refresh credentials | `backend`; `web_sessions.refresh_token_digest` in the prepared source | Session persistence | 7-day database lifetime; digest source/backup omission verified, approved rollout remains SEC-RT-1 |
| IP addresses and reverse DNS | `backend`; page views, login history, action/wipe/builder/deploy/backup records | Security, analytics, geolocation, audit | No purge schedule identified |
| User agent, device, browser, OS, screen size | `frontend` collection, `backend` page-view storage | Analytics | Fingerprint-adjacent; no purge schedule |
| Geolocation, referrer, and UTM data | `backend`; `page_views` | Analytics and attribution | Derived/collected before login; no purge schedule |
| Visitor session identifiers | `frontend`/`backend`; visitor sessions and page views | Link pseudonymous browsing events | No purge schedule |
| Profile text, avatar, website, location | `frontend`/`backend`; `user_profiles` | Public profiles | User-editable, but no general erasure workflow |
| Forum content, reactions, votes, mentions | `frontend`/`backend`; `forum_*` | Community features | Poll vote history retains attributable records |
| Donor name, email, amount, message | `backend`; `donations` | Donation fulfillment and account linkage | Financial/identity data; no documented retention |
| Bans, moderation, and admin actions | `backend`; moderation/audit tables | Safety and accountability | No documented retention |
| Hook-control journal | `backend`; reserved `web_settings` receipts and identified audit rows | Recoverable staff accountability; actor/hook/old/new/UTC UUID only, no IP | Pending/invalid events retained; delivered policy/subject holds remain P6; source deployment unverified |
| Suspicion score and evidence | `backend`; `suspicious_accounts.evidence` | Multi-account detection | Automated profiling; no appeal/erasure path found |
| Push subscription endpoints | `frontend`/`backend`; push service storage | Browser notifications | Revocation exists at browser level; policy not documented |
| User-uploaded images | `frontend`/`backend`; Cloudflare R2 references | Profiles/community content | Feature deletion paths need end-to-end verification |

### Third-Party Transfers

| Recipient | Data sent | Package / Mechanism | Open concern |
|-----------|-----------|---------------------|--------------|
| Google Gemini (`gemini-2.5-flash`) | Account name, character name, IP, login timestamps | `backend`; `geminiSuspicionAnalyzer.ts` | Automated profiling and transfer are not disclosed in-repo |
| ip-api.com | Visitor IP | `backend`; `utils/geoip.ts` | Transfer/HTTP transport policy remains open; lookup/cache diagnostics exclude identifying data in source |
| Ko-fi | Donor name, email, amount, message | `backend`; webhook and donation services | Processing/retention documentation absent |
| Discord | Notification content | `backend`; `discordService.ts` | Payload minimization not documented |
| Cloudflare R2 | Uploaded images | `backend`; `r2Service.ts` | Retention/deletion agreement not documented |
| Browser push providers | Endpoint and push payload | `frontend`/`backend`; push service | Provider role and retention not documented |

### Compliance Checklist

| Requirement | Status | Evidence / Next action |
|-------------|--------|------------------------|
| Purpose and privacy notice | PARTIAL | Source has a public draft, contact, full table inventory and tested choices; owner/provider/period approval and live verification remain open |
| Consent before optional analytics storage | PARTIAL | Prepared source disables client collection and refuses both tracking mounts; approved notice/choice controls and live verification remain #10 |
| Data minimization | PARTIAL | Private presence defaults off unless explicitly enabled; new optional page-view collection is removed in prepared source, while historical IP/device/geo/screen data and its retention remain open |
| Subject access/export | GAP | No complete user data export path identified |
| Deletion/erasure | GAP | No account-wide deletion/anonymization entry point identified |
| Retention enforcement | GAP | Read-only proposed-age preview and restricted hold intent records are prepared; enforced holds, approved mutation, scheduling and restore handling remain unimplemented; see [preview](runbooks/retention-preview.md) and [holds](runbooks/data-holds.md) |
| PII excluded from logs | PARTIAL | Connection-sync IP logging was removed previously; #13 now sanitizes all GeoIP and reachable Redis diagnostics with sentinel-tested categories/references. Other log paths still need inventory; production deployment is unverified. |
| Third-party transfers documented | GAP | Transfers above are inventoried only in this internal file |
| Automated profiling disclosed/contestable | GAP | Gemini suspicion analysis has no subject notice or appeal path identified |
| Credentials protected at rest | PARTIAL | SHA-256 session source and credential-free backup exports pass isolated tests; rollout and handling of older archives remain open under SEC-RT-1 |

Implementation work is tracked separately:
[notice and optional analytics consent (#10)](https://github.com/LuminariMUD/DurisWeb/issues/10),
[retention enforcement (#11)](https://github.com/LuminariMUD/DurisWeb/issues/11),
[account export and erasure (#12)](https://github.com/LuminariMUD/DurisWeb/issues/12),
and [GeoIP log minimization (#13)](https://github.com/LuminariMUD/DurisWeb/issues/13).
The [Gemini rollout (#18)](https://github.com/LuminariMUD/DurisWeb/issues/18)
is proposed and depends on approved privacy and human-review controls; it is
not evidence that provider processing is enabled.

---

## Dependency Security

Audit date: 2026-09-09. Counts are raw `pnpm audit` advisory results.

| Package | Scope | Critical | High | Moderate | Low | Total |
|---------|-------|----------|------|----------|-----|-------|
| backend | All dependencies | 0 | 0 | 0 | 0 | 0 |
| backend | Production only | 0 | 0 | 0 | 0 | 0 |
| frontend | All dependencies | 0 | 0 | 0 | 0 | 0 |
| frontend | Production only | 0 | 0 | 0 | 0 | 0 |

SEC-DEP-1 was resolved by refreshing both dependency graphs to patched releases,
upgrading Vitest to its fixed major line, explicitly selecting the patched
Workbox build peer, and removing an unused backend Tiptap dependency. No audit
finding was suppressed or ignored.

---

## Resolved Findings and Accepted Controls

| Phase / Session | Finding or Risk | Resolution |
|-----------------|-----------------|------------|
| P00-S02 | Low: admin-delete authorization ordering | Authentication and hook state are checked before request parsing or deletion. |
| P00-S02 | Medium: donation concurrency/partial application | Disabled events are discarded before application; concurrency path is contract-tested. |
| P00-S03 | SEC-3-1: unreadable local settings default enabled | Accepted directional policy: avoid severing all integrations while independent MUD gates remain authoritative. |
| P00-S04 | Loopback trust | Accepted and documented; plaintext is loopback-only and production cross-host use requires validated WSS. |
| P00-S04 | Secret rotation gap | Current key plus exactly one previous-key retry is implemented and tested end to end. |
| P00-S05 | Flatfile path/content attacks | Centralized boundary rejects escape, unsafe file type, oversized/growing, malformed, and unbounded input. |
| P00-S05 | Connection log PII emission | IP values are no longer included in connection-sync application logs. |
| 2026-10-16 / #13 | GeoIP/cache diagnostic disclosure | Fixed GeoIP failure categories and locally generated operation IDs replace IPs, provider text and raw errors. Redis command/error-event/lifecycle diagnostics are also sanitized because errors can carry IP-bearing keys. Mocked success/failure/cache/local/batch tests cover all reachable logger arguments. Cache TTL and VPN/proxy fallback are preserved. Provider policy remains #10; live deployment is unverified. |
| P00-S07 | 1 Medium and 2 Low review findings | Gate-order assertion and handoff/commit evidence were repaired before validation. |
| 2026-09-09 dependency remediation | SEC-DEP-1 | Backend and frontend full and production-only `pnpm audit` checks report zero advisories. |

---

## Phase History

| Phase | Sessions | Security Result | GDPR Result | Opened | Closed |
|-------|----------|-----------------|-------------|--------|--------|
| P00 | 7/7 | Session validation PASS; cumulative posture AT RISK | NON-COMPLIANT baseline | SEC-DEP-1, SEC-RT-1, SEC-TZ-1, SEC-3-2 | 8 session findings/controls resolved or accepted |

---

## Next-Phase Priorities

1. **[P00-security] Decide the SEC-RT-1 rollout**, hash refresh tokens, and
   communicate the one-time global logout.
2. **[P00-security] Fix SEC-TZ-1** with explicit UTC semantics and a
   timezone-offset regression test.
3. **[P00-privacy] Assign a privacy owner** for notice/consent, transfer and
   profiling disclosure, retention schedules, and user export/erasure.
4. **[P00-infra] Qualify each production release** against the configured
   topology and resolve the tracked ingress/credential gaps without weakening
   transport policy.
5. **[P00-data] Provide a versioned migration baseline** through
   [issue #14](https://github.com/LuminariMUD/DurisWeb/issues/14) before claiming
   clean-room deployability. Existing ledgers must not be rewritten to conceal
   an incomplete baseline.

---

*Maintained as a durable project record.*

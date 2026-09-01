# Session Specification

**Session ID**: `phase00-session05-flatfile-ingestion-hardening`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Not Started
**Created**: 2026-09-01
**Base Commit**: e023886a0cc0ceb4f168218889f3491f8e3dc5e2
**Work Window**: One coherent trust-boundary change across the backend filesystem readers, their in-memory health state, and the hook-status API, verified together because parser rejection, backoff, and operator-visible UNAVAILABLE state share one failure boundary.
**Package**: backend
**Package Stack**: TypeScript

---

## 1. Session Overview

This session makes filesystem-sourced MUD data a validated, observable input
instead of an assumed local dependency. It hardens the connection-log parser,
adds bounded and path-contained reads for the flag and zone/builder sources,
tracks malformed input, and makes an unreachable MUD filesystem report
UNAVAILABLE with an actionable reason and retry backoff.

It is next because Sessions 03 and 04 already provide website toggle
enforcement, effective-state resolution, and real MUD bridge state. Session 06
needs a truthful status API before it can render the operator console, and
Session 07 needs deterministic failure behavior to lock into contract tests.

The current repository no longer starts the legacy connection-log tail because
authenticated bridge events replaced that ingestion path. This work hardens the
legacy parser and preserves its hook contract without reactivating duplicate
database writes. The current guild parser is likewise database-backed; its
toggle remains enforced, but MUD_DIR loss must not falsely mark it unavailable.

---

## 2. Objectives

1. Reject malformed, truncated, unbounded, or path-escaping filesystem input
   before it can be partially ingested.
2. Validate connection-log timestamps, alphabetic character names, and IP
   addresses with fully anchored patterns, while counting malformed candidates.
3. Track filesystem availability and retry backoff independently per affected
   hook, without blocking server startup or unrelated integrations.
4. Expose UNAVAILABLE reason, retry time, and dropped-input count through the
   existing hook status API without logging IP addresses.
5. Enforce the website toggle at each flatfile parsing entry point using only
   cached hook state.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session03-website-toggle-store` - cached toggles, event-path gate,
  UNAVAILABLE resolution, and hook status API
- [x] `phase00-session04-bridge-state-and-transport-security` - live MUD state
  provider and transport lifecycle behavior

### Required Tools Or Knowledge

- Node.js `net.isIP`, `fs/promises`, path containment, and Jest fake timers
- DurisMUD connection-log and area/source formats from
  `/home/aiwithapex/projects/duris/`

### Environment Requirements

- `MUD_DIR` points to `/home/aiwithapex/projects/duris/` for positive-path
  verification; tests use isolated temporary directories for failure cases
- Backend dependencies are installed and the existing Jest/type-check commands
  are available

---

## 4. Scope

### In Scope (MVP)

- Operator sees each real filesystem-backed hook as UNAVAILABLE with a reason,
  dropped-input count, and retry time when its required MUD path cannot be read.
- Backend continues starting when MUD_DIR is absent or unreachable, so bridge,
  Redis, database, and other hooks remain available.
- Connection-log candidates match an entire line and are rejected unless their
  timestamp is valid, character name is ASCII alphabetic, and address passes
  `net.isIP`.
- Malformed connection candidates are dropped and counted; unrelated comm-log
  lines are ignored without inflating the counter.
- Flag parsing completes as an all-or-nothing validated result; malformed or
  truncated source definitions cannot drive a partial database sync.
- Zone/builder reads are path-contained, size-bounded, NUL-free, and reject
  malformed or truncated records rather than returning a partial parse.
- Website toggles gate connection, flag, guild, and zone/builder parsing entry
  points without a database or disk lookup on the gate itself.
- Filesystem failures use per-hook exponential backoff and do not schedule a
  retry storm or alter another hook's state.
- Connection-sync logs contain no IP address.

### Outside This Work Window

- Replacing the flatfile transport - deferred by PRD Resolved Decision 2.
- Reactivating the legacy connection-log tail - authenticated bridge events are
  the current ingestion path and reactivation would duplicate writes.
- Rewriting the database-backed guild service as a flatfile reader - current
  source authority is the shared MUD database.
- Retention, erasure, and Gemini profiling remediation - separately tracked
  GDPR work.
- Operator console rendering - Session 06 consumes the API produced here.

---

## 5. Technical Approach

### Architecture

Add a small in-memory flatfile health module keyed by registered hook id. It
owns availability, sanitized reasons, consecutive failure count, next retry
time, and dropped-input totals. Reads and probes update only their own hook.
The module exposes a synchronous state view so hook resolution and the status
API do not perform I/O.

Add a filesystem access boundary that resolves paths under the configured
MUD_DIR, prevents path escape, enforces file-size and NUL-byte limits, maps
filesystem errors to a typed unavailable error, and consults the hook's retry
window before touching disk. Existing parsers consume this boundary rather
than reading arbitrary paths directly.

The hook status assembler overlays `unavailable` for affected flatfile hooks
before normal MUD-state resolution. Successful probes return website-only
hooks to `not_gated`. Server startup performs a non-fatal initial probe and
starts a single unref'ed health timer; shutdown releases it.

### Design Patterns

- Typed boundary parser: validate untrusted bytes and lines before producing
  domain objects.
- Per-hook circuit state: isolate availability and exponential backoff so one
  missing directory cannot degrade unrelated hooks.
- All-or-nothing parse: validate complete flag and zone records before exposing
  results to persistence callers.
- Dependency injection: clock and filesystem roots are injectable in tests so
  retry and recovery behavior are deterministic.

---

## 6. Deliverables

### Files To Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/flatfileHookState.ts` | In-memory per-hook availability, counters, sanitized reasons, and backoff | ~220 |
| `backend/src/services/flatfileAccess.ts` | Contained, bounded filesystem reads and probes with typed errors | ~240 |
| `backend/src/hooks/__tests__/flatfileHookState.test.ts` | State isolation, backoff, recovery, and API metadata tests | ~260 |
| `backend/src/services/__tests__/flatfileAccess.test.ts` | Path, size, NUL, missing-root, and recovery tests | ~260 |
| `backend/src/services/__tests__/mudConnectionLogSync.test.ts` | Strict connection-line parser and privacy regression tests | ~260 |
| `backend/src/services/__tests__/flatfileParsers.test.ts` | Flag, guild, and zone/builder gating and truncation tests | ~300 |

### Files To Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/hookSettingsService.ts` | Overlay resource availability and expose health metadata | ~45 |
| `backend/src/hooks/index.ts` | Export the flatfile health surface | ~15 |
| `backend/src/routes/hooks.ts` | Serialize unavailable reason, dropped count, and retry time | ~20 |
| `backend/src/hooks/registry.ts` | Reconcile the current DB-backed guild and legacy connection-log descriptions | ~15 |
| `backend/src/services/mudConnectionLogSync.ts` | Strict parser, gate, health/backoff, cleanup, and PII-safe logging | ~190 |
| `backend/src/services/mudFlagParser.ts` | Gated, bounded reads and all-or-nothing result validation | ~90 |
| `backend/src/services/mudGuildParser.ts` | Enforce the compatibility entry-point toggle without filesystem coupling | ~35 |
| `backend/src/services/guildSyncService.ts` | Enforce the guild hook toggle on background sync | ~20 |
| `backend/src/services/zoneBuilderParser.ts` | Lazy MUD root, bounded reads, gate, and incomplete-record rejection | ~180 |
| `backend/src/index.ts` | Replace fatal MUD_DIR startup validation with non-fatal health lifecycle | ~45 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Connection patterns are end-anchored and malformed candidates never
  produce a database event.
- [ ] Only ASCII alphabetic character names and `net.isIP` addresses are
  accepted; invalid timestamps are rejected rather than replaced with now.
- [ ] Malformed candidates are counted while unrelated log lines are ignored.
- [ ] Unreachable MUD_DIR reports UNAVAILABLE with a sanitized reason and
  bounded exponential retry time for each affected hook.
- [ ] Recovery after the retry window returns a hook to its normal website-only
  state without restarting the backend.
- [ ] An unavailable connection-log hook does not change flag, zone, guild,
  bridge, pubsub, process, or terminal state.
- [ ] Flag and zone/builder parsers reject malformed or truncated source as a
  whole instead of returning partial data.
- [ ] Disabled flatfile parsing entry points perform no source read or parse.
- [ ] Database-backed guild parsing remains usable when MUD_DIR is unavailable,
  unless its own website toggle is disabled.
- [ ] No connection-sync log message contains an IP address.
- [ ] Backend startup does not exit because MUD_DIR is absent or unreachable.

### Testing Requirements

- [ ] Unit tests cover valid IPv4/IPv6 lines and hostile, trailing, truncated,
  invalid-name, invalid-IP, and invalid-timestamp candidates.
- [ ] Unit tests cover path escape, oversized input, NUL input, backoff, state
  isolation, retry recovery, and timer cleanup.
- [ ] Parser integration tests cover website-disabled, filesystem-unavailable,
  malformed content, and successful recovery scenarios.
- [ ] Existing hook, contract, and backend tests are run with differences from
  the Session 04 baseline explained.
- [ ] Type-check passes.

### Non-Functional Requirements

- [ ] Hook gate and status reads remain synchronous in-memory operations.
- [ ] Retry timers are bounded, unref'ed, and cleaned up on shutdown.
- [ ] Error reasons expose paths or hook ids but no file content, IP address,
  secret, token, or credential.
- [ ] No new runtime dependency is added.

### Quality Gates

- [ ] All files ASCII-encoded.
- [ ] Unix LF line endings.
- [ ] Code follows project conventions.

---

## 8. Implementation Notes

### Working Assumptions

- Actual filesystem-backed hook health applies to `connection_log`,
  `flag_parsing`, and `zone_builder_parsing`: their owners read MUD_DIR today.
  `guild_parsing` is a database-backed compatibility facade, so claiming its
  filesystem is unavailable would be false and would violate the requirement
  that unrelated hooks remain usable.
- The legacy connection parser remains supported but dormant: `index.ts`
  explicitly records that bridge events replaced it, and starting both paths
  would duplicate `account_login_history` writes and broadcasts.
- File-format validation is defense in depth inside the same trust domain, not
  an authentication boundary, matching PRD Resolved Decision 5.

### Conflict Resolutions

- The Session 05 stub calls `mudGuildParser.ts` a flatfile parser, while that
  file now re-exports database queries from `guildService.ts`. Current code and
  the shared-database architecture win: enforce its toggle, correct the
  registry description, and do not couple it to MUD_DIR availability.
- The PRD describes connection-log ingestion as active, while current startup
  says it was replaced by authenticated WebSocket events. Preserve and harden
  the parser contract but do not silently reactivate a superseded data path.
- Current startup exits when MUD_DIR is unreadable, contradicting the PRD's
  split-host requirement. The PRD wins: record per-hook UNAVAILABLE and allow
  unrelated services to start.

### Key Considerations

- `mudConnectionLogSync.ts` currently accepts trailing text, arbitrary names,
  arbitrary addresses, and invalid timestamps that become the current time.
- `zoneBuilderParser.ts` captures MUD_DIR at module load and contains a
  hardcoded fallback path; both defeat reliable split-host behavior and tests.
- Backoff state must distinguish a missing required root from an optional zone
  file that legitimately does not exist.
- Existing full-suite failures in `guildService`, `auctionService`, and
  `userManagementService` depend on ambient game data; compare against the
  33-test Session 04 baseline rather than attributing them to this session.

### Potential Challenges

- The zone parser handles several record grammars: validate at shared read and
  record boundaries without changing valid MUD semantics.
- ESM import-time environment capture makes temporary-directory tests brittle:
  resolve MUD_DIR lazily or inject it instead of resetting modules repeatedly.
- Tail emits asynchronous errors: use one scheduled retry per hook and cancel
  it during shutdown or explicit stop.

### Relevant Considerations

- [P00] **MUD flatfile ingestion is unauthenticated**: parser validation is the
  only defense against corrupted filesystem data.
- [P00] **Five integration channels have distinct trust boundaries**: do not
  apply filesystem failure state to bridge, Redis, process, or terminal hooks.
- [P00] **Three suites depend on ambient game data**: preserve the known
  baseline and add isolated tests with owned fixtures.
- [P00] **No PII in logs**: remove the connection IP and do not put rejected
  source content in error messages.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session:
- Partial ingestion after a parser accepts a valid prefix followed by corrupt
  or hostile trailing content.
- Retry timers or tail watchers surviving shutdown and causing duplicate work.
- A missing MUD_DIR globally disabling or preventing startup of integrations
  that do not use the filesystem.

---

## 9. Testing Strategy

### Unit Tests

- Table-drive every connection-line format and rejection reason.
- Use temporary roots to test contained reads, symlink/path escape, size bounds,
  NUL bytes, missing paths, permissions where supported, and recovery.
- Inject time to prove per-hook exponential backoff, maximum delay, state
  isolation, and retry reset after success.
- Test flag-result and zone-record validation against valid excerpts from the
  local MUD source plus truncated and hostile variants.

### Integration Tests

- Assemble hook status with the bridge provider plus flatfile health and verify
  only the failing hook resolves UNAVAILABLE.
- Exercise parser entry points with the website toggle off and assert no
  filesystem operation occurs.
- Verify guild database compatibility behavior does not depend on MUD_DIR.

### Runtime Verification

- Probe the real local MUD paths and parse representative comm/source/area data.
- Point a test process at an unreachable temporary MUD_DIR and confirm startup
  planning continues, statuses carry reasons, retries back off, and other hook
  statuses remain unchanged.
- Restore the path and confirm health clears after the retry boundary.

### Edge Cases

- IPv4, compressed IPv6, whitespace variants allowed by the exact MUD format,
  line suffix injection, alphabetic Unicode lookalikes, empty fields, and
  impossible timestamps.
- Empty file, NUL byte, oversized file, dangling symlink, path escape, optional
  absent zone sidecar, and required root disappearance during a read.
- Repeated failures before retry time, simultaneous failures in two hooks, and
  stop/restart of monitoring.

---

## 10. Dependencies

### Other Sessions

- Depends on: `phase00-session03-website-toggle-store`,
  `phase00-session04-bridge-state-and-transport-security`
- Depended by: `phase00-session06-hook-control-console`,
  `phase00-session07-contract-tests-and-docs`

---

## Next Steps

Run the `implement` workflow step to begin implementation.

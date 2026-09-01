# Session 05: Flatfile ingestion hardening

**Session ID**: `phase00-session05-flatfile-ingestion-hardening`
**Package**: backend
**Status**: Not Started
**Estimated Tasks**: ~15
**Estimated Duration**: 2-3 hours

---

## Objective

Treat MUD-written files as untrusted input and make the channel degrade visibly
rather than silently when the filesystem is unreachable.

---

## Scope

### In Scope (MVP)

- Anchored patterns in `mudConnectionLogSync.ts`; reject unanchored matches
- Validate character names as alphabetic-only, matching the MUD's own
  `_parse_name` rule
- Validate IPs parse before persisting
- Drop malformed lines, count them, expose the count
- Apply the same treatment to the flag, guild, and zone/builder parsers
- UNAVAILABLE state when `MUD_DIR` is unreachable: clear reason, backoff, no
  retry storm, no impact on other hooks
- Remove the IP address from `mudConnectionLogSync.ts:131` logging

### Out of Scope

- Authenticating the channel - PRD Resolved Decision 5 says same trust domain
- A replacement transport for split-host - deferred to a future PRD
- Retention or erasure work - tracked separately

---

## Prerequisites

- [ ] Session 03 complete - toggle enforcement available

---

## Deliverables

1. Hardened parsers with validation and dropped-line counters
2. UNAVAILABLE detection and backoff for unreachable `MUD_DIR`
3. PII removed from connection-sync logging
4. Tests covering malformed, truncated, and hostile-looking lines

---

## Success Criteria

- [ ] Malformed lines are dropped and counted, never partially ingested
- [ ] Character names failing the alphabetic rule are rejected
- [ ] Unparseable IPs are rejected
- [ ] Unreachable `MUD_DIR` reports UNAVAILABLE with a reason and backs off
- [ ] No other hook is affected while flatfile hooks are unavailable
- [ ] No IP addresses remain in connection-sync logs

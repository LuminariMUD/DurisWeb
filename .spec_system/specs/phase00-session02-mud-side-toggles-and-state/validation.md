# Validation Report

**Session ID**: `phase00-session02-mud-side-toggles-and-state`
**Package**: external (`/home/aiwithapex/projects/duris/`)
**Validated**: 2026-09-01
**Result**: PASS

---

## Validation Summary

| Check | Status | Notes |
|-------|--------|-------|
| Tasks Complete | PASS | 20/20 tasks |
| Files Exist | PASS | 9 MUD files modified, all verified |
| ASCII Encoding | PASS | All additions ASCII/LF |
| Tests Passing | PASS | Full build clean under -Werror; durisweb 25/25 |
| Quality Gates | PASS | Zero warnings with the project's strict flag set |
| Conventions | PASS | Matches surrounding C style |
| Security & GDPR | PASS | Both PASS; 2 issues designed out |
| Behavioral Quality | PASS | 0 violations; 3 fixes applied, 1 real bug caught |

**Overall**: PASS

---

## 1. Task Completion

### Status: PASS

| Category | Required | Completed | Status |
|----------|----------|-----------|--------|
| Setup | 3 | 3 | PASS |
| Foundation | 4 | 4 | PASS |
| Implementation | 9 | 9 | PASS |
| Testing | 4 | 4 | PASS |

### Incomplete Tasks

None.

---

## 2. Deliverables Verification

### Status: PASS

All work is in the MUD repository on branch `feat/durisweb-hook-toggles`,
branched from a clean `master`. Nothing pushed.

| File | Found | Status |
|------|-------|--------|
| `lib/duris.properties` | Yes | PASS - 8 keys at 1.000 |
| `src/core/prototypes.h` | Yes | PASS - 2 declarations |
| `src/world/properties.c` | Yes | PASS - helper + push trigger |
| `src/net/ws_handlers.h` | Yes | PASS - 2 declarations |
| `src/net/ws_handlers.c` | Yes | PASS - 8 gates, serializer, command, push |
| `src/redis/redis_donation_runtime.c` | Yes | PASS - donation gate |
| `docs/reference/api/durisweb.md` | Yes | PASS |
| `docs/operations/CONFIGURATION.md` | Yes | PASS |
| `docs/operations/RUNBOOK.md` | Yes | PASS |
| `.spec_system/PRD/MUD_HANDOFF.md` (durisweb) | Yes | PASS - 6 changes DONE |

The declared package is the external MUD repo, and every deliverable is inside
it, except the hand-off reconciliation which by design lives in durisweb.

### Missing Deliverables

None.

---

## 3. ASCII Encoding Check

### Status: PASS

Every line added by this session is ASCII with LF endings, verified across all
nine modified MUD files.

One pre-existing non-ASCII character (an em dash) sits at
`docs/operations/RUNBOOK.md:371`, in a section this session did not touch. It
was confirmed present at HEAD via `git stash` and deliberately left alone: the
ASCII-only rule is a `.spec_system/` convention, and rewriting unrelated lines
in another repository is out of scope.

---

## 4. Test Results

### Status: PASS

| Metric | Value |
|--------|-------|
| MUD build | Clean - `make` exit 0 |
| Errors | 0 |
| Warnings | 0 (under `-Werror`) |
| Binary | `bin/server/dms_new` linked |
| durisweb registry tests | 25/25 passing |

The build enforces `-Werror` with `-Wall -Wextra -Wpedantic -Wnull-dereference
-Wshadow=compatible-local -Wcast-align=strict -Wstringop-overflow=4
-Warray-bounds=2 -Wuse-after-free=3 -Wformat=2`, so zero warnings is a
meaningful result. Object timestamps confirm `net/ws_handlers.o` and
`world/properties.o` were rebuilt from the edited sources.

### Failed Tests

None.

### Build Failure and Correction

The first build **failed** and was briefly misreported as passing here, because
the command piped `make` through `tail`, so the shell returned `tail`'s exit
status. The real error: `websocket_close(d)` takes three arguments
`(d, code, reason)`. Corrected to
`websocket_close(d, WS_CLOSE_POLICY_VIOLATION, "Not authorized")`, matching the
other call sites, then rebuilt capturing `make`'s own exit code.

### Runtime Verification Not Performed

The MUD was not started and no live socket test was run. What is verified is
that the code compiles clean and that every guard is positioned correctly by
source inspection. End-to-end proof that a disabled hook puts nothing on the
wire requires the website side and is Session 07's job. Stated plainly rather
than implied.

---

## 5. Success Criteria

### Functional Requirements

- [x] Eight `durisweb.hook.*` keys present, all `1.000` (not nine - see
      Decision 1; `connection_log` is website-side only)
- [x] Unknown hook id reads as enabled; `0.000` reads as disabled
- [x] Every MUD-gated hook has a guard at its source (8 gates)
- [x] `durisweb_hook_state` returns the documented frame with `schema_version`
- [x] Unauthenticated peers rejected and closed with a policy-violation code
- [x] A toggle change pushes state to authenticated peers
- [x] Landing this session changes no observable behaviour at defaults

### Testing Requirements

- [x] Code compiles (full clean build)
- [x] Guard placement verified against the registry `mudSite` values

### Non-Functional Requirements

- [x] Guard is in-memory only - `get_property` is a bsearch over a sorted array
- [x] No secrets or personal data in the two added log statements

### Quality Gates

- [x] All additions ASCII-encoded
- [x] Unix LF line endings
- [x] Matches surrounding C style (tabs, Allman braces, existing naming)

---

## 6. Conventions Compliance

### Status: PASS

| Category | Status | Notes |
|----------|--------|-------|
| Naming | PASS | `durisweb_hook_enabled`, `ws_cmd_durisweb_hook_state` follow the file's existing `ws_cmd_*` / `ws_broadcast_*` patterns |
| File Structure | PASS | No new files; declarations in `prototypes.h` and `ws_handlers.h` where the neighbours live |
| Error Handling | PASS | Every allocation failure path frees and returns; the request path returns an explicit error rather than silence |
| Comments | PASS | Explain why - why the gate precedes allocation, why the donation gate is on the game thread, why the push tests matched keys not the glob |
| Style | PASS | Tabs, Allman braces, `/*param*/` for unused parameters as used in `do_properties` |

### Convention Violations

None.

---

## 7. Security & GDPR Compliance

### Status: PASS

**Full report**: See `security-compliance.md` in this session directory.

| Area | Status | Findings |
|------|--------|----------|
| Security | PASS | 0 open; 2 designed out during implementation |
| GDPR | PASS | No new data handling; adds controls that reduce data flow |

### Critical Violations

None.

---

## 8. Behavioral Quality Spot-Check

### Status: PASS

**Checklist applied**: Yes
**Files spot-checked**: `src/net/ws_handlers.c`, `src/world/properties.c`,
`src/redis/redis_donation_runtime.c`

| Category | Status | File | Details |
|----------|--------|------|---------|
| Trust boundaries | PASS | `ws_handlers.c` | `durisweb_verified` checked before any serialization; unauthenticated peer closed with 1008 and learns nothing about configuration |
| Resource cleanup | PASS | `ws_handlers.c` | Serializer deletes its cJSON tree on every path including allocation failure; caller frees the returned string in both the command and push paths |
| Mutation safety | PASS | `redis_donation_runtime.c` | Property read moved to the game thread, eliminating a race with `properties set` |
| Failure paths | PASS | `ws_handlers.c` | `admin_delete_character` returns an explicit refusal; donation drops are logged with a count, once per pulse rather than per event |
| Contract alignment | PASS | `properties.c` | Push fires on the actually-matched keys, not the fnmatch glob |

### Violations Found

None outstanding.

### Fixes Applied During Implementation

1. **Real bug caught before it shipped**: the push trigger originally tested
   `is_durisweb_hook_property(pattern)`, but `properties set` takes an fnmatch
   glob. `properties set * 0.000` would have disabled every hook while matching
   no prefix, firing no push and leaving the website showing everything as
   enabled - precisely the silent disagreement this phase exists to eliminate.
   Now tracked per matched key.
2. **Concurrency**: donation gate moved off the worker thread to the game
   thread.
3. **Information leak**: hook-disabled refusal ordered after the authorization
   check.
4. **Queue behaviour**: disabled donations drain and drop rather than
   accumulating to the queue cap and flooding on re-enable.

---

## Validation Result

### PASS

20/20 tasks, nine MUD files modified, full build clean under `-Werror` with zero
warnings, binary linked. Defaults preserve current behaviour exactly, so this can
land upstream independently of the website side.

One planned change was deliberately not implemented as specified:
`connection_log` receives no MUD property, because the lines durisweb parses are
the MUD's own `LOG_COMM` operational records and gating them would delete
admin-facing data to control a website hook. Session 01's registry, its tests,
MUD_HANDOFF.md, and the MUD documentation were all updated to eight MUD-gated
hooks.

### Required Actions

None for this session.

**Carried forward**: the MUD branch `feat/durisweb-hook-toggles` is committed
locally but not pushed. Upstream is `LuminariMUD/DurisMUD`, a repository the
user has not authorised pushes to from this session.

---

## Next Steps

Run `/updateprd` to mark session complete.

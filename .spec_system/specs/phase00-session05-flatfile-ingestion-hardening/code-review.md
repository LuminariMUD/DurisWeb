# Code Review and Repair Report

**Session ID**: `phase00-session05-flatfile-ingestion-hardening`
**Package**: `backend`
**Reviewed**: 2026-09-01
**Base Commit**: `e023886a0cc0ceb4f168218889f3491f8e3dc5e2`
**Scope**: All changes since the base commit (uncommitted work plus mid-session commits)
**Result**: RESOLVED

## Review Surface

**Files reviewed** (all changes since the base commit):
- `.spec_system/state.json` - tracked-modified
- `.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/code-review.md` - untracked review artifact
- `.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/implementation-notes.md` - untracked
- `.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/spec.md` - untracked
- `.spec_system/specs/phase00-session05-flatfile-ingestion-hardening/tasks.md` - untracked
- `backend/src/hooks/__tests__/flatfileHookState.test.ts` - untracked
- `backend/src/hooks/__tests__/hookSettingsService.test.ts` - tracked-modified
- `backend/src/hooks/flatfileHookState.ts` - untracked
- `backend/src/hooks/hookSettingsService.ts` - tracked-modified
- `backend/src/hooks/index.ts` - tracked-modified
- `backend/src/hooks/registry.ts` - tracked-modified
- `backend/src/index.ts` - tracked-modified
- `backend/src/routes/hooks.ts` - tracked-modified
- `backend/src/services/__tests__/flatfileAccess.test.ts` - untracked
- `backend/src/services/__tests__/flatfileParsers.test.ts` - untracked
- `backend/src/services/__tests__/mudConnectionLogSync.test.ts` - untracked
- `backend/src/services/flatfileAccess.ts` - untracked
- `backend/src/services/guildSyncService.ts` - tracked-modified
- `backend/src/services/mudConnectionLogSync.ts` - tracked-modified
- `backend/src/services/mudFlagParser.ts` - tracked-modified
- `backend/src/services/mudGuildParser.ts` - tracked-modified
- `backend/src/services/zoneBuilderParser.ts` - tracked-modified

No staged changes or mid-session commits existed during review.

**Inventory commands**: `git status`, `git log --oneline "$BASE"..HEAD`,
`git diff "$BASE"`, `git diff --cached "$BASE"`,
`git ls-files --others --exclude-standard`

## Findings by Severity

### Critical

No findings.

### High

No findings.

### Medium

- `backend/src/services/flatfileAccess.ts:218` - The original size check used
  `stat()` followed by an unbounded `readFile()`, so a source that grew between
  the two operations could bypass `maxBytes` and force an oversized allocation.
  | Fix: Open one file handle, inspect that handle, read in bounded chunks up to
  `maxBytes + 1`, reject growth, and close the handle in `finally`. Added the
  deterministic read-interlock regression case. | Status: FIXED
- `backend/src/services/flatfileAccess.ts:340` - Optional existence checks and
  required-resource probes did not canonicalize every target. A required
  symlink could resolve outside `MUD_DIR`, and probes checked readability but
  not the required file/directory kind; the hook could remain reported healthy.
  | Fix: Reuse realpath containment for existence checks and every probe,
  validate the expected filesystem kind, and move rejected probe targets to
  UNAVAILABLE. Added an escaping-required-symlink regression test. | Status:
  FIXED
- `backend/src/services/flatfileAccess.ts:284` - Any successful individual read
  cleared hook-wide UNAVAILABLE state even when another required resource for
  that hook was still absent. | Fix: Only a successful complete required-path
  probe clears hook-wide availability; ordinary reads no longer reset the
  failure. Added a multi-resource partial-recovery regression test. | Status:
  FIXED
- `backend/src/services/zoneBuilderParser.ts:465` - One malformed reset source
  aborted the complete zone-number map, and an unsafe zone filename could abort
  the aggregate index and expose unsanitized filename context in a warning.
  | Fix: Isolate rejected source entries, enforce the existing safe-zone path
  policy in both aggregate builders, count unsafe names, sanitize warning
  context, and preserve every valid zone. Added malformed-neighbor and unsafe-
  filename aggregate regression tests. | Status: FIXED
- `backend/src/services/zoneBuilderParser.ts:1975` - Removing the external grep
  bypass made text search instantiate every room, mobile, or object in the live
  source set for each request (the inspected live index contains 580,952
  rooms). | Fix: Add a conservative whitespace-compacted prefilter that reads
  through the same contained, bounded, validated boundary and only constructs
  parser objects for candidate files. Added a global-search result regression
  test and retained the shell-literal safety test. | Status: FIXED

### Low

- `backend/src/services/mudConnectionLogSync.ts:65` - The new alphabetic-name
  validator had no upper bound even though the authoritative MUD stores player
  names with `MAX_NAME_LENGTH` 12. | Fix: Enforce 1-12 ASCII letters and add a
  13-character rejection case. | Status: FIXED
- `backend/src/hooks/__tests__/hookSettingsService.test.ts:174` - The new
  resource-health overlay lacked an integration assertion proving that only
  the failed filesystem hook becomes UNAVAILABLE. | Fix: Add status-matrix
  coverage for the failed connection hook, an unaffected filesystem hook, and
  a non-filesystem hook. | Status: FIXED
- `backend/src/services/zoneBuilderParser.ts:2166` - The changed shop-parser
  catch retained an unused binding after its raw error logging was removed;
  nearby indentation and a grep-specific comment were also stale after the
  boundary rewrite. | Fix: Remove the unused binding and align comments and
  indentation with the resulting implementation. Full ESLint now passes.
  | Status: FIXED

## Assumptions and Deliberate Non-Fixes

- The 12-character connection-name ceiling follows the authoritative local MUD
  definition at `/home/aiwithapex/projects/duris/src/core/structs.h:138`
  (`MAX_NAME_LENGTH 12`), inspected with `rg`. This rejects records the MUD
  cannot legitimately emit.
- The bounded search prefilter deliberately overselects candidates after
  removing whitespace. Exact result matching still happens in the established
  typed parsers, so overselection can cost work but cannot add a false result;
  compact matching avoids false negatives from multiline fields.
- The complete backend suite still has the exact Session 04 baseline of three
  ambient-data suites and 33 failures: `guildService.test.ts` has no seeded
  guilds, `auctionService.test.ts` has no seeded characters, and
  `userManagementService.test.ts` lacks `duris_dev.players_core` and IP rows.
  Those unchanged suites and fixtures are outside this review surface. The
  affected 161-test matrix and all 19 long-lived security contracts pass.
- No standalone formatter is configured. `package.json` exposes ESLint with
  auto-fix as `lint`; review ran ESLint without mutation and separately checked
  whitespace, ASCII, and LF invariants.

## Behavior Changes

- Files that grow past their declared ceiling during a read are now rejected.
- Required symlinks escaping `MUD_DIR` and wrong-kind required resources now
  make only their owning hook UNAVAILABLE.
- A single successful member read cannot claim full resource recovery; the
  complete required-path probe must succeed.
- Malformed or unsafe zone entries are excluded without hiding valid zones.
- Global search prefilters validated source text before constructing objects.
- Connection records with player names longer than the MUD's 12-character
  limit are rejected as malformed.

## Evidence Ledger

| Check | Command or Inspection | Result | Evidence / Blocker |
|-------|-----------------------|--------|--------------------|
| Affected tests | `NODE_OPTIONS=--experimental-vm-modules pnpm exec jest --runInBand src/hooks/__tests__/flatfileHookState.test.ts src/hooks/__tests__/hookResolution.test.ts src/hooks/__tests__/hookSettingsService.test.ts src/hooks/__tests__/mudHookStateClient.test.ts src/hooks/__tests__/registry.test.ts src/services/__tests__/flatfileAccess.test.ts src/services/__tests__/flatfileParsers.test.ts src/services/__tests__/mudConnectionLogSync.test.ts src/services/__tests__/mudTransportSecurity.test.ts src/services/__tests__/zoneBuilderSearchSafety.test.ts src/services/__tests__/zonePathContainment.test.ts` | PASS | 11 suites, 161 tests, zero failures. |
| Security contracts | `NODE_OPTIONS=--experimental-vm-modules pnpm exec jest --runInBand src/services/__tests__/integrationSecurityContract.test.ts src/services/__tests__/terminalSessionAuthorization.test.ts src/utils/__tests__/websocketAccess.test.ts src/utils/__tests__/scopedRedis.test.ts` | PASS | 4 suites, 19 tests, zero failures. |
| Complete backend suite | `NODE_OPTIONS=--experimental-vm-modules pnpm exec jest --runInBand --forceExit` | BASELINE-ONLY FAILURE | 60/63 suites and 467/500 tests pass; only the same 3 ambient-data suites and 33 tests fail. `--forceExit` releases the pre-existing open handle after the summary. |
| Linter | `pnpm exec eslint .` | PASS | Full backend ESLint exited 0 after the unused catch binding was repaired. |
| Formatter | `package.json` scripts plus `git diff --check` and ASCII/LF scans | N/A / PASS | No standalone formatter exists; whitespace and encoding checks pass. |
| Type checker | `pnpm run type-check` | PASS | `tsc --noEmit` exited 0. |
| Final diff re-read | `git diff e023886a0cc0ceb4f168218889f3491f8e3dc5e2` plus every untracked file | PASS | All 22 files were inventoried and read; no unresolved finding or debug artifact remains. |

## Summary

1. Reviewed all 22 files in the deterministic surface since base commit
   `e023886a0cc0ceb4f168218889f3491f8e3dc5e2`, including every tracked hunk,
   untracked source/test file, and session artifact.
2. Resolved 0 Critical, 0 High, 5 Medium, and 3 Low findings with surgical
   fixes and regression coverage.
3. Deliberately left only the unchanged three-suite ambient-data baseline; the
   evidence above shows it is identical in suite and failure count.
4. Affected tests, security contracts, ESLint, type-check, whitespace, ASCII,
   and LF checks pass. The full suite adds no Session 05 regression.

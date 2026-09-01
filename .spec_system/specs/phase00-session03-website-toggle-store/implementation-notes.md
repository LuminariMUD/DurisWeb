# Implementation Notes

**Session ID**: `phase00-session03-website-toggle-store`
**Package**: backend
**Started**: 2026-09-01 12:10
**Last Updated**: 2026-09-01 13:05

---

## Session Progress

| Metric | Value |
|--------|-------|
| Tasks Completed | 18 / 18 |
| Blockers | 1 resolved, 1 partially resolved and escalated |

---

## Task Log

### T001-T003 - Environment and the blocking defect

Session 03 was blocked by "a fresh database cannot be migrated", carried
forward from Session 01. Investigating it produced a much more important
finding than the one recorded: see Design Decision 1.

Built a usable test database by cloning the MUD schema structure-only and
documented the procedure in `dev-database.md`. Backend suites went from 8
failing (88 tests) to 3 failing (33 tests).

**Files Changed**:
- `backend/migrations/016a_bootstrap_admin_permission_tables.ts` - created
- `backend/migrations/20251115000000_admin_permissions_system.ts` - `hasTable`
  guards and conflict-tolerant seeds
- `.spec_system/specs/.../dev-database.md` - created

---

### T004-T005 - Resolution

Pure module, no I/O and no clock, so the full matrix is cheap to test. Five
effective states, with only `on` active. Exhaustiveness guarded by a `never`
assignment so adding a `MudHookState` member fails compilation rather than
silently activating a hook nobody reasoned about.

**BQC Fixes**:
- Contract alignment: the `never` exhaustiveness guard.

**Files Changed**: `backend/src/hooks/hookResolution.ts` - created

---

### T006 - Migration

Rows derived from `getToggleableHooks()` rather than listed, so a new hook
cannot be forgotten and a key cannot drift from its id. Strictly additive, since
`web_settings` lives in the MUD's schema. `down` deletes only registry keys.

Verified directly (see Test Results) because the migration chain cannot reach it.

**Files Changed**: `backend/migrations/20260901000000_hook_toggles.ts` - created

---

### T007-T010 - Store

MUD state arrives through an injectable provider defaulting to UNKNOWN, so the
session is complete and testable before the bridge exists. UNKNOWN rather than
"enabled" is deliberate: claiming knowledge we do not have would let a hook read
ON while the MUD has it off.

**BQC Fixes**:
- Failure path completeness: a read failure defaults every hook to *enabled* and
  logs. Fail-closed governs a known disagreement; an unreadable settings table
  is absence of knowledge, and defaulting it closed would take the whole
  integration down on a transient database error.
- Trust boundary: values are parsed, not coerced. An unparseable value logs and
  falls back to enabled rather than being read as falsy.
- State freshness: the cache is cleared *before* the write returns, so the
  10-second propagation budget does not depend on a TTL.
- Failure path completeness: an audit-log write failure after a successful
  toggle is logged as an error rather than swallowed.

**Files Changed**: `backend/src/hooks/hookSettingsService.ts` - created

---

### T011-T014 - Gate, API, wiring

The gate is synchronous: an event handler must not await a database read to
decide whether to deliver.

**BQC Fixes**:
- Trust boundary: the route validates the id against the registry via `isHookId`
  and requires `enabled` to be an actual boolean, not merely truthy.
- Authorization: `requireAuth` plus `requirePermission('manage_settings')` on
  both endpoints.
- Failure path completeness: `HookToggleError` maps to 404 or 409; everything
  else is a logged 500 with no internal detail in the response.
- Trust boundary: an unregistered id returns false from the gate rather than
  defaulting open.

**Files Changed**: `backend/src/hooks/hookGate.ts`, `backend/src/routes/hooks.ts`
(created); `backend/src/hooks/index.ts`, `backend/src/index.ts` (modified)

---

### T015-T018 - Tests and verification

56 tests across three hook suites. The resolution matrix is table-driven over
all 10 web/MUD combinations, plus per-hook coverage of all 14 registered hooks
in all 5 MUD states.

Added `pool.end()` in `afterAll` to match the convention in
`sessionService.test.ts`; without it Jest hung rather than exiting.

**Files Changed**: `backend/src/hooks/__tests__/hookResolution.test.ts`,
`backend/src/hooks/__tests__/hookSettingsService.test.ts` - created

---

## Design Decisions

### Decision 1: The migration blocker is systemic, and only one instance was fixed

**Context**: Session 01 recorded "a fresh database cannot be migrated" as an
`admin_permissions` ordering defect.

**What I found**: two things, both bigger.

1. **durisweb has no database of its own.** It shares the MUD's schema.
   `duris_dev` holds the MUD's 173 tables, created by the MUD's C code, plus
   durisweb's. `035_pvp_battle_interactions.ts` ALTERs `pkill_event`, a
   MUD-owned table. "Migrate a fresh database" is therefore not a meaningful
   operation - the MUD must build its schema first. This is documented nowhere.

2. **The ordering defect is systemic, not a one-off.** The project switched
   naming from `NNN_name.ts` (36 files) to `YYYYMMDDHHMMSS_name.ts` (42 files).
   Knex sorts lexicographically and `'0' < '2'`, so *every* numeric-prefixed
   migration sorts before *every* timestamped one regardless of authoring order.
   Any numeric migration written after the switch depends on tables that do not
   exist yet. Confirmed twice: `017`-`041` need `admin_permissions`
   (`20251115000000_...`), and `045` needs `account_login_history`
   (`20251113202151_...`).

**Chosen**: fix the `admin_permissions` instance only, work around the rest.
**Rationale**: a full repair means squashing to a baseline migration - a
project-level change that deserves its own scope, not something to bury inside
a session about toggle storage. Recorded in CONSIDERATIONS.md.

### Decision 2: Read failure defaults to enabled

**Context**: the phase rule is fail closed.

**Chosen**: fail closed applies to a *known* disagreement between two ends. An
unreadable settings table is not knowledge. Defaulting it to disabled would let
one transient database error silently sever every MUD integration at once -
the "fail-closed lockout" risk the PRD already names.

### Decision 3: Reuse `property_change` for the audit trail

**Context**: `admin_action_log.action_type` is an ENUM of four values with no
hook option, on a table in the MUD's shared schema.

**Options**: ALTER the ENUM (schema change to a shared table), or reuse an
existing value.
**Chosen**: reuse `property_change` with `target = 'hook:<id>'`.
**Rationale**: a toggle *is* a settings change, the prefix keeps hook actions
filterable, and it avoids altering a table the MUD also owns. No IP is recorded,
per the standing PII finding.

---

## Blockers & Solutions

### Blocker 1: No usable test database (resolved)

**Resolution**: cloned the MUD schema structure-only into an isolated MySQL,
applied durisweb's `.sql` migrations manually (knex never loads them), ran the
`.ts` chain as far as it goes, aligned the database timezone, and seeded one
synthetic fixture account. Procedure captured in `dev-database.md`. Real player
row data was deliberately not copied.

### Blocker 2: Migration chain still cannot complete (escalated)

**Description**: the chain stops at `045_add_client_to_login_history.ts` for the
same systemic ordering reason.
**Impact**: T017 could not verify the new migration through `migrate:latest`.
**Resolution**: verified the migration's `up`, idempotency, `down`, and re-apply
directly against the test database instead - a real exercise of the code, just
not through the broken chain. Stated plainly rather than implied.

---

## Finding: SEC-TZ-1

While repairing the environment, a session-expiry regression test failed. It was
not a data problem: `sessionService.ts:27` compares `expires_at > NOW()`, where
`expires_at` is written by mysql2 in the *application host's* timezone and
`NOW()` evaluates in the *database server's*. With the host at UTC+3 and MySQL
at UTC, a session expired 60 seconds earlier still authenticated, and would have
for another three hours.

This fails open on an authentication boundary. Recorded as a High finding in
SECURITY-COMPLIANCE.md. Not introduced by this phase.

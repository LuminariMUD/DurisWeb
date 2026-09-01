# Implementation Notes

**Session ID**: `phase00-session01-hook-registry-and-contract`
**Package**: backend
**Started**: 2026-09-01 10:40
**Last Updated**: 2026-09-01 11:05

---

## Session Progress

| Metric | Value |
|--------|-------|
| Tasks Completed | 16 / 16 |
| Estimated Remaining | 0 hours |
| Blockers | 1 resolved, 1 escalated (out of scope) |

---

## Task Log

### 2026-09-01 - Session Start

**Environment verified**:
- [x] Prerequisites confirmed
- [x] Tools available
- [x] Directory structure ready
- [x] Database running (see Blocker 1)

---

### T001-T003 - Setup and MUD-side verification

Installed missing `backend/node_modules` via `pnpm install --frozen-lockfile`.

Cross-read every MUD-emitting hook against
`/home/aiwithapex/projects/duris/src/net/ws_handlers.c` and
`docs/reference/api/durisweb.md`. Two findings that changed the registry:

- `player_presence` has **two** emitters (`ws_broadcast_player_login:387`,
  `ws_broadcast_player_logout:430`), not one.
- `donation_delivery` has **no** WebSocket emitter. durisweb is the producer;
  the MUD consumes it in `src/redis/redis_donation_worker.c`.

**Files Changed**: none (verification only)

---

### T004-T005 - Types

Defined `HookChannel`, `HookDirection`, `HookId`, `HookDefinition`. Made
`webSettingKey` and `mudPropertyKey` explicitly `string | null` so "no MUD side
to gate" is representable without an empty-string sentinel.

**Files Changed**:
- `backend/src/hooks/types.ts` - created

---

### T006-T010 - Registry and lookups

14 entries across 5 channels. Keys are derived by helper functions
(`durisweb.hook.<id>`, `hook_enabled_<id>`) rather than written out, so a typo
cannot desynchronise an id from its keys.

**BQC Fixes**:
- Failure path completeness: `getHook` returning `undefined` for an unknown id
  could read as "enabled" at a call site. Added `requireHook`, which throws with
  the offending id, and documented in both the JSDoc and README that undefined
  must not be treated as an open gate. (`backend/src/hooks/registry.ts`)
- Contract alignment: added `mudSite` recording the exact MUD symbol per hook,
  so Session 02 has an unambiguous target instead of re-deriving it.
- Concurrency safety: registry is frozen and lookup maps are built once at
  module load; no mutable shared state.

**Files Changed**:
- `backend/src/hooks/registry.ts` - created

---

### T011-T012 - Public surface and contract doc

`index.ts` re-exports helpers and types only; the raw array stays unexported so
the registry remains the single source of ids.

**Files Changed**:
- `backend/src/hooks/index.ts` - created
- `backend/src/hooks/README.md` - created

---

### T013-T015 - Tests and verification

24 tests across composition, invariants, and lookups. Lookup tests cover
unknown, empty, and case-mismatched ids on every helper.

Results:
- Session tests: 24/24 passing
- `pnpm type-check`: clean
- Pre-existing contract suites (integrationSecurityContract,
  terminalSessionAuthorization, websocketAccess, scopedRedis): 19/19 passing
- Full backend suite: 279 passing, 88 failing across 8 suites -- all from
  Blocker 2 below, none related to this session

**Files Changed**:
- `backend/src/hooks/__tests__/registry.test.ts` - created

---

### T016 - Hand-off reconciliation

Corrected MUD_HANDOFF.md Change 3 with the two T003 findings, and pointed it at
`getMudGatedHooks()` as the generated source of truth rather than a transcribed
list.

**Files Changed**:
- `.spec_system/PRD/MUD_HANDOFF.md` - modified

---

## Blockers & Solutions

### Blocker 1: No local database or environment file

**Description**: `backend/node_modules` absent, no `.env`, and no reachable
MySQL. 8 test suites could not even load.
**Impact**: T015
**Resolution**: Installed dependencies. Created `backend/.env` (gitignored, mode
0600) from `.env.example` with `MUD_DIR` pointed at the local checkout. Port
3306 was already held by a host mariadb service, and the MUD's own
`durismud-mariadb-1` container publishes no ports, so neither was usable.
Started an isolated MySQL 8 + Redis 7 pair on ports 13306/16379 from a compose
file in the session scratchpad, leaving the committed `podman-compose.yml`
untouched. Suites now load: 367 tests discovered, up from 235.
**Time Lost**: ~25 minutes

### Blocker 2: A fresh database cannot be migrated (PRE-EXISTING, ESCALATED)

**Description**: `pnpm migrate:latest` fails on a clean database at
`017_add_terminal_access_permission.ts`, which inserts into `admin_permissions`.
That table is created by `20251115000000_admin_permissions_system.ts`, which
sorts 33 positions later under knex's lexicographic ordering. Migration stops
after 016 with 6 tables created.

Additionally, `knexfile.ts` sets `extension: 'ts'`, so the 14 `.sql` files in
`migrations/` are never applied by knex at all.

**Impact**: 8 test suites (88 tests) cannot pass without their tables:
sessionService, webSessionSchema, authSessionBinding, auctionService,
guildService, accountService, userManagementService, backupService.

**Resolution**: NOT resolved -- deliberately. Fixing it means either reordering
migrations already applied to shared environments, which CONVENTIONS.md
forbids, or adding a bootstrap path. Both are well outside this session's scope
and neither should be done incidentally.

Confirmed pre-existing and unrelated to this session: `git status` shows only
`.spec_system/` and `backend/src/hooks/` as new, and these suites failed
identically on the first run before any code was written.

**Escalated to**: CONSIDERATIONS.md. This blocks Session 03, which adds a
migration and cannot verify it against a fresh database.
**Time Lost**: ~15 minutes diagnosing

---

## Design Decisions

### Decision 1: One hook for player presence, not two

**Context**: The MUD has separate login and logout emitters, and presence also
has a Redis current-state feed.
**Options Considered**:
1. Three hooks (login, logout, redis presence) - precise, but an operator
   cutting "presence" would have to find and flip three switches, and a partial
   state (login on, logout off) leaves the website with players who never leave.
2. One hook covering all three sites - one switch, one meaning.

**Chosen**: Option 2.
**Rationale**: Toggle granularity should match operator intent, not
implementation topology. The three emitter sites are recorded in `mudSite` and
the description so Session 02 knows to guard all of them.

### Decision 2: Derive keys instead of writing them literally

**Context**: Each hook needs a `web_settings` key and a `duris.properties` key.
**Options Considered**:
1. Write both keys as literals per entry - readable, but a typo silently
   produces a hook that can never be disabled from one side.
2. Derive via `webKey(id)` / `mudKey(id)` helpers.

**Chosen**: Option 2, with invariant tests asserting the derived format.
**Rationale**: This is exactly the BQC "contract alignment" failure mode -- the
two sides drift and nothing notices until an operator flips a switch that does
nothing.

### Decision 3: `requireHook` alongside `getHook`

**Context**: An unregistered id returning `undefined` is ambiguous at a call
site deciding whether to deliver an event.
**Chosen**: Keep `getHook` for genuinely optional lookups, add `requireHook`
that throws, and document that `undefined` is never an open gate.
**Rationale**: Fail closed is the phase's governing principle; a lookup helper
that quietly reads as "enabled" would contradict it at the lowest level.

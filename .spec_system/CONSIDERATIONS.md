# Considerations

> Institutional memory for AI assistants. Updated between phases via /carryforward.
> **Line budget**: 600 max | **Last updated**: Phase 00 (2026-09-01)

---

## Active Concerns

Items requiring attention in upcoming phases. Review before each session.

### Technical Debt
<!-- Max 5 items -->

1. **durisweb shares the MUD's database.** There is no separate durisweb
   schema: `duris_dev` holds the MUD's 173 tables (created by the MUD's C code,
   `src/sql/sql.c`) plus durisweb's ~44. durisweb migrations such as
   `035_pvp_battle_interactions.ts` ALTER MUD-owned tables like `pkill_event`.
   **Why:** this is undocumented anywhere, and it means "run durisweb's
   migrations on a fresh database" is not a meaningful operation - the MUD must
   create its schema first. Corrected from an earlier, wrong entry that called
   this a pure migration-ordering defect.
   **How to apply:** to build a dev/test database, clone the MUD schema
   (`mariadb-dump --no-data`) and load it; do NOT copy row data, which is real
   player PII. See Session 03 notes for the exact procedure.
2. **The migration chain is not replayable, systemically.** The project
   switched naming from `NNN_name.ts` (36 files) to `YYYYMMDDHHMMSS_name.ts`
   (42 files). Knex sorts lexicographically, and `'0' < '2'`, so **every**
   numeric-prefixed migration sorts before **every** timestamped one regardless
   of when it was written. Any numeric migration authored after the switch
   depends on tables its predecessors have not created yet. Two confirmed
   instances: `017`-`041` insert into `admin_permissions` (created by
   `20251115000000_...`), and `045_add_client_to_login_history.ts` alters
   `account_login_history` (created by `20251113202151_...`).
   **Why:** `migrate:latest` cannot rebuild the schema from zero, so there is no
   clean-room environment and no way to validate a migration in isolation.
   **How to apply:** treat as its own piece of work, not a side fix - a squash
   to a baseline migration is the usual remedy. Session 03 fixed only the
   `admin_permissions` instance
   (`016a_bootstrap_admin_permission_tables.ts` plus `hasTable` guards, inert on
   databases where the late migration already ran) and worked around the rest by
   cloning the MUD schema. Do not assume a migration you write has actually been
   exercised end to end.
3. **14 `.sql` migrations are never applied by knex.** `knexfile.ts` sets
   `extension: 'ts'`, so only the 77 `.ts` files load.
   **Why:** the `.sql` files are a required, undocumented manual step for any
   new database.
   **How to apply:** apply them in filename order before `migrate:latest`.
   `017_fix_emoji_icons.sql` fails under the `mysql` client and needs review.
4. **Three test suites depend on ambient game data.** `guildService`,
   `auctionService`, and `userManagementService` throw (e.g. "no guilds found in
   database for testing") rather than creating fixtures, so they only pass on a
   database that happens to contain live game rows.
   **Why:** violates the CONVENTIONS testing rule about fixtures, and makes a
   clean-room test run impossible.
   **How to apply:** give them their own fixtures before relying on them as
   regression coverage. 33 tests affected.

### External Dependencies
<!-- Max 5 items -->

*None yet - add items when external API/service risks are identified.*

### Performance / Security
<!-- Max 5 items -->

1. **MUD flatfile ingestion is unauthenticated.** Anything able to write
   `${MUD_DIR}/logs/log/comm` (locally
   `/home/aiwithapex/projects/duris/logs/log/comm`) or the MUD flatfiles
   under `Accounts/` and `Players/` controls what the site
   ingests, including records feeding `suspicious_accounts`. Parser robustness
   is the only control. See SECURITY-COMPLIANCE.md channel 3.
2. **Terminal sandbox is deliberately porous.** `terminalService.ts` runs
   bubblewrap with `--share-net` and a shared PID namespace so tmux persists;
   `/tmp` is bind-mounted read-write with a predictable bashrc path.
3. **`web_sessions.refresh_token` appears to be stored unhashed** (VARCHAR 512).
   Confirm before Phase 00 sessions touch auth.
4. **Account name, character name, and IP leave the system to Google Gemini**
   via `geminiSuspicionAnalyzer.ts` for automated profiling.
5. **No retention or erasure anywhere.** No purge job for `page_views`,
   connection logs, or audit tables; no account deletion code path exists.

### Architecture
<!-- Max 5 items -->

1. **Five distinct MUD<->web channels**, each with its own trust boundary:
   WebSocket bridge (4050), scoped Redis pub/sub, flatfile/log ingestion,
   process control, and the interactive terminal. Changes to one do not
   generalize to the others -- check SECURITY-COMPLIANCE.md before assuming.
2. **The privileged bridge secret is fail-closed.** `DURISWEB_SECRET` must be
   >= 32 bytes and is contract-tested to never appear in frontend code.
3. **Channel 1 defaults to plaintext `ws://127.0.0.1:4050`**, which is only
   sound while the MUD and the API share a host. Crossing a host boundary
   requires `wss://` and certificate validation.
4. **Redis is scoped by namespace and season epoch**, not shared flat channels.
   Legacy channels (`mud:nchat`, `mud:player`, `mud:online`) are contract-tested
   as removed -- do not reintroduce them.
5. **The MUD server source is locally readable at
   `/home/aiwithapex/projects/duris/`** (a separate repo, referenced via
   `MUD_DIR`). Both sides of every hook can be inspected -- verify integration
   contracts against the MUD C source in `src/net/` instead of inferring them.
   Do not edit that repo from a durisweb session unless scope says so.
6. **Backend and frontend are separate packages with separate lockfiles.** No
   root workspace config links them; the CONVENTIONS.md cross-package rules
   describe a target state, not what exists today.

---

## Lessons Learned

Proven patterns and anti-patterns. Reference during implementation.

### What Worked
<!-- Max 15 items -->

*None yet - add patterns that prove effective.*

### What to Avoid
<!-- Max 10 items -->

*None yet - add anti-patterns discovered during implementation.*

### Tool/Library Notes
<!-- Max 5 items -->

1. Four contract test files encode the hardening from commits `d20be8d`,
   `f56f135`, `05e83a3`, `25dedec`: `integrationSecurityContract.test.ts`,
   `terminalSessionAuthorization.test.ts`, `websocketAccess.test.ts`,
   `scopedRedis.test.ts`. They assert on source text, so refactors can break
   them without changing behavior -- update deliberately, never by deletion.

---

## Resolved

Recently closed items (buffer - rotates out after 2 phases).

| Phase | Item | Resolution |
|-------|------|------------|
| - | *No resolved items yet* | - |

---

*Auto-generated by /initspec. Updated by /carryforward between phases.*

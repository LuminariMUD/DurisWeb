# Dev / Test Database Bootstrap

durisweb has **no database of its own**. It shares the MUD's schema: `duris_dev`
holds the MUD's 173 tables, created by the MUD's C code (`src/sql/sql.c`), plus
durisweb's ~44. durisweb migrations ALTER MUD-owned tables -
`035_pvp_battle_interactions.ts` adds columns to `pkill_event`.

This is undocumented anywhere else and is why "run durisweb's migrations against
a fresh database" does not work: the MUD must create its schema first.

## Procedure

1. **Start an isolated MySQL and Redis.** Do not reuse the MUD's own container:
   it publishes no ports, and port 3306 may be held by a host service. Use
   non-default host ports.

2. **Clone the MUD schema, structure only.**

   ```
   mariadb-dump -uroot -p<pw> --no-data --skip-add-drop-table --skip-comments duris_dev
   ```

   **Never copy row data.** The MUD database contains real player accounts,
   emails, and IP addresses. Structure only.

3. **Load it into the test database** (173 tables).

4. **Apply durisweb's `.sql` migrations in filename order.** knex will not do
   this - `knexfile.ts` sets `extension: 'ts'`, so the 14 `.sql` files are never
   loaded. `017_fix_emoji_icons.sql` fails under the `mysql` client and needs
   review.

5. **Run `pnpm migrate:latest`** for the `.ts` migrations.

   Note: a schema cloned from a database durisweb already migrated is *already*
   at head, so migrations that ALTER MUD tables will report duplicate columns.
   That is expected, not a failure of the migration.

6. **Align the database timezone with the application host.** See SEC-TZ-1 in
   SECURITY-COMPLIANCE.md: `expires_at > NOW()` compares a timestamp written in
   the app host's timezone against the database server's. A mismatch silently
   extends session lifetime. Locally: `SET GLOBAL time_zone = '<host offset>';`

7. **Seed synthetic fixtures.** Three suites need game data that they do not
   create themselves. At minimum:

   ```sql
   INSERT IGNORE INTO accounts (account_name, email, password, confirmed)
   VALUES ('Cwial', 'cwial@test.invalid', 'not-a-real-hash-local-fixture-only', 1);
   ```

   Use synthetic values. Do not copy a real account.

## Known state after this procedure

52 of 55 backend suites pass (335 of 368 tests). The three that do not -
`guildService`, `auctionService`, `userManagementService` - read ambient game
data and throw when it is absent (for example "no guilds found in database for
testing"). They need their own fixtures; tracked in CONSIDERATIONS.md.

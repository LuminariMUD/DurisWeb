-- migration: fix collation mismatch between mud tables and web tables
-- date: 2026-01-23
-- issue: mud tables use utf8mb4_0900_ai_ci (mysql 8 default), web tables use utf8mb4_unicode_ci
-- this causes "illegal mix of collations" errors when joining tables

-- disable foreign key checks during conversion
SET FOREIGN_KEY_CHECKS = 0;

-- fix accounts table (parent table, must be first)
ALTER TABLE accounts
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix account_characters table
ALTER TABLE account_characters
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix account_ips table
ALTER TABLE account_ips
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix guilds table
ALTER TABLE guilds
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix guild_ranks table
ALTER TABLE guild_ranks
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix guild_members table
ALTER TABLE guild_members
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- fix player_data table if it exists (ignore error if not)
ALTER TABLE player_data
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

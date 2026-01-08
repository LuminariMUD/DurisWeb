import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Convert account_characters table and all columns to utf8mb4_unicode_ci
  // This fixes the collation mismatch error when JOINing with user_bans and web_sessions
  await knex.raw(`
    ALTER TABLE account_characters
    CONVERT TO CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert to original collation (MySQL 8 default)
  await knex.raw(`
    ALTER TABLE account_characters
    CONVERT TO CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci
  `);
}

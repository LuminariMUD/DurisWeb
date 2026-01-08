import type { Knex } from "knex";

/**
 * Migration: User Bans System
 *
 * Adds email column to accounts table and creates user_bans table for tracking ban history
 */

export async function up(knex: Knex): Promise<void> {
  // Check if email column exists in user_profiles table
  const hasEmail = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_profiles'
    AND COLUMN_NAME = 'email'
  `);

  // Add email column to user_profiles table if it doesn't exist
  if (hasEmail[0][0].count === 0) {
    await knex.schema.alterTable('user_profiles', (table) => {
      table.string('email', 255).nullable();
      table.index('email', 'idx_email');
    });
  }

  // Create user_bans table if it doesn't exist
  const tableExists = await knex.schema.hasTable('user_bans');

  if (!tableExists) {
    await knex.raw(`
      CREATE TABLE user_bans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_name VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        banned_by VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unbanned_at TIMESTAMP NULL,
        unbanned_by VARCHAR(50) COLLATE utf8mb4_unicode_ci NULL,
        reason TEXT COLLATE utf8mb4_unicode_ci,
        is_active BOOLEAN DEFAULT TRUE,

        FOREIGN KEY (account_name) REFERENCES user_profiles(account_name) ON DELETE CASCADE,

        INDEX idx_account_active (account_name, is_active),
        INDEX idx_banned_by (banned_by),
        INDEX idx_banned_at (banned_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop user_bans table
  await knex.schema.dropTableIfExists('user_bans');

  // Remove email column from user_profiles table
  const hasEmail = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_profiles'
    AND COLUMN_NAME = 'email'
  `);

  if (hasEmail[0][0].count > 0) {
    await knex.schema.alterTable('user_profiles', (table) => {
      table.dropIndex('email', 'idx_email');
      table.dropColumn('email');
    });
  }
}


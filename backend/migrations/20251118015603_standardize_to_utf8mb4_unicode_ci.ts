import type { Knex } from 'knex';

/**
 * Standardize all web tables to use utf8mb4_unicode_ci (standard UTF-8 collation)
 *
 * This migration ensures all web application tables use the standard UTF-8 collation
 * instead of MySQL 8.0's default utf8mb4_0900_ai_ci. This provides better compatibility
 * and avoids collation mismatch errors when joining with other tables.
 */
export async function up(knex: Knex): Promise<void> {
  // All web tables that should use utf8mb4_unicode_ci
  const webTables = [
    'admin_action_log',
    'forum_categories',
    'forum_category_permissions',
    'forum_moderation_log',
    'forum_notifications',
    'forum_poll_options',
    'forum_poll_vote_history',
    'forum_poll_votes',
    'forum_polls',
    'forum_posts',
    'forum_reactions',
    'forum_subscriptions',
    'forum_threads',
    'wipe_history',
  ];

  for (const table of webTables) {
    try {
      // Check if table exists
      const exists = await knex.schema.hasTable(table);
      if (!exists) {
        console.log(`Skipping ${table} (table does not exist)`);
        continue;
      }

      // Check current collation
      const result = await knex.raw(`
        SELECT TABLE_COLLATION
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `, [table]);

      const currentCollation = result[0]?.[0]?.TABLE_COLLATION;

      // Convert to utf8mb4_unicode_ci if needed
      if (currentCollation !== 'utf8mb4_unicode_ci') {
        console.log(`Converting ${table} from ${currentCollation} to utf8mb4_unicode_ci`);
        await knex.raw(`
          ALTER TABLE ??
          CONVERT TO CHARACTER SET utf8mb4
          COLLATE utf8mb4_unicode_ci
        `, [table]);
      } else {
        console.log(`Skipping ${table} (already utf8mb4_unicode_ci)`);
      }
    } catch (error: any) {
      console.error(`Error converting ${table}:`, error.message);
      throw error;
    }
  }

  // Handle user_profiles separately due to foreign key constraints
  try {
    const exists = await knex.schema.hasTable('user_profiles');
    if (!exists) {
      console.log('Skipping user_profiles (table does not exist)');
      return;
    }

    const result = await knex.raw(`
      SELECT TABLE_COLLATION
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_profiles'
    `);

    const currentCollation = result[0]?.[0]?.TABLE_COLLATION;

    if (currentCollation === 'utf8mb4_unicode_ci') {
      console.log('Skipping user_profiles (already utf8mb4_unicode_ci)');
      return;
    }

    console.log(`Converting user_profiles from ${currentCollation} to utf8mb4_unicode_ci`);

    // Get foreign key constraints
    const fkResult = await knex.raw(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_profiles'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    const foreignKeys = fkResult[0] || [];

    // Drop foreign key constraints
    for (const fk of foreignKeys) {
      console.log(`Dropping foreign key: ${fk.CONSTRAINT_NAME}`);
      await knex.raw(`ALTER TABLE user_profiles DROP FOREIGN KEY ??`, [fk.CONSTRAINT_NAME]);
    }

    // Convert table collation
    await knex.raw(`
      ALTER TABLE user_profiles
      CONVERT TO CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
    `);

    // Recreate foreign key constraints
    for (const fk of foreignKeys) {
      console.log(`Recreating foreign key: ${fk.CONSTRAINT_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`);
      await knex.raw(`
        ALTER TABLE user_profiles
        ADD CONSTRAINT ?? FOREIGN KEY (account_name)
        REFERENCES ?? (account_name)
        ON DELETE CASCADE
        ON UPDATE CASCADE
      `, [fk.CONSTRAINT_NAME, fk.REFERENCED_TABLE_NAME]);
    }

    console.log('user_profiles collation conversion complete');
  } catch (error: any) {
    console.error('Error converting user_profiles:', error.message);
    throw error;
  }
}

export async function down(knex: Knex): Promise<void> {
  console.log('Collation changes cannot be automatically reverted');
  console.log('If needed, manually convert tables back to utf8mb4_0900_ai_ci');
}

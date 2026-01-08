import type { Knex } from 'knex';

/**
 * Fix user_bans table collation mismatch
 */
export async function up(knex: Knex): Promise<void> {
  try {
    const exists = await knex.schema.hasTable('user_bans');
    if (!exists) {
      console.log('Skipping user_bans (table does not exist)');
      return;
    }

    const result = await knex.raw(`
      SELECT TABLE_COLLATION
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_bans'
    `);

    const currentCollation = result[0]?.[0]?.TABLE_COLLATION;

    if (currentCollation !== 'utf8mb4_unicode_ci') {
      console.log(`Converting user_bans from ${currentCollation} to utf8mb4_unicode_ci`);
      await knex.raw(`
        ALTER TABLE user_bans
        CONVERT TO CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
      `);
    } else {
      console.log('Skipping user_bans (already utf8mb4_unicode_ci)');
    }
  } catch (error: any) {
    console.error('Error converting user_bans:', error.message);
    throw error;
  }
}

export async function down(knex: Knex): Promise<void> {
  console.log('Collation changes cannot be automatically reverted');
}

import type { Knex } from 'knex';

/**
 * Fix remaining collation mismatches for account_characters and web_sessions
 *
 * This migration completes the collation standardization by converting the two
 * tables that were missed in the previous migration (20251118015603).
 */
export async function up(knex: Knex): Promise<void> {
  const missingTables = [
    'account_characters',
    'web_sessions'
  ];

  for (const table of missingTables) {
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
}

export async function down(knex: Knex): Promise<void> {
  console.log('Collation changes cannot be automatically reverted');
  console.log('If needed, manually convert tables back to utf8mb4_0900_ai_ci');
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if account_characters table exists
  const hasTable = await knex.schema.hasTable('account_characters');

  if (hasTable) {
    // Add last_ip column if it doesn't exist
    const hasColumn = await knex.schema.hasColumn('account_characters', 'last_ip');
    if (!hasColumn) {
      await knex.schema.alterTable('account_characters', (table) => {
        table.string('last_ip', 45).nullable().comment('Last IP address from MUD flatfile (IPv4 or IPv6)');
        table.index('last_ip', 'idx_last_ip');
      });

      console.log('✅ Added last_ip column to account_characters');
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove last_ip column from account_characters
  await knex.schema.alterTable('account_characters', (table) => {
    table.dropColumn('last_ip');
  });

  console.log('✅ Removed last_ip column from account_characters');
}

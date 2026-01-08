import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if account_login_history table exists
  const hasTable = await knex.schema.hasTable('account_login_history');

  if (!hasTable) {
    console.log('⚠️  account_login_history table does not exist, skipping migration');
    return;
  }

  console.log('🧹 Cleaning duplicate connection logs...');

  // Step 1: Delete duplicate rows, keeping only the oldest (lowest ID) entry for each unique combination
  await knex.raw(`
    DELETE t1 FROM account_login_history t1
    INNER JOIN account_login_history t2
    WHERE t1.id > t2.id
      AND t1.timestamp = t2.timestamp
      AND t1.account_name = t2.account_name
      AND t1.character_name = t2.character_name
      AND t1.ip_address = t2.ip_address
      AND t1.status = t2.status
  `);

  console.log('✅ Duplicates cleaned');

  // Step 2: Add UNIQUE constraint to prevent future duplicates
  console.log('🔒 Adding UNIQUE constraint...');

  await knex.schema.alterTable('account_login_history', (table) => {
    table.unique(
      ['timestamp', 'account_name', 'character_name', 'ip_address', 'status'],
      { indexName: 'unique_connection_event' }
    );
  });

  console.log('✅ UNIQUE constraint added: unique_connection_event');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔓 Removing UNIQUE constraint...');

  await knex.schema.alterTable('account_login_history', (table) => {
    table.dropUnique(
      ['timestamp', 'account_name', 'character_name', 'ip_address', 'status'],
      'unique_connection_event'
    );
  });

  console.log('✅ UNIQUE constraint removed');
}

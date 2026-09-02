import type { Knex } from 'knex';

/** Add account email metadata and create login history when absent. */
export async function up(knex: Knex): Promise<void> {
  // Check if account_characters table exists
  const hasTable = await knex.schema.hasTable('account_characters');

  if (hasTable) {
    // Add email column to account_characters if it doesn't exist
    const hasColumn = await knex.schema.hasColumn('account_characters', 'email');
    if (!hasColumn) {
      await knex.schema.alterTable('account_characters', (table) => {
        table.string('email', 255).nullable().comment('Email from MUD flatfile');
        table.index('email', 'idx_email');
      });
    }
  }

  // Create account_login_history table if it doesn't exist
  const hasLoginHistory = await knex.schema.hasTable('account_login_history');
  if (!hasLoginHistory) {
    await knex.schema.createTable('account_login_history', (table) => {
    table.bigIncrements('id').primary();
    table.string('account_name', 50).notNullable().comment('Account name');
    table.string('ip_address', 45).nullable().comment('IP address (IPv4 or IPv6)');
    table.string('client', 50).nullable();
    table.string('client_version', 50).nullable();
    table.enum('status', ['login', 'logout']).notNullable().comment('Login or logout event');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now()).comment('Event timestamp');

    // Indexes
    table.index('account_name', 'idx_account_name');
    table.index('timestamp', 'idx_timestamp');
    table.index(['account_name', 'timestamp'], 'idx_account_timestamp');
    });

    console.log('Created account_login_history table');
  }

  console.log('Migration completed');
}

/** Remove login history and the account email extension. */
export async function down(knex: Knex): Promise<void> {
  // Drop login history table
  await knex.schema.dropTableIfExists('account_login_history');

  // Remove email column from account_characters
  await knex.schema.alterTable('account_characters', (table) => {
    table.dropColumn('email');
  });

  console.log('Dropped account_login_history table');
  console.log('Removed email column from account_characters');
}

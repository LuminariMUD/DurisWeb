import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if account_login_history table exists
  const hasLoginHistory = await knex.schema.hasTable('account_login_history');

  if (hasLoginHistory) {
    // Add columns if they don't exist
    const hasCharName = await knex.schema.hasColumn('account_login_history', 'character_name');
    const hasHostname = await knex.schema.hasColumn('account_login_history', 'hostname');

    if (!hasCharName || !hasHostname) {
      await knex.schema.alterTable('account_login_history', (table) => {
        if (!hasCharName) {
          table.string('character_name', 50).nullable().comment('Character name used during login');
          table.index('character_name', 'idx_character_name');
        }
        if (!hasHostname) {
          table.string('hostname', 255).nullable().comment('Reverse DNS hostname');
        }
        table.index('ip_address', 'idx_ip_address');
      });
    }

    console.log('✅ Added character_name and hostname columns to account_login_history');
  }

  // Create suspicious_accounts table for multi-account detection if it doesn't exist
  const hasSuspicious = await knex.schema.hasTable('suspicious_accounts');
  if (!hasSuspicious) {
    await knex.schema.createTable('suspicious_accounts', (table) => {
    table.bigIncrements('id').primary();
    table.string('account_name', 50).notNullable().comment('Flagged account name');
    table.integer('suspicion_score').notNullable().comment('Score from 0-100');
    table.json('evidence').nullable().comment('JSON evidence: shared IPs, overlapping sessions, etc.');
    table.timestamp('flagged_at').notNullable().defaultTo(knex.fn.now()).comment('When account was flagged');
    table.timestamp('reviewed_at').nullable().comment('When flag was reviewed');
    table.string('reviewed_by', 50).nullable().comment('Overlord who reviewed');
    table.text('review_notes').nullable().comment('Review notes');
    table.boolean('is_resolved').defaultTo(false).comment('Whether flag has been reviewed');

    // Indexes
    table.index('account_name', 'idx_suspicious_account');
    table.index('is_resolved', 'idx_is_resolved');
    table.index('suspicion_score', 'idx_suspicion_score');
    table.index('flagged_at', 'idx_flagged_at');
    });

    console.log('✅ Created suspicious_accounts table');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop suspicious_accounts table
  await knex.schema.dropTableIfExists('suspicious_accounts');

  // Remove new columns from account_login_history
  await knex.schema.alterTable('account_login_history', (table) => {
    table.dropIndex('character_name', 'idx_character_name');
    table.dropIndex('ip_address', 'idx_ip_address');
    table.dropColumn('character_name');
    table.dropColumn('hostname');
  });

  console.log('✅ Dropped suspicious_accounts table');
  console.log('✅ Removed character_name and hostname columns from account_login_history');
}

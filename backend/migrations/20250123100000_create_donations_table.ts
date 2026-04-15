import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // create donations table
  await knex.schema.createTable('donations', (table) => {
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.string('kofi_message_id', 100).unique().notNullable().comment('ko-fi unique id, prevents duplicates');
    table.string('account_name', 50).nullable().comment('linked mud account (null if no email match)');
    table.string('kofi_email', 255).notNullable();
    table.string('kofi_name', 255).nullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 10).defaultTo('USD');
    table.string('type', 50).notNullable().comment('Donation, Subscription, Commission, Shop Order');
    table.text('message').nullable();
    table.boolean('is_public').defaultTo(false);
    table.boolean('is_subscription').defaultTo(false);
    table.boolean('is_first_subscription').defaultTo(false);
    table.string('tier_name', 100).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('account_name', 'idx_donations_account');
    table.index('kofi_email', 'idx_donations_email');
    table.index('created_at', 'idx_donations_created');
  });

  // add total_donated to accounts table
  const hasColumn = await knex.schema.hasColumn('accounts', 'total_donated');
  if (!hasColumn) {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
    await knex.schema.alterTable('accounts', (table) => {
      table.decimal('total_donated', 10, 2).defaultTo(0).comment('cumulative donation amount');
    });
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('donations');

  const hasColumn = await knex.schema.hasColumn('accounts', 'total_donated');
  if (hasColumn) {
    await knex.schema.alterTable('accounts', (table) => {
      table.dropColumn('total_donated');
    });
  }
}

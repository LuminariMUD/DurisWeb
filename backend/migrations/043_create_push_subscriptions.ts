import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable().index();
    table.text('endpoint').notNullable();
    table.string('p256dh', 255).notNullable();
    table.string('auth', 255).notNullable();
    table.string('user_agent', 500).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('last_used_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions');
}

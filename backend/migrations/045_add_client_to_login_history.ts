import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('account_login_history', (table) => {
    table.string('client', 50).nullable();
    table.string('client_version', 50).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('account_login_history', (table) => {
    table.dropColumn('client');
    table.dropColumn('client_version');
  });
}

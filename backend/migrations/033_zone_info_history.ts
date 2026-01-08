import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Zone info edit history table
  await knex.schema.createTable('builder_zone_info_history', (table) => {
    table.increments('id').primary();
    table.string('zone_id', 100).notNullable();
    table.string('account_name', 50).notNullable();
    table.string('field_changed', 50).notNullable(); // 'description', 'permission_grant', 'permission_revoke', 'permission_update'
    table.string('details', 255).nullable(); // Human-readable summary (e.g., "Granted edit to resakse")
    table.datetime('changed_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('zone_id', 'idx_history_zone');
    table.index('changed_at', 'idx_history_changed');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_zone_info_history');
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('builder_activity_log', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.string('action_type', 50).notNullable(); // 'room_create', 'room_update', 'room_delete', etc.
    table.string('zone_id', 100).notNullable(); // Zone filename (e.g., 'alatorin')
    table.string('zone_name', 255).nullable(); // Zone display name for quick display
    table.string('entity_type', 20).notNullable(); // 'room', 'mob', 'object', 'reset', 'zone'
    table.integer('entity_vnum').nullable(); // VNUM of edited entity (NULL for zone-level actions)
    table.string('entity_name', 255).nullable(); // Name/short_desc of entity (for display without lookup)
    table.string('ip_address', 45).nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());

    // Indexes for efficient queries
    table.index('account_name', 'idx_account');
    table.index('zone_id', 'idx_zone');
    table.index('entity_type', 'idx_entity_type');
    table.index('created_at', 'idx_created_at');
    table.index(['account_name', 'created_at'], 'idx_account_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_activity_log');
}

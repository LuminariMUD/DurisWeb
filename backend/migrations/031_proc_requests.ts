import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('builder_proc_requests', (table) => {
    table.increments('id').primary();
    table.string('zone_id', 100).notNullable();
    table.string('entity_type', 20).notNullable(); // 'mob', 'object', 'room'
    table.integer('vnum').notNullable();
    table.string('title', 255).notNullable();
    table.text('description').nullable(); // TipTap JSON content
    table.text('description_html').nullable();
    table.string('status', 20).notNullable().defaultTo('requested'); // 'requested', 'assigned', 'in_progress', 'completed'
    table.string('assigned_to', 50).nullable(); // Coder assigned to implement
    table.string('requested_by', 50).notNullable();
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('zone_id', 'idx_proc_zone');
    table.index('status', 'idx_proc_status');
    table.index('assigned_to', 'idx_proc_assigned');
    table.index('requested_by', 'idx_proc_requested_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_proc_requests');
}

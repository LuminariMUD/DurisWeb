import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Builder notifications table
  await knex.schema.createTable('builder_notifications', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.string('notification_type', 50).notNullable(); // 'comment_mention', 'proc_assigned', 'proc_status_change'
    table.string('zone_id', 100).notNullable();
    table.string('zone_name', 255).nullable();
    table.string('entity_type', 50).nullable(); // 'comment', 'proc_request'
    table.integer('entity_id').unsigned().nullable();
    table.string('triggered_by_account', 50).notNullable();
    table.text('message').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('read_at').nullable();

    // Indexes
    table.index(['account_name', 'is_read'], 'idx_notif_account_read');
    table.index('created_at', 'idx_notif_created');
  });

  // Builder mentions table (tracks @mentions)
  await knex.schema.createTable('builder_mentions', (table) => {
    table.increments('id').primary();
    table.string('entity_type', 50).notNullable(); // 'comment', 'proc_request'
    table.integer('entity_id').unsigned().notNullable();
    table.string('mentioned_account', 50).notNullable();
    table.string('mentioned_by_account', 50).notNullable();
    table.datetime('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['entity_type', 'entity_id'], 'idx_mention_entity');
    table.index('mentioned_account', 'idx_mention_mentioned');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_mentions');
  await knex.schema.dropTableIfExists('builder_notifications');
}

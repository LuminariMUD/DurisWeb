import type { Knex } from 'knex';

/** Website-owned delivery state; no MUD tables or existing history are modified. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('web_pvp_discord_destinations', (table) => {
    table.string('channel_id', 20).primary();
    table.bigInteger('boundary_event_id').unsigned().notNullable();
    table.dateTime('activated_at').notNullable();
    table.dateTime('available_at').notNullable();
    table.string('blocked_reason', 32).nullable();
  });
  await knex.schema.createTable('web_pvp_discord_deliveries', (table) => {
    table.string('channel_id', 20).notNullable();
    table.bigInteger('event_id').unsigned().notNullable();
    table.primary(['channel_id', 'event_id']);
    table.string('nonce', 24).notNullable();
    table.string('status', 16).notNullable().defaultTo('pending');
    table.integer('attempts').unsigned().notNullable().defaultTo(0);
    table.boolean('ambiguous').notNullable().defaultTo(false);
    table.dateTime('available_at').notNullable();
    table.dateTime('created_at').notNullable();
    table.dateTime('updated_at').notNullable();
    table.dateTime('delivered_at').nullable();
    table.string('delivered_by', 16).nullable();
    table.string('message_id', 20).nullable();
    table.string('error_code', 32).nullable();
    table.index(['channel_id', 'status', 'available_at'], 'idx_pvp_discord_ready');
    // No FK to MUD-owned rows. Manual receipts can precede first activation.
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('web_pvp_discord_deliveries');
  await knex.schema.dropTableIfExists('web_pvp_discord_destinations');
}

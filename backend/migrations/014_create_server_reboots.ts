import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if table already exists before creating
  const exists = await knex.schema.hasTable('server_reboots');
  if (!exists) {
    await knex.schema.createTable('server_reboots', (table) => {
      table.increments('id').primary();
      table.integer('boot_time').notNullable().comment('Unix timestamp when server started');
      table.integer('shutdown_time').nullable().comment('Unix timestamp when server shutdown (NULL if currently running)');
      table.integer('uptime_seconds').nullable().comment('Calculated uptime duration in seconds');
      table.string('shutdown_type', 50).defaultTo('unknown');
      table.string('initiated_by', 255).nullable().comment('Account name who triggered shutdown');
      table.text('reason').nullable().comment('Optional shutdown reason or message');
      table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

      // Indexes
      table.index('boot_time', 'idx_boot_time');
      table.index('created_at', 'idx_created_at');
      table.index('shutdown_type', 'idx_shutdown_type');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('server_reboots');
}

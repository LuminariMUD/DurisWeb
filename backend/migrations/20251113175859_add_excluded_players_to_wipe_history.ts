import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Check if table exists first
  const hasTable = await knex.schema.hasTable('wipe_history');

  if (!hasTable) {
    // Table doesn't exist, create it with all columns including excluded_players
    await knex.schema.createTable('wipe_history', (table) => {
      table.increments('id').primary();
      table.string('executed_by', 255).notNullable();
      table.timestamp('executed_at').defaultTo(knex.fn.now());
      table.text('reason').nullable();
      table.text('excluded_players').nullable().comment('JSON array of excluded player PIDs and names');
      table.text('tables_affected').nullable();
      table.integer('rows_affected').nullable();
      table.integer('duration_seconds').nullable();
      table.boolean('success').defaultTo(true);
      table.text('error_message').nullable();
      table.string('backup_path', 500).nullable();
      table.string('ip_address', 45).nullable();

      table.index('executed_at');
      table.index('executed_by');
    });
  } else {
    // Table exists, add column if it doesn't exist
    const hasColumn = await knex.schema.hasColumn('wipe_history', 'excluded_players');
    if (!hasColumn) {
      await knex.schema.alterTable('wipe_history', (table) => {
        table.text('excluded_players').after('reason').comment('JSON array of excluded player PIDs and names');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('wipe_history');
  if (hasTable) {
    await knex.schema.alterTable('wipe_history', (table) => {
      table.dropColumn('excluded_players');
    });
  }
}


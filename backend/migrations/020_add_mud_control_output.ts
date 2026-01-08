import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add output column to store stdout/stderr from MUD control operations
  await knex.schema.alterTable('mud_control_log', (table) => {
    table.text('output').nullable().after('dms_pid');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('mud_control_log', (table) => {
    table.dropColumn('output');
  });
}

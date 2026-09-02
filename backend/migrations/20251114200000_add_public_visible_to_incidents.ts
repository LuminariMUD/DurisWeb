import type { Knex } from 'knex';

/** Add the public visibility flag when the incident table exists. */
export async function up(knex: Knex): Promise<void> {
  // Check if server_incidents table exists
  const hasTable = await knex.schema.hasTable('server_incidents');

  if (!hasTable) {
    console.log('server_incidents table does not exist, skipping migration');
    return;
  }

  // Check if public_visible column already exists
  const hasColumn = await knex.schema.hasColumn('server_incidents', 'public_visible');

  if (!hasColumn) {
    // Add public_visible column to server_incidents table
    await knex.schema.alterTable('server_incidents', (table) => {
      table.boolean('public_visible').defaultTo(false).notNullable().comment('Whether incident is visible on public status page');
    });

    console.log('Added public_visible column to server_incidents (default: false)');
  } else {
    console.log('public_visible column already exists, skipping');
  }
}

/** Remove the public visibility flag when present. */
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('server_incidents'))) {
    return;
  }
  if (!(await knex.schema.hasColumn('server_incidents', 'public_visible'))) {
    return;
  }

  // Remove public_visible column
  await knex.schema.alterTable('server_incidents', (table) => {
    table.dropColumn('public_visible');
  });

  console.log('Removed public_visible column from server_incidents');
}

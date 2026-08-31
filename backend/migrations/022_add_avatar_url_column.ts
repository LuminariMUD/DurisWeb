import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if column exists before adding
  const hasColumn = await knex.schema.hasColumn('user_profiles', 'avatar_url');

  if (!hasColumn) {
    await knex.schema.alterTable('user_profiles', (table) => {
      table.string('avatar_url', 255).nullable().after('bio');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user_profiles', 'avatar_url');

  if (hasColumn) {
    await knex.schema.alterTable('user_profiles', (table) => {
      table.dropColumn('avatar_url');
    });
  }
}

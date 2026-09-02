import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('player_items'))) {
    return;
  }
  if (await knex.schema.hasColumn('player_items', 'created_at')) {
    return;
  }

  await knex.raw(`
    ALTER TABLE player_items
    ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('player_items'))) {
    return;
  }
  if (!(await knex.schema.hasColumn('player_items', 'created_at'))) {
    return;
  }

  await knex.raw(`
    ALTER TABLE player_items
    DROP COLUMN created_at
  `);
}

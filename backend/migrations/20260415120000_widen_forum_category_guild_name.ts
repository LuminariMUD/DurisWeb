import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('forum_categories', (t) => {
    t.string('name', 255).notNullable().alter();
    t.string('guild_name', 255).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('forum_categories', (t) => {
    t.string('name', 100).notNullable().alter();
    t.string('guild_name', 50).nullable().alter();
  });
}

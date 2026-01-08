import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pvp_battle_comments', (table) => {
    table.text('quoted_text').nullable();
    table.integer('line_number').nullable();
    table.integer('participant_id').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pvp_battle_comments', (table) => {
    table.dropColumn('quoted_text');
    table.dropColumn('line_number');
    table.dropColumn('participant_id');
  });
}

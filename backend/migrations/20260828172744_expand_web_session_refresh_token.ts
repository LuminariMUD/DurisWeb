import type { Knex } from 'knex';

const REFRESH_TOKEN_LENGTH = 512;
const LEGACY_REFRESH_TOKEN_LENGTH = 255;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('web_sessions'))) {
    return;
  }

  await knex.schema.alterTable('web_sessions', (table) => {
    table.string('refresh_token', REFRESH_TOKEN_LENGTH).notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('web_sessions'))) {
    return;
  }

  await knex.schema.alterTable('web_sessions', (table) => {
    table.string('refresh_token', LEGACY_REFRESH_TOKEN_LENGTH).notNullable().alter();
  });
}

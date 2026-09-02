import type { Knex } from 'knex';

/** Add the browser MUD hostname only when an operator has not staged one. */
export async function up(knex: Knex): Promise<void> {
  const existing = await knex('web_settings').where('setting_key', 'mud_ws_host').first();
  if (existing) return;

  await knex('web_settings').insert({
    setting_key: 'mud_ws_host',
    setting_value: 'ws.duris.sbs',
    description: 'Public hostname used by the browser-based MUD client',
  });
}

/**
 * Preserve the hostname on rollback because the migration cannot distinguish
 * its default row from configuration that existed before up() ran.
 */
export async function down(_knex: Knex): Promise<void> {
  // Configuration data is intentionally retained.
}

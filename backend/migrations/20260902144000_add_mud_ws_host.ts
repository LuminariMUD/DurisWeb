import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const existing = await knex('web_settings').where('setting_key', 'mud_ws_host').first();
  if (existing) return;

  await knex('web_settings').insert({
    setting_key: 'mud_ws_host',
    setting_value: 'ws.duris.sbs',
    description: 'Public hostname used by the browser-based MUD client',
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('web_settings').where('setting_key', 'mud_ws_host').delete();
}

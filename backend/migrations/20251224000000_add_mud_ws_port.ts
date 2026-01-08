import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add mud_ws_port setting for WebSocket connection
  await knex('web_settings').insert({
    setting_key: 'mud_ws_port',
    setting_value: '4050',
    description: 'MUD WebSocket port for web client connection',
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('web_settings').where('setting_key', 'mud_ws_port').delete();
}

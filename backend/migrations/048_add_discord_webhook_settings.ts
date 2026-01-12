import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('web_settings').insert([
    {
      setting_key: 'discord_webhook_url',
      setting_value: '',
      description: 'discord webhook url for pvp battle notifications',
    },
    {
      setting_key: 'discord_webhook_enabled',
      setting_value: 'false',
      description: 'enable/disable auto-posting battles to discord',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('web_settings')
    .whereIn('setting_key', ['discord_webhook_url', 'discord_webhook_enabled'])
    .delete();
}

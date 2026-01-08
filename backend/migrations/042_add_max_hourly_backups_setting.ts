import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add max_hourly_backups setting
  await knex('web_settings').insert({
    setting_key: 'max_hourly_backups',
    setting_value: '24',
    description: 'Maximum number of hourly backups to keep (1-168)',
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('web_settings')
    .where('setting_key', 'max_hourly_backups')
    .delete();
}

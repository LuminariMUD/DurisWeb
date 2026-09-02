import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Web settings table for site configuration
  await knex.schema.createTable('web_settings', (table) => {
    table.string('setting_key', 100).primary();
    table.text('setting_value').notNullable();
    table.string('description', 500).nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('updated_by', 50).nullable();
  });

  // Insert default values
  await knex('web_settings').insert([
    {
      setting_key: 'pvp_delay_minutes',
      setting_value: '15',
      description: 'Minutes to delay PvP logs from appearing publicly',
    },
    {
      setting_key: 'mud_host',
      setting_value: 'mud.duris.sbs',
      description: 'MUD server hostname displayed on the website',
    },
    {
      setting_key: 'mud_port',
      setting_value: '7777',
      description: 'MUD server port displayed on the website',
    },
    {
      setting_key: 'mud_port_tls',
      setting_value: '4001',
      description: 'Optional direct TLS MUD port displayed on the website',
    },
    {
      setting_key: 'site_title',
      setting_value: 'NewDuris',
      description: 'Website title shown in navbar and browser tab',
    },
    {
      setting_key: 'site_logo_url',
      setting_value: '',
      description: 'URL to website logo (uploaded to R2)',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('web_settings');
}

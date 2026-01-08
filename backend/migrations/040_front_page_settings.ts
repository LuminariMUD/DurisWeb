import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Alter setting_value to MEDIUMTEXT for larger content (front page HTML)
  await knex.raw(`
    ALTER TABLE web_settings
    MODIFY COLUMN setting_value MEDIUMTEXT NOT NULL
  `);

  // Insert front page settings
  await knex('web_settings').insert([
    {
      setting_key: 'front_page_hero_enabled',
      setting_value: 'true',
      description: 'Show hero banner on front page',
    },
    {
      setting_key: 'front_page_hero_title',
      setting_value: 'Welcome to DurisMUD',
      description: 'Hero banner main title',
    },
    {
      setting_key: 'front_page_hero_subtitle',
      setting_value: 'The Premier PvP MUD Since 1994',
      description: 'Hero banner subtitle text',
    },
    {
      setting_key: 'front_page_hero_image_url',
      setting_value: '',
      description: 'Hero banner background image URL (uploaded to R2)',
    },
    {
      setting_key: 'front_page_content',
      setting_value: '<p>Welcome to the official DurisMUD website. Edit this content in Web Settings.</p>',
      description: 'Front page main content (TipTap HTML)',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  // Delete front page settings
  await knex('web_settings')
    .whereIn('setting_key', [
      'front_page_hero_enabled',
      'front_page_hero_title',
      'front_page_hero_subtitle',
      'front_page_hero_image_url',
      'front_page_content',
    ])
    .delete();

  // Revert to TEXT (note: this may truncate data if any setting is > 64KB)
  await knex.raw(`
    ALTER TABLE web_settings
    MODIFY COLUMN setting_value TEXT NOT NULL
  `);
}

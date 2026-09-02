import type { Knex } from 'knex';

const REQUIRED_WEB_SETTINGS = [
  ['pvp_delay_minutes', '15', 'Minutes to delay PvP logs from appearing publicly'],
  ['mud_host', 'mud.duris.sbs', 'MUD server hostname displayed on the website'],
  ['mud_port', '7777', 'MUD server port displayed on the website'],
  ['mud_port_tls', '4001', 'Optional direct TLS MUD port displayed on the website'],
  ['mud_ws_url', 'wss://ws.duris.sbs', 'Complete public browser MUD WebSocket URL'],
  ['site_title', 'NewDuris', 'Website title shown in navigation and browser metadata'],
  ['site_logo_url', '', 'URL to the website logo'],
  ['support_url', 'https://ko-fi.com/newduris', 'Public support or donation page URL'],
  ['front_page_hero_enabled', 'true', 'Show the hero banner on the front page'],
  ['front_page_hero_title', 'Welcome to DurisMUD', 'Hero banner main title'],
  [
    'front_page_hero_subtitle',
    'The Premier PvP MUD Since 1994',
    'Hero banner subtitle text',
  ],
  ['front_page_hero_image_url', '', 'Hero banner background image URL'],
  [
    'front_page_content',
    '<p>Welcome to the official DurisMUD website. Edit this content in Web Settings.</p>',
    'Front page main content',
  ],
  ['max_hourly_backups', '24', 'Maximum hourly backups to retain'],
  ['respect_webinfo_toggle', 'true', 'Honor each player web visibility preference'],
  ['discord_webhook_url', '', 'Discord webhook URL for PvP notifications'],
  ['discord_webhook_enabled', 'false', 'Enable Discord PvP notifications'],
] as const;

/** Provision every row required by the strict application configuration loader. */
export async function up(knex: Knex): Promise<void> {
  await knex('web_settings')
    .insert(
      REQUIRED_WEB_SETTINGS.map(([settingKey, settingValue, description]) => ({
        setting_key: settingKey,
        setting_value: settingValue,
        description,
      })),
    )
    .onConflict('setting_key')
    .ignore();
}

/** Configuration rows are operator-owned after provisioning and survive rollback. */
export async function down(_knex: Knex): Promise<void> {
  // Configuration data is intentionally retained.
}

import { describe, expect, it } from '@jest/globals';

import { parseWebSettingsRows, WebSettingsConfigurationError } from '../webSettingsService.js';

function validRows(): Array<{ setting_key: string; setting_value: string }> {
  return [
    ['pvp_delay_minutes', '15'],
    ['mud_host', 'mud.example.invalid'],
    ['mud_port', '7777'],
    ['mud_port_tls', '4001'],
    ['mud_ws_url', 'wss://ws.example.invalid/mud'],
    ['site_title', 'Example MUD'],
    ['site_logo_url', ''],
    ['support_url', 'https://support.example.invalid'],
    ['front_page_hero_enabled', 'true'],
    ['front_page_hero_title', 'Welcome'],
    ['front_page_hero_subtitle', 'Enter the realm'],
    ['front_page_hero_image_url', ''],
    ['front_page_content', '<p>Configured content</p>'],
    ['max_hourly_backups', '24'],
    ['respect_webinfo_toggle', 'true'],
    ['discord_webhook_url', ''],
    ['discord_webhook_enabled', 'false'],
  ].map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
}

describe('database-backed site configuration', () => {
  it('maps a complete row set without application defaults', () => {
    const settings = parseWebSettingsRows(validRows());

    expect(settings).toMatchObject({
      pvpDelayMinutes: 15,
      mudHost: 'mud.example.invalid',
      mudWsUrl: 'wss://ws.example.invalid/mud',
      siteTitle: 'Example MUD',
      frontPageHeroEnabled: true,
      respectWebinfoToggle: true,
    });
  });

  it('reports missing and invalid rows together', () => {
    const rows = validRows().filter((row) => row.setting_key !== 'site_title');
    const mudPort = rows.find((row) => row.setting_key === 'mud_port');
    if (mudPort) mudPort.setting_value = '70000';

    expect(() => parseWebSettingsRows(rows)).toThrow(WebSettingsConfigurationError);
    try {
      parseWebSettingsRows(rows);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('site_title is missing');
      expect(message).toContain('mud_port must be an integer between 1 and 65535');
    }
  });

  it('requires a webhook URL only when Discord delivery is enabled', () => {
    const rows = validRows();
    const enabled = rows.find((row) => row.setting_key === 'discord_webhook_enabled');
    if (enabled) enabled.setting_value = 'true';

    expect(() => parseWebSettingsRows(rows)).toThrow(/discord_webhook_url is required/);
  });
});

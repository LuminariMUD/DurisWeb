import { afterAll, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../db/connection.js';

import {
  parseWebSettingsRows,
  getWebSettingsRaw,
  updateWebSetting,
  WebSettingsConfigurationError,
} from '../webSettingsService.js';

const nativePort = Number(process.env.TEST_HOOK_AUDIT_DB_PORT);
if (
  nativePort &&
  (![23436, 23437].includes(nativePort) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    !process.env.DB_NAME?.startsWith('durisweb_qualification_'))
)
  throw new Error('Settings timestamp qualification requires the dedicated disposable fixture');
afterAll(async () => {
  await pool.end();
});

/** Builds the complete authoritative row set used by focused validation cases. */
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
    ['discord_webhook_enabled', 'false'],
  ].map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
}

describe('database-backed site configuration', () => {
  if (nativePort)
    it('returns the stored instant in UTC across a database offset and preserves unknown timestamps', async () => {
      const key = `timestamp_test_${crypto.randomBytes(8).toString('hex')}`;
      const unknown = `${key}_unknown`;
      const epoch = Date.UTC(2026, 2, 27, 1, 2, 3) / 1000;
      await pool.query(
        "INSERT INTO web_settings (setting_key,setting_value,updated_at) VALUES (?,'fixture',FROM_UNIXTIME(?)),(?,'fixture',NULL)",
        [key, epoch, unknown],
      );
      const connection = await pool.getConnection();
      const [before] = await connection.query<RowDataPacket[]>('SELECT @@time_zone AS zone');
      const query = jest
        .spyOn(pool, 'query')
        .mockImplementation(connection.query.bind(connection) as typeof pool.query);
      try {
        await connection.query("SET time_zone='+03:00'");
        const rows = await getWebSettingsRaw();
        expect(rows.find(({ setting_key }) => setting_key === key)?.updated_at).toBe(
          new Date(epoch * 1000).toISOString(),
        );
        expect(rows.find(({ setting_key }) => setting_key === unknown)?.updated_at).toBeNull();
      } finally {
        query.mockRestore();
        try {
          await connection.query('SET time_zone=?', [String(before[0].zone)]);
          connection.release();
        } catch {
          connection.destroy();
        }
        await pool.query('DELETE FROM web_settings WHERE setting_key IN (?,?)', [key, unknown]);
      }
    });
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

  it('accepts automatic bot posting without a legacy webhook URL', () => {
    const rows = validRows();
    const enabled = rows.find((row) => row.setting_key === 'discord_webhook_enabled');
    if (enabled) enabled.setting_value = 'true';

    expect(parseWebSettingsRows(rows).discordAutoPostEnabled).toBe(true);
  });

  it('rejects plaintext and fragmented browser WebSocket URLs', async () => {
    for (const value of ['ws://127.0.0.1:4050', 'wss://ws.example.invalid/mud#fragment']) {
      const rows = validRows();
      const mudWebSocketUrl = rows.find((row) => row.setting_key === 'mud_ws_url');
      if (mudWebSocketUrl) mudWebSocketUrl.setting_value = value;

      expect(() => parseWebSettingsRows(rows)).toThrow(/mud_ws_url/);
      await expect(updateWebSetting('mud_ws_url', value, 'tester')).rejects.toThrow(/mud_ws_url/);
    }
  });

  it.each(['4001junk', '12.5', ' 4001'])(
    'rejects a partial MUD port value before upsert: %s',
    async (value) => {
      await expect(updateWebSetting('mud_port', value, 'tester')).rejects.toThrow(
        /MUD port must be between 1 and 65535/,
      );
    },
  );

  it('rejects credentials in public support URLs', async () => {
    const rows = validRows();
    const supportUrl = rows.find((row) => row.setting_key === 'support_url');
    if (supportUrl) supportUrl.setting_value = 'https://user:secret@support.example.invalid';

    expect(() => parseWebSettingsRows(rows)).toThrow(/support_url must not contain credentials/);
    await expect(
      updateWebSetting('support_url', 'https://user:secret@support.example.invalid', 'tester'),
    ).rejects.toThrow(/Support URL/);
  });
});

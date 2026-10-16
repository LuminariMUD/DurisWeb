import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getWebSetting = jest.fn<(key: string) => Promise<string | null>>();
const configuration: {
  siteUrl: string;
  discordBot?: { token: string; channelId: string };
} = { siteUrl: 'https://site.example.invalid' };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSetting }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => configuration,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: logger }));
const service = await import('../discordService.js');

let now = Date.now();
beforeEach(() => {
  jest.clearAllMocks();
  configuration.discordBot = { token: 'private-test-token', channelId: '123456789012345678' };
  now += 1000;
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  query.mockResolvedValue([
    [
      {
        id: 4,
        stamp: '2026-10-16T12:00:00Z',
        room_name: 'Battle Room',
        player_description: 'Pil',
        pk_type: 'KILLER',
        leader: 1,
      },
      {
        id: 4,
        player_description: '[56 Warrior] Victim (Human)',
        pk_type: 'VICTIM',
        leader: 0,
      },
    ],
  ]);
  getWebSetting.mockResolvedValue('false');
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Discord bot battle delivery', () => {
  it('posts the manual battle with POV links while automatic posting is disabled', async () => {
    expect(await service.manualPostBattle(4)).toEqual({ success: true });
    expect(query).toHaveBeenCalledWith(expect.any(String), [4]);
    expect(fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/123456789012345678/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bot private-test-token',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    const init = jest.mocked(fetch).mock.calls[0][1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0]).toMatchObject({
      title: '⚔️ PvP Battle at Battle Room',
      url: 'https://site.example.invalid/pvp/4',
    });
    expect(payload.embeds[0].fields[0].value).toContain('/pvp/4?pov=Pil');
    expect(payload.embeds[0].fields[1].value).toContain('/pvp/4?pov=Victim');
    expect(getWebSetting).not.toHaveBeenCalled();
  });

  it('gates automatic posts on the existing setting and bot configuration', async () => {
    expect(await service.isDiscordEnabled()).toBe(false);
    getWebSetting.mockResolvedValue('true');
    expect(await service.isDiscordEnabled()).toBe(true);
    configuration.discordBot = undefined;
    expect(await service.isDiscordEnabled()).toBe(false);
    expect(getWebSetting).toHaveBeenCalledWith('discord_webhook_enabled');
  });

  it('uses the bot for automatic battle delivery', async () => {
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/123456789012345678/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('tests the configured bot without accepting a destination from the browser', async () => {
    expect(await service.testDiscordBot()).toEqual({ success: true });
    expect(String(jest.mocked(fetch).mock.calls[0][1]?.body)).toContain(
      'Discord bot is working correctly!',
    );
  });

  it('refuses delivery without bot configuration', async () => {
    configuration.discordBot = undefined;
    expect(await service.manualPostBattle(4)).toEqual({
      success: false,
      error: 'Discord bot is not configured',
    });
    expect(await service.testDiscordBot()).toMatchObject({ success: false });
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send a nonexistent battle', async () => {
    query.mockResolvedValue([[]]);
    expect(await service.manualPostBattle(999)).toEqual({
      success: false,
      error: 'battle not found',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])(
    'reports Discord HTTP %s as failure without retrying',
    async (status) => {
      jest.mocked(fetch).mockResolvedValue(new Response('private response', { status }));
      expect(await service.manualPostBattle(4)).toMatchObject({ success: false });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    },
  );

  it('handles network failures without logging credentials', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error('private-test-token'));
    expect(await service.manualPostBattle(4)).toMatchObject({ success: false });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-test-token');
  });
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getWebSetting = jest.fn<(key: string) => Promise<string | null>>();
const configuration: {
  siteUrl: string;
  discordBot?: { token: string; channelId: string };
} = { siteUrl: 'https://site.example.invalid' };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../webSettingsService.js', () => ({
  getWebSetting,
  getWebSettings: async () => ({ pvpDelayMinutes: 15 }),
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => configuration,
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: logger }));
const service = await import('../discordService.js');

let now = Date.now();
beforeEach(() => {
  jest.clearAllMocks();
  configuration.discordBot = { token: 'private-test-token', channelId: '123456789012345678' };
  now += 86_400_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('{"id":"987654321012345678"}', { status: 200 }));
  query.mockResolvedValue([
    [
      {
        id: 4,
        stamp_epoch: Date.parse('2026-10-16T12:00:00Z') / 1000,
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
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.stamp <= DATE_SUB(NOW(), INTERVAL ? MINUTE)'),
      [4, 15],
    );
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
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'delivered',
      messageId: '987654321012345678',
    });
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
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'failed',
      code: 'not_configured',
    });
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

  it('uses the persisted nonce for retries and leaves manual reposts independent', async () => {
    const identity = { channelId: '123456789012345678', nonce: 'pvp_delivery_4' };
    await service.postBattleToDiscord(4, '2026-10-16', 'Room', [], identity);
    const payload = JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload).toMatchObject({ nonce: identity.nonce, enforce_nonce: true });
    now += 1000;
    await service.manualPostBattle(4);
    const manualPayload = JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body));
    expect(manualPayload).not.toHaveProperty('nonce');
    expect(manualPayload).not.toHaveProperty('enforce_nonce');
  });

  it('refuses a queued delivery when the configured destination has changed', async () => {
    expect(
      await service.postBattleToDiscord(4, '2026-10-16', 'Room', [], {
        channelId: '999999999999999999',
        nonce: 'pvp_delivery_4',
      }),
    ).toEqual({ status: 'failed', code: 'destination_changed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'invalid_payload'],
  ])('classifies HTTP %s as requiring operator action', async (status, code) => {
    jest.mocked(fetch).mockResolvedValue(new Response('private-test-token', { status }));
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'failed',
      code,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(`[Discord] battle 4: ${code}`);
    expect(JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls])).not.toContain(
      'private-test-token',
    );
  });

  it.each([500, 502, 503, 408])('retains HTTP %s as an uncertain retry', async (status) => {
    jest.mocked(fetch).mockResolvedValue(new Response('{}', { status }));
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'retry',
      code: 'server_error',
      retryAfterMs: 30_000,
      ambiguous: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors fractional body/header rate limits and blocks subsequent sends until the deadline', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue(
        new Response('{"retry_after":64.57}', { status: 429, headers: { 'Retry-After': '65' } }),
      );
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'retry',
      code: 'rate_limited',
      retryAfterMs: 65_000,
      ambiguous: false,
    });
    now += 1000;
    expect(await service.postBattleToDiscord(5, '2026-10-16', 'Room', [])).toMatchObject({
      status: 'retry',
      code: 'rate_limited',
      retryAfterMs: 64_000,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 64_000;
    jest.mocked(fetch).mockResolvedValue(new Response('{"id":"123"}', { status: 200 }));
    expect(await service.postBattleToDiscord(5, '2026-10-16', 'Room', [])).toMatchObject({
      status: 'delivered',
      messageId: '123',
    });
  });

  it.each(['{}', '{"retry_after":-1}', '{"retry_after":"invalid"}'])(
    'uses a bounded fallback for invalid rate-limit metadata %s',
    async (body) => {
      jest.mocked(fetch).mockResolvedValue(new Response(body, { status: 429 }));
      expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toMatchObject({
        status: 'retry',
        code: 'rate_limited',
        retryAfterMs: 60_000,
        ambiguous: false,
      });
    },
  );

  it('treats a lost or malformed success response as ambiguous, never confirmed', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toEqual({
      status: 'retry',
      code: 'invalid_response',
      retryAfterMs: 30_000,
      ambiguous: true,
    });
    now += 1000;
    jest.mocked(fetch).mockRejectedValue(new Error('private-test-token'));
    expect(await service.postBattleToDiscord(4, '2026-10-16', 'Room', [])).toMatchObject({
      status: 'retry',
      code: 'network_error',
      ambiguous: true,
    });
    expect(JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls])).not.toContain(
      'private-test-token',
    );
  });

  it('does not overlap slow requests and releases the guard after a failure', async () => {
    let reject!: (reason: Error) => void;
    jest.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const first = service.postBattleToDiscord(4, '2026-10-16', 'Room', []);
    expect(await service.postBattleToDiscord(5, '2026-10-16', 'Room', [])).toMatchObject({
      status: 'retry',
      code: 'busy',
      ambiguous: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    reject(new Error('timeout'));
    await expect(first).resolves.toMatchObject({ status: 'retry', code: 'network_error' });
    now += 1000;
    expect(await service.postBattleToDiscord(5, '2026-10-16', 'Room', [])).toMatchObject({
      status: 'delivered',
    });
  });
});

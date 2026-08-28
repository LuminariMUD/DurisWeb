import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));

describe('zone info HTML persistence boundary', () => {
  let zoneInfoService: typeof import('../zoneInfoService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    zoneInfoService = await import('../zoneInfoService.js');
  });

  it('sanitizes description HTML before upsert reaches SQL', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 42 }])
      .mockResolvedValueOnce([[
        {
          id: 42,
          zone_id: 'zone-a',
          description: 'hello',
          description_html: '<p>hello</p>',
          owner_account: 'Cwial',
          created_at: '2026-08-28T00:00:00.000Z',
          updated_at: '2026-08-28T00:00:00.000Z',
        },
      ]]);

    await zoneInfoService.upsertZoneInfo('zone-a', {
      description: 'hello',
      descriptionHtml: '<p>hello</p><script>alert(1)</script>',
    }, 'Cwial');

    const params = query.mock.calls[1][1] as unknown[];
    expect(params[2]).toBe('<p>hello</p>');
    expect(String(params[2])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only description HTML before any query', async () => {
    await expect(
      zoneInfoService.upsertZoneInfo('zone-a', {
        description: 'hello',
        descriptionHtml: '<script>alert(1)</script>',
      }, 'Cwial')
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

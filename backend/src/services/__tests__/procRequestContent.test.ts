import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));
const extractMentions = jest.fn(() => []);
const createMentions = jest.fn();
const deleteMentions = jest.fn();
const createNotification = jest.fn();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../builderNotificationService.js', () => ({
  extractMentions,
  createMentions,
  deleteMentions,
  createNotification,
}));

describe('proc request HTML persistence boundary', () => {
  let procRequestService: typeof import('../procRequestService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    procRequestService = await import('../procRequestService.js');
  });

  it('sanitizes description HTML before create reaches SQL', async () => {
    query
      .mockResolvedValueOnce([{ insertId: 42 }])
      .mockResolvedValueOnce([[
        {
          id: 42,
          zone_id: 'zone-a',
          entity_type: 'room',
          vnum: 100,
          title: 'Add room behavior',
          description: 'hello',
          description_html: '<p>hello</p>',
          status: 'requested',
          assigned_to: null,
          requested_by: 'Cwial',
          requested_at: '2026-08-28T00:00:00.000Z',
          updated_at: '2026-08-28T00:00:00.000Z',
        },
      ]]);

    await procRequestService.createProcRequest({
      zoneId: 'zone-a',
      entityType: 'room',
      vnum: 100,
      title: 'Add room behavior',
      description: 'hello',
      descriptionHtml: '<p>hello</p><script>alert(1)</script>',
    }, 'Cwial');

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe('<p>hello</p>');
    expect(String(params[5])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only description HTML before any query', async () => {
    await expect(
      procRequestService.createProcRequest({
        zoneId: 'zone-a',
        entityType: 'room',
        vnum: 100,
        title: 'Rejected',
        description: 'hello',
        descriptionHtml: '<script>alert(1)</script>',
      }, 'Cwial')
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));
const extractMentions = jest.fn(() => []);
const createMentions = jest.fn();
const deleteMentions = jest.fn();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../builderNotificationService.js', () => ({
  extractMentions,
  createMentions,
  deleteMentions,
}));

describe('zone comment HTML persistence boundary', () => {
  let zoneCommentService: typeof import('../zoneCommentService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    zoneCommentService = await import('../zoneCommentService.js');
  });

  it('sanitizes comment HTML before create reaches SQL', async () => {
    query
      .mockResolvedValueOnce([{ insertId: 42 }])
      .mockResolvedValueOnce([[
        {
          id: 42,
          zone_id: 'zone-a',
          parent_id: null,
          proc_request_id: null,
          account_name: 'Cwial',
          character_name: null,
          content: 'hello',
          content_html: '<p>hello</p>',
          created_at: '2026-08-28T00:00:00.000Z',
          updated_at: '2026-08-28T00:00:00.000Z',
        },
      ]]);

    await zoneCommentService.createComment({
      zoneId: 'zone-a',
      content: 'hello',
      contentHtml: '<p>hello</p><script>alert(1)</script>',
    }, 'Cwial');

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[6]).toBe('<p>hello</p>');
    expect(String(params[6])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only comment HTML before any query', async () => {
    await expect(
      zoneCommentService.createComment({
        zoneId: 'zone-a',
        content: 'hello',
        contentHtml: '<script>alert(1)</script>',
      }, 'Cwial')
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

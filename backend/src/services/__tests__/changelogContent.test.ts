import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<any> => Promise.resolve([]));

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({
  createNotification: jest.fn(),
}));

describe('changelog content persistence boundary', () => {
  let changelogService: typeof import('../changelogService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    changelogService = await import('../changelogService.js');
  });

  it('sanitizes executable markup before create reaches SQL', async () => {
    query.mockResolvedValueOnce([{ insertId: 42 }]);

    await changelogService.createChangelogEntry({
      version: '1.0.0',
      title: 'Safe release',
      content: '<p>hello</p><script>alert(1)</script>',
      category: 'public',
      createdBy: 'Cwial',
    });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe('<p>hello</p>');
    expect(String(params[2])).not.toMatch(/<script|alert\(/i);
  });

  it('rejects script-only content before create reaches SQL', async () => {
    await expect(
      changelogService.createChangelogEntry({
        version: '1.0.0',
        title: 'Rejected release',
        content: '<script>alert(1)</script>',
        category: 'public',
        createdBy: 'Cwial',
      })
    ).rejects.toThrow('Content cannot be empty after sanitization');

    expect(query).not.toHaveBeenCalled();
  });
});

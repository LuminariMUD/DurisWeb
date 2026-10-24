import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<unknown> => Promise.resolve([[]]));

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({
  createNotification: jest.fn(),
}));

describe('changelog detail visibility', () => {
  let changelogService: typeof import('../changelogService.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    changelogService = await import('../changelogService.js');
  });

  it('filters unpublished and admin entries for the default reader', async () => {
    query.mockResolvedValueOnce([[]]);

    await changelogService.getChangelogEntry(42);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('is_published = TRUE');
    expect(sql).toContain("category = 'public'");
  });

  it('allows the explicit admin lookup used by protected update flows', async () => {
    query.mockResolvedValueOnce([[]]);

    await (changelogService.getChangelogEntry as any)(42, undefined, true);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).not.toContain('is_published = TRUE');
    expect(sql).not.toContain("category = 'public'");
  });

  it('bounds service-level public/admin list calls before computing SQL offsets', async () => {
    query.mockResolvedValue([[{ total: 0 }]]);
    await changelogService.getChangelogEntries({
      page: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('LIMIT ? OFFSET ?'),
      [100, 999900],
    );
    query.mockClear();
    await changelogService.getAllChangelogEntriesForAdmin(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('LIMIT ? OFFSET ?'),
      [100, 999900],
    );
  });
});

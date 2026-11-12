import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn((..._args: unknown[]): Promise<unknown> => Promise.resolve([[]]));

jest.unstable_mockModule('../../../db/connection.js', () => ({
  pool: { query },
}));
const createNotification = jest.fn(async (..._args: unknown[]) => undefined);
jest.unstable_mockModule('../../../services/unifiedNotificationService.js', () => ({
  createNotification,
}));

describe('changelog detail visibility', () => {
  let changelogService: typeof import('../service.js');

  beforeEach(async () => {
    jest.clearAllMocks();
    changelogService = await import('../service.js');
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

  it('counts only public entries when a non-admin marks everything read', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await changelogService.markAllAsRead('mortal');
    expect(String(query.mock.calls[0][0])).toContain("category = 'public'");

    query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await changelogService.markAllAsRead('staff', true);
    expect(String(query.mock.calls[1][0])).not.toContain("category = 'public'");
  });

  it('reports a publish only when this call flipped is_published', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(
      changelogService.updateChangelogEntry(42, {
        title: 'Release',
        isPublished: true,
      }),
    ).resolves.toEqual({ found: true, published: true });
    expect(String(query.mock.calls[0][0])).not.toContain('is_published');
    expect(String(query.mock.calls[1][0])).toContain('WHERE id = ? AND is_published = FALSE');

    // A concurrent second publisher matches the row but not the unpublished condition.
    query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(changelogService.updateChangelogEntry(42, { isPublished: true })).resolves.toEqual(
      { found: true, published: false },
    );

    query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(changelogService.updateChangelogEntry(7, { isPublished: true })).resolves.toEqual({
      found: false,
      published: false,
    });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('never sends an admin entry to the login-history audience', async () => {
    await changelogService.notifyChangelogPublished(7, '1.2.3', 'Staff-only note', 'admin');
    expect(query).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('keeps notifying the remaining accounts after one public notification fails', async () => {
    query.mockResolvedValueOnce([[{ account_name: 'a' }, { account_name: 'b' }]]);
    createNotification.mockRejectedValueOnce(new Error('insert failed'));
    await changelogService.notifyChangelogPublished(8, '1.2.4', 'Public note', 'public');
    expect(
      createNotification.mock.calls.map(([n]) => (n as { accountName: string }).accountName),
    ).toEqual(['a', 'b']);
  });
});

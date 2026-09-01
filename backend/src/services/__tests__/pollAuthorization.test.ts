import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getConnection = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const categoryAccess = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const connection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, getConnection },
}));
jest.unstable_mockModule('../categoryService.js', () => ({
  getCategoryAccessForAccount: categoryAccess,
}));

const pollService = await import('../pollService.js');

const permissions = {
  accountName: 'Cwial',
  role: 'player',
  immortalLevel: null,
  maxLevel: 56,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: [],
};

describe('poll service authorization', () => {
  beforeEach(() => {
    query.mockReset();
    getConnection.mockReset();
    categoryAccess.mockReset();
    connection.beginTransaction.mockReset();
    connection.query.mockReset();
    connection.commit.mockReset();
    connection.rollback.mockReset();
    connection.release.mockReset();
    getConnection.mockResolvedValue(connection);
    categoryAccess.mockResolvedValue({ canView: false, canPost: false, canModerate: false });
  });

  it('does not read poll details from a hidden category', async () => {
    query.mockResolvedValueOnce([[{ category_id: 7, is_deleted: 0 }]]);

    await expect(
      pollService.getPollByThreadId(44, 'Cwial', permissions as never),
    ).resolves.toBeNull();
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('does not resolve a poll ID whose parent thread is deleted', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 9,
          thread_id: 44,
          category_id: 7,
          thread_deleted: 1,
        },
      ],
    ]);

    await expect(pollService.getPollById(9, permissions as never)).resolves.toBeNull();
    expect(categoryAccess).not.toHaveBeenCalled();
  });

  it('rejects a vote before opening a mutation connection when the category is hidden', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 9,
          thread_id: 44,
          category_id: 7,
          thread_deleted: 0,
        },
      ],
    ]);

    await expect(pollService.castVote(9, [1], 'Cwial', permissions as never)).rejects.toThrow(
      /not found or access denied/i,
    );
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('does not let a poll creator manage a category where posting is denied', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 9,
          thread_id: 44,
          category_id: 7,
          thread_deleted: 0,
          created_by_account: 'Cwial',
        },
      ],
    ]);
    categoryAccess.mockResolvedValueOnce({ canView: true, canPost: false, canModerate: false });

    await expect(pollService.closePoll(9, 'Cwial', permissions as never)).rejects.toThrow(
      /not authorized/i,
    );
    expect(getConnection).not.toHaveBeenCalled();
  });
});

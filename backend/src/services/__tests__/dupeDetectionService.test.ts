import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const beginTransaction = jest.fn<() => Promise<void>>().mockResolvedValue();
const commit = jest.fn<() => Promise<void>>().mockResolvedValue();
const rollback = jest.fn<() => Promise<void>>().mockResolvedValue();
const release = jest.fn<() => void>();

const connection = {
  query,
  beginTransaction,
  commit,
  rollback,
  release,
};

const getConnection = jest.fn<() => Promise<typeof connection>>().mockResolvedValue(connection);

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: {
    query,
    getConnection,
  },
}));

const { deleteAllDupesForUid } = await import('../dupeDetectionService.js');

describe('deleteAllDupesForUid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks records with FOR UPDATE and retains the lowest player_items id', async () => {
    query
      // SELECT player_items FOR UPDATE
      .mockResolvedValueOnce([
        [
          { id: 10, vnum: 1234 },
          { id: 25, vnum: 1234 },
        ],
        [],
      ])
      // SELECT locker_items FOR UPDATE
      .mockResolvedValueOnce([[{ id: 50, vnum: 1234 }], []])
      // DELETE FROM player_items
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      // DELETE FROM locker_items
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const deleted = await deleteAllDupesForUid('10001');

    expect(deleted).toBe(2);
    expect(beginTransaction).toHaveBeenCalled();
    expect(commit).toHaveBeenCalled();

    // Verify FOR UPDATE locking on both tables
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT id, vnum FROM player_items WHERE obj_uid = ? FOR UPDATE',
      ['10001'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, vnum FROM locker_items WHERE obj_uid = ? FOR UPDATE',
      ['10001'],
    );

    // Verify keeper was id 10 in player_items
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM player_items WHERE obj_uid = ? AND id != ?',
      ['10001', 10],
    );
    expect(query).toHaveBeenNthCalledWith(4, 'DELETE FROM locker_items WHERE obj_uid = ?', [
      '10001',
    ]);
  });

  it('retains the lowest locker id when item only exists in lockers', async () => {
    query
      // SELECT player_items FOR UPDATE (empty)
      .mockResolvedValueOnce([[], []])
      // SELECT locker_items FOR UPDATE
      .mockResolvedValueOnce([
        [
          { id: 30, vnum: 999 },
          { id: 40, vnum: 999 },
        ],
        [],
      ])
      // DELETE FROM locker_items
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const deleted = await deleteAllDupesForUid('10002');

    expect(deleted).toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM locker_items WHERE obj_uid = ? AND id != ?',
      ['10002', 30],
    );
  });

  it('rejects bulk deletion when UID spans multiple distinct VNUMs', async () => {
    query
      // SELECT player_items FOR UPDATE
      .mockResolvedValueOnce([[{ id: 10, vnum: 100 }], []])
      // SELECT locker_items FOR UPDATE with different vnum
      .mockResolvedValueOnce([[{ id: 20, vnum: 200 }], []]);

    await expect(deleteAllDupesForUid('10003')).rejects.toThrow(
      /Cannot bulk delete UID 10003: item spans 2 distinct VNUMs/,
    );
    expect(rollback).toHaveBeenCalled();
  });

  it('rejects deletion when provided VNUM does not match candidate records', async () => {
    query.mockResolvedValueOnce([[{ id: 10, vnum: 100 }], []]).mockResolvedValueOnce([[], []]);

    await expect(deleteAllDupesForUid('10004', 999)).rejects.toThrow(
      /VNUM mismatch for UID 10004: expected 999, found 100/,
    );
    expect(rollback).toHaveBeenCalled();
  });
});

/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const connectionQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const beginTransaction = jest.fn<() => Promise<void>>();
const commit = jest.fn<() => Promise<void>>();
const rollback = jest.fn<() => Promise<void>>();
const release = jest.fn<() => void>();
const connection = {
  query: connectionQuery,
  beginTransaction,
  commit,
  rollback,
  release,
};
const getConnection = jest.fn<() => Promise<typeof connection>>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, getConnection },
}));
jest.unstable_mockModule('../unifiedNotificationService.js', () => ({}));

const { deductCharacterMoney, getCharacterMoney } = await import('../auctionService.js');

describe('auctionService character money', () => {
  beforeEach(() => {
    query.mockReset();
    connectionQuery.mockReset();
    beginTransaction.mockReset().mockResolvedValue();
    commit.mockReset().mockResolvedValue();
    rollback.mockReset().mockResolvedValue();
    release.mockReset();
    getConnection.mockReset().mockResolvedValue(connection);
  });

  it('converts all coin denominations to copper', async () => {
    query.mockResolvedValueOnce([[{ copper: 7, silver: 3, gold: 2, platinum: 1 }], []]);

    await expect(getCharacterMoney(42)).resolves.toBe(1_237);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM player_data WHERE pid = ?'),
      [42],
    );
  });

  it('returns zero when the character row does not exist', async () => {
    query.mockResolvedValueOnce([[], []]);

    await expect(getCharacterMoney(999_999_999)).resolves.toBe(0);
  });

  it('deducts transactionally and returns denomination change as copper', async () => {
    connectionQuery
      .mockResolvedValueOnce([[{ copper: 0, silver: 0, gold: 0, platinum: 1 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(deductCharacterMoney(84, 100)).resolves.toBe(true);

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(connectionQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), [84]);
    expect(connectionQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE player_data'),
      [900, 0, 0, 0, 84],
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back without mutation when funds are insufficient', async () => {
    connectionQuery.mockResolvedValueOnce([[{ copper: 9, silver: 0, gold: 0, platinum: 0 }], []]);

    await expect(deductCharacterMoney(84, 10)).resolves.toBe(false);

    expect(connectionQuery).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

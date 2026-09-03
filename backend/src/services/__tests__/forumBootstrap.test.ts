/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
  pool: { getConnection },
}));

const { bootstrapForumCategories, INITIAL_FORUM_CATEGORIES } = await import('../forumBootstrap.js');

describe('forum category bootstrap', () => {
  beforeEach(() => {
    connectionQuery.mockReset();
    beginTransaction.mockReset().mockResolvedValue();
    commit.mockReset().mockResolvedValue();
    rollback.mockReset().mockResolvedValue();
    release.mockReset();
    getConnection.mockReset().mockResolvedValue(connection);
  });

  it('inserts the approved taxonomy into an empty forum', async () => {
    connectionQuery.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
      if (statement.includes('SELECT name')) return [[], []];
      if (statement.includes('INSERT INTO')) return [{ affectedRows: 1 }, []];
      if (statement.includes('RELEASE_LOCK')) return [[{ released: 1 }], []];
      throw new Error(`unexpected query: ${statement}`);
    });

    await expect(bootstrapForumCategories()).resolves.toEqual(
      INITIAL_FORUM_CATEGORIES.map((category) => category.name),
    );

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(
      connectionQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO')),
    ).toHaveLength(INITIAL_FORUM_CATEGORIES.length);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('preserves existing identifiers and custom categories when rerun', async () => {
    connectionQuery.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
      if (statement.includes('SELECT name')) {
        return [
          [
            ...INITIAL_FORUM_CATEGORIES.map((category) => ({ name: category.name })),
            { name: 'Custom Guild Hall' },
          ],
          [],
        ];
      }
      if (statement.includes('RELEASE_LOCK')) return [[{ released: 1 }], []];
      throw new Error(`unexpected query: ${statement}`);
    });

    await expect(bootstrapForumCategories()).resolves.toEqual([]);

    expect(connectionQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(
      false,
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the advisory lock after an insert failure', async () => {
    connectionQuery.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
      if (statement.includes('SELECT name')) return [[], []];
      if (statement.includes('INSERT INTO')) throw new Error('insert failed');
      if (statement.includes('RELEASE_LOCK')) return [[{ released: 1 }], []];
      throw new Error(`unexpected query: ${statement}`);
    });

    await expect(bootstrapForumCategories()).rejects.toThrow('insert failed');

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(connectionQuery).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'durisweb:forum-bootstrap',
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'mysql2/promise';

import { createWikiPublicationRows, publishWikiGeneration } from '../wikiPublication.js';

const SOURCE_IDENTITY = {
  revision: 'a'.repeat(40),
  tree: 'b'.repeat(40),
};

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const beginTransaction = jest.fn<() => Promise<void>>();
const commit = jest.fn<() => Promise<void>>();
const rollback = jest.fn<() => Promise<void>>();
const release = jest.fn<() => void>();
const connection = { query, beginTransaction, commit, rollback, release };
const getConnection = jest.fn<() => Promise<typeof connection>>();
const database = { getConnection } as unknown as Pick<Pool, 'getConnection'>;

function populatedRows() {
  const rows = createWikiPublicationRows();
  rows.wiki_objects.push([101]);
  rows.wiki_mobs.push([7, 201]);
  return rows;
}

describe('wiki generation publication transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([[], []]);
    beginTransaction.mockResolvedValue();
    commit.mockResolvedValue();
    rollback.mockResolvedValue();
    getConnection.mockResolvedValue(connection);
  });

  it('writes source identity and counts before committing the same connection', async () => {
    await publishWikiGeneration(database, SOURCE_IDENTITY, populatedRows());

    const markerCall = query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('wiki_reference_generations'),
    );
    expect(markerCall?.[1]).toEqual([SOURCE_IDENTITY.revision, SOURCE_IDENTITY.tree, 1, 1]);
    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);

    const markerOrder = query.mock.invocationCallOrder.at(-1);
    expect(beginTransaction.mock.invocationCallOrder[0]).toBeLessThan(markerOrder ?? 0);
    expect(markerOrder).toBeLessThan(commit.mock.invocationCallOrder[0]);
  });

  it('rolls back and releases the connection when the generation marker write fails', async () => {
    const failure = new Error('marker write failed');
    query.mockImplementation(async (sql) => {
      if (typeof sql === 'string' && sql.includes('wiki_reference_generations')) throw failure;
      return [[], []];
    });

    await expect(publishWikiGeneration(database, SOURCE_IDENTITY, populatedRows())).rejects.toBe(
      failure,
    );

    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty generation before opening a transaction', async () => {
    await expect(
      publishWikiGeneration(database, SOURCE_IDENTITY, createWikiPublicationRows()),
    ).rejects.toThrow('refusing to publish an empty generation');
    expect(getConnection).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'mysql2/promise';

import {
  assertNoRejectedWikiSourceInputs,
  createWikiPublicationRows,
  publishWikiGeneration,
} from '../wikiPublication.js';

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
  rows.wiki_object_affects.push([101, 1, 2]);
  rows.wiki_object_slots.push([101, 16]);
  rows.wiki_object_spell_effects.push([101, 'Glow']);
  rows.wiki_object_classes.push([101, 1, true]);
  rows.wiki_object_races.push([101, 1, true]);
  rows.wiki_mobs.push([7, 201, 'mob', 'mob', 'mob', 1, 0, 1, 1]);
  rows.wiki_mob_flags.push([7, 201, 1]);
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

    const statements = query.mock.calls.map(([sql]) => String(sql).trim());
    const objectDelete = statements.indexOf('DELETE FROM wiki_objects');
    const objectInsert = statements.findIndex((sql) =>
      sql.startsWith('INSERT INTO wiki_objects ('),
    );
    expect(objectDelete).toBeGreaterThan(-1);
    expect(objectInsert).toBeGreaterThan(-1);
    for (const childTable of [
      'wiki_object_races',
      'wiki_object_classes',
      'wiki_object_spell_effects',
      'wiki_object_slots',
      'wiki_object_affects',
    ]) {
      const childDelete = statements.indexOf(`DELETE FROM ${childTable}`);
      const childInsert = statements.findIndex((sql) =>
        sql.startsWith(`INSERT INTO ${childTable} (`),
      );
      expect(childDelete).toBeGreaterThan(-1);
      expect(childDelete).toBeLessThan(objectDelete);
      expect(childInsert).toBeGreaterThan(-1);
      expect(childInsert).toBeGreaterThan(objectInsert);
    }

    const mobDelete = statements.indexOf('DELETE FROM wiki_mobs');
    const mobFlagDelete = statements.indexOf('DELETE FROM wiki_mob_flags');
    const mobInsert = statements.findIndex((sql) => sql.startsWith('INSERT INTO wiki_mobs ('));
    const mobFlagInsert = statements.findIndex((sql) =>
      sql.startsWith('INSERT INTO wiki_mob_flags ('),
    );
    expect(mobDelete).toBeGreaterThan(-1);
    expect(mobFlagDelete).toBeGreaterThan(-1);
    expect(mobFlagDelete).toBeLessThan(mobDelete);
    expect(mobInsert).toBeGreaterThan(-1);
    expect(mobFlagInsert).toBeGreaterThan(-1);
    expect(mobFlagInsert).toBeGreaterThan(mobInsert);
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

  it('refuses missing mob filter metadata before opening a transaction', async () => {
    const rows = populatedRows();
    rows.wiki_mobs[0][8] = 0;

    await expect(publishWikiGeneration(database, SOURCE_IDENTITY, rows)).rejects.toThrow(
      'without applicable mob filter metadata',
    );
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('refuses a source aggregate when any input was rejected', () => {
    expect(() => assertNoRejectedWikiSourceInputs(2, 3)).toThrow('with 1 rejected source input');
    expect(() => assertNoRejectedWikiSourceInputs(3, 3)).not.toThrow();
  });
});

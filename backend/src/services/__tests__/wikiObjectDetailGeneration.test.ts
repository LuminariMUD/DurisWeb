import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const SOURCE_IDENTITY = { revision: 'a'.repeat(40), tree: 'b'.repeat(40) };
const ALTERNATE_IDENTITY = { revision: 'c'.repeat(40), tree: 'd'.repeat(40) };
const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getCache = jest.fn<(key: string) => Promise<unknown>>();
const setCache = jest.fn<(key: string, value: unknown, ttl: number) => Promise<void>>();
const withMudRoot =
  jest.fn<(root: string, operation: () => Promise<unknown>) => Promise<unknown>>();
const withWikiRevisionSnapshot =
  jest.fn<
    (
      identity: typeof SOURCE_IDENTITY,
      directory: string,
      operation: (root: string) => Promise<unknown>,
    ) => Promise<unknown>
  >();

const listZones = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseObjFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getZoneBaseName = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseZonFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseMobFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseWldFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
  mapToObject: (map: Map<number, unknown>) => Object.fromEntries(map),
  objectToMapNumeric: (value: Record<string, unknown>) =>
    new Map(Object.entries(value).map(([key, entry]) => [Number(key), entry])),
  objectToMap: jest.fn(),
}));
jest.unstable_mockModule('../flatfileAccess.js', () => ({
  getMudRoot: () => '/configured/mud',
  withMudRoot,
}));
jest.unstable_mockModule('../wikiSourceSnapshot.js', () => ({ withWikiRevisionSnapshot }));
jest.unstable_mockModule('../zoneBuilderParser.js', () => ({
  parseWldFile,
  parseObjFile,
  getZonePositions: jest.fn(),
  getZoneBaseName,
  listZones,
  parseZonFile,
  parseMobFile,
}));

const { getObjectByVnum, WikiObjectReferenceUnavailableError } = await import('../wikiService.js');

function generationRow(identity = SOURCE_IDENTITY) {
  return {
    source_revision: identity.revision,
    source_tree: identity.tree,
    object_count: 1,
    actual_object_count: 1,
    object_type_count: 1,
    orphan_affects: 0,
    orphan_slots: 0,
    orphan_spell_effects: 0,
    orphan_classes: 0,
    orphan_races: 0,
  };
}

describe('wiki object detail generation binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCache.mockResolvedValue(null);
    setCache.mockResolvedValue();
    withMudRoot.mockImplementation(async (_root, operation) => operation());
    withWikiRevisionSnapshot.mockImplementation(async (_identity, _directory, operation) =>
      operation('/snapshot'),
    );
    listZones.mockResolvedValue({ zones: [{ id: 'test-zone', number: 7, name: 'Test Zone' }] });
    parseObjFile.mockResolvedValue([
      {
        vnum: 101,
        shortDesc: 'Test sword',
        itemType: 5,
        values: [12, 1, 2, 3],
        weight: 4,
        wearFlags: 0,
        applies: [],
        bitvector: 0,
        bitvector2: 0,
        bitvector3: 0,
        bitvector4: 0,
        longDesc: 'A test sword lies here.',
        extraFlags: 0,
        extraFlags2: 0,
        cost: 10,
      },
    ]);
    getZoneBaseName.mockResolvedValue('test-zone');
    parseZonFile.mockResolvedValue({
      resets: [{ command: 'O', arg1: 101, arg2: 1, arg3: 700 }],
    });
    parseMobFile.mockResolvedValue([]);
    parseWldFile.mockResolvedValue([{ vnum: 700, name: 'Test Room' }]);
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('wiki_reference_generations')) return [[generationRow()], []];
      if (statement.includes('builder_flags')) return [[{ value: 5, name: 'Weapon' }], []];
      return [[], []];
    });
  });

  it('uses generation-keyed caches and the exact published source snapshot', async () => {
    await expect(getObjectByVnum(101, SOURCE_IDENTITY)).resolves.toMatchObject({
      vnum: 101,
      typeName: 'Weapon',
      roomLoads: [{ roomVnum: 700, roomName: 'Test Room', zoneNumber: 7 }],
    });

    expect(withWikiRevisionSnapshot).toHaveBeenCalledWith(
      SOURCE_IDENTITY,
      '/configured/mud',
      expect.any(Function),
    );
    expect(withMudRoot).toHaveBeenCalledWith('/snapshot', expect.any(Function));
    expect(getCache.mock.calls.map(([key]) => key)).toEqual([
      `wiki:objects:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}:object:101`,
      `wiki:objects:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}`,
    ]);
    expect(setCache.mock.calls.map(([key]) => key)).toEqual([
      `wiki:objects:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}`,
      `wiki:objects:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}:object:101`,
    ]);
  });

  it('rejects a detail when publication advances before assembly completes', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('wiki_reference_generations')) {
        return [[generationRow(ALTERNATE_IDENTITY)], []];
      }
      if (statement.includes('builder_flags')) return [[{ value: 5, name: 'Weapon' }], []];
      return [[], []];
    });

    await expect(getObjectByVnum(101, SOURCE_IDENTITY)).rejects.toBeInstanceOf(
      WikiObjectReferenceUnavailableError,
    );
    expect(setCache.mock.calls.some(([key]) => key.endsWith(':object:101'))).toBe(false);
  });

  it('rejects a detail when publication advances during the full-detail cache write', async () => {
    let currentIdentity = SOURCE_IDENTITY;
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('wiki_reference_generations')) {
        return [[generationRow(currentIdentity)], []];
      }
      if (statement.includes('builder_flags')) return [[{ value: 5, name: 'Weapon' }], []];
      return [[], []];
    });
    setCache.mockImplementation(async (key) => {
      if (key.endsWith(':object:101')) currentIdentity = ALTERNATE_IDENTITY;
    });

    await expect(getObjectByVnum(101, SOURCE_IDENTITY)).rejects.toBeInstanceOf(
      WikiObjectReferenceUnavailableError,
    );
    expect(setCache.mock.calls.some(([key]) => key.endsWith(':object:101'))).toBe(true);
  });
});

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
const parseMobFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getZoneBaseName = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseZonFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseObjFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const parseWldFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
  mapToObject: (map: Map<string, unknown>) => Object.fromEntries(map),
  objectToMapNumeric: jest.fn(),
  objectToMap: (value: Record<string, unknown>) => new Map(Object.entries(value)),
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

const { getMobByZoneAndVnum, WikiMobReferenceUnavailableError } = await import('../wikiService.js');

/** Build complete readiness evidence for one synthetic published mob generation. */
function generationRow(identity = SOURCE_IDENTITY) {
  return {
    source_revision: identity.revision,
    source_tree: identity.tree,
    mob_count: 1,
    actual_mob_count: 1,
    mob_class_count: 1,
    mob_race_count: 1,
    mob_flag_count: 1,
    orphan_flags: 0,
  };
}

describe('wiki mob detail generation binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCache.mockResolvedValue(null);
    setCache.mockResolvedValue();
    withMudRoot.mockImplementation(async (_root, operation) => operation());
    withWikiRevisionSnapshot.mockImplementation(async (_identity, _directory, operation) =>
      operation('/snapshot'),
    );
    listZones.mockResolvedValue({ zones: [{ id: 'test-zone', number: 7, name: 'Test Zone' }] });
    parseMobFile.mockResolvedValue([
      {
        vnum: 201,
        shortDesc: 'Test guardian',
        keywords: 'test guardian',
        level: 20,
        alignment: 500,
        mobClass: 1,
        gold: 25,
        exp: 1000,
        species: 1,
        actFlags: 1,
        longDesc: 'A test guardian waits here.',
        detailedDesc: 'The guardian watches carefully.',
        hitDice: '20d8+40',
        damDice: '4d6+8',
        ac: -20,
        thac0: 5,
      },
    ]);
    getZoneBaseName.mockResolvedValue('test-zone');
    parseZonFile.mockResolvedValue({
      resets: [
        { command: 'M', arg1: 201, arg2: 1, arg3: 700 },
        { command: 'E', arg1: 101, arg2: 1, arg3: 16 },
      ],
    });
    parseObjFile.mockResolvedValue([{ vnum: 101, shortDesc: 'Test sword', itemType: 5 }]);
    parseWldFile.mockResolvedValue([{ vnum: 700, name: 'Test Room' }]);
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('wiki_reference_generations')) return [[generationRow()], []];
      if (statement.includes('builder_flags')) return [[{ value: 5, name: 'Weapon' }], []];
      return [[], []];
    });
  });

  it('uses generation-keyed caches and the exact published source snapshot', async () => {
    await expect(getMobByZoneAndVnum(7, 201, SOURCE_IDENTITY)).resolves.toMatchObject({
      vnum: 201,
      spawnRooms: [{ roomVnum: 700, roomName: 'Test Room' }],
      equipment: [{ vnum: 101, name: 'Test sword', slot: 'Wielded', itemTypeName: 'Weapon' }],
    });

    expect(withWikiRevisionSnapshot).toHaveBeenCalledWith(
      SOURCE_IDENTITY,
      '/configured/mud',
      expect.any(Function),
    );
    expect(withMudRoot).toHaveBeenCalledWith('/snapshot', expect.any(Function));
    expect(getCache.mock.calls.map(([key]) => key)).toEqual([
      `wiki:mobs:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}:mob:7:201`,
      `wiki:mobs:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}`,
    ]);
    expect(setCache.mock.calls.map(([key]) => key)).toEqual([
      `wiki:mobs:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}`,
      `wiki:mobs:details:${SOURCE_IDENTITY.revision}:${SOURCE_IDENTITY.tree}:mob:7:201`,
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

    await expect(getMobByZoneAndVnum(7, 201, SOURCE_IDENTITY)).rejects.toBeInstanceOf(
      WikiMobReferenceUnavailableError,
    );
    expect(setCache.mock.calls.some(([key]) => key.endsWith(':mob:7:201'))).toBe(false);
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
      if (key.endsWith(':mob:7:201')) currentIdentity = ALTERNATE_IDENTITY;
    });

    await expect(getMobByZoneAndVnum(7, 201, SOURCE_IDENTITY)).rejects.toBeInstanceOf(
      WikiMobReferenceUnavailableError,
    );
    expect(setCache.mock.calls.some(([key]) => key.endsWith(':mob:7:201'))).toBe(true);
  });
});

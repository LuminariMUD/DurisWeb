import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
  mapToObject: jest.fn(),
  objectToMapNumeric: jest.fn(),
  objectToMap: jest.fn(),
}));
jest.unstable_mockModule('../zoneBuilderParser.js', () => ({
  parseWldFile: jest.fn(),
  parseObjFile: jest.fn(),
  getZonePositions: jest.fn(),
  getZoneBaseName: jest.fn(),
  listZones: jest.fn(),
  parseZonFile: jest.fn(),
  parseMobFile: jest.fn(),
}));

const { getActFlags, getMobClasses, getMobRaces } = await import('../wikiService.js');

describe('wiki mob filter metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns classes applicable to published mobs', async () => {
    query.mockResolvedValueOnce([[{ mob_class: '1' }, { mob_class: '99' }], []]);

    await expect(getMobClasses()).resolves.toEqual([
      { id: 1, name: 'Warrior' },
      { id: 99, name: 'Unknown (99)' },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('FROM wiki_mobs');
  });

  it('returns races applicable to published mobs', async () => {
    query.mockResolvedValueOnce([[{ species: 1 }, { species: 999 }], []]);

    const races = await getMobRaces();

    expect(races[0]).toEqual({ id: 1, name: expect.any(String) });
    expect(races[1]).toEqual({ id: 999, name: 'Unknown (999)' });
    expect(String(query.mock.calls[0]?.[0])).toContain('FROM wiki_mobs');
  });

  it('returns flags applicable to published mobs', async () => {
    query.mockResolvedValueOnce([[{ flag_id: 1 }, { flag_id: 15 }], []]);

    await expect(getActFlags()).resolves.toEqual([
      { id: 1, name: 'SPEC', description: expect.any(String) },
      { id: 16384, name: 'NO_BASH', description: expect.any(String) },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('FROM wiki_mob_flags');
  });
});

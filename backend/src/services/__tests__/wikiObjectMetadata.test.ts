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

const { getObjectTypes } = await import('../wikiService.js');

describe('wiki object filter metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only types applicable to the published objects with fallback names', async () => {
    query.mockResolvedValueOnce([
      [
        { value: 1, name: 'Light' },
        { value: 9, name: 'Type 9' },
      ],
      [],
    ]);

    await expect(getObjectTypes()).resolves.toEqual([
      { id: 1, name: 'Light' },
      { id: 9, name: 'Type 9' },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('FROM wiki_objects o');
    expect(String(query.mock.calls[0]?.[0])).toContain('LEFT JOIN builder_flags');
    expect(String(query.mock.calls[0]?.[0])).toContain('GROUP BY o.type');
  });
});

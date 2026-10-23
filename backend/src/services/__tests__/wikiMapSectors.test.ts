import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const cache = new Map<string, unknown>();
const getCache = jest.fn(async (key: string) => cache.get(key));
const setCache = jest.fn(async (key: string, value: unknown) => {
  cache.set(key, value);
});
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
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
const { getMapSectorGrid, NO_ROOM_SECTOR } = await import('../wikiService.js');

describe('painted map sector grid', () => {
  beforeEach(() => {
    cache.clear();
    jest.clearAllMocks();
  });

  it.each([0, -1])('packs every room of layer %i into a grid', async (layer) => {
    const bounds = { minX: 10, maxX: 13, minY: 20, maxY: 22 };
    const rows = [
      { x_coord: 10, y_coord: 20, sector_type: 12 },
      { x_coord: 13, y_coord: 20, sector_type: 5 },
      { x_coord: 11, y_coord: 21, sector_type: 37 },
      { x_coord: 13, y_coord: 22, sector_type: 0 },
      { x_coord: 12, y_coord: 22, sector_type: 300 }, // out of byte range: no room
      { x_coord: 40, y_coord: 40, sector_type: 3 }, // outside the bounds: ignored
    ];
    query.mockResolvedValueOnce([[bounds], []]).mockResolvedValueOnce([rows, []]);

    const grid = await getMapSectorGrid(layer);
    expect(grid).toMatchObject({ layer, minX: 10, minY: 20, width: 4, height: 3 });
    const cells = [...Buffer.from(grid.sectors, 'base64')];
    const N = NO_ROOM_SECTOR;
    expect(cells).toEqual([12, N, N, 5, N, 37, N, N, N, N, N, 0]);
    expect(query.mock.calls[1]?.[1]).toEqual([layer]);
    expect(String(query.mock.calls[1]?.[0])).toContain('WHERE z_coord = ?');

    // The second request is served from the cache.
    expect(await getMapSectorGrid(layer)).toEqual(grid);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('reports a layer without rooms instead of sending a blank grid', async () => {
    query
      .mockResolvedValueOnce([[{ minX: null, maxX: null, minY: null, maxY: null }], []])
      .mockResolvedValueOnce([[], []]);
    await expect(getMapSectorGrid(-2)).rejects.toThrow('No map rooms on this layer');
    expect(setCache).not.toHaveBeenCalledWith('wiki:mapSectors:v1:-2', expect.anything(), 3600);
  });

  it('rejects grids large enough to exhaust memory', async () => {
    query.mockResolvedValueOnce([[{ minX: 0, maxX: 4095, minY: 0, maxY: 4095 }], []]);
    await expect(getMapSectorGrid(5)).rejects.toThrow('Invalid map bounds');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

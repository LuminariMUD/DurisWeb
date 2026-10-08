import { describe, expect, it, jest } from '@jest/globals';

import { readWikiMapReadiness, validateWikiMapReadiness } from '../wikiMapReadiness.js';

describe('wiki map readiness', () => {
  it('rejects a map projection that was never extracted', () => {
    expect(validateWikiMapReadiness({ mapRooms: 0, surfaceRooms: 0, zoneEntrances: 0 })).toEqual([
      expect.stringContaining('extract-map-data'),
    ]);
  });

  it('rejects a projection without surface rooms', () => {
    expect(
      validateWikiMapReadiness({ mapRooms: 2645, surfaceRooms: 0, zoneEntrances: 12 }),
    ).toEqual([expect.stringContaining('no published surface rooms')]);
  });

  it('rejects a projection without zone entrances', () => {
    expect(
      validateWikiMapReadiness({ mapRooms: 160004, surfaceRooms: 160004, zoneEntrances: 0 }),
    ).toEqual([expect.stringContaining('no zone entrances')]);
  });

  it('rejects unreadable counts', () => {
    expect(
      validateWikiMapReadiness({ mapRooms: Number.NaN, surfaceRooms: 1, zoneEntrances: 1 }),
    ).toEqual([expect.stringContaining('not readable')]);
  });

  it('accepts a published surface generation with entrances', () => {
    expect(
      validateWikiMapReadiness({ mapRooms: 266083, surfaceRooms: 160004, zoneEntrances: 546 }),
    ).toEqual([]);
  });

  it('reads only aggregate counts from the website-owned map tables', async () => {
    const query = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([
        [{ map_rooms: '266083', surface_rooms: '160004', zone_entrances: '546' }],
        [],
      ]);

    await expect(readWikiMapReadiness({ query } as never)).resolves.toEqual({
      mapRooms: 266083,
      surfaceRooms: 160004,
      zoneEntrances: 546,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM wiki_map_positions WHERE z_coord = 0');
    expect(sql).toContain('FROM wiki_zone_entrances');
    expect(sql).not.toMatch(/room_name|zone_name/);
  });
});

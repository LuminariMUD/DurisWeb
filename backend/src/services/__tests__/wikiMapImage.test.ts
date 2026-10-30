import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

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
  parseWldFileById: jest.fn(),
  parseObjFile: jest.fn(),
  getZonePositions: jest.fn(),
  getZoneBaseName: jest.fn(),
  listZones: jest.fn(),
  parseZonFile: jest.fn(),
  parseMobFile: jest.fn(),
}));
const { generateMapImage } = await import('../wikiService.js');

describe('generated wiki map terrain', () => {
  beforeEach(() => {
    cache.clear();
    jest.clearAllMocks();
  });

  it.each([0, -1, -2])('preserves geometry and legend meanings on layer %i', async (layer) => {
    const bounds = { minX: 10, maxX: 16, minY: 20, maxY: 25 };
    const rows = Array.from({ length: 41 }, (_, sector) => ({
      x_coord: 10 + (sector % 7),
      y_coord: 20 + Math.floor(sector / 7),
      sector_type: sector < 40 ? sector : 999,
    }));
    query.mockResolvedValueOnce([[bounds], []]).mockResolvedValueOnce([rows, []]);
    cache.set(`wiki:mapImage:${layer}:2`, Buffer.from('old palette').toString('base64'));
    const png = await generateMapImage(layer, 2);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([14, 12, 4]);
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ];
    const view = readFileSync(
      new URL('../../../../frontend/src/views/wiki/WikiMapView.vue', import.meta.url),
      'utf8',
    );
    const legend = new Map<number, number[]>();
    for (const match of view.matchAll(/sectors:\s*\[([\d,\s]+)\],\s*color:\s*'(#[a-f\d]{6})'/g)) {
      const color = [1, 3, 5].map((offset) =>
        Number.parseInt(match[2]!.slice(offset, offset + 2), 16),
      );
      for (const id of match[1]!.split(',').map(Number)) legend.set(id, [...color, 255]);
    }
    expect([...legend.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i),
    );
    for (let sector = 0; sector < 40; sector++) {
      for (const dx of [0, 1])
        for (const dy of [0, 1]) {
          expect(pixel((sector % 7) * 2 + dx, Math.floor(sector / 7) * 2 + dy)).toEqual(
            legend.get(sector),
          );
        }
    }
    const background = layer === 0 ? [38, 63, 75, 255] : [25, 23, 30, 255];
    expect(pixel(10, 10)).toEqual(background); // unknown sector
    expect(pixel(12, 10)).toEqual(background); // absent room
    expect(pixel(4, 10)).not.toEqual(background); // road, sector 37
    expect(query.mock.calls[1]?.[1]).toEqual([layer]);
    expect(String(query.mock.calls[1]?.[0])).toContain('WHERE z_coord = ?');
    expect(await generateMapImage(layer, 2)).toEqual(png);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

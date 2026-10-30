import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const query = jest.fn<(sql: string) => Promise<unknown>>();
const getCache = jest.fn(async () => undefined);
const setCache = jest.fn(async () => undefined);
let enabled = true;
let reverseDirectory = false;
const readdir = jest.fn(async (directory: string) => {
  const entries = await fs.readdir(directory);
  return reverseDirectory ? entries.reverse() : entries;
});
jest.unstable_mockModule('fs/promises', () => ({ ...fs, readdir }));
jest.unstable_mockModule('../../db/connection.js', () => ({ pool: { query } }));
jest.unstable_mockModule('../../db/redis.js', () => ({
  getCache,
  setCache,
  mapToObject: jest.fn(),
  objectToMapNumeric: jest.fn(),
  objectToMap: jest.fn(),
}));
jest.unstable_mockModule('../../hooks/hookGate.js', () => ({
  isHookEnabledSync: () => enabled,
}));
jest.unstable_mockModule('../../middleware/auth.js', () => ({
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Unknown error'),
}));

const parser = await import('../zoneBuilderParser.js');
const wiki = await import('../wikiService.js');
const {
  FlatfileAccessError,
  resetFlatfileAccessForTests,
  setFlatfileReadInterlockForTests,
  setMudRootForTests,
  withMudRoot,
} = await import('../flatfileAccess.js');
const { resetFlatfileHookStateForTests } = await import('../../hooks/flatfileHookState.js');
const { default: routes } = await import('../../routes/wiki.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');
const fixtures = fileURLToPath(new URL('./fixtures/activeZoneMap/', import.meta.url));
const app = express();
app.use('/api/wiki', routes);
app.use(errorHandler);
let mudRoot = '';

async function write(relativePath: string, content: string | Buffer, root = mudRoot) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function copyZone(name: string, root = mudRoot) {
  for (const extension of ['zon', 'wld']) {
    await write(
      `areas/${extension}/${name}.${extension}`,
      await fs.readFile(path.join(fixtures, `${name}.${extension}`)),
      root,
    );
  }
}

function graphDigest(data: Awaited<ReturnType<typeof wiki.getZoneMapData>>) {
  const nodes = data.nodes.map(({ id, name, sectorType }) => ({ id, name, sectorType }));
  return createHash('sha256')
    .update(JSON.stringify({ nodes, edges: data.edges }))
    .digest('hex');
}

beforeEach(async () => {
  jest.clearAllMocks();
  enabled = true;
  reverseDirectory = false;
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  parser.invalidateZoneFileMap();
  parser.invalidateZoneIndexCache();
  mudRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'durisweb-active-map-'));
  setMudRootForTests(mudRoot);
  await copyZone('long');
  await copyZone('temple2');
  await write('areas/AREA', 'long *344\n*temple2 *344\n');
  query.mockImplementation(async (sql) => {
    if (sql !== "SELECT value FROM wiki_settings WHERE `key` = 'access_level'") {
      throw new Error('Unexpected map-data SQL');
    }
    return [[{ value: 'public' }], []];
  });
});

afterEach(async () => {
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  parser.invalidateZoneFileMap();
  parser.invalidateZoneIndexCache();
  await fs.rm(mudRoot, { recursive: true, force: true });
});

describe('active-world numeric zone maps', () => {
  it.each([false, true])(
    'selects active Longhollow regardless of directory order (reversed=%s)',
    async (reverse) => {
      reverseDirectory = reverse;
      await write('areas/AREA', reverse ? '*temple2\nlong *344\n' : 'long *344\n*temple2\n');
      await write(
        'areas/map/long.json',
        JSON.stringify({ positions: { 34400: { x: 11, y: 22 } } }),
      );
      await write(
        'areas/map/temple2.json',
        JSON.stringify({ positions: { 34400: { x: 999, y: 999 } } }),
      );
      expect(await parser.getZoneBaseName(344)).toBe('long');
      expect(await parser.parseWldFile(344)).toHaveLength(100);
      const data = await wiki.getZoneMapData(344);
      expect(data.nodes).toHaveLength(100);
      expect(data.edges).toHaveLength(251);
      expect(data.nodes.find((node) => node.id === 34400)).toEqual({
        id: 34400,
        name: "&+YThe Chieftain's Chamber",
        sectorType: 1,
        x: 11,
        y: 22,
      });
      expect(data.edges.filter((edge) => edge.from === 34400)).toEqual([
        { from: 34400, to: 34499, direction: 'north' },
      ]);
      // Independent projection of the pinned MUD source; see the fixture README.
      expect(graphDigest(data)).toBe(
        'bab81191586f46d25e3e5689a2c7921fd36e633be803f74727ad27547b25cd19',
      );
      expect(query).not.toHaveBeenCalled();
      const response = await request(app).get('/api/wiki/zones/344/map-data');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(JSON.parse(JSON.stringify(data)));
      expect(query).toHaveBeenCalledTimes(1);
      expect(getCache).not.toHaveBeenCalled();
      expect(setCache).not.toHaveBeenCalled();
    },
  );

  it('keeps a warm active mapping when an inactive duplicate is added', async () => {
    await fs.unlink(path.join(mudRoot, 'areas/zon/temple2.zon'));
    expect(await parser.getZoneBaseName(344)).toBe('long');
    await copyZone('temple2');
    expect(await parser.getZoneBaseName(344)).toBe('long');
    parser.invalidateZoneFileMap();
    expect(await parser.getZoneBaseName(344)).toBe('long');
  });

  it('uses one selected source for rooms and positions if membership changes during the read', async () => {
    await write('areas/map/long.json', JSON.stringify({ positions: { 34400: { x: 11, y: 22 } } }));
    await write(
      'areas/map/temple2.json',
      JSON.stringify({ positions: { 34400: { x: 999, y: 999 } } }),
    );
    expect(await parser.getZoneBaseName(344)).toBe('long');
    let reads = 0;
    setFlatfileReadInterlockForTests(async () => {
      if (++reads === 2) await write('areas/AREA', 'temple2\n');
    });
    const data = await wiki.getZoneMapData(344);
    expect(data.nodes.find((node) => node.id === 34400)).toMatchObject({
      name: "&+YThe Chieftain's Chamber",
      x: 11,
      y: 22,
    });
    expect(await parser.getZoneBaseName(344)).toBe('temple2');
  });

  it.each(['long\ntemple2\n', 'temple2\nlong\n'])(
    'refuses active collisions without disabling unrelated numbers (%j)',
    async (manifest) => {
      await write('areas/AREA', manifest + 'other\n');
      await write('areas/zon/other.zon', '#2\nOther~\n299 0 0 40 50 1\nS\n');
      await expect(parser.getZoneBaseName(344)).rejects.toThrow(
        'Active zone number 344 is ambiguous.',
      );
      expect(await parser.getZoneBaseName(2)).toBe('other');
      const response = await request(app).get('/api/wiki/zones/344/map-data');
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Active zone number 344 is ambiguous.');
      expect(response.body.nodes).toBeUndefined();
    },
  );

  it('does not hide a conflicting active header when its reset records are malformed', async () => {
    await write('areas/AREA', 'long\ntemple2\n');
    await write('areas/zon/temple2.zon', '#344\nBroken~\n34499 0 0 40 50 1\n');
    await expect(parser.getZoneBaseName(344)).rejects.toThrow(/ambiguous/);
  });

  it('refreshes membership on the next lookup and never expands range annotations', async () => {
    expect(await parser.getZoneBaseName(344)).toBe('long');
    await write('areas/AREA', '\r\n*long *344\r\n\ttemple2 *999-1000\r\ntemple2 *344\r\n');
    expect(await parser.getZoneBaseName(344)).toBe('temple2');
    expect(await parser.getZoneBaseName(999)).toBeNull();
    expect(graphDigest(await wiki.getZoneMapData(344))).toBe(
      '7403612f93e2b1ee8dec7684247032661fc796fb06cf3baf911d37a5f3437672',
    );
    await write('areas/AREA', '*long\n*temple2\n');
    expect(await parser.getZoneBaseName(344)).toBeNull();
    await write('areas/AREA', '');
    expect(await parser.getZoneBaseName(344)).toBeNull();
  });

  it.each([' *temple2\n', '#temple2\n', ';temple2\n', '../temple2\n'])(
    'rejects unsafe membership rather than inventing comment syntax (%j)',
    async (line) => {
      await write('areas/AREA', 'long\n' + line);
      await expect(parser.getZoneBaseName(344)).rejects.toThrow();
    },
  );

  it.each(['missing', 'directory', 'symlink', 'invalid-utf8', 'nul', 'oversize'])(
    'refuses an unavailable or unsafe manifest after warm-up (%s)',
    async (kind) => {
      expect(await parser.getZoneBaseName(344)).toBe('long');
      const manifest = path.join(mudRoot, 'areas/AREA');
      await fs.unlink(manifest);
      if (kind === 'directory') await fs.mkdir(manifest);
      if (kind === 'symlink') await fs.symlink(path.join(fixtures, 'long.zon'), manifest);
      if (kind === 'invalid-utf8') await fs.writeFile(manifest, Buffer.from([0xff]));
      if (kind === 'nul') await fs.writeFile(manifest, 'long\0\n');
      if (kind === 'oversize') await fs.writeFile(manifest, Buffer.alloc(16 * 1024 * 1024 + 1, 32));
      await expect(parser.getZoneBaseName(344)).rejects.toBeInstanceOf(FlatfileAccessError);
    },
  );

  it('requires invalidation for external header edits with unchanged membership', async () => {
    expect(await parser.getZoneBaseName(344)).toBe('long');
    await write('areas/zon/long.zon', '#345\nLonghollow~\n34599 0 0 40 50 1\nS\n');
    expect(await parser.getZoneBaseName(344)).toBe('long');
    parser.invalidateZoneFileMap();
    expect(await parser.getZoneBaseName(344)).toBeNull();
    expect(await parser.getZoneBaseName(345)).toBe('long');
  });

  it('does not reuse a numeric mapping across MUD roots', async () => {
    expect(await parser.getZoneBaseName(344)).toBe('long');
    const alternate = path.join(mudRoot, 'alternate');
    await copyZone('temple2', alternate);
    await write('areas/AREA', 'temple2\n', alternate);
    setMudRootForTests(alternate);
    expect(await parser.getZoneBaseName(344)).toBe('temple2');
    setMudRootForTests(mudRoot);
    expect(await parser.getZoneBaseName(344)).toBe('long');
    setMudRootForTests(null);
    expect(
      await Promise.all([
        withMudRoot(mudRoot, () => parser.getZoneBaseName(344)),
        withMudRoot(alternate, () => parser.getZoneBaseName(344)),
      ]),
    ).toEqual(['long', 'temple2']);
  });

  it('does not republish a build invalidated while another member is being read', async () => {
    await write('areas/AREA', 'long\nother\n');
    await write('areas/zon/other.zon', '#2\nOther~\n299 0 0 40 50 1\nS\n');
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readingOther = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let reads = 0;
    setFlatfileReadInterlockForTests(async () => {
      if (++reads === 3) {
        reached();
        await blocked;
      }
    });
    const oldLookup = parser.getZoneBaseName(344);
    await readingOther;
    try {
      await write('areas/zon/long.zon', '#345\nLonghollow~\n34599 0 0 40 50 1\nS\n');
      parser.invalidateZoneFileMap();
    } finally {
      release();
    }
    await oldLookup;
    setFlatfileReadInterlockForTests(null);
    expect(await parser.getZoneBaseName(344)).toBeNull();
    expect(await parser.getZoneBaseName(345)).toBe('long');
  });

  it('checks the hook before reading the manifest even with a warm cache', async () => {
    expect(await parser.getZoneBaseName(344)).toBe('long');
    const read = jest.fn<() => void>();
    setFlatfileReadInterlockForTests(read);
    enabled = false;
    await expect(parser.getZoneBaseName(344)).rejects.toThrow(/disabled/);
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves inactive filename-based builder reads and indexing without a manifest', async () => {
    await fs.unlink(path.join(mudRoot, 'areas/AREA'));
    const data = await parser.getZoneMapData('temple2');
    expect(data.rooms).toHaveLength(89);
    expect(data.rooms[0]).toMatchObject({ vnum: 34400, name: '&+yA muddy trail&N', sectorType: 3 });
    const index = await parser.listZones({ limit: 10 });
    expect(index.zones.map((zone) => zone.id).sort()).toEqual(['long', 'temple2']);
  });
});

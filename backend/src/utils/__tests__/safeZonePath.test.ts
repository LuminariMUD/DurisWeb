import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  UnsafeZonePathError,
  resolveSafeZoneDirectoryPath,
  resolveSafeZoneFilePath,
  resolveSafeZoneMapPath,
} from '../safeZonePath.js';

describe('safe zone path resolution', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fsPromises.rm(root, { recursive: true, force: true })));
  });

  async function createAreas(): Promise<string> {
    const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'duris-safe-zone-'));
    roots.push(root);
    await fsPromises.mkdir(path.join(root, 'areas', 'wld'), { recursive: true });
    await fsPromises.mkdir(path.join(root, 'outside'), { recursive: true });
    return path.join(root, 'areas');
  }

  it('resolves valid legacy zone IDs inside the requested file directory', async () => {
    const areas = await createAreas();
    expect(resolveSafeZoneFilePath(areas, 'surface2011-temp', 'wld'))
      .toBe(path.join(areas, 'wld', 'surface2011-temp.wld'));
  });

  it.each(['../escape', '../../escape', '/tmp/escape', 'safe/../escape', 'safe%2fescape'])
    ('rejects unsafe zone ID %s', async (zoneId) => {
      const areas = await createAreas();
      expect(() => resolveSafeZoneFilePath(areas, zoneId, 'wld')).toThrow(UnsafeZonePathError);
    });

  it('rejects a file symlink even when the target is outside the areas root', async () => {
    const areas = await createAreas();
    const outside = path.join(path.dirname(areas), 'outside', 'secret.wld');
    const link = path.join(areas, 'wld', 'safe.wld');
    await fsPromises.writeFile(outside, 'secret');
    await fsPromises.symlink(outside, link);

    expect(() => resolveSafeZoneFilePath(areas, 'safe', 'wld')).toThrow(/symbolic|outside/i);
  });

  it('rejects a symlinked zone directory before a new file is created', async () => {
    const areas = await createAreas();
    await fsPromises.rm(path.join(areas, 'wld'), { recursive: true, force: true });
    await fsPromises.symlink(path.join(path.dirname(areas), 'outside'), path.join(areas, 'wld'));

    expect(() => resolveSafeZoneFilePath(areas, 'safe', 'wld')).toThrow(/symbolic|outside/i);
    expect(() => resolveSafeZoneDirectoryPath(areas, 'wld')).toThrow(/symbolic|outside/i);
  });

  it('allows a new file beneath an existing non-symlink directory', async () => {
    const areas = await createAreas();
    const resolved = resolveSafeZoneFilePath(areas, 'new-zone', 'wld');
    expect(path.relative(areas, resolved)).toBe(path.join('wld', 'new-zone.wld'));
    expect(fs.existsSync(resolved)).toBe(false);
  });

  it('resolves map-position files under the fixed map namespace', async () => {
    const areas = await createAreas();
    expect(resolveSafeZoneDirectoryPath(areas, 'map')).toBe(path.join(areas, 'map'));
    expect(resolveSafeZoneMapPath(areas, 'surface')).toBe(path.join(areas, 'map', 'surface.json'));
  });
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn(() => Promise.resolve([[]]));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../zoneBuilderParser.js', () => ({
  invalidateZoneFileMap: jest.fn(),
  invalidateZoneIndexCache: jest.fn(),
}));

describe('builder path containment', () => {
  let writer: typeof import('../zoneBuilderWriter.js');
  let gitService: typeof import('../gitService.js');
  let mudDir: string;
  let outsidePath: string;
  let backupEscapePath: string | undefined;

  beforeAll(async () => {
    mudDir = await fs.mkdtemp(path.join(os.tmpdir(), 'duris-zone-path-'));
    await fs.mkdir(path.join(mudDir, 'areas', 'wld'), { recursive: true });
    process.env.MUD_DIR = mudDir;
    writer = await import('../zoneBuilderWriter.js');
    gitService = await import('../gitService.js');
    outsidePath = path.resolve(mudDir, 'areas', 'wld', '../../../duris-zone-escape.wld');
  });

  afterAll(async () => {
    await fs.rm(outsidePath, { force: true });
    if (backupEscapePath) await fs.rm(backupEscapePath, { force: true });
    await fs.rm(mudDir, { recursive: true, force: true });
    delete process.env.MUD_DIR;
  });

  it('rejects a traversal zone ID before writing outside the areas root', async () => {
    await expect(writer.writeWldFile('../../../duris-zone-escape', [])).rejects.toThrow(
      /invalid|outside|path/i,
    );
    await expect(fs.access(outsidePath)).rejects.toThrow();
  });

  it('rejects a traversal zone ID before constructing Git file arguments', async () => {
    await expect(gitService.getZoneGitStatus('../../../duris-zone-escape')).rejects.toThrow(
      /invalid|outside|path/i,
    );
  });

  it('rejects a symlinked backup before copying zone data outside the root', async () => {
    const safeFile = path.join(mudDir, 'areas', 'wld', 'safe.wld');
    const backupLink = `${safeFile}.bak`;
    const outside = path.join(path.dirname(mudDir), 'duris-zone-backup-escape.txt');
    backupEscapePath = outside;
    await fs.writeFile(safeFile, 'original');
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, backupLink);

    await expect(writer.writeWldFile('safe', [])).rejects.toThrow(/symbolic|backup|unsafe/i);
    await expect(fs.readFile(outside, 'utf-8')).resolves.toBe('outside');
  });
});

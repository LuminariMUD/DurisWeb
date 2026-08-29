import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, jest, it } from '@jest/globals';

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn() },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('builder global search command boundary', () => {
  let globalSearch: typeof import('../zoneBuilderParser.js').globalSearch;
  let mudRoot: string;
  let sentinelPath: string;
  const originalMudDir = process.env.MUD_DIR;

  beforeAll(async () => {
    mudRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'durisweb-search-'));
    sentinelPath = path.join(mudRoot, 'search-command-executed');
    const areasRoot = path.join(mudRoot, 'areas');

    await Promise.all([
      fs.mkdir(path.join(areasRoot, 'zon'), { recursive: true }),
      fs.mkdir(path.join(areasRoot, 'wld'), { recursive: true }),
      fs.mkdir(path.join(areasRoot, 'mob'), { recursive: true }),
      fs.mkdir(path.join(areasRoot, 'obj'), { recursive: true }),
    ]);
    await fs.writeFile(
      path.join(areasRoot, 'zon', 'search-fixture.zon'),
      '#100\nSearch Fixture~\n10099 0 0 40 50 1\n',
      'utf8',
    );
    await fs.writeFile(path.join(areasRoot, 'wld', 'search-fixture.wld'), '', 'utf8');

    process.env.MUD_DIR = mudRoot;
    ({ globalSearch } = await import('../zoneBuilderParser.js'));
  });

  afterAll(async () => {
    if (originalMudDir === undefined) delete process.env.MUD_DIR;
    else process.env.MUD_DIR = originalMudDir;
    await fs.rm(mudRoot, { recursive: true, force: true });
  });

  it('treats shell substitution in a search query as literal data', async () => {
    const payload = `$(touch ${sentinelPath})`;

    await expect(globalSearch(payload, 'room', 1, 20)).resolves.toMatchObject({
      results: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
    await expect(fs.access(sentinelPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from '@jest/globals';

import { getMudRoot, withMudRoot } from '../flatfileAccess.js';
import { withWikiSourceSnapshot } from '../wikiSourceSnapshot.js';

const executeFile = promisify(execFile);
const temporaryRoots: string[] = [];

async function git(directory: string, ...args: string[]): Promise<string> {
  const result = await executeFile('git', ['-C', directory, ...args], { encoding: 'utf8' });
  return String(result.stdout).trim();
}

async function createSourceRepository(): Promise<{
  root: string;
  revision: string;
  tree: string;
  alternateRevision: string;
}> {
  const testRoot = await fs.mkdtemp(path.join(tmpdir(), 'durisweb-wiki-snapshot-test-'));
  temporaryRoots.push(testRoot);
  const sourceRoot = path.join(testRoot, 'source');
  await fs.mkdir(sourceRoot);
  await git(sourceRoot, 'init', '--quiet');
  await git(sourceRoot, 'config', 'user.name', 'DurisWeb test');
  await git(sourceRoot, 'config', 'user.email', 'durisweb-test@example.invalid');
  await fs.writeFile(path.join(sourceRoot, 'source.txt'), 'committed\n');
  await git(sourceRoot, 'add', 'source.txt');
  await git(sourceRoot, 'commit', '--quiet', '-m', 'fixture');
  const revision = await git(sourceRoot, 'rev-parse', 'HEAD');
  const tree = await git(sourceRoot, 'rev-parse', 'HEAD^{tree}');

  await fs.writeFile(path.join(sourceRoot, 'source.txt'), 'newer revision\n');
  await git(sourceRoot, 'add', 'source.txt');
  await git(sourceRoot, 'commit', '--quiet', '-m', 'alternate fixture');
  const alternateRevision = await git(sourceRoot, 'rev-parse', 'HEAD');
  await git(sourceRoot, 'checkout', '--quiet', '--detach', revision);

  return {
    root: sourceRoot,
    revision,
    tree,
    alternateRevision,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('wiki source snapshot', () => {
  it('reads from a detached revision even when the selected checkout changes during parsing', async () => {
    const source = await createSourceRepository();
    let snapshotRoot = '';

    const content = await withWikiSourceSnapshot(source, source.root, async (root) => {
      snapshotRoot = root;
      await git(source.root, 'checkout', '--quiet', '--detach', source.alternateRevision);
      return withMudRoot(root, async () => ({
        mudRoot: getMudRoot(),
        text: await fs.readFile(path.join(getMudRoot(), 'source.txt'), 'utf8'),
      }));
    });

    expect(content).toEqual({ mudRoot: snapshotRoot, text: 'committed\n' });
    expect(await git(source.root, 'status', '--porcelain')).toBe('');
    await expect(fs.access(snapshotRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      (await git(source.root, 'worktree', 'list', '--porcelain')).match(/^worktree /gm),
    ).toHaveLength(1);
  });
});

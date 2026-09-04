import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import logger from '../../utils/logger.js';
import { getMudRoot, withMudRoot } from '../flatfileAccess.js';
import {
  verifyWikiSourceCheckout,
  withWikiRevisionSnapshot,
  withWikiSourceSnapshot,
} from '../wikiSourceSnapshot.js';

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
  alternateTree: string;
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
  const alternateTree = await git(sourceRoot, 'rev-parse', 'HEAD^{tree}');
  await git(sourceRoot, 'checkout', '--quiet', '--detach', revision);

  return {
    root: sourceRoot,
    revision,
    tree,
    alternateRevision,
    alternateTree,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('wiki source snapshot', () => {
  it('rejects a dirty selected checkout', async () => {
    const source = await createSourceRepository();
    await fs.writeFile(path.join(source.root, 'uncommitted.txt'), 'dirty\n');

    await expect(verifyWikiSourceCheckout(source, source.root)).rejects.toThrow(
      'refusing to publish from a dirty MUD checkout',
    );
  });

  it('rejects a source revision that does not match the selected HEAD', async () => {
    const source = await createSourceRepository();

    await expect(
      verifyWikiSourceCheckout(
        { revision: source.alternateRevision, tree: source.alternateTree },
        source.root,
      ),
    ).rejects.toThrow('recorded source identity does not match the selected MUD checkout');
  });

  it('rejects a source tree that does not match the selected revision', async () => {
    const source = await createSourceRepository();

    await expect(
      verifyWikiSourceCheckout(
        { revision: source.revision, tree: source.alternateTree },
        source.root,
      ),
    ).rejects.toThrow('recorded source identity does not match the selected MUD checkout');
  });

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

  it('materializes a recorded revision after the selected checkout advances', async () => {
    const source = await createSourceRepository();
    await git(source.root, 'checkout', '--quiet', '--detach', source.alternateRevision);

    const content = await withWikiRevisionSnapshot(source, source.root, (snapshotRoot) =>
      fs.readFile(path.join(snapshotRoot, 'source.txt'), 'utf8'),
    );

    expect(content).toBe('committed\n');
  });

  it('preserves an operation failure when worktree removal also fails', async () => {
    const source = await createSourceRepository();
    const operationFailure = new Error('parse failed');
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(
      withWikiSourceSnapshot(source, source.root, async (snapshotRoot) => {
        await git(source.root, 'worktree', 'remove', '--force', snapshotRoot);
        throw operationFailure;
      }),
    ).rejects.toBe(operationFailure);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toBe(
      'Failed to clean up a temporary MUD source snapshot.',
    );
  });
});

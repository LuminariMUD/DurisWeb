import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
let root = '';
let initial = '';
let service: typeof import('../gitService.js');
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({ mud: { directory: root } }),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));
const git = async (...args: string[]) => (await run('git', ['-C', root, ...args])).stdout.trim();

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'durisweb-git-contract-'));
  await git('init', '-b', 'fixture');
  await git('config', 'user.name', 'Synthetic Fixture');
  await git('config', 'user.email', 'fixture@example.invalid');
  for (const ext of ['wld', 'mob', 'obj', 'zon']) {
    await fs.mkdir(path.join(root, 'areas', ext), { recursive: true });
    await fs.writeFile(path.join(root, 'areas', ext, 'zone-a.' + ext), 'original\n');
  }
  await fs.writeFile(path.join(root, 'unrelated.txt'), 'original\n');
  await git('add', '.');
  await git('commit', '-m', 'Initial fixture');
  initial = await git('rev-parse', 'HEAD');
  await git('remote', 'add', 'origin', root);
  await git('update-ref', 'refs/remotes/origin/fixture', initial);
  const cwd = jest.spyOn(process, 'cwd').mockReturnValue(root);
  try {
    service = await import('../gitService.js');
  } finally {
    cwd.mockRestore();
  }
});
beforeEach(async () => {
  jest.clearAllMocks();
  await git('checkout', '-B', 'fixture', initial);
  await git('reset', '--hard', initial);
  await fs.writeFile(path.join(root, 'unrelated.txt'), 'other work\n');
  await git('add', 'unrelated.txt');
});
afterAll(async () => {
  if (!root) return;
  if (!path.resolve(root).startsWith(path.join(os.tmpdir(), 'durisweb-git-contract-')))
    throw new Error('Unsafe fixture cleanup');
  await fs.rm(root, { recursive: true, force: true });
});

describe('zone git publication in a disposable repository', () => {
  it('preserves git status and commit-history readers with argument-array execution', async () => {
    expect(await service.getGitStatus()).toMatchObject({
      currentHash: initial,
      latestRemoteHash: initial,
      branch: 'fixture',
      commitsAhead: 0,
    });
    const result = await service.getCommits(1, 10, true);
    expect(result.pagination.total).toBe(1);
    expect(result.commits[0]).toMatchObject({
      hash: initial,
      message: 'Initial fixture',
      filesChanged: 5,
    });
  });
  it('commits only zone paths and preserves unrelated staged work', async () => {
    await fs.mkdir(path.join(root, 'unrelated/wld'), { recursive: true });
    await fs.writeFile(path.join(root, 'unrelated/wld/zone-a.wld'), 'unrelated zone copy\n');
    await git('add', 'unrelated/wld/zone-a.wld');
    await fs.writeFile(path.join(root, 'areas/wld/zone-a.wld'), 'zone change\n');
    expect(await service.getZoneGitStatus('zone-a')).toEqual({
      modified: true,
      files: [{ path: 'areas/wld/zone-a.wld', status: 'modified' }],
    });
    expect((await service.commitZoneFiles('zone-a', 'Zone change')).success).toBe(true);
    expect(await git('show', '--pretty=format:', '--name-only', 'HEAD')).toBe(
      'areas/wld/zone-a.wld',
    );
    expect(await git('show', 'HEAD:unrelated.txt')).toBe('original');
    expect(await git('diff', '--cached', '--name-only')).toBe(
      'unrelated.txt\nunrelated/wld/zone-a.wld',
    );
  });
  it('does not publish unrelated staged work when the zone has no changes', async () => {
    expect(await service.commitZoneFiles('zone-a', 'No zone changes')).toEqual({
      success: false,
      error: 'No changes to commit',
    });
    expect(await git('rev-parse', 'HEAD')).toBe(initial);
    expect(await git('diff', '--cached', '--name-only')).toBe('unrelated.txt');
  });
  it('includes tracked zone-file deletion without publishing unrelated work', async () => {
    await fs.unlink(path.join(root, 'areas/wld/zone-a.wld'));
    expect((await service.commitZoneFiles('zone-a', 'Remove zone file')).success).toBe(true);
    expect(await git('show', '--pretty=format:', '--name-status', 'HEAD')).toBe(
      'D\tareas/wld/zone-a.wld',
    );
    expect(await git('diff', '--cached', '--name-only')).toBe('unrelated.txt');
  });
  it.each([false, true])(
    'includes an already-staged deletion with another zone change=%s',
    async (otherChange) => {
      await git('rm', 'areas/wld/zone-a.wld');
      if (otherChange) await fs.writeFile(path.join(root, 'areas/mob/zone-a.mob'), 'changed mob\n');
      expect(await service.getZoneGitStatus('zone-a')).toMatchObject({
        modified: true,
        files: expect.arrayContaining([{ path: 'areas/wld/zone-a.wld', status: 'deleted' }]),
      });
      expect((await service.commitZoneFiles('zone-a', 'Publish staged deletion')).success).toBe(
        true,
      );
      const changed = await git('show', '--pretty=format:', '--name-status', 'HEAD');
      expect(changed).toContain('D\tareas/wld/zone-a.wld');
      if (otherChange) expect(changed).toContain('M\tareas/mob/zone-a.mob');
      expect(await git('diff', '--cached', '--name-only')).toBe('unrelated.txt');
    },
  );

  it('preserves literal commit-message punctuation', async () => {
    const message = "Player's zone $(literal) and backticks";
    await fs.writeFile(path.join(root, 'areas/wld/zone-a.wld'), 'zone change\n');
    expect((await service.commitZoneFiles('zone-a', message)).success).toBe(true);
    expect(await git('log', '-1', '--pretty=%B')).toBe(message);
  });
  it('reports a real git failure with a safe reference and preserves staged work', async () => {
    const { default: logger } = await import('../../utils/logger.js');
    const lock = path.join(root, '.git', 'index.lock');
    await fs.writeFile(lock, 'synthetic lock', { flag: 'wx' });
    try {
      const result = await service.commitZoneFiles('zone-a', 'Blocked fixture commit');
      expect(result).toEqual({
        success: false,
        error: expect.stringMatching(/^Failed to commit zone files \(reference /),
      });
      expect(jest.mocked(logger.error).mock.calls).toEqual([
        ['Commit zone files failed', { reference: expect.any(String), code: 'unclassified' }],
      ]);
    } finally {
      await fs.unlink(lock);
    }
    expect(await git('rev-parse', 'HEAD')).toBe(initial);
    expect(await git('diff', '--cached', '--name-only')).toBe('unrelated.txt');
  });
  (process.platform === 'win32' ? it.skip : it)(
    'treats shell metacharacters in a branch name as literal ref data',
    async () => {
      const branch =
        'topic;git' +
        '${IFS}' +
        '-C' +
        '${IFS}' +
        root +
        '${IFS}' +
        'config' +
        '${IFS}' +
        'fixture.injected' +
        '${IFS}' +
        'true;#';
      await git('checkout', '-b', branch);
      const result: unknown = await service.getLatestRemoteHash().then(
        () => null,
        (error: unknown) => error,
      );
      const value = await git('config', '--get', 'fixture.injected').catch(() => '');
      expect(value).toBe('');
      expect(result).toMatchObject({ code: 128 });
    },
  );
});

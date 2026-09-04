import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import logger from '../utils/logger.js';
import type { WikiSourceIdentity } from './wikiGeneration.js';

const executeFile = promisify(execFile);

/** Read one bounded scalar from Git without invoking a shell. */
async function readGitValue(directory: string, args: readonly string[]): Promise<string> {
  const result = await executeFile('git', ['-C', directory, ...args], { encoding: 'utf8' });
  return String(result.stdout).trim();
}

/** Verify that the selected checkout is clean and names the supplied commit and tree. */
export async function verifyWikiSourceCheckout(
  sourceIdentity: WikiSourceIdentity,
  directory: string,
): Promise<void> {
  try {
    const [status, revision, tree] = await Promise.all([
      readGitValue(directory, ['status', '--porcelain']),
      readGitValue(directory, ['rev-parse', '--verify', 'HEAD']),
      readGitValue(directory, ['rev-parse', '--verify', `${sourceIdentity.revision}^{tree}`]),
    ]);

    if (status !== '') throw new Error('refusing to publish from a dirty MUD checkout');
    if (revision !== sourceIdentity.revision || tree !== sourceIdentity.tree) {
      throw new Error('recorded source identity does not match the selected MUD checkout');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('refusing to publish')) throw error;
    if (error instanceof Error && error.message.startsWith('recorded source identity')) throw error;
    throw new Error('could not verify the selected MUD checkout source identity', { cause: error });
  }
}

/** Verify that a repository still contains the exact recorded commit and tree. */
async function verifyWikiSourceRevision(
  sourceIdentity: WikiSourceIdentity,
  directory: string,
): Promise<void> {
  try {
    const [revision, tree] = await Promise.all([
      readGitValue(directory, ['rev-parse', '--verify', `${sourceIdentity.revision}^{commit}`]),
      readGitValue(directory, ['rev-parse', '--verify', `${sourceIdentity.revision}^{tree}`]),
    ]);
    if (revision !== sourceIdentity.revision || tree !== sourceIdentity.tree) {
      throw new Error('recorded MUD source revision does not match its tree');
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'recorded MUD source revision does not match its tree'
    ) {
      throw error;
    }
    throw new Error('recorded MUD source revision is unavailable', { cause: error });
  }
}

/** Run an operation in a temporary detached worktree for an exact recorded revision. */
export async function withWikiRevisionSnapshot<T>(
  sourceIdentity: WikiSourceIdentity,
  directory: string,
  operation: (snapshotRoot: string) => Promise<T>,
): Promise<T> {
  await verifyWikiSourceRevision(sourceIdentity, directory);

  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), 'durisweb-wiki-source-'));
  const snapshotRoot = path.join(temporaryRoot, 'checkout');
  let worktreeAdded = false;
  let operationFailed = false;

  try {
    await executeFile(
      'git',
      [
        '-C',
        directory,
        'worktree',
        'add',
        '--detach',
        '--quiet',
        snapshotRoot,
        sourceIdentity.revision,
      ],
      { encoding: 'utf8' },
    );
    worktreeAdded = true;

    const snapshotTree = await readGitValue(snapshotRoot, ['rev-parse', '--verify', 'HEAD^{tree}']);
    if (snapshotTree !== sourceIdentity.tree) {
      throw new Error('detached MUD snapshot tree does not match the recorded source identity');
    }

    return await operation(snapshotRoot);
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    let cleanupError: unknown = null;
    if (worktreeAdded) {
      try {
        await executeFile('git', ['-C', directory, 'worktree', 'remove', '--force', snapshotRoot], {
          encoding: 'utf8',
        });
      } catch (error) {
        cleanupError = error;
      }
    }
    try {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupError ??= error;
    }

    if (cleanupError) {
      if (operationFailed) {
        logger.error('Failed to clean up a temporary MUD source snapshot.');
      } else {
        throw new Error('failed to clean up temporary MUD source snapshot', {
          cause: cleanupError,
        });
      }
    }
  }
}

/**
 * Materialize a private detached worktree at the verified revision and remove it after the
 * callback. Parsers therefore never read a branch checkout that another Git operation can switch.
 */
export async function withWikiSourceSnapshot<T>(
  sourceIdentity: WikiSourceIdentity,
  directory: string,
  operation: (snapshotRoot: string) => Promise<T>,
): Promise<T> {
  await verifyWikiSourceCheckout(sourceIdentity, directory);
  return withWikiRevisionSnapshot(sourceIdentity, directory, operation);
}

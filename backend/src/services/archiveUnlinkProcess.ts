import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ManagedArchiveTarget } from '../utils/managedArchiveTarget.js';
import { BackupDeletionError } from '../utils/backupDeletionError.js';
import {
  validArchiveWorkerIdentity,
  type ArchiveWorkerIdentity,
} from '../utils/archiveWorkerIdentity.js';

export type ArchiveUnlinkOutcome = 'removed' | 'absent' | 'refused';
const WAIT_MS = 5000;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function bounded<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BackupDeletionError('removal_in_progress')), WAIT_MS);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new BackupDeletionError('file_removal_unconfirmed'));
      },
    );
  });
}
/** No stdio streams or descendant file workers: process exit fences this one-shot unlink. */
export function startArchiveUnlinkWorker() {
  const extension = path.extname(fileURLToPath(import.meta.url));
  const workerPath = fileURLToPath(
    new URL(`../scripts/archiveUnlinkWorker${extension}`, import.meta.url),
  );
  const child = fork(workerPath, [], {
    execArgv:
      extension === '.ts'
        ? [
            '--import',
            fileURLToPath(new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url)),
          ]
        : [],
    env: {},
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  let readySeen = false,
    invalid = false,
    operationId: string | null = null;
  let outcome: ArchiveUnlinkOutcome | null = null;
  let identity: ArchiveWorkerIdentity | null = null;
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const exited = new Promise<ArchiveUnlinkOutcome | null>((resolve) => {
    child.once('exit', (code) => {
      if (!readySeen) readyReject(new Error('Worker did not become ready'));
      resolve(code === 0 && !invalid ? outcome : null);
    });
  });
  child.on('error', () => {
    invalid = true;
    readyReject(new Error('Worker unavailable'));
  });
  child.on('message', (value: unknown) => {
    if (
      object(value) &&
      value.format === 1 &&
      value.type === 'ready' &&
      Object.keys(value).sort().join(',') === 'format,type,worker' &&
      validArchiveWorkerIdentity(value.worker) &&
      value.worker.pid === child.pid &&
      !readySeen
    ) {
      readySeen = true;
      identity = value.worker;
      readyResolve();
      return;
    }
    if (
      object(value) &&
      value.format === 1 &&
      value.type === 'result' &&
      Object.keys(value).sort().join(',') === 'format,operationId,outcome,type' &&
      operationId !== null &&
      value.operationId === operationId &&
      outcome === null &&
      (value.outcome === 'removed' || value.outcome === 'absent' || value.outcome === 'refused')
    ) {
      outcome = value.outcome;
      return;
    }
    invalid = true;
  });
  return {
    identity: (): ArchiveWorkerIdentity => {
      if (!identity) throw new BackupDeletionError('recovery_unverified');
      return identity;
    },
    ready: () => bounded(ready),
    authorize: (id: string, target: ManagedArchiveTarget): Promise<void> => {
      if (!readySeen || invalid || !child.connected || operationId !== null)
        return Promise.reject(new BackupDeletionError('file_removal_unconfirmed'));
      operationId = id;
      return bounded(
        new Promise<void>((resolve, reject) => {
          child.send(
            {
              format: 1,
              type: 'unlink',
              operationId: id,
              root: target.root,
              filename: target.filename,
              rootSha256: target.rootSha256,
              fileSha256: target.fileSha256,
            },
            (error) => {
              if (error) reject(error);
              else resolve();
            },
          );
        }),
      );
    },
    result: () => bounded(exited),
    disconnect: () => {
      // The worker exits itself. Never risk signalling a recycled PID, even during timeout cleanup.
      try {
        if (child.connected) child.disconnect();
      } catch {
        /* Already disconnected. */
      }
    },
  };
}

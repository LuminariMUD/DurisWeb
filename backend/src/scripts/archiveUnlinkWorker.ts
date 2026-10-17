import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { inspectManagedArchive, removeInspectedArchive } from '../utils/managedArchiveTarget.js';
import { captureArchiveWorker } from '../utils/archiveWorkerIdentity.js';

// No application configuration, database credentials, shell or ordinary output is used.
const timer = setTimeout(() => process.exit(2), 5000);
process.once('disconnect', () => process.exit(2));
process.once('message', (message: unknown) => {
  void perform(message).catch(() => process.exit(2));
});
if (!process.send) process.exit(2);
try {
  const worker = await captureArchiveWorker(process.pid);
  process.send({ format: 1, type: 'ready', worker }, (error) => {
    if (error) process.exit(2);
  });
} catch {
  process.exit(2);
}

async function perform(message: unknown): Promise<void> {
  if (!object(message)) process.exit(2);
  const value = message;
  if (
    Object.keys(value).sort().join(',') !==
      'fileSha256,filename,format,operationId,root,rootSha256,type' ||
    value.format !== 1 ||
    value.type !== 'unlink' ||
    typeof value.operationId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.operationId,
    ) ||
    typeof value.root !== 'string' ||
    value.root.length > 4096 ||
    /[\0\r\n]/.test(value.root) ||
    typeof value.filename !== 'string' ||
    value.filename.length > 255 ||
    typeof value.rootSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.rootSha256) ||
    (value.fileSha256 !== null &&
      (typeof value.fileSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.fileSha256)))
  )
    process.exit(2);
  let outcome: 'removed' | 'absent' | 'refused' = 'refused';
  try {
    const target = inspectManagedArchive(value.root, value.filename);
    if (target.rootSha256 === value.rootSha256 && target.fileSha256 === value.fileSha256) {
      outcome = removeInspectedArchive(target);
    }
    if (outcome === 'removed' || outcome === 'absent') {
      const root = await open(
        value.root,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        await root.sync();
      } finally {
        await root.close();
      }
    }
  } catch {
    outcome = 'refused';
    /* A static refused outcome retains identity; no raw filesystem text crosses IPC. */
  }
  process.send?.(
    { format: 1, type: 'result', operationId: value.operationId, outcome },
    (error) => {
      clearTimeout(timer);
      process.exit(error ? 2 : 0);
    },
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

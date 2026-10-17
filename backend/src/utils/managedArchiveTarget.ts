import fs, { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSafeBackupFilePath } from './safeBackupPath.js';
import { BackupDeletionError } from './backupDeletionError.js';

export interface ManagedArchiveTarget {
  root: string;
  filename: string;
  rootSha256: string;
  fileSha256: string | null;
  filePath: string;
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export type ManagedArchiveIdentity = Pick<
  ManagedArchiveTarget,
  'filename' | 'rootSha256' | 'fileSha256'
>;
export interface OpenedManagedArchive extends ManagedArchiveTarget {
  fd: number;
  size: number;
  fileSha256: string;
}
export function managedArchiveFileSha256(file: BigIntStats): string {
  return digest([
    file.dev.toString(),
    file.ino.toString(),
    file.size.toString(),
    file.mtimeNs.toString(),
    file.ctimeNs.toString(),
  ]);
}
/** Inspect outside SQL transactions; no archive contents are read or logged. */
export function inspectManagedArchive(root: string, filename: string): ManagedArchiveTarget {
  const canonical = fs.realpathSync.native(root);
  const filesystem = fs.statfsSync(canonical, { bigint: true });
  // Process exit fences local VFS work, not an outstanding remote-fileserver request.
  if (![0xef53n, 0x58465342n, 0x9123683en].includes(filesystem.type))
    throw new BackupDeletionError('recovery_unverified');
  const directory = fs.statSync(canonical, { bigint: true });
  if (!directory.isDirectory() || !path.isAbsolute(canonical))
    throw new Error('Invalid archive root');
  const filePath = resolveSafeBackupFilePath(canonical, filename);
  try {
    fs.lstatSync(managedArchiveRemovalDirectory(canonical, filename));
    throw new BackupDeletionError('recovery_unverified');
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
      throw error;
  }
  let fileSha256: string | null = null;
  try {
    const file = fs.lstatSync(filePath, { bigint: true });
    if (!file.isFile() || file.isSymbolicLink() || file.dev !== directory.dev)
      throw new Error('Invalid archive file');
    fileSha256 = managedArchiveFileSha256(file);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
      throw error;
  }
  return {
    root: canonical,
    filename,
    filePath,
    fileSha256,
    rootSha256: digest([
      canonical,
      filesystem.type.toString(),
      directory.dev.toString(),
      directory.ino.toString(),
    ]),
  };
}

/** Caller owns fd: close it or transfer it to an auto-closing stream/child. */
export function openManagedArchive(
  root: string,
  filename: string,
  expected?: ManagedArchiveIdentity,
): OpenedManagedArchive {
  const target = inspectManagedArchive(root, filename);
  const fileSha256 = target.fileSha256;
  if (
    fileSha256 === null ||
    (expected &&
      (target.filename !== expected.filename ||
        target.rootSha256 !== expected.rootSha256 ||
        fileSha256 !== expected.fileSha256))
  )
    throw new BackupDeletionError('recovery_unverified');
  const fd = fs.openSync(
    target.filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const file = fs.fstatSync(fd, { bigint: true });
    const size = Number(file.size);
    if (
      !file.isFile() ||
      managedArchiveFileSha256(file) !== fileSha256 ||
      !Number.isSafeInteger(size) ||
      size < 0
    )
      throw new BackupDeletionError('recovery_unverified');
    return { ...target, fileSha256, fd, size };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

/** A retained custody directory blocks absence-based retry after an interrupted removal. */
export function managedArchiveRemovalDirectory(root: string, filename: string): string {
  return path.join(root, '.archive-removal-' + digest(filename));
}
/** Capture a shared pathname before deleting; never unlink the shared pathname itself. */
export function removeInspectedArchive(target: ManagedArchiveTarget): 'removed' | 'absent' {
  if (target.fileSha256 === null) return 'absent';
  const source = openManagedArchive(target.root, target.filename, target);
  const custody = managedArchiveRemovalDirectory(target.root, target.filename);
  let rootFd: number | undefined, custodyFd: number | undefined;
  try {
    const before = fs.fstatSync(source.fd, { bigint: true });
    rootFd = fs.openSync(
      target.root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    fs.mkdirSync(custody, { mode: 0o700 });
    custodyFd = fs.openSync(
      custody,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    fs.fsyncSync(rootFd);
    const captured = '/proc/self/fd/' + custodyFd + '/payload';
    fs.renameSync('/proc/self/fd/' + rootFd + '/' + target.filename, captured);
    fs.fsyncSync(custodyFd);
    fs.fsyncSync(rootFd);
    const after = fs.lstatSync(captured, { bigint: true });
    // Rename changes ctime; the pinned descriptor prevents inode reuse. Bytes/shape must agree.
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.mode !== before.mode ||
      after.nlink !== before.nlink
    )
      throw new BackupDeletionError('recovery_unverified');
    fs.unlinkSync(captured);
    fs.fsyncSync(custodyFd);
    fs.rmdirSync(custody);
    fs.fsyncSync(rootFd);
    // A competing publisher may have created a new shared name; retain its metadata too.
    if (inspectManagedArchive(target.root, target.filename).fileSha256 !== null)
      throw new BackupDeletionError('recovery_unverified');
    return 'removed';
  } finally {
    fs.closeSync(source.fd);
    if (custodyFd !== undefined) fs.closeSync(custodyFd);
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

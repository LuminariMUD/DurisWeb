import fs from 'node:fs';
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
  let fileSha256: string | null = null;
  try {
    const file = fs.lstatSync(filePath, { bigint: true });
    if (!file.isFile() || file.isSymbolicLink() || file.dev !== directory.dev)
      throw new Error('Invalid archive file');
    fileSha256 = digest([
      file.dev.toString(),
      file.ino.toString(),
      file.size.toString(),
      file.mtimeNs.toString(),
      file.ctimeNs.toString(),
    ]);
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

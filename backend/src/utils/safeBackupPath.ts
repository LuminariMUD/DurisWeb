import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UPLOAD_FILENAME_PATTERN = /^backup-upload-[0-9]+-[0-9]+\.zip$/;
const BACKUP_FILENAME_PATTERN = /^duris-(?:mud|hourly)-[A-Za-z0-9-]+\.zip$/;

export class UnsafeBackupPathError extends Error {
  constructor(message = 'Invalid or unsafe backup path') {
    super(message);
    this.name = 'UnsafeBackupPathError';
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function resolveSafeFile(
  rootDirectory: string,
  filePath: unknown,
  filenamePattern: RegExp,
): string {
  if (typeof filePath !== 'string' || filePath.includes('\0') || filePath.includes('\\')) {
    throw new UnsafeBackupPathError();
  }

  const root = path.resolve(rootDirectory);
  const candidate = path.resolve(filePath);
  const filename = path.basename(candidate);
  if (
    !isWithin(root, candidate) ||
    path.dirname(candidate) !== root ||
    !filenamePattern.test(filename)
  ) {
    throw new UnsafeBackupPathError();
  }

  if (!fs.existsSync(root)) {
    throw new UnsafeBackupPathError('Backup root does not exist');
  }

  const canonicalRoot = fs.realpathSync.native(root);
  if (!isWithin(canonicalRoot, fs.realpathSync.native(root))) {
    throw new UnsafeBackupPathError();
  }

  if (fs.existsSync(candidate)) {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new UnsafeBackupPathError('Backup file must be a regular file');
    }
    if (!isWithin(canonicalRoot, fs.realpathSync.native(candidate))) {
      throw new UnsafeBackupPathError('Backup file resolves outside its root');
    }
  }

  return candidate;
}

export function resolveSafeUploadedBackupPath(
  filePath: unknown,
  uploadDirectory: string = os.tmpdir(),
): string {
  return resolveSafeFile(uploadDirectory, filePath, UPLOAD_FILENAME_PATTERN);
}

export function resolveSafeBackupFilePath(backupDirectory: string, filename: unknown): string {
  if (typeof filename !== 'string') throw new UnsafeBackupPathError();
  return resolveSafeFile(
    backupDirectory,
    path.resolve(backupDirectory, filename),
    BACKUP_FILENAME_PATTERN,
  );
}

import fs from 'node:fs';
import path from 'node:path';

export const ZONE_FILE_TYPES = ['wld', 'mob', 'obj', 'zon'] as const;
export const ZONE_DIRECTORY_NAMES = [...ZONE_FILE_TYPES, 'map'] as const;
export type ZoneFileType = (typeof ZONE_FILE_TYPES)[number];

const ZONE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class UnsafeZonePathError extends Error {
  constructor(message = 'Invalid or unsafe zone path') {
    super(message);
    this.name = 'UnsafeZonePathError';
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertZoneId(zoneId: unknown): asserts zoneId is string {
  if (typeof zoneId !== 'string' || !ZONE_ID_PATTERN.test(zoneId)) {
    throw new UnsafeZonePathError('Invalid zone ID');
  }
}

function assertFileType(fileType: string): asserts fileType is ZoneFileType {
  if (!(ZONE_FILE_TYPES as readonly string[]).includes(fileType)) {
    throw new UnsafeZonePathError('Invalid zone file type');
  }
}

function assertDirectoryName(directoryName: string): asserts directoryName is typeof ZONE_DIRECTORY_NAMES[number] {
  if (!(ZONE_DIRECTORY_NAMES as readonly string[]).includes(directoryName)) {
    throw new UnsafeZonePathError('Invalid zone directory');
  }
}

function assertNoSymlinkComponents(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === '' || path.isAbsolute(relative) || relative.startsWith('..')) {
    return;
  }

  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new UnsafeZonePathError('Zone path contains a symbolic link');
      }
    } catch (error) {
      if (error instanceof UnsafeZonePathError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      break;
    }
  }
}

function resolveSafeNamedFilePath(
  areasDir: string,
  directoryName: string,
  zoneId: string,
  extension: string,
): string {
  const root = path.resolve(areasDir);
  const candidate = path.resolve(root, directoryName, `${zoneId}.${extension}`);
  if (!isWithin(root, candidate)) {
    throw new UnsafeZonePathError('Zone path escapes the areas root');
  }

  if (!fs.existsSync(root)) {
    throw new UnsafeZonePathError('Areas root does not exist');
  }

  const canonicalRoot = fs.realpathSync.native(root);
  assertNoSymlinkComponents(root, candidate);

  let nearestExisting = candidate;
  while (!fs.existsSync(nearestExisting)) {
    const parent = path.dirname(nearestExisting);
    if (parent === nearestExisting) {
      throw new UnsafeZonePathError('Zone path has no existing parent');
    }
    nearestExisting = parent;
  }

  const canonicalExisting = fs.realpathSync.native(nearestExisting);
  if (!isWithin(canonicalRoot, canonicalExisting)) {
    throw new UnsafeZonePathError('Zone path resolves outside the areas root');
  }

  if (fs.existsSync(candidate)) {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      throw new UnsafeZonePathError('Zone file is a symbolic link');
    }
    const canonicalCandidate = fs.realpathSync.native(candidate);
    if (!isWithin(canonicalRoot, canonicalCandidate)) {
      throw new UnsafeZonePathError('Zone file resolves outside the areas root');
    }
  }

  return candidate;
}

/**
 * Resolve and verify a zone file path under the configured areas root.
 * Existing symlinks and symlinked directory components are rejected; for a
 * new file, its nearest existing parent must canonicalize beneath the root.
 */
export function resolveSafeZoneFilePath(
  areasDir: string,
  zoneId: unknown,
  fileType: string,
): string {
  assertZoneId(zoneId);
  assertFileType(fileType);
  return resolveSafeNamedFilePath(areasDir, fileType, zoneId, fileType);
}

export function resolveSafeZoneMapPath(areasDir: string, zoneId: unknown): string {
  assertZoneId(zoneId);
  return resolveSafeNamedFilePath(areasDir, 'map', zoneId, 'json');
}

export function resolveSafeZoneDirectoryPath(
  areasDir: string,
  fileType: string,
): string {
  assertDirectoryName(fileType);
  const root = path.resolve(areasDir);
  const directory = path.resolve(root, fileType);
  if (!isWithin(root, directory) || !fs.existsSync(root)) {
    throw new UnsafeZonePathError('Invalid areas directory');
  }
  const canonicalRoot = fs.realpathSync.native(root);
  assertNoSymlinkComponents(root, directory);
  if (fs.existsSync(directory) && !isWithin(canonicalRoot, fs.realpathSync.native(directory))) {
    throw new UnsafeZonePathError('Zone directory resolves outside the areas root');
  }
  return directory;
}

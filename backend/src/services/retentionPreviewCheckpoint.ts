import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import {
  parseRetentionCheckpoint,
  RetentionPreviewError,
  type RetentionPreviewCheckpoint,
} from './retentionPreview.js';

function requirePrivateFileSupport(filename: string): number {
  if (!path.isAbsolute(filename) || typeof process.getuid !== 'function' || !constants.O_NOFOLLOW)
    throw new RetentionPreviewError('private_checkpoint_required');
  return process.getuid();
}

/** Never follow a link, read an oversized file, or accept a shared checkpoint. */
export async function readRetentionCheckpoint(
  filename: string,
): Promise<RetentionPreviewCheckpoint> {
  const uid = requirePrivateFileSupport(filename);
  let file;
  try {
    file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== uid ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 16384
    )
      throw new RetentionPreviewError('private_checkpoint_required');
    const data = Buffer.alloc(16385);
    const { bytesRead } = await file.read(data, 0, data.length, 0);
    if (bytesRead > 16384) throw new RetentionPreviewError('invalid_checkpoint');
    return parseRetentionCheckpoint(data.subarray(0, bytesRead).toString('utf8'));
  } catch (error) {
    throw error instanceof RetentionPreviewError
      ? error
      : new RetentionPreviewError('checkpoint_read_failed');
  } finally {
    await file?.close();
  }
}

/** Immutable 0600 continuation evidence; an existing destination is never overwritten. */
export async function writeRetentionCheckpoint(
  filename: string,
  state: RetentionPreviewCheckpoint,
): Promise<void> {
  const uid = requirePrivateFileSupport(filename);
  const data = JSON.stringify(parseRetentionCheckpoint(JSON.stringify(state))) + '\n';
  let file;
  try {
    file = await open(
      filename,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== uid || stat.nlink !== 1 || (stat.mode & 0o077) !== 0)
      throw new RetentionPreviewError('private_checkpoint_required');
    await file.writeFile(data, 'utf8');
    await file.sync();
  } catch (error) {
    throw error instanceof RetentionPreviewError
      ? error
      : new RetentionPreviewError('checkpoint_write_failed');
  } finally {
    await file?.close();
  }
}

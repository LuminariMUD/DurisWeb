import fs from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import {
  beginBackupUpload,
  backupUploadPath,
  checkpointBackupUpload,
  BackupUploadError,
} from './backupUploads.js';

const references = new WeakMap<Request, string>();
export function requestBackupUploadReference(request: Request): string | undefined {
  return references.get(request);
}

async function store(
  request: Request,
  file: Express.Multer.File,
  wasLimited: () => boolean,
): Promise<Partial<Express.Multer.File>> {
  const actor = request.user?.accountName ?? '';
  const record = await beginBackupUpload(actor);
  references.set(request, record.id);
  let output: fs.WriteStream | undefined, transferred: Promise<void> | undefined;
  const abort = () => {
    file.stream.destroy(new BackupUploadError('storage_unconfirmed', record.id));
    output?.destroy();
  };
  try {
    const destination = backupUploadPath(record);
    output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600, flush: true });
    transferred = pipeline(file.stream, output);
    request.once('aborted', abort);
    if (request.aborted) abort();
    await transferred;
    const directory = await open(path.dirname(destination), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    if (wasLimited()) {
      await checkpointBackupUpload(record.id, actor, 'closed', 'too_large');
      throw new BackupUploadError('too_large', record.id);
    }
    const checkpoint = await checkpointBackupUpload(record.id, actor, 'inspection');
    return {
      destination: path.dirname(destination),
      filename: path.basename(destination),
      path: destination,
      size: checkpoint.size ?? 0,
    };
  } catch (error) {
    output?.destroy();
    if (transferred) await Promise.allSettled([transferred]);
    if (!(error instanceof BackupUploadError && error.reason === 'too_large'))
      try {
        await checkpointBackupUpload(
          record.id,
          actor,
          'closed',
          wasLimited() ? 'too_large' : 'storage_unconfirmed',
        );
      } catch {
        throw new BackupUploadError('recovery_unverified', record.id);
      }
    throw error instanceof BackupUploadError
      ? error
      : new BackupUploadError(wasLimited() ? 'too_large' : 'storage_unconfirmed', record.id);
  } finally {
    request.removeListener('aborted', abort);
  }
}

/** Multer must never unlink registered bytes outside the hold-aware managed remover. */
export const backupUploadStorage: StorageEngine = {
  _handleFile(request, file, callback) {
    // Busboy can reach the limit while the durable registration is awaiting SQL.
    let limited = false;
    const limit = () => {
      limited = true;
    };
    file.stream.once('limit', limit);
    void store(request, file, () => limited).then(
      (result) => {
        file.stream.removeListener('limit', limit);
        callback(null, result);
      },
      (error) => {
        file.stream.removeListener('limit', limit);
        callback(error);
      },
    );
  },
  _removeFile(_request, _file, callback) {
    callback(null);
  },
};

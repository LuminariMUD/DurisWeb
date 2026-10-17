import multer from 'multer';
import type { Request, Response } from 'express';
import logger from '../utils/logger.js';
import { getBackendConfiguration } from '../config/environment.js';
import { backupUploadStorage, requestBackupUploadReference } from './backupUploadStorage.js';
import {
  BackupUploadError,
  readBackupUpload,
  checkpointBackupUpload,
  cancelBackupUpload,
  uploadFilename,
  recoverBackupUpload,
} from './backupUploads.js';
import { inspectBackupArchive } from './backupInspection.js';

const upload = multer({
  storage: backupUploadStorage,
  limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip'))
      callback(null, true);
    else callback(new BackupUploadError('invalid_archive'));
  },
});
function failure(
  response: Response,
  error: unknown,
  reference?: string,
  cleanup: 'retained' | 'removed' | 'unconfirmed' = 'unconfirmed',
) {
  const problem =
    error instanceof BackupUploadError
      ? error
      : new BackupUploadError('storage_unconfirmed', reference);
  logger.warn('backup_upload_unconfirmed', {
    reason: problem.reason,
    reference: problem.reference,
  });
  if (!response.destroyed && !response.headersSent)
    response.status(problem.status).json({
      error: `${problem.message} Reference: ${problem.reference}`,
      reason: problem.reason,
      reference: problem.reference,
      uploadReference: reference && /^[a-f0-9-]{36}$/.test(reference) ? reference : undefined,
      cleanup,
    });
}
/** Multer's error cleanup retains bytes; this handler alone requests managed removal. */
export async function receiveBackupUpload(request: Request, response: Response): Promise<void> {
  let middlewareError: unknown;
  await new Promise<void>((resolve) => {
    upload.single('backup')(request, response, (error) => {
      middlewareError = error;
      resolve();
    });
  });
  const reference = requestBackupUploadReference(request),
    actor = request.user?.accountName ?? '';
  try {
    if (!reference)
      throw middlewareError instanceof BackupUploadError
        ? middlewareError
        : new BackupUploadError('invalid_archive');
    let record = await readBackupUpload(reference, actor);
    if (record.phase === 'writing') throw new BackupUploadError('recovery_unverified', reference);
    if (record.phase === 'inspection') {
      if (middlewareError) {
        const oversized =
          middlewareError instanceof multer.MulterError &&
          middlewareError.code === 'LIMIT_FILE_SIZE';
        record = await checkpointBackupUpload(
          reference,
          actor,
          'closed',
          oversized ? 'too_large' : 'invalid_archive',
        );
      } else {
        const inspected = await inspectBackupArchive(
          getBackendConfiguration().backupDirectory,
          uploadFilename(reference),
        );
        record = await checkpointBackupUpload(
          reference,
          actor,
          'closed',
          inspected.outcome === 'valid'
            ? null
            : inspected.outcome === 'invalid'
              ? 'invalid_archive'
              : 'inspection_unconfirmed',
        );
        if (inspected.outcome === 'valid' && record.verdict === 'valid') {
          response.json({
            success: true,
            tempPath: reference,
            uploadReference: reference,
            backupId: record.backupId,
            contents: inspected.contents,
          });
          return;
        }
      }
    }
    const problem = new BackupUploadError(record.failure ?? 'inspection_unconfirmed', reference);
    if (record.verdict === 'invalid') {
      try {
        await cancelBackupUpload(reference, actor);
        failure(response, problem, reference, 'removed');
      } catch (error) {
        failure(
          response,
          error,
          reference,
          error instanceof BackupUploadError && error.reason === 'preserved'
            ? 'retained'
            : 'unconfirmed',
        );
      }
    } else failure(response, problem, reference, 'retained');
  } catch (error) {
    failure(response, error, reference);
  }
}
export async function cancelRegisteredBackupUpload(
  request: Request,
  response: Response,
): Promise<void> {
  const reference: unknown = request.body?.tempPath;
  if (typeof reference !== 'string') {
    failure(response, new BackupUploadError('invalid_reference'));
    return;
  }
  try {
    const result = await cancelBackupUpload(
      reference,
      request.user?.accountName ?? '',
      request.user?.permissions.role === 'overlord',
    );
    response.json({
      success: true,
      message: 'Upload cleanup confirmed',
      reference: result.reference,
    });
  } catch (error) {
    failure(response, error, reference);
  }
}
export async function recoverRegisteredBackupUpload(
  request: Request,
  response: Response,
): Promise<void> {
  const reference: unknown = request.body?.tempPath;
  if (typeof reference !== 'string') {
    failure(response, new BackupUploadError('invalid_reference'));
    return;
  }
  try {
    const record = await recoverBackupUpload(
      reference,
      request.user?.accountName ?? '',
      request.user?.permissions.role === 'overlord',
    );
    response.json({
      success: true,
      reference,
      phase: record.phase,
      verdict: record.verdict,
      backupId: record.backupId,
    });
  } catch (error) {
    failure(response, error, reference);
  }
}

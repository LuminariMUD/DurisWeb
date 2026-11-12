import {
  receiveBackupUpload,
  cancelRegisteredBackupUpload,
  recoverRegisteredBackupUpload,
  streamBackupDownload,
} from '../../services/backupUploadHandlers.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth, requireOverlord, requirePermission } from '../../middleware/auth.js';
import { requireMutationGate } from '../../middleware/mutationGate.js';
import { BackupDeletionError } from '../../utils/backupDeletionError.js';
import { BackupCreationError } from '../../services/databaseBackupArchive.js';
import {
  BackupUploadError,
  readBackupUpload,
  registeredUploadFile,
} from '../../services/backupUploads.js';
import { getBackendConfiguration } from '../../config/environment.js';
import {
  openManagedArchive,
  type ManagedArchiveIdentity,
} from '../../utils/managedArchiveTarget.js';
import {
  createBackup,
  getBackupList,
  getBackupById,
  getBackupFilePath,
  deleteBackup,
  deleteFailedBackups,
  listBackupContents,
  getRestoreById,
  getRestoreList,
  isMudRunning,
} from '../../services/backupService.js';
import { validateIdParam } from '../../utils/validation.js';
import { sendRouteError } from '../../utils/routeError.js';

export const adminBackupRoutes: IRouter = Router();

// ============================================================================
// MUD Backup Routes
// ============================================================================

/**
 * GET /api/admin/backup/list
 * List all backups
 */
adminBackupRoutes.get(
  '/backup/list',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (_req: Request, res: Response) => {
    try {
      const listed = await getBackupList();
      const backups = listed.filter(
        (backup) =>
          !backup.uploadReference ||
          backup.createdBy === _req.user?.accountName ||
          _req.user?.permissions.role === 'overlord',
      );
      return res.json({ backups });
    } catch (error) {
      logger.error('List backups error:', error);
      return sendRouteError(res, error, 'Failed to list backups', 'Failed to list backups');
    }
  },
);

/**
 * POST /api/admin/backup/create
 * Start a new backup
 */
adminBackupRoutes.post(
  '/backup/create',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (req: Request, res: Response) => {
    try {
      const accountName = req.user?.accountName || 'unknown';
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      const result = await createBackup(accountName, ipAddress);
      return res.json({
        success: true,
        message: 'Backup started',
        ...result,
      });
    } catch (error) {
      const failure = error instanceof BackupCreationError ? error : new BackupCreationError();
      logger.error('backup_creation_unconfirmed', {
        reason: 'creation_unconfirmed',
        reference: failure.reference,
      });
      return res.status(500).json({
        error: failure.message,
        reason: 'creation_unconfirmed',
        reference: failure.reference,
      });
    }
  },
);

/**
 * GET /api/admin/backup/status/:id
 * Get backup status (fallback for polling)
 */
adminBackupRoutes.get(
  '/backup/status/:id',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (req: Request, res: Response) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid backup ID' });
      }

      const backup = await getBackupById(id);
      if (!backup) {
        return res.status(404).json({ error: 'Backup not found' });
      }

      if (backup.uploadReference)
        await readBackupUpload(
          backup.uploadReference,
          req.user?.accountName ?? '',
          req.user?.permissions.role === 'overlord',
        );
      return res.json({ backup });
    } catch (error) {
      return respondBackupReadFailure(res, error);
    }
  },
);

/**
 * GET /api/admin/backup/download/:id
 * Download a completed backup
 */
adminBackupRoutes.get(
  '/backup/download/:id',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        res.status(400).json({ error: 'Invalid backup ID' });
        return;
      }

      const backup = await getBackupById(id);
      if (!backup) {
        res.status(404).json({ error: 'Backup not found' });
        return;
      }

      if (backup.status !== 'completed' && !backup.uploadReference) {
        res.status(400).json({ error: 'Backup is not ready for download' });
        return;
      }

      const opened = backup.uploadReference
        ? await registeredUploadFile(
            backup.uploadReference,
            req.user?.accountName ?? '',
            req.user?.permissions.role === 'overlord',
          )
        : (await getBackupFilePath(id))
          ? openManagedArchive(getBackendConfiguration().backupDirectory, backup.filename)
          : null;
      if (!opened) {
        res.status(404).json({ error: 'Backup file not found' });
        return;
      }
      streamBackupDownload(res, opened);
    } catch (error) {
      if (!res.headersSent) {
        respondBackupReadFailure(res, error);
      }
    }
  },
);

function respondBackupReadFailure(res: Response, error: unknown): Response {
  // Numeric IDs must not distinguish another owner's retained upload from an absent backup.
  if (error instanceof BackupUploadError && error.reason === 'not_found')
    return res.status(404).json({ error: 'Backup not found' });
  const failure =
    error instanceof BackupUploadError ? error : new BackupUploadError('storage_unconfirmed');
  logger.warn('backup_read_unconfirmed', {
    reason: failure.reason,
    reference: failure.reference,
  });
  return res.status(failure.status).json({
    error: failure.message,
    reason: failure.reason,
    reference: failure.reference,
  });
}

function respondBackupDeletionFailure(res: Response, error: unknown): Response {
  const failure =
    error instanceof BackupDeletionError ? error : new BackupDeletionError('storage_unavailable');
  logger.error('[Backup] Archive removal stopped', {
    reason: failure.reason,
    reference: failure.reference,
  });
  const status = [
    'invalid_archive',
    'archive_in_progress',
    'shared_archive',
    'archive_held',
    'removal_in_progress',
    'recovery_unverified',
  ].includes(failure.reason)
    ? 409
    : 503;
  return res.status(status).json({
    error: failure.message,
    reason: failure.reason,
    reference: failure.reference,
  });
}

/**
 * DELETE /api/admin/backup/failed
 * Delete all failed backups (overlord only)
 */
adminBackupRoutes.delete(
  '/backup/failed',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const deletedCount = await deleteFailedBackups();
      return res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} failed backup(s)`,
      });
    } catch (error) {
      return respondBackupDeletionFailure(res, error);
    }
  },
);

/**
 * DELETE /api/admin/backup/:id
 * Delete a backup (overlord only)
 */
adminBackupRoutes.delete(
  '/backup/:id',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid backup ID' });
      }

      const deleted = await deleteBackup(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Backup not found' });
      }

      return res.json({
        success: true,
        message: 'Backup deleted successfully',
      });
    } catch (error) {
      return respondBackupDeletionFailure(res, error);
    }
  },
);

/**
 * GET /api/admin/backup/:id/contents
 * List accounts and characters in a backup
 */
adminBackupRoutes.get(
  '/backup/:id/contents',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (req: Request, res: Response) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid backup ID' });
      }

      const record = await getBackupById(id);
      let expected: ManagedArchiveIdentity | undefined;
      if (record?.uploadReference) {
        const upload = await readBackupUpload(
          record.uploadReference,
          req.user?.accountName ?? '',
          req.user?.permissions.role === 'overlord',
        );
        if (upload.phase !== 'closed') throw new BackupUploadError('receiving', upload.id);
        expected = {
          filename: record.filename,
          rootSha256: upload.rootSha256,
          fileSha256: upload.fileSha256,
        };
      }
      const contents = await listBackupContents(id, expected);
      if (!contents) {
        return res.status(404).json({ error: 'Backup not found' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.json(contents);
    } catch (error) {
      return respondBackupReadFailure(res, error);
    }
  },
);

/**
 * GET /api/admin/backup/mud-status
 * Check if MUD is currently running
 */
adminBackupRoutes.get(
  '/backup/mud-status',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (_req: Request, res: Response) => {
    try {
      const running = isMudRunning();
      return res.json({ running });
    } catch (error) {
      logger.error('Check MUD status error:', error);
      return res.status(500).json({ error: 'Failed to check MUD status' });
    }
  },
);

/**
 * POST /api/admin/backup/restore
 * Compatibility route: permission checked, then unconditionally unavailable.
 */
adminBackupRoutes.post(
  '/backup/restore',
  requireAuth,
  requirePermission('manage_mud_backup'),
  requireMutationGate('databaseRestore'),
);

/**
 * GET /api/admin/restore/list
 * Get list of all restore operations
 */
adminBackupRoutes.get(
  '/restore/list',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (_req: Request, res: Response) => {
    try {
      const restores = await getRestoreList();
      return res.json(restores);
    } catch (error) {
      logger.error('Get restore list error:', error);
      return sendRouteError(res, error, 'Failed to get restore list', 'Failed to get restore list');
    }
  },
);

/**
 * GET /api/admin/restore/status/:id
 * Get status of a specific restore operation
 */
adminBackupRoutes.get(
  '/restore/status/:id',
  requireAuth,
  requirePermission('manage_mud_backup'),
  async (req: Request, res: Response) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid restore ID' });
      }

      const restore = await getRestoreById(id);
      if (!restore) {
        return res.status(404).json({ error: 'Restore not found' });
      }

      return res.json(restore);
    } catch (error) {
      logger.error('Get restore status error:', error);
      return sendRouteError(
        res,
        error,
        'Failed to get restore status',
        'Failed to get restore status',
      );
    }
  },
);

// ============================================================================
// BACKUP UPLOAD ENDPOINTS
// ============================================================================

// Registered persistent uploads; restore remains unconditionally gated.
adminBackupRoutes.post(
  '/backup/upload',
  requireAuth,
  requirePermission('manage_mud_backup'),
  receiveBackupUpload,
);
adminBackupRoutes.post(
  '/backup/upload/restore',
  requireAuth,
  requirePermission('manage_mud_backup'),
  requireMutationGate('databaseRestore'),
);
adminBackupRoutes.delete(
  '/backup/upload/cancel',
  requireAuth,
  requirePermission('manage_mud_backup'),
  cancelRegisteredBackupUpload,
);
adminBackupRoutes.post(
  '/backup/upload/recover',
  requireAuth,
  requirePermission('manage_mud_backup'),
  recoverRegisteredBackupUpload,
);

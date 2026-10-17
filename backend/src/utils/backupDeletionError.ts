import { randomUUID } from 'node:crypto';

export class BackupDeletionError extends Error {
  readonly reference = randomUUID();

  constructor(
    readonly reason:
      | 'invalid_archive'
      | 'archive_in_progress'
      | 'shared_archive'
      | 'file_removal_unconfirmed'
      | 'storage_unavailable',
  ) {
    super(
      'Backup cleanup stopped. Earlier removals may have completed. Refresh the list and retry retained work after investigation.',
    );
    this.name = 'BackupDeletionError';
  }
}

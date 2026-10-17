import { randomUUID } from 'node:crypto';

export class BackupDeletionError extends Error {
  readonly reference: string;

  constructor(
    readonly reason:
      | 'invalid_archive'
      | 'archive_in_progress'
      | 'shared_archive'
      | 'archive_held'
      | 'removal_in_progress'
      | 'recovery_unverified'
      | 'file_removal_unconfirmed'
      | 'storage_unavailable',
    reference: string = randomUUID(),
  ) {
    super(
      reason === 'archive_held'
        ? 'A data hold stopped archive cleanup. Earlier removals may have completed; remaining records were kept.'
        : reason === 'removal_in_progress'
          ? 'Archive cleanup is still being confirmed. Refresh the list before retrying.'
          : reason === 'recovery_unverified'
            ? 'Archive cleanup needs operator review. Its recovery record was preserved.'
            : 'Backup cleanup stopped. Earlier removals may have completed. Refresh the list and retry retained work after investigation.',
    );
    this.name = 'BackupDeletionError';
    this.reference = reference;
  }
}

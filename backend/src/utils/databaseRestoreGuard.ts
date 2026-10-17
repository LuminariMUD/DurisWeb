/** A runtime override cannot supply the missing ownership and privacy replay contract. */
export const DATABASE_RESTORE_UNAVAILABLE_REASON =
  'Website database restore is unavailable: the legacy row merge cannot preserve MUD ownership or reapply current data holds and removal history. Use the protected operator recovery procedure.';

export class DatabaseRestoreUnavailableError extends Error {
  readonly code = 'restore_unavailable';

  constructor() {
    super(DATABASE_RESTORE_UNAVAILABLE_REASON);
    this.name = 'DatabaseRestoreUnavailableError';
  }
}

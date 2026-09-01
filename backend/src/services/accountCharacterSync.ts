import logger from '../utils/logger.js';

/**
 * @deprecated MUD now writes directly to database - sync is no longer needed.
 * These functions are kept as no-ops for backwards compatibility.
 */

export async function syncAccountCharacters(): Promise<void> {
  logger.warn(
    '[AccountSync] syncAccountCharacters is deprecated - MUD writes directly to database',
  );
}

export function startAccountSyncService(_intervalSeconds: number = 300): void {
  logger.warn(
    '[AccountSync] startAccountSyncService is deprecated - MUD writes directly to database',
  );
}

export function stopAccountSyncService(): void {
  // no-op
}

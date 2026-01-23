/**
 * @deprecated Use accountService.ts instead - this file previously read from pfiles which are no longer used.
 * The MUD now writes directly to database.
 *
 * This file re-exports from accountService for backwards compatibility.
 */

// re-export everything from accountService for backwards compat
export {
  MudAccountCharacter,
  MudAccountData,
  getAccount,
  parseAccountFile,
  accountExists,
  clearAccountCache,
  isBcryptHash,
  findAccountByCharacter,
  searchAccounts,
  updateAccountPassword,
} from './accountService.js';

/**
 * @deprecated This function is no longer needed - data is now in database.
 * Kept as a no-op for backwards compatibility.
 */
export async function forEachAccountFile(): Promise<void> {
  console.warn('forEachAccountFile is deprecated - data is now in database');
}

/**
 * @deprecated This function is no longer needed - file paths are not used.
 * Kept for backwards compatibility but always returns empty string.
 */
export function getAccountFilePath(_accountName: string): string {
  console.warn('getAccountFilePath is deprecated - data is now in database');
  return '';
}

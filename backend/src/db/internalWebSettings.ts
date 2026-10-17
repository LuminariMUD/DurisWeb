/** Internal immutable hook receipts never enter generic settings APIs. */
export const HOOK_JOURNAL_PREFIX = 'hook-audit-v1:';
export function isHookJournalKey(key: string): boolean {
  return key.toLowerCase().startsWith(HOOK_JOURNAL_PREFIX);
}

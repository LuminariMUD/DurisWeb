/** Internal receipts never enter generic settings APIs. */
export const HOOK_JOURNAL_PREFIX = 'hook-audit-v1:';
export const PRIVACY_CHOICE_PREFIX = 'privacy-choice-v1:';
export function isHookJournalKey(key: string): boolean {
  return key.toLowerCase().startsWith(HOOK_JOURNAL_PREFIX);
}
export function isInternalWebSettingKey(key: string): boolean {
  return isHookJournalKey(key) || key.toLowerCase().startsWith(PRIVACY_CHOICE_PREFIX);
}

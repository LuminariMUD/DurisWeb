export interface PrivacyPolicy {
  readonly noticeVersion: string;
  readonly choiceVersion: string;
  readonly approved: boolean;
  readonly collectionEnabled: boolean;
  readonly retentionReady: boolean;
  readonly preferenceLifetimeSeconds: number;
}

/** Draft values cannot authorize collection or receipt storage. See the lifecycle inventory. */
const policy: PrivacyPolicy = Object.freeze({
  noticeVersion: '2026-10-16-draft-1',
  choiceVersion: '2026-10-16-draft-1',
  approved: false,
  collectionEnabled: false,
  retentionReady: false,
  preferenceLifetimeSeconds: 180 * 24 * 60 * 60,
});

export function getPrivacyPolicy(): PrivacyPolicy {
  return policy;
}

export function privacyCollectionEnabled(): boolean {
  const current = getPrivacyPolicy();
  return current.approved && current.collectionEnabled && current.retentionReady;
}

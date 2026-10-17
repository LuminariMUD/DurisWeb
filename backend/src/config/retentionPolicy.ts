/** Proposed ages from the lifecycle inventory. No deletion is approved or implemented. */
export const retentionPreviewPolicy = Object.freeze({
  version: '2026-10-17-draft-1',
  approved: false,
  classes: Object.freeze({
    analytics_events: Object.freeze({ proposedAgeSeconds: 30 * 86400 }),
    login_history: Object.freeze({ proposedAgeSeconds: 90 * 86400 }),
  }),
});

export type RetentionPreviewClass = keyof typeof retentionPreviewPolicy.classes;
export const retentionPreviewClasses: readonly RetentionPreviewClass[] = Object.freeze([
  'analytics_events',
  'login_history',
]);

export interface RetentionPolicy {
  readonly version: string;
  readonly approved: boolean;
  readonly executionEnabled: boolean;
  readonly approvalReference: string | null;
  readonly classes: {
    readonly analytics_events: { readonly proposedAgeSeconds: number; readonly approved: boolean };
    readonly login_history: { readonly proposedAgeSeconds: number; readonly approved: boolean };
  };
}
/** Draft source cannot authorize mutation. No runtime flag or request can approve this policy. */
export const retentionPreviewPolicy: RetentionPolicy = Object.freeze({
  version: '2026-10-17-draft-1',
  approved: false,
  executionEnabled: false,
  approvalReference: null,
  classes: Object.freeze({
    analytics_events: Object.freeze({ proposedAgeSeconds: 30 * 86400, approved: false }),
    login_history: Object.freeze({ proposedAgeSeconds: 90 * 86400, approved: false }),
  }),
});

export type RetentionPreviewClass = keyof typeof retentionPreviewPolicy.classes;
export const retentionPreviewClasses: readonly RetentionPreviewClass[] = Object.freeze([
  'analytics_events',
  'login_history',
]);

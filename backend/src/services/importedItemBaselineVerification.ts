export const IMPORTED_ITEM_BASELINE_TOTAL = 68_284;

export type VerificationBoundary = 'live' | 'quiesced';

export interface ImportedItemBaselineObservation {
  schemaVersion: 1;
  importId: 'legacy-target-wins-v1';
  boundary: VerificationBoundary;
  evidenceId: string;
  importedBaselines: number;
  persistedPayloads: number;
  authoritativelyInMemory: number;
  explicitlyTransferredOrRetired: number;
  quarantined: number;
  invalid: number;
  unclassified: number;
  currentOwnerMismatches: number;
  vnumMismatches: number;
  revisionRegressions: number;
  zeroPayloadUids: number;
  duplicatePayloadUidExcess: number;
  unsafeAllocatorRows: number;
}

export interface ImportedItemBaselineVerification {
  status: 'healthy-live' | 'healthy-quiesced' | 'failed';
  accountedBaselines: number;
  issues: string[];
}

const EXACT_KEYS = [
  'schemaVersion',
  'importId',
  'boundary',
  'evidenceId',
  'importedBaselines',
  'persistedPayloads',
  'authoritativelyInMemory',
  'explicitlyTransferredOrRetired',
  'quarantined',
  'invalid',
  'unclassified',
  'currentOwnerMismatches',
  'vnumMismatches',
  'revisionRegressions',
  'zeroPayloadUids',
  'duplicatePayloadUidExcess',
  'unsafeAllocatorRows',
] as const;

const COUNT_KEYS = [
  'importedBaselines',
  'persistedPayloads',
  'authoritativelyInMemory',
  'explicitlyTransferredOrRetired',
  'quarantined',
  'invalid',
  'unclassified',
  'currentOwnerMismatches',
  'vnumMismatches',
  'revisionRegressions',
  'zeroPayloadUids',
  'duplicatePayloadUidExcess',
  'unsafeAllocatorRows',
] as const;

/** Require the top-level observation value to be a plain JSON object. */
function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('item baseline observation must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/** Parse one aggregate-only observation without accepting row identifiers or extra fields. */
export function parseImportedItemBaselineObservation(
  value: unknown,
): ImportedItemBaselineObservation {
  const object = requireObject(value);
  const keys = Object.keys(object).sort();
  const expectedKeys = [...EXACT_KEYS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('item baseline observation fields do not match schema version 1');
  }
  if (object.schemaVersion !== 1 || object.importId !== 'legacy-target-wins-v1') {
    throw new Error('item baseline observation identity is unsupported');
  }
  if (object.boundary !== 'live' && object.boundary !== 'quiesced') {
    throw new Error('item baseline observation boundary must be live or quiesced');
  }
  if (
    typeof object.evidenceId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(object.evidenceId)
  ) {
    throw new Error('item baseline observation requires an opaque aggregate evidence ID');
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(object[key]) || Number(object[key]) < 0) {
      throw new Error(`item baseline observation ${key} must be a non-negative safe integer`);
    }
  }
  return object as unknown as ImportedItemBaselineObservation;
}

/** Account for the complete imported cohort and fail closed on every unexplained state. */
export function verifyImportedItemBaselines(
  observation: ImportedItemBaselineObservation,
): ImportedItemBaselineVerification {
  const issues: string[] = [];
  const accountedBaselines =
    observation.persistedPayloads +
    observation.authoritativelyInMemory +
    observation.explicitlyTransferredOrRetired +
    observation.quarantined +
    observation.invalid +
    observation.unclassified;

  if (observation.importedBaselines !== IMPORTED_ITEM_BASELINE_TOTAL) {
    issues.push(
      `imported baseline cohort must contain ${IMPORTED_ITEM_BASELINE_TOTAL} rows, observed ${observation.importedBaselines}`,
    );
  }
  if (accountedBaselines !== observation.importedBaselines) {
    issues.push(
      `baseline classifications account for ${accountedBaselines} of ${observation.importedBaselines} rows`,
    );
  }
  if (observation.boundary === 'quiesced' && observation.authoritativelyInMemory !== 0) {
    issues.push('a quiesced observation cannot classify payloads as authoritatively in memory');
  }
  if (observation.invalid !== 0)
    issues.push(`${observation.invalid} imported baselines are invalid`);
  if (observation.unclassified !== 0) {
    issues.push(`${observation.unclassified} imported baselines remain unclassified`);
  }

  const integrityChecks: [number, string][] = [
    [observation.currentOwnerMismatches, 'current-owner mismatches'],
    [observation.vnumMismatches, 'vnum mismatches'],
    [observation.revisionRegressions, 'revision regressions'],
    [observation.zeroPayloadUids, 'zero payload UIDs'],
    [observation.duplicatePayloadUidExcess, 'duplicate payload UID excess rows'],
    [observation.unsafeAllocatorRows, 'unsafe allocator rows'],
  ];
  for (const [count, label] of integrityChecks) {
    if (count !== 0) issues.push(`${count} ${label}`);
  }

  return {
    status:
      issues.length > 0
        ? 'failed'
        : observation.boundary === 'quiesced'
          ? 'healthy-quiesced'
          : 'healthy-live',
    accountedBaselines,
    issues,
  };
}

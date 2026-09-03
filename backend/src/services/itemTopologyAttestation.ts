export type ItemTopologyPhase = 'classification' | 'post-repair';

export interface ItemTopologyAttestation {
  schemaVersion: 1;
  boundary: 'quiesced';
  phase: ItemTopologyPhase;
  evidenceId: string;
  expectedPreexistingMismatches: 14;
  importedMismatches: number;
  payloadParentOrRoot: number;
  currentOwner: number;
  ownerContext: number;
  vnum: number;
  state: number;
  revision: number;
  documentedAllowedTransition: number;
  unclassified: number;
  unaffectedPayloadChanges: number;
  ownershipHistoryChanges: number;
  uidUniquenessViolations: number;
  allocatorViolations: number;
  foreignKeyOrphans: number;
}

export interface ItemTopologyAttestationResult {
  status: 'classified' | 'healthy-post-repair' | 'failed';
  classifiedMismatches: number;
  issues: string[];
}

const EXACT_KEYS = [
  'schemaVersion',
  'boundary',
  'phase',
  'evidenceId',
  'expectedPreexistingMismatches',
  'importedMismatches',
  'payloadParentOrRoot',
  'currentOwner',
  'ownerContext',
  'vnum',
  'state',
  'revision',
  'documentedAllowedTransition',
  'unclassified',
  'unaffectedPayloadChanges',
  'ownershipHistoryChanges',
  'uidUniquenessViolations',
  'allocatorViolations',
  'foreignKeyOrphans',
] as const;

const COUNT_KEYS = [
  'importedMismatches',
  'payloadParentOrRoot',
  'currentOwner',
  'ownerContext',
  'vnum',
  'state',
  'revision',
  'documentedAllowedTransition',
  'unclassified',
  'unaffectedPayloadChanges',
  'ownershipHistoryChanges',
  'uidUniquenessViolations',
  'allocatorViolations',
  'foreignKeyOrphans',
] as const;

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('item topology attestation must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/** Parse aggregate topology evidence while rejecting row-level extensions. */
export function parseItemTopologyAttestation(value: unknown): ItemTopologyAttestation {
  const object = requireObject(value);
  const keys = Object.keys(object).sort();
  const expectedKeys = [...EXACT_KEYS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('item topology attestation fields do not match schema version 1');
  }
  if (
    object.schemaVersion !== 1 ||
    object.boundary !== 'quiesced' ||
    object.expectedPreexistingMismatches !== 14
  ) {
    throw new Error('item topology attestation identity is unsupported');
  }
  if (object.phase !== 'classification' && object.phase !== 'post-repair') {
    throw new Error('item topology attestation phase is unsupported');
  }
  if (
    typeof object.evidenceId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(object.evidenceId)
  ) {
    throw new Error('item topology attestation requires an opaque aggregate evidence ID');
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(object[key]) || Number(object[key]) < 0) {
      throw new Error(`item topology attestation ${key} must be a non-negative safe integer`);
    }
  }
  return object as unknown as ItemTopologyAttestation;
}

/** Verify complete classification before repair and complete invariants afterward. */
export function verifyItemTopologyAttestation(
  attestation: ItemTopologyAttestation,
): ItemTopologyAttestationResult {
  const issues: string[] = [];
  const classifiedMismatches =
    attestation.payloadParentOrRoot +
    attestation.currentOwner +
    attestation.ownerContext +
    attestation.vnum +
    attestation.state +
    attestation.revision +
    attestation.documentedAllowedTransition +
    attestation.unclassified;

  const expected = attestation.phase === 'classification' ? 14 : 0;
  if (classifiedMismatches !== expected) {
    issues.push(
      `${attestation.phase} accounts for ${classifiedMismatches} mismatches; expected ${expected}`,
    );
  }
  if (attestation.unclassified !== 0) {
    issues.push(`${attestation.unclassified} topology mismatches remain unclassified`);
  }
  if (attestation.documentedAllowedTransition !== 0) {
    issues.push(
      'schema version 1 has no allowed quiesced topology transition; update the contract before classifying one',
    );
  }

  const invariantChecks: [number, string][] = [
    [attestation.importedMismatches, 'imported item topology mismatches'],
    [attestation.unaffectedPayloadChanges, 'unaffected payload changes'],
    [attestation.ownershipHistoryChanges, 'ownership-history changes'],
    [attestation.uidUniquenessViolations, 'UID uniqueness violations'],
    [attestation.allocatorViolations, 'allocator violations'],
    [attestation.foreignKeyOrphans, 'declared foreign-key orphans'],
  ];
  for (const [count, label] of invariantChecks) {
    if (count !== 0) issues.push(`${count} ${label}`);
  }

  return {
    status:
      issues.length > 0
        ? 'failed'
        : attestation.phase === 'classification'
          ? 'classified'
          : 'healthy-post-repair',
    classifiedMismatches,
    issues,
  };
}

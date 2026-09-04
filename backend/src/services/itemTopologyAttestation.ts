import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { TextDecoder } from 'node:util';

export type ItemTopologyPhase = 'classification' | 'post-repair';

export type ItemTopologyCategory =
  | 'payloadParentOrRoot'
  | 'currentOwner'
  | 'ownerContext'
  | 'vnum'
  | 'state'
  | 'revision'
  | 'documentedAllowedTransition'
  | 'unclassified';

export interface ItemTopologyRowClassification {
  rowEvidenceHash: string;
  origin: 'pre-existing' | 'imported';
  category: ItemTopologyCategory;
}

export interface ItemTopologyInvariantChecks {
  unaffectedPayloadChanges: number;
  ownershipHistoryChanges: number;
  uidUniquenessViolations: number;
  allocatorViolations: number;
  foreignKeyOrphans: number;
}

export interface ItemTopologySignedStatement {
  schemaVersion: 2;
  checkerId: 'durismud-item-topology-checker';
  checkerVersion: string;
  boundary: 'quiesced';
  phase: ItemTopologyPhase;
  evidenceId: string;
  snapshotId: string;
  quiescenceEvidenceId: string;
  rowClassifications: ItemTopologyRowClassification[];
  invariantChecks: ItemTopologyInvariantChecks;
}

export interface ItemTopologyAttestation {
  schemaVersion: 2;
  signatureAlgorithm: 'Ed25519';
  signedStatement: string;
  signature: string;
}

export interface ItemTopologyAttestationResult {
  status: 'classified' | 'healthy-post-repair' | 'failed';
  evidenceId: string;
  classifiedMismatches: number;
  issues: string[];
}

export interface ItemTopologyExpectedEvidence {
  snapshotId: string;
  quiescenceEvidenceId: string;
}

const ENVELOPE_KEYS = [
  'schemaVersion',
  'signatureAlgorithm',
  'signedStatement',
  'signature',
] as const;

const STATEMENT_KEYS = [
  'schemaVersion',
  'checkerId',
  'checkerVersion',
  'boundary',
  'phase',
  'evidenceId',
  'snapshotId',
  'quiescenceEvidenceId',
  'rowClassifications',
  'invariantChecks',
] as const;

const ROW_KEYS = ['rowEvidenceHash', 'origin', 'category'] as const;

const INVARIANT_KEYS = [
  'unaffectedPayloadChanges',
  'ownershipHistoryChanges',
  'uidUniquenessViolations',
  'allocatorViolations',
  'foreignKeyOrphans',
] as const;

const CATEGORIES = new Set<ItemTopologyCategory>([
  'payloadParentOrRoot',
  'currentOwner',
  'ownerContext',
  'vnum',
  'state',
  'revision',
  'documentedAllowedTransition',
  'unclassified',
]);

const MAX_SIGNED_STATEMENT_BYTES = 60_000;
const SHA256_ID = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/** Require a plain JSON object before inspecting its exact schema. */
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** Reject omitted or additional fields in a signed topology structure. */
function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields do not match its schema`);
  }
}

/** Decode one canonical unpadded base64url field within its byte limit. */
function decodeBase64Url(value: unknown, label: string, maximumBytes: number): Buffer {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be canonical unpadded base64url`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length > maximumBytes || decoded.toString('base64url') !== value) {
    throw new Error(`${label} must be canonical unpadded base64url within its size limit`);
  }
  return decoded;
}

/** Require one lowercase SHA-256 identifier without exposing its value in errors. */
function requireSha256Id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_ID.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 identifier`);
  }
  return value;
}

/** Parse the public signed-envelope fields without trusting the embedded statement. */
export function parseItemTopologyAttestation(value: unknown): ItemTopologyAttestation {
  const object = requireObject(value, 'item topology attestation');
  requireExactKeys(object, ENVELOPE_KEYS, 'item topology attestation');
  if (object.schemaVersion !== 2 || object.signatureAlgorithm !== 'Ed25519') {
    throw new Error('item topology attestation signature contract is unsupported');
  }
  if (typeof object.signedStatement !== 'string' || typeof object.signature !== 'string') {
    throw new Error('item topology attestation requires a signed statement and signature');
  }
  return {
    schemaVersion: 2,
    signatureAlgorithm: 'Ed25519',
    signedStatement: object.signedStatement,
    signature: object.signature,
  };
}

/** Parse the exact checker statement after its Ed25519 signature has been verified. */
function parseSignedStatement(statementBytes: Buffer): ItemTopologySignedStatement {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(statementBytes),
    ) as unknown;
  } catch {
    throw new Error('item topology signed statement must be valid UTF-8 JSON');
  }

  const object = requireObject(parsed, 'item topology signed statement');
  requireExactKeys(object, STATEMENT_KEYS, 'item topology signed statement');
  if (
    object.schemaVersion !== 2 ||
    object.checkerId !== 'durismud-item-topology-checker' ||
    object.boundary !== 'quiesced'
  ) {
    throw new Error('item topology signed statement identity is unsupported');
  }
  if (object.phase !== 'classification' && object.phase !== 'post-repair') {
    throw new Error('item topology signed statement phase is unsupported');
  }
  if (
    typeof object.checkerVersion !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(object.checkerVersion)
  ) {
    throw new Error('item topology signed statement checker version is invalid');
  }
  if (typeof object.evidenceId !== 'string' || !OPAQUE_ID.test(object.evidenceId)) {
    throw new Error('item topology signed statement requires an opaque evidence ID');
  }
  const snapshotId = requireSha256Id(
    object.snapshotId,
    'item topology signed statement snapshot ID',
  );
  const quiescenceEvidenceId = requireSha256Id(
    object.quiescenceEvidenceId,
    'item topology signed statement quiescence evidence ID',
  );
  if (!Array.isArray(object.rowClassifications) || object.rowClassifications.length > 1_024) {
    throw new Error('item topology signed statement row classifications are invalid');
  }

  const rowClassifications = object.rowClassifications.map<ItemTopologyRowClassification>(
    (value, index) => {
      const row = requireObject(value, `item topology row classification ${index + 1}`);
      requireExactKeys(row, ROW_KEYS, `item topology row classification ${index + 1}`);
      if (typeof row.rowEvidenceHash !== 'string' || !SHA256_ID.test(row.rowEvidenceHash)) {
        throw new Error(
          `item topology row classification ${index + 1} has an invalid evidence hash`,
        );
      }
      const origin = row.origin;
      if (origin !== 'pre-existing' && origin !== 'imported') {
        throw new Error(`item topology row classification ${index + 1} has an invalid origin`);
      }
      const category = row.category;
      if (typeof category !== 'string' || !CATEGORIES.has(category as ItemTopologyCategory)) {
        throw new Error(`item topology row classification ${index + 1} has an invalid category`);
      }
      return {
        rowEvidenceHash: row.rowEvidenceHash,
        origin: origin === 'pre-existing' ? 'pre-existing' : 'imported',
        category: category as ItemTopologyCategory,
      };
    },
  );

  const invariants = requireObject(object.invariantChecks, 'item topology invariant checks');
  requireExactKeys(invariants, INVARIANT_KEYS, 'item topology invariant checks');
  for (const key of INVARIANT_KEYS) {
    if (!Number.isSafeInteger(invariants[key]) || Number(invariants[key]) < 0) {
      throw new Error(`item topology invariant ${key} must be a non-negative safe integer`);
    }
  }

  return {
    schemaVersion: 2,
    checkerId: 'durismud-item-topology-checker',
    checkerVersion: object.checkerVersion,
    boundary: 'quiesced',
    phase: object.phase,
    evidenceId: object.evidenceId,
    snapshotId,
    quiescenceEvidenceId,
    rowClassifications,
    invariantChecks: {
      unaffectedPayloadChanges: Number(invariants.unaffectedPayloadChanges),
      ownershipHistoryChanges: Number(invariants.ownershipHistoryChanges),
      uidUniquenessViolations: Number(invariants.uidUniquenessViolations),
      allocatorViolations: Number(invariants.allocatorViolations),
      foreignKeyOrphans: Number(invariants.foreignKeyOrphans),
    },
  };
}

/**
 * Verify a checker-signed immutable record, then derive classification totals
 * from its unique per-row evidence rather than accepting caller-supplied totals.
 */
export function verifyItemTopologyAttestation(
  value: unknown,
  trustedCheckerPublicKey: string | Buffer,
  expectedEvidence: ItemTopologyExpectedEvidence,
): ItemTopologyAttestationResult {
  const attestation = parseItemTopologyAttestation(value);
  const statementBytes = decodeBase64Url(
    attestation.signedStatement,
    'item topology signed statement',
    MAX_SIGNED_STATEMENT_BYTES,
  );
  const signature = decodeBase64Url(attestation.signature, 'item topology signature', 64);
  if (signature.length !== 64) {
    throw new Error('item topology signature must be a 64-byte Ed25519 signature');
  }

  let publicKey;
  try {
    publicKey = createPublicKey(trustedCheckerPublicKey);
  } catch {
    throw new Error('trusted item topology checker public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('trusted item topology checker public key must be Ed25519');
  }
  if (!verifySignature(null, statementBytes, publicKey, signature)) {
    throw new Error('item topology attestation signature is not trusted');
  }

  const statement = parseSignedStatement(statementBytes);
  const expectedSnapshotId = requireSha256Id(
    expectedEvidence?.snapshotId,
    'expected item topology snapshot ID',
  );
  const expectedQuiescenceEvidenceId = requireSha256Id(
    expectedEvidence?.quiescenceEvidenceId,
    'expected item topology quiescence evidence ID',
  );
  if (statement.snapshotId !== expectedSnapshotId) {
    throw new Error('item topology attestation does not match the expected snapshot');
  }
  if (statement.quiescenceEvidenceId !== expectedQuiescenceEvidenceId) {
    throw new Error('item topology attestation does not match the expected quiescence evidence');
  }

  const issues: string[] = [];
  const uniqueRows = new Set<string>();
  let duplicateClassifications = 0;
  for (const row of statement.rowClassifications) {
    if (uniqueRows.has(row.rowEvidenceHash)) duplicateClassifications += 1;
    uniqueRows.add(row.rowEvidenceHash);
  }
  if (duplicateClassifications > 0) {
    issues.push(`${duplicateClassifications} duplicate or overlapping row classifications`);
  }

  const classifiedMismatches = statement.rowClassifications.length;
  const expected = statement.phase === 'classification' ? 14 : 0;
  if (uniqueRows.size !== expected || classifiedMismatches !== expected) {
    issues.push(
      `${statement.phase} accounts for ${uniqueRows.size} unique rows and ${classifiedMismatches} classifications; expected ${expected}`,
    );
  }

  const importedMismatches = statement.rowClassifications.filter(
    (row) => row.origin === 'imported',
  ).length;
  if (importedMismatches !== 0) {
    issues.push(`${importedMismatches} imported item topology mismatches`);
  }
  const unclassified = statement.rowClassifications.filter(
    (row) => row.category === 'unclassified',
  ).length;
  if (unclassified !== 0) {
    issues.push(`${unclassified} topology mismatches remain unclassified`);
  }
  const allowedTransitions = statement.rowClassifications.filter(
    (row) => row.category === 'documentedAllowedTransition',
  ).length;
  if (allowedTransitions !== 0) {
    issues.push(
      'schema version 2 has no allowed quiesced topology transition; update the contract before classifying one',
    );
  }

  const invariantChecks: [number, string][] = [
    [statement.invariantChecks.unaffectedPayloadChanges, 'unaffected payload changes'],
    [statement.invariantChecks.ownershipHistoryChanges, 'ownership-history changes'],
    [statement.invariantChecks.uidUniquenessViolations, 'UID uniqueness violations'],
    [statement.invariantChecks.allocatorViolations, 'allocator violations'],
    [statement.invariantChecks.foreignKeyOrphans, 'declared foreign-key orphans'],
  ];
  for (const [count, label] of invariantChecks) {
    if (count !== 0) issues.push(`${count} ${label}`);
  }

  return {
    status:
      issues.length > 0
        ? 'failed'
        : statement.phase === 'classification'
          ? 'classified'
          : 'healthy-post-repair',
    evidenceId: statement.evidenceId,
    classifiedMismatches,
    issues,
  };
}

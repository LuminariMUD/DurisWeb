import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import { describe, expect, it } from '@jest/globals';

import {
  parseItemTopologyAttestation,
  verifyItemTopologyAttestation,
  type ItemTopologyAttestation,
  type ItemTopologyCategory,
  type ItemTopologyRowClassification,
  type ItemTopologySignedStatement,
} from '../itemTopologyAttestation.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const trustedPublicKey = publicKey.export({ format: 'pem', type: 'spki' }).toString();

/** Build unique, non-identifying evidence hashes for one signed test statement. */
function rowClassifications(
  category: ItemTopologyCategory = 'payloadParentOrRoot',
): ItemTopologyRowClassification[] {
  return Array.from({ length: 14 }, (_, index) => ({
    rowEvidenceHash: `sha256:${index.toString(16).padStart(64, '0')}`,
    origin: 'pre-existing',
    category,
  }));
}

/** Build one checker statement bound to synthetic snapshot evidence. */
function statement(
  overrides: Partial<ItemTopologySignedStatement> = {},
): ItemTopologySignedStatement {
  return {
    schemaVersion: 2,
    checkerId: 'durismud-item-topology-checker',
    checkerVersion: '1.0.0',
    boundary: 'quiesced',
    phase: 'classification',
    evidenceId: 'fixture-save-0001',
    snapshotId: `sha256:${'a'.repeat(64)}`,
    quiescenceEvidenceId: `sha256:${'b'.repeat(64)}`,
    rowClassifications: rowClassifications(),
    invariantChecks: {
      unaffectedPayloadChanges: 0,
      ownershipHistoryChanges: 0,
      uidUniquenessViolations: 0,
      allocatorViolations: 0,
      foreignKeyOrphans: 0,
    },
    ...overrides,
  };
}

/** Sign the exact UTF-8 checker statement embedded in an attestation envelope. */
function signedAttestation(
  value: unknown = statement(),
  signingKey: KeyObject = privateKey,
): ItemTopologyAttestation {
  const statementBytes = Buffer.from(JSON.stringify(value), 'utf8');
  return {
    schemaVersion: 2,
    signatureAlgorithm: 'Ed25519',
    signedStatement: statementBytes.toString('base64url'),
    signature: sign(null, statementBytes, signingKey).toString('base64url'),
  };
}

describe('item topology attestation', () => {
  it.each([
    'payloadParentOrRoot',
    'currentOwner',
    'ownerContext',
    'vnum',
    'state',
    'revision',
  ] as const)('accepts a complete signed %s root-cause classification', (category) => {
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rowClassifications(category) })),
      trustedPublicKey,
    );

    expect(result).toEqual({
      status: 'classified',
      evidenceId: 'fixture-save-0001',
      classifiedMismatches: 14,
      issues: [],
    });
  });

  it('rejects an incomplete signed classification', () => {
    const rows = rowClassifications().slice(0, 13);
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rows })),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain(
      'classification accounts for 13 unique rows and 13 classifications; expected 14',
    );
  });

  it('rejects duplicate or overlapping per-row classifications', () => {
    const rows = rowClassifications();
    rows[13] = { ...rows[13]!, rowEvidenceHash: rows[0]!.rowEvidenceHash };
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rows })),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 duplicate or overlapping row classifications');
  });

  it('rejects an unclassified row', () => {
    const rows = rowClassifications();
    rows[0] = { ...rows[0]!, category: 'unclassified' };
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rows })),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 topology mismatches remain unclassified');
  });

  it('derives and rejects imported mismatches from signed row evidence', () => {
    const rows = rowClassifications();
    rows[0] = { ...rows[0]!, origin: 'imported' };
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rows })),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 imported item topology mismatches');
  });

  it('requires an explicit contract revision for an allowed quiesced transition', () => {
    const rows = rowClassifications();
    rows[0] = { ...rows[0]!, category: 'documentedAllowedTransition' };
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ rowClassifications: rows })),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain(
      'schema version 2 has no allowed quiesced topology transition; update the contract before classifying one',
    );
  });

  it('accepts a signed zero-drift post-repair attestation', () => {
    const result = verifyItemTopologyAttestation(
      signedAttestation(statement({ phase: 'post-repair', rowClassifications: [] })),
      trustedPublicKey,
    );

    expect(result).toEqual({
      status: 'healthy-post-repair',
      evidenceId: 'fixture-save-0001',
      classifiedMismatches: 0,
      issues: [],
    });
  });

  it('rejects signed collateral changes after repair', () => {
    const result = verifyItemTopologyAttestation(
      signedAttestation(
        statement({
          phase: 'post-repair',
          rowClassifications: [],
          invariantChecks: {
            ...statement().invariantChecks,
            ownershipHistoryChanges: 1,
          },
        }),
      ),
      trustedPublicKey,
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 ownership-history changes');
  });

  it('rejects fields that could carry caller-supplied aggregate totals', () => {
    const suppliedTotals = { ...statement(), payloadParentOrRoot: 14 };

    expect(() =>
      verifyItemTopologyAttestation(signedAttestation(suppliedTotals), trustedPublicKey),
    ).toThrow(/signed statement fields do not match/);
  });

  it('rejects a snapshot binding modified after the checker signature was produced', () => {
    const attestation = signedAttestation();
    const changedStatement = statement({ snapshotId: `sha256:${'c'.repeat(64)}` });
    const tampered = {
      ...attestation,
      signedStatement: Buffer.from(JSON.stringify(changedStatement), 'utf8').toString('base64url'),
    };

    expect(() => verifyItemTopologyAttestation(tampered, trustedPublicKey)).toThrow(
      /signature is not trusted/,
    );
  });

  it('rejects a valid signature from an untrusted checker key', () => {
    const otherKey = generateKeyPairSync('ed25519').privateKey;

    expect(() =>
      verifyItemTopologyAttestation(signedAttestation(statement(), otherKey), trustedPublicKey),
    ).toThrow(/signature is not trusted/);
  });

  it('rejects protected row identifiers outside the signed statement', () => {
    expect(() =>
      parseItemTopologyAttestation({ ...signedAttestation(), itemUids: ['private'] }),
    ).toThrow(/fields do not match/);
  });
});

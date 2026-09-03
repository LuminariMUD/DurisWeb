import { describe, expect, it } from '@jest/globals';

import {
  parseItemTopologyAttestation,
  verifyItemTopologyAttestation,
  type ItemTopologyAttestation,
} from '../itemTopologyAttestation.js';

function attestation(overrides: Partial<ItemTopologyAttestation> = {}): ItemTopologyAttestation {
  return {
    schemaVersion: 1,
    boundary: 'quiesced',
    phase: 'classification',
    evidenceId: 'fixture-save-0001',
    expectedPreexistingMismatches: 14,
    importedMismatches: 0,
    payloadParentOrRoot: 14,
    currentOwner: 0,
    ownerContext: 0,
    vnum: 0,
    state: 0,
    revision: 0,
    documentedAllowedTransition: 0,
    unclassified: 0,
    unaffectedPayloadChanges: 0,
    ownershipHistoryChanges: 0,
    uidUniquenessViolations: 0,
    allocatorViolations: 0,
    foreignKeyOrphans: 0,
    ...overrides,
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
  ] as const)('accepts a complete %s root-cause classification', (category) => {
    const value = attestation({ payloadParentOrRoot: 0, [category]: 14 });

    expect(verifyItemTopologyAttestation(value)).toEqual({
      status: 'classified',
      classifiedMismatches: 14,
      issues: [],
    });
  });

  it('rejects an incomplete classification', () => {
    const result = verifyItemTopologyAttestation(
      attestation({ payloadParentOrRoot: 13, unclassified: 1 }),
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 topology mismatches remain unclassified');
  });

  it('requires an explicit contract revision for an allowed quiesced transition', () => {
    const result = verifyItemTopologyAttestation(
      attestation({ payloadParentOrRoot: 13, documentedAllowedTransition: 1 }),
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain(
      'schema version 1 has no allowed quiesced topology transition; update the contract before classifying one',
    );
  });

  it('accepts a zero-drift post-repair attestation', () => {
    expect(
      verifyItemTopologyAttestation(attestation({ phase: 'post-repair', payloadParentOrRoot: 0 })),
    ).toEqual({ status: 'healthy-post-repair', classifiedMismatches: 0, issues: [] });
  });

  it('rejects collateral changes after repair', () => {
    const result = verifyItemTopologyAttestation(
      attestation({
        phase: 'post-repair',
        payloadParentOrRoot: 0,
        ownershipHistoryChanges: 1,
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 ownership-history changes');
  });

  it('rejects fields that could carry protected row identifiers', () => {
    expect(() => parseItemTopologyAttestation({ ...attestation(), itemUids: ['private'] })).toThrow(
      /fields do not match/,
    );
  });
});

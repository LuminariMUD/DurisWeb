import { describe, expect, it } from '@jest/globals';

import {
  parseImportedItemBaselineObservation,
  verifyImportedItemBaselines,
  type ImportedItemBaselineObservation,
} from '../importedItemBaselineVerification.js';

/** Build one complete imported-item baseline observation fixture. */
function observation(
  overrides: Partial<ImportedItemBaselineObservation> = {},
): ImportedItemBaselineObservation {
  return {
    schemaVersion: 1,
    importId: 'legacy-target-wins-v1',
    boundary: 'quiesced',
    evidenceId: 'fixture-save-0001',
    importedBaselines: 68_284,
    persistedPayloads: 68_284,
    authoritativelyInMemory: 0,
    explicitlyTransferredOrRetired: 0,
    quarantined: 0,
    invalid: 0,
    unclassified: 0,
    currentOwnerMismatches: 0,
    vnumMismatches: 0,
    revisionRegressions: 0,
    zeroPayloadUids: 0,
    duplicatePayloadUidExcess: 0,
    unsafeAllocatorRows: 0,
    ...overrides,
  };
}

describe('imported item baseline verification', () => {
  it('accepts a complete quiesced save observation', () => {
    expect(verifyImportedItemBaselines(observation())).toEqual({
      status: 'healthy-quiesced',
      accountedBaselines: 68_284,
      issues: [],
    });
  });

  it('distinguishes an authoritatively loaded live item from persistence drift', () => {
    expect(
      verifyImportedItemBaselines(
        observation({
          boundary: 'live',
          persistedPayloads: 68_283,
          authoritativelyInMemory: 1,
        }),
      ),
    ).toEqual({ status: 'healthy-live', accountedBaselines: 68_284, issues: [] });
  });

  it('rejects an unexplained missing payload', () => {
    const result = verifyImportedItemBaselines(
      observation({ persistedPayloads: 68_283, unclassified: 1 }),
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('1 imported baselines remain unclassified');
  });

  it('rejects an in-memory classification at a quiesced boundary', () => {
    const result = verifyImportedItemBaselines(
      observation({ persistedPayloads: 68_283, authoritativelyInMemory: 1 }),
    );

    expect(result.status).toBe('failed');
    expect(result.issues).toContain(
      'a quiesced observation cannot classify payloads as authoritatively in memory',
    );
  });

  it('rejects integrity drift even when every baseline is classified', () => {
    const result = verifyImportedItemBaselines(observation({ revisionRegressions: 2 }));

    expect(result.status).toBe('failed');
    expect(result.issues).toContain('2 revision regressions');
  });

  it('rejects extra fields so row identifiers cannot enter routine evidence', () => {
    expect(() =>
      parseImportedItemBaselineObservation({ ...observation(), itemUids: ['private'] }),
    ).toThrow(/fields do not match/);
  });
});

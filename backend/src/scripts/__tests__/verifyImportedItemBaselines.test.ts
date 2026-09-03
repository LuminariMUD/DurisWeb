import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { runImportedItemBaselineVerification } from '../verifyImportedItemBaselines.js';

const temporaryDirectories: string[] = [];

function writeObservation(overrides: Record<string, unknown> = {}): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-item-baseline-'));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, 'observation.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
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
    }),
    { mode: 0o600 },
  );
  return inputPath;
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('imported item baseline verifier CLI', () => {
  it('prints only an aggregate pass result', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const inputPath = writeObservation();

    expect(runImportedItemBaselineVerification(['--input', inputPath])).toBe(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('healthy-quiesced, 68284 aggregate rows'),
    );
  });

  it('returns a verification failure for unclassified state', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeObservation({ persistedPayloads: 68_283, unclassified: 1 });

    expect(runImportedItemBaselineVerification(['--input', inputPath])).toBe(1);
  });

  it('refuses an observation readable by other users', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeObservation();
    fs.chmodSync(inputPath, 0o644);

    expect(runImportedItemBaselineVerification(['--input', inputPath])).toBe(78);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('mode 0600'));
  });
});

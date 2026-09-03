import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { runItemTopologyAttestationVerification } from '../verifyItemTopologyAttestation.js';

const temporaryDirectories: string[] = [];

function writeAttestation(overrides: Record<string, unknown> = {}): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-item-topology-'));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, 'attestation.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
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

describe('item topology attestation CLI', () => {
  it('prints an aggregate classification result', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const inputPath = writeAttestation();

    expect(runItemTopologyAttestationVerification(['--input', inputPath])).toBe(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('classified, 14 aggregate mismatches'),
    );
  });

  it('fails a post-repair attestation with remaining mismatches', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation({ phase: 'post-repair' });

    expect(runItemTopologyAttestationVerification(['--input', inputPath])).toBe(1);
  });

  it('refuses a group-readable protected artifact', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();
    fs.chmodSync(inputPath, 0o640);

    expect(runItemTopologyAttestationVerification(['--input', inputPath])).toBe(78);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('mode 0600'));
  });
});

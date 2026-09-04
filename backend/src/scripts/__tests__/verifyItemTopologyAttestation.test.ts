import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { ItemTopologySignedStatement } from '../../services/itemTopologyAttestation.js';
import { runItemTopologyAttestationVerification } from '../verifyItemTopologyAttestation.js';

const temporaryDirectories: string[] = [];
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const trustedPublicKey = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const trustedEnvironment: NodeJS.ProcessEnv = {
  ITEM_TOPOLOGY_CHECKER_PUBLIC_KEY: trustedPublicKey,
};

/** Build one synthetic checker statement with 14 unique row-evidence hashes. */
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
    rowClassifications: Array.from({ length: 14 }, (_, index) => ({
      rowEvidenceHash: `sha256:${index.toString(16).padStart(64, '0')}`,
      origin: 'pre-existing',
      category: 'payloadParentOrRoot',
    })),
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

/** Write one mode-0600 signed attestation fixture. */
function writeAttestation(
  overrides: Partial<ItemTopologySignedStatement> = {},
  signingKey: KeyObject = privateKey,
): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-item-topology-'));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, 'attestation.json');
  const statementBytes = Buffer.from(JSON.stringify(statement(overrides)), 'utf8');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      schemaVersion: 2,
      signatureAlgorithm: 'Ed25519',
      signedStatement: statementBytes.toString('base64url'),
      signature: sign(null, statementBytes, signingKey).toString('base64url'),
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
  it('prints only the verified classification aggregate', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const inputPath = writeAttestation();

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      0,
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('classified, 14 verified row classifications'),
    );
  });

  it('fails a signed post-repair attestation with remaining mismatches', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation({ phase: 'post-repair' });

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      1,
    );
  });

  it('refuses evidence when the trusted checker key is not configured', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();

    expect(runItemTopologyAttestationVerification(['--input', inputPath], {})).toBe(78);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('ITEM_TOPOLOGY_CHECKER_PUBLIC_KEY is required'),
    );
  });

  it('refuses a group-readable protected artifact', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();
    fs.chmodSync(inputPath, 0o640);

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      78,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('mode 0600'));
  });

  it('refuses an owner-read-only artifact instead of weakening the exact mode contract', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();
    fs.chmodSync(inputPath, 0o400);

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      78,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('mode 0600'));
  });

  it('refuses a symlink instead of following it to a protected artifact', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const targetPath = writeAttestation();
    const inputPath = path.join(path.dirname(targetPath), 'attestation-link.json');
    fs.symlinkSync(targetPath, inputPath);

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      78,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('regular, non-symlink file'));
  });

  it('refuses a directory-entry swap between descriptor validation and reading', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();
    const replacementPath = writeAttestation({ evidenceId: 'replacement-save-0002' });
    const originalFstat = fs.fstatSync;
    jest.spyOn(fs, 'fstatSync').mockImplementation((descriptor) => {
      const stat = originalFstat(descriptor);
      fs.renameSync(replacementPath, inputPath);
      return stat;
    });

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      78,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('path changed during verification'));
  });

  it('closes the validated descriptor when JSON parsing fails', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const inputPath = writeAttestation();
    fs.writeFileSync(inputPath, '{', { mode: 0o600 });
    const close = jest.spyOn(fs, 'closeSync');

    expect(runItemTopologyAttestationVerification(['--input', inputPath], trustedEnvironment)).toBe(
      78,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

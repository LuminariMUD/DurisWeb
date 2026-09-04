import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyItemTopologyAttestation } from '../services/itemTopologyAttestation.js';

const MAX_ATTESTATION_BYTES = 65_536;

interface ItemTopologyVerificationInput {
  inputPath: string;
  snapshotId: string;
  quiescenceEvidenceId: string;
}

/** Resolve the signed artifact and independent expected-evidence CLI arguments. */
function verificationInput(args: string[]): ItemTopologyVerificationInput {
  if (
    args.length !== 6 ||
    args[0] !== '--input' ||
    args[1].trim() === '' ||
    args[2] !== '--snapshot-id' ||
    args[3].trim() === '' ||
    args[4] !== '--quiescence-evidence-id' ||
    args[5].trim() === ''
  ) {
    throw new Error(
      'usage: verifyItemTopologyAttestation --input <signed-attestation.json> --snapshot-id <sha256:id> --quiescence-evidence-id <sha256:id>',
    );
  }
  return {
    inputPath: path.resolve(args[1]),
    snapshotId: args[3],
    quiescenceEvidenceId: args[5],
  };
}

/** Read the approved checker public key from protected operator configuration. */
function trustedCheckerPublicKey(environment: NodeJS.ProcessEnv): string {
  const publicKey = environment.ITEM_TOPOLOGY_CHECKER_PUBLIC_KEY?.trim();
  if (!publicKey) {
    throw new Error('ITEM_TOPOLOGY_CHECKER_PUBLIC_KEY is required');
  }
  return publicKey;
}

/** Open, validate, and bounded-read one protected artifact through a single descriptor. */
function readProtectedAttestation(attestationPath: string): unknown {
  let descriptor: number;
  try {
    descriptor = fs.openSync(
      attestationPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP') {
      throw new Error('topology attestation must be a regular, non-symlink file');
    }
    throw error;
  }

  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new Error('topology attestation must be a regular, non-symlink file');
    }
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      throw new Error('topology attestation must be owned by the current user');
    }
    if ((stat.mode & 0o777) !== 0o600) {
      throw new Error('topology attestation must be owner-controlled with mode 0600');
    }
    if (stat.size > MAX_ATTESTATION_BYTES) {
      throw new Error('topology attestation exceeds the 65536-byte limit');
    }

    const buffer = Buffer.alloc(MAX_ATTESTATION_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const currentRead = fs.readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null,
      );
      if (currentRead === 0) break;
      bytesRead += currentRead;
    }
    if (bytesRead > MAX_ATTESTATION_BYTES) {
      throw new Error('topology attestation exceeds the 65536-byte limit');
    }

    const finalPathStat = fs.lstatSync(attestationPath);
    if (
      finalPathStat.isSymbolicLink() ||
      !finalPathStat.isFile() ||
      finalPathStat.dev !== stat.dev ||
      finalPathStat.ino !== stat.ino
    ) {
      throw new Error('topology attestation path changed during verification');
    }
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Verify trusted item-topology evidence and map its outcome to a process status. */
export function runItemTopologyAttestationVerification(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): number {
  try {
    const input = verificationInput(args);
    const result = verifyItemTopologyAttestation(
      readProtectedAttestation(input.inputPath),
      trustedCheckerPublicKey(environment),
      {
        snapshotId: input.snapshotId,
        quiescenceEvidenceId: input.quiescenceEvidenceId,
      },
    );
    if (result.status === 'failed') {
      console.error(`Item topology attestation failed: ${result.issues.join('; ')}`);
      return 1;
    }
    console.log(
      `Item topology attestation passed (${result.status}, ${result.classifiedMismatches} verified row classifications, evidence ${result.evidenceId}).`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown verification failure';
    console.error(`Item topology attestation refused: ${message}`);
    return 78;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  process.exitCode = runItemTopologyAttestationVerification(process.argv.slice(2));
}

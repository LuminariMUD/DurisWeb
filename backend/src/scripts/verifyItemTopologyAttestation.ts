import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseItemTopologyAttestation,
  verifyItemTopologyAttestation,
} from '../services/itemTopologyAttestation.js';

function inputPath(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--input' || args[1].trim() === '') {
    throw new Error('usage: verifyItemTopologyAttestation --input <aggregate-attestation.json>');
  }
  return path.resolve(args[1]);
}

function readProtectedAttestation(attestationPath: string): unknown {
  const stat = fs.lstatSync(attestationPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('topology attestation must be a regular, non-symlink file');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error('topology attestation must be owned by the current user');
  }
  if ((stat.mode & 0o177) !== 0) {
    throw new Error('topology attestation must be owner-controlled with mode 0600');
  }
  if (stat.size > 65_536) throw new Error('topology attestation exceeds the 65536-byte limit');
  return JSON.parse(fs.readFileSync(attestationPath, 'utf8')) as unknown;
}

export function runItemTopologyAttestationVerification(args: string[]): number {
  try {
    const attestation = parseItemTopologyAttestation(readProtectedAttestation(inputPath(args)));
    const result = verifyItemTopologyAttestation(attestation);
    if (result.status === 'failed') {
      console.error(`Item topology attestation failed: ${result.issues.join('; ')}`);
      return 1;
    }
    console.log(
      `Item topology attestation passed (${result.status}, ${result.classifiedMismatches} aggregate mismatches, evidence ${attestation.evidenceId}).`,
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

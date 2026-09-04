import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseImportedItemBaselineObservation,
  verifyImportedItemBaselines,
} from '../services/importedItemBaselineVerification.js';

const MAX_OBSERVATION_BYTES = 65_536;

/** Resolve the one supported aggregate-observation CLI argument. */
function observationPath(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--input' || args[1].trim() === '') {
    throw new Error('usage: verifyImportedItemBaselines --input <aggregate-observation.json>');
  }
  return path.resolve(args[1]);
}

/** Open, validate, and read one protected observation without following or reopening its path. */
function readProtectedObservation(inputPath: string): unknown {
  let descriptor: number;
  try {
    descriptor = fs.openSync(
      inputPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP') {
      throw new Error('aggregate observation must be a regular, non-symlink file');
    }
    throw error;
  }

  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new Error('aggregate observation must be a regular, non-symlink file');
    }
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      throw new Error('aggregate observation must be owned by the current user');
    }
    if ((stat.mode & 0o777) !== 0o600) {
      throw new Error('aggregate observation must be owner-controlled with mode 0600');
    }
    if (stat.size > MAX_OBSERVATION_BYTES) {
      throw new Error('aggregate observation exceeds the 65536-byte limit');
    }

    const buffer = Buffer.alloc(MAX_OBSERVATION_BYTES + 1);
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
    if (bytesRead > MAX_OBSERVATION_BYTES) {
      throw new Error('aggregate observation exceeds the 65536-byte limit');
    }
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Run aggregate imported-item baseline verification and map its outcome to a process status. */
export function runImportedItemBaselineVerification(args: string[]): number {
  try {
    const inputPath = observationPath(args);
    const observation = parseImportedItemBaselineObservation(readProtectedObservation(inputPath));
    const result = verifyImportedItemBaselines(observation);
    if (result.status === 'failed') {
      console.error(`Imported item baseline verification failed: ${result.issues.join('; ')}`);
      return 1;
    }
    console.log(
      `Imported item baseline verification passed (${result.status}, ${result.accountedBaselines} aggregate rows, evidence ${observation.evidenceId}).`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown verification failure';
    console.error(`Imported item baseline verification refused: ${message}`);
    return 78;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  process.exitCode = runImportedItemBaselineVerification(process.argv.slice(2));
}

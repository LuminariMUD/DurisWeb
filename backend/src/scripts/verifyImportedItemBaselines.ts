import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseImportedItemBaselineObservation,
  verifyImportedItemBaselines,
} from '../services/importedItemBaselineVerification.js';

function observationPath(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--input' || args[1].trim() === '') {
    throw new Error('usage: verifyImportedItemBaselines --input <aggregate-observation.json>');
  }
  return path.resolve(args[1]);
}

function readProtectedObservation(inputPath: string): unknown {
  const stat = fs.lstatSync(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('aggregate observation must be a regular, non-symlink file');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error('aggregate observation must be owned by the current user');
  }
  if ((stat.mode & 0o177) !== 0) {
    throw new Error('aggregate observation must be owner-controlled with mode 0600');
  }
  if (stat.size > 65_536) {
    throw new Error('aggregate observation exceeds the 65536-byte limit');
  }
  return JSON.parse(fs.readFileSync(inputPath, 'utf8')) as unknown;
}

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

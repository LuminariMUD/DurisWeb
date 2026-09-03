import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDatabaseConnection, mudPool } from '../db/connection.js';
import {
  readCombatFragBaselineReadiness,
  validateCombatFragBaselineReadiness,
} from '../services/combatFragBaselineReadiness.js';

export async function runCombatFragBaselineVerification(): Promise<number> {
  try {
    const readiness = await readCombatFragBaselineReadiness(mudPool);
    const issues = validateCombatFragBaselineReadiness(readiness);
    if (issues.length > 0) {
      console.error(
        `Combat baseline verification failed (${readiness.activeMappedCharacters} active mapped characters): ${issues.join('; ')}`,
      );
      if (readiness.missingCombatBaselines > 0) {
        console.error(
          `Repair classification: ${readiness.reconstructableCombatBaselines} ledger-reconstructable, ${readiness.ambiguousCombatBaselines} ambiguous.`,
        );
      }
      return 1;
    }
    console.log(
      `Combat baseline verification passed (${readiness.activeMappedCharacters} active mapped characters).`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown verification failure';
    console.error(`Combat baseline verification refused: ${message}`);
    return 78;
  } finally {
    await closeDatabaseConnection();
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  process.exitCode = await runCombatFragBaselineVerification();
}

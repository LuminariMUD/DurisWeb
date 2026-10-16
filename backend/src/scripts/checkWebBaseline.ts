import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadWebBaselineBundle,
  verifyWebBaselineSources,
  webBaselineDirectory,
} from '../db/webBaselineBundle.js';

export function checkWebBaseline(): void {
  const bundle = loadWebBaselineBundle();
  verifyWebBaselineSources(bundle, path.resolve(webBaselineDirectory(), '../../migrations'));
  console.log(
    `Website baseline ${bundle.manifest.id}: ${bundle.tables.length} web tables, ${bundle.manifest.historicalMigrations.length} covered migration sources; artifacts verified. No database was inspected or changed.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkWebBaseline();
  } catch (error) {
    console.error(
      `Website baseline input verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    process.exitCode = 1;
  }
}

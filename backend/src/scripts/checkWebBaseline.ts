import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemaPostconditions } from '../db/schemaPostconditions.js';
import { loadSessionSchemaContract } from '../db/webSessionSchema.js';
import { loadHookAuditContract } from '../db/hookAuditSchema.js';
import { loadPostImageRemovalContract } from '../db/postImageRemovalSchema.js';
import { loadDataHoldContract } from '../db/dataHoldSchema.js';
import {
  loadWebBaselineBundle,
  verifyWebBaselineSources,
  webBaselineDirectory,
} from '../db/webBaselineBundle.js';

export function checkWebBaseline(): void {
  const bundle = loadWebBaselineBundle();
  loadSchemaPostconditions();
  loadSessionSchemaContract();
  loadHookAuditContract();
  loadPostImageRemovalContract();
  loadDataHoldContract();
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

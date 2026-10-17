import type { SchemaDatabase } from './schemaPostconditions.js';
import { readSchemaLifecycleMetadata } from './lifecycleMetadata.js';

export async function assertNoWebSchemaTriggers(
  database: SchemaDatabase,
  targets: ReadonlySet<string>,
): Promise<void> {
  try {
    for (const target of targets) {
      const metadata = await readSchemaLifecycleMetadata(database, target);
      if (metadata.triggers !== 0) throw new Error('unexpected_web_trigger');
    }
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === 'unexpected_web_trigger'
        ? 'unexpected_web_trigger'
        : 'schema_trigger_visibility_unverified',
    );
  }
}

/** Credential clearing must not run hidden triggers or cascade into another schema. */
export async function assertNoSessionSideEffects(database: SchemaDatabase): Promise<void> {
  try {
    const metadata = await readSchemaLifecycleMetadata(database, 'web_sessions');
    if (metadata.triggers !== 0) throw new Error('unexpected_session_trigger');
    if (metadata.incoming !== 0) throw new Error('unexpected_session_reference');
  } catch (error) {
    const reason =
      error instanceof Error &&
      ['unexpected_session_trigger', 'unexpected_session_reference'].includes(error.message)
        ? error.message
        : 'session_metadata_visibility_unverified';
    throw new Error(reason);
  }
}

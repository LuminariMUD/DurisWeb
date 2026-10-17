import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2';
import { getBackendConfiguration } from '../config/environment.js';
import { pool, closeDatabaseConnection, verifyPoolSessionInvariants } from '../db/connection.js';
import { schemaDatabaseFamily } from '../db/schemaPostconditions.js';
import { readSessionSchemaStage } from '../db/webSessionSchema.js';
import { createWebSession } from '../services/sessionService.js';
import { refreshTokenDigest } from '../services/sessionCredential.js';

/** Maintenance-only write proof; a random non-JWT cannot authorize any request. */
export async function checkSessionCutover(args: string[]): Promise<void> {
  const configuration = getBackendConfiguration().database;
  const target = `${configuration.host}:${configuration.port}/${configuration.database}`;
  if (args.length !== 2 || args[0] !== '--target' || args[1] !== target)
    throw new Error('configured_target_mismatch');
  await verifyPoolSessionInvariants();
  const stage = await readSessionSchemaStage(pool, await schemaDatabaseFamily(pool));
  if (stage === 'baseline') throw new Error('session_expansion_required');
  const id = crypto.randomUUID();
  const account = `schema_probe_${crypto.randomBytes(10).toString('hex')}`;
  const credential = crypto.randomBytes(32).toString('base64url');
  try {
    const [before] = await pool.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch');
    await createWebSession(account, id, credential);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT *,UNIX_TIMESTAMP() AS observed_epoch FROM web_sessions WHERE id=? AND account_name=?',
      [id, account],
    );
    const row = rows[0];
    const digest = refreshTokenDigest(credential);
    if (
      rows.length !== 1 ||
      !digest ||
      !Buffer.isBuffer(row.refresh_token_digest) ||
      !row.refresh_token_digest.equals(digest) ||
      Number(row.expires_at_epoch) < Number(before[0].epoch) + 604800 ||
      Number(row.expires_at_epoch) > Number(row.observed_epoch) + 604800 ||
      (stage === 'expanded' && (row.refresh_token !== null || row.expires_at !== null))
    )
      throw new Error('session_write_postcondition_failed');
  } finally {
    await pool.query('DELETE FROM web_sessions WHERE id=? AND account_name=?', [id, account]);
  }
  console.log(`Session credential write probe passed (${stage}); probe row removed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await checkSessionCutover(process.argv.slice(2));
  } catch {
    console.error(
      'Session cutover probe failed; verify the explicit target, schema phase and database availability.',
    );
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}

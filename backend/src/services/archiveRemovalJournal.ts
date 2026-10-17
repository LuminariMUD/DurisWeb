import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { ARCHIVE_REMOVAL_PREFIX } from '../db/internalWebSettings.js';
import {
  validArchiveWorkerIdentity,
  type ArchiveWorkerIdentity,
} from '../utils/archiveWorkerIdentity.js';
import { BackupDeletionError } from '../utils/backupDeletionError.js';

export const ARCHIVE_REMOVAL_STATE_KEY = ARCHIVE_REMOVAL_PREFIX + 'state';
const DESCRIPTION = 'archive removal v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
type Database = Pick<Connection, 'execute'>;
export interface ArchiveRemovalRecord {
  format: 1;
  kind: 'managed_archive';
  operationId: string;
  backupId: number;
  filename: string;
  rootSha256: string;
  fileSha256: string | null;
  createdAtEpoch: number;
  finishedAtEpoch: number | null;
  phase: 'prepared' | 'armed' | 'complete' | 'failed';
  worker: ArchiveWorkerIdentity | null;
  outcome:
    | null
    | 'removed'
    | 'absent'
    | 'refused'
    | 'worker_unconfirmed'
    | 'prepared_cancelled'
    | 'interrupted_fenced';
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function epoch(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 253402300799
  );
}
function invalid(): never {
  throw new BackupDeletionError('recovery_unverified');
}
function decodeRow(row: RowDataPacket, key: string): Record<string, unknown> {
  if (
    row.setting_key !== key ||
    row.description !== DESCRIPTION ||
    row.updated_by !== null ||
    typeof row.setting_value !== 'string' ||
    Buffer.byteLength(row.setting_value) > 4096
  )
    invalid();
  let value: unknown;
  try {
    value = JSON.parse(row.setting_value);
  } catch {
    invalid();
  }
  if (!object(value)) invalid();
  return value;
}
export function parseArchiveRemovalRecord(value: unknown): ArchiveRemovalRecord {
  if (
    !object(value) ||
    Object.keys(value).sort().join(',') !==
      'backupId,createdAtEpoch,fileSha256,filename,finishedAtEpoch,format,kind,operationId,outcome,phase,rootSha256,worker' ||
    value.format !== 1 ||
    value.kind !== 'managed_archive' ||
    typeof value.operationId !== 'string' ||
    !UUID.test(value.operationId) ||
    typeof value.backupId !== 'number' ||
    !Number.isSafeInteger(value.backupId) ||
    value.backupId <= 0 ||
    value.backupId > 4294967295 ||
    typeof value.filename !== 'string' ||
    value.filename.length > 255 ||
    !/^duris-(?:mud|hourly)-[A-Za-z0-9-]+\.zip$/.test(value.filename) ||
    typeof value.rootSha256 !== 'string' ||
    !HASH.test(value.rootSha256) ||
    (value.fileSha256 !== null &&
      (typeof value.fileSha256 !== 'string' || !HASH.test(value.fileSha256))) ||
    !epoch(value.createdAtEpoch) ||
    typeof value.phase !== 'string' ||
    (value.outcome !== null && typeof value.outcome !== 'string') ||
    (value.worker !== null && !validArchiveWorkerIdentity(value.worker))
  )
    invalid();
  const terminal = value.phase === 'complete' || value.phase === 'failed';
  if (
    (!terminal && (value.finishedAtEpoch !== null || value.outcome !== null)) ||
    (terminal && (!epoch(value.finishedAtEpoch) || value.finishedAtEpoch < value.createdAtEpoch)) ||
    (value.phase === 'prepared' && value.worker !== null) ||
    (value.phase === 'armed' && value.worker === null) ||
    (value.phase === 'complete' &&
      (value.worker === null || !['removed', 'absent'].includes(String(value.outcome)))) ||
    (value.phase === 'failed' &&
      !['refused', 'worker_unconfirmed', 'prepared_cancelled', 'interrupted_fenced'].includes(
        String(value.outcome),
      )) ||
    (value.phase === 'failed' &&
      (value.outcome === 'prepared_cancelled' ? value.worker !== null : value.worker === null)) ||
    !['prepared', 'armed', 'complete', 'failed'].includes(String(value.phase))
  )
    invalid();
  // Narrow every external field above; reconstruct the typed value without accepting extra keys.
  return {
    format: 1,
    kind: 'managed_archive',
    operationId: value.operationId,
    backupId: value.backupId,
    filename: value.filename,
    rootSha256: value.rootSha256,
    fileSha256: value.fileSha256,
    createdAtEpoch: value.createdAtEpoch,
    finishedAtEpoch: terminal ? Number(value.finishedAtEpoch) : null,
    phase:
      value.phase === 'prepared'
        ? 'prepared'
        : value.phase === 'armed'
          ? 'armed'
          : value.phase === 'complete'
            ? 'complete'
            : 'failed',
    worker: value.worker,
    outcome:
      value.outcome === null
        ? null
        : value.outcome === 'removed'
          ? 'removed'
          : value.outcome === 'absent'
            ? 'absent'
            : value.outcome === 'refused'
              ? 'refused'
              : value.outcome === 'worker_unconfirmed'
                ? 'worker_unconfirmed'
                : value.outcome === 'prepared_cancelled'
                  ? 'prepared_cancelled'
                  : 'interrupted_fenced',
  };
}
async function row(database: Database, key: string) {
  const [rows] = await database.execute<RowDataPacket[]>(
    {
      sql: 'SELECT setting_key,setting_value,description,updated_by FROM web_settings WHERE setting_key=? FOR UPDATE',
      timeout: 5000,
    },
    [key],
  );
  if (rows.length > 1) invalid();
  return rows[0];
}
/** Caller must hold retention control in its transaction; this is the O(1) active index. */
export async function readPendingArchiveRemoval(
  database: Database,
): Promise<ArchiveRemovalRecord | null> {
  const state = await row(database, ARCHIVE_REMOVAL_STATE_KEY);
  if (!state) return null;
  const value = decodeRow(state, ARCHIVE_REMOVAL_STATE_KEY);
  if (
    Object.keys(value).sort().join(',') !== 'activeOperation,format' ||
    value.format !== 1 ||
    (value.activeOperation !== null &&
      (typeof value.activeOperation !== 'string' || !UUID.test(value.activeOperation)))
  )
    invalid();
  if (value.activeOperation === null) return null;
  const key = ARCHIVE_REMOVAL_PREFIX + value.activeOperation;
  const receipt = await row(database, key);
  if (!receipt) invalid();
  const record = parseArchiveRemovalRecord(decodeRow(receipt, key));
  if (record.operationId !== value.activeOperation || !['prepared', 'armed'].includes(record.phase))
    invalid();
  return record;
}
async function write(
  database: Database,
  key: string,
  value: unknown,
  insert: boolean,
): Promise<void> {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 4096) invalid();
  const [result] = await database.execute<ResultSetHeader>(
    {
      sql: insert
        ? 'INSERT INTO web_settings(setting_key,setting_value,description,updated_by) VALUES (?,?,?,NULL)'
        : 'UPDATE web_settings SET setting_value=?,updated_at=NOW() WHERE setting_key=? AND description=? AND updated_by IS NULL',
      timeout: 5000,
    },
    insert ? [key, encoded, DESCRIPTION] : [encoded, key, DESCRIPTION],
  );
  if (result.affectedRows !== 1) invalid();
}
export async function beginArchiveRemoval(
  database: Database,
  record: ArchiveRemovalRecord,
): Promise<void> {
  const valid = parseArchiveRemovalRecord(record);
  if (valid.phase !== 'prepared' || (await readPendingArchiveRemoval(database))) invalid();
  await write(database, ARCHIVE_REMOVAL_PREFIX + valid.operationId, valid, true);
  await write(
    database,
    ARCHIVE_REMOVAL_STATE_KEY,
    { format: 1, activeOperation: valid.operationId },
    !(await row(database, ARCHIVE_REMOVAL_STATE_KEY)),
  );
}
export async function saveArchiveRemoval(
  database: Database,
  record: ArchiveRemovalRecord,
): Promise<void> {
  const valid = parseArchiveRemovalRecord(record);
  const current = await readPendingArchiveRemoval(database);
  if (
    !current ||
    current.operationId !== valid.operationId ||
    current.backupId !== valid.backupId ||
    current.filename !== valid.filename ||
    current.rootSha256 !== valid.rootSha256 ||
    current.fileSha256 !== valid.fileSha256 ||
    current.createdAtEpoch !== valid.createdAtEpoch ||
    (current.phase === 'armed' &&
      JSON.stringify(current.worker) !== JSON.stringify(valid.worker)) ||
    (current.phase === 'prepared' &&
      !(
        valid.phase === 'armed' ||
        (valid.phase === 'failed' && valid.outcome === 'prepared_cancelled')
      )) ||
    (current.phase === 'armed' && !['complete', 'failed'].includes(valid.phase))
  )
    invalid();
  await write(database, ARCHIVE_REMOVAL_PREFIX + valid.operationId, valid, false);
  if (valid.phase === 'complete' || valid.phase === 'failed')
    await write(database, ARCHIVE_REMOVAL_STATE_KEY, { format: 1, activeOperation: null }, false);
}

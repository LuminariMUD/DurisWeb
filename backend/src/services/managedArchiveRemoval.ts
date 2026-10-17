import mysql, { type Connection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getBackendConfiguration } from '../config/environment.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  tableMetadataSha256,
  type SchemaDatabase,
} from '../db/schemaPostconditions.js';
import { loadDataHoldContract } from '../db/dataHoldSchema.js';
import { assertLifecycleMetadata } from '../db/lifecycleMetadata.js';
import { BackupDeletionError } from '../utils/backupDeletionError.js';
import { inspectManagedArchive, type ManagedArchiveTarget } from '../utils/managedArchiveTarget.js';
import { UnsafeBackupPathError } from '../utils/safeBackupPath.js';
import { captureArchiveWorker, archiveWorkerIsGone } from '../utils/archiveWorkerIdentity.js';
import { lockRetentionControl } from './retentionControl.js';
import { readDataHoldSnapshot } from './dataHoldSnapshot.js';
import {
  beginArchiveRemoval,
  readPendingArchiveRemoval,
  saveArchiveRemoval,
  type ArchiveRemovalRecord,
} from './archiveRemovalJournal.js';
import { startArchiveUnlinkWorker } from './archiveUnlinkProcess.js';

const TIMEOUT = 5000;
async function open(): Promise<Connection> {
  const { host, port, database, user, password } = getBackendConfiguration().database;
  return mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
    dateStrings: true,
    connectTimeout: TIMEOUT,
    multipleStatements: false,
  });
}
async function execute<T extends RowDataPacket[] | ResultSetHeader = RowDataPacket[]>(
  connection: Connection,
  sql: string,
  values: (string | number | null)[] = [],
) {
  return connection.execute<T>({ sql, timeout: TIMEOUT }, values);
}
async function clock(connection: Connection): Promise<number> {
  const [rows] = await execute(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
  const epoch = Number(rows[0]?.epoch);
  if (!Number.isSafeInteger(epoch) || epoch <= 0 || epoch > 253402300799)
    throw new BackupDeletionError('storage_unavailable');
  return epoch;
}
async function transaction<T>(connection: Connection, action: () => Promise<T>): Promise<T> {
  try {
    await connection.query({
      sql: 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
      timeout: TIMEOUT,
    });
    await connection.query({ sql: 'START TRANSACTION', timeout: TIMEOUT });
    await lockRetentionControl(connection);
    const result = await action();
    await connection.query({ sql: 'COMMIT', timeout: TIMEOUT });
    return result;
  } catch (error) {
    try {
      await connection.query({ sql: 'ROLLBACK', timeout: TIMEOUT });
    } catch {
      connection.destroy();
    }
    throw error;
  }
}
/** Static contracts are loaded before acquiring database locks. */
function contracts() {
  const baseline = loadSchemaPostconditions();
  return {
    settings: baseline.tables.web_settings,
    backups: baseline.tables.mud_backups,
    holds: loadDataHoldContract(),
  };
}
async function verifySchema(
  connection: Connection,
  expected: ReturnType<typeof contracts>,
): Promise<void> {
  const database: SchemaDatabase = {
    query: async (sql, values = []) => connection.query({ sql, timeout: TIMEOUT }, values),
  };
  for (const table of ['web_settings', 'web_data_holds', 'mud_backups'])
    await execute(
      connection,
      `SELECT ${table === 'web_settings' ? 'setting_key' : 'id'} FROM ${table} WHERE 1=0 FOR UPDATE`,
    );
  const family = await schemaDatabaseFamily(database);
  for (const [table, hashes] of [
    ['web_settings', expected.settings[family]],
    ['web_data_holds', [expected.holds[family]]],
    ['mud_backups', expected.backups[family]],
  ] as const)
    if (!hashes.includes(tableMetadataSha256(await readTableMetadata(database, table, family))))
      throw new BackupDeletionError('recovery_unverified');
  const [invariants] = await execute(
    connection,
    'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
  );
  if (
    Number(invariants[0]?.autocommit) !== 1 ||
    Number(invariants[0]?.foreign_key_checks) !== 1 ||
    !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants[0]?.sql_mode))
  )
    throw new BackupDeletionError('recovery_unverified');
  try {
    for (const table of ['web_settings', 'web_data_holds', 'mud_backups'] as const)
      await assertLifecycleMetadata(connection, table);
  } catch {
    throw new BackupDeletionError('recovery_unverified');
  }
}
async function closeInterrupted(
  connection: Connection,
  original: ArchiveRemovalRecord,
): Promise<void> {
  await transaction(connection, async () => {
    const current = await readPendingArchiveRemoval(connection);
    if (
      !current ||
      current.operationId !== original.operationId ||
      current.phase !== original.phase ||
      JSON.stringify(current.worker) !== JSON.stringify(original.worker)
    )
      return;
    current.phase = 'failed';
    current.outcome = original.phase === 'prepared' ? 'prepared_cancelled' : 'interrupted_fenced';
    current.finishedAtEpoch = await clock(connection);
    // Never infer file absence or delete backup metadata during recovery.
    await saveArchiveRemoval(connection, current);
  });
}
async function reconcile(connection: Connection): Promise<void> {
  const pending = await transaction(connection, () => readPendingArchiveRemoval(connection));
  if (!pending) return;
  if (pending.phase === 'prepared') {
    await closeInterrupted(connection, pending);
    return;
  }
  let gone = false;
  try {
    gone = pending.worker !== null && (await archiveWorkerIsGone(pending.worker));
  } catch {
    throw new BackupDeletionError('recovery_unverified', pending.operationId);
  }
  if (!gone) throw new BackupDeletionError('removal_in_progress', pending.operationId);
  await closeInterrupted(connection, pending);
}
/** Process checks occur between transactions. Unknown identity never clears durable admission. */
export async function recoverManagedArchiveRemoval(): Promise<void> {
  let connection: Connection | undefined;
  try {
    connection = await open();
    await reconcile(connection);
  } catch (error) {
    throw error instanceof BackupDeletionError
      ? error
      : new BackupDeletionError('recovery_unverified');
  } finally {
    connection?.destroy();
  }
}
/** Call after taking retention control; recovery above is not a replacement for this fresh check. */
export async function assertArchiveAdmissionClear(
  connection: Pick<Connection, 'execute'>,
): Promise<void> {
  const pending = await readPendingArchiveRemoval(connection);
  if (pending) throw new BackupDeletionError('removal_in_progress', pending.operationId);
}
export async function removeManagedArchive(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 4294967295)
    throw new BackupDeletionError('invalid_archive');
  let connection: Connection | undefined,
    worker: ReturnType<typeof startArchiveUnlinkWorker> | undefined;
  let operationId: string | undefined;
  try {
    const expected = contracts();
    connection = await open();
    const database = connection;
    await reconcile(database);
    const [initial] = await execute(
      database,
      'SELECT id,filename,status FROM mud_backups WHERE id=?',
      [id],
    );
    if (!initial.length) return false;
    if (typeof initial[0].filename !== 'string') throw new BackupDeletionError('invalid_archive');
    // OS/path inspection is deliberately outside every SQL transaction.
    await captureArchiveWorker(process.pid);
    let target: ManagedArchiveTarget;
    try {
      target = inspectManagedArchive(
        getBackendConfiguration().backupDirectory,
        initial[0].filename,
      );
    } catch (error) {
      if (error instanceof UnsafeBackupPathError) throw new BackupDeletionError('invalid_archive');
      throw error;
    }
    const prepared = await transaction(database, async () => {
      await verifySchema(database, expected);
      await assertArchiveAdmissionClear(database);
      const [rows] = await execute(
        database,
        'SELECT id,filename,status FROM mud_backups WHERE id=? FOR UPDATE',
        [id],
      );
      if (!rows.length || rows[0].filename !== target.filename)
        throw new BackupDeletionError('invalid_archive');
      if (!['completed', 'failed'].includes(String(rows[0].status)))
        throw new BackupDeletionError('archive_in_progress');
      const [references] = await execute(
        database,
        'SELECT COUNT(*) AS count FROM mud_backups WHERE filename=?',
        [target.filename],
      );
      if (Number(references[0]?.count) !== 1) throw new BackupDeletionError('shared_archive');
      const now = await clock(database);
      const protection = await readDataHoldSnapshot(database, now);
      if (protection.activeHolds > 0) throw new BackupDeletionError('archive_held');
      const record: ArchiveRemovalRecord = {
        format: 1,
        kind: 'managed_archive',
        operationId: randomUUID(),
        backupId: id,
        filename: target.filename,
        rootSha256: target.rootSha256,
        fileSha256: target.fileSha256,
        createdAtEpoch: now,
        finishedAtEpoch: null,
        phase: 'prepared',
        worker: null,
        outcome: null,
      };
      operationId = record.operationId;
      await beginArchiveRemoval(database, record);
      return record;
    });
    operationId = prepared.operationId;
    worker = startArchiveUnlinkWorker();
    await worker.ready();
    const identity = worker.identity();
    await transaction(database, async () => {
      const current = await readPendingArchiveRemoval(database);
      if (!current || current.operationId !== prepared.operationId || current.phase !== 'prepared')
        throw new BackupDeletionError('removal_in_progress', operationId);
      current.phase = 'armed';
      current.worker = identity;
      await saveArchiveRemoval(database, current);
    });
    // An unknown arming COMMIT never reaches this authorization.
    await worker.authorize(operationId, target);
    const outcome = await worker.result();
    const removed = outcome === 'removed' || outcome === 'absent';
    await transaction(database, async () => {
      await verifySchema(database, expected);
      const current = await readPendingArchiveRemoval(database);
      if (
        !current ||
        current.operationId !== prepared.operationId ||
        current.phase !== 'armed' ||
        JSON.stringify(current.worker) !== JSON.stringify(identity)
      )
        throw new BackupDeletionError('removal_in_progress', operationId);
      if (removed) {
        const [deleted] = await execute<ResultSetHeader>(
          database,
          "DELETE FROM mud_backups WHERE id=? AND filename=? AND status IN ('completed','failed')",
          [id, target.filename],
        );
        if (deleted.affectedRows !== 1) {
          const [remaining] = await execute(
            database,
            'SELECT id FROM mud_backups WHERE id=? FOR UPDATE',
            [id],
          );
          if (deleted.affectedRows !== 0 || remaining.length)
            throw new BackupDeletionError('storage_unavailable', operationId);
        }
      }
      current.phase = removed ? 'complete' : 'failed';
      current.outcome = outcome ?? 'worker_unconfirmed';
      current.finishedAtEpoch = await clock(database);
      await saveArchiveRemoval(database, current);
    });
    if (!removed) throw new BackupDeletionError('file_removal_unconfirmed', operationId);
    return true;
  } catch (error) {
    throw error instanceof BackupDeletionError
      ? new BackupDeletionError(error.reason, operationId ?? error.reference)
      : new BackupDeletionError('storage_unavailable', operationId);
  } finally {
    worker?.disconnect();
    connection?.destroy();
  }
}

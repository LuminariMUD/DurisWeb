import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../db/connection.js';
import { assertLifecycleMetadata } from '../db/lifecycleMetadata.js';
import { lockRetentionControl } from './retentionControl.js';
import {
  recoverManagedArchiveRemoval,
  assertArchiveAdmissionClear,
} from './managedArchiveRemoval.js';
import { BackupDeletionError } from '../utils/backupDeletionError.js';
import {
  DataHoldError,
  parseDataHoldCreate,
  validDataHoldId,
  validDataHoldActor,
  parseDataHoldRelease,
  dataHoldScopeColumns,
  parseDataHoldEpoch,
  parseDataHoldRow,
  DATA_HOLD_ROW_FIELDS,
  type DataHold,
} from './dataHoldRecords.js';
export { DataHoldError, parseDataHoldCreate, validDataHoldId } from './dataHoldRecords.js';
export type { DataHold, DataHoldScope } from './dataHoldRecords.js';

const TIMEOUT = 5000;
const fields = `${DATA_HOLD_ROW_FIELDS},UNIX_TIMESTAMP() AS observed_epoch`;

async function read(connection: PoolConnection, id: string): Promise<DataHold | undefined> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    {
      sql: `SELECT ${fields} FROM web_data_holds WHERE id=? FOR UPDATE`,
      timeout: TIMEOUT,
    },
    [id],
  );
  return rows.length ? parseDataHoldRow(rows[0]) : undefined;
}
async function transactionalStorage(connection: PoolConnection): Promise<void> {
  // Hold the metadata lock without creating a stale snapshot or taking a gap lock.
  await connection.execute({
    sql: 'SELECT id FROM web_data_holds WHERE 1=0 FOR UPDATE',
    timeout: TIMEOUT,
  });
  const [rows] = await connection.query<RowDataPacket[]>({
    sql: "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_data_holds'",
    timeout: TIMEOUT,
  });
  if (rows.length !== 1 || rows[0].ENGINE !== 'InnoDB')
    throw new DataHoldError('storage_unavailable');
  await assertLifecycleMetadata(connection, 'web_data_holds');
}
async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  let connection: PoolConnection | undefined,
    reusable = true;
  try {
    // Recovery probes process identity between transactions, never while holding a SQL lock.
    await recoverManagedArchiveRemoval();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await lockRetentionControl(connection);
    await assertArchiveAdmissionClear(connection);
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (connection)
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
    throw error instanceof DataHoldError
      ? error
      : error instanceof BackupDeletionError && error.reason === 'removal_in_progress'
        ? new DataHoldError('archive_cleanup_in_progress', error.reference)
        : error instanceof BackupDeletionError && error.reason === 'recovery_unverified'
          ? new DataHoldError('archive_recovery_unverified', error.reference)
          : new DataHoldError('storage_unavailable');
  } finally {
    if (connection) {
      if (reusable) connection.release();
      else connection.destroy();
    }
  }
}

/** The caller UUID makes an uncertain commit safely retryable; creation fields never change. */
export async function createDataHold(actor: string, value: unknown): Promise<DataHold> {
  if (!validDataHoldActor(actor)) throw new DataHoldError('invalid_request');
  const request = parseDataHoldCreate(value);
  return transaction(async (connection) => {
    await transactionalStorage(connection);
    const columns = dataHoldScopeColumns(request.scope);
    // No initial consistent read: MariaDB snapshot isolation must see a competing insert.
    // An old exact replay still reads its existing row when the new-insert date gate is false.
    await connection.execute<ResultSetHeader>(
      {
        sql: `INSERT INTO web_data_holds
        (id,scope_type,class_id,account_name,reason,created_by,review_at_epoch,expires_at_epoch,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM DUAL WHERE ?>UNIX_TIMESTAMP()
        ON DUPLICATE KEY UPDATE id=id`,
        timeout: TIMEOUT,
      },
      [
        request.id,
        ...columns,
        request.reason,
        actor,
        request.reviewAtEpoch,
        request.expiresAtEpoch,
        request.reviewAtEpoch,
      ],
    );
    const row = await read(connection, request.id);
    if (!row) throw new DataHoldError('invalid_request');
    if (
      row.createdBy !== actor ||
      JSON.stringify(dataHoldScopeColumns(row.scope)) !==
        JSON.stringify(dataHoldScopeColumns(request.scope)) ||
      row.reason !== request.reason ||
      row.reviewAtEpoch !== request.reviewAtEpoch ||
      row.expiresAtEpoch !== request.expiresAtEpoch
    )
      throw new DataHoldError('identity_conflict');
    return row;
  });
}
/** A release preserves both the original intent and one immutable attributed outcome. */
export async function releaseDataHold(
  actor: string,
  id: string,
  value: unknown,
): Promise<DataHold> {
  if (!validDataHoldActor(actor) || !validDataHoldId(id))
    throw new DataHoldError('invalid_request');
  const reason = parseDataHoldRelease(value);
  return transaction(async (connection) => {
    let row = await read(connection, id);
    await transactionalStorage(connection);
    if (!row) throw new DataHoldError('not_found');
    if (row.releasedAtEpoch !== null) {
      if (row.releasedBy !== actor || row.releaseReason !== reason)
        throw new DataHoldError('release_conflict');
      return row;
    }
    const [clock] = await connection.execute<RowDataPacket[]>({
      sql: 'SELECT UNIX_TIMESTAMP() AS epoch',
      timeout: TIMEOUT,
    });
    const now = parseDataHoldEpoch(clock[0].epoch);
    if (now < row.createdAtEpoch) throw new DataHoldError('storage_unavailable');
    const [updated] = await connection.execute<ResultSetHeader>(
      {
        sql: 'UPDATE web_data_holds SET released_by=?,release_reason=?,released_at_epoch=?,updated_at=FROM_UNIXTIME(?) WHERE id=? AND released_at_epoch IS NULL',
        timeout: TIMEOUT,
      },
      [actor, reason, now, now, id],
    );
    if (updated.affectedRows !== 1) throw new DataHoldError('storage_unavailable');
    row = await read(connection, id);
    if (
      !row ||
      row.releasedBy !== actor ||
      row.releaseReason !== reason ||
      row.releasedAtEpoch !== now
    )
      throw new DataHoldError('storage_unavailable');
    return row;
  });
}
export async function getDataHold(id: string): Promise<DataHold> {
  if (!validDataHoldId(id)) throw new DataHoldError('invalid_request');
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      { sql: `SELECT ${fields} FROM web_data_holds WHERE id=?`, timeout: TIMEOUT },
      [id],
    );
    if (!rows.length) throw new DataHoldError('not_found');
    return parseDataHoldRow(rows[0]);
  } catch (error) {
    throw error instanceof DataHoldError ? error : new DataHoldError('storage_unavailable');
  }
}
export async function listDataHolds(options: {
  after: string | null;
  includeReleased: boolean;
  limit: number;
}): Promise<{ holds: DataHold[]; nextCursor: string | null }> {
  if (
    (options.after !== null && !validDataHoldId(options.after)) ||
    typeof options.includeReleased !== 'boolean' ||
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 100
  )
    throw new DataHoldError('invalid_request');
  try {
    const condition = options.includeReleased ? 'id>?' : 'released_at_epoch IS NULL AND id>?';
    const indexHint = options.includeReleased ? '' : ' FORCE INDEX (idx_data_holds_unreleased)';
    const [rows] = await pool.execute<RowDataPacket[]>(
      {
        sql: `SELECT ${fields} FROM web_data_holds${indexHint} WHERE ${condition} ORDER BY id LIMIT ?`,
        timeout: TIMEOUT,
      },
      [options.after ?? '', options.limit + 1],
    );
    const holds = rows.slice(0, options.limit).map(parseDataHoldRow);
    return { holds, nextCursor: rows.length > options.limit ? holds.at(-1)!.id : null };
  } catch (error) {
    throw error instanceof DataHoldError ? error : new DataHoldError('storage_unavailable');
  }
}

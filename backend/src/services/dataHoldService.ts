import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../db/connection.js';
import { retentionPreviewClasses, type RetentionPreviewClass } from '../config/retentionPolicy.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TIMEOUT = 5000;
export type DataHoldScope =
  | { kind: 'global' }
  | { kind: 'class'; classId: RetentionPreviewClass }
  | { kind: 'account'; accountName: string }
  | { kind: 'account_class'; classId: RetentionPreviewClass; accountName: string };
export interface DataHold {
  id: string;
  scope: DataHoldScope;
  reason: string;
  createdBy: string;
  createdAtEpoch: number;
  reviewAtEpoch: number;
  expiresAtEpoch: number | null;
  status: 'active' | 'expired' | 'released';
  reviewDue: boolean;
  releasedBy: string | null;
  releaseReason: string | null;
  releasedAtEpoch: number | null;
  updatedAtEpoch: number;
}
interface CreateHold {
  id: string;
  scope: DataHoldScope;
  reason: string;
  reviewAtEpoch: number;
  expiresAtEpoch: number | null;
}
type HoldFailure =
  | 'invalid_request'
  | 'not_found'
  | 'identity_conflict'
  | 'release_conflict'
  | 'invalid_record'
  | 'storage_unavailable';
const failures = {
  invalid_request: [400, 'The hold request is invalid.'],
  not_found: [404, 'Hold not found.'],
  identity_conflict: [409, 'This hold identity already belongs to a different request.'],
  release_conflict: [409, 'This hold already has a different release record.'],
  invalid_record: [503, 'Hold records require operator review.'],
  storage_unavailable: [503, 'Hold records are temporarily unavailable.'],
} as const;
/** Fixed messages only; no driver errors, subject data or reasons enter diagnostics. */
export class DataHoldError extends Error {
  readonly reference = randomUUID();
  readonly status: number;
  constructor(readonly reason: HoldFailure) {
    super(failures[reason][1]);
    this.name = 'DataHoldError';
    this.status = failures[reason][0];
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, names: string[]) {
  return Object.keys(value).sort().join(',') === names.sort().join(',');
}
function text(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Array.from(value).length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    Buffer.from(value).toString('utf8') === value
  );
}
function account(value: unknown): value is string {
  return text(value, 50) && value.trim() === value && !/[\r\n\t]/.test(value);
}
function epoch(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 253402300799
  );
}
function validClass(value: unknown): value is RetentionPreviewClass {
  return typeof value === 'string' && retentionPreviewClasses.some((item) => item === value);
}
export function validDataHoldId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function scope(value: unknown): DataHoldScope {
  if (object(value)) {
    if (value.kind === 'global' && keys(value, ['kind'])) return { kind: 'global' };
    if (value.kind === 'class' && keys(value, ['kind', 'classId']) && validClass(value.classId))
      return { kind: 'class', classId: value.classId };
    if (
      value.kind === 'account' &&
      keys(value, ['kind', 'accountName']) &&
      account(value.accountName)
    )
      return { kind: 'account', accountName: value.accountName };
    if (
      value.kind === 'account_class' &&
      keys(value, ['kind', 'classId', 'accountName']) &&
      validClass(value.classId) &&
      account(value.accountName)
    )
      return { kind: 'account_class', classId: value.classId, accountName: value.accountName };
  }
  throw new DataHoldError('invalid_request');
}
export function parseDataHoldCreate(value: unknown): CreateHold {
  if (
    !object(value) ||
    !keys(value, ['id', 'scope', 'reason', 'reviewAtEpoch', 'expiresAtEpoch']) ||
    !validDataHoldId(value.id) ||
    !text(value.reason, 512) ||
    !epoch(value.reviewAtEpoch) ||
    (value.expiresAtEpoch !== null &&
      (!epoch(value.expiresAtEpoch) || value.expiresAtEpoch < value.reviewAtEpoch))
  )
    throw new DataHoldError('invalid_request');
  return {
    id: value.id,
    scope: scope(value.scope),
    reason: value.reason.trim(),
    reviewAtEpoch: value.reviewAtEpoch,
    expiresAtEpoch: value.expiresAtEpoch,
  };
}
function parseRelease(value: unknown): string {
  if (!object(value) || !keys(value, ['reason']) || !text(value.reason, 512))
    throw new DataHoldError('invalid_request');
  return value.reason.trim();
}
function scopeColumns(value: DataHoldScope): [string, string | null, string | null] {
  return [
    value.kind,
    'classId' in value ? value.classId : null,
    'accountName' in value ? value.accountName : null,
  ];
}
function numberEpoch(value: unknown): number {
  const parsed = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!epoch(parsed)) throw new DataHoldError('invalid_record');
  return parsed;
}
function fromRow(row: RowDataPacket): DataHold {
  try {
    if (!validDataHoldId(row.id) || !text(row.reason, 512) || !account(row.created_by))
      throw new Error();
    const input: Record<string, unknown> = { kind: row.scope_type };
    if (row.class_id !== null) input.classId = row.class_id;
    if (row.account_name !== null) input.accountName = row.account_name;
    const holdScope = scope(input);
    const created = numberEpoch(row.created_at_epoch),
      updated = numberEpoch(row.updated_at_epoch),
      now = numberEpoch(row.observed_epoch),
      review = numberEpoch(row.review_at_epoch),
      expires = row.expires_at_epoch === null ? null : numberEpoch(row.expires_at_epoch),
      released = row.released_at_epoch === null ? null : numberEpoch(row.released_at_epoch);
    if (
      review <= created ||
      updated < created ||
      (expires !== null && expires < review) ||
      (released === null
        ? row.released_by !== null || row.release_reason !== null
        : !account(row.released_by) ||
          !text(row.release_reason, 512) ||
          released < created ||
          updated < released)
    )
      throw new Error();
    const status =
      released !== null ? 'released' : expires !== null && expires <= now ? 'expired' : 'active';
    return {
      id: row.id,
      scope: holdScope,
      reason: row.reason,
      createdBy: row.created_by,
      createdAtEpoch: created,
      reviewAtEpoch: review,
      expiresAtEpoch: expires,
      status,
      reviewDue: status === 'active' && review <= now,
      releasedBy: row.released_by,
      releaseReason: row.release_reason,
      releasedAtEpoch: released,
      updatedAtEpoch: updated,
    };
  } catch {
    throw new DataHoldError('invalid_record');
  }
}
const fields = `id,scope_type,class_id,account_name,reason,created_by,review_at_epoch,expires_at_epoch,
  released_by,release_reason,released_at_epoch,UNIX_TIMESTAMP(created_at) AS created_at_epoch,
  UNIX_TIMESTAMP(updated_at) AS updated_at_epoch,UNIX_TIMESTAMP() AS observed_epoch`;
async function read(connection: PoolConnection, id: string): Promise<DataHold | undefined> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    {
      sql: `SELECT ${fields} FROM web_data_holds WHERE id=? FOR UPDATE`,
      timeout: TIMEOUT,
    },
    [id],
  );
  return rows.length ? fromRow(rows[0]) : undefined;
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
}
async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  let connection: PoolConnection | undefined,
    reusable = true;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
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
    throw error instanceof DataHoldError ? error : new DataHoldError('storage_unavailable');
  } finally {
    if (connection) {
      if (reusable) connection.release();
      else connection.destroy();
    }
  }
}

/** The caller UUID makes an uncertain commit safely retryable; creation fields never change. */
export async function createDataHold(actor: string, value: unknown): Promise<DataHold> {
  if (!account(actor)) throw new DataHoldError('invalid_request');
  const request = parseDataHoldCreate(value);
  return transaction(async (connection) => {
    await transactionalStorage(connection);
    const columns = scopeColumns(request.scope);
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
      JSON.stringify(scopeColumns(row.scope)) !== JSON.stringify(scopeColumns(request.scope)) ||
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
  if (!account(actor) || !validDataHoldId(id)) throw new DataHoldError('invalid_request');
  const reason = parseRelease(value);
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
    const now = numberEpoch(clock[0].epoch);
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
    return fromRow(rows[0]);
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
    const holds = rows.slice(0, options.limit).map(fromRow);
    return { holds, nextCursor: rows.length > options.limit ? holds.at(-1)!.id : null };
  } catch (error) {
    throw error instanceof DataHoldError ? error : new DataHoldError('storage_unavailable');
  }
}

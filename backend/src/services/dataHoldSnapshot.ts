import { createHash } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { DataHoldError, DATA_HOLD_ROW_FIELDS, parseDataHoldRow } from './dataHoldRecords.js';

/** Expired unreleased records still require closeout/validation; never trim evidence to fit. */
export const DATA_HOLD_SNAPSHOT_LIMIT = 1000;

/** Same-connection snapshot validation; this module never creates a pool or reads MUD data. */
export async function readDataHoldSnapshot(
  connection: Pick<Connection, 'execute'>,
  observedAtEpoch: number,
): Promise<{ fingerprint: string; activeHolds: number }> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    {
      sql: `SELECT ${DATA_HOLD_ROW_FIELDS},? AS observed_epoch FROM web_data_holds
        FORCE INDEX (idx_data_holds_unreleased) WHERE released_at_epoch IS NULL ORDER BY id LIMIT 1001`,
      timeout: 5000,
    },
    [observedAtEpoch],
  );
  if (rows.length > DATA_HOLD_SNAPSHOT_LIMIT) throw new DataHoldError('invalid_record');
  const active = rows.map(parseDataHoldRow).filter((hold) => hold.status === 'active');
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        format: 'hold-snapshot-v1',
        protection: active.map((hold) => [hold.id, hold.scope, hold.expiresAtEpoch]),
      }),
    )
    .digest('hex');
  return { fingerprint, activeHolds: active.length };
}

/** The candidate alias is literal in both reviewed preview queries; all class/time values are bound. */
export const DATA_HOLD_MATCH_SQL = `EXISTS (
  SELECT 1 FROM web_data_holds h FORCE INDEX (idx_data_holds_unreleased)
  WHERE h.released_at_epoch IS NULL AND (h.expires_at_epoch IS NULL OR h.expires_at_epoch>?) AND (
    h.scope_type='global' OR
    (h.scope_type='class' AND h.class_id=?) OR
    (h.scope_type='account' AND h.account_name=candidate.account_name) OR
    (h.scope_type='account_class' AND h.class_id=? AND h.account_name=candidate.account_name)
  ))`;

import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { RETENTION_CONTROL_KEY } from '../db/internalWebSettings.js';

export const RETENTION_CONTROL_DESCRIPTION = 'retention control v1';
export const EMPTY_RETENTION_CONTROL = '{"format":1,"lease":null}';
export interface RetentionControl {
  format: 1;
  lease: { owner: string; runId: string; expiresAtEpoch: number } | null;
}
export class RetentionControlError extends Error {
  constructor() {
    super('Retention control is unavailable or invalid');
    this.name = 'RetentionControlError';
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Database = Pick<Connection, 'execute' | 'query'>;
function parse(row: Readonly<Record<string, unknown>>): RetentionControl {
  try {
    if (
      row.setting_key !== RETENTION_CONTROL_KEY ||
      row.description !== RETENTION_CONTROL_DESCRIPTION ||
      row.updated_by !== null ||
      typeof row.setting_value !== 'string' ||
      Buffer.byteLength(row.setting_value) > 1024
    )
      throw new Error();
    const value: unknown = JSON.parse(row.setting_value);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('format' in value) ||
      value.format !== 1 ||
      !('lease' in value) ||
      Object.keys(value).sort().join(',') !== 'format,lease'
    )
      throw new Error();
    if (value.lease === null) return { format: 1, lease: null };
    const lease = value.lease;
    if (
      !lease ||
      typeof lease !== 'object' ||
      Array.isArray(lease) ||
      Object.keys(lease).sort().join(',') !== 'expiresAtEpoch,owner,runId' ||
      !('owner' in lease) ||
      typeof lease.owner !== 'string' ||
      !uuid.test(lease.owner) ||
      !('runId' in lease) ||
      typeof lease.runId !== 'string' ||
      !uuid.test(lease.runId) ||
      !('expiresAtEpoch' in lease) ||
      typeof lease.expiresAtEpoch !== 'number' ||
      !Number.isSafeInteger(lease.expiresAtEpoch) ||
      lease.expiresAtEpoch <= 0 ||
      lease.expiresAtEpoch > 253402300799
    )
      throw new Error();
    return {
      format: 1,
      lease: { owner: lease.owner, runId: lease.runId, expiresAtEpoch: lease.expiresAtEpoch },
    };
  } catch {
    throw new RetentionControlError();
  }
}
/** Call inside a transaction, before hold/run rows. Insert-first avoids a stale MariaDB snapshot. */
export async function lockRetentionControl(database: Database): Promise<RetentionControl> {
  try {
    await database.execute({
      sql: 'SELECT setting_key FROM web_settings WHERE 1=0 FOR UPDATE',
      timeout: 5000,
    });
    const [engines] = await database.query<RowDataPacket[]>({
      sql: "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_settings'",
      timeout: 5000,
    });
    if (engines.length !== 1 || engines[0].ENGINE !== 'InnoDB') throw new Error();
    const [triggers] = await database.query<RowDataPacket[]>({
      sql: "SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='web_settings'",
      timeout: 5000,
    });
    if (Number(triggers[0]?.count) !== 0) throw new Error();
    await database.execute(
      {
        sql: `INSERT INTO web_settings(setting_key,setting_value,description,updated_by) VALUES (?,?,?,NULL)
      ON DUPLICATE KEY UPDATE setting_key=setting_key`,
        timeout: 5000,
      },
      [RETENTION_CONTROL_KEY, EMPTY_RETENTION_CONTROL, RETENTION_CONTROL_DESCRIPTION],
    );
    const [rows] = await database.execute<RowDataPacket[]>(
      {
        sql: 'SELECT setting_key,setting_value,description,updated_by FROM web_settings WHERE setting_key=? FOR UPDATE',
        timeout: 5000,
      },
      [RETENTION_CONTROL_KEY],
    );
    if (rows.length !== 1) throw new Error();
    return parse(rows[0]);
  } catch {
    throw new RetentionControlError();
  }
}
export async function saveRetentionControl(
  database: Database,
  value: RetentionControl,
): Promise<void> {
  const encoded = JSON.stringify(value);
  parse({
    setting_key: RETENTION_CONTROL_KEY,
    setting_value: encoded,
    description: RETENTION_CONTROL_DESCRIPTION,
    updated_by: null,
  });
  try {
    const [result] = await database.execute<ResultSetHeader>(
      {
        sql: 'UPDATE web_settings SET setting_value=?,updated_at=NOW(),updated_by=NULL WHERE setting_key=?',
        timeout: 5000,
      },
      [encoded, RETENTION_CONTROL_KEY],
    );
    if (result.affectedRows !== 1) throw new Error();
  } catch {
    throw new RetentionControlError();
  }
}

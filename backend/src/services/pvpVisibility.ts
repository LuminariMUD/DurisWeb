import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import { getWebSettings } from './webSettingsService.js';

/** The same release cutoff applies to battle metadata, snapshots, and interactions. */
export function pvpVisibilitySql(alias: 'e' | 'e2' = 'e'): string {
  return `${alias}.stamp <= DATE_SUB(NOW(), INTERVAL ? MINUTE)`;
}

export async function getPvpDelayMinutes(): Promise<number> {
  return (await getWebSettings()).pvpDelayMinutes;
}

/** Refuse hidden and absent events identically before reading or writing interactions. */
export async function requireVisiblePvpEvent(eventId: number): Promise<void> {
  const delay = await getPvpDelayMinutes();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT e.id FROM pkill_event e WHERE e.id = ? AND ${pvpVisibilitySql()}`,
    [eventId, delay],
  );
  if (rows.length === 0) throw new AppError('Event not found', 404);
}

/** Serialize the database's timestamp interpretation as an unambiguous instant. */
export function pvpTimestamp(epochSeconds: number | string): string {
  return new Date(Number(epochSeconds) * 1000).toISOString();
}

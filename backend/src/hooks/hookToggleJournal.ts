import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { getHook } from './registry.js';
import type { HookDefinition, HookId } from './types.js';
import { HOOK_JOURNAL_PREFIX } from '../db/internalWebSettings.js';
export { HOOK_JOURNAL_PREFIX } from '../db/internalWebSettings.js';

const EVENT_LIMIT_BYTES = 2048;
const BATCH_LIMIT = 100;
const QUERY_TIMEOUT_MS = 5000;
const PENDING = 'hook audit pending';
const DELIVERED = 'hook audit delivered';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Bindings = (string | number | boolean | null)[];
type Failure =
  | 'audit_unavailable'
  | 'audit_identity_conflict'
  | 'journal_invalid'
  | 'journal_unavailable';

export class HookToggleError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unknown_hook'
      | 'always_on'
      | 'invalid_request'
      | 'idempotency_conflict'
      | 'storage_unavailable',
    readonly acknowledgementUnknown = false,
  ) {
    super(message);
    this.name = 'HookToggleError';
  }
}
class JournalInvalid extends Error {}
class CommitUnknown extends Error {}
class AuditConflict extends Error {}

export interface HookChangeEvent {
  readonly id: string;
  readonly hookId: HookId;
  readonly actor: string;
  readonly previous: boolean;
  readonly enabled: boolean;
  readonly occurredAtEpoch: number;
}
interface Envelope {
  version: 1;
  event: HookChangeEvent;
  delivery: {
    state: 'pending' | 'delivered';
    attempts: number;
    nextAttemptAtEpoch: number;
    deliveredAtEpoch: number | null;
    lastFailure: Failure | null;
  };
}
export interface HookChangeReceipt {
  readonly event: HookChangeEvent;
  readonly replayed: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.sort());
}
function actorValid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 50 &&
    value.trim().length > 0 &&
    Buffer.from(value, 'utf8').toString('utf8') === value
  );
}
function epoch(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799
  );
}
function parseEnvelope(
  value: unknown,
  key: string,
  description: unknown,
  bytes?: unknown,
): Envelope {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > EVENT_LIMIT_BYTES ||
    (bytes !== undefined && Number(bytes) > EVENT_LIMIT_BYTES)
  )
    throw new JournalInvalid();
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    throw new JournalInvalid();
  }
  if (
    !record(data) ||
    !keys(data, ['version', 'event', 'delivery']) ||
    data.version !== 1 ||
    !record(data.event) ||
    !record(data.delivery)
  )
    throw new JournalInvalid();
  const event = data.event,
    delivery = data.delivery;
  const state =
    description === PENDING ? 'pending' : description === DELIVERED ? 'delivered' : null;
  const hook = typeof event.hookId === 'string' ? getHook(event.hookId) : undefined;
  if (
    !keys(event, ['id', 'hookId', 'actor', 'previous', 'enabled', 'occurredAtEpoch']) ||
    typeof event.id !== 'string' ||
    !UUID.test(event.id) ||
    key !== HOOK_JOURNAL_PREFIX + event.id ||
    !hook ||
    hook.alwaysOn ||
    !hook.webSettingKey ||
    !actorValid(event.actor) ||
    typeof event.previous !== 'boolean' ||
    typeof event.enabled !== 'boolean' ||
    !epoch(event.occurredAtEpoch) ||
    !state ||
    !keys(delivery, ['attempts', 'nextAttemptAtEpoch', 'deliveredAtEpoch', 'lastFailure']) ||
    typeof delivery.attempts !== 'number' ||
    !Number.isSafeInteger(delivery.attempts) ||
    delivery.attempts < 0 ||
    delivery.attempts > 1000000 ||
    !epoch(delivery.nextAttemptAtEpoch) ||
    (delivery.lastFailure !== null &&
      (typeof delivery.lastFailure !== 'string' ||
        ![
          'audit_unavailable',
          'audit_identity_conflict',
          'journal_invalid',
          'journal_unavailable',
        ].includes(delivery.lastFailure))) ||
    (state === 'pending' ? delivery.deliveredAtEpoch !== null : !epoch(delivery.deliveredAtEpoch))
  )
    throw new JournalInvalid();
  return { ...data, delivery: { ...delivery, state } } as unknown as Envelope;
}
async function query<T extends RowDataPacket[] | ResultSetHeader = RowDataPacket[]>(
  connection: PoolConnection,
  sql: string,
  values: Bindings = [],
) {
  // JSON values must not depend on the server's backslash-escaping mode.
  return values.length
    ? connection.execute<T>({ sql, timeout: QUERY_TIMEOUT_MS }, values)
    : connection.query<T>({ sql, timeout: QUERY_TIMEOUT_MS });
}
async function transactionalSettings(connection: PoolConnection): Promise<void> {
  // Hold table metadata through commit before checking the transactional engine.
  await query(connection, 'SELECT setting_key FROM web_settings LIMIT 0');
  const [rows] = await query(
    connection,
    "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_settings'",
  );
  if (rows.length !== 1 || rows[0].ENGINE !== 'InnoDB')
    throw new Error('settings_not_transactional');
}
async function readEnvelope(
  connection: PoolConnection,
  key: string,
  lock = true,
): Promise<Envelope | null> {
  const [rows] = await query(
    connection,
    `SELECT setting_key,description,LEFT(setting_value,${EVENT_LIMIT_BYTES + 1}) AS value,OCTET_LENGTH(setting_value) AS bytes
     FROM web_settings WHERE setting_key=?${lock ? ' FOR UPDATE' : ''}`,
    [key],
  );
  return rows.length
    ? parseEnvelope(rows[0].value, String(rows[0].setting_key), rows[0].description, rows[0].bytes)
    : null;
}
async function saveEnvelope(
  connection: PoolConnection,
  key: string,
  envelope: Envelope,
): Promise<void> {
  const { state, ...delivery } = envelope.delivery;
  const value = JSON.stringify({ version: envelope.version, event: envelope.event, delivery });
  const description = state === 'pending' ? PENDING : DELIVERED;
  parseEnvelope(value, key, description);
  await query(
    connection,
    'UPDATE web_settings SET setting_value=?,description=? WHERE setting_key=?',
    [value, description, key],
  );
}
async function rollback(connection: PoolConnection): Promise<boolean> {
  try {
    await query(connection, 'ROLLBACK');
    return true;
  } catch {
    connection.destroy();
    return false;
  }
}
function diagnostic(reason: string): void {
  logger.error('[hooks] Durable audit operation failed', {
    reason,
    reference: crypto.randomUUID(),
  });
}
function agrees(
  event: HookChangeEvent,
  hook: HookDefinition,
  enabled: boolean,
  actor: string,
): boolean {
  return event.hookId === hook.id && event.enabled === enabled && event.actor === actor;
}
async function attemptChange(
  hook: HookDefinition,
  enabled: boolean,
  actor: string,
  id: string,
): Promise<HookChangeReceipt> {
  const connection = await pool.getConnection();
  let reusable = true,
    committing = false;
  const key = HOOK_JOURNAL_PREFIX + id;
  try {
    await query(connection, 'START TRANSACTION');
    await transactionalSettings(connection);
    let duplicate = false;
    try {
      // Never committed alone: uniqueness serializes the request before the hook row.
      await query(
        connection,
        'INSERT INTO web_settings (setting_key,setting_value,description) VALUES (?,?,?)',
        [key, 'uncommitted', PENDING],
      );
    } catch (error) {
      if (record(error) && error.code === 'ER_DUP_ENTRY') duplicate = true;
      else throw error;
    }
    if (duplicate) {
      // Duplicate INSERT can hold shared record locks. Release them before a
      // replay; event data is immutable, so no lock upgrade is necessary.
      await query(connection, 'ROLLBACK');
      const previous = await readEnvelope(connection, key, false);
      if (!previous) throw new JournalInvalid();
      if (!agrees(previous.event, hook, enabled, actor))
        throw new HookToggleError(
          'Request identity was already used for another hook change.',
          'idempotency_conflict',
        );
      return { event: Object.freeze({ ...previous.event }), replayed: true };
    }
    await query(
      connection,
      `INSERT INTO web_settings (setting_key,setting_value) VALUES (?,'true')
       ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key)`,
      [hook.webSettingKey],
    );
    const [rows] = await query(
      connection,
      'SELECT setting_value,UNIX_TIMESTAMP() AS epoch FROM web_settings WHERE setting_key=? FOR UPDATE',
      [hook.webSettingKey],
    );
    const occurredAtEpoch = Number(rows[0]?.epoch);
    if (!epoch(occurredAtEpoch)) throw new Error('invalid_database_clock');
    const previous = !['false', '0'].includes(String(rows[0].setting_value).trim().toLowerCase());
    const envelope: Envelope = {
      version: 1,
      event: { id, hookId: hook.id, actor, previous, enabled, occurredAtEpoch },
      delivery: {
        state: 'pending',
        attempts: 0,
        nextAttemptAtEpoch: occurredAtEpoch,
        deliveredAtEpoch: null,
        lastFailure: null,
      },
    };
    await query(
      connection,
      'UPDATE web_settings SET setting_value=?,updated_by=?,updated_at=FROM_UNIXTIME(?) WHERE setting_key=?',
      [enabled ? 'true' : 'false', actor, occurredAtEpoch, hook.webSettingKey],
    );
    await saveEnvelope(connection, key, envelope);
    committing = true;
    await query(connection, 'COMMIT');
    return { event: Object.freeze({ ...envelope.event }), replayed: false };
  } catch (error) {
    reusable = await rollback(connection);
    if (error instanceof HookToggleError) throw error;
    if (committing) throw new CommitUnknown();
    throw new HookToggleError(
      'Hook settings storage could not commit the change.',
      'storage_unavailable',
    );
  } finally {
    if (reusable) connection.release();
  }
}

/** The UUID is the event identity and the website-only idempotency identity. */
export async function commitHookChange(
  hook: HookDefinition,
  enabled: boolean,
  actor: string,
  requestId?: string,
): Promise<HookChangeReceipt> {
  const id =
    requestId === undefined
      ? crypto.randomUUID()
      : typeof requestId === 'string'
        ? requestId.toLowerCase()
        : '';
  if (!UUID.test(id) || typeof enabled !== 'boolean' || !actorValid(actor))
    throw new HookToggleError(
      'Hook change requires a valid actor, boolean and UUID request identity.',
      'invalid_request',
    );
  try {
    return await attemptChange(hook, enabled, actor, id);
  } catch (error) {
    if (error instanceof CommitUnknown) {
      const connection = await pool.getConnection().catch(() => null);
      if (connection)
        try {
          const saved = await readEnvelope(connection, HOOK_JOURNAL_PREFIX + id);
          if (saved && agrees(saved.event, hook, enabled, actor))
            return { event: Object.freeze({ ...saved.event }), replayed: true };
        } catch {
          /* Keep acknowledgement uncertainty explicit, without logging driver data. */
        } finally {
          connection.release();
        }
    }
    if (error instanceof HookToggleError && error.code !== 'storage_unavailable') throw error;
    diagnostic(error instanceof CommitUnknown ? 'toggle_commit_unknown' : 'toggle_storage_failed');
    throw new HookToggleError(
      'Hook settings storage could not confirm the change. Retry with the same request identity.',
      'storage_unavailable',
      error instanceof CommitUnknown,
    );
  }
}

let scanCursor = '';
let cycleInvalid = 0;
let lastCycleInvalid: number | null = null;
let lastPollEpoch: number | null = null;
let lastFailure: Failure | null = null;
let timer: NodeJS.Timeout | null = null;
let active: Promise<HookAuditBatch> | null = null;
export interface HookAuditBatch {
  busy: boolean;
  scanned: number;
  delivered: number;
  failed: number;
  invalid: number;
}
async function defer(key: string, reason: Failure): Promise<void> {
  const connection = await pool.getConnection();
  let reusable = true;
  try {
    await query(connection, 'START TRANSACTION');
    const envelope = await readEnvelope(connection, key);
    if (envelope?.delivery.state === 'pending') {
      const [clock] = await query(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
      if (!epoch(Number(clock[0].epoch))) throw new Error('invalid_database_clock');
      const attempts = Math.min(envelope.delivery.attempts + 1, 1000000);
      envelope.delivery.attempts = attempts;
      envelope.delivery.nextAttemptAtEpoch =
        Number(clock[0].epoch) + Math.min(2 ** Math.min(attempts, 9), 300);
      envelope.delivery.lastFailure = reason;
      await saveEnvelope(connection, key, envelope);
    }
    await query(connection, 'COMMIT');
  } catch {
    reusable = await rollback(connection);
    throw new Error('journal_retry_metadata_failed');
  } finally {
    if (reusable) connection.release();
  }
}
async function deliver(
  key: string,
  force: boolean,
): Promise<'delivered' | 'skipped' | 'failed' | 'invalid'> {
  const connection = await pool.getConnection();
  let reusable = true;
  try {
    await query(connection, 'START TRANSACTION');
    await transactionalSettings(connection);
    const envelope = await readEnvelope(connection, key);
    const [clock] = await query(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
    const now = Number(clock[0].epoch);
    if (!epoch(now)) throw new Error('invalid_database_clock');
    if (
      !envelope ||
      envelope.delivery.state === 'delivered' ||
      (!force && envelope.delivery.nextAttemptAtEpoch > now)
    ) {
      await query(connection, 'COMMIT');
      return 'skipped';
    }
    const event = envelope.event;
    const hook = getHook(event.hookId)!;
    const notes = `DurisWeb hook toggle (${hook.channel})`;
    const [existing] = await query(
      connection,
      "SELECT account_name,action_type,target,old_value,new_value,notes,DATE_FORMAT(`timestamp`,'%Y-%m-%d %H:%i:%s') AS event_utc FROM admin_action_log WHERE hook_event_id=?",
      [event.id],
    );
    const [engine] = await query(
      connection,
      "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_action_log'",
    );
    if (engine.length !== 1 || engine[0].ENGINE !== 'InnoDB')
      throw new Error('audit_not_transactional');
    if (existing.length) {
      const row = existing[0];
      if (
        existing.length !== 1 ||
        row.account_name !== event.actor ||
        row.action_type !== 'property_change' ||
        row.target !== `hook:${event.hookId}` ||
        row.old_value !== (event.previous ? 'enabled' : 'disabled') ||
        row.new_value !== (event.enabled ? 'enabled' : 'disabled') ||
        row.notes !== notes ||
        row.event_utc !==
          new Date(event.occurredAtEpoch * 1000).toISOString().slice(0, 19).replace('T', ' ')
      )
        throw new AuditConflict();
    } else {
      await query(
        connection,
        `INSERT INTO admin_action_log (account_name,action_type,target,old_value,new_value,notes,hook_event_id,timestamp)
         VALUES (?,'property_change',?,?,?,?,?,TIMESTAMPADD(SECOND,?,'1970-01-01 00:00:00'))`,
        [
          event.actor,
          `hook:${event.hookId}`,
          event.previous ? 'enabled' : 'disabled',
          event.enabled ? 'enabled' : 'disabled',
          notes,
          event.id,
          event.occurredAtEpoch,
        ],
      );
    }
    envelope.delivery = {
      state: 'delivered',
      attempts: Math.min(envelope.delivery.attempts + 1, 1000000),
      nextAttemptAtEpoch: now,
      deliveredAtEpoch: now,
      lastFailure: null,
    };
    await saveEnvelope(connection, key, envelope);
    await query(connection, 'COMMIT');
    return 'delivered';
  } catch (error) {
    reusable = await rollback(connection);
    if (error instanceof JournalInvalid) {
      lastFailure = 'journal_invalid';
      return 'invalid';
    }
    const reason = error instanceof AuditConflict ? 'audit_identity_conflict' : 'audit_unavailable';
    lastFailure = reason;
    // Release before taking a new checkout, including on a one-connection pool.
    if (reusable) {
      connection.release();
      reusable = false;
    }
    try {
      await defer(key, reason);
    } catch {
      lastFailure = 'journal_unavailable';
    }
    return 'failed';
  } finally {
    if (reusable) connection.release();
  }
}
async function batch(limit: number, force: boolean): Promise<HookAuditBatch> {
  const result: HookAuditBatch = { busy: false, scanned: 0, delivered: 0, failed: 0, invalid: 0 };
  const connection = await pool.getConnection();
  let rows: RowDataPacket[];
  try {
    const readWindow = () =>
      query(
        connection,
        `SELECT setting_key,description,LEFT(setting_value,${EVENT_LIMIT_BYTES + 1}) AS value,OCTET_LENGTH(setting_value) AS bytes FROM web_settings WHERE setting_key LIKE ? AND setting_key>? AND (description IS NULL OR BINARY description<>?) ORDER BY setting_key LIMIT ${limit}`,
        [HOOK_JOURNAL_PREFIX + '%', scanCursor, DELIVERED],
      );
    [rows] = await readWindow();
    if (rows.length === 0 && scanCursor !== '') {
      lastCycleInvalid = cycleInvalid;
      cycleInvalid = 0;
      scanCursor = '';
      [rows] = await readWindow();
    }
    const [clock] = await query(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
    if (!epoch(Number(clock[0].epoch))) throw new Error('invalid_database_clock');
    lastPollEpoch = Number(clock[0].epoch);
  } finally {
    connection.release();
  }
  const deadline = performance.now() + 2000;
  for (const row of rows) {
    if (performance.now() > deadline) break;
    const key = String(row.setting_key);
    scanCursor = key;
    result.scanned++;
    try {
      const envelope = parseEnvelope(row.value, key, row.description, row.bytes);
      if (envelope.delivery.state === 'delivered') continue;
      const outcome = await deliver(key, force);
      if (outcome !== 'skipped') result[outcome]++;
    } catch (error) {
      if (error instanceof JournalInvalid) result.invalid++;
      else {
        result.failed++;
        lastFailure = 'journal_unavailable';
      }
    }
  }
  cycleInvalid += result.invalid;
  if (result.scanned === rows.length && rows.length < limit) {
    lastCycleInvalid = cycleInvalid;
    cycleInvalid = 0;
    scanCursor = '';
  }
  if (result.failed || result.invalid)
    diagnostic(result.invalid ? 'journal_invalid' : (lastFailure ?? 'audit_unavailable'));
  return result;
}
export function processHookAuditJournal(
  options: { batchSize?: number; force?: boolean } = {},
): Promise<HookAuditBatch> {
  const limit = options.batchSize ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > BATCH_LIMIT)
    return Promise.reject(new Error('Invalid hook audit batch size'));
  if (active)
    return Promise.resolve({ busy: true, scanned: 0, delivered: 0, failed: 0, invalid: 0 });
  active = batch(limit, options.force ?? false)
    .catch(() => {
      lastFailure = 'journal_unavailable';
      diagnostic(lastFailure);
      return { busy: false, scanned: 0, delivered: 0, failed: 1, invalid: 0 };
    })
    .finally(() => {
      active = null;
    });
  return active;
}
export function wakeHookAuditWorker(): void {
  if (timer && !active) void processHookAuditJournal();
}
export function startHookAuditWorker(): void {
  if (timer) return;
  timer = setInterval(wakeHookAuditWorker, 5000);
  timer.unref();
  wakeHookAuditWorker();
}
export async function stopHookAuditWorker(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (active) await active;
}

/** Aggregates only: journal payloads never enter generic settings or this API. */
export async function getHookAuditHealth() {
  const connection = await pool.getConnection();
  try {
    const document = `CASE WHEN OCTET_LENGTH(setting_value)>${EVENT_LIMIT_BYTES} THEN '{}' ELSE CASE WHEN JSON_VALID(setting_value) THEN setting_value ELSE '{}' END END`;
    const [rows] = await query(
      connection,
      `SELECT COUNT(*) AS total,
      SUM(CASE WHEN BINARY marker=? THEN 0 ELSE 1 END) AS pending,
      MIN(CASE WHEN BINARY marker=? AND JSON_TYPE(JSON_EXTRACT(doc,'$.event.occurredAtEpoch'))='INTEGER' THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(doc,'$.event.occurredAtEpoch')) AS UNSIGNED) ELSE NULL END) AS oldest,
      UNIX_TIMESTAMP() AS now FROM (SELECT description AS marker,${document} AS doc FROM web_settings WHERE setting_key LIKE ?) journal`,
      [DELIVERED, PENDING, HOOK_JOURNAL_PREFIX + '%'],
    );
    let sinkReadable = true;
    try {
      await query(connection, 'SELECT hook_event_id FROM admin_action_log LIMIT 0');
    } catch {
      sinkReadable = false;
    }
    const row = rows[0];
    return {
      journalRows: Number(row.total),
      unacknowledgedRows: Number(row.pending ?? 0),
      oldestPendingAgeSeconds:
        row.oldest === null ? null : Math.max(0, Number(row.now) - Number(row.oldest)),
      sinkReadable,
      workerRunning: timer !== null,
      lastPollEpoch,
      lastFailureCategory: lastFailure,
      lastCompleteScanInvalidRows: lastCycleInvalid,
      currentScanInvalidRows: cycleInvalid,
    };
  } catch {
    throw new Error('Hook audit health is unavailable');
  } finally {
    connection.release();
  }
}

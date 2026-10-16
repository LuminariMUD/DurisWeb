import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import {
  retentionPreviewClasses,
  retentionPreviewPolicy,
  type RetentionPreviewClass,
} from '../config/retentionPolicy.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  tableMetadataSha256,
  type SchemaDatabase,
} from '../db/schemaPostconditions.js';

/** Literal targets only: no input can supply a table, column, predicate or SQL fragment. */
const rules = {
  analytics_events: {
    table: 'page_views',
    highWater: 'SELECT CAST(id AS CHAR) AS cursor_id FROM page_views ORDER BY id DESC LIMIT 1',
    select: `SELECT CAST(id AS CHAR) AS cursor_id, UNIX_TIMESTAMP(created_at) AS epoch FROM page_views FORCE INDEX (idx_created_at)
      WHERE created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?) AND id <= ?
        AND (created_at > FROM_UNIXTIME(?) OR (created_at = FROM_UNIXTIME(?) AND id > ?))
      ORDER BY created_at,id LIMIT ?`,
  },
  login_history: {
    table: 'account_login_history',
    highWater:
      'SELECT CAST(id AS CHAR) AS cursor_id FROM account_login_history ORDER BY id DESC LIMIT 1',
    select: `SELECT CAST(id AS CHAR) AS cursor_id, UNIX_TIMESTAMP(timestamp) AS epoch FROM account_login_history FORCE INDEX (idx_timestamp)
      WHERE timestamp >= FROM_UNIXTIME(?) AND timestamp < FROM_UNIXTIME(?) AND id <= ?
        AND (timestamp > FROM_UNIXTIME(?) OR (timestamp = FROM_UNIXTIME(?) AND id > ?))
      ORDER BY timestamp,id LIMIT ?`,
  },
} as const;

const QUERY_TIMEOUT_MS = 5000;
const MAX_CHECKPOINT_BYTES = 16384;
const maximumId = 18446744073709551615n;
const signature = createHash('sha256')
  .update(JSON.stringify({ format: 1, policy: retentionPreviewPolicy, rules }))
  .digest('hex');

type PreviewFailure =
  | 'invalid_arguments'
  | 'execution_unavailable'
  | 'policy_version_mismatch'
  | 'configured_target_mismatch'
  | 'invalid_checkpoint'
  | 'checkpoint_target_mismatch'
  | 'checkpoint_rules_changed'
  | 'checkpoint_clock_mismatch'
  | 'schema_unverified'
  | 'invalid_database_result'
  | 'database_unavailable'
  | 'private_checkpoint_required'
  | 'checkpoint_read_failed'
  | 'checkpoint_write_failed';

/** No input, SQL bindings, credentials or driver error is retained. */
export class RetentionPreviewError extends Error {
  readonly reference = randomUUID();
  constructor(readonly reason: PreviewFailure) {
    super(`Retention preview failed: ${reason}`);
    this.name = 'RetentionPreviewError';
  }
}

export interface RetentionPreviewOptions {
  target: string;
  policyVersion: string;
  classes: readonly RetentionPreviewClass[];
  batchSize: number;
  maxCandidates: number;
  timeBudgetMs: number;
}
interface ClassProgress {
  classId: RetentionPreviewClass;
  upperId: string;
  cursorEpoch: number;
  cursorId: string;
  candidates: number;
  complete: boolean;
}
export interface RetentionPreviewCheckpoint {
  formatVersion: 1;
  signature: string;
  targetHash: string;
  operationId: string;
  policyVersion: string;
  capturedAtEpoch: number;
  classes: ClassProgress[];
}
export interface RetentionPreviewResult {
  mode: 'dry-run';
  operationId: string;
  policyVersion: string;
  policyApproved: false;
  executionAvailable: false;
  eligibilityChecks: 'not_evaluated';
  capturedAtEpoch: number;
  candidatesObservedThisBatch: number;
  complete: boolean;
  classes: Array<{
    classId: RetentionPreviewClass;
    proposedAgeSeconds: number;
    cutoffEpoch: number;
    ageCandidatesObserved: number;
    complete: boolean;
  }>;
  exclusions: readonly string[];
  warning: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(',') === expected.sort().join(',');
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) <= maximumId
  );
}
function epoch(value: unknown): value is number {
  return integer(value, 1, 2147483647);
}
function classId(value: unknown): value is RetentionPreviewClass {
  return typeof value === 'string' && retentionPreviewClasses.some((item) => item === value);
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Checkpoints are continuation metadata, never a deletion plan or authorization. */
export function parseRetentionCheckpoint(text: string): RetentionPreviewCheckpoint {
  try {
    if (Buffer.byteLength(text) > MAX_CHECKPOINT_BYTES) throw new Error();
    const value: unknown = JSON.parse(text);
    if (
      !record(value) ||
      !exactKeys(value, [
        'formatVersion',
        'signature',
        'targetHash',
        'operationId',
        'policyVersion',
        'capturedAtEpoch',
        'classes',
      ]) ||
      value.formatVersion !== 1 ||
      typeof value.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.signature) ||
      typeof value.targetHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.targetHash) ||
      typeof value.operationId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value.operationId,
      ) ||
      typeof value.policyVersion !== 'string' ||
      value.policyVersion.length > 100 ||
      !epoch(value.capturedAtEpoch) ||
      !Array.isArray(value.classes) ||
      value.classes.length < 1 ||
      value.classes.length > retentionPreviewClasses.length
    )
      throw new Error();
    const classes: ClassProgress[] = [];
    for (const item of value.classes) {
      if (
        !record(item) ||
        !exactKeys(item, [
          'classId',
          'upperId',
          'cursorEpoch',
          'cursorId',
          'candidates',
          'complete',
        ]) ||
        !classId(item.classId) ||
        !id(item.upperId) ||
        !id(item.cursorId) ||
        !integer(item.cursorEpoch, 0, 2147483647) ||
        !integer(item.candidates, 0, Number.MAX_SAFE_INTEGER) ||
        typeof item.complete !== 'boolean' ||
        BigInt(item.cursorId) > BigInt(item.upperId) ||
        item.cursorEpoch >=
          value.capturedAtEpoch - retentionPreviewPolicy.classes[item.classId].proposedAgeSeconds ||
        (item.cursorId === '0') !== (item.cursorEpoch === 0) ||
        (item.candidates === 0) !== (item.cursorId === '0') ||
        classes.some((previous) => previous.classId === item.classId)
      )
        throw new Error();
      classes.push({
        classId: item.classId,
        upperId: item.upperId,
        cursorEpoch: item.cursorEpoch,
        cursorId: item.cursorId,
        candidates: item.candidates,
        complete: item.complete,
      });
    }
    return {
      formatVersion: 1,
      signature: value.signature,
      targetHash: value.targetHash,
      operationId: value.operationId,
      policyVersion: value.policyVersion,
      capturedAtEpoch: value.capturedAtEpoch,
      classes,
    };
  } catch {
    throw new RetentionPreviewError('invalid_checkpoint');
  }
}

function validateOptions(options: RetentionPreviewOptions): void {
  if (
    typeof options.target !== 'string' ||
    !options.target ||
    /[\r\n\0]/.test(options.target) ||
    !Array.isArray(options.classes) ||
    options.classes.length < 1 ||
    !options.classes.every(classId) ||
    new Set(options.classes).size !== options.classes.length ||
    !integer(options.batchSize, 1, 500) ||
    !integer(options.maxCandidates, 1, 10000) ||
    !integer(options.timeBudgetMs, 1, 10000)
  )
    throw new RetentionPreviewError('invalid_arguments');
  if (options.policyVersion !== retentionPreviewPolicy.version)
    throw new RetentionPreviewError('policy_version_mismatch');
}

async function select(
  connection: Connection,
  sql: string,
  values: (string | number)[] = [],
): Promise<RowDataPacket[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    { sql, timeout: QUERY_TIMEOUT_MS },
    values,
  );
  return rows;
}

async function verifyPreviewSchema(
  connection: Connection,
  classes: readonly RetentionPreviewClass[],
): Promise<void> {
  const database: SchemaDatabase = {
    query: async (sql, values = []) => connection.query({ sql, timeout: QUERY_TIMEOUT_MS }, values),
  };
  try {
    const family = await schemaDatabaseFamily(database);
    const expected = loadSchemaPostconditions();
    for (const selected of classes) {
      const table = rules[selected].table;
      const actual = tableMetadataSha256(await readTableMetadata(database, table, family));
      if (!expected.tables[table][family].includes(actual)) throw new Error();
    }
  } catch {
    throw new RetentionPreviewError('schema_unverified');
  }
}

async function scan(
  connection: Connection,
  options: RetentionPreviewOptions,
  prior: RetentionPreviewCheckpoint | undefined,
): Promise<{ result: RetentionPreviewResult; checkpoint: RetentionPreviewCheckpoint }> {
  await connection.query({
    sql: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
    timeout: QUERY_TIMEOUT_MS,
  });
  await connection.query({
    sql: 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
    timeout: QUERY_TIMEOUT_MS,
  });
  try {
    await verifyPreviewSchema(connection, options.classes);
    const [clock] = await select(connection, 'SELECT UNIX_TIMESTAMP() AS epoch');
    const now = Number(clock.epoch);
    if (!epoch(now)) throw new RetentionPreviewError('invalid_database_result');
    if (prior && prior.capturedAtEpoch > now)
      throw new RetentionPreviewError('checkpoint_clock_mismatch');
    const state: RetentionPreviewCheckpoint = prior ?? {
      formatVersion: 1,
      signature,
      targetHash: hash(options.target),
      operationId: randomUUID(),
      policyVersion: retentionPreviewPolicy.version,
      capturedAtEpoch: now,
      classes: [],
    };
    if (!prior)
      for (const selected of options.classes) {
        const rows = await select(connection, rules[selected].highWater);
        const upperId = rows.length ? String(rows[0].cursor_id) : '0';
        if (!id(upperId)) throw new RetentionPreviewError('invalid_database_result');
        state.classes.push({
          classId: selected,
          upperId,
          cursorEpoch: 0,
          cursorId: '0',
          candidates: 0,
          complete: upperId === '0',
        });
      }
    const deadline = performance.now() + options.timeBudgetMs;
    let observed = 0;
    while (observed < options.maxCandidates && state.classes.some((item) => !item.complete)) {
      let attempted = false;
      for (const progress of state.classes) {
        if (performance.now() >= deadline || observed >= options.maxCandidates) break;
        if (progress.complete) continue;
        attempted = true;
        const take = Math.min(options.batchSize, options.maxCandidates - observed);
        const cutoff =
          state.capturedAtEpoch -
          retentionPreviewPolicy.classes[progress.classId].proposedAgeSeconds;
        if (!epoch(cutoff)) throw new RetentionPreviewError('invalid_database_result');
        // MariaDB can return NULL for FROM_UNIXTIME(0). Start at epoch 1;
        // an empty cursor's ID 0 still includes every row at that first epoch.
        const rows = await select(connection, rules[progress.classId].select, [
          1,
          cutoff,
          progress.upperId,
          Math.max(1, progress.cursorEpoch),
          Math.max(1, progress.cursorEpoch),
          progress.cursorId,
          take + 1,
        ]);
        for (const row of rows.slice(0, take)) {
          const rowId = String(row.cursor_id),
            rowEpoch = Number(row.epoch);
          if (
            !id(rowId) ||
            rowId === '0' ||
            BigInt(rowId) > BigInt(progress.upperId) ||
            !epoch(rowEpoch) ||
            rowEpoch >= cutoff ||
            rowEpoch < progress.cursorEpoch ||
            (rowEpoch === progress.cursorEpoch && BigInt(rowId) <= BigInt(progress.cursorId)) ||
            progress.candidates === Number.MAX_SAFE_INTEGER
          )
            throw new RetentionPreviewError('invalid_database_result');
          progress.cursorId = rowId;
          progress.cursorEpoch = rowEpoch;
          progress.candidates++;
          observed++;
        }
        progress.complete = rows.length <= take;
      }
      if (!attempted || performance.now() >= deadline) break;
    }
    const result: RetentionPreviewResult = {
      mode: 'dry-run',
      operationId: state.operationId,
      policyVersion: state.policyVersion,
      policyApproved: retentionPreviewPolicy.approved,
      executionAvailable: false,
      eligibilityChecks: 'not_evaluated',
      capturedAtEpoch: state.capturedAtEpoch,
      candidatesObservedThisBatch: observed,
      complete: state.classes.every((item) => item.complete),
      classes: state.classes.map((item) => ({
        classId: item.classId,
        proposedAgeSeconds: retentionPreviewPolicy.classes[item.classId].proposedAgeSeconds,
        cutoffEpoch:
          state.capturedAtEpoch - retentionPreviewPolicy.classes[item.classId].proposedAgeSeconds,
        ageCandidatesObserved: item.candidates,
        complete: item.complete,
      })),
      exclusions: [
        'unknown_or_zero_timestamps',
        'sessions_without_physical_row_policy',
        'visitor_session_relationships',
        'audit_choice_and_delivery_evidence',
        'legacy_naive_metrics_timestamps',
        'protected_imports_and_archives',
        'mud_owned_and_external_stores',
        'all_unlisted_classes',
      ],
      warning:
        'Unapproved age candidates only. Holds and exceptions are not evaluated. A preview cannot authorize deletion. Resumes use a fresh snapshot; concurrent changes can affect observations.',
    };
    await connection.rollback();
    return { result, checkpoint: state };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* The dedicated connection is destroyed by its owner. */
    }
    throw error;
  }
}

/** Own a fresh connection: no caller transaction can be committed or weakened. */
export async function previewRetention(
  options: RetentionPreviewOptions,
  prior?: RetentionPreviewCheckpoint,
): Promise<{
  result: RetentionPreviewResult;
  checkpoint: RetentionPreviewCheckpoint;
}> {
  validateOptions(options);
  const configuration = getBackendConfiguration().database;
  const target = `${configuration.host}:${configuration.port}/${configuration.database}`;
  if (options.target !== target) throw new RetentionPreviewError('configured_target_mismatch');
  let checkpoint: RetentionPreviewCheckpoint | undefined;
  if (prior) {
    checkpoint = parseRetentionCheckpoint(JSON.stringify(prior));
    if (checkpoint.targetHash !== hash(target))
      throw new RetentionPreviewError('checkpoint_target_mismatch');
    if (
      checkpoint.signature !== signature ||
      checkpoint.policyVersion !== retentionPreviewPolicy.version ||
      checkpoint.classes.map((item) => item.classId).join(',') !== options.classes.join(',')
    )
      throw new RetentionPreviewError('checkpoint_rules_changed');
  }
  let connection: Connection | undefined;
  try {
    connection = await mysql.createConnection({
      ...configuration,
      connectTimeout: QUERY_TIMEOUT_MS,
      multipleStatements: false,
      dateStrings: true,
    });
    return await scan(connection, options, checkpoint);
  } catch (error) {
    throw error instanceof RetentionPreviewError
      ? error
      : new RetentionPreviewError('database_unavailable');
  } finally {
    connection?.destroy();
  }
}

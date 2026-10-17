import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mysql, { type Connection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import {
  retentionPreviewPolicy as policy,
  retentionPreviewClasses,
  type RetentionPreviewClass,
} from '../config/retentionPolicy.js';
import {
  loadSchemaPostconditions,
  readTableMetadata,
  schemaDatabaseFamily,
  tableMetadataSha256,
  type SchemaDatabase,
} from '../db/schemaPostconditions.js';
import { loadDataHoldContract } from '../db/dataHoldSchema.js';
import { loadRetentionRunContract } from '../db/retentionRunSchema.js';
import { retentionCandidateRules as rules } from './retentionCandidates.js';
import { readDataHoldSnapshot } from './dataHoldSnapshot.js';
import {
  parseRetentionCheckpoint,
  type RetentionPreviewCheckpoint,
  type RetentionPreviewOptions,
} from './retentionPreview.js';
import { lockRetentionControl, saveRetentionControl } from './retentionControl.js';

const TIMEOUT = 5000,
  LEASE_SECONDS = 30;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const signature = createHash('sha256')
  .update(JSON.stringify({ format: 'retention-execution-v1', policy, rules }))
  .digest('hex');
type Failure =
  | 'invalid_arguments'
  | 'execution_unavailable'
  | 'configured_target_mismatch'
  | 'operation_in_progress'
  | 'run_identity_conflict'
  | 'run_unverified'
  | 'schema_unverified'
  | 'hold_state_unverified'
  | 'storage_unavailable'
  | 'lease_lost'
  | 'lease_release_unconfirmed'
  | 'time_budget_exhausted';
export class RetentionExecutionError extends Error {
  readonly reference = randomUUID();
  constructor(readonly reason: Failure) {
    super(`Retention execution failed: ${reason}`);
    this.name = 'RetentionExecutionError';
  }
}
export interface RetentionExecutionOptions extends RetentionPreviewOptions {
  runId: string;
  cacheTarget: string;
}
interface Action {
  classId: RetentionPreviewClass;
  deleted: number;
  skipped: number;
}
interface RunState {
  format: 1;
  workDurationMs: number;
  checkpoint: RetentionPreviewCheckpoint;
  actions: Action[];
  cache: { pending: boolean; cursor: string; serverId: string | null };
  lastFailure: 'cache_unavailable' | null;
}
export interface RetentionExecutionResult {
  mode: 'execute';
  operationId: string;
  policyVersion: string;
  capturedAtEpoch: number;
  status: 'running' | 'awaiting_cache' | 'complete';
  complete: boolean;
  cacheComplete: boolean;
  workDurationMs: number;
  lastFailure: 'cache_unavailable' | null;
  classes: Array<{
    classId: RetentionPreviewClass;
    cutoffEpoch: number;
    scanned: number;
    held: number;
    deleted: number;
    skipped: number;
    complete: boolean;
  }>;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, names: string[]) {
  return Object.keys(value).sort().join(',') === names.sort().join(',');
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function cursor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]{0,19})$/.test(value) &&
    BigInt(value) <= 18446744073709551615n
  );
}
function requirePolicy(classes: readonly RetentionPreviewClass[]) {
  if (
    !policy.approved ||
    !policy.executionEnabled ||
    !policy.approvalReference ||
    policy.approvalReference.trim().length === 0 ||
    !classes.every(
      (id) => policy.classes[id].approved && integer(policy.classes[id].proposedAgeSeconds, 1),
    )
  )
    throw new RetentionExecutionError('execution_unavailable');
}
function validate(options: RetentionExecutionOptions) {
  if (
    !uuid.test(options.runId ?? '') ||
    !options.target ||
    /[\r\n\0]/.test(options.target) ||
    !options.cacheTarget ||
    /[\r\n\0]/.test(options.cacheTarget) ||
    options.policyVersion !== policy.version ||
    !Array.isArray(options.classes) ||
    !options.classes.length ||
    new Set(options.classes).size !== options.classes.length ||
    !options.classes.every((id) => retentionPreviewClasses.some((item) => item === id)) ||
    !integer(options.batchSize, 1, 500) ||
    !integer(options.maxCandidates, 1, 10000) ||
    !integer(options.timeBudgetMs, 1, 10000)
  )
    throw new RetentionExecutionError('invalid_arguments');
  requirePolicy(options.classes);
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
  if (!integer(epoch, 1, 2147483647)) throw new RetentionExecutionError('storage_unavailable');
  return epoch;
}
/** A dedicated connection uses current committed reads plus explicit row locks; no pooled session changes. */
async function begin(connection: Connection) {
  await connection.query({
    sql: 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
    timeout: TIMEOUT,
  });
  await connection.query({ sql: 'START TRANSACTION', timeout: TIMEOUT });
}
async function commit(connection: Connection) {
  await connection.query({ sql: 'COMMIT', timeout: TIMEOUT });
}
async function rollback(connection: Connection) {
  await connection.query({ sql: 'ROLLBACK', timeout: TIMEOUT });
}
async function verifySchema(
  connection: Connection,
  classes: readonly RetentionPreviewClass[],
  deadline: number,
) {
  const database: SchemaDatabase = {
    query: async (sql, values = []) => {
      if (performance.now() >= deadline) throw new RetentionExecutionError('time_budget_exhausted');
      return connection.query({ sql, timeout: TIMEOUT }, values);
    },
  };
  try {
    // Metadata locks precede validation and stay until commit, including trigger/FK checks.
    await execute(connection, 'SELECT setting_key FROM web_settings WHERE 1=0 FOR UPDATE');
    await execute(connection, 'SELECT id FROM web_data_holds WHERE 1=0 FOR UPDATE');
    await execute(connection, 'SELECT id FROM web_retention_runs WHERE 1=0 FOR UPDATE');
    for (const id of classes)
      await execute(connection, `SELECT id FROM ${rules[id].table} WHERE 1=0 FOR UPDATE`);
    const family = await schemaDatabaseFamily(database),
      baseline = loadSchemaPostconditions();
    const expected = [
      ...classes.map((id) => [rules[id].table, baseline.tables[rules[id].table][family]] as const),
      ['web_settings', baseline.tables.web_settings[family]] as const,
      ['web_data_holds', [loadDataHoldContract()[family]]] as const,
      ['web_retention_runs', [loadRetentionRunContract()[family]]] as const,
    ];
    for (const [name, hashes] of expected)
      if (!hashes.includes(tableMetadataSha256(await readTableMetadata(database, name, family))))
        throw new Error();
    const [invariants] = await execute(
      connection,
      'SELECT @@autocommit AS autocommit,@@foreign_key_checks AS foreign_key_checks,@@sql_mode AS sql_mode',
    );
    if (
      Number(invariants[0]?.autocommit) !== 1 ||
      Number(invariants[0]?.foreign_key_checks) !== 1 ||
      !/(?:^|,)STRICT_(?:TRANS|ALL)_TABLES(?:,|$)/.test(String(invariants[0]?.sql_mode))
    )
      throw new Error();
    const tables = expected.map(([name]) => name),
      placeholders = tables.map(() => '?').join(',');
    const [triggers] = await execute(
      connection,
      `SELECT COUNT(*) AS count FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (${placeholders})`,
      tables,
    );
    const targets = classes.map((id) => rules[id].table);
    const [references] = await execute(
      connection,
      `SELECT COUNT(*) AS count FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN (${targets.map(() => '?').join(',')})`,
      targets,
    );
    if (Number(triggers[0]?.count) !== 0 || Number(references[0]?.count) !== 0) throw new Error();
  } catch (error) {
    throw error instanceof RetentionExecutionError
      ? error
      : new RetentionExecutionError('schema_unverified');
  }
}
function decode(
  row: RowDataPacket,
  options: RetentionExecutionOptions,
  targetHash: string,
): RunState {
  try {
    if (
      row.id !== options.runId ||
      row.policy_version !== policy.version ||
      row.rules_sha256 !== signature ||
      row.target_sha256 !== targetHash
    )
      throw new RetentionExecutionError('run_identity_conflict');
    if (typeof row.progress !== 'string' || Buffer.byteLength(row.progress) > 16384)
      throw new Error();
    const value: unknown = JSON.parse(row.progress);
    if (
      !object(value) ||
      !keys(value, ['format', 'workDurationMs', 'checkpoint', 'actions', 'cache', 'lastFailure']) ||
      value.format !== 1 ||
      !integer(value.workDurationMs, 0) ||
      !Array.isArray(value.actions) ||
      !object(value.cache) ||
      !keys(value.cache, ['pending', 'cursor', 'serverId']) ||
      typeof value.cache.pending !== 'boolean' ||
      !cursor(value.cache.cursor) ||
      (!value.cache.pending && value.cache.cursor !== '0') ||
      (value.cache.serverId !== null &&
        (typeof value.cache.serverId !== 'string' ||
          !/^[a-f0-9]{40}$/.test(value.cache.serverId))) ||
      (value.cache.cursor !== '0' && value.cache.serverId === null) ||
      (value.lastFailure !== null && value.lastFailure !== 'cache_unavailable')
    )
      throw new Error();
    const checkpoint = parseRetentionCheckpoint(JSON.stringify(value.checkpoint));
    if (
      checkpoint.operationId !== row.id ||
      checkpoint.signature !== signature ||
      checkpoint.targetHash !== targetHash ||
      checkpoint.policyVersion !== policy.version ||
      checkpoint.capturedAtEpoch !== Number(row.captured_at_epoch) ||
      checkpoint.classes.map((item) => item.classId).join(',') !== options.classes.join(',')
    )
      throw new Error();
    if (value.actions.length !== checkpoint.classes.length) throw new Error();
    const actions: Action[] = [];
    for (const [index, item] of value.actions.entries()) {
      if (
        !object(item) ||
        !keys(item, ['classId', 'deleted', 'skipped']) ||
        item.classId !== checkpoint.classes[index].classId ||
        !integer(item.deleted, 0) ||
        !integer(item.skipped, 0) ||
        !Number.isSafeInteger(item.deleted + item.skipped + checkpoint.classes[index].held) ||
        item.deleted + item.skipped + checkpoint.classes[index].held !==
          checkpoint.classes[index].candidates
      )
        throw new Error();
      actions.push({
        classId: checkpoint.classes[index].classId,
        deleted: item.deleted,
        skipped: item.skipped,
      });
    }
    return {
      format: 1,
      workDurationMs: value.workDurationMs,
      checkpoint,
      actions,
      cache: {
        pending: value.cache.pending,
        cursor: value.cache.cursor,
        serverId: value.cache.serverId,
      },
      lastFailure: value.lastFailure,
    };
  } catch (error) {
    throw error instanceof RetentionExecutionError
      ? error
      : new RetentionExecutionError('run_unverified');
  }
}
async function readRun(
  connection: Connection,
  options: RetentionExecutionOptions,
  targetHash: string,
): Promise<RunState | null> {
  const [rows] = await execute(
    connection,
    'SELECT id,policy_version,rules_sha256,target_sha256,captured_at_epoch,progress FROM web_retention_runs WHERE id=? FOR UPDATE',
    [options.runId],
  );
  return rows.length ? decode(rows[0], options, targetHash) : null;
}
async function saveRun(
  connection: Connection,
  options: RetentionExecutionOptions,
  state: RunState,
) {
  const encoded = JSON.stringify(state);
  if (Buffer.byteLength(encoded) > 16384 || !integer(state.workDurationMs, 0))
    throw new RetentionExecutionError('run_unverified');
  const [features] = await execute(
    connection,
    "SELECT ENGINE,(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='web_retention_runs') AS triggers_count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_retention_runs'",
  );
  if (
    features.length !== 1 ||
    features[0].ENGINE !== 'InnoDB' ||
    Number(features[0].triggers_count) !== 0
  )
    throw new RetentionExecutionError('schema_unverified');
  const [result] = await execute<ResultSetHeader>(
    connection,
    'UPDATE web_retention_runs SET progress=?,updated_at=NOW() WHERE id=?',
    [encoded, options.runId],
  );
  if (result.affectedRows !== 1) {
    const [saved] = await execute(
      connection,
      'SELECT progress FROM web_retention_runs WHERE id=? FOR UPDATE',
      [options.runId],
    );
    if (result.affectedRows !== 0 || saved.length !== 1 || saved[0].progress !== encoded)
      throw new RetentionExecutionError('storage_unavailable');
  }
}
async function protection(connection: Connection, now: number) {
  try {
    return await readDataHoldSnapshot(connection, now);
  } catch {
    throw new RetentionExecutionError('hold_state_unverified');
  }
}
function summary(state: RunState): RetentionExecutionResult {
  const sqlComplete = state.checkpoint.classes.every((item) => item.complete);
  return {
    mode: 'execute',
    operationId: state.checkpoint.operationId,
    policyVersion: state.checkpoint.policyVersion,
    capturedAtEpoch: state.checkpoint.capturedAtEpoch,
    status: !sqlComplete ? 'running' : state.cache.pending ? 'awaiting_cache' : 'complete',
    complete: sqlComplete && !state.cache.pending,
    cacheComplete: !state.cache.pending,
    workDurationMs: state.workDurationMs,
    lastFailure: state.lastFailure,
    classes: state.checkpoint.classes.map((item, index) => ({
      classId: item.classId,
      cutoffEpoch:
        state.checkpoint.capturedAtEpoch - policy.classes[item.classId].proposedAgeSeconds,
      scanned: item.candidates,
      held: item.held,
      deleted: state.actions[index].deleted,
      skipped: state.actions[index].skipped,
      complete: item.complete,
    })),
  };
}
/** No policy argument or runtime approval override exists. Production draft refuses before any I/O. */
export async function executeRetention(
  options: RetentionExecutionOptions,
): Promise<RetentionExecutionResult> {
  validate(options);
  const environment = getBackendConfiguration(),
    config = environment.database;
  const target = `${config.host}:${config.port}/${config.database}`;
  const cacheTarget = `${environment.cacheRedis.host}:${environment.cacheRedis.port}/${environment.cacheRedis.database}`;
  if (options.target !== target || options.cacheTarget !== cacheTarget)
    throw new RetentionExecutionError('configured_target_mismatch');
  const targetHash = createHash('sha256')
      .update(
        JSON.stringify({
          database: target,
          cache: cacheTarget,
          username: environment.cacheRedis.username ?? null,
          tls: environment.cacheRedis.tls,
          namespace: 'web_analytics:',
        }),
      )
      .digest('hex'),
    owner = randomUUID();
  let connection: Connection | undefined,
    inTransaction = false,
    state: RunState | null = null,
    leaseTouched = false;
  let result: RetentionExecutionResult | undefined;
  const invocationStarted = performance.now(),
    deadline = invocationStarted + options.timeBudgetMs;
  try {
    connection = await mysql.createConnection({
      ...config,
      dateStrings: true,
      connectTimeout: TIMEOUT,
      multipleStatements: false,
    });
    await begin(connection);
    inTransaction = true;
    await verifySchema(connection, options.classes, deadline);
    const control = await lockRetentionControl(connection),
      now = await clock(connection);
    if (control.lease && control.lease.expiresAtEpoch > now)
      throw new RetentionExecutionError('operation_in_progress');
    state = await readRun(connection, options, targetHash);
    if (!state) {
      const held = await protection(connection, now);
      const checkpoint: RetentionPreviewCheckpoint = {
        formatVersion: 2,
        holdFingerprint: held.fingerprint,
        signature,
        targetHash,
        operationId: options.runId,
        policyVersion: policy.version,
        capturedAtEpoch: now,
        classes: [],
      };
      for (const id of options.classes) {
        const [rows] = await execute(connection, rules[id].highWater);
        const upperId = rows.length ? String(rows[0].cursor_id) : '0';
        if (!cursor(upperId) || now <= policy.classes[id].proposedAgeSeconds)
          throw new RetentionExecutionError('run_unverified');
        checkpoint.classes.push({
          classId: id,
          upperId,
          cursorEpoch: 0,
          cursorId: '0',
          candidates: 0,
          held: 0,
          complete: upperId === '0',
        });
      }
      state = {
        format: 1,
        workDurationMs: Math.round(performance.now() - invocationStarted),
        checkpoint,
        actions: options.classes.map((classId) => ({ classId, deleted: 0, skipped: 0 })),
        cache: { pending: true, cursor: '0', serverId: null },
        lastFailure: null,
      };
      await execute(
        connection,
        'INSERT INTO web_retention_runs(id,policy_version,rules_sha256,target_sha256,captured_at_epoch,progress) VALUES (?,?,?,?,?,?)',
        [options.runId, policy.version, signature, targetHash, now, JSON.stringify(state)],
      );
    }
    control.lease = { owner, runId: options.runId, expiresAtEpoch: now + LEASE_SECONDS };
    leaseTouched = true;
    await saveRetentionControl(connection, control);
    await commit(connection);
    inTransaction = false;
    let processed = 0;
    while (
      processed < options.maxCandidates &&
      performance.now() < deadline &&
      state.checkpoint.classes.some((item) => !item.complete)
    ) {
      const batchStarted = performance.now();
      requirePolicy(options.classes);
      await begin(connection);
      inTransaction = true;
      await verifySchema(connection, options.classes, deadline);
      const heldControl = await lockRetentionControl(connection),
        batchNow = await clock(connection);
      if (
        !heldControl.lease ||
        heldControl.lease.owner !== owner ||
        heldControl.lease.runId !== options.runId ||
        heldControl.lease.expiresAtEpoch <= batchNow
      )
        throw new RetentionExecutionError('lease_lost');
      const current = await readRun(connection, options, targetHash);
      if (!current || current.checkpoint.capturedAtEpoch > batchNow)
        throw new RetentionExecutionError('run_unverified');
      const held = await protection(connection, batchNow);
      current.checkpoint.holdFingerprint = held.fingerprint;
      const progress = current.checkpoint.classes.find((item) => !item.complete)!;
      const index = current.checkpoint.classes.indexOf(progress),
        id = progress.classId,
        cutoff = current.checkpoint.capturedAtEpoch - policy.classes[id].proposedAgeSeconds,
        take = Math.min(options.batchSize, options.maxCandidates - processed);
      const [rows] = await execute(connection, rules[id].select + ' FOR UPDATE', [
        batchNow,
        id,
        id,
        1,
        cutoff,
        progress.upperId,
        Math.max(1, progress.cursorEpoch),
        Math.max(1, progress.cursorEpoch),
        progress.cursorId,
        take + 1,
      ]);
      let pageProcessed = 0;
      for (const row of rows.slice(0, take)) {
        if (performance.now() >= deadline) break;
        const rowId = String(row.cursor_id),
          epoch = Number(row.epoch),
          isHeld =
            row.is_held === 1 || row.is_held === '1'
              ? 1
              : row.is_held === 0 || row.is_held === '0'
                ? 0
                : null;
        if (
          !cursor(rowId) ||
          rowId === '0' ||
          BigInt(rowId) > BigInt(progress.upperId) ||
          !integer(epoch, 1, 2147483647) ||
          epoch >= cutoff ||
          epoch < progress.cursorEpoch ||
          (epoch === progress.cursorEpoch && BigInt(rowId) <= BigInt(progress.cursorId)) ||
          isHeld === null ||
          progress.candidates === Number.MAX_SAFE_INTEGER
        )
          throw new RetentionExecutionError('run_unverified');
        if (isHeld) progress.held++;
        else {
          const [removed] = await execute<ResultSetHeader>(connection, rules[id].remove, [
            rowId,
            1,
            cutoff,
            batchNow,
            id,
            id,
          ]);
          if (![0, 1].includes(removed.affectedRows))
            throw new RetentionExecutionError('storage_unavailable');
          if (removed.affectedRows === 1) {
            current.actions[index].deleted++;
            if (id === 'analytics_events')
              current.cache = { pending: true, cursor: '0', serverId: null };
          } else current.actions[index].skipped++;
        }
        progress.cursorId = rowId;
        progress.cursorEpoch = epoch;
        progress.candidates++;
        pageProcessed++;
        processed++;
      }
      if (pageProcessed === Math.min(rows.length, take)) progress.complete = rows.length <= take;
      current.workDurationMs += Math.round(performance.now() - batchStarted);
      await saveRun(connection, options, current);
      if (heldControl.lease.expiresAtEpoch !== batchNow + LEASE_SECONDS) {
        heldControl.lease.expiresAtEpoch = batchNow + LEASE_SECONDS;
        await saveRetentionControl(connection, heldControl);
      }
      await commit(connection);
      inTransaction = false;
      state = current;
      if (!pageProcessed && !progress.complete) break;
    }
    if (state.cache.pending && performance.now() < deadline) {
      const cacheStarted = performance.now();
      let cleanup: { cursor: string; complete: boolean; serverId: string } | null = null;
      try {
        cleanup = await (await import('./retentionCacheCleanup.js')).cleanupRetiredAnalyticsCache(
          state.cache.cursor,
          Math.max(1, deadline - performance.now()),
          state.cache.serverId,
        );
      } catch {
        /* Durable pending state remains; no raw Redis payload is retained. */
      }
      await begin(connection);
      inTransaction = true;
      const heldControl = await lockRetentionControl(connection),
        observed = await clock(connection);
      if (
        !heldControl.lease ||
        heldControl.lease.owner !== owner ||
        heldControl.lease.expiresAtEpoch <= observed
      )
        throw new RetentionExecutionError('lease_lost');
      const current = await readRun(connection, options, targetHash);
      if (!current) throw new RetentionExecutionError('run_unverified');
      current.cache = cleanup
        ? { pending: !cleanup.complete, cursor: cleanup.cursor, serverId: cleanup.serverId }
        : { pending: true, cursor: '0', serverId: null };
      current.lastFailure = cleanup ? null : 'cache_unavailable';
      current.workDurationMs += Math.round(performance.now() - cacheStarted);
      await saveRun(connection, options, current);
      await commit(connection);
      inTransaction = false;
      state = current;
    }
    result = summary(state);
  } catch (error) {
    if (connection && inTransaction)
      try {
        await rollback(connection);
      } catch {
        /* Dedicated connection is destroyed. */
      }
    inTransaction = false;
    throw error instanceof RetentionExecutionError
      ? error
      : new RetentionExecutionError('storage_unavailable');
  } finally {
    if (connection) {
      let released = !leaseTouched;
      if (leaseTouched)
        try {
          await begin(connection);
          const control = await lockRetentionControl(connection);
          if (control.lease?.owner === owner) {
            control.lease = null;
            await saveRetentionControl(connection, control);
          }
          await commit(connection);
          released = true;
        } catch {
          /* The expiring durable lease fences a disconnected owner; never overwrite a successor. */
        }
      connection.destroy();
      if (result && !released) throw new RetentionExecutionError('lease_release_unconfirmed');
    }
  }
  if (!result) throw new RetentionExecutionError('storage_unavailable');
  return result;
}

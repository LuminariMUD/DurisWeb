import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import { BACKUP_UPLOAD_PREFIX } from '../db/internalWebSettings.js';
import {
  captureArchiveWorker,
  archiveWorkerIsGone,
  validArchiveWorkerIdentity,
  type ArchiveWorkerIdentity,
} from '../utils/archiveWorkerIdentity.js';
import { inspectManagedArchive } from '../utils/managedArchiveTarget.js';
import { BackupDeletionError } from '../utils/backupDeletionError.js';
import { withManagedArchiveControl, removeManagedArchive } from './managedArchiveRemoval.js';
import { completedArchiveRemoval } from './archiveRemovalJournal.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const DESCRIPTION = 'backup upload v1';
export const UPLOAD_FILENAME = /^duris-mud-upload-([a-f0-9-]{36})\.zip$/;
export type UploadFailure =
  | 'invalid_reference'
  | 'not_found'
  | 'receiving'
  | 'recovery_unverified'
  | 'storage_unconfirmed'
  | 'invalid_archive'
  | 'inspection_unconfirmed'
  | 'too_large'
  | 'preserved'
  | 'removal_in_progress';
const failures = {
  preserved: [409, 'A preservation hold stopped upload cleanup. The archive was kept.'],
  removal_in_progress: [
    409,
    'Upload cleanup is still being confirmed. Retry with the same reference.',
  ],
  invalid_reference: [400, 'The upload reference is invalid.'],
  not_found: [404, 'Upload not found.'],
  receiving: [409, 'The upload is still being received. Retry after it settles.'],
  recovery_unverified: [409, 'Upload recovery needs staff review. Its recovery record was kept.'],
  storage_unconfirmed: [
    503,
    'Upload storage was not confirmed. Refresh retained work before retrying.',
  ],
  invalid_archive: [400, 'The archive format could not be validated.'],
  inspection_unconfirmed: [
    409,
    'Archive inspection was not confirmed. The upload needs staff review.',
  ],
  too_large: [400, 'The upload exceeded the 500MB limit.'],
} as const;
export class BackupUploadError extends Error {
  readonly reference: string;
  readonly status: number;
  constructor(
    readonly reason: UploadFailure,
    reference: string = randomUUID(),
  ) {
    super(failures[reason][1]);
    this.name = 'BackupUploadError';
    this.reference = reference;
    this.status = failures[reason][0];
  }
}
export interface BackupUploadRecord {
  format: 1;
  id: string;
  backupId: number;
  owner: string;
  rootSha256: string;
  fileSha256: string | null;
  writer: ArchiveWorkerIdentity;
  phase: 'writing' | 'inspection' | 'closed';
  verdict: null | 'valid' | 'invalid' | 'unconfirmed';
  failure: UploadFailure | null;
  size: number | null;
  createdAtEpoch: number;
  updatedAtEpoch: number;
}
export function uploadFilename(reference: string): string {
  if (!UUID.test(reference)) throw new BackupUploadError('invalid_reference');
  return `duris-mud-upload-${reference}.zip`;
}
export function uploadReference(filename: string): string | null {
  const id = UPLOAD_FILENAME.exec(filename)?.[1];
  return id && UUID.test(id) ? id : null;
}
function validActor(actor: string) {
  return (
    typeof actor === 'string' &&
    actor.length > 0 &&
    actor.length <= 50 &&
    actor.trim() === actor &&
    !/[\0\r\n]/.test(actor)
  );
}
function integer(value: unknown, min = 0): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= 253402300799
  );
}
function parse(value: unknown): BackupUploadRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BackupUploadError('recovery_unverified');
  const row = value;
  if (
    Object.keys(row).sort().join(',') !==
      'backupId,createdAtEpoch,failure,fileSha256,format,id,owner,phase,rootSha256,size,updatedAtEpoch,verdict,writer' ||
    !('format' in row) ||
    row.format !== 1 ||
    !('id' in row) ||
    typeof row.id !== 'string' ||
    !UUID.test(row.id) ||
    !('backupId' in row) ||
    !integer(row.backupId, 1) ||
    row.backupId > 4294967295 ||
    !('owner' in row) ||
    typeof row.owner !== 'string' ||
    !validActor(row.owner) ||
    !('rootSha256' in row) ||
    typeof row.rootSha256 !== 'string' ||
    !HASH.test(row.rootSha256) ||
    !('fileSha256' in row) ||
    (row.fileSha256 !== null &&
      (typeof row.fileSha256 !== 'string' || !HASH.test(row.fileSha256))) ||
    !('writer' in row) ||
    !validArchiveWorkerIdentity(row.writer) ||
    !('phase' in row) ||
    !['writing', 'inspection', 'closed'].includes(String(row.phase)) ||
    !('verdict' in row) ||
    (row.verdict !== null && !['valid', 'invalid', 'unconfirmed'].includes(String(row.verdict))) ||
    !('failure' in row) ||
    (row.failure !== null &&
      (typeof row.failure !== 'string' || !Object.hasOwn(failures, row.failure))) ||
    !('size' in row) ||
    // Multer retains one excess byte to distinguish exactly-at-limit from oversized.
    (row.size !== null && (!integer(row.size) || row.size > 500 * 1024 * 1024 + 1)) ||
    !('createdAtEpoch' in row) ||
    !integer(row.createdAtEpoch, 1) ||
    !('updatedAtEpoch' in row) ||
    !integer(row.updatedAtEpoch, row.createdAtEpoch) ||
    (row.phase === 'writing' &&
      (row.fileSha256 !== null ||
        row.size !== null ||
        row.verdict !== null ||
        row.failure !== null)) ||
    (row.phase === 'inspection' &&
      (row.fileSha256 === null ||
        row.size === null ||
        row.verdict !== null ||
        row.failure !== null)) ||
    (row.phase === 'closed' &&
      (row.verdict === null ||
        (row.verdict === 'valid'
          ? row.failure !== null || row.fileSha256 === null || row.size === null
          : row.failure === null)))
  )
    throw new BackupUploadError('recovery_unverified');
  // Every scalar and enum is checked before reconstructing the external envelope.
  return {
    format: 1,
    id: row.id,
    backupId: row.backupId,
    owner: row.owner,
    rootSha256: row.rootSha256,
    fileSha256: row.fileSha256,
    writer: row.writer,
    phase:
      row.phase === 'writing' ? 'writing' : row.phase === 'inspection' ? 'inspection' : 'closed',
    verdict:
      row.verdict === null
        ? null
        : row.verdict === 'valid'
          ? 'valid'
          : row.verdict === 'invalid'
            ? 'invalid'
            : 'unconfirmed',
    failure: row.failure === null ? null : failureReason(row.failure),
    size: row.size,
    createdAtEpoch: row.createdAtEpoch,
    updatedAtEpoch: row.updatedAtEpoch,
  };
}
function failureReason(value: unknown): UploadFailure {
  switch (value) {
    case 'preserved':
    case 'removal_in_progress':
    case 'invalid_reference':
    case 'not_found':
    case 'receiving':
    case 'recovery_unverified':
    case 'storage_unconfirmed':
    case 'invalid_archive':
    case 'inspection_unconfirmed':
    case 'too_large':
      return value;
    default:
      throw new BackupUploadError('recovery_unverified');
  }
}
async function clock(db: Connection) {
  const [rows] = await db.execute<RowDataPacket[]>({
    sql: 'SELECT UNIX_TIMESTAMP() AS epoch',
    timeout: 5000,
  });
  const value = Number(rows[0]?.epoch);
  if (!integer(value, 1)) throw new BackupUploadError('storage_unconfirmed');
  return value;
}
async function read(
  db: Connection,
  id: string,
  actor: string,
  mayManageAll = false,
): Promise<{ record: BackupUploadRecord; exists: boolean }> {
  if (!UUID.test(id) || !validActor(actor)) throw new BackupUploadError('invalid_reference');
  const [rows] = await db.execute<RowDataPacket[]>(
    {
      sql: 'SELECT setting_key,setting_value,description,updated_by FROM web_settings WHERE setting_key=? FOR UPDATE',
      timeout: 5000,
    },
    [BACKUP_UPLOAD_PREFIX + id],
  );
  if (!rows.length) throw new BackupUploadError('not_found', id);
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.setting_key !== BACKUP_UPLOAD_PREFIX + id ||
    row.description !== DESCRIPTION ||
    row.updated_by !== null ||
    typeof row.setting_value !== 'string' ||
    Buffer.byteLength(row.setting_value) > 4096
  )
    throw new BackupUploadError('recovery_unverified', id);
  let value: unknown;
  try {
    value = JSON.parse(row.setting_value);
  } catch {
    throw new BackupUploadError('recovery_unverified', id);
  }
  const record = parse(value);
  if (record.id !== id) throw new BackupUploadError('recovery_unverified', id);
  if (!mayManageAll && record.owner !== actor) throw new BackupUploadError('not_found', id);
  const [backups] = await db.execute<RowDataPacket[]>(
    {
      sql: 'SELECT id,filename,status,created_by FROM mud_backups WHERE id=? FOR UPDATE',
      timeout: 5000,
    },
    [record.backupId],
  );
  if (
    backups.length > 1 ||
    (backups.length &&
      (backups[0].filename !== uploadFilename(id) ||
        backups[0].created_by !== record.owner ||
        backups[0].status !==
          (record.phase !== 'closed'
            ? 'in_progress'
            : record.verdict === 'valid'
              ? 'completed'
              : 'failed')))
  )
    throw new BackupUploadError('recovery_unverified', id);
  if (!backups.length && record.phase !== 'closed')
    throw new BackupUploadError('recovery_unverified', id);
  return { record, exists: backups.length === 1 };
}
async function write(db: Connection, record: BackupUploadRecord, insert = false) {
  const value = JSON.stringify(parse(record));
  const [result] = await db.execute<ResultSetHeader>(
    {
      sql: insert
        ? 'INSERT INTO web_settings(setting_key,setting_value,description,updated_by) VALUES(?,?,?,NULL)'
        : 'UPDATE web_settings SET setting_value=?,updated_at=NOW() WHERE setting_key=? AND description=? AND updated_by IS NULL',
      timeout: 5000,
    },
    insert
      ? [BACKUP_UPLOAD_PREFIX + record.id, value, DESCRIPTION]
      : [value, BACKUP_UPLOAD_PREFIX + record.id, DESCRIPTION],
  );
  if (result.affectedRows !== 1) throw new BackupUploadError('storage_unconfirmed', record.id);
}
async function guarded<T>(id: string | undefined, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof BackupUploadError
      ? error
      : new BackupUploadError(
          error instanceof BackupDeletionError
            ? error.reason === 'archive_held'
              ? 'preserved'
              : error.reason === 'removal_in_progress'
                ? 'removal_in_progress'
                : error.reason === 'recovery_unverified'
                  ? 'recovery_unverified'
                  : 'storage_unconfirmed'
            : 'storage_unconfirmed',
          id,
        );
  }
}
export async function beginBackupUpload(actor: string): Promise<BackupUploadRecord> {
  if (!validActor(actor)) throw new BackupUploadError('invalid_reference');
  const id = randomUUID(),
    root = getBackendConfiguration().backupDirectory,
    writer = await captureArchiveWorker(process.pid);
  return guarded(id, async () => {
    await fs.promises.mkdir(root, { recursive: true });
    const target = inspectManagedArchive(root, uploadFilename(id));
    if (target.fileSha256 !== null) throw new BackupUploadError('recovery_unverified', id);
    return withManagedArchiveControl(async (db) => {
      const now = await clock(db);
      const [result] = await db.execute<ResultSetHeader>(
        {
          sql: "INSERT INTO mud_backups(filename,backup_type,status,progress,current_step,created_by,ip_address,started_at) VALUES(?,'manual','in_progress',0,'Receiving uploaded archive...',?,'',NOW())",
          timeout: 5000,
        },
        [target.filename, actor],
      );
      if (!integer(result.insertId, 1) || result.insertId > 4294967295)
        throw new BackupUploadError('storage_unconfirmed', id);
      const record: BackupUploadRecord = {
        format: 1,
        id,
        backupId: result.insertId,
        owner: actor,
        rootSha256: target.rootSha256,
        fileSha256: null,
        writer,
        phase: 'writing',
        verdict: null,
        failure: null,
        size: null,
        createdAtEpoch: now,
        updatedAtEpoch: now,
      };
      await write(db, record, true);
      return record;
    });
  });
}
export function backupUploadPath(record: BackupUploadRecord): string {
  const target = inspectManagedArchive(
    getBackendConfiguration().backupDirectory,
    uploadFilename(record.id),
  );
  if (target.rootSha256 !== record.rootSha256)
    throw new BackupUploadError('recovery_unverified', record.id);
  return target.filePath;
}
export async function readBackupUpload(
  id: string,
  actor: string,
  mayManageAll = false,
): Promise<BackupUploadRecord> {
  if (!UUID.test(id) || !validActor(actor)) throw new BackupUploadError('invalid_reference');
  return guarded(id, () =>
    withManagedArchiveControl(async (db) => (await read(db, id, actor, mayManageAll)).record),
  );
}
/** Called only after file close/sync; inspection owns no write or unlink authority. */
export async function checkpointBackupUpload(
  id: string,
  actor: string,
  phase: 'inspection' | 'closed',
  failure: UploadFailure | null = null,
): Promise<BackupUploadRecord> {
  return guarded(id, async () => {
    const original = await readBackupUpload(id, actor);
    const self = await captureArchiveWorker(process.pid);
    if (JSON.stringify(self) !== JSON.stringify(original.writer))
      throw new BackupUploadError('recovery_unverified', id);
    const target = inspectManagedArchive(
      getBackendConfiguration().backupDirectory,
      uploadFilename(id),
    );
    if (
      target.rootSha256 !== original.rootSha256 ||
      (original.phase === 'inspection' && target.fileSha256 !== original.fileSha256)
    )
      throw new BackupUploadError('recovery_unverified', id);
    const size = target.fileSha256 === null ? null : (await fs.promises.stat(target.filePath)).size;
    return withManagedArchiveControl(async (db) => {
      const { record, exists } = await read(db, id, actor);
      if (
        !exists ||
        record.phase !== original.phase ||
        JSON.stringify(record.writer) !== JSON.stringify(original.writer) ||
        record.phase === 'closed' ||
        (phase === 'inspection' && record.phase !== 'writing') ||
        (phase === 'closed' && failure === null && record.phase !== 'inspection')
      )
        throw new BackupUploadError('recovery_unverified', id);
      record.phase = phase;
      record.fileSha256 = target.fileSha256;
      record.size = size;
      record.updatedAtEpoch = await clock(db);
      if (phase === 'closed') {
        record.verdict =
          failure === null
            ? 'valid'
            : failure === 'invalid_archive' || failure === 'too_large'
              ? 'invalid'
              : 'unconfirmed';
        record.failure = failure;
      }
      const [updated] = await db.execute<ResultSetHeader>(
        {
          sql: 'UPDATE mud_backups SET status=?,progress=?,current_step=?,file_size=?,error_message=?,completed_at=IF(?,FROM_UNIXTIME(?),NULL) WHERE id=?',
          timeout: 5000,
        },
        [
          phase === 'inspection' ? 'in_progress' : failure === null ? 'completed' : 'failed',
          phase === 'closed' ? 100 : 90,
          phase === 'inspection'
            ? 'Inspecting uploaded archive...'
            : failure === null
              ? 'Uploaded archive inspected'
              : 'Upload needs review',
          size,
          failure === null ? null : `Upload was not confirmed. Reference: ${id}`,
          phase === 'closed',
          record.updatedAtEpoch,
          record.backupId,
        ],
      );
      if (updated.affectedRows !== 1) throw new BackupUploadError('storage_unconfirmed', id);
      await write(db, record);
      return record;
    });
  });
}
/** Never infer death from age. Inspection phase already durably proves the writer closed. */
export async function recoverBackupUpload(
  id: string,
  actor: string,
  mayManageAll = false,
): Promise<BackupUploadRecord> {
  return guarded(id, async () => {
    const original = await readBackupUpload(id, actor, mayManageAll);
    if (original.phase === 'closed') return original;
    if (original.phase === 'writing' && !(await archiveWorkerIsGone(original.writer)))
      throw new BackupUploadError('receiving', id);
    const target = inspectManagedArchive(
      getBackendConfiguration().backupDirectory,
      uploadFilename(id),
    );
    if (
      target.rootSha256 !== original.rootSha256 ||
      (original.phase === 'inspection' && target.fileSha256 !== original.fileSha256)
    )
      throw new BackupUploadError('recovery_unverified', id);
    const size = target.fileSha256 === null ? null : (await fs.promises.stat(target.filePath)).size;
    return withManagedArchiveControl(async (db) => {
      const { record, exists } = await read(db, id, original.owner);
      if (
        !exists ||
        record.phase !== original.phase ||
        JSON.stringify(record.writer) !== JSON.stringify(original.writer)
      )
        throw new BackupUploadError('recovery_unverified', id);
      record.phase = 'closed';
      record.verdict = 'unconfirmed';
      record.failure = 'inspection_unconfirmed';
      record.fileSha256 = target.fileSha256;
      record.size = size;
      record.updatedAtEpoch = await clock(db);
      const [updated] = await db.execute<ResultSetHeader>(
        {
          sql: "UPDATE mud_backups SET status='failed',current_step='Upload recovered for review',file_size=?,error_message=?,completed_at=FROM_UNIXTIME(?) WHERE id=?",
          timeout: 5000,
        },
        [size, `Upload needs review. Reference: ${id}`, record.updatedAtEpoch, record.backupId],
      );
      if (updated.affectedRows !== 1) throw new BackupUploadError('storage_unconfirmed', id);
      await write(db, record);
      return record;
    });
  });
}
export async function cancelBackupUpload(
  id: string,
  actor: string,
  mayManageAll = false,
): Promise<{ reference: string }> {
  return guarded(id, async () => {
    const record = await recoverBackupUpload(id, actor, mayManageAll);
    const target = inspectManagedArchive(
      getBackendConfiguration().backupDirectory,
      uploadFilename(id),
    );
    if (
      target.rootSha256 !== record.rootSha256 ||
      (target.fileSha256 !== null && target.fileSha256 !== record.fileSha256)
    )
      throw new BackupUploadError('recovery_unverified', id);
    const before = await withManagedArchiveControl((db) => read(db, id, record.owner));
    if (before.exists) {
      await removeManagedArchive(record.backupId, {
        filename: uploadFilename(id),
        rootSha256: record.rootSha256,
        fileSha256: record.fileSha256,
      });
    }
    const after = inspectManagedArchive(
      getBackendConfiguration().backupDirectory,
      uploadFilename(id),
    );
    if (after.rootSha256 !== record.rootSha256 || after.fileSha256 !== null)
      throw new BackupUploadError('recovery_unverified', id);
    return withManagedArchiveControl(async (db) => {
      const current = await read(db, id, record.owner);
      if (current.exists) throw new BackupUploadError('storage_unconfirmed', id);
      const reference = await completedArchiveRemoval(db, record.backupId, uploadFilename(id));
      if (!reference) throw new BackupUploadError('recovery_unverified', id);
      return { reference };
    });
  });
}

export async function registeredUploadFile(
  id: string,
  actor: string,
  mayManageAll = false,
): Promise<string> {
  const record = await readBackupUpload(id, actor, mayManageAll);
  if (record.phase !== 'closed') throw new BackupUploadError('receiving', id);
  const target = inspectManagedArchive(
    getBackendConfiguration().backupDirectory,
    uploadFilename(id),
  );
  if (
    target.rootSha256 !== record.rootSha256 ||
    target.fileSha256 === null ||
    target.fileSha256 !== record.fileSha256
  )
    throw new BackupUploadError('recovery_unverified', id);
  return target.filePath;
}

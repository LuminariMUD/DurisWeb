import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { retentionPreviewClasses, type RetentionPreviewClass } from '../config/retentionPolicy.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
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
export function validDataHoldActor(value: unknown): value is string {
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
      validDataHoldActor(value.accountName)
    )
      return { kind: 'account', accountName: value.accountName };
    if (
      value.kind === 'account_class' &&
      keys(value, ['kind', 'classId', 'accountName']) &&
      validClass(value.classId) &&
      validDataHoldActor(value.accountName)
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
export function parseDataHoldRelease(value: unknown): string {
  if (!object(value) || !keys(value, ['reason']) || !text(value.reason, 512))
    throw new DataHoldError('invalid_request');
  return value.reason.trim();
}
export function dataHoldScopeColumns(value: DataHoldScope): [string, string | null, string | null] {
  return [
    value.kind,
    'classId' in value ? value.classId : null,
    'accountName' in value ? value.accountName : null,
  ];
}
export function parseDataHoldEpoch(value: unknown): number {
  const parsed = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!epoch(parsed)) throw new DataHoldError('invalid_record');
  return parsed;
}
export function parseDataHoldRow(row: RowDataPacket): DataHold {
  try {
    if (!validDataHoldId(row.id) || !text(row.reason, 512) || !validDataHoldActor(row.created_by))
      throw new Error();
    const input: Record<string, unknown> = { kind: row.scope_type };
    if (row.class_id !== null) input.classId = row.class_id;
    if (row.account_name !== null) input.accountName = row.account_name;
    const holdScope = scope(input);
    const created = parseDataHoldEpoch(row.created_at_epoch),
      updated = parseDataHoldEpoch(row.updated_at_epoch),
      now = parseDataHoldEpoch(row.observed_epoch),
      review = parseDataHoldEpoch(row.review_at_epoch),
      expires = row.expires_at_epoch === null ? null : parseDataHoldEpoch(row.expires_at_epoch),
      released = row.released_at_epoch === null ? null : parseDataHoldEpoch(row.released_at_epoch);
    if (
      review <= created ||
      updated < created ||
      (expires !== null && expires < review) ||
      (released === null
        ? row.released_by !== null || row.release_reason !== null
        : !validDataHoldActor(row.released_by) ||
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

export const DATA_HOLD_ROW_FIELDS = `id,scope_type,class_id,account_name,reason,created_by,review_at_epoch,expires_at_epoch,
  released_by,release_reason,released_at_epoch,UNIX_TIMESTAMP(created_at) AS created_at_epoch,
  UNIX_TIMESTAMP(updated_at) AS updated_at_epoch`;

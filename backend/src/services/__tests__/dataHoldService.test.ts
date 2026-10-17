import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

const rows = new Map<string, Record<string, unknown>>();
let now = 1792192000,
  failWrite = false,
  loseCommit = false,
  failRollback = false,
  engine = 'InnoDB';
let saved: Map<string, Record<string, unknown>> | undefined;
const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const release = jest.fn(),
  destroy = jest.fn();
const getConnection = jest.fn(async () => ({
  execute,
  query: execute,
  release,
  destroy,
  beginTransaction: async () => {
    saved = new Map([...rows].map(([id, row]) => [id, { ...row }]));
  },
  commit: async () => {
    saved = undefined;
    if (loseCommit) {
      loseCommit = false;
      throw new Error('private-commit-bindings-sentinel');
    }
  },
  rollback: async () => {
    if (failRollback) throw new Error('private-rollback-sentinel');
    if (saved) {
      rows.clear();
      for (const [id, row] of saved) rows.set(id, row);
      saved = undefined;
    }
  },
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute, query: execute, getConnection },
}));
jest.unstable_mockModule('../retentionControl.js', () => ({
  lockRetentionControl: async () => ({ format: 1, lease: null }),
}));
const service = await import('../dataHoldService.js');
function request(scope: unknown = { kind: 'global' }) {
  return {
    id: randomUUID(),
    scope,
    reason: 'Synthetic review reason',
    reviewAtEpoch: now + 100,
    expiresAtEpoch: now + 200,
  };
}
beforeEach(() => {
  now = 1792192000;
  failWrite = false;
  loseCommit = false;
  failRollback = false;
  engine = 'InnoDB';
  rows.clear();
  saved = undefined;
  jest.clearAllMocks();
  execute.mockImplementation(async (...args) => {
    const spec = args[0];
    const sql = spec && typeof spec === 'object' && 'sql' in spec ? String(spec.sql) : String(spec);
    const values: unknown[] = Array.isArray(args[1]) ? args[1] : [];
    if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: engine }], []];
    if (sql === 'SELECT UNIX_TIMESTAMP() AS epoch') return [[{ epoch: now }], []];
    if (sql.startsWith('INSERT')) {
      if (failWrite) throw new Error('private-sql-subject-ip-sentinel');
      const [id, kind, cls, account, reason, actor, review, expiry] = values;
      if (Number(review) > now && !rows.has(String(id)))
        rows.set(String(id), {
          id,
          scope_type: kind,
          class_id: cls,
          account_name: account,
          reason,
          created_by: actor,
          review_at_epoch: review,
          expires_at_epoch: expiry,
          created_at_epoch: now,
          updated_at_epoch: now,
          released_by: null,
          release_reason: null,
          released_at_epoch: null,
        });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('UPDATE')) {
      if (failWrite) throw new Error('private-sql-subject-ip-sentinel');
      const [actor, reason, epoch, , id] = values,
        row = rows.get(String(id));
      if (row && row.released_at_epoch === null)
        Object.assign(row, {
          released_by: actor,
          release_reason: reason,
          released_at_epoch: epoch,
          updated_at_epoch: epoch,
        });
      return [{ affectedRows: row ? 1 : 0 }, []];
    }
    if (sql.includes('WHERE id=?')) {
      const row = rows.get(String(values[0]));
      return [row ? [{ ...row, observed_epoch: now }] : [], []];
    }
    const found = [...rows.values()]
      .filter(
        (row) =>
          String(row.id) > String(values[0]) &&
          (!sql.includes('released_at_epoch IS NULL') || row.released_at_epoch === null),
      )
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, Number(values[1]));
    return [found.map((row) => ({ ...row, observed_epoch: now })), []];
  });
});

describe('durable hold intent and release', () => {
  it('records the four explicit scopes and derives review/expiry from the database clock', async () => {
    for (const scope of [
      { kind: 'global' },
      { kind: 'class', classId: 'analytics_events' },
      { kind: 'account', accountName: 'SyntheticAccount' },
      { kind: 'account_class', accountName: 'SyntheticAccount', classId: 'login_history' },
    ]) {
      const value = request(scope),
        record = await service.createDataHold('Operator', value);
      expect(record).toMatchObject({
        id: value.id,
        scope,
        createdBy: 'Operator',
        createdAtEpoch: now,
        status: 'active',
        reviewDue: false,
      });
    }
    const id = [...rows.keys()][0];
    now += 100;
    expect(await service.getDataHold(id)).toMatchObject({ status: 'active', reviewDue: true });
    now += 100;
    expect(await service.getDataHold(id)).toMatchObject({ status: 'expired', reviewDue: false });
    expect(rows.size).toBe(4);
  });
  it('returns the same intent on retries and refuses conflicting actor, scope, dates or reason', async () => {
    const value = request();
    const first = await service.createDataHold('Operator', value);
    expect(await service.createDataHold('Operator', value)).toEqual(first);
    for (const altered of [
      { ...value, reason: 'different' },
      { ...value, scope: { kind: 'account', accountName: 'Other' } },
      { ...value, reviewAtEpoch: value.reviewAtEpoch + 1 },
    ])
      await expect(service.createDataHold('Operator', altered)).rejects.toMatchObject({
        reason: 'identity_conflict',
      });
    await expect(service.createDataHold('OtherOperator', value)).rejects.toMatchObject({
      reason: 'identity_conflict',
    });
    expect(rows.size).toBe(1);
    expect((await service.getDataHold(value.id)).reason).toBe(value.reason);
    now += 300;
    expect((await service.createDataHold('Operator', value)).status).toBe('expired');
  });
  it('retains creation/release attribution, accepts exact release retries and never reactivates a reused ID', async () => {
    const value = request(),
      original = await service.createDataHold('Operator', value);
    now++;
    const closed = await service.releaseDataHold('Reviewer', value.id, {
      reason: 'Review completed',
    });
    expect(closed).toMatchObject({
      createdBy: original.createdBy,
      createdAtEpoch: original.createdAtEpoch,
      reason: original.reason,
      releasedBy: 'Reviewer',
      releaseReason: 'Review completed',
      releasedAtEpoch: now,
      status: 'released',
    });
    expect(
      await service.releaseDataHold('Reviewer', value.id, { reason: 'Review completed' }),
    ).toEqual(closed);
    await expect(
      service.releaseDataHold('Other', value.id, { reason: 'Review completed' }),
    ).rejects.toMatchObject({ reason: 'release_conflict' });
    expect(await service.createDataHold('Operator', value)).toEqual(closed);
    expect(rows.size).toBe(1);
  });
  it('keeps acknowledged storage state retryable after uncertain commit outcomes', async () => {
    const value = request();
    loseCommit = true;
    await expect(service.createDataHold('Operator', value)).rejects.toMatchObject({
      reason: 'storage_unavailable',
    });
    expect(rows.has(value.id)).toBe(true);
    await service.createDataHold('Operator', value);
    loseCommit = true;
    await expect(
      service.releaseDataHold('Operator', value.id, { reason: 'Done' }),
    ).rejects.toMatchObject({ reason: 'storage_unavailable' });
    expect(await service.releaseDataHold('Operator', value.id, { reason: 'Done' })).toMatchObject({
      status: 'released',
    });
  });
  it('preserves intent on write failure and destroys a connection whose rollback fails', async () => {
    const value = request();
    await service.createDataHold('Operator', value);
    failWrite = true;
    const failure = await service
      .releaseDataHold('Operator', value.id, { reason: 'Done' })
      .catch((error) => error as unknown);
    expect(failure).toBeInstanceOf(service.DataHoldError);
    expect(inspect(failure)).not.toContain('private-sql-subject-ip-sentinel');
    expect((await service.getDataHold(value.id)).status).toBe('active');
    failRollback = true;
    await expect(service.createDataHold('Operator', request())).rejects.toMatchObject({
      reason: 'storage_unavailable',
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed input, unrecognized scope and invalid dates without writing', async () => {
    for (const value of [
      null,
      { ...request(), actor: 'Forged' },
      { ...request(), reviewAtEpoch: 0 },
      { ...request(), expiresAtEpoch: now },
      { ...request(), reason: ' ' },
      request({ kind: 'class', classId: 'accounts' }),
      request({ kind: 'global', accountName: 'Extraneous' }),
      request({ kind: 'account', accountName: ' Name ' }),
    ])
      await expect(service.createDataHold('Operator', value)).rejects.toMatchObject({
        reason: 'invalid_request',
      });
    expect(rows.size).toBe(0);
    engine = 'MyISAM';
    await expect(service.createDataHold('Operator', request())).rejects.toMatchObject({
      reason: 'storage_unavailable',
    });
    expect(rows.size).toBe(0);
  });
  it('fails closed on malformed stored records without overwriting their evidence', async () => {
    const value = request();
    await service.createDataHold('Operator', value);
    rows.get(value.id)!.scope_type = 'unknown';
    await expect(service.getDataHold(value.id)).rejects.toMatchObject({ reason: 'invalid_record' });
    await expect(
      service.releaseDataHold('Operator', value.id, { reason: 'Done' }),
    ).rejects.toMatchObject({ reason: 'invalid_record' });
    expect(rows.get(value.id)!.scope_type).toBe('unknown');
  });
  it('bounds history pages and keeps released records available only when explicitly requested', async () => {
    for (let index = 0; index < 4; index++) await service.createDataHold('Operator', request());
    const first = await service.listDataHolds({ after: null, includeReleased: false, limit: 2 });
    expect(first.holds.length).toBe(2);
    expect(first.nextCursor).toBe(first.holds[1].id);
    const second = await service.listDataHolds({
      after: first.nextCursor,
      includeReleased: false,
      limit: 2,
    });
    expect(second.holds.length).toBe(2);
    expect(second.nextCursor).toBeNull();
    await service.releaseDataHold('Operator', first.holds[0].id, { reason: 'Done' });
    expect(
      (await service.listDataHolds({ after: null, includeReleased: false, limit: 100 })).holds
        .length,
    ).toBe(3);
    expect(
      (await service.listDataHolds({ after: null, includeReleased: true, limit: 100 })).holds
        .length,
    ).toBe(4);
    await expect(
      service.listDataHolds({ after: null, includeReleased: false, limit: 101 }),
    ).rejects.toMatchObject({ reason: 'invalid_request' });
    expect(
      execute.mock.calls.every((call) => (call[0] as { timeout: number }).timeout === 5000),
    ).toBe(true);
  });
});

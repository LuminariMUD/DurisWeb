import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, chmod, readFile, rm, symlink, link, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inspect } from 'node:util';
import { performance } from 'node:perf_hooks';
import { retentionPreviewPolicy } from '../../config/retentionPolicy.js';

const now = 1792192000;
interface Candidate {
  id: string;
  epoch: number;
}
const pages: Candidate[] = [],
  logins: Candidate[] = [];
const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const rollback = jest.fn(async () => {}),
  destroy = jest.fn();
const connect = jest.fn(async () => ({ execute, query, rollback, destroy }));
const metadata = jest.fn(async () => 'shape');
jest.unstable_mockModule('mysql2/promise', () => ({ default: { createConnection: connect } }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({
    database: {
      host: '127.0.0.1',
      port: 23436,
      database: 'synthetic',
      user: 'synthetic',
      password: 'private-credential-sentinel',
    },
  }),
}));
jest.unstable_mockModule('../../db/schemaPostconditions.js', () => ({
  schemaDatabaseFamily: async () => 'mysql8',
  readTableMetadata: metadata,
  tableMetadataSha256: (value: string) => value,
  loadSchemaPostconditions: () => ({
    tables: { page_views: { mysql8: ['shape'] }, account_login_history: { mysql8: ['shape'] } },
  }),
}));
const service = await import('../retentionPreview.js');
const files = await import('../retentionPreviewCheckpoint.js');
const cli = await import('../../scripts/retentionPreview.js');
const options = {
  target: '127.0.0.1:23436/synthetic',
  policyVersion: retentionPreviewPolicy.version,
  classes: ['analytics_events', 'login_history'] as const,
  batchSize: 2,
  maxCandidates: 100,
  timeBudgetMs: 2000,
};
let directory: string | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  pages.length = 0;
  logins.length = 0;
  metadata.mockResolvedValue('shape');
  query.mockResolvedValue([[], []]);
  execute.mockImplementation(async (...args) => {
    const spec = args[0];
    const sql = spec && typeof spec === 'object' && 'sql' in spec ? String(spec.sql) : String(spec);
    const values = Array.isArray(args[1]) ? args[1] : [];
    if (sql === 'SELECT UNIX_TIMESTAMP() AS epoch') return [[{ epoch: now }], []];
    const rows = sql.includes('FROM page_views') ? pages : logins;
    if (sql.includes('ORDER BY id DESC')) {
      const high = rows.reduce(
        (maximum, row) => (BigInt(row.id) > maximum ? BigInt(row.id) : maximum),
        0n,
      );
      return [high ? [{ cursor_id: high.toString() }] : [], []];
    }
    const [, cutoff, high, cursor, , cursorId, limit] = values;
    return [
      rows
        .filter(
          (row) =>
            row.epoch > 0 &&
            row.epoch < Number(cutoff) &&
            BigInt(row.id) <= BigInt(String(high)) &&
            (row.epoch > Number(cursor) ||
              (row.epoch === Number(cursor) && BigInt(row.id) > BigInt(String(cursorId)))),
        )
        .sort((a, b) => a.epoch - b.epoch || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        .slice(0, Number(limit))
        .map((row) => ({ cursor_id: row.id, epoch: row.epoch })),
      [],
    ];
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
function seed() {
  const cutoff = now - 30 * 86400;
  pages.push(
    { id: '1', epoch: cutoff - 1 },
    { id: '2', epoch: cutoff },
    { id: '3', epoch: cutoff + 1 },
  );
  logins.push({ id: '9007199254740993', epoch: now - 90 * 86400 - 1 });
}

describe('bounded read-only proposed retention preview', () => {
  it('stops starting data pages when its monotonic scan budget has expired', async () => {
    seed();
    jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(2);
    const { result, checkpoint } = await service.previewRetention({ ...options, timeBudgetMs: 1 });
    expect(result).toMatchObject({ complete: false, candidatesObservedThisBatch: 0 });
    expect(
      execute.mock.calls.some((call) =>
        String((call[0] as { sql: string }).sql).includes('FORCE INDEX'),
      ),
    ).toBe(false);
    expect(service.parseRetentionCheckpoint(JSON.stringify(checkpoint))).toEqual(checkpoint);
  });
  it('uses strict proposed boundaries, exact bigint IDs and an aggregate-only report', async () => {
    seed();
    const { result } = await service.previewRetention(options);
    expect(result).toMatchObject({
      mode: 'dry-run',
      policyApproved: false,
      executionAvailable: false,
      complete: true,
      candidatesObservedThisBatch: 2,
      classes: [
        { classId: 'analytics_events', ageCandidatesObserved: 1 },
        { classId: 'login_history', ageCandidatesObserved: 1 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /cursorId|upperId|9007199254740993|private-credential-sentinel/,
    );
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      { sql: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', timeout: 5000 },
      { sql: 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY', timeout: 5000 },
    ]);
    expect(
      execute.mock.calls.every((call) =>
        String((call[0] as { sql: string }).sql).startsWith('SELECT'),
      ),
    ).toBe(true);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('continues from a fixed cutoff/high water without rereading old pages or newly inserted IDs', async () => {
    const cutoff = now - 30 * 86400;
    pages.push(...['1', '2', '3', '4', '5'].map((id) => ({ id, epoch: cutoff - 10 })));
    const bounded = { ...options, classes: ['analytics_events'] as const, maxCandidates: 2 };
    const first = await service.previewRetention(bounded);
    expect(first.result.complete).toBe(false);
    expect(first.result.candidatesObservedThisBatch).toBe(2);
    pages.push({ id: '6', epoch: cutoff - 20 });
    const second = await service.previewRetention(bounded, first.checkpoint);
    const third = await service.previewRetention(bounded, second.checkpoint);
    expect(third.result).toMatchObject({
      operationId: first.result.operationId,
      capturedAtEpoch: now,
      complete: true,
      candidatesObservedThisBatch: 1,
      classes: [{ ageCandidatesObserved: 5 }],
    });
    expect(second.checkpoint.classes[0].cursorId).toBe('4');
    expect(first.checkpoint.classes[0].cursorId).toBe('2');
  });
  it('refuses unknown scope, target, policy, bad limits and changed checkpoints before connecting', async () => {
    const { checkpoint } = await service.previewRetention(options);
    connect.mockClear();
    for (const bad of [
      { ...options, target: 'other' },
      { ...options, policyVersion: 'obsolete' },
      { ...options, batchSize: 501 },
      { ...options, maxCandidates: 0 },
      { ...options, timeBudgetMs: 0 },
    ])
      await expect(service.previewRetention(bad)).rejects.toBeInstanceOf(
        service.RetentionPreviewError,
      );
    for (const bad of [
      { ...checkpoint, targetHash: 'f'.repeat(64) },
      { ...checkpoint, signature: 'e'.repeat(64) },
      { ...checkpoint, classes: [...checkpoint.classes, checkpoint.classes[0]] },
    ])
      await expect(service.previewRetention(options, bad)).rejects.toBeInstanceOf(
        service.RetentionPreviewError,
      );
    expect(connect).not.toHaveBeenCalled();
    for (const text of [
      '{}',
      '{',
      'x'.repeat(16385),
      JSON.stringify({ ...checkpoint, unexpected: 'secret' }),
      JSON.stringify({
        ...checkpoint,
        classes: [{ ...checkpoint.classes[0], classId: 'accounts' }],
      }),
    ])
      expect(() => service.parseRetentionCheckpoint(text)).toThrow(service.RetentionPreviewError);
  });
  it('refuses drift, an invalid result and a clock rollback without returning a usable result', async () => {
    metadata.mockResolvedValueOnce('drift');
    await expect(service.previewRetention(options)).rejects.toMatchObject({
      reason: 'schema_unverified',
    });
    execute.mockResolvedValueOnce([[{ epoch: 0 }], []]);
    await expect(service.previewRetention(options)).rejects.toMatchObject({
      reason: 'invalid_database_result',
    });
    const { checkpoint } = await service.previewRetention(options);
    checkpoint.capturedAtEpoch++;
    await expect(service.previewRetention(options, checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_clock_mismatch',
    });
  });
  it('does not leak a driver failure or bindings through command output', async () => {
    execute.mockRejectedValueOnce(new Error('private-sql-ip-account-password-sentinel'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await cli.runRetentionPreviewCommand([
        '--target',
        options.target,
        '--policy-version',
        options.policyVersion,
      ]),
    ).toBe(1);
    expect(inspect(error.mock.calls)).toContain('database_unavailable');
    expect(inspect(error.mock.calls)).not.toContain('private-sql-ip-account-password-sentinel');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('defaults to dry run and rejects mutation, unknown/protected classes and malformed flags before opening a database', async () => {
    expect(
      cli.parseRetentionPreviewArguments([
        '--target',
        options.target,
        '--policy-version',
        options.policyVersion,
      ]).options,
    ).toEqual({ ...options, batchSize: 100, maxCandidates: 1000 });
    for (const args of [
      ['execute'],
      ['--execute', 'true'],
      ['--target', 'x'],
      ['--target', 'x', '--target', 'x'],
      ['--class', 'donations'],
      ['--class', 'accounts'],
      ['--class', 'analytics_events,analytics_events'],
      ['--batch-size', '1x'],
      ['--max-candidates', '-1'],
      ['--time-budget-ms', '10001'],
      ['--resume', 'relative.json'],
      ['--checkpoint-out', 'relative.json'],
    ]) {
      const supplied = [
        '--target',
        options.target,
        '--policy-version',
        options.policyVersion,
        ...args,
      ];
      expect(() =>
        cli.parseRetentionPreviewArguments(args[0] === 'execute' ? args : supplied),
      ).toThrow(service.RetentionPreviewError);
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it('writes private immutable checkpoints and rejects shared files, links, oversize data and reuse of an output path', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'durisweb-retention-unit-'));
    const filename = path.join(directory, 'preview.json');
    const { checkpoint } = await service.previewRetention(options);
    await files.writeRetentionCheckpoint(filename, checkpoint);
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
    expect(await files.readRetentionCheckpoint(filename)).toEqual(checkpoint);
    const original = await readFile(filename, 'utf8');
    await expect(files.writeRetentionCheckpoint(filename, checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_write_failed',
    });
    expect(await readFile(filename, 'utf8')).toBe(original);
    await chmod(filename, 0o644);
    await expect(files.readRetentionCheckpoint(filename)).rejects.toMatchObject({
      reason: 'private_checkpoint_required',
    });
    await chmod(filename, 0o600);
    const symbolic = path.join(directory, 'symbolic.json'),
      hard = path.join(directory, 'hard.json');
    await symlink(filename, symbolic);
    await expect(files.readRetentionCheckpoint(symbolic)).rejects.toBeInstanceOf(
      service.RetentionPreviewError,
    );
    await link(filename, hard);
    await expect(files.readRetentionCheckpoint(filename)).rejects.toMatchObject({
      reason: 'private_checkpoint_required',
    });
    await rm(hard);
    await writeFile(filename, 'x'.repeat(16385), { mode: 0o600 });
    await expect(files.readRetentionCheckpoint(filename)).rejects.toBeInstanceOf(
      service.RetentionPreviewError,
    );
  });
});

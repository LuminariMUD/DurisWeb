import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { retentionPreviewPolicy } from '../../config/retentionPolicy.js';
import { previewRetention, type RetentionPreviewResult } from '../retentionPreview.js';

const port = Number(process.env.TEST_RETENTION_DB_PORT);
const database = process.env.DB_NAME ?? '';
if (
  process.env.TEST_RETENTION_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    database !== 'durisweb_qualification_retention_suite')
)
  throw new Error('Retention native tests require the dedicated disposable fixture');
const realConnect = mysql.createConnection.bind(mysql);
const target = `127.0.0.1:${port}/${database}`;
const options = {
  target,
  policyVersion: retentionPreviewPolicy.version,
  classes: ['analytics_events', 'login_history'] as const,
  batchSize: 2,
  maxCandidates: 100,
  timeBudgetMs: 2000,
};
const fixedNow = 1792192000;
const reader = 'durisweb_retention_read_fixture';
let root: Connection;
let readerCreated = false;
let directory: string | undefined;

function command(extra: string[] = [], environment: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'src/scripts/retentionPreview.ts',
      '--target',
      target,
      '--policy-version',
      retentionPreviewPolicy.version,
      ...extra,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DOTENV_CONFIG_QUIET: 'true', ...environment },
      encoding: 'utf8',
      timeout: 30000,
    },
  );
}
async function insertPage(
  epoch: number | null,
  subject: string | null = 'SyntheticPrivateAccount',
) {
  await root.execute(
    'INSERT INTO page_views(session_id,account_name,path,ip_address,created_at) VALUES (?,?,?,?,FROM_UNIXTIME(?))',
    [
      'synthetic-private-visit',
      subject,
      '/private-sentinel?credential=synthetic',
      '192.0.2.44',
      epoch,
    ],
  );
}
async function insertLogin(epoch: number, subject = 'SyntheticPrivateAccount', id?: string) {
  if (id)
    await root.execute(
      'INSERT INTO account_login_history(id,account_name,status,timestamp,ip_address) VALUES (?,?,?,FROM_UNIXTIME(?),?)',
      [id, subject, 'login', epoch, '192.0.2.45'],
    );
  else
    await root.execute(
      'INSERT INTO account_login_history(account_name,status,timestamp,ip_address) VALUES (?,?,FROM_UNIXTIME(?),?)',
      [subject, 'login', epoch, '192.0.2.45'],
    );
}
function freezeClock(zone = '+00:00', observed = fixedNow) {
  return jest.spyOn(mysql, 'createConnection').mockImplementation(async (configuration) => {
    const connection = await realConnect(configuration);
    await connection.query('SET time_zone=?', [zone]);
    await connection.query('SET timestamp=?', [observed]);
    return connection;
  });
}
async function insertHold(
  scope: { kind: string; classId?: string; accountName?: string },
  expiresAt: number | null = null,
) {
  const id = randomUUID();
  await root.execute(
    `INSERT INTO web_data_holds
    (id,scope_type,class_id,account_name,reason,created_by,review_at_epoch,expires_at_epoch,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?, ?,FROM_UNIXTIME(?),FROM_UNIXTIME(?))`,
    [
      id,
      scope.kind,
      scope.classId ?? null,
      scope.accountName ?? null,
      'PrivateHoldReasonSentinel',
      'PrivateHoldOperator',
      fixedNow - 10,
      expiresAt,
      fixedNow - 1000,
      fixedNow - 1000,
    ],
  );
  return id;
}
async function snapshot() {
  const [pages] = await root.query<RowDataPacket[]>('SELECT * FROM page_views ORDER BY id');
  const [logins] = await root.query<RowDataPacket[]>(
    'SELECT * FROM account_login_history ORDER BY id',
  );
  return JSON.stringify({ pages, logins });
}

(port ? describe : describe.skip)('retention preview on a full disposable schema', () => {
  beforeAll(async () => {
    root = await realConnect({
      host: '127.0.0.1',
      port,
      database,
      user: 'root',
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
    await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
      reader,
      '%',
      'synthetic-read-only-fixture',
    ]);
    readerCreated = true;
    await root.query(`GRANT SELECT ON durisweb_qualification_retention_suite.page_views TO ?@?`, [
      reader,
      '%',
    ]);
    await root.query(
      `GRANT SELECT ON durisweb_qualification_retention_suite.account_login_history TO ?@?`,
      [reader, '%'],
    );
    await root.query(
      'GRANT SELECT ON durisweb_qualification_retention_suite.web_data_holds TO ?@?',
      [reader, '%'],
    );
    // MariaDB 11.8.9 hides CHECK metadata from table-only readers. This adds metadata visibility, not data writes.
    if (port === 23437)
      await root.query('GRANT SHOW VIEW ON durisweb_qualification_retention_suite.* TO ?@?', [
        reader,
        '%',
      ]);
  });
  beforeEach(async () => {
    // This exact, disposable database is provisioned solely for these synthetic rows.
    await root.execute('DELETE FROM page_views');
    await root.execute('DELETE FROM account_login_history');
    await root.execute('DELETE FROM web_data_holds');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });
  afterAll(async () => {
    if (root) {
      if (readerCreated) await root.query('DROP USER ?@?', [reader, '%']);
      await root.end();
    }
  });

  it('matches all hold scopes with database collation and keeps null-account records separate', async () => {
    freezeClock();
    const old = fixedNow - 100 * 86400;
    for (const subject of ['\u00c1lpha', 'alpha', 'Beta', null]) await insertPage(old, subject);
    await insertLogin(old, '\u00c1lpha');
    await insertLogin(old, 'Beta');
    const before = await snapshot();
    for (const [scope, expected] of [
      [{ kind: 'global' }, [4, 2]],
      [{ kind: 'class', classId: 'analytics_events' }, [4, 0]],
      [{ kind: 'account', accountName: 'ALPHA' }, [2, 1]],
      [{ kind: 'account_class', classId: 'login_history', accountName: 'ALPHA' }, [0, 1]],
    ] as const) {
      await root.execute('DELETE FROM web_data_holds');
      await insertHold(scope);
      const { result } = await previewRetention(options);
      expect(result).toMatchObject({
        activeHoldsObserved: 1,
        eligibilityChecks: 'holds_only',
        executionAvailable: false,
      });
      expect(result.classes.map((item) => item.heldAgeCandidatesObserved)).toEqual(expected);
      expect(result.classes.map((item) => item.unheldAgeCandidatesObserved)).toEqual([
        4 - expected[0],
        2 - expected[1],
      ]);
      expect(JSON.stringify(result)).not.toMatch(/ALPHA|Alpha|PrivateHold|holdFingerprint/);
      expect(await snapshot()).toBe(before);
    }
    await root.execute('DELETE FROM web_data_holds');
    await insertHold({ kind: 'global' }, fixedNow);
    const closed = await insertHold({ kind: 'global' });
    await root.execute(
      'UPDATE web_data_holds SET released_by=?,release_reason=?,released_at_epoch=?,updated_at=FROM_UNIXTIME(?) WHERE id=?',
      ['PrivateHoldOperator', 'Reviewed', fixedNow - 1, fixedNow - 1, closed],
    );
    const { result } = await previewRetention(options);
    expect(result.classes.map((item) => item.heldAgeCandidatesObserved)).toEqual([0, 0]);
  });

  it('refuses continuation after hold creation, release and expiry without changing source records', async () => {
    let clock = freezeClock();
    for (let index = 0; index < 4; index++) await insertPage(fixedNow - 100 * 86400);
    const bounded = { ...options, maxCandidates: 1 };
    const empty = await previewRetention(bounded);
    const id = await insertHold({ kind: 'global' });
    await expect(previewRetention(bounded, empty.checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_holds_changed',
    });
    const held = await previewRetention(bounded);
    await root.execute(
      'UPDATE web_data_holds SET released_by=?,release_reason=?,released_at_epoch=?,updated_at=FROM_UNIXTIME(?) WHERE id=?',
      ['PrivateHoldOperator', 'Reviewed', fixedNow, fixedNow, id],
    );
    await expect(previewRetention(bounded, held.checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_holds_changed',
    });
    await insertHold({ kind: 'global' }, fixedNow + 1);
    const expiring = await previewRetention(bounded);
    clock.mockRestore();
    clock = freezeClock('+00:00', fixedNow + 2);
    await expect(previewRetention(bounded, expiring.checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_holds_changed',
    });
    expect(
      Number(
        (await root.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM page_views'))[0][0].count,
      ),
    ).toBe(4);
  });

  it('uses one read snapshot when a hold commits after validation but before candidate scanning', async () => {
    await insertPage(fixedNow - 100 * 86400);
    let injected = false;
    jest.spyOn(mysql, 'createConnection').mockImplementation(async (configuration) => {
      const connection = await realConnect(configuration);
      await connection.query('SET timestamp=?', [fixedNow]);
      return new Proxy(connection, {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (key === 'execute' && typeof value === 'function')
            return async (...args: unknown[]) => {
              const first = args[0],
                sql = first && typeof first === 'object' && 'sql' in first ? String(first.sql) : '';
              const result: unknown = await Reflect.apply(value, target, args);
              if (!injected && sql.startsWith('SELECT id,scope_type')) {
                injected = true;
                await insertHold({ kind: 'global' });
              }
              return result;
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    const { result, checkpoint } = await previewRetention(options);
    expect(injected).toBe(true);
    expect(result).toMatchObject({
      activeHoldsObserved: 0,
      classes: [{ heldAgeCandidatesObserved: 0 }, { heldAgeCandidatesObserved: 0 }],
    });
    await expect(previewRetention(options, checkpoint)).rejects.toMatchObject({
      reason: 'checkpoint_holds_changed',
    });
  });

  it('refuses unreadable, invalid and over-limit protection instead of producing unheld counts', async () => {
    freezeClock();
    await insertPage(fixedNow - 100 * 86400);
    const bad = await insertHold({ kind: 'class', classId: 'unrecognized' });
    await expect(previewRetention(options)).rejects.toMatchObject({
      reason: 'hold_state_unverified',
    });
    await root.execute('DELETE FROM web_data_holds WHERE id=?', [bad]);
    const values = Array.from({ length: 1001 }, () => [
      randomUUID(),
      'global',
      'Private reason',
      'PrivateHoldOperator',
      fixedNow + 100000,
      new Date((fixedNow - 1000) * 1000),
      new Date((fixedNow - 1000) * 1000),
    ]);
    await root.query(
      'INSERT INTO web_data_holds(id,scope_type,reason,created_by,review_at_epoch,created_at,updated_at) VALUES ?',
      [values],
    );
    await expect(previewRetention(options)).rejects.toMatchObject({
      reason: 'hold_state_unverified',
    });
    await root.execute('DELETE FROM web_data_holds');
    await root.query(
      'REVOKE SELECT ON durisweb_qualification_retention_suite.web_data_holds FROM ?@?',
      [reader, '%'],
    );
    try {
      const denied = command([], { DB_USER: reader, DB_PASSWORD: 'synthetic-read-only-fixture' });
      expect(denied.status).toBe(1);
      expect(denied.stdout).not.toContain('"classes"');
      expect(denied.stderr).not.toMatch(/PrivateHold|password-sentinel/);
    } finally {
      await root.query(
        'GRANT SELECT ON durisweb_qualification_retention_suite.web_data_holds TO ?@?',
        [reader, '%'],
      );
    }
  });

  it('keeps before/exact/after cutoff semantics across database offsets and excludes unknown times', async () => {
    for (const zone of ['+00:00', '+03:00', '-07:00']) {
      await root.execute('DELETE FROM page_views');
      await root.execute('DELETE FROM account_login_history');
      const eventCutoff = fixedNow - 30 * 86400,
        loginCutoff = fixedNow - 90 * 86400;
      for (const difference of [-1, 0, 1]) {
        await insertPage(eventCutoff + difference);
        await insertLogin(loginCutoff + difference);
      }
      await insertPage(null);
      await insertPage(1);
      await insertLogin(1);
      const before = await snapshot();
      freezeClock(zone);
      const { result } = await previewRetention(options);
      expect(result).toMatchObject({
        capturedAtEpoch: fixedNow,
        policyApproved: false,
        executionAvailable: false,
        complete: true,
        classes: [{ ageCandidatesObserved: 2 }, { ageCandidatesObserved: 2 }],
      });
      expect(await snapshot()).toBe(before);
      jest.restoreAllMocks();
    }
  });

  it('continues across real CLI processes with private checkpoints and a fixed cutoff/high water', async () => {
    const [clock] = await root.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch');
    const old = Number(clock[0].epoch) - 100 * 86400;
    for (let index = 0; index < 5; index++)
      await insertPage(old, index % 2 ? 'SyntheticOtherAccount' : 'SyntheticPrivateAccount');
    await insertLogin(old);
    directory = await mkdtemp(path.join(os.tmpdir(), 'durisweb-retention-native-'));
    const firstFile = path.join(directory, 'first.json'),
      secondFile = path.join(directory, 'second.json');
    const env = { DB_USER: reader, DB_PASSWORD: 'synthetic-read-only-fixture' };
    const first = command(
      ['--max-candidates', '2', '--batch-size', '1', '--checkpoint-out', firstFile],
      env,
    );
    if (first.status !== 0) throw new Error('Synthetic retention CLI failed: ' + first.stderr);
    const firstReport = JSON.parse(first.stdout) as RetentionPreviewResult;
    expect(firstReport.complete).toBe(false);
    expect(firstReport.candidatesObservedThisBatch).toBe(2);
    expect((await stat(firstFile)).mode & 0o777).toBe(0o600);
    await insertPage(old - 1);
    const before = await snapshot();
    const second = command(
      ['--resume', firstFile, '--checkpoint-out', secondFile, '--batch-size', '1'],
      env,
    );
    expect(second.status).toBe(0);
    const report = JSON.parse(second.stdout) as RetentionPreviewResult;
    expect(report).toMatchObject({
      operationId: firstReport.operationId,
      capturedAtEpoch: firstReport.capturedAtEpoch,
      complete: true,
      classes: [{ ageCandidatesObserved: 5 }, { ageCandidatesObserved: 1 }],
    });
    expect(await snapshot()).toBe(before);
    for (const text of [first.stdout, second.stdout, await readFile(secondFile, 'utf8')])
      expect(text).not.toMatch(
        /SyntheticPrivateAccount|SyntheticOtherAccount|private-sentinel|192\.0\.2\.|synthetic-private-visit/,
      );
  });

  it('preserves exact IDs beyond JavaScript precision while paging and does not modify either subject', async () => {
    freezeClock();
    await insertLogin(fixedNow - 100 * 86400, 'SyntheticPrivateAccount', '9007199254740993');
    await insertLogin(fixedNow - 100 * 86400, 'SyntheticOtherAccount', '9007199254740995');
    const before = await snapshot();
    const bounded = {
      ...options,
      classes: ['login_history'] as const,
      batchSize: 1,
      maxCandidates: 1,
    };
    const first = await previewRetention(bounded),
      second = await previewRetention(bounded, first.checkpoint);
    expect(first.checkpoint.classes[0].cursorId).toBe('9007199254740993');
    expect(second.checkpoint.classes[0].cursorId).toBe('9007199254740995');
    expect(second.result.classes[0].ageCandidatesObserved).toBe(2);
    expect(await snapshot()).toBe(before);
  });

  it('uses the existing time/primary-key ordering indexes at scale without a filesort', async () => {
    await insertHold({ kind: 'account', accountName: 'SyntheticScaleAccount' });
    const insert = Array.from({ length: 1000 }, (_, index) => [
      'synthetic-scale',
      '/forum',
      fixedNow - 100 * 86400 + index,
    ]);
    await root.query('INSERT INTO page_views(session_id,path,created_at) VALUES ?', [
      insert.map(([session, page, time]) => [session, page, new Date(Number(time) * 1000)]),
    ]);
    await root.query('INSERT INTO account_login_history(account_name,status,timestamp) VALUES ?', [
      insert.map(([, , time]) => ['SyntheticScaleAccount', 'login', new Date(Number(time) * 1000)]),
    ]);
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    jest.spyOn(mysql, 'createConnection').mockImplementation(async (configuration) => {
      const connection = await realConnect(configuration);
      await connection.query('SET timestamp=?', [fixedNow]);
      const capture = jest.spyOn(connection, 'execute');
      const destroy = connection.destroy.bind(connection);
      jest.spyOn(connection, 'destroy').mockImplementation(() => {
        for (const call of capture.mock.calls) {
          const spec = call[0];
          if (spec && typeof spec === 'object' && 'sql' in spec && spec.sql.includes('FORCE INDEX'))
            statements.push({ sql: spec.sql, values: Array.isArray(call[1]) ? call[1] : [] });
        }
        destroy();
      });
      return connection;
    });
    const { result } = await previewRetention({ ...options, batchSize: 100, maxCandidates: 10000 });
    expect(result.classes[0].ageCandidatesObserved).toBe(1000);
    expect(result.classes[1].ageCandidatesObserved).toBe(1000);
    expect(result.classes.map((item) => item.heldAgeCandidatesObserved)).toEqual([0, 1000]);
    expect(statements.length).toBeGreaterThan(1);
    const indexes = new Set<string>();
    for (const statement of statements) {
      const [plan] = await root.query<RowDataPacket[]>(
        { sql: 'EXPLAIN ' + statement.sql, timeout: 5000 },
        statement.values,
      );
      if (statement.sql.includes('AS is_held')) {
        const candidate = plan.find((row) => row.table === 'candidate');
        expect(['idx_created_at', 'idx_timestamp']).toContain(candidate?.key);
        indexes.add(String(candidate?.key));
      } else expect(plan[0].key).toBe('idx_data_holds_unreleased');
      expect(String(plan[0].Extra)).not.toMatch(/filesort/i);
    }
    expect([...indexes].sort()).toEqual(['idx_created_at', 'idx_timestamp']);
  });

  it('rejects drift and direct execution/unknown-class CLI inputs without modifying records', async () => {
    await insertPage(fixedNow - 100 * 86400);
    const before = await snapshot();
    await root.query('ALTER TABLE page_views ADD COLUMN retention_fixture_drift INT NULL');
    try {
      await expect(previewRetention(options)).rejects.toMatchObject({
        reason: 'schema_unverified',
      });
    } finally {
      await root.query('ALTER TABLE page_views DROP COLUMN retention_fixture_drift');
    }
    const execute = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/scripts/retentionPreview.ts', 'execute'],
      { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30000 },
    );
    expect(execute.status).toBe(1);
    expect(execute.stderr).toContain('execution_unavailable');
    const unknown = command(['--class', 'donations']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('invalid_arguments');
    expect(await snapshot()).toBe(before);
  });
});

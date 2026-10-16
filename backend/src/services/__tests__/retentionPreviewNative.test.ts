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
async function insertPage(epoch: number | null, subject = 'SyntheticPrivateAccount') {
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
function freezeClock(zone = '+00:00') {
  return jest.spyOn(mysql, 'createConnection').mockImplementation(async (configuration) => {
    const connection = await realConnect(configuration);
    await connection.query('SET time_zone=?', [zone]);
    await connection.query('SET timestamp=?', [fixedNow]);
    return connection;
  });
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
  });
  beforeEach(async () => {
    // This exact, disposable database is provisioned solely for these synthetic rows.
    await root.execute('DELETE FROM page_views');
    await root.execute('DELETE FROM account_login_history');
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
    expect(first.status).toBe(0);
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
    expect(statements.length).toBeGreaterThan(1);
    const indexes = new Set<string>();
    for (const statement of statements) {
      const [plan] = await root.query<RowDataPacket[]>(
        { sql: 'EXPLAIN ' + statement.sql, timeout: 5000 },
        statement.values,
      );
      expect(['idx_created_at', 'idx_timestamp']).toContain(plan[0].key);
      indexes.add(String(plan[0].key));
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

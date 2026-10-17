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
import * as childProcesses from 'node:child_process';
import type { ChildProcess, ForkOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_REMOVAL_PREFIX, RETENTION_CONTROL_KEY } from '../../db/internalWebSettings.js';
import { ARCHIVE_REMOVAL_STATE_KEY, parseArchiveRemovalRecord } from '../archiveRemovalJournal.js';
import type { DataHoldScope } from '../dataHoldRecords.js';

const port = Number(process.env.TEST_ARCHIVE_REMOVAL_DB_PORT);
const database = process.env.DB_NAME ?? '';
const directory = process.env.BACKUP_DIR ?? '';
if (
  process.env.TEST_ARCHIVE_REMOVAL_DB_PORT &&
  (![23436, 23437].includes(port) ||
    process.env.DB_HOST !== '127.0.0.1' ||
    database !== 'durisweb_qualification_archive_removal_suite' ||
    !directory.startsWith('/tmp/durisweb-archive-qualification-') ||
    process.env.CACHE_REDIS_HOST !== '127.0.0.1' ||
    process.env.CACHE_REDIS_PORT !== '23479' ||
    process.env.CACHE_REDIS_DB !== (port === 23436 ? '13' : '14'))
)
  throw new Error(
    'Archive qualification requires its own full-schema database and private filesystem/cache',
  );
const realConnect = mysql.createConnection.bind(mysql);
const realFork = childProcesses.fork;
let root: Connection;
let backup: typeof import('../backupService.js');
let holds: typeof import('../dataHoldService.js');
let removal: typeof import('../managedArchiveRemoval.js');
let pool: typeof import('../../db/connection.js')['pool'];
let cache: typeof import('../../db/redis.js')['default'];
let fixtureWorker = false;
let now = 0,
  executionNow = 0;
let intercept:
  | ((sql: string, run: () => Promise<unknown>, connection: Connection) => Promise<unknown>)
  | undefined;
const children: Array<{ child: ChildProcess; exited: Promise<void> }> = [];
const fixturePath = path.join(directory, 'delayed-archive-worker.mjs');
const launch = (modulePath: string | URL, args: string[], options: ForkOptions) => {
  const child = realFork(fixtureWorker ? fixturePath : modulePath, args, options);
  children.push({
    child,
    exited: new Promise<void>((resolve) => child.once('exit', () => resolve())),
  });
  return child;
};
const fork = jest.fn(launch);
jest.unstable_mockModule('node:child_process', () => ({ ...childProcesses, fork }));
function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((yes) => {
      resolve = yes;
    }),
    resolve,
  };
}
async function archive(id = 1, status = 'completed', filename = `duris-mud-native-${id}.zip`) {
  await root.execute(
    "INSERT INTO mud_backups(id,filename,status,created_by,ip_address) VALUES (?,?,?,'SyntheticOperator','unused')",
    [id, filename, status],
  );
  fs.writeFileSync(path.join(directory, filename), 'synthetic archive data');
  return filename;
}
async function count(table: 'mud_backups' | 'web_data_holds') {
  return Number(
    (await root.execute<RowDataPacket[]>(`SELECT COUNT(*) AS count FROM ${table}`))[0][0].count,
  );
}
function hold(scope: DataHoldScope = { kind: 'global' }, id = randomUUID()) {
  return holds.createDataHold('SyntheticOperator', {
    id,
    scope,
    reason: 'Synthetic preservation review',
    reviewAtEpoch: now + 10,
    expiresAtEpoch: null,
  });
}
async function receipts() {
  const [rows] = await root.execute<RowDataPacket[]>(
    'SELECT setting_value FROM web_settings WHERE setting_key LIKE ? AND setting_key<>?',
    [ARCHIVE_REMOVAL_PREFIX + '%', ARCHIVE_REMOVAL_STATE_KEY],
  );
  return rows.map((row) => parseArchiveRemovalRecord(JSON.parse(String(row.setting_value))));
}
async function waitForPause(paused: Promise<void>, running: Promise<unknown>) {
  await Promise.race([
    paused,
    running.then(() => {
      throw new Error('Expected fixture pause');
    }),
  ]);
}

(port ? describe : describe.skip)(
  'managed archive hold admission on a disposable full schema',
  () => {
    beforeAll(async () => {
      if (
        fs.readFileSync(path.join(directory, '.archive-qualification-owner'), 'utf8') !== database
      )
        throw new Error('The archive fixture directory is not owned by this qualification');
      root = await realConnect({
        host: '127.0.0.1',
        port,
        user: 'root',
        database,
        dateStrings: true,
      });
      backup = await import('../backupService.js');
      holds = await import('../dataHoldService.js');
      removal = await import('../managedArchiveRemoval.js');
      pool = (await import('../../db/connection.js')).pool;
      cache = (await import('../../db/redis.js')).default;
      if ((await cache.get('retention-execution-fixture-owner')) !== database)
        throw new Error('Archive qualification cache ownership is unverified');
      const identityPath = new URL('../../utils/archiveWorkerIdentity.ts', import.meta.url).href;
      fs.writeFileSync(
        fixturePath,
        `
import {unlink} from 'node:fs/promises';
import {captureArchiveWorker} from ${JSON.stringify(identityPath)};
const timer=setTimeout(()=>process.exit(2),5000);
process.once('disconnect',()=>process.exit(2));
process.once('message',message=>{
  if(message.root!==${JSON.stringify(directory)}||!/^duris-mud-native-[0-9]+\\.zip$/.test(message.filename))process.exit(2);
  process.send({format:1,type:'result',operationId:message.operationId,outcome:'removed'});
  process.once('message',async()=>{await unlink(message.root+'/'+message.filename);clearTimeout(timer);process.exit(0);});
});
process.send({format:1,type:'ready',worker:await captureArchiveWorker(process.pid)});
`,
      );
    });
    beforeEach(async () => {
      fork.mockImplementation(launch);
      fixtureWorker = false;
      intercept = undefined;
      jest.clearAllMocks();
      await root.execute('DELETE FROM mud_backups');
      await root.execute('DELETE FROM web_data_holds');
      await root.execute('DELETE FROM web_settings WHERE setting_key LIKE ? OR setting_key=?', [
        ARCHIVE_REMOVAL_PREFIX + '%',
        RETENTION_CONTROL_KEY,
      ]);
      for (const name of fs.readdirSync(directory))
        if (name.endsWith('.zip')) fs.unlinkSync(path.join(directory, name));
      now = Number(
        (await root.execute<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch'))[0][0].epoch,
      );
      executionNow = now;
      jest.spyOn(mysql, 'createConnection').mockImplementation(async (config) => {
        const connection = await realConnect(config);
        await connection.query('SET timestamp=?', [executionNow]);
        return new Proxy(connection, {
          get(target, key) {
            const value: unknown = Reflect.get(target, key, target);
            if (['execute', 'query'].includes(String(key)) && typeof value === 'function')
              return (...args: unknown[]) => {
                const first = args[0];
                const sql =
                  typeof first === 'string'
                    ? first
                    : first && typeof first === 'object' && 'sql' in first
                      ? String(first.sql)
                      : '';
                const run = async () => Reflect.apply(value, target, args);
                return intercept ? intercept(sql, run, target) : run();
              };
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      });
    });
    afterEach(async () => {
      const pending = children.splice(0);
      for (const entry of pending) {
        if (entry.child.connected) entry.child.disconnect();
        await entry.exited;
      }
      intercept = undefined;
      jest.restoreAllMocks();
    });
    afterAll(async () => {
      await root?.end();
      await pool?.end();
      cache?.disconnect();
    });

    it('preserves every active hold scope acquired after a candidate was observed, then permits released protection', async () => {
      const scopes: DataHoldScope[] = [
        { kind: 'global' },
        { kind: 'class', classId: 'analytics_events' },
        { kind: 'account', accountName: 'SyntheticAlpha' },
        { kind: 'account_class', accountName: 'SyntheticAlpha', classId: 'login_history' },
      ];
      for (const [index, scope] of scopes.entries()) {
        const id = index + 1;
        const filename = await archive(id);
        expect((await backup.getBackupList()).some((row) => row.id === id)).toBe(true);
        const kept = await hold(scope);
        await expect(backup.deleteBackup(id)).rejects.toMatchObject({ reason: 'archive_held' });
        expect(fs.existsSync(path.join(directory, filename))).toBe(true);
        expect(fork).not.toHaveBeenCalled();
        await holds.releaseDataHold('SyntheticOperator', kept.id, {
          reason: 'Synthetic review completed',
        });
        expect(await backup.deleteBackup(id)).toBe(true);
        expect(fs.existsSync(path.join(directory, filename))).toBe(false);
        fork.mockClear();
      }
      expect(await count('mud_backups')).toBe(0);
      expect(await backup.deleteBackup(99)).toBe(false);
      expect((await receipts()).every((record) => record.phase === 'complete')).toBe(true);
    });
    it('uses database expiry while retaining expired hold history', async () => {
      await archive();
      await holds.createDataHold('SyntheticOperator', {
        id: randomUUID(),
        scope: { kind: 'global' },
        reason: 'Synthetic finite review',
        reviewAtEpoch: now + 10,
        expiresAtEpoch: now + 20,
      });
      executionNow = now + 21;
      expect(await backup.deleteBackup(1)).toBe(true);
      expect(await count('web_data_holds')).toBe(1);
    });
    it('lets an acknowledged hold cancel prepared work before any worker can receive unlink authorization', async () => {
      const filename = await archive();
      const prepared = deferred(),
        resume = deferred();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 2) {
          prepared.resolve();
          await resume.promise;
        }
        return result;
      };
      const running = backup.deleteBackup(1);
      await waitForPause(prepared.promise, running);
      try {
        expect((await hold()).status).toBe('active');
      } finally {
        resume.resolve();
      }
      await expect(running).rejects.toMatchObject({ reason: 'removal_in_progress' });
      expect(fs.existsSync(path.join(directory, filename))).toBe(true);
      expect((await receipts())[0].outcome).toBe('prepared_cancelled');
    });
    it('does not acknowledge a hold on an early worker success message while the unlink can still occur', async () => {
      const filename = await archive();
      fixtureWorker = true;
      const replied = deferred();
      const original = fork.getMockImplementation();
      if (!original) throw new Error('Missing fixture fork');
      fork.mockImplementation((file, args, options) => {
        const child = original(file, args, options);
        child.on('message', (value: unknown) => {
          if (value && typeof value === 'object' && 'type' in value && value.type === 'result')
            replied.resolve();
        });
        return child;
      });
      const running = backup.deleteBackup(1);
      await waitForPause(replied.promise, running);
      const holdId = randomUUID();
      try {
        await expect(hold({ kind: 'global' }, holdId)).rejects.toMatchObject({
          reason: 'archive_cleanup_in_progress',
          status: 409,
        });
        expect(await count('web_data_holds')).toBe(0);
        expect(fs.existsSync(path.join(directory, filename))).toBe(true);
      } finally {
        children.at(-1)?.child.send({ finish: true });
      }
      expect(await running).toBe(true);
      expect((await hold({ kind: 'global' }, holdId)).status).toBe('active');
      expect(fs.existsSync(path.join(directory, filename))).toBe(false);
    });
    it('retains a replaced archive and retries its failed removal without losing metadata', async () => {
      const filename = await archive();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 3)
          fs.writeFileSync(path.join(directory, filename), 'changed synthetic archive identity');
        return result;
      };
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({
        reason: 'file_removal_unconfirmed',
      });
      expect(await count('mud_backups')).toBe(1);
      expect(fs.readFileSync(path.join(directory, filename), 'utf8')).toBe(
        'changed synthetic archive identity',
      );
      intercept = undefined;
      expect(await backup.deleteBackup(1)).toBe(true);
      expect((await receipts()).map((record) => record.phase).sort()).toEqual([
        'complete',
        'failed',
      ]);
    });
    it('keeps missing-file SQL failure retryable and fences interrupted work before acknowledging protection', async () => {
      const filename = await archive();
      let failed = false;
      intercept = async (sql, run) => {
        if (!failed && sql.startsWith('DELETE FROM mud_backups')) {
          failed = true;
          throw new Error('private-sql-password-sentinel');
        }
        return run();
      };
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
      expect(fs.existsSync(path.join(directory, filename))).toBe(false);
      expect(await count('mud_backups')).toBe(1);
      intercept = undefined;
      const kept = await hold();
      expect(kept.status).toBe('active');
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'archive_held' });
      expect(await count('mud_backups')).toBe(1);
      expect((await receipts())[0].outcome).toBe('interrupted_fenced');
      await holds.releaseDataHold('SyntheticOperator', kept.id, {
        reason: 'Synthetic missing-file review completed',
      });
      expect(await backup.deleteBackup(1)).toBe(true);
      expect(await count('mud_backups')).toBe(0);
      expect((await receipts()).map((record) => record.outcome).sort()).toEqual([
        'absent',
        'interrupted_fenced',
      ]);
    });
    it('does not authorize unlink after an arming commit acknowledgement is lost', async () => {
      const filename = await archive();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 3) throw new Error('private-commit-sentinel');
        return result;
      };
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
      await Promise.all(children.map((entry) => entry.exited));
      intercept = undefined;
      expect((await hold()).status).toBe('active');
      expect(fs.existsSync(path.join(directory, filename))).toBe(true);
    });
    it('does not repeat a committed removal when the final acknowledgement is lost', async () => {
      await archive();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 4) throw new Error('private-final-commit-sentinel');
        return result;
      };
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
      intercept = undefined;
      const workers = fork.mock.calls.length;
      expect(await backup.deleteBackup(1)).toBe(false);
      expect(fork).toHaveBeenCalledTimes(workers);
      expect((await receipts())[0].phase).toBe('complete');
    });
    it('stops a failed-backup batch on worker refusal and retries the retained files', async () => {
      for (let id = 1; id <= 3; id++) await archive(id, 'failed');
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 7)
          fs.writeFileSync(
            path.join(directory, 'duris-mud-native-2.zip'),
            'changed second archive',
          );
        return result;
      };
      await expect(backup.deleteFailedBackups()).rejects.toMatchObject({
        reason: 'file_removal_unconfirmed',
      });
      expect(await count('mud_backups')).toBe(2);
      expect(fs.existsSync(path.join(directory, 'duris-mud-native-1.zip'))).toBe(false);
      expect(fs.existsSync(path.join(directory, 'duris-mud-native-3.zip'))).toBe(true);
      intercept = undefined;
      expect(await backup.deleteFailedBackups()).toBe(2);
      expect(await count('mud_backups')).toBe(0);
    });
    it('rechecks an acknowledged hold between failed-backup batch entries', async () => {
      for (let id = 1; id <= 3; id++) await archive(id, 'failed');
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 4) await hold();
        return result;
      };
      await expect(backup.deleteFailedBackups()).rejects.toMatchObject({ reason: 'archive_held' });
      expect(await count('mud_backups')).toBe(2);
      expect(fs.existsSync(path.join(directory, 'duris-mud-native-2.zip'))).toBe(true);
      expect(fs.existsSync(path.join(directory, 'duris-mud-native-3.zip'))).toBe(true);
    });
    it('keeps a new completed archive when existing count pruning is blocked by a hold', async () => {
      for (let id = 1; id <= 6; id++) await archive(id);
      await hold();
      const { default: logger } = await import('../../utils/logger.js');
      let finish!: (value: 'complete' | 'failed') => void;
      const finished = new Promise<'complete' | 'failed'>((resolve) => {
        finish = resolve;
      });
      jest.spyOn(logger, 'info').mockImplementation((message) => {
        if (String(message).includes('completed successfully')) finish('complete');
        return logger;
      });
      const errors = jest.spyOn(logger, 'error').mockImplementation((message) => {
        if (/^Backup [0-9]+ failed/.test(String(message))) finish('failed');
        return logger;
      });
      const fresh = await backup.createBackup('SyntheticOperator', 'unused');
      expect(await finished).toBe('complete');
      expect((await backup.getBackupById(fresh.id))?.status).toBe('completed');
      expect(await count('mud_backups')).toBe(7);
      expect(fs.existsSync(path.join(directory, fresh.filename))).toBe(true);
      expect(errors.mock.calls).toContainEqual([
        '[Backup] Earlier archive cleanup stopped',
        expect.objectContaining({ reason: 'archive_held' }),
      ]);
      expect(fork).not.toHaveBeenCalled();
    });
    it('retains a failed partial ZIP and routes its later removal through active hold protection', async () => {
      const kept = await hold();
      const { default: logger } = await import('../../utils/logger.js');
      jest.spyOn(logger, 'error').mockReturnValue(logger);
      const stat = fs.promises.stat.bind(fs.promises);
      let failed = false;
      jest.spyOn(fs.promises, 'stat').mockImplementation(async (...args) => {
        if (!failed && String(args[0]).endsWith('.zip')) {
          failed = true;
          throw new Error('Synthetic finalization failure');
        }
        return stat(...args);
      });
      let finished!: () => void;
      let backupId = 0;
      const cleanup = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const unlink = fs.promises.unlink.bind(fs.promises);
      jest.spyOn(fs.promises, 'unlink').mockImplementation(async (file) => {
        try {
          return await unlink(file);
        } finally {
          if (String(file).endsWith(`temp_${backupId}.sql`)) finished();
        }
      });
      const fresh = await backup.createBackup('SyntheticOperator', 'unused');
      backupId = fresh.id;
      await cleanup;
      expect((await backup.getBackupById(fresh.id))?.status).toBe('failed');
      expect(fs.existsSync(path.join(directory, fresh.filename))).toBe(true);
      await expect(backup.deleteBackup(fresh.id)).rejects.toMatchObject({ reason: 'archive_held' });
      await holds.releaseDataHold('SyntheticOperator', kept.id, {
        reason: 'Synthetic partial review finished',
      });
      expect(await backup.deleteBackup(fresh.id)).toBe(true);
      expect(fs.existsSync(path.join(directory, fresh.filename))).toBe(false);
    });
    it('refuses unfinished/shared/unsafe archive identities before spawning', async () => {
      for (const id of [0, -1, 1.5, Number.NaN])
        await expect(backup.deleteBackup(id)).rejects.toMatchObject({ reason: 'invalid_archive' });
      await archive(1, 'in_progress');
      await archive(2, 'failed', 'duris-mud-shared.zip');
      await root.execute(
        "INSERT INTO mud_backups(id,filename,status,created_by,ip_address) VALUES (3,'duris-mud-shared.zip','completed','SyntheticOperator','unused'),(4,'../outside.zip','failed','SyntheticOperator','unused')",
      );
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'archive_in_progress' });
      await expect(backup.deleteBackup(2)).rejects.toMatchObject({ reason: 'shared_archive' });
      await expect(backup.deleteBackup(4)).rejects.toMatchObject({ reason: 'invalid_archive' });
      expect(fork).not.toHaveBeenCalled();
      expect(await count('mud_backups')).toBe(4);
    });
    it('keeps malformed or excessive hold protection and malformed admission fail closed', async () => {
      const filename = await archive();
      const kept = await hold({ kind: 'class', classId: 'analytics_events' });
      await root.execute('UPDATE web_data_holds SET class_id=? WHERE id=?', [
        'unknown_fixture_class',
        kept.id,
      ]);
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
      expect(fork).not.toHaveBeenCalled();
      await root.execute('DELETE FROM web_data_holds');
      const values = Array.from({ length: 1001 }, () => [
        randomUUID(),
        'global',
        'Synthetic review',
        'SyntheticOperator',
        now + 3600,
      ]).flat();
      await root.execute(
        `INSERT INTO web_data_holds(id,scope_type,reason,created_by,review_at_epoch) VALUES ${Array(1001).fill('(?,?,?,?,?)').join(',')}`,
        values,
      );
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
      expect(await count('web_data_holds')).toBe(1001);
      expect(fork).not.toHaveBeenCalled();
      await root.execute('DELETE FROM web_data_holds');
      await root.execute(
        'INSERT INTO web_settings(setting_key,setting_value,description,updated_by) VALUES (?,?,?,NULL)',
        [
          ARCHIVE_REMOVAL_STATE_KEY,
          JSON.stringify({ format: 1, activeOperation: randomUUID() }),
          'archive removal v1',
        ],
      );
      await expect(hold()).rejects.toMatchObject({
        reason: 'archive_recovery_unverified',
        status: 409,
      });
      await expect(backup.deleteBackup(1)).rejects.toMatchObject({ reason: 'recovery_unverified' });
      expect(await count('web_data_holds')).toBe(0);
      expect(fs.existsSync(path.join(directory, filename))).toBe(true);
    });
    it('refuses an unknown process domain and recovers fenced armed intent in a fresh process', async () => {
      const filename = await archive();
      const armed = deferred(),
        resume = deferred();
      let commits = 0;
      intercept = async (sql, run) => {
        const result = await run();
        if (sql === 'COMMIT' && ++commits === 3) {
          armed.resolve();
          await resume.promise;
        }
        return result;
      };
      const running = backup.deleteBackup(1);
      await waitForPause(armed.promise, running);
      const original = (await receipts())[0];
      if (!original.worker) throw new Error('Fixture did not arm a worker');
      const key = ARCHIVE_REMOVAL_PREFIX + original.operationId;
      try {
        await root.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
          JSON.stringify({
            ...original,
            worker: { ...original.worker, domainSha256: '0'.repeat(64) },
          }),
          key,
        ]);
        await expect(removal.recoverManagedArchiveRemoval()).rejects.toMatchObject({
          reason: 'recovery_unverified',
        });
        await expect(hold()).rejects.toMatchObject({
          reason: 'archive_recovery_unverified',
          status: 409,
        });
        expect(await count('web_data_holds')).toBe(0);
        await root.execute('UPDATE web_settings SET setting_value=? WHERE setting_key=?', [
          JSON.stringify(original),
          key,
        ]);
        children.at(-1)?.child.disconnect();
        await Promise.all(children.map((entry) => entry.exited));
        const moduleUrl = new URL('../managedArchiveRemoval.ts', import.meta.url).href;
        const child = spawnSync(
          process.execPath,
          [
            '--import',
            fileURLToPath(new URL('../../../node_modules/tsx/dist/loader.mjs', import.meta.url)),
            '--input-type=module',
            '-e',
            `if(process.env.DB_NAME!=='durisweb_qualification_archive_removal_suite')process.exit(3);const {recoverManagedArchiveRemoval}=await import(${JSON.stringify(moduleUrl)});try{await recoverManagedArchiveRemoval();process.stdout.write('recovered');}catch{process.exitCode=1;}`,
          ],
          { env: process.env, encoding: 'utf8', timeout: 15000 },
        );
        expect(child.status).toBe(0);
        expect(child.stdout).toContain('recovered');
        expect((await hold()).status).toBe('active');
      } finally {
        resume.resolve();
      }
      await expect(running).rejects.toBeDefined();
      expect(fs.existsSync(path.join(directory, filename))).toBe(true);
      expect((await receipts())[0].outcome).toBe('interrupted_fenced');
    });
    it('refuses incoming references from a separate schema owned by another principal', async () => {
      const filename = await archive();
      const other = `durisweb_archive_foreign_${process.pid}`;
      let created = false;
      try {
        await root.query(`CREATE DATABASE ${other}`);
        created = true;
        await root.query(
          `CREATE TABLE ${other}.archive_fixture_child(id INT PRIMARY KEY,backup_id INT UNSIGNED,FOREIGN KEY(backup_id) REFERENCES ${database}.mud_backups(id) ON DELETE CASCADE) ENGINE=InnoDB`,
        );
        await root.execute(`INSERT INTO ${other}.archive_fixture_child VALUES(1,1)`);
        const [filtered] = await pool.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='mud_backups'",
        );
        expect(Number(filtered[0].count)).toBe(0);
        await expect(backup.deleteBackup(1)).rejects.toMatchObject({
          reason: 'recovery_unverified',
        });
        expect(await count('mud_backups')).toBe(1);
        expect(await receipts()).toHaveLength(0);
        expect(fork).not.toHaveBeenCalled();
        expect(fs.existsSync(path.join(directory, filename))).toBe(true);
        expect(
          Number(
            (
              await root.execute<RowDataPacket[]>(
                `SELECT COUNT(*) AS count FROM ${other}.archive_fixture_child`,
              )
            )[0][0].count,
          ),
        ).toBe(1);
      } finally {
        if (created) await root.query(`DROP DATABASE ${other}`);
      }
    });
    it('refuses schema/trigger/incoming-reference drift and keeps held or pending journal data private', async () => {
      const filename = await archive();
      await root.query('ALTER TABLE mud_backups ADD COLUMN archive_fixture_drift INT NULL');
      try {
        await expect(backup.deleteBackup(1)).rejects.toMatchObject({
          reason: 'recovery_unverified',
        });
      } finally {
        await root.query('ALTER TABLE mud_backups DROP COLUMN archive_fixture_drift');
      }
      await root.query(
        'CREATE TRIGGER archive_fixture_trigger BEFORE DELETE ON mud_backups FOR EACH ROW SET @archive_fixture_trigger=1',
      );
      try {
        await expect(backup.deleteBackup(1)).rejects.toMatchObject({
          reason: 'recovery_unverified',
        });
      } finally {
        await root.query('DROP TRIGGER archive_fixture_trigger');
      }
      await root.query(
        'CREATE TABLE archive_fixture_child(id INT PRIMARY KEY,backup_id INT UNSIGNED,FOREIGN KEY(backup_id) REFERENCES mud_backups(id) ON DELETE CASCADE) ENGINE=InnoDB',
      );
      try {
        await expect(backup.deleteBackup(1)).rejects.toMatchObject({
          reason: 'recovery_unverified',
        });
      } finally {
        await root.query('DROP TABLE archive_fixture_child');
      }
      expect(fs.existsSync(path.join(directory, filename))).toBe(true);
      expect(fork).not.toHaveBeenCalled();
      expect(await backup.deleteBackup(1)).toBe(true);
      const settings = await import('../webSettingsService.js');
      const operation = (await receipts())[0];
      expect(
        await settings.getWebSetting(ARCHIVE_REMOVAL_PREFIX + operation.operationId),
      ).toBeNull();
      expect(
        await settings.getWebSetting('Árchive-removal-v1:' + operation.operationId),
      ).toBeNull();
      expect(
        (await settings.getWebSettingsRaw()).some((row) =>
          row.setting_key.startsWith(ARCHIVE_REMOVAL_PREFIX),
        ),
      ).toBe(false);
    });
  },
);

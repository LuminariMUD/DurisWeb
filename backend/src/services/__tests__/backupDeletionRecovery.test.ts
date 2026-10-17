import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { loadWebBaselineBundle } from '../../db/webBaselineBundle.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-delete-recovery-'));
const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const rows = new Map<number, Record<string, unknown>>();
const configuration = {
  mud: { directory },
  backupDirectory: directory,
  mudDatabase: {
    connection: {
      host: '127.0.0.1',
      port: 23436,
      user: 'root',
      password: '',
      database: 'unselected_fixture',
    },
  },
};
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute },
  mudPool: { execute },
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => configuration,
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const service = await import('../backupService.js');
let failDelete = false;
function archive(id: number, status = 'failed', filename = `duris-mud-test-${id}.zip`) {
  rows.set(id, { id, filename, status, progress: 100, backup_type: 'manual' });
  fs.writeFileSync(path.join(directory, filename), 'synthetic archive');
}
beforeEach(() => {
  jest.clearAllMocks();
  rows.clear();
  failDelete = false;
  execute.mockReset();
  execute.mockImplementation(async (sql, values) => {
    if (typeof sql !== 'string') throw new Error('Unexpected query');
    const args = Array.isArray(values) ? values : [];
    if (sql.startsWith('SELECT * FROM mud_backups WHERE id'))
      return [[...(rows.has(Number(args[0])) ? [rows.get(Number(args[0]))] : [])]];
    if (sql.startsWith('SELECT COUNT(*)'))
      return [[{ count: [...rows.values()].filter((row) => row.filename === args[0]).length }]];
    if (sql.startsWith('DELETE FROM mud_backups')) {
      if (failDelete) throw new Error('private-driver-path-password-sentinel');
      const row = rows.get(Number(args[0]));
      if (row && row.filename === args[1] && ['completed', 'failed'].includes(String(row.status))) {
        rows.delete(Number(args[0]));
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    if (sql.startsWith('SELECT id FROM mud_backups'))
      return [[...rows.values()].filter((row) => row.status === 'failed')];
    if (sql.startsWith('UPDATE mud_backups')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT * FROM mud_backups ORDER BY')) return [[...rows.values()]];
    throw new Error('Unexpected query');
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
});
afterAll(() => fs.rmdirSync(directory));

describe('backup file deletion recovery', () => {
  const ports = (process.env.TEST_BACKUP_DB_PORTS ?? '').split(',').filter(Boolean).map(Number);
  if (ports.some((port) => ![23436, 23437].includes(port)))
    throw new Error('Backup removal qualification requires dedicated disposable ports');
  for (const port of ports)
    it(`retains actual SQL/file identities and retries deletion on disposable port ${port}`, async () => {
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        dateStrings: true,
      });
      const database = `durisweb_backup_removal_${process.pid}`;
      let created = false;
      try {
        await connection.query(
          `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        created = true;
        await connection.changeUser({ database });
        const table = loadWebBaselineBundle().tables.find((item) => item.name === 'mud_backups');
        if (!table) throw new Error('Missing canonical backup table');
        await connection.query(table.sql);
        let rejectCheckpoint = false;
        execute.mockImplementation(async (sql, values) => {
          if (typeof sql !== 'string') throw new Error('Expected literal query');
          if (rejectCheckpoint && sql.startsWith('DELETE FROM mud_backups'))
            throw new Error('private-checkpoint-sentinel');
          return connection.execute(sql, Array.isArray(values) ? values : []);
        });
        const filename = 'duris-mud-native.zip';
        await connection.execute(
          "INSERT INTO mud_backups(id,filename,status,created_by,ip_address) VALUES (1,?,'failed','SyntheticOperator','unused')",
          [filename],
        );
        fs.writeFileSync(path.join(directory, filename), 'synthetic archive');
        jest
          .spyOn(fs.promises, 'unlink')
          .mockRejectedValueOnce(
            Object.assign(new Error('private-file-sentinel'), { code: 'EACCES' }),
          );
        await expect(service.deleteBackup(1)).rejects.toMatchObject({
          reason: 'file_removal_unconfirmed',
        });
        const count = async () => {
          const [result] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) AS count FROM mud_backups',
          );
          return Number(result[0].count);
        };
        expect(await count()).toBe(1);
        expect(fs.existsSync(path.join(directory, filename))).toBe(true);
        rejectCheckpoint = true;
        await expect(service.deleteBackup(1)).rejects.toMatchObject({
          reason: 'storage_unavailable',
        });
        expect(await count()).toBe(1);
        expect(fs.existsSync(path.join(directory, filename))).toBe(false);
        rejectCheckpoint = false;
        expect(await service.deleteBackup(1)).toBe(true);
        expect(await count()).toBe(0);
        await connection.execute(
          "INSERT INTO mud_backups(id,filename,status,created_by,ip_address) VALUES (2,?,'failed','SyntheticOperator','unused'),(3,?,'completed','SyntheticOperator','unused')",
          [filename, filename],
        );
        fs.writeFileSync(path.join(directory, filename), 'shared legacy archive');
        await expect(service.deleteBackup(2)).rejects.toMatchObject({ reason: 'shared_archive' });
        expect(await count()).toBe(2);
        expect(fs.existsSync(path.join(directory, filename))).toBe(true);

        // Exercise the actual asynchronous backup writer and ZIP after a known older-cleanup refusal.
        await connection.execute("UPDATE mud_backups SET started_at='2000-01-01' WHERE id=3");
        for (let id = 4; id <= 7; id++)
          await connection.execute(
            "INSERT INTO mud_backups(id,filename,status,created_by,ip_address,started_at) VALUES (?,?,'completed','SyntheticOperator','unused','2001-01-01')",
            [id, `duris-mud-native-${id}.zip`],
          );
        Object.assign(configuration.mudDatabase.connection, { port, database });
        const { default: logger } = await import('../../utils/logger.js');
        let finished!: () => void;
        const completion = new Promise<void>((resolve) => {
          finished = resolve;
        });
        jest.mocked(logger.info).mockImplementation((message) => {
          if (String(message).includes('completed successfully')) finished();
          return logger;
        });
        const fresh = await service.createBackup('SyntheticOperator', 'unused');
        await completion;
        const [written] = await connection.execute<RowDataPacket[]>(
          'SELECT status FROM mud_backups WHERE id=?',
          [fresh.id],
        );
        expect(written[0].status).toBe('completed');
        expect(fs.existsSync(path.join(directory, fresh.filename))).toBe(true);
        expect(jest.mocked(logger.error)).toHaveBeenCalledWith(
          '[Backup] Earlier archive cleanup stopped',
          expect.objectContaining({ reason: 'shared_archive' }),
        );
        const [retained] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM mud_backups WHERE id IN (2,3)',
        );
        expect(retained).toHaveLength(2);
      } finally {
        if (created) await connection.query(`DROP DATABASE ${database}`);
        await connection.end();
      }
    });

  it('rejects invalid record IDs before storage access', async () => {
    for (const id of [0, -1, 1.5, Number.NaN])
      await expect(service.deleteBackup(id)).rejects.toMatchObject({ reason: 'invalid_archive' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('removes a record only after confirmed unlink and treats a missing record as not found', async () => {
    archive(1);
    expect(await service.deleteBackup(1)).toBe(true);
    expect(fs.existsSync(path.join(directory, 'duris-mud-test-1.zip'))).toBe(false);
    expect(rows.has(1)).toBe(false);
    expect(await service.deleteBackup(1)).toBe(false);
  });
  it('retains the archive and record on unlink failure without exposing driver details', async () => {
    archive(1);
    jest
      .spyOn(fs.promises, 'unlink')
      .mockRejectedValueOnce(
        Object.assign(new Error('private-filesystem-path-sentinel'), { code: 'EACCES' }),
      );
    await expect(service.deleteBackup(1)).rejects.toMatchObject({
      reason: 'file_removal_unconfirmed',
    });
    expect(rows.has(1)).toBe(true);
    expect(fs.existsSync(path.join(directory, 'duris-mud-test-1.zip'))).toBe(true);
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('keeps identity after SQL failure and retries safely after the file is already absent', async () => {
    archive(1);
    failDelete = true;
    await expect(service.deleteBackup(1)).rejects.toMatchObject({ reason: 'storage_unavailable' });
    expect(rows.has(1)).toBe(true);
    expect(fs.existsSync(path.join(directory, 'duris-mud-test-1.zip'))).toBe(false);
    failDelete = false;
    expect(await service.deleteBackup(1)).toBe(true);
    expect(rows.has(1)).toBe(false);
  });
  it('refuses active, unsafe and shared filenames before unlinking any archive', async () => {
    archive(1, 'in_progress');
    archive(2, 'failed', 'duris-mud-shared.zip');
    rows.set(3, { id: 3, filename: 'duris-mud-shared.zip', status: 'completed' });
    rows.set(4, { id: 4, filename: '../outside-sentinel.zip', status: 'failed' });
    const unlink = jest.spyOn(fs.promises, 'unlink');
    for (const [id, reason] of [
      [1, 'archive_in_progress'],
      [2, 'shared_archive'],
      [4, 'invalid_archive'],
    ] as const)
      await expect(service.deleteBackup(id)).rejects.toMatchObject({ reason });
    expect(unlink).not.toHaveBeenCalled();
    expect(rows.size).toBe(4);
  });
  it('stops a failed-backup batch on unconfirmed removal and retains later work for retry', async () => {
    archive(1);
    archive(2);
    archive(3);
    const unlink = fs.promises.unlink.bind(fs.promises);
    jest.spyOn(fs.promises, 'unlink').mockImplementation(async (file) => {
      if (String(file).endsWith('test-2.zip'))
        throw Object.assign(new Error('private-file-sentinel'), { code: 'EACCES' });
      return unlink(file);
    });
    await expect(service.deleteFailedBackups()).rejects.toMatchObject({
      reason: 'file_removal_unconfirmed',
    });
    expect([...rows.keys()]).toEqual([2, 3]);
    jest.restoreAllMocks();
    expect(await service.deleteFailedBackups()).toBe(2);
    expect(rows.size).toBe(0);
  });
  it('keeps missing-file identities during listing', async () => {
    rows.set(1, { id: 1, filename: 'duris-mud-missing.zip', status: 'completed' });
    expect((await service.getBackupList()).map((row) => row.id)).toEqual([1]);
    expect(rows.has(1)).toBe(true);
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('does not declare an older writer stopped merely because a list was requested', async () => {
    rows.set(1, {
      id: 1,
      filename: 'duris-mud-running.zip',
      status: 'in_progress',
      started_at: '2000-01-01',
    });
    expect((await service.getBackupList())[0].status).toBe('in_progress');
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });
  it('uses distinct safe filenames for simultaneous manual backups', async () => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-17T01:00:00.000Z');
    let nextId = 1;
    execute.mockImplementation(async (sql) => {
      if (String(sql).startsWith('INSERT INTO mud_backups')) return [{ insertId: nextId++ }];
      // Stop the unneeded asynchronous writer before any dump or archive work.
      return new Promise(() => {});
    });
    const first = await service.createBackup('Operator', 'unused');
    const second = await service.createBackup('Operator', 'unused');
    expect(first.filename).not.toBe(second.filename);
    expect(first.filename).toMatch(/^duris-mud-[A-Za-z0-9-]+\.zip$/);
    expect(second.filename).toMatch(/^duris-mud-[A-Za-z0-9-]+\.zip$/);
  });
});

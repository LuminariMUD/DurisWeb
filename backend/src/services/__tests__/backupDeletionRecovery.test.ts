import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// File/SQL removal cases now exercise the actual barrier and worker in managedArchiveRemovalNative.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-backup-records-'));
const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute },
  mudPool: { execute },
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({ mud: { directory }, backupDirectory: directory }),
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const service = await import('../backupService.js');
beforeEach(() => {
  execute.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(() => fs.rmdirSync(directory));

describe('backup identity preservation', () => {
  it('retains missing-file identities during listing', async () => {
    execute.mockResolvedValueOnce([
      [{ id: 1, filename: 'duris-mud-missing.zip', status: 'completed' }],
    ]);
    expect((await service.getBackupList()).map((row) => row.id)).toEqual([1]);
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('does not declare an older writer stopped merely because a list was requested', async () => {
    execute.mockResolvedValueOnce([
      [
        {
          id: 1,
          filename: 'duris-mud-running.zip',
          status: 'in_progress',
          started_at: '2000-01-01',
        },
      ],
    ]);
    expect((await service.getBackupList())[0].status).toBe('in_progress');
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });
  it('uses distinct safe filenames for simultaneous manual backups', async () => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-17T01:00:00.000Z');
    let nextId = 1;
    execute.mockImplementation(async (sql) =>
      String(sql).startsWith('INSERT INTO mud_backups')
        ? [{ insertId: nextId++ }]
        : new Promise(() => {}),
    );
    const first = await service.createBackup('Operator', 'unused');
    const second = await service.createBackup('Operator', 'unused');
    expect(first.filename).not.toBe(second.filename);
    expect(first.filename).toMatch(/^duris-mud-[A-Za-z0-9-]+\.zip$/);
    expect(second.filename).toMatch(/^duris-mud-[A-Za-z0-9-]+\.zip$/);
  });
});

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import unzipper from 'unzipper';
import * as childProcess from 'node:child_process';

const execute = jest.fn();
const query = jest.fn();
const childExec = jest.fn();
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { execute, query },
  mudPool: { execute, query },
}));
jest.unstable_mockModule('child_process', () => ({ ...childProcess, exec: childExec }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({
    mud: { directory: '/unused-synthetic-mud' },
    backupDirectory: '/unused-synthetic-backups',
    unsafeMutations: { databaseRestore: true },
  }),
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({ getWebSettings: jest.fn() }));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const service = await import('../backupService.js');
const { DatabaseRestoreUnavailableError } = await import('../../utils/databaseRestoreGuard.js');
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('legacy restore service refusal', () => {
  it.each(['full', 'account', 'character'] as const)(
    'refuses stored and uploaded %s restores before SQL, filesystem, archive or process work',
    async (restoreType) => {
      const exists = jest.spyOn(fs, 'existsSync');
      const write = jest.spyOn(fs.promises, 'writeFile');
      const unlink = jest.spyOn(fs.promises, 'unlink');
      const archive = jest.spyOn(unzipper.Open, 'file');
      const request = { restoreType, accounts: ['SyntheticSubject'] };
      const stored = service.createRestore({ ...request, backupId: 1 }, 'Operator', 'unused');
      const uploaded = service.createRestoreFromUpload(
        '/private-archive-sentinel',
        request,
        'Operator',
        'unused',
      );
      await expect(stored).rejects.toBeInstanceOf(DatabaseRestoreUnavailableError);
      await expect(uploaded).rejects.toMatchObject({ code: 'restore_unavailable' });
      for (const spy of [execute, query, childExec, exists, write, unlink, archive])
        expect(spy).not.toHaveBeenCalled();
    },
  );
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

const openFile = jest.fn();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
  },
}));
jest.unstable_mockModule('unzipper', () => ({
  default: { Open: { file: openFile } },
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({
  getWebSettings: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn() },
}));

let backupService: typeof import('../backupService.js');
let outsideRoot: string;
let outsideFile: string;

beforeAll(async () => {
  outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't025-backup-service-'));
  outsideFile = path.join(outsideRoot, 'not-upload.zip');
  fs.writeFileSync(outsideFile, 'not a backup');
  backupService = await import('../backupService.js');
});

afterAll(() => {
  fs.rmSync(outsideRoot, { recursive: true, force: true });
});

describe('backup upload path boundary', () => {
  it('does not delete a caller-supplied file outside the upload naming boundary', async () => {
    await backupService.deleteUploadedBackup(outsideFile);
    expect(fs.existsSync(outsideFile)).toBe(true);
  });

  it('rejects an outside upload path before opening it as a ZIP', async () => {
    openFile.mockReset();
    const result = await backupService.validateUploadedBackup(outsideFile);

    expect(result.isValid).toBe(false);
    expect(openFile).not.toHaveBeenCalled();
  });
});

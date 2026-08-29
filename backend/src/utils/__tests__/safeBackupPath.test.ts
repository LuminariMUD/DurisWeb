import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  resolveSafeBackupFilePath,
  resolveSafeUploadedBackupPath,
  UnsafeBackupPathError,
} from '../safeBackupPath.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('safe backup path resolution', () => {
  it('accepts only the expected upload filename beneath the upload root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't025-upload-'));
    tempRoots.push(root);
    const filePath = path.join(root, 'backup-upload-123-456.zip');
    fs.writeFileSync(filePath, 'zip-fixture');

    expect(resolveSafeUploadedBackupPath(filePath, root)).toBe(filePath);
    expect(() => resolveSafeUploadedBackupPath(path.join(root, 'backup-upload-123-456.txt'), root))
      .toThrow(UnsafeBackupPathError);
    expect(() => resolveSafeUploadedBackupPath(path.join(root, '..', 'backup-upload-123-456.zip'), root))
      .toThrow(UnsafeBackupPathError);
  });

  it('rejects symlinked uploads even when the link is inside the root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't025-upload-link-'));
    tempRoots.push(root);
    const linkPath = path.join(root, 'backup-upload-123-456.zip');
    fs.symlinkSync('/etc/passwd', linkPath);

    expect(() => resolveSafeUploadedBackupPath(linkPath, root)).toThrow(UnsafeBackupPathError);
  });

  it('contains database-derived backup filenames beneath the backup root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't025-backup-'));
    tempRoots.push(root);
    const filename = 'duris-mud-2026-08-29-020000.zip';
    const filePath = path.join(root, filename);
    fs.writeFileSync(filePath, 'zip-fixture');

    expect(resolveSafeBackupFilePath(root, filename)).toBe(filePath);
    expect(() => resolveSafeBackupFilePath(root, '../outside.zip')).toThrow(UnsafeBackupPathError);
    expect(() => resolveSafeBackupFilePath(root, 'arbitrary.zip')).toThrow(UnsafeBackupPathError);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { parseLegacyInventoryArguments } from '../legacyBackupInventory.js';

let root: string, backup: string, upload: string, privateRoot: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-legacy-cli-'));
  backup = path.join(root, 'backups');
  upload = path.join(root, 'old-namespace');
  privateRoot = path.join(root, 'protected');
  for (const directory of [backup, upload, privateRoot]) fs.mkdirSync(directory, { mode: 0o700 });
});
afterEach(() => fs.rmSync(root, { recursive: true }));
function run(args: string[], configuredRoot = backup) {
  const environment: NodeJS.ProcessEnv = { ...process.env, BACKUP_DIR: configuredRoot };
  delete environment.DOTENV_CONFIG_QUIET;
  return spawnSync(
    'pnpm',
    [
      '--dir',
      fileURLToPath(new URL('../../../', import.meta.url)),
      '--silent',
      'backup:inventory',
      ...args,
    ],
    {
      env: environment,
      encoding: 'utf8',
      timeout: 15000,
    },
  );
}
describe('legacy backup-copy inventory command', () => {
  it('rejects deletion, relative, repeated, missing and unknown arguments without treating them as scan defaults', () => {
    for (const args of [
      [],
      ['execute'],
      ['--backup-root', 'relative', '--private-out', '/tmp/new'],
      ['--backup-root', backup, '--private-out', '/tmp/new', '--backup-root', backup],
      ['--backup-root', backup, '--private-out'],
      ['--backup-root', backup, '--private-out', '/tmp/new', '--age', '10'],
    ])
      expect(() => parseLegacyInventoryArguments(args)).toThrow();
  });
  it('runs the actual CLI, saves private metadata and prints only aggregate selected-root observations', () => {
    fs.writeFileSync(path.join(backup, 'temp_1.sql'), 'private-content-sentinel');
    fs.writeFileSync(path.join(upload, 'backup-upload-123-456.zip'), 'private-upload-content');
    const output = path.join(privateRoot, 'inventory.json');
    const result = run([
      '--backup-root',
      backup,
      '--legacy-upload-root',
      upload,
      '--private-out',
      output,
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const summary = JSON.parse(result.stdout);
    expect(summary.deletionAdmission).toBe('unavailable');
    expect(summary.writerFenceVerified).toBe(false);
    expect(summary.snapshotConsistent).toBe(false);
    expect(summary.legacyUploadScope).toBe('selected');
    expect(summary.roots.map((item: { copies: number }) => item.copies)).toEqual([1, 1]);
    expect(result.stdout).not.toContain(root);
    expect(result.stdout).not.toContain('private-content-sentinel');
    expect(result.stdout).not.toContain('temp_1.sql');
    expect(fs.statSync(output).mode & 0o777).toBe(0o600);
    const inventory = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(inventory.observationId).toBe(summary.observationId);
    expect(inventory.roots[0].copies[0].name).toBe('temp_1.sql');
  });
  it('refuses a different configured root before inventory output and never overwrites existing evidence', () => {
    const output = path.join(privateRoot, 'inventory.json');
    const wrong = run(['--backup-root', upload, '--private-out', output]);
    expect(wrong.status).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
    expect(wrong.stderr).not.toContain(root);
    fs.writeFileSync(output, 'preserve existing evidence');
    const repeated = run(['--backup-root', backup, '--private-out', output]);
    expect(repeated.status).toBe(1);
    expect(fs.readFileSync(output, 'utf8')).toBe('preserve existing evidence');
  });
  it.each(['symlink', 'proc-root'])(
    'rejects a configured %s alias even when the selected root is canonical',
    (kind) => {
      const alias = path.join(root, 'configured-alias');
      fs.symlinkSync(backup, alias);
      const configured = kind === 'symlink' ? alias : '/proc/self/root' + backup;
      const output = path.join(privateRoot, 'aliased.json');
      const result = run(['--backup-root', backup, '--private-out', output], configured);
      expect(result.status).toBe(1);
      expect(fs.existsSync(output)).toBe(false);
      expect(result.stderr).not.toContain(root);
    },
  );
  it('returns incomplete/review status for an unsafe observation without deleting it', () => {
    fs.symlinkSync('/etc/passwd', path.join(backup, 'temp_1.sql'));
    const result = run([
      '--backup-root',
      backup,
      '--private-out',
      path.join(privateRoot, 'inventory.json'),
    ]);
    expect(result.status).toBe(2);
    const summary = JSON.parse(result.stdout);
    expect(summary.roots[0].unconfirmed).toBe(1);
    expect(summary.legacyUploadScope).toBe('not_selected');
    expect(fs.lstatSync(path.join(backup, 'temp_1.sql')).isSymbolicLink()).toBe(true);
  });
});

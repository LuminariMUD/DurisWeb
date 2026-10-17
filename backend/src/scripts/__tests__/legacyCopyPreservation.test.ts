import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { legacyCopyPhysicalSha256 } from '../../services/legacyBackupInventory.js';
import { parseLegacyPreservationArguments } from '../legacyCopyPreservation.js';

let root: string, backup: string, protectedRoot: string, file: string, id: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.homedir(), '.durisweb-preserve-cli-'));
  backup = path.join(root, 'backup');
  protectedRoot = path.join(root, 'protected');
  for (const directory of [backup, protectedRoot]) fs.mkdirSync(directory, { mode: 0o700 });
  file = path.join(backup, 'temp_1.sql');
  fs.writeFileSync(file, 'private fixture SQL bytes');
  id = randomUUID();
});
afterEach(() => {
  if (
    path.dirname(root) !== os.homedir() ||
    !path.basename(root).startsWith('.durisweb-preserve-cli-')
  )
    throw new Error('Preserve unverified fixture directory');
  fs.rmSync(root, { recursive: true });
});
function args() {
  return [
    'copy',
    '--backup-root',
    backup,
    '--source-name',
    'temp_1.sql',
    '--source-physical-sha256',
    legacyCopyPhysicalSha256(fs.statSync(file, { bigint: true })),
    '--protected-root',
    protectedRoot,
    '--operation-id',
    id,
    '--python-bin',
    '/usr/bin/python3',
    '--max-bytes',
    '1000000',
  ];
}
function run(
  values: string[],
  environment: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_DIR: backup,
    DOTENV_CONFIG_QUIET: 'true',
  },
) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      fileURLToPath(new URL('../../../node_modules/tsx/dist/loader.mjs', import.meta.url)),
      fileURLToPath(new URL('../legacyCopyPreservation.ts', import.meta.url)),
      ...values,
    ],
    { env: environment, encoding: 'utf8', timeout: 15000 },
  );
}
(process.platform === 'linux' ? describe : describe.skip)(
  'explicit operator preservation command',
  () => {
    it('keeps the documented package command quiet without an inherited dotenv setting', () => {
      const environment: NodeJS.ProcessEnv = { ...process.env, BACKUP_DIR: backup };
      delete environment.DOTENV_CONFIG_QUIET;
      const copied = spawnSync(
        'pnpm',
        [
          '--dir',
          fileURLToPath(new URL('../../../', import.meta.url)),
          '--silent',
          'backup:preserve-legacy',
          ...args(),
        ],
        { env: environment, encoding: 'utf8', timeout: 15000 },
      );
      expect(copied.status).toBe(0);
      expect(copied.stderr).toBe('');
      expect(JSON.parse(copied.stdout).copyVerified).toBe(true);
    });
    it('copies through the actual CLI, rejects duplicate work, then verifies in a fresh process with no application environment or original', () => {
      const copied = run(args());
      expect({ status: copied.status, diagnostic: copied.stderr }).toEqual({
        status: 0,
        diagnostic: '',
      });
      const summary = JSON.parse(copied.stdout);
      expect(summary).toMatchObject({
        operationId: id,
        copyVerified: true,
        sourceRemoved: false,
        adoptionAdmission: 'unavailable',
        cohortWriterFenceVerified: false,
      });
      expect(copied.stdout).not.toContain(root);
      expect(copied.stdout).not.toContain('private fixture SQL bytes');
      const duplicate = run(args());
      expect(duplicate.status).toBe(1);
      expect(JSON.parse(duplicate.stderr).reason).toBe('operation_exists');
      fs.unlinkSync(file);
      const verified = run(
        [
          'verify',
          '--protected-root',
          protectedRoot,
          '--operation-id',
          id,
          '--python-bin',
          '/usr/bin/python3',
        ],
        {},
      );
      expect({ status: verified.status, diagnostic: verified.stderr }).toEqual({
        status: 0,
        diagnostic: '',
      });
      expect(JSON.parse(verified.stdout)).toEqual(summary);
    });
    it('reports an active writer with the correct durable reference and retains all failed work', () => {
      const writing = fs.openSync(file, 'r+');
      let response;
      try {
        response = run(args());
      } finally {
        fs.closeSync(writing);
      }
      expect(response.status).toBe(1);
      const failure = JSON.parse(response.stderr);
      expect(failure).toMatchObject({
        reason: 'writer_active',
        reference: id,
        sourceRemoved: false,
      });
      expect(response.stderr).not.toContain(root);
      expect(response.stderr).not.toContain('private fixture SQL bytes');
      const verified = run(
        [
          'verify',
          '--protected-root',
          protectedRoot,
          '--operation-id',
          id,
          '--python-bin',
          '/usr/bin/python3',
        ],
        {},
      );
      expect(verified.status).toBe(1);
      expect(JSON.parse(verified.stderr).reference).toBe(id);
      expect(fs.existsSync(path.join(protectedRoot, 'legacy-preserve-' + id, 'failed.json'))).toBe(
        true,
      );
      expect(fs.readFileSync(file, 'utf8')).toBe('private fixture SQL bytes');
    });
    it('rejects missing, conflicting, traversal and deletion arguments and mismatched configured roots', () => {
      for (const values of [
        [],
        ['execute'],
        ['verify', '--protected-root', protectedRoot, '--operation-id', 'private-sentinel'],
        [...args(), '--delete-source', 'true'],
        [...args(), '--operation-id', randomUUID()],
        args().map((value) => (value === 'temp_1.sql' ? '../temp_1.sql' : value)),
      ])
        expect(() => parseLegacyPreservationArguments(values)).toThrow();
      const response = run(args(), {
        ...process.env,
        BACKUP_DIR: protectedRoot,
        DOTENV_CONFIG_QUIET: 'true',
      });
      expect(response.status).toBe(1);
      expect(fs.readdirSync(protectedRoot)).toEqual([]);
      expect(fs.existsSync(file)).toBe(true);
    });
  },
);

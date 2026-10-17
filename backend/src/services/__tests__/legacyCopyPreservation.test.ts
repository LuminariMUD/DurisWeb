import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  preserveLegacyCopy,
  verifyPreservedLegacyCopy,
  type LegacyCopyPreservationOptions,
} from '../legacyCopyPreservation.js';
import { legacyCopyPhysicalSha256 } from '../legacyBackupInventory.js';

let root: string, backupRoot: string, protectedRoot: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.homedir(), '.durisweb-preservation-fixture-'));
  backupRoot = path.join(root, 'backup');
  protectedRoot = path.join(root, 'protected');
  for (const directory of [backupRoot, protectedRoot]) fs.mkdirSync(directory, { mode: 0o700 });
});
afterEach(() => {
  jest.restoreAllMocks();
  if (
    path.dirname(root) !== os.homedir() ||
    !path.basename(root).startsWith('.durisweb-preservation-fixture-')
  )
    throw new Error('Preserve unverified fixture directory');
  fs.rmSync(root, { recursive: true });
});
function source(name = 'temp_1.sql') {
  const filename = path.join(backupRoot, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, Buffer.from('synthetic private SQL\0\xffbytes'));
  const options: LegacyCopyPreservationOptions = {
    backupRoot,
    sourceName: name,
    sourcePhysicalSha256: legacyCopyPhysicalSha256(fs.statSync(filename, { bigint: true })),
    protectedRoot,
    operationId: randomUUID(),
    pythonBin: '/usr/bin/python3',
    maxBytes: 1024 * 1024,
    timeBudgetMs: 5000,
  };
  return { filename, options };
}
function bundle(id: string) {
  return path.join(protectedRoot, 'legacy-preserve-' + id);
}
(process.platform === 'linux' ? describe : describe.skip)(
  'protected legacy copies and actual descriptor-only lease worker',
  () => {
    it.each(['copy', 'verify'] as const)(
      '%s rechecks bundle names after the asynchronous handshake',
      async (operation) => {
        const value = source();
        if (operation === 'verify') await preserveLegacyCopy(value.options);
        const directory = bundle(value.options.operationId);
        const close = fs.closeSync.bind(fs);
        let receiptCloses = 0,
          changed = false;
        jest.spyOn(fs, 'closeSync').mockImplementation((fd) => {
          const name = fs.readlinkSync('/proc/self/fd/' + fd);
          close(fd);
          if (name === path.join(directory, 'complete.json') && ++receiptCloses === 3)
            queueMicrotask(() => {
              fs.renameSync(directory, directory + '.retained');
              changed = true;
            });
        });
        await expect(
          operation === 'copy'
            ? preserveLegacyCopy(value.options)
            : verifyPreservedLegacyCopy(value.options),
        ).rejects.toBeInstanceOf(Error);
        expect(changed).toBe(true);
        expect(fs.existsSync(value.filename)).toBe(true);
      },
    );
    it('copies exact bytes privately and verifies after source removal without granting adoption', async () => {
      const { filename, options } = source();
      const bytes = fs.readFileSync(filename);
      const result = await preserveLegacyCopy(options);
      expect(result).toMatchObject({
        copyVerified: true,
        sourceRemoved: false,
        adoptionAdmission: 'unavailable',
        cohortWriterFenceVerified: false,
      });
      expect(fs.readFileSync(filename)).toEqual(bytes);
      expect(fs.readFileSync(path.join(bundle(options.operationId), 'payload.bin'))).toEqual(bytes);
      for (const name of ['payload.bin', 'prepared.json', 'complete.json'])
        expect(fs.statSync(path.join(bundle(options.operationId), name)).mode & 0o777).toBe(0o600);
      fs.unlinkSync(filename);
      await expect(verifyPreservedLegacyCopy(options)).resolves.toEqual(result);
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(result)).not.toContain('synthetic private SQL');
    });
    it('preserves staging SQL and MIME-accepted old upload suffixes as untrusted byte copies', async () => {
      const staged = source('temp_staging_2/database/mud archive-数据.sql');
      expect((await preserveLegacyCopy(staged.options)).kind).toBe('staging');
      const uploadRoot = path.join(root, 'old-upload');
      fs.mkdirSync(uploadRoot, { mode: 0o700 });
      const filename = path.join(uploadRoot, 'backup-upload-123-456.ZIP');
      fs.writeFileSync(filename, 'synthetic uninspected upload');
      const options = {
        ...staged.options,
        sourceName: path.basename(filename),
        uploadRoot,
        sourcePhysicalSha256: legacyCopyPhysicalSha256(fs.statSync(filename, { bigint: true })),
        operationId: randomUUID(),
      };
      expect((await preserveLegacyCopy(options)).kind).toBe('upload');
      expect(fs.readFileSync(filename, 'utf8')).toBe('synthetic uninspected upload');
    });
    it('preserves a filesystem-sized legacy extension beyond 200 characters', async () => {
      const value = source('backup-upload-1234567890123-1234567890.' + 'x'.repeat(214));
      const options = { ...value.options, uploadRoot: backupRoot };
      expect((await preserveLegacyCopy(options)).copyVerified).toBe(true);
      expect((await verifyPreservedLegacyCopy(options)).copyVerified).toBe(true);
    });
    it.each(['copy', 'verify'] as const)(
      '%s refuses changed named receipts or extra entries at final sync',
      async (operation) => {
        for (const change of ['unlink-prepared', 'replace-complete', 'extra'] as const) {
          const value = source();
          if (operation === 'verify') await preserveLegacyCopy(value.options);
          const directory = bundle(value.options.operationId);
          const sync = fs.fsyncSync.bind(fs);
          let changed = false;
          const sabotage = jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
            if (
              !changed &&
              fs.readlinkSync('/proc/self/fd/' + fd) === protectedRoot &&
              fs.existsSync(path.join(directory, 'complete.json'))
            ) {
              changed = true;
              if (change === 'unlink-prepared')
                fs.unlinkSync(path.join(directory, 'prepared.json'));
              else if (change === 'replace-complete') {
                const receipt = path.join(directory, 'complete.json');
                const bytes = fs.readFileSync(receipt);
                fs.renameSync(receipt, receipt + '.retained');
                fs.writeFileSync(receipt, bytes, { mode: 0o600 });
                fs.unlinkSync(receipt + '.retained');
              } else
                fs.writeFileSync(path.join(directory, 'unexpected.json'), '{}', { mode: 0o600 });
            }
            return sync(fd);
          });
          try {
            if (operation === 'copy')
              await expect(preserveLegacyCopy(value.options)).rejects.toBeInstanceOf(Error);
            else
              await expect(verifyPreservedLegacyCopy(value.options)).rejects.toBeInstanceOf(Error);
            expect(changed).toBe(true);
            expect(fs.existsSync(value.filename)).toBe(true);
          } finally {
            sabotage.mockRestore();
          }
        }
      },
    );
    it('rehashes same-length payload changes after the worker finished its readback', async () => {
      const value = source();
      const payload = path.join(bundle(value.options.operationId), 'payload.bin');
      const stat = fs.fstatSync.bind(fs);
      let changed = false;
      const sabotage = jest
        .spyOn(fs, 'fstatSync')
        .mockImplementation((...args: Parameters<typeof fs.fstatSync>) => {
          const observed = stat(...args);
          if (
            !changed &&
            fs.readlinkSync('/proc/self/fd/' + args[0]) === payload &&
            Number(observed.size) > 0
          ) {
            changed = true;
            fs.writeFileSync(payload, Buffer.alloc(Number(observed.size), 120));
            return stat(...args);
          }
          return observed;
        });
      try {
        await expect(preserveLegacyCopy(value.options)).rejects.toBeInstanceOf(Error);
        expect(changed).toBe(true);
        expect(fs.existsSync(path.join(bundle(value.options.operationId), 'failed.json'))).toBe(
          true,
        );
        expect(fs.existsSync(value.filename)).toBe(true);
      } finally {
        sabotage.mockRestore();
      }
    });
    it.each(['copy', 'verify'] as const)(
      '%s refuses renamed bundles and substituted payload names before acknowledgement',
      async (operation) => {
        for (const change of ['bundle', 'payload', 'bytes'] as const) {
          const value = source();
          if (operation === 'verify') await preserveLegacyCopy(value.options);
          const directory = bundle(value.options.operationId);
          const payload = path.join(directory, 'payload.bin');
          const sync = fs.fsyncSync.bind(fs);
          let changed = false;
          const sabotage = jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
            if (!changed && fs.readlinkSync('/proc/self/fd/' + fd) === payload) {
              changed = true;
              if (change === 'bundle') fs.renameSync(directory, directory + '.retained');
              else if (change === 'payload') {
                fs.renameSync(payload, payload + '.retained');
                fs.writeFileSync(payload, 'substituted bytes', { mode: 0o600 });
              } else fs.writeFileSync(payload, 'changed payload bytes');
            }
            return sync(fd);
          });
          try {
            if (operation === 'copy')
              await expect(preserveLegacyCopy(value.options)).rejects.toBeInstanceOf(Error);
            else
              await expect(verifyPreservedLegacyCopy(value.options)).rejects.toBeInstanceOf(Error);
            expect(changed).toBe(true);
            expect(fs.existsSync(value.filename)).toBe(true);
          } finally {
            sabotage.mockRestore();
          }
        }
      },
    );
    it.each(['copy', 'verify'] as const)(
      '%s excludes late payload writes through the final acknowledgement',
      async (operation) => {
        const value = source();
        if (operation === 'verify') await preserveLegacyCopy(value.options);
        const directory = bundle(value.options.operationId);
        const payload = path.join(directory, 'payload.bin');
        const close = fs.closeSync.bind(fs);
        let receiptCloses = 0,
          attempts = 0,
          writerOutcome = '';
        jest.spyOn(fs, 'closeSync').mockImplementation((fd) => {
          const name = fs.readlinkSync('/proc/self/fd/' + fd);
          close(fd);
          if (name === path.join(directory, 'complete.json') && ++receiptCloses === 3) {
            attempts++;
            const writer = spawnSync(
              '/usr/bin/python3',
              [
                '-I',
                '-B',
                '-c',
                "import os,sys\ntry:\n f=os.open(sys.argv[1],os.O_WRONLY|os.O_NONBLOCK)\n os.pwrite(f,b'x'*os.fstat(f).st_size,0)\n os.close(f)\n print('written')\nexcept BlockingIOError:\n print('blocked')",
                payload,
              ],
              { encoding: 'utf8', timeout: 2000 },
            );
            expect(writer.status).toBe(0);
            writerOutcome = writer.stdout.trim();
          }
        });
        const pending =
          operation === 'copy'
            ? preserveLegacyCopy(value.options)
            : Promise.resolve().then(() => verifyPreservedLegacyCopy(value.options));
        await expect(pending).rejects.toBeInstanceOf(Error);
        expect(attempts).toBe(1);
        expect(writerOutcome).toBe('blocked');
        expect(fs.readFileSync(payload)).toEqual(fs.readFileSync(value.filename));
      },
    );
    it('refuses an active writer and keeps the registered incomplete bundle and original', async () => {
      const { filename, options } = source();
      const writing = fs.openSync(filename, 'r+');
      try {
        await expect(preserveLegacyCopy(options)).rejects.toMatchObject({
          reason: 'writer_active',
          reference: options.operationId,
        });
      } finally {
        fs.closeSync(writing);
      }
      expect(fs.readFileSync(filename, 'utf8')).toContain('synthetic private SQL');
      expect(fs.existsSync(path.join(bundle(options.operationId), 'prepared.json'))).toBe(true);
      expect(fs.existsSync(path.join(bundle(options.operationId), 'failed.json'))).toBe(true);
      expect(fs.existsSync(path.join(bundle(options.operationId), 'complete.json'))).toBe(false);
      await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
    });
    it('refuses overwrite/replay and corrupted or linked payloads without repairing or erasing evidence', async () => {
      const { filename, options } = source();
      await preserveLegacyCopy(options);
      await expect(preserveLegacyCopy(options)).rejects.toMatchObject({
        reason: 'operation_exists',
      });
      const payload = path.join(bundle(options.operationId), 'payload.bin');
      fs.writeFileSync(payload, 'modified private copy');
      await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
      expect(fs.readFileSync(filename, 'utf8')).toContain('synthetic private SQL');
      fs.unlinkSync(payload);
      fs.symlinkSync(filename, payload);
      await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
      expect(fs.lstatSync(payload).isSymbolicLink()).toBe(true);
    });
    it('refuses unsafe roots, identity changes and byte limits before copying', async () => {
      const { filename, options } = source();
      await expect(
        preserveLegacyCopy({ ...options, protectedRoot: backupRoot }),
      ).rejects.toMatchObject({ reason: 'destination_unverified' });
      await expect(
        preserveLegacyCopy({ ...options, sourcePhysicalSha256: '0'.repeat(64) }),
      ).rejects.toMatchObject({ reason: 'source_unverified' });
      await expect(preserveLegacyCopy({ ...options, maxBytes: 1 })).rejects.toMatchObject({
        reason: 'byte_limit',
      });
      expect(fs.readdirSync(protectedRoot)).toEqual([]);
      expect(fs.existsSync(filename)).toBe(true);
      const outside = path.join(root, 'outside.txt');
      fs.writeFileSync(outside, 'untouched outside fixture');
      fs.unlinkSync(filename);
      fs.symlinkSync(outside, filename);
      await expect(preserveLegacyCopy(options)).rejects.toBeInstanceOf(Error);
      expect(fs.readFileSync(outside, 'utf8')).toBe('untouched outside fixture');
      fs.unlinkSync(filename);
      fs.linkSync(outside, filename);
      await expect(
        preserveLegacyCopy({
          ...options,
          sourcePhysicalSha256: legacyCopyPhysicalSha256(fs.statSync(filename, { bigint: true })),
        }),
      ).rejects.toMatchObject({ reason: 'source_unverified' });
      expect(fs.readdirSync(protectedRoot)).toEqual([]);
    });
    it('does not acknowledge a protected root substituted while the worker finishes', async () => {
      const { filename, options } = source();
      const sync = fs.fsyncSync.bind(fs);
      let changed = false;
      jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
        if (!changed && fs.readlinkSync('/proc/self/fd/' + fd).endsWith('/payload.bin')) {
          changed = true;
          fs.renameSync(protectedRoot, protectedRoot + '.retained');
          fs.symlinkSync(backupRoot, protectedRoot);
        }
        return sync(fd);
      });
      await expect(preserveLegacyCopy(options)).rejects.toMatchObject({
        reference: options.operationId,
      });
      expect(changed).toBe(true);
      expect(fs.existsSync(filename)).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            protectedRoot + '.retained',
            'legacy-preserve-' + options.operationId,
            'failed.json',
          ),
        ),
      ).toBe(true);
    });
    it('runs the actual Python native lease suite', () => {
      const result = spawnSync(
        '/usr/bin/python3',
        [
          '-I',
          '-B',
          fileURLToPath(
            new URL('../../../scripts/__tests__/legacyFileLeaseWorker.test.py', import.meta.url),
          ),
        ],
        { encoding: 'utf8', timeout: 15000 },
      );
      expect({ status: result.status, diagnostic: result.stderr }).toEqual({
        status: 0,
        diagnostic: expect.stringContaining('OK'),
      });
    });
    it.each([false, true])(
      'reaps a hung fresh worker and releases its lease with close-ack failure=%s',
      async (loseCloseAck) => {
        const { filename, options } = source();
        const interpreter = path.join(root, 'hung-interpreter');
        fs.writeFileSync(
          interpreter,
          '#!/usr/bin/python3\nimport fcntl,time\nfcntl.fcntl(3,fcntl.F_SETLEASE,fcntl.F_RDLCK)\ntime.sleep(60)\n',
          { mode: 0o700 },
        );
        const close = fs.closeSync.bind(fs);
        let lost = false;
        if (loseCloseAck)
          jest.spyOn(fs, 'closeSync').mockImplementation((fd) => {
            const payload = fs.readlinkSync('/proc/self/fd/' + fd).endsWith('/payload.bin');
            close(fd);
            if (payload && !lost) {
              lost = true;
              throw new Error('private-close-detail-sentinel');
            }
          });
        await expect(
          preserveLegacyCopy({ ...options, pythonBin: interpreter, timeBudgetMs: 1 }),
        ).rejects.toMatchObject({
          reason: loseCloseAck ? 'recovery_review_required' : 'copy_unconfirmed',
          reference: options.operationId,
        });
        const writing = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
        fs.closeSync(writing);
        expect(fs.existsSync(path.join(bundle(options.operationId), 'failed.json'))).toBe(true);
        await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
      },
    );
    it('retains work and the same reference after a lost output-sync acknowledgement', async () => {
      const { filename, options } = source();
      const sync = fs.fsyncSync.bind(fs);
      let failed = false;
      jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
        if (!failed && fs.readlinkSync('/proc/self/fd/' + fd).endsWith('/payload.bin')) {
          failed = true;
          throw new Error('private-filesystem-detail-sentinel');
        }
        return sync(fd);
      });
      await expect(preserveLegacyCopy(options)).rejects.toMatchObject({
        reason: 'copy_unconfirmed',
        reference: options.operationId,
        message: expect.not.stringContaining('private-filesystem-detail-sentinel'),
      });
      expect(fs.existsSync(filename)).toBe(true);
      expect(fs.existsSync(path.join(bundle(options.operationId), 'payload.bin'))).toBe(true);
      const retained = JSON.parse(
        fs.readFileSync(path.join(bundle(options.operationId), 'failed.json'), 'utf8'),
      );
      expect(retained.copyVerified).toBe(false);
      expect(retained.workerCopy).toMatchObject({
        outcome: 'copied',
        bytes: fs.statSync(filename).size,
        sourcePhysicalSha256: options.sourcePhysicalSha256,
      });
      await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
    });
    it('keeps registration and incomplete payload when the explicit interpreter is unavailable', async () => {
      const { filename, options } = source();
      await expect(
        preserveLegacyCopy({ ...options, pythonBin: '/nonexistent/durisweb-python3' }),
      ).rejects.toMatchObject({
        reason: 'interpreter_unavailable',
        reference: options.operationId,
      });
      expect(fs.existsSync(path.join(bundle(options.operationId), 'prepared.json'))).toBe(true);
      expect(fs.existsSync(path.join(bundle(options.operationId), 'failed.json'))).toBe(true);
      expect(fs.existsSync(filename)).toBe(true);
      await expect(verifyPreservedLegacyCopy(options)).rejects.toBeInstanceOf(Error);
    });
    (fs.existsSync('/dev/shm') ? it : it.skip)(
      'preserves an actual tmpfs upload into protected disk storage',
      async () => {
        const uploadRoot = fs.mkdtempSync('/dev/shm/durisweb-preserve-upload-');
        try {
          const filename = path.join(uploadRoot, 'backup-upload-123-456.zip');
          fs.writeFileSync(filename, 'private tmpfs upload bytes');
          const selected = source();
          const options = {
            ...selected.options,
            uploadRoot,
            sourceName: path.basename(filename),
            sourcePhysicalSha256: legacyCopyPhysicalSha256(fs.statSync(filename, { bigint: true })),
          };
          expect((await preserveLegacyCopy(options)).copyVerified).toBe(true);
          expect((await verifyPreservedLegacyCopy(options)).copyVerified).toBe(true);
          expect(fs.readFileSync(filename, 'utf8')).toBe('private tmpfs upload bytes');
        } finally {
          fs.rmSync(uploadRoot, { recursive: true });
        }
      },
    );
  },
);

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  inventoryLegacyBackupCopies,
  writeLegacyBackupInventory,
} from '../legacyBackupInventory.js';

let workspace: string, backupRoot: string, uploadRoot: string, outputRoot: string;
beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-legacy-inventory-'));
  backupRoot = path.join(workspace, 'backup');
  uploadRoot = path.join(workspace, 'upload');
  outputRoot = path.join(workspace, 'private');
  for (const root of [backupRoot, uploadRoot, outputRoot]) fs.mkdirSync(root, { mode: 0o700 });
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(workspace, { recursive: true });
});
function staging(id = 2) {
  const directory = path.join(backupRoot, `temp_staging_${id}`, 'database');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'mud.sql'), 'private-sql-sentinel');
  return directory;
}
describe('read-only legacy copy discovery', () => {
  it('writes partial evidence when the first root exhausts the shared budget', async () => {
    let clock = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    const original = fs.opendirSync;
    jest
      .spyOn(fs, 'opendirSync')
      .mockImplementation((...args: Parameters<typeof fs.opendirSync>) => {
        const directory = original(...args);
        const read = directory.readSync.bind(directory);
        jest.spyOn(directory, 'readSync').mockImplementation(() => {
          clock = 6000;
          return read();
        });
        return directory;
      });
    const result = await inventoryLegacyBackupCopies(backupRoot, uploadRoot);
    expect(result.roots.map((root) => root.stoppedBecause)).toEqual(['time_budget', 'time_budget']);
    expect(result.roots[1].rootSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.roots[1].rootMountId).toMatch(/^[0-9]+$/);
    const output = path.join(outputRoot, 'partial.json');
    writeLegacyBackupInventory(output, result, [backupRoot, uploadRoot]);
    expect(JSON.parse(fs.readFileSync(output, 'utf8')).roots).toHaveLength(2);
  });
  it('refuses output after the scanned root is renamed and replaced', async () => {
    const result = await inventoryLegacyBackupCopies(backupRoot);
    const former = path.join(workspace, 'former-root');
    fs.renameSync(backupRoot, former);
    fs.mkdirSync(backupRoot, { mode: 0o700 });
    const output = path.join(former, 'inventory.json');
    expect(() => writeLegacyBackupInventory(output, result, [backupRoot])).toThrow();
    expect(fs.existsSync(output)).toBe(false);
  });

  (fs.existsSync('/dev/shm') ? it : it.skip)(
    'observes an actual tmpfs legacy root without granting unlink authority',
    async () => {
      const temporary = fs.mkdtempSync('/dev/shm/durisweb-legacy-inventory-');
      try {
        fs.writeFileSync(path.join(temporary, 'backup-upload-123-456.zip'), 'synthetic bytes');
        const result = await inventoryLegacyBackupCopies(backupRoot, temporary);
        expect(result.roots[1].scanComplete).toBe(true);
        expect(result.roots[1].copies[0].outcome).toBe('writer_unverified');
        expect(result.deletionAdmission).toBe('unavailable');
      } finally {
        fs.rmSync(temporary, { recursive: true });
      }
    },
  );
  it('inventories the exact old layouts without opening content or inferring a writer fence', async () => {
    fs.writeFileSync(path.join(backupRoot, 'temp_1.sql'), 'private-sql-sentinel');
    staging();
    fs.writeFileSync(path.join(backupRoot, 'duris-mud-created.zip'), 'managed archive excluded');
    fs.writeFileSync(
      path.join(uploadRoot, 'backup-upload-1234567890123-123456789.zip'),
      'private-upload-sentinel',
    );
    fs.writeFileSync(
      path.join(uploadRoot, 'other-private-name-sentinel'),
      'not part of the traced layout',
    );
    fs.utimesSync(path.join(backupRoot, 'temp_1.sql'), new Date(0), new Date());
    const before = fs.statSync(path.join(backupRoot, 'temp_1.sql'), { bigint: true });
    const result = await inventoryLegacyBackupCopies(backupRoot, uploadRoot);
    expect(result.coverage).toBe('selected_roots_only');
    expect(result.deletionAdmission).toBe('unavailable');
    expect(result.writerFenceVerified).toBe(false);
    expect(result.roots.map((root) => root.scanComplete)).toEqual([true, true]);
    expect(result.roots.map((root) => root.copies.length)).toEqual([2, 1]);
    expect(result.roots[0].copies.map((copy) => copy.kind)).toEqual(['sql_dump', 'staging']);
    expect(result.roots[0].copies[1].sqlMember?.name).toBe('database/mud.sql');
    expect(
      result.roots
        .flatMap((root) => root.copies)
        .every((copy) => copy.outcome === 'writer_unverified'),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-sql-sentinel');
    expect(JSON.stringify(result)).not.toContain('private-upload-sentinel');
    expect(JSON.stringify(result)).not.toContain('other-private-name-sentinel');
    expect(JSON.stringify(result)).not.toContain(workspace);
    const after = fs.statSync(path.join(backupRoot, 'temp_1.sql'), { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.size).toBe(before.size);
    expect(after.mtimeNs).toBe(before.mtimeNs);
    expect(after.ctimeNs).toBe(before.ctimeNs);
    expect(after.atimeNs).toBe(before.atimeNs);
  });
  it('retains legitimate one-component staging names from the configured database identifier', async () => {
    const directory = staging();
    fs.renameSync(path.join(directory, 'mud.sql'), path.join(directory, 'mud archive-数据.sql'));
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].copies[0].outcome).toBe('writer_unverified');
    expect(result.roots[0].copies[0].sqlMember?.name).toBe('database/mud archive-数据.sql');
  });
  it('marks an omitted old upload namespace as unselected', async () => {
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.legacyUploadScope).toBe('not_selected');
    expect(result.roots).toHaveLength(1);
  });
  it.each(['mud.archive.sql', 'mud archive.sql', 'mud@archive.sql', '数据库.sql'])(
    'recognizes a single SQL member from the configured name %s',
    async (name) => {
      const directory = staging();
      fs.renameSync(path.join(directory, 'mud.sql'), path.join(directory, name));
      const result = await inventoryLegacyBackupCopies(backupRoot);
      expect(result.roots[0].copies[0]).toMatchObject({
        outcome: 'writer_unverified',
        sqlMember: { name: 'database/' + name },
      });
    },
  );
  it('does not follow symlinked files/directories or accept hardlinked SQL/FIFO nodes', async () => {
    const outside = path.join(workspace, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'private.sql'), 'outside sentinel');
    fs.symlinkSync(path.join(outside, 'private.sql'), path.join(backupRoot, 'temp_1.sql'));
    fs.symlinkSync(outside, path.join(backupRoot, 'temp_staging_2'));
    fs.linkSync(path.join(outside, 'private.sql'), path.join(backupRoot, 'temp_3.sql'));
    expect(spawnSync('mkfifo', [path.join(backupRoot, 'temp_4.sql')]).status).toBe(0);
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].copies.map((copy) => copy.outcome)).toEqual(
      Array(4).fill('unsafe_shape'),
    );
    expect(fs.readFileSync(path.join(outside, 'private.sql'), 'utf8')).toBe('outside sentinel');
  });
  it('refuses unknown staging layouts and records malformed legacy names only as a count', async () => {
    const directory = staging();
    fs.writeFileSync(path.join(directory, 'extra.sql'), 'second SQL');
    fs.writeFileSync(path.join(backupRoot, 'temp_private-name-sentinel.sql'), 'unrecognized');
    fs.writeFileSync(
      path.join(uploadRoot, 'backup-upload-123-456.ZIP'),
      'old MIME-accepted suffix',
    );
    fs.writeFileSync(
      path.join(uploadRoot, 'backup-upload-123-456.txt'),
      'old MIME-accepted suffix',
    );
    fs.writeFileSync(
      path.join(uploadRoot, 'backup-upload-private-name.zip'),
      'unrecognized old prefix',
    );
    const result = await inventoryLegacyBackupCopies(backupRoot, uploadRoot);
    expect(result.roots[0].copies[0].outcome).toBe('unsafe_shape');
    expect(result.roots[0].unknownLegacyEntries).toBe(1);
    expect(result.roots[1].unknownLegacyEntries).toBe(1);
    expect(result.roots[1].copies.map((copy) => copy.name)).toEqual([
      'backup-upload-123-456.ZIP',
      'backup-upload-123-456.txt',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-name-sentinel');
  });
  it('recognizes extensionless and filesystem-sized legacy MIME upload names', async () => {
    const names = ['backup-upload-123-456', 'backup-upload-123-456.' + 'x'.repeat(214)];
    for (const name of names) fs.writeFileSync(path.join(uploadRoot, name), 'synthetic bytes');
    const result = await inventoryLegacyBackupCopies(backupRoot, uploadRoot);
    expect(result.roots[1].unknownLegacyEntries).toBe(0);
    expect(result.roots[1].copies.map((copy) => copy.name)).toEqual(names);
    expect(result.roots[1].copies.every((copy) => copy.outcome === 'writer_unverified')).toBe(true);
  });
  it('retains nested symlinks and never traverses outside the opened staging directory', async () => {
    const directory = path.join(backupRoot, 'temp_staging_2');
    fs.mkdirSync(directory);
    fs.symlinkSync(uploadRoot, path.join(directory, 'database'));
    fs.writeFileSync(path.join(uploadRoot, 'private.sql'), 'outside preserved');
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].copies[0].outcome).toBe('unsafe_shape');
    expect(fs.readFileSync(path.join(uploadRoot, 'private.sql'), 'utf8')).toBe('outside preserved');
  });
  it.each([999, 1000])('completes a directory with exactly %i recognized copies', async (count) => {
    for (let id = 1; id <= count; id++)
      fs.writeFileSync(path.join(backupRoot, 'temp_' + id + '.sql'), 'synthetic');
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(true);
    expect(result.roots[0].copies).toHaveLength(count);
    expect(result.roots[0].stoppedBecause).toBeNull();
  });
  it('counts trailing non-copy entries without treating them as a 1,001st copy', async () => {
    for (let id = 1; id <= 1000; id++)
      fs.writeFileSync(path.join(backupRoot, 'temp_' + id + '.sql'), 'synthetic');
    fs.writeFileSync(path.join(backupRoot, 'zz-other'), '');
    const entries = fs
      .readdirSync(backupRoot, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    const opendir = fs.opendirSync.bind(fs);
    jest
      .spyOn(fs, 'opendirSync')
      .mockImplementation((...args: Parameters<typeof fs.opendirSync>) => {
        const directory = opendir(...args);
        jest.spyOn(directory, 'readSync').mockImplementation(() => entries.shift() ?? null);
        return directory;
      });
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(true);
    expect(result.roots[0].copies).toHaveLength(1000);
    expect(result.roots[0].otherEntries).toBe(1);
  });
  it('stops within staging traversal when individually slow metadata reads exhaust the budget', async () => {
    staging();
    let clock = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    const lstat = fs.lstatSync.bind(fs),
      open = fs.openSync.bind(fs);
    const lateOpens: string[] = [];
    jest.spyOn(fs, 'lstatSync').mockImplementation((...args: Parameters<typeof fs.lstatSync>) => {
      const result = lstat(...args);
      if (String(args[0]).startsWith('/proc/self/fd/')) clock += 2500;
      return result;
    });
    jest.spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      if (clock >= 5000) lateOpens.push(String(args[0]));
      return open(...args);
    });
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(false);
    expect(result.roots[0].stoppedBecause).toBe('time_budget');
    expect(lateOpens).toEqual([]);
  });
  it('validates all selected roots before traversal can exhaust its budget', async () => {
    const alias = path.join(workspace, 'upload-alias');
    fs.symlinkSync(uploadRoot, alias);
    const directory = jest.spyOn(fs, 'opendirSync');
    await expect(inventoryLegacyBackupCopies(backupRoot, alias)).rejects.toMatchObject({
      reason: 'root_unverified',
    });
    expect(directory).not.toHaveBeenCalled();
    await expect(
      inventoryLegacyBackupCopies(backupRoot, '/proc/self/root' + uploadRoot),
    ).rejects.toMatchObject({ reason: 'root_unverified' });
  });
  it('saves owner-readable evidence even with an owner-denying umask', async () => {
    const inventory = await inventoryLegacyBackupCopies(backupRoot);
    const file = path.join(outputRoot, 'restrictive-umask.json');
    const previous = process.umask(0o777);
    try {
      writeLegacyBackupInventory(file, inventory, [backupRoot]);
    } finally {
      process.umask(previous);
    }
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(inventory);
  });
  it('reports incomplete scope at the real copy cap without dropping or modifying copies', async () => {
    for (let id = 1; id <= 1001; id++)
      fs.writeFileSync(path.join(backupRoot, `temp_${id}.sql`), 'synthetic');
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(false);
    expect(result.roots[0].stoppedBecause).toBe('copy_limit');
    expect(result.roots[0].copies).toHaveLength(1000);
    expect(fs.readdirSync(backupRoot)).toHaveLength(1001);
  });
  it('bounds nonmatching root enumeration as well as matching copies', async () => {
    for (let id = 0; id < 10001; id++) fs.writeFileSync(path.join(backupRoot, `other-${id}`), '');
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(false);
    expect(result.roots[0].stoppedBecause).toBe('entry_limit');
    expect(result.roots[0].entriesSeen).toBe(10000);
    expect(fs.readdirSync(backupRoot)).toHaveLength(10001);
  });
  it('enumerates the opened directory rather than following a substituted root symlink', async () => {
    fs.writeFileSync(path.join(backupRoot, 'temp_1.sql'), 'original');
    fs.writeFileSync(path.join(uploadRoot, 'temp_999.sql'), 'outside');
    const opendir = fs.opendirSync.bind(fs);
    let changed = false;
    jest
      .spyOn(fs, 'opendirSync')
      .mockImplementation((...args: Parameters<typeof fs.opendirSync>) => {
        if (!changed) {
          changed = true;
          fs.renameSync(backupRoot, backupRoot + '.moved');
          fs.symlinkSync(uploadRoot, backupRoot);
        }
        return opendir(...args);
      });
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].copies.map((copy) => copy.name)).toEqual(['temp_1.sql']);
    expect(result.roots[0].scanComplete).toBe(false);
    expect(result.roots[0].stoppedBecause).toBe('root_changed');
    expect(result.snapshotConsistent).toBe(false);
  });
  it('does not claim a complete inventory when a directory changes during enumeration', async () => {
    fs.writeFileSync(path.join(backupRoot, 'temp_1.sql'), 'one');
    const lstat = fs.lstatSync.bind(fs);
    let changed = false;
    jest.spyOn(fs, 'lstatSync').mockImplementation((...args: Parameters<typeof fs.lstatSync>) => {
      if (!changed && String(args[0]).endsWith('/temp_1.sql')) {
        changed = true;
        fs.writeFileSync(path.join(backupRoot, 'new-file'), 'change root');
        // Metadata timestamps can share one filesystem clock tick; make the observed drift explicit.
        fs.utimesSync(backupRoot, new Date(0), new Date(0));
      }
      return lstat(...args);
    });
    const result = await inventoryLegacyBackupCopies(backupRoot);
    expect(result.roots[0].scanComplete).toBe(false);
    expect(result.roots[0].stoppedBecause).toBe('root_changed');
  });
  it('writes new private, flushed evidence outside roots and refuses overwrite, symlink and shared parents', async () => {
    const result = await inventoryLegacyBackupCopies(backupRoot, uploadRoot),
      file = path.join(outputRoot, 'inventory.json');
    writeLegacyBackupInventory(file, result, [backupRoot, uploadRoot]);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(result);
    expect(() => writeLegacyBackupInventory(file, result, [backupRoot])).toThrow();
    expect(() =>
      writeLegacyBackupInventory(path.join(backupRoot, 'inventory.json'), result, [backupRoot]),
    ).toThrow();
    const link = path.join(outputRoot, 'link.json');
    fs.symlinkSync(file, link);
    expect(() => writeLegacyBackupInventory(link, result, [backupRoot])).toThrow();
    const alias = path.join(workspace, 'private-alias');
    fs.symlinkSync(outputRoot, alias);
    expect(() =>
      writeLegacyBackupInventory(path.join(alias, 'new.json'), result, [backupRoot]),
    ).toThrow();
    fs.chmodSync(outputRoot, 0o755);
    expect(() =>
      writeLegacyBackupInventory(path.join(outputRoot, 'shared.json'), result, [backupRoot]),
    ).toThrow();
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(result);
  });
  it.each(['rename', 'unlink', 'replace', 'modify'])(
    'does not acknowledge evidence changed by %s during directory sync',
    async (change) => {
      const inventory = await inventoryLegacyBackupCopies(backupRoot);
      const file = path.join(outputRoot, 'acknowledgement.json');
      const sync = fs.fsyncSync.bind(fs);
      let changed = false;
      jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
        if (!changed && fs.fstatSync(fd).isDirectory()) {
          changed = true;
          const bytes = fs.readFileSync(file);
          if (change === 'unlink') fs.unlinkSync(file);
          else if (change === 'modify') fs.writeFileSync(file, Buffer.alloc(bytes.length, 'x'));
          else {
            fs.renameSync(file, file + '.retained');
            if (change === 'replace') fs.writeFileSync(file, bytes, { mode: 0o600 });
          }
        }
        sync(fd);
      });
      expect(() => writeLegacyBackupInventory(file, inventory, [backupRoot])).toThrow();
      expect(changed).toBe(true);
    },
  );
  it('checks written bytes instead of trusting metadata captured after a competing write', async () => {
    const inventory = await inventoryLegacyBackupCopies(backupRoot);
    const file = path.join(outputRoot, 'changed-before-checkpoint.json');
    const sync = fs.fsyncSync.bind(fs);
    let changed = false;
    jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      if (!changed && fs.fstatSync(fd).isFile()) {
        changed = true;
        const bytes = fs.readFileSync(file);
        fs.writeFileSync(file, Buffer.alloc(bytes.length, 'x'));
      }
      sync(fd);
    });
    expect(() => writeLegacyBackupInventory(file, inventory, [backupRoot])).toThrow();
    expect(changed).toBe(true);
  });
  it('does not turn a missing root or relative path into an empty successful observation', async () => {
    await expect(
      inventoryLegacyBackupCopies(path.join(workspace, 'missing')),
    ).rejects.toMatchObject({ reason: 'root_unverified' });
    await expect(inventoryLegacyBackupCopies('relative')).rejects.toMatchObject({
      reason: 'invalid_arguments',
    });
    const alias = path.join(workspace, 'root-alias');
    fs.symlinkSync(backupRoot, alias);
    await expect(inventoryLegacyBackupCopies(alias)).rejects.toMatchObject({
      reason: 'root_unverified',
    });
    await expect(inventoryLegacyBackupCopies('/proc/self/root' + backupRoot)).rejects.toMatchObject(
      { reason: 'root_unverified' },
    );
  });
});

/** Explicit native fixture: run as root inside a fresh private mount namespace. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { inventoryLegacyBackupCopies } from '../legacyBackupInventory.js';

assert.equal(process.platform, 'linux');
assert.equal(process.getuid?.(), 0);
assert.notEqual(fs.readlinkSync('/proc/self/ns/mnt'), fs.readlinkSync('/proc/1/ns/mnt'));
const root = fs.mkdtempSync('/tmp/durisweb-inventory-mount-test-');
const backup = path.join(root, 'backup'),
  upload = path.join(root, 'upload');
const outside = path.join(root, 'outside');
const mounts: string[] = [];
function within(value: string): void {
  assert.ok(path.resolve(value).startsWith(root + '/'));
}
function bind(source: string, target: string): void {
  within(source);
  within(target);
  execFileSync('/usr/bin/mount', ['--bind', source, target]);
  mounts.push(target);
}
try {
  for (const directory of [backup, upload, outside]) fs.mkdirSync(directory, { mode: 0o700 });
  const source = path.join(outside, 'source.sql');
  fs.writeFileSync(source, 'outside synthetic bytes');
  fs.mkdirSync(path.join(outside, 'database'));
  fs.writeFileSync(path.join(outside, 'database', 'mud.sql'), 'outside synthetic SQL');
  fs.mkdirSync(path.join(outside, 'staging'));
  fs.mkdirSync(path.join(outside, 'staging', 'database'));
  fs.writeFileSync(path.join(outside, 'staging', 'database', 'mud.sql'), 'outside staging SQL');
  const dump = path.join(backup, 'temp_1.sql');
  const uploaded = path.join(upload, 'backup-upload-123-456.zip');
  for (const file of [dump, uploaded]) {
    fs.writeFileSync(file, 'placeholder');
    bind(source, file);
  }
  const staging = path.join(backup, 'temp_staging_2');
  fs.mkdirSync(staging);
  bind(path.join(outside, 'staging'), staging);
  const database = path.join(backup, 'temp_staging_3', 'database');
  fs.mkdirSync(database, { recursive: true });
  bind(path.join(outside, 'database'), database);
  const member = path.join(backup, 'temp_staging_4', 'database', 'mud.sql');
  fs.mkdirSync(path.dirname(member), { recursive: true });
  fs.writeFileSync(member, 'placeholder');
  bind(source, member);
  fs.writeFileSync(path.join(backup, 'temp_9.sql'), 'ordinary synthetic copy');
  // All binds deliberately retain the source device number.
  assert.equal(fs.statSync(source).dev, fs.statSync(backup).dev);
  const result = await inventoryLegacyBackupCopies(backup, upload);
  const copies = result.roots.flatMap((item) => item.copies);
  assert.equal(copies.length, 6);
  for (const copy of copies)
    assert.equal(
      copy.outcome,
      copy.name === 'temp_9.sql' ? 'writer_unverified' : 'unsafe_shape',
      copy.name,
    );
  assert.equal(fs.readFileSync(source, 'utf8'), 'outside synthetic bytes');
  console.log('Passed five same-device bind boundaries and one ordinary-file control.');
} finally {
  for (const target of mounts.reverse()) {
    within(target);
    execFileSync('/usr/bin/umount', [target]);
  }
  assert.ok(root.startsWith('/tmp/durisweb-inventory-mount-test-'));
  fs.rmSync(root, { recursive: true });
}

/** Explicit native fixture: root inside a fresh private mount namespace only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { legacyCopyPhysicalSha256 } from '../legacyBackupInventory.js';
import { preserveLegacyCopy, verifyPreservedLegacyCopy } from '../legacyCopyPreservation.js';

assert.equal(process.getuid?.(), 0);
assert.notEqual(fs.readlinkSync('/proc/self/ns/mnt'), fs.readlinkSync('/proc/1/ns/mnt'));
const root = fs.mkdtempSync(path.join(os.homedir(), '.durisweb-copy-mount-test-'));
const mounts: string[] = [];
function bind(source: string, target: string): void {
  for (const entry of [source, target]) assert.ok(path.resolve(entry).startsWith(root + '/'));
  execFileSync('/usr/bin/mount', ['--bind', source, target]);
  mounts.push(target);
}
try {
  for (const kind of [
    'same-root',
    'descendant',
    'ancestor',
    'source-alias',
    'upload-alias',
    'nested-other-device',
    'independent',
  ]) {
    const base = path.join(root, kind);
    fs.mkdirSync(base, { mode: 0o700 });
    let source = path.join(base, 'source with spaces'),
      target = path.join(base, 'protected');
    const uploadRoot = path.join(base, 'uploads');
    for (const directory of [source, target, uploadRoot, path.join(source, 'child')])
      fs.mkdirSync(directory, { mode: 0o700 });
    if (kind === 'same-root') bind(source, target);
    if (kind === 'descendant') bind(path.join(source, 'child'), target);
    if (kind === 'ancestor') bind(base, target);
    if (kind === 'upload-alias') bind(uploadRoot, target);
    if (kind === 'nested-other-device') {
      execFileSync('/usr/bin/mount', [
        '-t',
        'tmpfs',
        '-o',
        'mode=700,size=1m',
        'synthetic',
        source,
      ]);
      mounts.push(source);
      const child = path.join(source, 'child');
      fs.mkdirSync(child, { mode: 0o700 });
      bind(target, child);
    }
    if (kind === 'source-alias') {
      const alias = path.join(base, 'source alias');
      fs.mkdirSync(alias, { mode: 0o700 });
      bind(source, alias);
      target = path.join(source, 'child');
      source = alias;
    }
    const file = path.join(source, 'temp_1.sql');
    fs.writeFileSync(file, 'synthetic source bytes');
    const options = {
      backupRoot: source,
      uploadRoot,
      sourceName: 'temp_1.sql',
      sourcePhysicalSha256: legacyCopyPhysicalSha256(fs.statSync(file, { bigint: true })),
      protectedRoot: target,
      operationId: randomUUID(),
      pythonBin: '/usr/bin/python3',
      maxBytes: 1024,
      timeBudgetMs: 5000,
    };
    if (kind === 'independent') {
      assert.equal((await preserveLegacyCopy(options)).copyVerified, true);
      assert.equal(verifyPreservedLegacyCopy(options).copyVerified, true);
    } else {
      await assert.rejects(preserveLegacyCopy(options), { reason: 'destination_unverified' });
      assert.equal(
        fs.readdirSync(target).some((name) => name.startsWith('legacy-preserve-')),
        false,
      );
    }
    assert.equal(fs.readFileSync(file, 'utf8'), 'synthetic source bytes');
  }
  console.log('Passed six backing-storage aliases and an independent copy/verification control.');
} finally {
  for (const target of mounts.reverse()) execFileSync('/usr/bin/umount', [target]);
  assert.equal(path.dirname(root), os.homedir());
  assert.ok(path.basename(root).startsWith('.durisweb-copy-mount-test-'));
  fs.rmSync(root, { recursive: true });
}

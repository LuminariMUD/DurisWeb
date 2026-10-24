/** Explicit synthetic PrivateTmp keeper rehearsal, root in a private mount namespace. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { verifyPreservedLegacyCopy } from '../legacyCopyPreservation.js';

assert.equal(process.env.TEST_PWIPE_WEBSITE_SYSTEMD, '1');
assert.equal(process.getuid?.(), 0);
assert.equal(fs.readFileSync('/proc/1/comm', 'utf8').trim(), 'systemd');
assert.notEqual(fs.readlinkSync('/proc/self/ns/mnt'), fs.readlinkSync('/proc/1/ns/mnt'));
const root = fs.mkdtempSync(path.join(os.homedir(), '.durisweb-pwipe-private-tmp-'));
const identity = randomUUID(),
  sourceName = `backup-upload-${Date.now()}-${process.pid}.dump`;
const unit = `durisweb-pwipe-private-tmp-${identity}.service`;
const keeper = `durisweb-pwipe-private-tmp-${identity}-keeper.service`;
const units: string[] = [];
const bytes = 'synthetic legacy upload bytes';
const backend = fileURLToPath(new URL('../../..', import.meta.url));
const loader = path.join(backend, 'node_modules/tsx/dist/loader.mjs');
const protectedRoot = path.join(root, 'protected');
fs.mkdirSync(protectedRoot, { mode: 0o700 });

function systemctl(...args: string[]): string {
  return execFileSync('/usr/bin/systemctl', args, { encoding: 'utf8', timeout: 20000 }).trim();
}
async function pid(name: string): Promise<number> {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const value = Number(systemctl('show', name, '--property=MainPID', '--value'));
    if (Number.isSafeInteger(value) && value > 1) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Disposable keeper unit did not start');
}
function publish(name: string, content: string): void {
  assert(name.startsWith('durisweb-pwipe-private-tmp-') && !name.includes('/'));
  fs.writeFileSync(path.join('/run/systemd/system', name), content, { flag: 'wx', mode: 0o600 });
  units.push(name);
}

try {
  assert(!fs.existsSync('/tmp/' + sourceName));
  const script = path.join(root, 'source.py');
  fs.writeFileSync(
    script,
    `from pathlib import Path
import time
p=Path('/tmp/${sourceName}')
p.write_text('${bytes}')
p.chmod(0o600)
time.sleep(300)
`,
    { mode: 0o600 },
  );
  publish(
    unit,
    `[Unit]
Description=Disposable DurisWeb legacy temp source
[Service]
Type=simple
PrivateTmp=true
ExecStart=/usr/bin/python3 ${JSON.stringify(script)}
`,
  );
  publish(
    keeper,
    `[Unit]
Description=Disposable DurisWeb private temp keeper
JoinsNamespaceOf=${unit}
After=${unit}
[Service]
Type=simple
PrivateTmp=true
ExecStart=/usr/bin/sleep 300
`,
  );
  systemctl('daemon-reload');
  systemctl('start', unit);
  const originalPid = await pid(unit);
  systemctl('start', keeper);
  const keeperPid = await pid(keeper);
  const original = `/proc/${originalPid}/root/tmp/${sourceName}`;
  const retained = `/proc/${keeperPid}/root/tmp/${sourceName}`;
  assert.equal(fs.readFileSync(original, 'utf8'), bytes);
  assert.equal(fs.statSync(original).ino, fs.statSync(retained).ino);
  assert.equal(fs.statSync(original).dev, fs.statSync(retained).dev);
  const operationId = randomUUID();
  const copy = path.join(root, 'copy.mts');
  const service = pathToFileURL(path.join(backend, 'src/services/legacyCopyPreservation.ts')).href;
  const inventory = pathToFileURL(path.join(backend, 'src/services/legacyBackupInventory.ts')).href;
  fs.writeFileSync(
    copy,
    `import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preserveLegacyCopy} from ${JSON.stringify(service)};
import {legacyCopyPhysicalSha256} from ${JSON.stringify(inventory)};
const sourcePhysicalSha256=legacyCopyPhysicalSha256(fs.statSync('/tmp/${sourceName}',{bigint:true}));
const options={backupRoot:'/tmp',uploadRoot:'/tmp',sourceName:${JSON.stringify(sourceName)},sourcePhysicalSha256,protectedRoot:${JSON.stringify(protectedRoot)},operationId:${JSON.stringify(operationId)},pythonBin:'/usr/bin/python3',maxBytes:1024,timeBudgetMs:5000};
assert.equal((await preserveLegacyCopy(options)).copyVerified,true);
fs.writeFileSync(${JSON.stringify(path.join(root, 'source.json'))},JSON.stringify({sourcePhysicalSha256}),{mode:0o600});
`,
    { mode: 0o600 },
  );
  execFileSync(
    '/usr/bin/nsenter',
    ['--target', String(keeperPid), '--mount', process.execPath, '--import', loader, copy],
    { timeout: 15000, stdio: 'pipe' },
  );
  systemctl('stop', unit);
  assert.equal(Number(systemctl('show', unit, '--property=MainPID', '--value')), 0);
  assert.equal(fs.readFileSync(retained, 'utf8'), bytes);
  systemctl('stop', keeper);
  assert.equal(Number(systemctl('show', keeper, '--property=MainPID', '--value')), 0);
  assert(!fs.existsSync('/tmp/' + sourceName));
  const verified = await verifyPreservedLegacyCopy({
    pythonBin: '/usr/bin/python3',
    protectedRoot,
    operationId,
    timeBudgetMs: 5000,
  });
  assert.equal(verified.copyVerified, true);
  assert.equal(
    fs.readFileSync(
      path.join(protectedRoot, 'legacy-preserve-' + operationId, 'payload.bin'),
      'utf8',
    ),
    bytes,
  );
  console.log(
    'PrivateTmp keeper retained the source after old-unit stop; the verified protected bytes survived both unit stops',
  );
} finally {
  for (const name of [...units].reverse()) {
    try {
      systemctl('stop', name);
    } catch {
      /* Still remove only units created by this fixture. */
    }
  }
  for (const name of units) fs.unlinkSync(path.join('/run/systemd/system', name));
  if (units.length) systemctl('daemon-reload');
  assert.equal(path.dirname(root), os.homedir());
  assert(path.basename(root).startsWith('.durisweb-pwipe-private-tmp-'));
  fs.rmSync(root, { recursive: true });
}

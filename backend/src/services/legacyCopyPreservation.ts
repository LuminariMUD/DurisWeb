import fs, { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import {
  isLegacyUploadFilename,
  isLegacySqlMemberFilename,
  legacyCopyPhysicalSha256 as physical,
  legacyMountId,
  legacyDirectoryAliases,
} from './legacyBackupInventory.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ALGORITHM = 'linux_read_lease_v1';
const reasons = [
  'invalid_arguments',
  'root_unverified',
  'source_unverified',
  'source_changed',
  'destination_unverified',
  'operation_exists',
  'writer_active',
  'lease_unavailable',
  'lease_interrupted',
  'byte_limit',
  'time_budget',
  'copy_unconfirmed',
  'interpreter_unavailable',
  'recovery_review_required',
] as const;
type Reason = (typeof reasons)[number];
export class LegacyCopyPreservationError extends Error {
  constructor(
    readonly reason: Reason,
    readonly reference: string = randomUUID(),
  ) {
    super(
      'Legacy-copy preservation was not confirmed. Keep the source and retained work for review.',
    );
    this.name = 'LegacyCopyPreservationError';
  }
}
export interface LegacyCopyPreservationOptions {
  backupRoot: string;
  uploadRoot?: string;
  sourceName: string;
  sourcePhysicalSha256: string;
  protectedRoot: string;
  operationId: string;
  pythonBin: string;
  maxBytes: number;
  timeBudgetMs: number;
}
export interface LegacyCopyVerificationOptions {
  pythonBin: string;
  protectedRoot: string;
  operationId: string;
  timeBudgetMs: number;
}
interface CopyResult {
  format: 1;
  outcome: 'copied';
  bytes: number;
  sha256: string;
  sourcePhysicalSha256: string;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function integer(value: unknown, maximum = 2 ** 40): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}
function fail(reason: Reason, id?: string): never {
  throw new LegacyCopyPreservationError(reason, id);
}
function closeAll(handles: number[], operationId: string) {
  let unconfirmed = false;
  for (const fd of handles.reverse())
    try {
      fs.closeSync(fd);
    } catch {
      unconfirmed = true;
    }
  if (unconfirmed) fail('recovery_review_required', operationId);
}
function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    !relative || (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative))
  );
}
function mountAliases(fd: number, filename: string): string[] {
  try {
    return legacyDirectoryAliases(fd, filename);
  } catch {
    fail('destination_unverified');
  }
}
function canonical(root: string): string {
  if (!path.isAbsolute(root) || /[\0\r\n]/.test(root)) fail('root_unverified');
  const resolved = fs.realpathSync.native(root);
  if (resolved !== path.resolve(root)) fail('root_unverified');
  return resolved;
}
function rootIdentity(root: string, stat: BigIntStats) {
  return hash([
    root,
    fs.statfsSync(root, { bigint: true }).type.toString(),
    stat.dev.toString(),
    stat.ino.toString(),
  ]);
}
function directory(filename: string, expected?: BigIntStats): number {
  const fd = fs.openSync(
    filename,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const stat = fs.fstatSync(fd, { bigint: true });
  if (!stat.isDirectory() || (expected && physical(stat) !== physical(expected))) {
    fs.closeSync(fd);
    fail('root_unverified');
  }
  return fd;
}
const volatilePrefixes = ['/tmp', '/var/tmp', '/run', '/dev', '/proc', '/sys'];
function protectedRoot(root: string) {
  const value = canonical(root),
    stat = fs.lstatSync(value, { bigint: true }),
    filesystem = fs.statfsSync(value, { bigint: true });
  if (
    typeof process.getuid !== 'function' ||
    stat.uid !== BigInt(process.getuid()) ||
    (stat.mode & 0o077n) !== 0n ||
    !stat.isDirectory() ||
    ![0xef53n, 0x58465342n, 0x9123683en].includes(filesystem.type) ||
    volatilePrefixes.some((prefix) => within(prefix, value))
  )
    fail('root_unverified');
  const fd = directory(value, stat);
  try {
    if (
      mountAliases(fd, value).some((alias) =>
        volatilePrefixes.some((prefix) => within(prefix, alias)),
      )
    )
      fail('root_unverified');
    return { root: value, stat, sha256: rootIdentity(value, stat), fd };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
function requireSameProtectedRoot(target: ReturnType<typeof protectedRoot>) {
  if (
    mountAliases(target.fd, target.root).some((alias) =>
      volatilePrefixes.some((prefix) => within(prefix, alias)),
    )
  )
    fail('destination_unverified');
  const current = fs.lstatSync(target.root, { bigint: true });
  if (
    !current.isDirectory() ||
    current.uid !== target.stat.uid ||
    (current.mode & 0o077n) !== 0n ||
    rootIdentity(canonical(target.root), current) !== target.sha256
  )
    fail('destination_unverified');
}
function requireNamedCopy(
  target: ReturnType<typeof protectedRoot>,
  bundle: number,
  payload: number,
  operationId: string,
  payloadPhysicalSha256: string,
) {
  requireSameProtectedRoot(target);
  const mount = legacyMountId(target.fd);
  if (legacyMountId(bundle) !== mount || legacyMountId(payload) !== mount)
    fail('destination_unverified', operationId);
  const named = directory(`/proc/self/fd/${target.fd}/legacy-preserve-${operationId}`);
  const openedBundle = fs.fstatSync(bundle, { bigint: true });
  try {
    const stat = fs.fstatSync(named, { bigint: true });
    if (
      legacyMountId(named) !== mount ||
      stat.dev !== openedBundle.dev ||
      stat.ino !== openedBundle.ino ||
      stat.uid !== target.stat.uid ||
      (stat.mode & 0o077n) !== 0n
    )
      fail('destination_unverified', operationId);
  } finally {
    fs.closeSync(named);
  }
  const payloadStat = fs.fstatSync(payload, { bigint: true });
  requirePrivate(payloadStat);
  if (physical(payloadStat) !== payloadPhysicalSha256) fail('destination_unverified', operationId);
  requireNamedFile(bundle, 'payload.bin', payloadPhysicalSha256, mount);
}
function requireNamedFile(parent: number, name: string, expected: string, mount: string) {
  const fd = fs.openSync(
    `/proc/self/fd/${parent}/${name}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    requirePrivate(stat);
    if (legacyMountId(fd) !== mount || physical(stat) !== expected) fail('destination_unverified');
  } finally {
    fs.closeSync(fd);
  }
}
interface ReceiptStamp {
  physicalSha256: string;
  contentSha256: string;
}
function requireCompleteBundle(
  target: ReturnType<typeof protectedRoot>,
  bundle: number,
  payload: number,
  operationId: string,
  payloadPhysicalSha256: string,
  receipts: Record<'prepared.json' | 'complete.json', ReceiptStamp>,
) {
  const before = physical(fs.fstatSync(bundle, { bigint: true }));
  for (const name of ['prepared.json', 'complete.json'] as const) {
    const current = readJson(bundle, name).stamp;
    if (
      current.physicalSha256 !== receipts[name].physicalSha256 ||
      current.contentSha256 !== receipts[name].contentSha256
    )
      fail('recovery_review_required', operationId);
  }
  const remaining = new Set(['prepared.json', 'complete.json', 'payload.bin']);
  const entries = fs.opendirSync(`/proc/self/fd/${bundle}`);
  try {
    for (let entry = entries.readSync(); entry; entry = entries.readSync())
      if (!remaining.delete(entry.name)) fail('recovery_review_required', operationId);
  } finally {
    entries.closeSync();
  }
  if (remaining.size) fail('recovery_review_required', operationId);
  requireNamedCopy(target, bundle, payload, operationId, payloadPhysicalSha256);
  for (const name of ['prepared.json', 'complete.json'] as const)
    requireNamedFile(bundle, name, receipts[name].physicalSha256, legacyMountId(target.fd));
  if (physical(fs.fstatSync(bundle, { bigint: true })) !== before)
    fail('recovery_review_required', operationId);
}
export function legacyPreservationSelection(name: string) {
  if (/^temp_[1-9][0-9]{0,9}\.sql$/.test(name) && Number(name.slice(5, -4)) <= 4294967295)
    return { kind: 'sql_dump' as const, scope: 'backup' as const, parts: [name] };
  const staged = /^(temp_staging_([1-9][0-9]{0,9}))\/database\/([^/]+)$/.exec(name);
  if (staged && Number(staged[2]) <= 4294967295 && isLegacySqlMemberFilename(staged[3]))
    return {
      kind: 'staging' as const,
      scope: 'backup' as const,
      parts: [staged[1], 'database', staged[3]],
    };
  if (isLegacyUploadFilename(name))
    return { kind: 'upload' as const, scope: 'legacy_upload' as const, parts: [name] };
  return null;
}
function requirePrivate(stat: fs.Stats | BigIntStats) {
  if (
    !stat.isFile() ||
    BigInt(stat.nlink) !== 1n ||
    typeof process.getuid !== 'function' ||
    BigInt(stat.uid) !== BigInt(process.getuid()) ||
    (BigInt(stat.mode) & 0o077n) !== 0n
  )
    fail('destination_unverified');
}
function writeJson(fd: number, name: string, value: unknown): ReceiptStamp {
  const bytes = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(bytes) > 16384) fail('copy_unconfirmed');
  const file = fs.openSync(
    `/proc/self/fd/${fd}/${name}`,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let stamp: ReceiptStamp;
  try {
    requirePrivate(fs.fstatSync(file, { bigint: true }));
    if (legacyMountId(file) !== legacyMountId(fd)) fail('destination_unverified');
    fs.writeFileSync(file, bytes);
    fs.fsyncSync(file);
    const current = fs.fstatSync(file, { bigint: true });
    requirePrivate(current);
    stamp = {
      physicalSha256: physical(current),
      contentSha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    fs.closeSync(file);
  }
  fs.fsyncSync(fd);
  return stamp;
}
function readJson(
  fd: number,
  name: string,
): { value: Record<string, unknown>; stamp: ReceiptStamp } {
  const file = fs.openSync(
    `/proc/self/fd/${fd}/${name}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(file, { bigint: true });
    requirePrivate(stat);
    if (stat.size > 16384n || legacyMountId(file) !== legacyMountId(fd))
      fail('recovery_review_required');
    const buffer = Buffer.alloc(16385),
      count = fs.readSync(file, buffer, 0, buffer.length, 0);
    if (count > 16384 || BigInt(count) !== stat.size) fail('recovery_review_required');
    const value: unknown = JSON.parse(buffer.subarray(0, count).toString('utf8'));
    if (!object(value)) fail('recovery_review_required');
    fs.fsyncSync(file);
    if (physical(fs.fstatSync(file, { bigint: true })) !== physical(stat))
      fail('recovery_review_required');
    return {
      value,
      stamp: {
        physicalSha256: physical(stat),
        contentSha256: createHash('sha256').update(buffer.subarray(0, count)).digest('hex'),
      },
    };
  } finally {
    fs.closeSync(file);
  }
}
function hashPayload(fd: number, size: number, budgetMs: number, expectedPhysical?: string) {
  const before = fs.fstatSync(fd, { bigint: true });
  requirePrivate(before);
  if (before.size !== BigInt(size)) fail('copy_unconfirmed');
  if (expectedPhysical && physical(before) !== expectedPhysical) fail('recovery_review_required');
  const digest = createHash('sha256'),
    buffer = Buffer.alloc(65536),
    deadline = performance.now() + budgetMs;
  let offset = 0;
  while (offset < size) {
    if (performance.now() >= deadline) fail('time_budget');
    const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (!count) fail('copy_unconfirmed');
    digest.update(buffer.subarray(0, count));
    offset += count;
  }
  const physicalSha256 = physical(before);
  if (physical(fs.fstatSync(fd, { bigint: true })) !== physicalSha256) fail('copy_unconfirmed');
  return { sha256: digest.digest('hex'), physicalSha256 };
}
function interpreterPath(options: LegacyCopyVerificationOptions): string {
  let interpreter: string;
  try {
    interpreter = fs.realpathSync.native(options.pythonBin);
    fs.accessSync(interpreter, constants.X_OK);
    if (!fs.statSync(interpreter).isFile()) fail('interpreter_unavailable', options.operationId);
  } catch {
    fail('interpreter_unavailable', options.operationId);
  }
  return interpreter;
}
async function runWorker(
  options: LegacyCopyPreservationOptions,
  source: number,
  destination: number,
): Promise<CopyResult> {
  const interpreter = interpreterPath(options);
  const child = spawn(
    interpreter,
    [
      '-I',
      '-B',
      fileURLToPath(new URL('../../scripts/legacyFileLeaseWorker.py', import.meta.url)),
      '--max-bytes',
      String(options.maxBytes),
      '--time-budget-ms',
      String(options.timeBudgetMs),
      '--expected-physical-sha256',
      options.sourcePhysicalSha256,
    ],
    { env: {}, stdio: ['ignore', 'pipe', 'ignore', source, destination], windowsHide: true },
  );
  return new Promise((resolve, reject) => {
    let output = '',
      invalid = false,
      settled = false;
    const finish = (result?: CopyResult, reason: Reason = 'copy_unconfirmed') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result) resolve(result);
      else reject(new LegacyCopyPreservationError(reason, options.operationId));
    };
    const timer = setTimeout(() => {
      invalid = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, options.timeBudgetMs + 1000);
    child.stdout?.on('data', (data: Buffer) => {
      if (Buffer.byteLength(output) + data.length > 4096) {
        invalid = true;
        child.kill('SIGKILL');
      } else output += data.toString('utf8');
    });
    child.once('error', () => {
      invalid = true;
      if (!child.pid) finish(undefined, 'interpreter_unavailable');
    });
    child.once('close', (code) => {
      try {
        if (invalid) finish();
        else {
          const value: unknown = JSON.parse(output);
          if (!object(value) || value.format !== 1) finish();
          else if (
            code === 2 &&
            keys(value, ['format', 'outcome', 'reason']) &&
            value.outcome === 'refused'
          ) {
            const reason = reasons.find((item) => item === value.reason);
            finish(undefined, reason ?? 'copy_unconfirmed');
          } else if (
            code === 0 &&
            keys(value, ['format', 'outcome', 'bytes', 'sha256', 'sourcePhysicalSha256']) &&
            value.outcome === 'copied' &&
            integer(value.bytes) &&
            value.bytes <= options.maxBytes &&
            typeof value.sha256 === 'string' &&
            HASH.test(value.sha256) &&
            value.sourcePhysicalSha256 === options.sourcePhysicalSha256
          )
            finish({
              format: 1,
              outcome: 'copied',
              bytes: value.bytes,
              sha256: value.sha256,
              sourcePhysicalSha256: options.sourcePhysicalSha256,
            });
          else finish();
        }
      } catch {
        finish();
      }
    });
  });
}
async function withPayloadLease(
  options: LegacyCopyVerificationOptions,
  payload: number,
  expectedPhysicalSha256: string,
  maxBytes: number,
  verify: () => ReturnType<typeof result>,
  finalCheck: () => void,
): Promise<ReturnType<typeof result>> {
  const started = performance.now();
  const child = spawn(
    interpreterPath(options),
    [
      '-I',
      '-B',
      fileURLToPath(new URL('../../scripts/legacyFileLeaseWorker.py', import.meta.url)),
      '--lease-only',
      '--max-bytes',
      String(Math.max(1, maxBytes)),
      '--time-budget-ms',
      String(options.timeBudgetMs),
      '--expected-physical-sha256',
      expectedPhysicalSha256,
    ],
    { env: {}, stdio: ['pipe', 'pipe', 'ignore', payload], windowsHide: true },
  );
  let invalid = false,
    confirmed = false,
    outputBytes = 0;
  child.on('error', () => {
    invalid = true;
  });
  child.stdin?.on('error', () => {
    invalid = true;
  });
  const exited = new Promise<number | null>((resolve) => child.once('close', resolve));
  const timer = setTimeout(() => {
    invalid = true;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, options.timeBudgetMs + 1000);
  const output = child.stdout;
  if (!output || !child.stdin) {
    child.kill('SIGKILL');
    await exited;
    clearTimeout(timer);
    fail('interpreter_unavailable', options.operationId);
  }
  output.on('data', (data: Buffer) => {
    outputBytes += data.length;
    if (outputBytes > 4096) {
      invalid = true;
      child.kill('SIGKILL');
    }
  });
  const reader = createInterface({ input: output, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  const message = async () => {
    const line = await lines.next();
    if (line.done || invalid) fail('lease_interrupted', options.operationId);
    const value: unknown = JSON.parse(line.value);
    if (!object(value) || value.format !== 1) fail('lease_interrupted', options.operationId);
    if (value.outcome === 'refused' && keys(value, ['format', 'outcome', 'reason'])) {
      const reason = reasons.find((item) => item === value.reason);
      fail(reason ?? 'lease_interrupted', options.operationId);
    }
    return value;
  };
  try {
    const ready = await message();
    if (!keys(ready, ['format', 'outcome']) || ready.outcome !== 'leased')
      fail('lease_interrupted', options.operationId);
    const value = verify();
    if (performance.now() - started >= options.timeBudgetMs)
      fail('time_budget', options.operationId);
    child.stdin.write('confirm\n');
    const acknowledgement = await message();
    if (!keys(acknowledgement, ['format', 'outcome']) || acknowledgement.outcome !== 'verified')
      fail('lease_interrupted', options.operationId);
    finalCheck();
    confirmed = true;
    return value;
  } finally {
    child.stdin.end('release\n');
    const code = await exited;
    clearTimeout(timer);
    reader.close();
    if (confirmed && (invalid || code !== 0)) fail('lease_interrupted', options.operationId);
    if (confirmed) finalCheck();
  }
}

function checkCommon(options: LegacyCopyVerificationOptions) {
  if (
    process.platform !== 'linux' ||
    typeof options.pythonBin !== 'string' ||
    !path.isAbsolute(options.pythonBin) ||
    !UUID.test(options.operationId) ||
    !integer(options.timeBudgetMs, 300000) ||
    options.timeBudgetMs < 1
  )
    fail('invalid_arguments');
}
function result(operationId: string, bytes: number, kind: string) {
  return {
    success: true,
    operationId,
    bytes,
    kind,
    copyVerified: true,
    sourceRemoved: false,
    cohortWriterFenceVerified: false,
    adoptionAdmission: 'unavailable',
    deletionAdmission: 'unavailable',
  } as const;
}

/** A verified per-file byte copy, never source removal or whole-service/adoption authority. */
export async function preserveLegacyCopy(options: LegacyCopyPreservationOptions) {
  checkCommon(options);
  if (
    !HASH.test(options.sourcePhysicalSha256) ||
    !integer(options.maxBytes) ||
    options.maxBytes < 1 ||
    !path.isAbsolute(options.pythonBin)
  )
    fail('invalid_arguments', options.operationId);
  const selected = legacyPreservationSelection(options.sourceName);
  if (!selected) fail('invalid_arguments', options.operationId);
  const handles: number[] = [];
  let workerCopy: CopyResult | null = null;
  let bundle: number | undefined, destination: number | undefined;
  try {
    const sourceRoot = canonical(
      selected.scope === 'backup' ? options.backupRoot : (options.uploadRoot ?? ''),
    );
    const sourceRootStat = fs.lstatSync(sourceRoot, { bigint: true }),
      sourceRootFd = directory(sourceRoot, sourceRootStat);
    handles.push(sourceRootFd);
    const sourceMount = legacyMountId(sourceRootFd);
    const target = protectedRoot(options.protectedRoot);
    handles.push(target.fd);
    if (
      within(sourceRoot, target.root) ||
      within(target.root, sourceRoot) ||
      within(canonical(options.backupRoot), target.root) ||
      (options.uploadRoot && within(canonical(options.uploadRoot), target.root))
    )
      fail('destination_unverified', options.operationId);
    const sourceRoots = [
      sourceRoot,
      canonical(options.backupRoot),
      ...(options.uploadRoot ? [canonical(options.uploadRoot)] : []),
    ];
    const requireSeparateStorage = () => {
      const targets = mountAliases(target.fd, target.root);
      if (
        sourceRoots.some((root) => targets.some((alias) => within(root, alias))) ||
        mountAliases(sourceRootFd, sourceRoot).some((alias) => within(target.root, alias))
      )
        fail('destination_unverified', options.operationId);
    };
    requireSeparateStorage();
    let parent = sourceRootFd;
    const parents: Array<{ fd: number; name: string; identity: BigIntStats }> = [];
    for (const part of selected.parts.slice(0, -1)) {
      const filename = `/proc/self/fd/${parent}/${part}`,
        identity = fs.lstatSync(filename, { bigint: true });
      if (
        !identity.isDirectory() ||
        identity.isSymbolicLink() ||
        identity.dev !== sourceRootStat.dev
      )
        fail('source_unverified', options.operationId);
      const child = directory(filename, identity);
      handles.push(child);
      if (legacyMountId(child) !== sourceMount) fail('source_unverified', options.operationId);
      parents.push({ fd: parent, name: part, identity });
      parent = child;
    }
    const leaf = selected.parts.at(-1);
    if (!leaf) fail('invalid_arguments', options.operationId);
    const source = fs.openSync(
      `/proc/self/fd/${parent}/${leaf}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    handles.push(source);
    const sourceStat = fs.fstatSync(source, { bigint: true });
    if (
      !sourceStat.isFile() ||
      sourceStat.nlink !== 1n ||
      sourceStat.dev !== sourceRootStat.dev ||
      legacyMountId(source) !== sourceMount ||
      physical(sourceStat) !== options.sourcePhysicalSha256
    )
      fail('source_unverified', options.operationId);
    if (sourceStat.size > BigInt(options.maxBytes)) fail('byte_limit', options.operationId);
    const bundlePath = `/proc/self/fd/${target.fd}/legacy-preserve-${options.operationId}`;
    try {
      fs.mkdirSync(bundlePath, { mode: 0o700 });
    } catch (error) {
      if (object(error) && error.code === 'EEXIST') fail('operation_exists', options.operationId);
      throw error;
    }
    fs.fsyncSync(target.fd);
    const openedBundle = directory(bundlePath);
    handles.push(openedBundle);
    if (legacyMountId(openedBundle) !== legacyMountId(target.fd))
      fail('destination_unverified', options.operationId);
    bundle = openedBundle;
    const preparedReceipt = writeJson(bundle, 'prepared.json', {
      format: 1,
      operationId: options.operationId,
      algorithm: ALGORITHM,
      sourceKind: selected.kind,
      sourceName: options.sourceName,
      sourceRootSha256: rootIdentity(sourceRoot, sourceRootStat),
      sourcePhysicalSha256: options.sourcePhysicalSha256,
      sourceSize: Number(sourceStat.size),
      sourceUid: Number(sourceStat.uid),
      protectedRootSha256: target.sha256,
      createdAtEpoch: Math.floor(Date.now() / 1000),
      cohortWriterFenceVerified: false,
      adoptionAdmission: 'unavailable',
      deletionAdmission: 'unavailable',
    });
    destination = fs.openSync(
      `/proc/self/fd/${bundle}/payload.bin`,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    handles.push(destination);
    if (legacyMountId(destination) !== legacyMountId(target.fd))
      fail('destination_unverified', options.operationId);
    requirePrivate(fs.fstatSync(destination));
    fs.fsyncSync(bundle);
    const copied = await runWorker(options, source, destination);
    workerCopy = copied;
    if (
      copied.bytes !== Number(sourceStat.size) ||
      physical(fs.fstatSync(source, { bigint: true })) !== options.sourcePhysicalSha256 ||
      physical(fs.lstatSync(`/proc/self/fd/${parent}/${leaf}`, { bigint: true })) !==
        options.sourcePhysicalSha256 ||
      parents.some(
        (item) =>
          physical(fs.lstatSync(`/proc/self/fd/${item.fd}/${item.name}`, { bigint: true })) !==
          physical(item.identity),
      )
    )
      fail('source_changed', options.operationId);
    const currentRoot = fs.lstatSync(sourceRoot, { bigint: true });
    if (
      currentRoot.dev !== sourceRootStat.dev ||
      currentRoot.ino !== sourceRootStat.ino ||
      !currentRoot.isDirectory()
    )
      fail('source_changed', options.operationId);
    // Close every writable description before requesting the payload read lease.
    const leasedPayload = fs.openSync(
      '/proc/self/fd/' + destination,
      constants.O_RDONLY | constants.O_NONBLOCK,
    );
    const handle = handles.indexOf(destination);
    if (handle < 0) fail('destination_unverified', options.operationId);
    handles.splice(handle, 1, leasedPayload);
    fs.closeSync(destination);
    destination = leasedPayload;
    const leasedBundle = bundle;
    const expectedPayload = physical(fs.fstatSync(leasedPayload, { bigint: true }));
    let completeStamp: ReturnType<typeof writeJson> | undefined;
    return await withPayloadLease(
      options,
      leasedPayload,
      expectedPayload,
      options.maxBytes,
      () => {
        const verifiedPayload = hashPayload(leasedPayload, copied.bytes, options.timeBudgetMs);
        if (verifiedPayload.sha256 !== copied.sha256) fail('copy_unconfirmed', options.operationId);
        const payloadPhysicalSha256 = verifiedPayload.physicalSha256;
        fs.fsyncSync(leasedPayload);
        requireNamedCopy(
          target,
          leasedBundle,
          leasedPayload,
          options.operationId,
          payloadPhysicalSha256,
        );
        const completeReceipt = writeJson(leasedBundle, 'complete.json', {
          format: 1,
          operationId: options.operationId,
          algorithm: ALGORITHM,
          sourcePhysicalSha256: options.sourcePhysicalSha256,
          sourceSize: copied.bytes,
          copySha256: copied.sha256,
          payloadPhysicalSha256,
          completedAtEpoch: Math.floor(Date.now() / 1000),
          fileWriteLeaseVerified: true,
        });
        completeStamp = completeReceipt;
        fs.fsyncSync(leasedBundle);
        fs.fsyncSync(target.fd);
        requireSeparateStorage();
        requireCompleteBundle(
          target,
          leasedBundle,
          leasedPayload,
          options.operationId,
          payloadPhysicalSha256,
          {
            'prepared.json': preparedReceipt,
            'complete.json': completeReceipt,
          },
        );
        return result(options.operationId, copied.bytes, selected.kind);
      },
      () => {
        if (!completeStamp) fail('copy_unconfirmed', options.operationId);
        requireSeparateStorage();
        requireCompleteBundle(
          target,
          leasedBundle,
          leasedPayload,
          options.operationId,
          expectedPayload,
          {
            'prepared.json': preparedReceipt,
            'complete.json': completeStamp,
          },
        );
      },
    );
  } catch (error) {
    const problem = new LegacyCopyPreservationError(
      error instanceof LegacyCopyPreservationError ? error.reason : 'copy_unconfirmed',
      options.operationId,
    );
    if (bundle !== undefined)
      try {
        writeJson(bundle, 'failed.json', {
          format: 1,
          operationId: options.operationId,
          reason: problem.reason,
          copyVerified: false,
          workerCopy,
        });
      } catch {
        throw new LegacyCopyPreservationError('recovery_review_required', options.operationId);
      }
    throw problem;
  } finally {
    closeAll(handles, options.operationId);
  }
}

/** Restart verification never needs the original file or namespace and never promotes incomplete work. */
export async function verifyPreservedLegacyCopy(options: LegacyCopyVerificationOptions) {
  checkCommon(options);
  const handles: number[] = [];
  try {
    const target = protectedRoot(options.protectedRoot);
    handles.push(target.fd);
    const bundle = directory(`/proc/self/fd/${target.fd}/legacy-preserve-${options.operationId}`);
    handles.push(bundle);
    if (legacyMountId(bundle) !== legacyMountId(target.fd))
      fail('destination_unverified', options.operationId);
    const info = fs.fstatSync(bundle);
    if (
      typeof process.getuid !== 'function' ||
      info.uid !== process.getuid() ||
      (info.mode & 0o077) !== 0
    )
      fail('recovery_review_required', options.operationId);
    const entries = fs.opendirSync(`/proc/self/fd/${bundle}`);
    try {
      let count = 0;
      for (let entry = entries.readSync(); entry; entry = entries.readSync())
        if (++count > 4 || !['prepared.json', 'complete.json', 'payload.bin'].includes(entry.name))
          fail('recovery_review_required', options.operationId);
    } finally {
      entries.closeSync();
    }
    const preparedReceipt = readJson(bundle, 'prepared.json'),
      completeReceipt = readJson(bundle, 'complete.json');
    const prepared = preparedReceipt.value,
      complete = completeReceipt.value;
    if (
      !keys(prepared, [
        'format',
        'operationId',
        'algorithm',
        'sourceKind',
        'sourceName',
        'sourceRootSha256',
        'sourcePhysicalSha256',
        'sourceSize',
        'sourceUid',
        'protectedRootSha256',
        'createdAtEpoch',
        'cohortWriterFenceVerified',
        'adoptionAdmission',
        'deletionAdmission',
      ]) ||
      prepared.format !== 1 ||
      prepared.operationId !== options.operationId ||
      prepared.algorithm !== ALGORITHM ||
      typeof prepared.sourceName !== 'string' ||
      legacyPreservationSelection(prepared.sourceName)?.kind !== prepared.sourceKind ||
      typeof prepared.sourceRootSha256 !== 'string' ||
      !HASH.test(prepared.sourceRootSha256) ||
      typeof prepared.sourcePhysicalSha256 !== 'string' ||
      !HASH.test(prepared.sourcePhysicalSha256) ||
      !integer(prepared.sourceSize) ||
      !integer(prepared.sourceUid, 4294967295) ||
      prepared.protectedRootSha256 !== target.sha256 ||
      !integer(prepared.createdAtEpoch, 253402300799) ||
      prepared.cohortWriterFenceVerified !== false ||
      prepared.adoptionAdmission !== 'unavailable' ||
      prepared.deletionAdmission !== 'unavailable'
    )
      fail('recovery_review_required', options.operationId);
    if (
      !keys(complete, [
        'format',
        'operationId',
        'algorithm',
        'sourcePhysicalSha256',
        'sourceSize',
        'copySha256',
        'payloadPhysicalSha256',
        'completedAtEpoch',
        'fileWriteLeaseVerified',
      ]) ||
      complete.format !== 1 ||
      complete.operationId !== options.operationId ||
      complete.algorithm !== ALGORITHM ||
      complete.sourcePhysicalSha256 !== prepared.sourcePhysicalSha256 ||
      complete.sourceSize !== prepared.sourceSize ||
      typeof complete.copySha256 !== 'string' ||
      !HASH.test(complete.copySha256) ||
      typeof complete.payloadPhysicalSha256 !== 'string' ||
      !HASH.test(complete.payloadPhysicalSha256) ||
      !integer(complete.completedAtEpoch, 253402300799) ||
      complete.fileWriteLeaseVerified !== true
    )
      fail('recovery_review_required', options.operationId);
    const file = fs.openSync(
      `/proc/self/fd/${bundle}/payload.bin`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    handles.push(file);
    if (legacyMountId(file) !== legacyMountId(target.fd))
      fail('destination_unverified', options.operationId);
    const sourceSize = prepared.sourceSize;
    const expectedPayload = complete.payloadPhysicalSha256;
    return await withPayloadLease(
      options,
      file,
      expectedPayload,
      sourceSize,
      () => {
        const verifiedPayload = hashPayload(
          file,
          sourceSize,
          options.timeBudgetMs,
          expectedPayload,
        );
        if (verifiedPayload.sha256 !== complete.copySha256)
          fail('recovery_review_required', options.operationId);
        fs.fsyncSync(file);
        fs.fsyncSync(bundle);
        fs.fsyncSync(target.fd);
        requireCompleteBundle(target, bundle, file, options.operationId, expectedPayload, {
          'prepared.json': preparedReceipt.stamp,
          'complete.json': completeReceipt.stamp,
        });
        return result(options.operationId, sourceSize, String(prepared.sourceKind));
      },
      () =>
        requireCompleteBundle(target, bundle, file, options.operationId, expectedPayload, {
          'prepared.json': preparedReceipt.stamp,
          'complete.json': completeReceipt.stamp,
        }),
    );
  } catch (error) {
    throw new LegacyCopyPreservationError(
      error instanceof LegacyCopyPreservationError ? error.reason : 'recovery_review_required',
      options.operationId,
    );
  } finally {
    closeAll(handles, options.operationId);
  }
}

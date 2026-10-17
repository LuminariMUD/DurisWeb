import fs, { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  isLegacyUploadFilename,
  isLegacySqlMemberFilename,
  legacyCopyPhysicalSha256 as physical,
  legacyMountId,
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
/** Map the opened directory's filesystem location through every visible bind alias. */
function mountAliases(fd: number, filename: string): string[] {
  const id = legacyMountId(fd);
  const unescape = (value: string) =>
    value.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
  const mounts = fs
    .readFileSync('/proc/self/mountinfo', 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const fields = line.split(' ');
      if (fields.length < 6 || !/^[0-9]+:[0-9]+$/.test(fields[2])) fail('destination_unverified');
      const root = unescape(fields[3]),
        point = unescape(fields[4]);
      return { id: fields[0], device: fields[2], root, point };
    });
  const mounted = mounts.find((item) => item.id === id);
  if (
    !mounted ||
    !path.isAbsolute(mounted.root) ||
    !path.isAbsolute(mounted.point) ||
    !within(mounted.point, filename)
  )
    fail('destination_unverified');
  // Unrelated namespace-handle mounts use roots such as net:[123], not paths.
  const related = mounts.filter((item) => item.device === mounted.device);
  if (related.some((item) => !path.isAbsolute(item.root) || !path.isAbsolute(item.point)))
    fail('destination_unverified');
  const location = path.resolve(mounted.root, path.relative(mounted.point, filename));
  return related
    .filter((item) => within(item.root, location))
    .map((item) => path.resolve(item.point, path.relative(item.root, location)));
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
    ['/tmp', '/var/tmp', '/run', '/dev', '/proc', '/sys'].some((prefix) => within(prefix, value))
  )
    fail('root_unverified');
  return { root: value, stat, sha256: rootIdentity(value, stat), fd: directory(value, stat) };
}
function requireSameProtectedRoot(target: ReturnType<typeof protectedRoot>) {
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
  const namedBundle = fs.lstatSync(`/proc/self/fd/${target.fd}/legacy-preserve-${operationId}`, {
    bigint: true,
  });
  const openedBundle = fs.fstatSync(bundle, { bigint: true });
  if (
    !namedBundle.isDirectory() ||
    namedBundle.dev !== openedBundle.dev ||
    namedBundle.ino !== openedBundle.ino ||
    namedBundle.uid !== target.stat.uid ||
    (namedBundle.mode & 0o077n) !== 0n
  )
    fail('destination_unverified', operationId);
  const namedPayload = fs.lstatSync(`/proc/self/fd/${bundle}/payload.bin`, { bigint: true });
  requirePrivate(fs.fstatSync(payload));
  if (
    !namedPayload.isFile() ||
    namedPayload.isSymbolicLink() ||
    physical(namedPayload) !== payloadPhysicalSha256 ||
    physical(fs.fstatSync(payload, { bigint: true })) !== payloadPhysicalSha256
  )
    fail('destination_unverified', operationId);
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
function requirePrivate(stat: fs.Stats) {
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    typeof process.getuid !== 'function' ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0
  )
    fail('destination_unverified');
}
function writeJson(fd: number, name: string, value: unknown) {
  const bytes = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(bytes) > 16384) fail('copy_unconfirmed');
  const file = fs.openSync(
    `/proc/self/fd/${fd}/${name}`,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    requirePrivate(fs.fstatSync(file));
    fs.writeFileSync(file, bytes);
    fs.fsyncSync(file);
  } finally {
    fs.closeSync(file);
  }
  fs.fsyncSync(fd);
}
function readJson(fd: number, name: string): Record<string, unknown> {
  const file = fs.openSync(
    `/proc/self/fd/${fd}/${name}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(file);
    requirePrivate(stat);
    if (stat.size > 16384) fail('recovery_review_required');
    const buffer = Buffer.alloc(16385),
      count = fs.readSync(file, buffer, 0, buffer.length, 0);
    if (count > 16384) fail('recovery_review_required');
    const value: unknown = JSON.parse(buffer.subarray(0, count).toString('utf8'));
    if (!object(value)) fail('recovery_review_required');
    fs.fsyncSync(file);
    return value;
  } finally {
    fs.closeSync(file);
  }
}
async function runWorker(
  options: LegacyCopyPreservationOptions,
  source: number,
  destination: number,
): Promise<CopyResult> {
  let interpreter: string;
  try {
    interpreter = fs.realpathSync.native(options.pythonBin);
    fs.accessSync(interpreter, constants.X_OK);
    if (!fs.statSync(interpreter).isFile()) fail('interpreter_unavailable', options.operationId);
  } catch {
    fail('interpreter_unavailable', options.operationId);
  }
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
function checkCommon(options: LegacyCopyVerificationOptions) {
  if (
    process.platform !== 'linux' ||
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
    bundle = directory(bundlePath);
    handles.push(bundle);
    writeJson(bundle, 'prepared.json', {
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
    const payload = fs.fstatSync(destination);
    requirePrivate(payload);
    if (payload.size !== copied.bytes) fail('copy_unconfirmed', options.operationId);
    const payloadPhysicalSha256 = physical(fs.fstatSync(destination, { bigint: true }));
    fs.fsyncSync(destination);
    requireNamedCopy(target, bundle, destination, options.operationId, payloadPhysicalSha256);
    writeJson(bundle, 'complete.json', {
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
    fs.fsyncSync(bundle);
    fs.fsyncSync(target.fd);
    requireSeparateStorage();
    requireNamedCopy(target, bundle, destination, options.operationId, payloadPhysicalSha256);
    return result(options.operationId, copied.bytes, selected.kind);
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
export function verifyPreservedLegacyCopy(options: LegacyCopyVerificationOptions) {
  checkCommon(options);
  const handles: number[] = [];
  try {
    const target = protectedRoot(options.protectedRoot);
    handles.push(target.fd);
    const bundle = directory(`/proc/self/fd/${target.fd}/legacy-preserve-${options.operationId}`);
    handles.push(bundle);
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
    const prepared = readJson(bundle, 'prepared.json'),
      complete = readJson(bundle, 'complete.json');
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
    const stat = fs.fstatSync(file);
    requirePrivate(stat);
    if (
      stat.size !== prepared.sourceSize ||
      physical(fs.fstatSync(file, { bigint: true })) !== complete.payloadPhysicalSha256
    )
      fail('recovery_review_required', options.operationId);
    const digest = createHash('sha256'),
      buffer = Buffer.alloc(65536),
      deadline = performance.now() + options.timeBudgetMs;
    let offset = 0;
    while (offset < stat.size) {
      if (performance.now() >= deadline) fail('time_budget', options.operationId);
      const count = fs.readSync(
        file,
        buffer,
        0,
        Math.min(buffer.length, stat.size - offset),
        offset,
      );
      if (!count) fail('copy_unconfirmed', options.operationId);
      digest.update(buffer.subarray(0, count));
      offset += count;
    }
    if (
      digest.digest('hex') !== complete.copySha256 ||
      physical(fs.fstatSync(file, { bigint: true })) !== complete.payloadPhysicalSha256
    )
      fail('recovery_review_required', options.operationId);
    fs.fsyncSync(file);
    fs.fsyncSync(bundle);
    fs.fsyncSync(target.fd);
    requireNamedCopy(target, bundle, file, options.operationId, complete.payloadPhysicalSha256);
    return result(options.operationId, stat.size, String(prepared.sourceKind));
  } catch (error) {
    throw new LegacyCopyPreservationError(
      error instanceof LegacyCopyPreservationError ? error.reason : 'recovery_review_required',
      options.operationId,
    );
  } finally {
    closeAll(handles, options.operationId);
  }
}

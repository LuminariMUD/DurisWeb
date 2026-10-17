import fs, { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { captureArchiveWorker } from '../utils/archiveWorkerIdentity.js';

type InventoryFailure =
  | 'invalid_arguments'
  | 'root_unverified'
  | 'inventory_unconfirmed'
  | 'private_output_required'
  | 'output_unconfirmed';
export class LegacyBackupInventoryError extends Error {
  readonly reference = randomUUID();
  constructor(readonly reason: InventoryFailure) {
    super('Legacy-copy inventory was not confirmed. Preserve files and review the reference.');
    this.name = 'LegacyBackupInventoryError';
  }
}
export interface LegacyCopyObservation {
  kind: 'sql_dump' | 'staging' | 'upload';
  name: string;
  backupIdHint: number | null;
  outcome: 'writer_unverified' | 'unsafe_shape' | 'unreadable' | 'changed';
  physicalSha256: string | null;
  sizeBytes: string | null;
  sqlMember: { name: string; physicalSha256: string; sizeBytes: string } | null;
}
export interface LegacyRootInventory {
  scope: 'backup' | 'legacy_upload';
  rootSha256: string;
  scanComplete: boolean;
  stoppedBecause:
    | null
    | 'entry_limit'
    | 'copy_limit'
    | 'time_budget'
    | 'root_changed'
    | 'unreadable';
  entriesSeen: number;
  otherEntries: number;
  unknownLegacyEntries: number;
  copies: LegacyCopyObservation[];
}
export interface LegacyBackupInventory {
  format: 1;
  observationId: string;
  observedAtEpoch: number;
  mountDomainSha256: string;
  coverage: 'selected_roots_only';
  snapshotConsistent: false;
  writerFenceVerified: false;
  deletionAdmission: 'unavailable';
  legacyUploadScope: 'selected' | 'not_selected';
  roots: LegacyRootInventory[];
}
const MAX_ENTRIES = 10000,
  MAX_COPIES = 1000,
  TIME_BUDGET_MS = 5000;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function physical(stat: BigIntStats): string {
  return hash([
    stat.dev.toString(),
    stat.ino.toString(),
    stat.mode.toString(),
    stat.nlink.toString(),
    stat.size.toString(),
    stat.mtimeNs.toString(),
    stat.ctimeNs.toString(),
  ]);
}
export function isLegacySqlMemberFilename(name: string): boolean {
  return (
    name.length > 4 &&
    Buffer.byteLength(name) <= 255 &&
    name.endsWith('.sql') &&
    !/[/\\\0\r\n]/.test(name)
  );
}
/** The old MIME-based uploader kept the original extension, including non-ZIP suffixes. */
export function isLegacyUploadFilename(name: string): boolean {
  return (
    Buffer.byteLength(name) <= 255 &&
    /^backup-upload-[0-9]{1,16}-[0-9]{1,10}(?:\.[^/\\\0\r\n]*)?$/.test(name)
  );
}
function mountId(fd: number): string {
  const value = /^mnt_id:\s+([1-9][0-9]*)$/m.exec(
    fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8'),
  )?.[1];
  if (!value) throw new LegacyBackupInventoryError('root_unverified');
  return value;
}
function classify(scope: LegacyRootInventory['scope'], name: string) {
  const dump = scope === 'backup' ? /^temp_([1-9][0-9]{0,9})\.sql$/.exec(name) : null;
  const staging = scope === 'backup' ? /^temp_staging_([1-9][0-9]{0,9})$/.exec(name) : null;
  if (dump || staging) {
    const id = Number((dump ?? staging)?.[1]);
    if (id > 4294967295) return null;
    return { kind: dump ? ('sql_dump' as const) : ('staging' as const), backupIdHint: id };
  }
  if (scope === 'legacy_upload' && isLegacyUploadFilename(name))
    return { kind: 'upload' as const, backupIdHint: null };
  return null;
}
function directoryNames(fd: number): string[] {
  const directory = fs.opendirSync(`/proc/self/fd/${fd}`);
  const names: string[] = [];
  try {
    // The traced staging tree has exactly one child at each level. Two prove a mismatch.
    for (let entry = directory.readSync(); entry && names.length < 2; entry = directory.readSync())
      names.push(entry.name);
    return names;
  } finally {
    directory.closeSync();
  }
}
function openEntry(filename: string, expected: BigIntStats): number {
  const fd = fs.openSync(
    filename,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      (expected.isDirectory() ? constants.O_DIRECTORY : constants.O_NONBLOCK),
  );
  const opened = fs.fstatSync(fd, { bigint: true });
  if (opened.dev !== expected.dev || physical(opened) !== physical(expected)) {
    fs.closeSync(fd);
    throw new LegacyBackupInventoryError('root_unverified');
  }
  return fd;
}
function observe(
  fd: number,
  device: bigint,
  rootMountId: string,
  scope: LegacyRootInventory['scope'],
  name: string,
): LegacyCopyObservation | null {
  const kind = classify(scope, name);
  if (!kind) return null;
  const item: LegacyCopyObservation = {
    ...kind,
    name,
    outcome: 'unreadable',
    physicalSha256: null,
    sizeBytes: null,
    sqlMember: null,
  };
  const filename = `/proc/self/fd/${fd}/${name}`;
  let stagingFd: number | undefined, databaseFd: number | undefined, fileFd: number | undefined;
  try {
    const stat = fs.lstatSync(filename, { bigint: true });
    item.physicalSha256 = physical(stat);
    if (
      stat.dev !== device ||
      stat.isSymbolicLink() ||
      (kind.kind !== 'staging' && (!stat.isFile() || stat.nlink !== 1n)) ||
      (kind.kind === 'staging' && !stat.isDirectory())
    ) {
      item.outcome = 'unsafe_shape';
      return item;
    }
    if (kind.kind === 'staging') {
      stagingFd = openEntry(filename, stat);
      if (
        mountId(stagingFd) !== rootMountId ||
        directoryNames(stagingFd).join(',') !== 'database'
      ) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const databasePath = `/proc/self/fd/${stagingFd}/database`;
      const databaseStat = fs.lstatSync(databasePath, { bigint: true });
      if (
        !databaseStat.isDirectory() ||
        databaseStat.isSymbolicLink() ||
        databaseStat.dev !== device
      ) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      databaseFd = openEntry(databasePath, databaseStat);
      if (mountId(databaseFd) !== rootMountId) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const names = directoryNames(databaseFd);
      if (names.length !== 1 || !isLegacySqlMemberFilename(names[0])) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const sql = fs.lstatSync(`/proc/self/fd/${databaseFd}/${names[0]}`, { bigint: true });
      if (!sql.isFile() || sql.isSymbolicLink() || sql.nlink !== 1n || sql.dev !== device) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      fileFd = openEntry(`/proc/self/fd/${databaseFd}/${names[0]}`, sql);
      if (mountId(fileFd) !== rootMountId) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      item.sizeBytes = sql.size.toString();
      item.sqlMember = {
        name: 'database/' + names[0],
        physicalSha256: physical(sql),
        sizeBytes: sql.size.toString(),
      };
      if (
        physical(fs.lstatSync(`/proc/self/fd/${databaseFd}/${names[0]}`, { bigint: true })) !==
          physical(sql) ||
        physical(fs.lstatSync(databasePath, { bigint: true })) !== physical(databaseStat) ||
        physical(fs.fstatSync(databaseFd, { bigint: true })) !== physical(databaseStat) ||
        physical(fs.fstatSync(stagingFd, { bigint: true })) !== physical(stat)
      ) {
        item.outcome = 'changed';
        return item;
      }
    } else {
      fileFd = openEntry(filename, stat);
      if (mountId(fileFd) !== rootMountId) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      item.sizeBytes = stat.size.toString();
    }
    item.outcome =
      physical(fs.lstatSync(filename, { bigint: true })) === physical(stat)
        ? 'writer_unverified'
        : 'changed';
    return item;
  } catch {
    return item;
  } finally {
    if (fileFd !== undefined) fs.closeSync(fileFd);
    if (databaseFd !== undefined) fs.closeSync(databaseFd);
    if (stagingFd !== undefined) fs.closeSync(stagingFd);
  }
}
function inspectRoot(
  root: string,
  scope: LegacyRootInventory['scope'],
  deadline: number,
): LegacyRootInventory {
  let fd: number | undefined;
  try {
    const canonical = fs.realpathSync.native(root),
      stat = fs.lstatSync(canonical, { bigint: true });
    const filesystem = fs.statfsSync(canonical, { bigint: true });
    if (path.resolve(root) !== canonical || !stat.isDirectory())
      throw new LegacyBackupInventoryError('root_unverified');
    fd = openEntry(canonical, stat);
    const rootMountId = mountId(fd);
    const result: LegacyRootInventory = {
      scope,
      rootSha256: hash([
        canonical,
        filesystem.type.toString(),
        stat.dev.toString(),
        stat.ino.toString(),
      ]),
      scanComplete: false,
      stoppedBecause: null,
      entriesSeen: 0,
      otherEntries: 0,
      unknownLegacyEntries: 0,
      copies: [],
    };
    const directory = fs.opendirSync(`/proc/self/fd/${fd}`);
    try {
      while (true) {
        if (performance.now() >= deadline) {
          result.stoppedBecause = 'time_budget';
          break;
        }
        const entry = directory.readSync();
        if (!entry) {
          result.scanComplete = true;
          break;
        }
        if (result.entriesSeen >= MAX_ENTRIES) {
          result.stoppedBecause = 'entry_limit';
          break;
        }
        if (result.copies.length >= MAX_COPIES) {
          result.stoppedBecause = 'copy_limit';
          break;
        }
        result.entriesSeen++;
        const item = observe(fd, stat.dev, rootMountId, scope, entry.name);
        if (item) result.copies.push(item);
        else if (
          (scope === 'backup' && entry.name.startsWith('temp_')) ||
          (scope === 'legacy_upload' && entry.name.startsWith('backup-upload-'))
        )
          result.unknownLegacyEntries++;
        else result.otherEntries++;
      }
    } catch {
      result.stoppedBecause = 'unreadable';
    } finally {
      directory.closeSync();
    }
    if (
      physical(fs.fstatSync(fd, { bigint: true })) !== physical(stat) ||
      physical(fs.lstatSync(canonical, { bigint: true })) !== physical(stat)
    ) {
      result.scanComplete = false;
      result.stoppedBecause = 'root_changed';
    }
    result.copies.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    return result;
  } catch {
    throw new LegacyBackupInventoryError('root_unverified');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
/** Metadata observations only. No content read, SQL access, writer signal, adoption or removal. */
export async function inventoryLegacyBackupCopies(
  backupRoot: string,
  uploadRoot?: string,
): Promise<LegacyBackupInventory> {
  if (
    process.platform !== 'linux' ||
    !path.isAbsolute(backupRoot) ||
    /[\0\r\n]/.test(backupRoot) ||
    (uploadRoot !== undefined && (!path.isAbsolute(uploadRoot) || /[\0\r\n]/.test(uploadRoot)))
  )
    throw new LegacyBackupInventoryError('invalid_arguments');
  try {
    const self = await captureArchiveWorker(process.pid);
    const mountNamespace = fs.readlinkSync('/proc/self/ns/mnt');
    if (!/^mnt:\[[0-9]+\]$/.test(mountNamespace))
      throw new LegacyBackupInventoryError('root_unverified');
    const deadline = performance.now() + TIME_BUDGET_MS;
    const roots = [inspectRoot(backupRoot, 'backup', deadline)];
    if (uploadRoot !== undefined) roots.push(inspectRoot(uploadRoot, 'legacy_upload', deadline));
    return {
      format: 1,
      observationId: randomUUID(),
      observedAtEpoch: Math.floor(Date.now() / 1000),
      mountDomainSha256: hash([self.domainSha256, mountNamespace]),
      coverage: 'selected_roots_only',
      snapshotConsistent: false,
      writerFenceVerified: false,
      deletionAdmission: 'unavailable',
      legacyUploadScope: uploadRoot === undefined ? 'not_selected' : 'selected',
      roots,
    };
  } catch (error) {
    throw error instanceof LegacyBackupInventoryError
      ? error
      : new LegacyBackupInventoryError('inventory_unconfirmed');
  }
}
/** New owner-only evidence outside scanned roots; unknown write/sync retains any partial output. */
export function writeLegacyBackupInventory(
  filename: string,
  inventory: LegacyBackupInventory,
  roots: string[],
): void {
  let fd: number | undefined, parentFd: number | undefined;
  try {
    if (
      !path.isAbsolute(filename) ||
      /[\0\r\n]/.test(filename) ||
      typeof process.getuid !== 'function'
    )
      throw new LegacyBackupInventoryError('private_output_required');
    const parent = fs.realpathSync.native(path.dirname(filename));
    if (path.resolve(path.dirname(filename)) !== parent)
      throw new LegacyBackupInventoryError('private_output_required');
    for (const root of roots) {
      const relative = path.relative(fs.realpathSync.native(root), parent);
      if (
        !relative ||
        (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative))
      )
        throw new LegacyBackupInventoryError('private_output_required');
    }
    const stat = fs.lstatSync(parent, { bigint: true });
    if (!stat.isDirectory() || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o077n) !== 0n)
      throw new LegacyBackupInventoryError('private_output_required');
    parentFd = openEntry(parent, stat);
    const data = JSON.stringify(inventory) + '\n';
    if (Buffer.byteLength(data) > 1024 * 1024)
      throw new LegacyBackupInventoryError('output_unconfirmed');
    fd = fs.openSync(
      `/proc/self/fd/${parentFd}/${path.basename(filename)}`,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const output = fs.fstatSync(fd);
    if (
      !output.isFile() ||
      output.uid !== process.getuid() ||
      output.nlink !== 1 ||
      (output.mode & 0o077) !== 0
    )
      throw new LegacyBackupInventoryError('private_output_required');
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.fsyncSync(parentFd);
    const currentParent = fs.lstatSync(parent, { bigint: true });
    if (
      !currentParent.isDirectory() ||
      currentParent.dev !== stat.dev ||
      currentParent.ino !== stat.ino
    )
      throw new LegacyBackupInventoryError('output_unconfirmed');
  } catch (error) {
    throw error instanceof LegacyBackupInventoryError
      ? error
      : new LegacyBackupInventoryError('output_unconfirmed');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (parentFd !== undefined) fs.closeSync(parentFd);
  }
}

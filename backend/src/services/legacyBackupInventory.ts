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
  rootMountId: string;
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
class InventoryBudgetExceeded extends Error {}
function checkBudget(deadline: number): void {
  if (performance.now() >= deadline) throw new InventoryBudgetExceeded();
}
function withinBudget<T>(deadline: number, action: () => T): T {
  checkBudget(deadline);
  const value = action();
  checkBudget(deadline);
  return value;
}
function fstatWithinBudget(fd: number, deadline: number): BigIntStats {
  return withinBudget(deadline, () => fs.fstatSync(fd, { bigint: true }));
}
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
export { physical as legacyCopyPhysicalSha256 };
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
function mountId(fd: number, deadline = Number.POSITIVE_INFINITY): string {
  const value = /^mnt_id:\s+([1-9][0-9]*)$/m.exec(
    withinBudget(deadline, () => fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8')),
  )?.[1];
  if (!value) throw new LegacyBackupInventoryError('root_unverified');
  return value;
}
export { mountId as legacyMountId };
function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    !relative || (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative))
  );
}
/** Map the opened directory's filesystem location through every visible bind alias. */
export function legacyDirectoryAliases(fd: number, filename: string): string[] {
  const id = mountId(fd);
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
      if (fields.length < 6 || !/^[0-9]+:[0-9]+$/.test(fields[2]))
        throw new Error('Mount metadata could not be verified');
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
    throw new Error('Mount metadata could not be verified');
  // Unrelated namespace-handle mounts use roots such as net:[123], not paths.
  const related = mounts.filter((item) => item.device === mounted.device);
  if (related.some((item) => !path.isAbsolute(item.root) || !path.isAbsolute(item.point)))
    throw new Error('Mount metadata could not be verified');
  const location = path.resolve(mounted.root, path.relative(mounted.point, filename));
  return related
    .filter((item) => within(item.root, location))
    .map((item) => path.resolve(item.point, path.relative(item.root, location)));
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
function directoryNames(fd: number, deadline: number): string[] {
  checkBudget(deadline);
  const directory = fs.opendirSync(`/proc/self/fd/${fd}`);
  const names: string[] = [];
  try {
    // The traced staging tree has exactly one child at each level. Two prove a mismatch.
    while (names.length < 2) {
      const entry = withinBudget(deadline, () => directory.readSync());
      if (!entry) break;
      names.push(entry.name);
    }
    return names;
  } finally {
    directory.closeSync();
  }
}
function openEntry(
  filename: string,
  expected: BigIntStats,
  deadline = Number.POSITIVE_INFINITY,
): number {
  checkBudget(deadline);
  const fd = fs.openSync(
    filename,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      (expected.isDirectory() ? constants.O_DIRECTORY : constants.O_NONBLOCK),
  );
  try {
    const opened = fstatWithinBudget(fd, deadline);
    if (opened.dev !== expected.dev || physical(opened) !== physical(expected))
      throw new LegacyBackupInventoryError('root_unverified');
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
function observe(
  fd: number,
  device: bigint,
  rootMountId: string,
  scope: LegacyRootInventory['scope'],
  name: string,
  deadline: number,
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
    const stat = withinBudget(deadline, () => fs.lstatSync(filename, { bigint: true }));
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
      stagingFd = openEntry(filename, stat, deadline);
      if (
        mountId(stagingFd, deadline) !== rootMountId ||
        directoryNames(stagingFd, deadline).join(',') !== 'database'
      ) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const databasePath = `/proc/self/fd/${stagingFd}/database`;
      const databaseStat = withinBudget(deadline, () =>
        fs.lstatSync(databasePath, { bigint: true }),
      );
      if (
        !databaseStat.isDirectory() ||
        databaseStat.isSymbolicLink() ||
        databaseStat.dev !== device
      ) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      databaseFd = openEntry(databasePath, databaseStat, deadline);
      if (mountId(databaseFd, deadline) !== rootMountId) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const names = directoryNames(databaseFd, deadline);
      if (names.length !== 1 || !isLegacySqlMemberFilename(names[0])) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      const sql = withinBudget(deadline, () =>
        fs.lstatSync(`/proc/self/fd/${databaseFd}/${names[0]}`, { bigint: true }),
      );
      if (!sql.isFile() || sql.isSymbolicLink() || sql.nlink !== 1n || sql.dev !== device) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      fileFd = openEntry(`/proc/self/fd/${databaseFd}/${names[0]}`, sql, deadline);
      if (mountId(fileFd, deadline) !== rootMountId) {
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
        physical(
          withinBudget(deadline, () =>
            fs.lstatSync(`/proc/self/fd/${databaseFd}/${names[0]}`, { bigint: true }),
          ),
        ) !== physical(sql) ||
        physical(withinBudget(deadline, () => fs.lstatSync(databasePath, { bigint: true }))) !==
          physical(databaseStat) ||
        physical(fstatWithinBudget(databaseFd, deadline)) !== physical(databaseStat) ||
        physical(fstatWithinBudget(stagingFd, deadline)) !== physical(stat)
      ) {
        item.outcome = 'changed';
        return item;
      }
    } else {
      fileFd = openEntry(filename, stat, deadline);
      if (mountId(fileFd, deadline) !== rootMountId) {
        item.outcome = 'unsafe_shape';
        return item;
      }
      item.sizeBytes = stat.size.toString();
    }
    item.outcome =
      physical(withinBudget(deadline, () => fs.lstatSync(filename, { bigint: true }))) ===
      physical(stat)
        ? 'writer_unverified'
        : 'changed';
    return item;
  } catch (error) {
    if (error instanceof InventoryBudgetExceeded) throw error;
    return item;
  } finally {
    if (fileFd !== undefined) fs.closeSync(fileFd);
    if (databaseFd !== undefined) fs.closeSync(databaseFd);
    if (stagingFd !== undefined) fs.closeSync(stagingFd);
  }
}
function validateSelectedRoot(
  root: string,
): Pick<LegacyRootInventory, 'rootSha256' | 'rootMountId'> {
  const canonical = fs.realpathSync.native(root);
  const stat = fs.lstatSync(canonical, { bigint: true });
  if (canonical !== path.resolve(root) || !stat.isDirectory())
    throw new LegacyBackupInventoryError('root_unverified');
  const fd = openEntry(canonical, stat);
  try {
    return {
      rootSha256: hash([
        canonical,
        fs.statfsSync(canonical, { bigint: true }).type.toString(),
        stat.dev.toString(),
        stat.ino.toString(),
      ]),
      rootMountId: mountId(fd),
    };
  } finally {
    fs.closeSync(fd);
  }
}
function inspectRoot(
  root: string,
  scope: LegacyRootInventory['scope'],
  deadline: number,
  initial: Pick<LegacyRootInventory, 'rootSha256' | 'rootMountId'>,
): LegacyRootInventory {
  let fd: number | undefined;
  try {
    const canonical = withinBudget(deadline, () => fs.realpathSync.native(root)),
      stat = withinBudget(deadline, () => fs.lstatSync(canonical, { bigint: true }));
    const filesystem = withinBudget(deadline, () => fs.statfsSync(canonical, { bigint: true }));
    if (path.resolve(root) !== canonical || !stat.isDirectory())
      throw new LegacyBackupInventoryError('root_unverified');
    fd = openEntry(canonical, stat, deadline);
    const rootMountId = mountId(fd, deadline);
    const result: LegacyRootInventory = {
      scope,
      rootMountId,
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
    if (result.rootSha256 !== initial.rootSha256 || result.rootMountId !== initial.rootMountId)
      throw new LegacyBackupInventoryError('root_unverified');
    checkBudget(deadline);
    const directory = fs.opendirSync(`/proc/self/fd/${fd}`);
    try {
      while (true) {
        if (performance.now() >= deadline) {
          result.stoppedBecause = 'time_budget';
          break;
        }
        const entry = withinBudget(deadline, () => directory.readSync());
        if (!entry) {
          result.scanComplete = true;
          break;
        }
        if (result.entriesSeen >= MAX_ENTRIES) {
          result.stoppedBecause = 'entry_limit';
          break;
        }
        if (result.copies.length >= MAX_COPIES && classify(scope, entry.name)) {
          result.stoppedBecause = 'copy_limit';
          break;
        }
        result.entriesSeen++;
        const item = observe(fd, stat.dev, rootMountId, scope, entry.name, deadline);
        if (item) result.copies.push(item);
        else if (
          (scope === 'backup' && entry.name.startsWith('temp_')) ||
          (scope === 'legacy_upload' && entry.name.startsWith('backup-upload-'))
        )
          result.unknownLegacyEntries++;
        else result.otherEntries++;
      }
    } catch (error) {
      result.stoppedBecause =
        error instanceof InventoryBudgetExceeded ? 'time_budget' : 'unreadable';
    } finally {
      directory.closeSync();
    }
    if (result.stoppedBecause !== 'time_budget') {
      try {
        if (
          physical(fstatWithinBudget(fd, deadline)) !== physical(stat) ||
          physical(withinBudget(deadline, () => fs.lstatSync(canonical, { bigint: true }))) !==
            physical(stat)
        ) {
          result.scanComplete = false;
          result.stoppedBecause = 'root_changed';
        }
      } catch (error) {
        result.scanComplete = false;
        result.stoppedBecause =
          error instanceof InventoryBudgetExceeded ? 'time_budget' : 'unreadable';
      }
    }
    result.copies.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    return result;
  } catch (error) {
    if (error instanceof InventoryBudgetExceeded)
      return {
        scope,
        ...initial,
        scanComplete: false,
        stoppedBecause: 'time_budget',
        entriesSeen: 0,
        otherEntries: 0,
        unknownLegacyEntries: 0,
        copies: [],
      };
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
    // Admission validates every selected root before the shared traversal budget starts.
    const initial = [backupRoot, ...(uploadRoot === undefined ? [] : [uploadRoot])].map((root) => {
      try {
        return validateSelectedRoot(root);
      } catch {
        throw new LegacyBackupInventoryError('root_unverified');
      }
    });
    const deadline = performance.now() + TIME_BUDGET_MS;
    const roots = [inspectRoot(backupRoot, 'backup', deadline, initial[0])];
    if (uploadRoot !== undefined)
      roots.push(inspectRoot(uploadRoot, 'legacy_upload', deadline, initial[1]));
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
    if (roots.length !== inventory.roots.length)
      throw new LegacyBackupInventoryError('root_unverified');
    const selectedRoots = roots.map((root) => fs.realpathSync.native(root));
    const requireScannedRoots = () => {
      for (const [index, root] of selectedRoots.entries()) {
        const observed = inventory.roots[index];
        const current = fs.lstatSync(root, { bigint: true });
        const rootFd = openEntry(root, current);
        try {
          const filesystem = fs.statfsSync(root, { bigint: true });
          if (
            hash([
              root,
              filesystem.type.toString(),
              current.dev.toString(),
              current.ino.toString(),
            ]) !== observed.rootSha256 ||
            mountId(rootFd) !== observed.rootMountId
          )
            throw new LegacyBackupInventoryError('root_unverified');
        } finally {
          fs.closeSync(rootFd);
        }
      }
    };
    requireScannedRoots();
    if (selectedRoots.some((root) => within(root, parent)))
      throw new LegacyBackupInventoryError('private_output_required');
    const stat = fs.lstatSync(parent, { bigint: true });
    if (!stat.isDirectory() || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o077n) !== 0n)
      throw new LegacyBackupInventoryError('private_output_required');
    const directoryFd = openEntry(parent, stat);
    parentFd = directoryFd;
    const requireOutsideRoots = () => {
      requireScannedRoots();
      const aliases = legacyDirectoryAliases(directoryFd, parent);
      if (selectedRoots.some((root) => aliases.some((alias) => within(root, alias))))
        throw new LegacyBackupInventoryError('private_output_required');
    };
    requireOutsideRoots();
    const data = JSON.stringify(inventory) + '\n';
    if (Buffer.byteLength(data) > 1024 * 1024)
      throw new LegacyBackupInventoryError('output_unconfirmed');
    fd = fs.openSync(
      `/proc/self/fd/${parentFd}/${path.basename(filename)}`,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fs.fchmodSync(fd, 0o600);
    const output = fs.fstatSync(fd);
    if (
      !output.isFile() ||
      output.uid !== process.getuid() ||
      output.nlink !== 1 ||
      (output.mode & 0o777) !== 0o600
    )
      throw new LegacyBackupInventoryError('private_output_required');
    const expectedData = Buffer.from(data);
    fs.writeFileSync(fd, expectedData);
    fs.fsyncSync(fd);
    const written = fs.fstatSync(fd, { bigint: true });
    if (
      !written.isFile() ||
      written.uid !== BigInt(process.getuid()) ||
      written.nlink !== 1n ||
      (written.mode & 0o777n) !== 0o600n ||
      written.size !== BigInt(expectedData.length)
    )
      throw new LegacyBackupInventoryError('output_unconfirmed');
    fs.fsyncSync(parentFd);
    requireOutsideRoots();
    const currentParent = fs.lstatSync(parent, { bigint: true });
    if (
      !currentParent.isDirectory() ||
      currentParent.dev !== stat.dev ||
      currentParent.ino !== stat.ino
    )
      throw new LegacyBackupInventoryError('output_unconfirmed');
    // Read only our bounded evidence, never source copy contents. Keep fd until acknowledgement.
    const readBack = Buffer.alloc(expectedData.length);
    let read = 0;
    while (read < readBack.length) {
      const count = fs.readSync(fd, readBack, read, readBack.length - read, read);
      if (count === 0) throw new LegacyBackupInventoryError('output_unconfirmed');
      read += count;
    }
    if (
      !readBack.equals(expectedData) ||
      physical(fs.fstatSync(fd, { bigint: true })) !== physical(written) ||
      physical(fs.lstatSync(filename, { bigint: true })) !== physical(written)
    )
      throw new LegacyBackupInventoryError('output_unconfirmed');
  } catch (error) {
    throw error instanceof LegacyBackupInventoryError
      ? error
      : new LegacyBackupInventoryError('output_unconfirmed');
  } finally {
    let closeFailed = false;
    for (const handle of [fd, parentFd]) {
      if (handle === undefined) continue;
      try {
        fs.closeSync(handle);
      } catch {
        closeFailed = true;
      }
    }
    if (closeFailed) throw new LegacyBackupInventoryError('output_unconfirmed');
  }
}

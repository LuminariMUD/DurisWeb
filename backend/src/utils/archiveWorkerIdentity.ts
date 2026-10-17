import { createHash } from 'node:crypto';
import { readFile, readlink } from 'node:fs/promises';

export interface ArchiveWorkerIdentity {
  pid: number;
  startTicks: string;
  domainSha256: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validArchiveWorkerIdentity(value: unknown): value is ArchiveWorkerIdentity {
  if (!object(value)) return false;
  const entry = value;
  return (
    Object.keys(entry).sort().join(',') === 'domainSha256,pid,startTicks' &&
    typeof entry.pid === 'number' &&
    Number.isSafeInteger(entry.pid) &&
    entry.pid > 0 &&
    entry.pid <= 2147483647 &&
    typeof entry.startTicks === 'string' &&
    /^(0|[1-9][0-9]{0,19})$/.test(entry.startTicks) &&
    BigInt(entry.startTicks) <= 18446744073709551615n &&
    typeof entry.domainSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(entry.domainSha256)
  );
}
async function domain(): Promise<string> {
  if (process.platform !== 'linux') throw new Error('Archive process identity is unavailable');
  const [boot, namespace] = await Promise.all([
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    readlink('/proc/self/ns/pid'),
  ]);
  if (!/^[a-f0-9-]{36}$/.test(boot.trim()) || !/^pid:\[[0-9]+\]$/.test(namespace))
    throw new Error('Archive process identity is unavailable');
  return createHash('sha256')
    .update(JSON.stringify([boot.trim(), namespace]))
    .digest('hex');
}
async function startTicks(pid: number): Promise<string> {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  if (stat.length > 8192 || !stat.startsWith(`${pid} (`))
    throw new Error('Invalid process identity');
  const end = stat.lastIndexOf(')');
  const value = stat
    .slice(end + 2)
    .trim()
    .split(/\s+/)[19];
  if (
    end < 0 ||
    !value ||
    !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  )
    throw new Error('Invalid process identity');
  return value;
}
export async function captureArchiveWorker(pid: number): Promise<ArchiveWorkerIdentity> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647)
    throw new Error('Invalid worker PID');
  return { pid, startTicks: await startTicks(pid), domainSha256: await domain() };
}
/** Only a zero-signal existence check; never terminate a PID obtained from durable state. */
export async function archiveWorkerIsGone(worker: ArchiveWorkerIdentity): Promise<boolean> {
  if (!validArchiveWorkerIdentity(worker) || (await domain()) !== worker.domainSha256)
    throw new Error('Archive worker recovery domain is unverified');
  try {
    process.kill(worker.pid, 0);
  } catch (error) {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH';
  }
  try {
    return (await startTicks(worker.pid)) !== worker.startTicks;
  } catch {
    // Hidden/unreadable proc state does not prove exit; retry only the existence check.
    try {
      process.kill(worker.pid, 0);
    } catch (error) {
      return !!error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH';
    }
    return false;
  }
}

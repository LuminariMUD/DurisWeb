import type { HookId } from './types.js';

export type FilesystemHookId = Extract<
  HookId,
  'connection_log' | 'flag_parsing' | 'zone_builder_parsing'
>;

export type FlatfileAvailability = 'available' | 'unavailable';

export interface FlatfileHookHealth {
  readonly hookId: FilesystemHookId;
  readonly availability: FlatfileAvailability;
  readonly reason: string | null;
  readonly droppedInputs: number;
  readonly consecutiveFailures: number;
  readonly retryAt: string | null;
}

interface MutableFlatfileHookHealth {
  availability: FlatfileAvailability;
  reason: string | null;
  droppedInputs: number;
  consecutiveFailures: number;
  retryAtMs: number | null;
}

type Clock = () => number;
type RecoveryProbe = (hookId: FilesystemHookId) => Promise<void>;

const FILESYSTEM_HOOK_IDS = Object.freeze([
  'connection_log',
  'flag_parsing',
  'zone_builder_parsing',
] as const satisfies readonly FilesystemHookId[]);

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 5 * 60 * 1_000;
const MAX_REASON_LENGTH = 180;

let clock: Clock = Date.now;
let recoveryProbe: RecoveryProbe | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;
let recoveryRunInFlight = false;

const healthByHook = new Map<FilesystemHookId, MutableFlatfileHookHealth>();

function freshHealth(): MutableFlatfileHookHealth {
  return {
    availability: 'available',
    reason: null,
    droppedInputs: 0,
    consecutiveFailures: 0,
    retryAtMs: null,
  };
}

function initializeHealth(): void {
  healthByHook.clear();
  for (const hookId of FILESYSTEM_HOOK_IDS) {
    healthByHook.set(hookId, freshHealth());
  }
}

initializeHealth();

export function isFilesystemHookId(id: string): id is FilesystemHookId {
  return (FILESYSTEM_HOOK_IDS as readonly string[]).includes(id);
}

export function getFilesystemHookIds(): readonly FilesystemHookId[] {
  return FILESYSTEM_HOOK_IDS;
}

function requireHealth(hookId: FilesystemHookId): MutableFlatfileHookHealth {
  const health = healthByHook.get(hookId);
  if (!health) {
    throw new Error(`Flatfile health is not registered for hook: ${hookId}`);
  }
  return health;
}

function sanitizeReason(reason: string): string {
  const printable = reason
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\b(authorization|password|secret|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/(?:[A-Za-z]:\\|\/(?!\/))[^\s]+/g, '[path]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[address]')
    .trim();
  const bounded = printable.slice(0, MAX_REASON_LENGTH);
  return bounded || 'Required MUD filesystem resource is unavailable.';
}

function retryDelay(failureCount: number): number {
  const exponent = Math.max(0, Math.min(failureCount - 1, 20));
  return Math.min(INITIAL_RETRY_MS * 2 ** exponent, MAX_RETRY_MS);
}

export function markFlatfileUnavailable(
  hookId: FilesystemHookId,
  reason: string,
): FlatfileHookHealth {
  const health = requireHealth(hookId);
  health.availability = 'unavailable';
  health.reason = sanitizeReason(reason);
  health.consecutiveFailures += 1;
  health.retryAtMs = clock() + retryDelay(health.consecutiveFailures);
  scheduleRecovery();
  return getFlatfileHookHealth(hookId)!;
}

export function markFlatfileAvailable(
  hookId: FilesystemHookId,
): FlatfileHookHealth {
  const health = requireHealth(hookId);
  health.availability = 'available';
  health.reason = null;
  health.consecutiveFailures = 0;
  health.retryAtMs = null;
  scheduleRecovery();
  return getFlatfileHookHealth(hookId)!;
}

export function recordDroppedFlatfileInput(
  hookId: FilesystemHookId,
  count: number = 1,
): number {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Dropped flatfile input count must be a positive integer.');
  }
  const health = requireHealth(hookId);
  health.droppedInputs += count;
  return health.droppedInputs;
}

export function canAttemptFlatfileHook(hookId: FilesystemHookId): boolean {
  const retryAtMs = requireHealth(hookId).retryAtMs;
  return retryAtMs === null || clock() >= retryAtMs;
}

export function getFlatfileHookHealth(
  id: string,
): FlatfileHookHealth | null {
  if (!isFilesystemHookId(id)) {
    return null;
  }
  const health = requireHealth(id);
  return Object.freeze({
    hookId: id,
    availability: health.availability,
    reason: health.reason,
    droppedInputs: health.droppedInputs,
    consecutiveFailures: health.consecutiveFailures,
    retryAt:
      health.retryAtMs === null ? null : new Date(health.retryAtMs).toISOString(),
  });
}

export function getFlatfileHookHealthSnapshot(): readonly FlatfileHookHealth[] {
  return Object.freeze(
    FILESYSTEM_HOOK_IDS.map((hookId) => getFlatfileHookHealth(hookId)!),
  );
}

function clearRecoveryTimer(): void {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
}

function nextRetryDelay(): number | null {
  const retryTimes = [...healthByHook.values()]
    .map((health) => health.retryAtMs)
    .filter((retryAtMs): retryAtMs is number => retryAtMs !== null);
  if (retryTimes.length === 0) {
    return null;
  }
  return Math.max(0, Math.min(...retryTimes) - clock());
}

function scheduleRecovery(): void {
  clearRecoveryTimer();
  if (!recoveryProbe || recoveryRunInFlight) {
    return;
  }
  const delay = nextRetryDelay();
  if (delay === null) {
    return;
  }
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    void runDueRecoveryProbes();
  }, delay);
  recoveryTimer.unref();
}

async function runDueRecoveryProbes(): Promise<void> {
  if (!recoveryProbe || recoveryRunInFlight) {
    return;
  }
  recoveryRunInFlight = true;
  const now = clock();
  const due = FILESYSTEM_HOOK_IDS.filter((hookId) => {
    const retryAtMs = requireHealth(hookId).retryAtMs;
    return retryAtMs !== null && retryAtMs <= now;
  });

  try {
    await Promise.all(
      due.map(async (hookId) => {
        const previousRetryAt = requireHealth(hookId).retryAtMs;
        try {
          await recoveryProbe!(hookId);
        } catch {
          const current = requireHealth(hookId);
          if (current.retryAtMs === previousRetryAt) {
            markFlatfileUnavailable(
              hookId,
              current.reason ?? 'Required MUD filesystem resource is unavailable.',
            );
          }
        }
      }),
    );
  } finally {
    recoveryRunInFlight = false;
    scheduleRecovery();
  }
}

export function startFlatfileRecoveryMonitor(probe: RecoveryProbe): void {
  recoveryProbe = probe;
  scheduleRecovery();
}

export function stopFlatfileRecoveryMonitor(): void {
  recoveryProbe = null;
  clearRecoveryTimer();
}

export function isFlatfileRecoveryMonitorActive(): boolean {
  return recoveryProbe !== null;
}

export function setFlatfileHookClockForTests(testClock: Clock): void {
  clock = testClock;
  scheduleRecovery();
}

export function resetFlatfileHookStateForTests(): void {
  stopFlatfileRecoveryMonitor();
  recoveryRunInFlight = false;
  clock = Date.now;
  initializeHealth();
}

import { writeSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

const CHECK_INTERVAL_MS = 1_000;
const STALL_THRESHOLD_MS = 5_000;

interface WatchdogData {
  kind: 'event-loop-watchdog';
  heartbeat: SharedArrayBuffer;
}

/** Write from the worker's OS descriptor; worker console output waits on the main loop. */
function report(event: string, fields: Record<string, unknown>): void {
  try {
    writeSync(
      2,
      `${JSON.stringify({
        level: event === 'event_loop_recovered' ? 'info' : 'warn',
        message: '[EventLoopWatchdog]',
        event,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        ...fields,
      })}\n`,
    );
  } catch {
    // A closed diagnostic descriptor must not crash the application.
  }
}

/** Collect code locations only, never heap data, arguments, source text or request values. */
async function sampleBlockedThread(): Promise<void> {
  const session = new Session();
  let deadline: NodeJS.Timeout | undefined;
  try {
    session.connectToMainThread();
    const profile = await Promise.race([
      (async () => {
        await session.post('Profiler.enable');
        await session.post('Profiler.start');
        await new Promise((resolve) => setTimeout(resolve, 250));
        return (await session.post('Profiler.stop')).profile;
      })(),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Sample deadline')), 1_500);
      }),
    ]);
    const root = fileURLToPath(new URL('../', import.meta.url));
    const frames = profile.nodes
      .filter((node) => node.hitCount && node.callFrame.url.startsWith('file:'))
      .flatMap((node) => {
        const file = path.relative(root, fileURLToPath(node.callFrame.url));
        if (
          file.length > 200 ||
          file.startsWith('..') ||
          path.isAbsolute(file) ||
          !/^[A-Za-z0-9_./@+-]+$/.test(file)
        )
          return [];
        return [
          {
            file,
            function: /^[A-Za-z0-9_$ .<>:-]{1,120}$/.test(node.callFrame.functionName)
              ? node.callFrame.functionName
              : '(anonymous)',
            line: node.callFrame.lineNumber + 1,
            column: node.callFrame.columnNumber + 1,
            samples: node.hitCount,
          },
        ];
      })
      .sort((a, b) => (b.samples ?? 0) - (a.samples ?? 0))
      .slice(0, 5);
    report('event_loop_profile', { frames });
  } catch {
    // Native blocking calls may not service inspector interrupts. The stall record still survives.
    report('event_loop_profile_unavailable', {});
  } finally {
    clearTimeout(deadline);
    session.disconnect();
  }
}

function watchMainThread(data: WatchdogData): void {
  const heartbeat = new BigInt64Array(data.heartbeat);
  let stalled = false;
  let observedBlockedMs = 0;
  setInterval(() => {
    const blockedMs = Number(process.hrtime.bigint() - Atomics.load(heartbeat, 0)) / 1e6;
    if (blockedMs >= STALL_THRESHOLD_MS) {
      observedBlockedMs = Math.max(observedBlockedMs, Math.round(blockedMs));
      if (!stalled) {
        stalled = true;
        report('event_loop_stall', { blockedMs: Math.round(blockedMs) });
        void sampleBlockedThread();
      }
    } else if (stalled) {
      stalled = false;
      report('event_loop_recovered', { observedBlockedMs });
      observedBlockedMs = 0;
    }
  }, CHECK_INTERVAL_MS);
  parentPort?.postMessage('ready');
}

/** Independent heartbeat observation survives a permanently blocked backend event loop. */
export async function startEventLoopWatchdog(): Promise<() => Promise<void>> {
  const heartbeat = new BigInt64Array(new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT));
  Atomics.store(heartbeat, 0, process.hrtime.bigint());
  const data: WatchdogData = { kind: 'event-loop-watchdog', heartbeat: heartbeat.buffer };
  // A separate module instance uses only Node built-ins and does not load app config or clients.
  const worker = new Worker(new URL(import.meta.url), { workerData: data, execArgv: [] });
  const beat = setInterval(() => Atomics.store(heartbeat, 0, process.hrtime.bigint()), 250);
  beat.unref();
  let stopping = false;
  let failed = false;
  const onFailure = () => {
    clearInterval(beat);
    if (!stopping && !failed) {
      failed = true;
      report('event_loop_watchdog_failed', {});
    }
  };
  worker.on('error', onFailure);
  worker.on('exit', onFailure);
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(deadline);
        worker.off('message', onReady);
        worker.off('error', finish);
        worker.off('exit', onExit);
        if (error) reject(error);
        else resolve();
      };
      const onReady = () => finish();
      const onExit = () => finish(new Error('Event-loop watchdog exited before readiness'));
      const deadline = setTimeout(() => finish(new Error('Watchdog readiness deadline')), 5_000);
      worker.once('message', onReady);
      worker.once('error', finish);
      worker.once('exit', onExit);
    });
  } catch (error) {
    stopping = true;
    clearInterval(beat);
    await worker.terminate();
    throw error;
  }
  worker.unref();
  return async () => {
    stopping = true;
    clearInterval(beat);
    await worker.terminate();
  };
}

const data = workerData as WatchdogData | undefined;
if (!isMainThread && data?.kind === 'event-loop-watchdog') watchMainThread(data);

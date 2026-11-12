import type http from 'node:http';
import type { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';
import { closeDatabaseConnection } from '../db/connection.js';
import { closeRedisConnection } from '../db/redis.js';
import { stopFlatfileRecoveryMonitor } from '../hooks/flatfileHookState.js';
import { cleanupLogWatchers } from '../services/logWatchService.js';
import { cleanupAllSessions as cleanupTerminalSessions } from '../services/terminalService.js';
import { closeOnlinePlayersRedisConnections } from '../services/onlinePlayersService.js';
import { closeWebServer } from '../utils/serverShutdown.js';
import { detachBroadcastServer } from '../realtime/broadcasts.js';
import type { BackgroundJobs } from './backgroundJobs.js';

/** Resources a startup has acquired so far; shutdown releases only what is present. */
export interface RuntimeResources {
  stopEventLoopWatchdog?: () => Promise<void>;
  flatfileRecoveryMonitor?: boolean;
  poolSessionSampling?: NodeJS.Timeout;
  server?: http.Server;
  wss?: WebSocketServer;
  jobs?: BackgroundJobs;
}

/**
 * Ordered, idempotent cleanup: stop producers, close the web server and terminals, stop
 * workers, then close the shared clients that were opened when their modules loaded.
 */
export function createShutdown(resources: RuntimeResources): () => Promise<void> {
  let shutdown: Promise<void> | undefined;
  return () => {
    shutdown ??= (async () => {
      // Every step runs even if an earlier one fails, so pools and clients still close;
      // the first failure is rethrown at the end so the process exits 1.
      const failures: unknown[] = [];
      const step = async (run: () => unknown): Promise<void> => {
        try {
          await run();
        } catch (error) {
          failures.push(error);
        }
      };

      await step(() => resources.stopEventLoopWatchdog?.());
      await step(() => resources.jobs?.stopProducers());

      // Cleanup log watchers
      await step(() => cleanupLogWatchers());

      await step(async () => {
        if (resources.server && resources.wss) {
          await closeWebServer(resources.server, resources.wss);
          detachBroadcastServer();
        }
      });
      await step(() => cleanupTerminalSessions());
      logger.info('HTTP and WebSocket servers closed');

      await step(() => resources.jobs?.stopWorkers());
      await step(() => {
        if (resources.flatfileRecoveryMonitor) stopFlatfileRecoveryMonitor();
        if (resources.poolSessionSampling) clearInterval(resources.poolSessionSampling);
      });
      await step(() => closeOnlinePlayersRedisConnections());
      await step(() => closeDatabaseConnection());
      await step(() => closeRedisConnection());
      if (failures.length > 0) throw failures[0];
    })();
    return shutdown;
  };
}

/** Longest a signal-initiated shutdown may take before the process is forced out. */
export const SHUTDOWN_DEADLINE_MS = 10_000;

/**
 * Run shutdown, then exit with `code`. A failed step exits 1 instead of surfacing as an
 * unhandled rejection, and a step that never settles cannot hold the process past the deadline.
 */
export async function exitAfterShutdown(
  shutdown: () => Promise<void>,
  code: number,
  {
    deadlineMs = SHUTDOWN_DEADLINE_MS,
    exit = (status: number): void => process.exit(status),
  }: { deadlineMs?: number; exit?: (status: number) => void } = {},
): Promise<void> {
  const deadline = setTimeout(() => {
    logger.error(`Shutdown did not finish within ${deadlineMs} ms; exiting`);
    exit(1);
  }, deadlineMs);
  let status = code;
  try {
    await shutdown();
  } catch (error) {
    logger.error('Shutdown failed:', error);
    status = 1;
  } finally {
    clearTimeout(deadline);
  }
  exit(status);
}

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const; // Nodemon sends SIGUSR2
let signalsInstalled = false;

/** Install the process signal handlers once; the handler owns the exit decision. */
export function installSignalHandlers(onSignal: () => void): void {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, onSignal);
}

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
      await resources.stopEventLoopWatchdog?.();
      await resources.jobs?.stopProducers();

      // Cleanup log watchers
      cleanupLogWatchers();

      if (resources.server && resources.wss) {
        await closeWebServer(resources.server, resources.wss);
        detachBroadcastServer();
      }
      await cleanupTerminalSessions();
      logger.info('HTTP and WebSocket servers closed');

      await resources.jobs?.stopWorkers();
      if (resources.flatfileRecoveryMonitor) stopFlatfileRecoveryMonitor();
      if (resources.poolSessionSampling) clearInterval(resources.poolSessionSampling);
      await closeOnlinePlayersRedisConnections();
      await closeDatabaseConnection();
      await closeRedisConnection();
    })();
    return shutdown;
  };
}

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const; // Nodemon sends SIGUSR2
let signalsInstalled = false;

/** Install the process signal handlers once; the handler owns the exit decision. */
export function installSignalHandlers(onSignal: () => void): void {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, onSignal);
}

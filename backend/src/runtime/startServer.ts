import http from 'node:http';
import type { Application } from 'express';
import logger from '../utils/logger.js';
import { getBackendConfiguration } from '../config/environment.js';
import {
  checkDatabaseConnection,
  checkMudDatabaseConnection,
  verifyDatabaseSchema,
  verifyPoolSessionInvariants,
  startPoolSessionInvariantSampling,
} from '../db/connection.js';
import {
  getFlatfileHookHealthSnapshot,
  startFlatfileRecoveryMonitor,
} from '../hooks/flatfileHookState.js';
import { probeAllFlatfileHooks, recoverFlatfileHook } from '../services/flatfileAccess.js';
import { createApplicationWebSocketServer } from '../utils/applicationWebSocket.js';
import { startEventLoopWatchdog } from '../utils/eventLoopWatchdog.js';
import { attachBroadcastServer } from '../realtime/broadcasts.js';
import { handleApplicationConnection } from '../realtime/applicationSocket.js';
import { startBackgroundJobs } from './backgroundJobs.js';
import type { RuntimeResources } from './shutdown.js';

async function initializeFlatfileHealth(resources: RuntimeResources): Promise<void> {
  startFlatfileRecoveryMonitor(recoverFlatfileHook);
  resources.flatfileRecoveryMonitor = true;
  await probeAllFlatfileHooks();

  for (const health of getFlatfileHookHealthSnapshot()) {
    if (health.availability === 'unavailable') {
      logger.warn(
        `[hooks] ${health.hookId} unavailable: ${health.reason ?? 'required MUD filesystem resource is unavailable'}`,
      );
    }
  }
}

/**
 * Start dependencies and listeners only after required runtime checks succeed. Each acquired
 * resource is recorded in `resources` as it starts, so a failure can release exactly those.
 */
export async function startServer(app: Application, resources: RuntimeResources): Promise<void> {
  const environment = getBackendConfiguration();
  const PORT = environment.server.port;
  const HOST = environment.server.host;

  try {
    resources.stopEventLoopWatchdog = await startEventLoopWatchdog();
  } catch {
    logger.warn('[EventLoopWatchdog] Could not start stall diagnostics');
  }

  // Filesystem-backed hooks are optional in split-host deployments. Probe
  // them independently and keep the bridge, Redis, and database paths alive
  // when MUD_DIR is absent or unreachable.
  await initializeFlatfileHealth(resources);

  // Check database connection
  logger.info('Checking database connection...');
  const isConnected = await checkDatabaseConnection();

  if (!isConnected) {
    logger.error('Failed to connect to WebService database. Exiting...');
    throw new Error('WebService database unavailable');
  }

  const isMudDatabaseConnected = await checkMudDatabaseConnection();
  if (!isMudDatabaseConnected) {
    logger.error('Failed to connect to authoritative MUD database. Exiting...');
    throw new Error('Authoritative MUD database unavailable');
  }

  // Verify database schema
  logger.info('\nVerifying database schema...');
  await verifyDatabaseSchema();

  // A pooled connection must still carry the server's strict session state.
  await verifyPoolSessionInvariants();
  // Keep sampling checkouts so post-boot session drift is alerted, not silent.
  resources.poolSessionSampling = startPoolSessionInvariantSampling();

  // Create HTTP server from Express app
  const server = http.createServer(app);
  resources.server = server;

  // Create WebSocket server
  const wss = createApplicationWebSocketServer(server);
  resources.wss = wss;
  attachBroadcastServer(wss);
  wss.on('connection', handleApplicationConnection);

  await startBackgroundJobs(wss, (jobs) => {
    resources.jobs = jobs;
  });

  // Start listening; a bind failure rejects into the failed-start cleanup.
  await listenOn(server, PORT, HOST);
  logger.info(`\n${'='.repeat(50)}`);
  logger.info(`DurisMUD PvP API Server`);
  logger.info(`${'='.repeat(50)}`);
  logger.info(`Environment: ${environment.environment}`);
  logger.info(`Server running on: http://${HOST}:${PORT}`);
  logger.info(`WebSocket: ws://${HOST}:${PORT}/ws`);
  logger.info(`Health check: http://${HOST}:${PORT}/health`);
  logger.info(`\nAvailable endpoints:`);
  logger.info(`  GET  /api/pvp/events`);
  logger.info(`  GET  /api/pvp/events/:event_id`);
  logger.info(`  GET  /api/pvp/stats/leaderboard`);
  logger.info(`  GET  /api/pvp/stats/player/:name`);
  logger.info(`  GET  /api/pvp/search`);
  logger.info(`  GET  /api/pvp/locations`);
  logger.info(`  GET  /api/pvp/players`);
  logger.info(`  GET  /api/news`);
  logger.info(`  POST /api/auth/login`);
  logger.info(`  POST /api/auth/logout`);
  logger.info(`  POST /api/auth/refresh`);
  logger.info(`  GET  /api/auth/me`);
  logger.info(`  GET  /api/auth/check`);
  logger.info(`  GET  /api/forum/categories`);
  logger.info(`  GET  /api/forum/threads/:id`);
  logger.info(`  POST /api/forum/threads`);
  logger.info(`  POST /api/forum/threads/:threadId/posts`);
  logger.info(`  GET  /api/forum/notifications`);
  logger.info(`  GET  /api/frag/leaderboard`);
  logger.info(`  GET  /api/frag/top-gainers`);
  logger.info(`  GET  /api/frag/races`);
  logger.info(`  GET  /api/frag/classes`);
  logger.info(`  WS   /ws (Real-time updates)`);
  logger.info(`${'='.repeat(50)}\n`);
}

/** Resolve once `server` is listening, or reject with the bind error (EADDRINUSE, EACCES). */
export function listenOn(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

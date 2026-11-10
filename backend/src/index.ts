import type { Application } from 'express';
import type { WebSocketServer } from 'ws';
import http from 'http';
import logger from './utils/logger.js';
import { mudHookStateProvider } from './hooks/mudHookStateClient.js';
import { refreshHookState, setMudHookStateProvider } from './hooks/hookSettingsService.js';
import { startHookAuditWorker, stopHookAuditWorker } from './hooks/hookToggleJournal.js';
import {
  getFlatfileHookHealthSnapshot,
  startFlatfileRecoveryMonitor,
  stopFlatfileRecoveryMonitor,
} from './hooks/flatfileHookState.js';
import { probeAllFlatfileHooks, recoverFlatfileHook } from './services/flatfileAccess.js';
import {
  checkDatabaseConnection,
  checkMudDatabaseConnection,
  verifyDatabaseSchema,
  verifyPoolSessionInvariants,
  startPoolSessionInvariantSampling,
  closeDatabaseConnection,
} from './db/connection.js';
import { closeRedisConnection } from './db/redis.js';
import {
  startDonationOutboxPublisher,
  stopDonationOutboxPublisher,
} from './services/donationOutboxService.js';
import { createPvpPoller, PVP_POLL_INTERVAL_MS } from './services/pvpPolling.js';
import { getLatestReleasedEvent, getReleasedEventsAfter } from './services/pvpService.js';
import { startGuildSync, stopGuildSync } from './services/guildSyncService.js';
// netstatWatcher removed - player count now tracked via mud websocket events
import { cleanupLogWatchers } from './services/logWatchService.js';
import { cleanupAllSessions as cleanupTerminalSessions } from './services/terminalService.js';
import { cleanupOrphanImages } from './services/postImageService.js';
import {
  startMudAuctionClient,
  stopMudAuctionClient,
  setAuctionBroadcaster,
} from './services/mudAuctionClient.js';
import {
  startPlayerEventSubscriber,
  stopPlayerEventSubscriber,
  setPlayerEventBroadcaster,
} from './services/playerEventSubscriber.js';
import { closeOnlinePlayersRedisConnections } from './services/onlinePlayersService.js';
import {
  setNotificationBroadcaster,
  setNewsBroadcaster,
  notifyPvpBattle,
} from './services/unifiedNotificationService.js';
import { updateWebSocketCount } from './services/serverHealthService.js';
import { pollDiscordDeliveries } from './services/pvpDiscordDelivery.js';
import { pool } from './db/connection.js';
import { getBackendConfiguration } from './config/environment.js';
import { createApp } from './app.js';
import { closeWebServer } from './utils/serverShutdown.js';
import { createApplicationWebSocketServer } from './utils/applicationWebSocket.js';
import { startEventLoopWatchdog } from './utils/eventLoopWatchdog.js';
import {
  attachBroadcastServer,
  broadcastAuctionEvent,
  broadcastBackupProgress,
  broadcastFragUpdate,
  broadcastMudControlOutput,
  broadcastMudStateChange,
  broadcastNewEvent,
  broadcastNewsUpdate,
  broadcastNotification,
  broadcastPlayerEvent,
  detachBroadcastServer,
} from './realtime/broadcasts.js';
import { handleApplicationConnection } from './realtime/applicationSocket.js';

const environment = getBackendConfiguration();
const PORT = environment.server.port;
const HOST = environment.server.host;

const app: Application = createApp();

// Hook state: MUD-reported state comes from the bridge; website toggles are
// loaded once here so the event-path gate never awaits a database read.
setMudHookStateProvider(mudHookStateProvider);
void refreshHookState().catch((error) => {
  logger.error('[hooks] Initial hook state load failed', error);
});

// HTTP and WebSocket server instances
let server: http.Server | null = null;
let wss: WebSocketServer;

// Interval timers that need to be cleared on shutdown
let eventCheckInterval: NodeJS.Timeout | null = null;
let discordCheckInterval: NodeJS.Timeout | null = null;
let fragCheckInterval: NodeJS.Timeout | null = null;
let orphanImageCleanupInterval: NodeJS.Timeout | null = null;
const healthBroadcastInterval: NodeJS.Timeout | null = null;
let wsConnectionCountInterval: NodeJS.Timeout | null = null;

// Initialized from the latest visible battle at startup.
let pollReleasedEvents: (() => Promise<void>) | null = null;
let fragPollRunning = false;

// Track last frag update timestamp for change detection
let lastFragUpdateCheck = new Date();

// Update WebSocket connection count for health monitoring
function updateWebSocketConnectionCount() {
  if (!wss) return;

  const count = wss.clients.size;
  updateWebSocketCount(count);
}

// Check for frag leaderboard changes
async function checkForFragUpdates() {
  if (fragPollRunning) return;
  fragPollRunning = true;
  try {
    // Query for any frag records updated since last check
    const [rows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM frag_leaderboard WHERE last_updated > ?',
      [lastFragUpdateCheck],
    );

    if (rows[0].count > 0) {
      // Update timestamp and broadcast
      lastFragUpdateCheck = new Date();
      await broadcastFragUpdate();
    }
  } catch (error) {
    logger.error('Error checking for frag updates:', error);
  } finally {
    fragPollRunning = false;
  }
}

// Poll database for every newly released event without overlapping runs.
async function checkForNewEvents() {
  try {
    await pollReleasedEvents?.();
  } catch (error) {
    logger.error('Error checking for new events:', error);
  }
}

async function publishReleasedEvent(latestEvent: import('./types/index.js').PvPEventListItem) {
  broadcastNewEvent(latestEvent);
  try {
    await notifyPvpBattle(
      latestEvent.id,
      latestEvent.victims,
      latestEvent.killers,
      latestEvent.room_name || 'Unknown',
    );
  } catch (error) {
    logger.error('failed to send pvp push notification:', error);
  }
}

// Graceful shutdown
let isShuttingDown = false;
let stopEventLoopWatchdog: (() => Promise<void>) | undefined;
const gracefulShutdown = async () => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info('\nReceived shutdown signal, closing server gracefully...');
  await stopEventLoopWatchdog?.();

  // Clear all interval timers
  if (eventCheckInterval) clearInterval(eventCheckInterval);
  if (discordCheckInterval) clearInterval(discordCheckInterval);
  if (fragCheckInterval) clearInterval(fragCheckInterval);
  if (orphanImageCleanupInterval) clearInterval(orphanImageCleanupInterval);
  if (healthBroadcastInterval) clearInterval(healthBroadcastInterval);
  if (wsConnectionCountInterval) clearInterval(wsConnectionCountInterval);

  // Stop sync services
  stopGuildSync();

  // crash detection now handled by mud websocket disconnect

  const { stopHealthMonitoring } = await import('./services/serverHealthService.js');
  stopHealthMonitoring();

  // mud connection log sync removed - now using websocket events

  // Stop MUD auction client
  stopMudAuctionClient();

  // Stop player event subscriber
  await stopPlayerEventSubscriber();

  // Cleanup log watchers
  cleanupLogWatchers();

  await closeWebServer(server, wss);
  detachBroadcastServer();
  await cleanupTerminalSessions();
  logger.info('HTTP and WebSocket servers closed');

  await stopDonationOutboxPublisher();
  await stopHookAuditWorker();
  stopFlatfileRecoveryMonitor();
  await closeOnlinePlayersRedisConnections();
  await closeDatabaseConnection();
  await closeRedisConnection();

  // Force exit after 2 seconds if still hanging
  setTimeout(() => {
    logger.info('Force exiting...');
    process.exit(0);
  }, 2000).unref();

  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Nodemon sends SIGUSR2

async function initializeFlatfileHealth(): Promise<void> {
  startFlatfileRecoveryMonitor(recoverFlatfileHook);
  await probeAllFlatfileHooks();

  for (const health of getFlatfileHookHealthSnapshot()) {
    if (health.availability === 'unavailable') {
      logger.warn(
        `[hooks] ${health.hookId} unavailable: ${health.reason ?? 'required MUD filesystem resource is unavailable'}`,
      );
    }
  }
}

/** Starts dependencies and listeners only after required runtime checks succeed. */
async function startServer() {
  try {
    try {
      stopEventLoopWatchdog = await startEventLoopWatchdog();
    } catch {
      logger.warn('[EventLoopWatchdog] Could not start stall diagnostics');
    }

    // Filesystem-backed hooks are optional in split-host deployments. Probe
    // them independently and keep the bridge, Redis, and database paths alive
    // when MUD_DIR is absent or unreachable.
    await initializeFlatfileHealth();

    // Check database connection
    logger.info('Checking database connection...');
    const isConnected = await checkDatabaseConnection();

    if (!isConnected) {
      logger.error('Failed to connect to WebService database. Exiting...');
      process.exit(1);
    }

    const isMudDatabaseConnected = await checkMudDatabaseConnection();
    if (!isMudDatabaseConnected) {
      logger.error('Failed to connect to authoritative MUD database. Exiting...');
      process.exit(1);
    }

    // Verify database schema
    logger.info('\nVerifying database schema...');
    await verifyDatabaseSchema();

    // A pooled connection must still carry the server's strict session state.
    await verifyPoolSessionInvariants();
    // Keep sampling checkouts so post-boot session drift is alerted, not silent.
    startPoolSessionInvariantSampling();

    // Begin after the newest visible battle; restarting must not replay old notifications.
    const initialCursor = (await getLatestReleasedEvent()) || {
      id: 0,
      stamp: '1970-01-01T00:00:00.000Z',
    };
    pollReleasedEvents = createPvpPoller(
      initialCursor,
      getReleasedEventsAfter,
      publishReleasedEvent,
    );

    // Create HTTP server from Express app
    server = http.createServer(app);

    // Create WebSocket server
    wss = createApplicationWebSocketServer(server);
    attachBroadcastServer(wss);

    wss.on('connection', handleApplicationConnection);

    // Release delay is evaluated by every query; timer cadence stays positive and independent.
    logger.info(`PvP/frag polling interval set to ${PVP_POLL_INTERVAL_MS / 1000} seconds`);
    eventCheckInterval = setInterval(checkForNewEvents, PVP_POLL_INTERVAL_MS);
    fragCheckInterval = setInterval(checkForFragUpdates, PVP_POLL_INTERVAL_MS);
    const checkDiscord = () => {
      void pollDiscordDeliveries().catch(() => logger.error('[Discord] delivery_state_error'));
    };
    discordCheckInterval = setInterval(checkDiscord, PVP_POLL_INTERVAL_MS);
    checkDiscord();

    // netstat watcher removed - player count now tracked via mud websocket events

    // Start guild auto-access sync service (polls every 5 minutes)
    if (environment.features.guildSync) {
      startGuildSync();
      logger.info('Guild sync service enabled');
    } else {
      logger.info('Guild sync service disabled');
    }

    // crash detection now handled by mud websocket disconnect in mudAuctionClient

    // Start server health monitoring (records metrics every 5 minutes)
    const { startHealthMonitoring } = await import('./services/serverHealthService.js');
    startHealthMonitoring();
    logger.info('Server health monitoring started');

    // Update WebSocket connection count every 10 seconds
    wsConnectionCountInterval = setInterval(updateWebSocketConnectionCount, 10000);

    // Initialize GeoIP database
    const { initializeGeoIP } = await import('./utils/geoip.js');
    await initializeGeoIP();

    // mud connection log sync removed - now using websocket events from mudAuctionClient

    // Initialize backup service broadcaster and scheduler
    const { setProgressBroadcaster, startHourlyBackupScheduler } = await import(
      './services/backupService.js'
    );
    setProgressBroadcaster(broadcastBackupProgress);
    startHourlyBackupScheduler();
    logger.info('Backup service initialized with hourly scheduler');

    // Initialize MUD control service broadcasters
    const { setStateBroadcaster, setOutputBroadcaster } = await import(
      './services/mudControlService.js'
    );
    setStateBroadcaster(broadcastMudStateChange);
    setOutputBroadcaster(broadcastMudControlOutput);
    logger.info('MUD control service initialized');

    // Initialize MUD auction websocket client
    setAuctionBroadcaster(broadcastAuctionEvent);
    startMudAuctionClient();
    logger.info('MUD auction client started');

    // Initialize player event subscriber (redis pub/sub for login/logout)
    setPlayerEventBroadcaster(broadcastPlayerEvent);
    if (environment.features.mudRedis) {
      await startPlayerEventSubscriber();
      logger.info('Player event subscriber initialized');
    }

    // Initialize the durable donation outbox. It remains disabled until its
    // production delivery settings and independent HMAC secret are present.
    if (environment.features.donations) startDonationOutboxPublisher();
    startHookAuditWorker();

    // Initialize notification broadcaster
    setNotificationBroadcaster(broadcastNotification);
    logger.info('Notification broadcaster initialized');

    // Initialize news broadcaster
    setNewsBroadcaster(broadcastNewsUpdate);
    logger.info('News broadcaster initialized');

    // Start orphan image cleanup job (every hour)
    orphanImageCleanupInterval = setInterval(
      async () => {
        try {
          const deleted = await cleanupOrphanImages();
          if (deleted > 0) {
            logger.info(`Cleaned up ${deleted} orphan forum images`);
          }
        } catch (error) {
          logger.error('Error cleaning up orphan images:', error);
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
    logger.info('Orphan image cleanup service started');

    // Start listening
    server.listen(PORT, HOST, () => {
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
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start server if not in test mode
if (environment.environment !== 'test') {
  startServer();
}

// Export for testing

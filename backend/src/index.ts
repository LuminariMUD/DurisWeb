import type { Application } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import logger, { getErrorMessage } from './utils/logger.js';
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
import { watchLog, unwatchLog, cleanupLogWatchers } from './services/logWatchService.js';
import {
  createSession as createTerminalSession,
  writeInput as writeTerminalInput,
  resizeTerminal,
  destroySession as destroyTerminalSession,
  getSessionByWebSocket,
  isTerminalOperationAuthorized,
  cleanupAllSessions as cleanupTerminalSessions,
} from './services/terminalService.js';
import {
  verifyToken,
  verifyTerminalToken,
  verifyWebSocketToken,
  isAccessToken,
} from './middleware/auth.js';
import { parseAccountFile } from './services/accountService.js';
import { hasActiveWebSession } from './services/sessionService.js';
import { getUserPermissions } from './services/permissionService.js';
import {
  deployToCommit,
  determineDeployAction,
  type DeploymentContext,
} from './services/deploymentService.js';
import {
  countZoneItems,
  streamRooms,
  streamMobs,
  streamObjects,
  streamResets,
  countResets,
} from './services/zoneBuilderStreamer.js';
import { getCurrentCommitHash } from './services/gitService.js';
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
import { canAccessZone } from './services/zoneInfoService.js';
import {
  WebSocketStreamLimiter,
  hasWebSocketPermission,
  type WebSocketPrincipal,
} from './utils/websocketAccess.js';
import { pollDiscordDeliveries } from './services/pvpDiscordDelivery.js';
import { pool } from './db/connection.js';
import { getBackendConfiguration } from './config/environment.js';
import { createApp } from './app.js';
import { closeWebServer } from './utils/serverShutdown.js';
import {
  createApplicationWebSocketServer,
  sendApplicationMessage,
} from './utils/applicationWebSocket.js';
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
import { clientState } from './realtime/clientState.js';

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

const wsStreamLimiter = new WebSocketStreamLimiter<WebSocket>(2);
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

// helper to verify websocket auth with minimum level requirement
async function verifyWebSocketAuth(
  token: string | undefined,
  minLevel: number,
  fromCookie = false,
): Promise<WebSocketPrincipal | null> {
  if (!token) {
    logger.warn('[verifyWebSocketAuth] no token provided');
    return null;
  }
  const payload = fromCookie ? verifyToken(token) : verifyWebSocketToken(token);
  if (!payload || (fromCookie && !isAccessToken(payload))) {
    logger.warn('[verifyWebSocketAuth] invalid or wrong-purpose token');
    return null;
  }
  if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
    logger.warn('[verifyWebSocketAuth] inactive or legacy session');
    return null;
  }
  const accountData = await parseAccountFile(payload.accountName);
  if (!accountData) {
    logger.warn(`[verifyWebSocketAuth] no account data for ${payload.accountName}`);
    return null;
  }
  const permissions = await getUserPermissions(payload.accountName, accountData.characters);
  logger.info(
    `[verifyWebSocketAuth] ${payload.accountName} maxLevel=${permissions.maxLevel} minLevel=${minLevel}`,
  );
  if (permissions.maxLevel < minLevel) return null;

  return {
    accountName: payload.accountName,
    sessionId: payload.sid,
    permissions,
  };
}

async function hydrateWebSocketPrincipal(
  ws: WebSocket,
  cookieHeader: string | undefined,
): Promise<void> {
  const token = cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('access_token='))
    ?.slice('access_token='.length);
  if (!token) return;

  try {
    const principal = await verifyWebSocketAuth(decodeURIComponent(token), 0, true);
    if (principal) clientState(ws).wsPrincipal = principal;
  } catch (error) {
    logger.warn('[WebSocket] cookie principal hydration failed:', getErrorMessage(error));
  }
}

async function authorizeZoneStream(
  ws: WebSocket,
  token: string | undefined,
  zoneId: unknown,
): Promise<WebSocketPrincipal | null> {
  if (typeof zoneId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(zoneId)) {
    return null;
  }

  const principal = await verifyWebSocketAuth(token, 0);
  if (!principal) return null;

  try {
    const hasGlobalZoneAccess = hasWebSocketPermission(principal, 'manage_zones');
    if (!hasGlobalZoneAccess && !(await canAccessZone(principal.accountName, zoneId, 'view'))) {
      return null;
    }
  } catch (error) {
    logger.warn('[WebSocket] zone access lookup failed:', getErrorMessage(error));
    return null;
  }

  clientState(ws).wsPrincipal = principal;
  return principal;
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

    wss.on('connection', (ws: WebSocket, request) => {
      (ws as any).messageCount = 0;
      (ws as any).lastReset = Date.now();
      (ws as any).logSubscriptions = new Map<string, (newLines: string[]) => void>();
      clientState(ws).playerEventsSubscribed = false;
      clientState(ws).wholistSubscribed = false;
      void hydrateWebSocketPrincipal(ws, request.headers.cookie);

      const ensureTerminalOperation = async (sessionId: number): Promise<boolean> => {
        const terminalAuth = (ws as any).terminalAuth as
          | {
              accountName?: string;
              webSessionId?: string;
            }
          | undefined;
        const authorized =
          terminalAuth?.accountName && terminalAuth.webSessionId
            ? await isTerminalOperationAuthorized(
                sessionId,
                ws,
                terminalAuth.accountName,
                terminalAuth.webSessionId,
              )
            : false;

        if (authorized) return true;

        await destroyTerminalSession(sessionId);
        if (ws.readyState === WebSocket.OPEN) {
          sendApplicationMessage(
            ws,
            JSON.stringify({
              type: 'TERMINAL_ERROR',
              message: 'Terminal session is no longer active',
            }),
          );
        }
        delete (ws as any).terminalAuth;
        return false;
      };

      // Handle incoming messages
      ws.on('message', async (message: string | Buffer) => {
        // Security: Rate limiting (20 messages per second burst)
        const now = Date.now();
        if (now - (ws as any).lastReset > 1000) {
          (ws as any).messageCount = 0;
          (ws as any).lastReset = now;
        }
        (ws as any).messageCount++;

        if ((ws as any).messageCount > 20) {
          sendApplicationMessage(
            ws,
            JSON.stringify({ type: 'ERROR', message: 'Rate limit exceeded' }),
          );
          return;
        }

        // Security: Safe JSON parsing
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch {
          sendApplicationMessage(ws, JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
          return;
        }

        try {
          // Fast ping/pong for latency measurement
          if (data.type === 'ping') {
            sendApplicationMessage(ws, '{"type":"pong"}');
            return;
          }

          // Handle log subscription
          if (data.type === 'SUBSCRIBE_LOG') {
            const principal = await verifyWebSocketAuth(data.token, 0);
            if (!principal || !hasWebSocketPermission(principal, 'view_server_logs')) {
              sendApplicationMessage(
                ws,
                JSON.stringify({ type: 'ERROR', message: 'Server log permission required' }),
              );
              return;
            }
            clientState(ws).wsPrincipal = principal;

            const { category, logName } = data;
            const subscriptionKey = `${category}:${logName}`;

            // Check if already subscribed
            if ((ws as any).logSubscriptions.has(subscriptionKey)) {
              return;
            }

            // Create and store callback for proper cleanup later
            const callback = (newLines: string[]) => {
              // Only send if still subscribed and connection open
              if ((ws as any).logSubscriptions.has(subscriptionKey) && ws.readyState === ws.OPEN) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'LOG_UPDATE',
                    category,
                    logName,
                    newLines,
                  }),
                );
              }
            };

            // Store callback in Map for cleanup
            (ws as any).logSubscriptions.set(subscriptionKey, callback);

            // Start watching the log file
            watchLog(category, logName, callback);

            // Confirm subscription
            sendApplicationMessage(
              ws,
              JSON.stringify({
                type: 'LOG_SUBSCRIBED',
                category,
                logName,
              }),
            );
          }

          // Handle log unsubscription
          if (data.type === 'UNSUBSCRIBE_LOG') {
            const { category, logName } = data;
            const subscriptionKey = `${category}:${logName}`;

            // Get the callback before removing
            const callback = (ws as any).logSubscriptions.get(subscriptionKey);

            // Remove from client's subscriptions
            (ws as any).logSubscriptions.delete(subscriptionKey);

            // Stop watching with the specific callback
            if (callback) {
              unwatchLog(category, logName, callback);
            }

            // Confirm unsubscription
            sendApplicationMessage(
              ws,
              JSON.stringify({
                type: 'LOG_UNSUBSCRIBED',
                category,
                logName,
              }),
            );
          }

          // Handle player events subscription (level 57+ only)
          if (data.type === 'SUBSCRIBE_PLAYER_EVENTS') {
            logger.info('[WebSocket] SUBSCRIBE_PLAYER_EVENTS received');
            const principal = await verifyWebSocketAuth(data.token, 57);
            if (!principal) {
              logger.warn('[WebSocket] player events subscription auth failed');
              return;
            }
            clientState(ws).wsPrincipal = principal;
            clientState(ws).playerEventsSubscribed = true;
            logger.info('[WebSocket] client subscribed to player events');
          }

          if (data.type === 'UNSUBSCRIBE_PLAYER_EVENTS') {
            clientState(ws).playerEventsSubscribed = false;
          }

          // Handle wholist subscription (level 57+ only)
          if (data.type === 'SUBSCRIBE_WHOLIST') {
            const principal = await verifyWebSocketAuth(data.token, 57);
            if (!principal) return;
            clientState(ws).wsPrincipal = principal;
            clientState(ws).wholistSubscribed = true;
          }

          if (data.type === 'UNSUBSCRIBE_WHOLIST') {
            clientState(ws).wholistSubscribed = false;
          }

          // Handle terminal connection request
          if (data.type === 'TERMINAL_CONNECT') {
            try {
              const { token, cols, rows } = data;

              // Verify the short-lived terminal capability
              const payload = verifyTerminalToken(token);
              if (!payload) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'TERMINAL_ERROR',
                    message: 'Invalid or expired token',
                  }),
                );
                return;
              }

              if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'TERMINAL_ERROR',
                    message: 'Session is no longer active',
                  }),
                );
                return;
              }

              // Parse account and check permissions
              const accountData = await parseAccountFile(payload.accountName);
              if (!accountData) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'TERMINAL_ERROR',
                    message: 'Account not found',
                  }),
                );
                return;
              }

              const permissions = await getUserPermissions(
                payload.accountName,
                accountData.characters,
              );

              // Require terminal_access permission OR Overlord role
              const hasTerminalAccess =
                permissions.role === 'overlord' ||
                permissions.adminPermissions?.includes('terminal_access');

              if (!hasTerminalAccess) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'TERMINAL_ERROR',
                    message: 'Terminal access permission required',
                  }),
                );
                return;
              }

              // Create terminal session
              const result = await createTerminalSession(
                payload.accountName,
                ws,
                cols || 80,
                rows || 24,
              );

              if (result.error) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'TERMINAL_ERROR',
                    message: result.error,
                  }),
                );
                return;
              }

              (ws as any).terminalAuth = {
                accountName: payload.accountName,
                webSessionId: payload.sid,
              };

              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'TERMINAL_CONNECTED',
                  sessionId: result.sessionId,
                }),
              );
            } catch (error) {
              logger.error('Terminal connect error:', error);
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: 'Failed to create terminal session',
                }),
              );
            }
          }

          // Handle terminal input
          if (data.type === 'TERMINAL_INPUT') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && (await ensureTerminalOperation(sessionId))) {
              await writeTerminalInput(sessionId, data.data);
            }
          }

          // Handle terminal resize
          if (data.type === 'TERMINAL_RESIZE') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && (await ensureTerminalOperation(sessionId))) {
              resizeTerminal(sessionId, data.cols, data.rows);
            }
          }

          // Handle terminal disconnect
          if (data.type === 'TERMINAL_DISCONNECT') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && (await ensureTerminalOperation(sessionId))) {
              await destroyTerminalSession(sessionId);
            }
          }

          // Handle zone data streaming request
          if (data.type === 'ZONE_STREAM_START') {
            const { zoneId, streamType } = data;

            if (!zoneId || !['rooms', 'mobs', 'objects'].includes(streamType)) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_STREAM_ERROR',
                  zoneId,
                  streamType,
                  message: 'Invalid zone ID or stream type',
                }),
              );
              return;
            }

            const principal = await authorizeZoneStream(ws, data.token, zoneId);
            if (!principal) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_STREAM_ERROR',
                  zoneId,
                  streamType,
                  message: 'Authentication or zone view permission required',
                }),
              );
              return;
            }

            const streamKey = `zone:${zoneId}:${streamType}`;
            if (!wsStreamLimiter.acquire(ws, streamKey)) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_STREAM_ERROR',
                  zoneId,
                  streamType,
                  message: 'Too many active zone streams',
                }),
              );
              return;
            }

            try {
              // Get total count first
              const counts = await countZoneItems(zoneId);
              const total = counts[streamType as 'rooms' | 'mobs' | 'objects'];

              // Send start event
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_STREAM_START',
                  zoneId,
                  streamType,
                  total,
                }),
              );

              // Select streamer
              const streamer =
                streamType === 'rooms'
                  ? streamRooms
                  : streamType === 'mobs'
                    ? streamMobs
                    : streamObjects;

              let loaded = 0;

              // Stream chunks
              for await (const chunk of streamer(zoneId)) {
                // Check if WebSocket is still open
                if (ws.readyState !== WebSocket.OPEN) {
                  break;
                }

                loaded += chunk.length;
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_STREAM_PROGRESS',
                    zoneId,
                    streamType,
                    loaded,
                    total,
                    items: chunk,
                  }),
                );
              }

              // Send complete event
              if (ws.readyState === WebSocket.OPEN) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_STREAM_COMPLETE',
                    zoneId,
                    streamType,
                    total: loaded,
                  }),
                );
              }
            } catch (error) {
              logger.error(`Error streaming ${streamType} for zone ${zoneId}:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_STREAM_ERROR',
                    zoneId,
                    streamType,
                    message: getErrorMessage(error),
                  }),
                );
              }
            } finally {
              wsStreamLimiter.release(ws, streamKey);
            }
          }

          // Handle zone resets streaming request
          if (data.type === 'ZONE_RESETS_STREAM_START') {
            const { zoneId } = data;

            if (!zoneId) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_ERROR',
                  zoneId,
                  message: 'Invalid zone ID',
                }),
              );
              return;
            }

            const principal = await authorizeZoneStream(ws, data.token, zoneId);
            if (!principal) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_ERROR',
                  zoneId,
                  message: 'Authentication or zone view permission required',
                }),
              );
              return;
            }

            const streamKey = `resets:${zoneId}`;
            if (!wsStreamLimiter.acquire(ws, streamKey)) {
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_ERROR',
                  zoneId,
                  message: 'Too many active zone streams',
                }),
              );
              return;
            }

            try {
              // Get total count first
              const total = await countResets(zoneId);

              // Send start event
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_START',
                  zoneId,
                  total,
                }),
              );

              let loaded = 0;

              // Stream chunks
              for await (const chunk of streamResets(zoneId)) {
                // Check if WebSocket is still open
                if (ws.readyState !== WebSocket.OPEN) {
                  break;
                }

                loaded += chunk.length;
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_RESETS_STREAM_PROGRESS',
                    zoneId,
                    loaded,
                    total,
                    items: chunk,
                  }),
                );
              }

              // Send complete event
              if (ws.readyState === WebSocket.OPEN) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_RESETS_STREAM_COMPLETE',
                    zoneId,
                    total: loaded,
                  }),
                );
              }
            } catch (error) {
              logger.error(`Error streaming resets for zone ${zoneId}:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'ZONE_RESETS_STREAM_ERROR',
                    zoneId,
                    message: getErrorMessage(error),
                  }),
                );
              }
            } finally {
              wsStreamLimiter.release(ws, streamKey);
            }
          }

          // Handle deployment request
          if (data.type === 'DEPLOY_START') {
            try {
              const { token, targetHash } = data;

              // Validate hash format
              if (!targetHash || !/^[a-f0-9]{40}$/.test(targetHash)) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'DEPLOY_ERROR',
                    message: 'Invalid commit hash format',
                  }),
                );
                return;
              }

              // Verify the short-lived application WebSocket capability.
              const payload = verifyWebSocketToken(token);
              if (!payload) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'DEPLOY_ERROR',
                    message: 'Invalid or expired token',
                  }),
                );
                return;
              }

              if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'DEPLOY_ERROR',
                    message: 'Session is no longer active',
                  }),
                );
                return;
              }

              // Parse account and check permissions
              const accountData = await parseAccountFile(payload.accountName);
              if (!accountData) {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'DEPLOY_ERROR',
                    message: 'Account not found',
                  }),
                );
                return;
              }

              const permissions = await getUserPermissions(
                payload.accountName,
                accountData.characters,
              );

              // Require Overlord role for deployment
              if (permissions.role !== 'overlord') {
                sendApplicationMessage(
                  ws,
                  JSON.stringify({
                    type: 'DEPLOY_ERROR',
                    message: 'Overlord access required for deployment',
                  }),
                );
                return;
              }

              // Get current hash and determine action
              const currentCommit = await getCurrentCommitHash();
              const action = await determineDeployAction(currentCommit.full, targetHash);

              // Create deployment context
              const ctx: DeploymentContext = {
                ws,
                accountName: payload.accountName,
                ipAddress: 'websocket',
                targetHash,
                fromHash: currentCommit.full,
                action,
                logs: { git: '', compile: '' },
              };

              // Confirm deployment started
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'DEPLOY_STARTED',
                  action,
                  fromHash: currentCommit.short,
                  toHash: targetHash.substring(0, 7),
                }),
              );

              // Start deployment (async, streams progress via WebSocket)
              await deployToCommit(ctx);
            } catch (error) {
              logger.error('Deployment WebSocket error:', error);
              sendApplicationMessage(
                ws,
                JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: getErrorMessage(error) || 'Deployment failed',
                }),
              );
            }
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', async () => {
        delete (ws as any).terminalAuth;
        wsStreamLimiter.clear(ws);
        // Unsubscribe from all logs on disconnect with proper callback cleanup
        (ws as any).logSubscriptions.forEach(
          (callback: (newLines: string[]) => void, subscriptionKey: string) => {
            const [category, logName] = subscriptionKey.split(':');
            unwatchLog(category as 'runtime' | 'player', logName, callback);
          },
        );
        (ws as any).logSubscriptions.clear();

        // Cleanup terminal session if exists
        const sessionId = getSessionByWebSocket(ws);
        if (sessionId !== undefined) {
          await destroyTerminalSession(sessionId);
        }
      });

      ws.on('error', () => {
        logger.warn('Application WebSocket transport error');
      });

      // Send welcome message
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'CONNECTED',
          message: 'Connected to DurisMUD PvP WebSocket',
        }),
      );
    });

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

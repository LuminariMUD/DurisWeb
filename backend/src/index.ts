import express, { Application, Request, Response } from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import logger, { getErrorMessage } from './utils/logger.js';
import pvpRoutes from './routes/pvp.js';
import newsRoutes from './routes/news.js';
import authRoutes from './routes/auth.js';
import forumRoutes from './routes/forum.js';
import adminRoutes from './routes/admin.js';
import contentRoutes from './routes/content.js';
import fragRoutes from './routes/frag.js';
import userManagementRoutes from './routes/userManagement.js';
import zoneRoutes from './routes/zones.js';
import statusRoutes from './routes/status.js';
import serverRebootRoutes from './routes/serverReboot.js';
import gitRoutes from './routes/git.js';
import mudControlRoutes from './routes/mudControl.js';
import builderRoutes from './routes/builder.js';
import wikiRoutes from './routes/wiki.js';
import webAnalyticsRoutes from './routes/webAnalytics.js';
import helpRoutes from './routes/help.js';
import guideRoutes from './routes/guide.js';
import helpSuggestionsRoutes from './routes/helpSuggestions.js';
import notificationsRoutes from './routes/notifications.js';
import auctionRoutes from './routes/auction.js';
import pushRoutes from './routes/push.js';
import changelogRoutes from './routes/changelog.js';
import publicStatisticsRoutes from './routes/publicStatistics.js';
import kofiRoutes from './routes/kofi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generateCsrfToken, verifyCsrfToken } from './middleware/csrf.js';
import { configureRequestBodyParsers } from './middleware/requestLimits.js';
import {
  checkDatabaseConnection,
  verifyDatabaseSchema,
  closeDatabaseConnection,
} from './db/connection.js';
import { closeRedisConnection } from './db/redis.js';
import { getLatestEvents, getPvPEventDetail } from './services/pvpService.js';
import fs from 'fs';
import { startGuildSync, stopGuildSync } from './services/guildSyncService.js';
import { startAccountSyncService } from './services/accountCharacterSync.js';
// netstatWatcher removed - player count now tracked via mud websocket events
import { watchLog, unwatchLog, cleanupLogWatchers } from './services/logWatchService.js';
import {
  createSession as createTerminalSession,
  writeInput as writeTerminalInput,
  resizeTerminal,
  destroySession as destroyTerminalSession,
  getSessionByWebSocket,
  isTerminalOperationAuthorized
} from './services/terminalService.js';
import { verifyToken, verifyTerminalToken, isAccessToken } from './middleware/auth.js';
import { parseAccountFile } from './services/accountService.js';
import { hasActiveWebSession } from './services/sessionService.js';
import { getUserPermissions, type UserPermissions } from './services/permissionService.js';
import {
  deployToCommit,
  determineDeployAction,
  type DeploymentContext
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
import { getWebSettings } from './services/webSettingsService.js';
import { startMudAuctionClient, stopMudAuctionClient, setAuctionBroadcaster } from './services/mudAuctionClient.js';
import { startPlayerEventSubscriber, stopPlayerEventSubscriber, setPlayerEventBroadcaster } from './services/playerEventSubscriber.js';
import { setNotificationBroadcaster, setNewsBroadcaster, notifyPvpBattle } from './services/unifiedNotificationService.js';
import { updateWebSocketCount } from './services/serverHealthService.js';
import { getCategoryAccessForAccount } from './services/categoryService.js';
import { canAccessZone } from './services/zoneInfoService.js';
import {
  WebSocketStreamLimiter,
  canReceiveAccountEvent,
  hasWebSocketPermission,
  type WebSocketPrincipal,
} from './utils/websocketAccess.js';
import { isDiscordEnabled, postBattleToDiscord } from './services/discordService.js';
import { pool } from './db/connection.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

// Trust proxy - required when running behind nginx/reverse proxy
// This allows express-rate-limit to correctly identify users via X-Forwarded-For
app.set('trust proxy', 1);

// Middleware
app.use(compression()); // Enable gzip/deflate compression for all responses
configureRequestBodyParsers(app);
app.use(cookieParser());

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:3000',
]).map(origin => origin.trim());

logger.info('CORS allowed origins:', allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.info(`[CORS] Blocked origin: "${origin}" (not in allowed list)`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// CSRF protection middleware
app.use(generateCsrfToken);
app.use(verifyCsrfToken);

// Request logging middleware
app.use((_req: Request, _res: Response, next) => {
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Fast ping endpoint for latency measurement
app.get('/api/ping', (_req: Request, res: Response) => {
  res.send('pong');
});

// Public site configuration endpoint (no auth required)
app.get('/api/site-config', async (_req: Request, res: Response) => {
  try {
    const settings = await getWebSettings();
    res.json({
      siteTitle: settings.siteTitle,
      siteLogoUrl: settings.siteLogoUrl,
      mudHost: settings.mudHost,
      mudPort: settings.mudPort,
      mudPortTls: settings.mudPortTls,
      mudWsPort: settings.mudWsPort,
      // Front page settings
      frontPageHeroEnabled: settings.frontPageHeroEnabled,
      frontPageHeroTitle: settings.frontPageHeroTitle,
      frontPageHeroSubtitle: settings.frontPageHeroSubtitle,
      frontPageHeroImageUrl: settings.frontPageHeroImageUrl,
      frontPageContent: settings.frontPageContent,
    });
  } catch (error) {
    logger.error('Get site config error:', error);
    res.status(500).json({ error: 'Failed to get site configuration' });
  }
});

// ko-fi webhook (outside /api prefix, no csrf)
app.use('/kofihook', kofiRoutes);

// API routes
app.use('/api/pvp', pvpRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/users', userManagementRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/frag', fragRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/server/reboot', serverRebootRoutes);
app.use('/api/admin/git', gitRoutes);
app.use('/api/mud', mudControlRoutes);
app.use('/api/builder', builderRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/guide', guideRoutes);
app.use('/api', helpSuggestionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', webAnalyticsRoutes);
app.use('/api/admin/analytics/web', webAnalyticsRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/changelog', changelogRoutes);
app.use('/api/public/statistics', publicStatisticsRoutes);

// Serve static maps (works in both dev and prod)
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath, { maxAge: '7d' }));

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  const indexHtmlPath = path.join(frontendDistPath, 'index.html');

  // Serve frontend static files
  app.use(express.static(frontendDistPath));

  // Helper to strip ANSI codes from text
  const stripAnsi = (text: string): string => {
    return text.replace(/&n|&[+=\-][A-Za-z]|&=[A-Za-z]{2}/g, '');
  };

  // Helper to extract player name from description like "[56 Crusader] Juts (Githzerai)"
  const extractPlayerName = (desc: string): string => {
    const stripped = stripAnsi(desc);
    const match = stripped.match(/\]\s*(\w+)/);
    return match?.[1] || stripped;
  };

  // Check if request is from a bot/crawler
  const isBotRequest = (userAgent: string | undefined): boolean => {
    if (!userAgent) return false;
    return /bot|crawler|spider|scraper|discord|telegram|whatsapp|facebook|twitter|slack|linkedin|pinterest|embedly|quora|outbrain|vkshare|facebookexternalhit|twitterbot|telegrambot/i.test(userAgent);
  };

  // Generate OG meta tags for PvP battle
  const generateBattleOgTags = (eventId: number, event: { room_name: string; stamp: Date }, participants: Array<{ player_description: string; pk_type: string }>, logoUrl?: string): string => {
    const killers = participants.filter(p => p.pk_type.includes('KILLER')).map(p => extractPlayerName(p.player_description));
    const victims = participants.filter(p => p.pk_type.includes('VICTIM')).map(p => extractPlayerName(p.player_description));
    const location = stripAnsi(event.room_name);

    const title = `Battle #${eventId} - ${killers.join(', ')} vs ${victims.join(', ')} | NewDuris`;
    const description = `PvP battle at ${location} - ${killers.join(', ')} defeated ${victims.join(', ')}`;
    const url = `https://www.newduris.com/pvp/${eventId}`;

    const imageTags = logoUrl ? `
    <meta property="og:image" content="${logoUrl}">
    <meta name="twitter:image" content="${logoUrl}">` : '';

    return `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="NewDuris">${imageTags}
    <meta name="twitter:card" content="${logoUrl ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="theme-color" content="#16213e">`;
  };

  // Vue Router history mode support - serve index.html for all non-API routes
  app.use(async (req: Request, res: Response): Promise<void> => {
    const userAgent = req.get('user-agent');

    // Check if it's a bot request to a PvP battle page
    const pvpMatch = req.path.match(/^\/pvp\/(\d+)/);
    if (pvpMatch && isBotRequest(userAgent)) {
      const eventId = parseInt(pvpMatch[1], 10);
      try {
        const [battleData, webSettings] = await Promise.all([
          getPvPEventDetail(eventId),
          getWebSettings()
        ]);

        if (battleData) {
          // Read the HTML template
          let html = fs.readFileSync(indexHtmlPath, 'utf-8');

          // Generate and inject OG tags (with logo if available)
          const ogTags = generateBattleOgTags(eventId, battleData.event, battleData.participants, webSettings.siteLogoUrl || undefined);

          // Replace the existing <title> and inject OG tags before </head>
          html = html.replace(/<title>.*?<\/title>/, '');
          html = html.replace('</head>', `${ogTags}\n</head>`);

          res.send(html);
          return;
        }
      } catch (error) {
        logger.error(`[OG Tags] Failed to generate OG tags for battle ${eventId}:`, error);
      }
    }

    // Default: serve the regular index.html
    res.sendFile(indexHtmlPath);
  });
}

// 404 handler (only for development or API routes in production)
if (process.env.NODE_ENV !== 'production') {
  app.use(notFoundHandler);
}

// Global error handler
app.use(errorHandler);

// HTTP and WebSocket server instances
let server: http.Server | null = null;
let wss: WebSocketServer;

const wsStreamLimiter = new WebSocketStreamLimiter<WebSocket>(2);
const ANONYMOUS_WS_PERMISSIONS: UserPermissions = {
  accountName: '',
  role: 'player',
  immortalLevel: null,
  maxLevel: 0,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: [],
};

function getWebSocketPrincipal(client: WebSocket): WebSocketPrincipal | undefined {
  return (client as any).wsPrincipal as WebSocketPrincipal | undefined;
}

function broadcastToPermission(
  message: string,
  permissionKey: string,
  minimumLevel?: number,
): void {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      hasWebSocketPermission(getWebSocketPrincipal(client), permissionKey, minimumLevel)
    ) {
      client.send(message);
    }
  });
}

// Interval timers that need to be cleared on shutdown
let eventCheckInterval: NodeJS.Timeout | null = null;
let fragCheckInterval: NodeJS.Timeout | null = null;
let orphanImageCleanupInterval: NodeJS.Timeout | null = null;
const healthBroadcastInterval: NodeJS.Timeout | null = null;
let wsConnectionCountInterval: NodeJS.Timeout | null = null;

// Track last event ID for new event detection
let lastEventId = 0;

// Track last frag update timestamp for change detection
let lastFragUpdateCheck = new Date();

// Broadcast new PvP event to all connected WebSocket clients
export function broadcastNewEvent(event: any) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'NEW_PVP_EVENT',
    data: event,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast frag leaderboard update to all connected WebSocket clients
async function broadcastFragUpdate() {
  if (!wss) return;

  try {
    const message = JSON.stringify({
      type: 'FRAG_UPDATE',
      data: {
        timestamp: new Date().toISOString(),
      },
    });

    let sentCount = 0;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      logger.info(`broadcast frag update to ${sentCount} clients`);
    }
  } catch (error) {
    logger.error('Error broadcasting frag update:', error);
  }
}

// Broadcast crash alert to all connected WebSocket clients
export function broadcastCrashAlert(crash: any) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'CRASH_ALERT',
    data: crash,
  });

  broadcastToPermission(message, 'view_server_health');
}

// Broadcast backup progress to all connected WebSocket clients
export function broadcastBackupProgress(data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
  filename: string;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'BACKUP_PROGRESS',
    data,
  });

  broadcastToPermission(message, 'manage_mud_backup');
}

// Broadcast restore progress to all connected WebSocket clients
export function broadcastRestoreProgress(data: {
  id: number;
  progress: number;
  currentStep: string;
  status: string;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'RESTORE_PROGRESS',
    data,
  });

  broadcastToPermission(message, 'manage_mud_backup');
}

// Broadcast MUD state change to all connected WebSocket clients
export function broadcastMudStateChange(data: {
  state: string;
  action?: string;
  by?: string;
  reason?: string;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'MUD_STATE_CHANGE',
    data: {
      ...data,
      timestamp: new Date().toISOString(),
    },
  });

  broadcastToPermission(message, 'manage_mud_properties');

  logger.info(`Broadcast MUD state change: ${data.state} (${data.action || 'status'})`);
}

// Broadcast auction event to all connected WebSocket clients
export function broadcastAuctionEvent(type: string, data: any) {
  if (!wss) return;

  const message = JSON.stringify({
    type,
    data,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast player events to subscribed clients only (admin dashboard)
export function broadcastPlayerEvent(type: string, data: any) {
  if (!wss) return;

  const message = JSON.stringify({ type, data });
  let sent = 0;

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      (client as any).playerEventsSubscribed &&
      hasWebSocketPermission(getWebSocketPrincipal(client), 'view_server_health', 57)
    ) {
      client.send(message);
      sent++;
    }
  });

  logger.info(`[broadcastPlayerEvent] ${type} sent to ${sent} clients`);
}

// Broadcast wholist to subscribed clients only
export function broadcastWholist(type: string, data: any) {
  if (!wss) return;

  const message = JSON.stringify({ type, data });

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      (client as any).wholistSubscribed &&
      hasWebSocketPermission(getWebSocketPrincipal(client), 'view_server_health', 57)
    ) {
      client.send(message);
    }
  });
}

// Broadcast MUD control output to all connected WebSocket clients
export function broadcastMudControlOutput(data: {
  operationId: string;
  chunk: string;
  isComplete: boolean;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'MUD_CONTROL_OUTPUT',
    data,
  });

  broadcastToPermission(message, 'manage_mud_properties');
}

// Broadcast new forum post to all connected WebSocket clients
export async function broadcastForumPost(
  threadId: number,
  post: object,
  authorAccount: string,
  categoryId: number,
): Promise<void> {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'NEW_FORUM_POST',
    threadId,
    post,
    authorAccount,
  });

  await Promise.all(Array.from(wss.clients).map(async (client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    const principal = getWebSocketPrincipal(client);
    try {
      const access = await getCategoryAccessForAccount(
        categoryId,
        principal?.permissions || ANONYMOUS_WS_PERMISSIONS,
      );
      if (access.canView) client.send(message);
    } catch (error) {
      logger.error('Error checking forum broadcast access:', error);
    }
  }));
}

// Broadcast connection log event to all connected WebSocket clients
export function broadcastConnectionEvent(event: {
  characterName: string;
  status: string;
  ipAddress: string;
  timestamp: Date;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'CONNECTION_EVENT',
    data: {
      characterName: event.characterName,
      status: event.status,
      ip: event.ipAddress,
      timestamp: event.timestamp,
    },
  });

  broadcastToPermission(message, 'view_connection_logs');
}

// Broadcast new notification to all connected WebSocket clients
export function broadcastNotification(accountName: string, notification: any) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'NEW_NOTIFICATION',
    accountName,
    data: notification,
  });

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      canReceiveAccountEvent(getWebSocketPrincipal(client), accountName)
    ) {
      client.send(message);
    }
  });
}

// Broadcast news update to all connected WebSocket clients
export function broadcastNewsUpdate(data: { date: string; items: string[] }) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'NEWS_UPDATED',
    data,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  logger.info(`[Broadcast] News update sent to ${wss.clients.size} clients`);
}

// Update WebSocket connection count for health monitoring
function updateWebSocketConnectionCount() {
  if (!wss) return;

  const count = wss.clients.size;
  updateWebSocketCount(count);
}

// Check for frag leaderboard changes
async function checkForFragUpdates() {
  try {
    // Query for any frag records updated since last check
    const [rows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM frag_leaderboard WHERE last_updated > ?',
      [lastFragUpdateCheck]
    );

    if (rows[0].count > 0) {
      // Update timestamp and broadcast
      lastFragUpdateCheck = new Date();
      await broadcastFragUpdate();
    }
  } catch (error) {
    logger.error('Error checking for frag updates:', error);
  }
}

// Poll database for new events
async function checkForNewEvents() {
  try {
    const result = await getLatestEvents(1, 0);

    if (result.events.length > 0) {
      const latestEvent = result.events[0];

      // If we have a new event, broadcast it
      if (latestEvent.id > lastEventId) {
        lastEventId = latestEvent.id;
        broadcastNewEvent(latestEvent);

        // send push notification to all subscribers
        if (latestEvent.victims && latestEvent.killers) {
          notifyPvpBattle(
            latestEvent.id,
            latestEvent.victims,
            latestEvent.killers,
            latestEvent.room_name || 'Unknown'
          ).catch(err => logger.error('failed to send pvp push notification:', err));

          // post to discord if enabled
          (async () => {
            try {
              const enabled = await isDiscordEnabled();
              if (enabled) {
                const participants = [
                  ...latestEvent.killers.map((k: { description: string; isLeader: boolean }) => ({
                    description: k.description,
                    pk_type: k.isLeader ? 'KILLER' : 'KILLER-GROUP',
                    leader: k.isLeader,
                  })),
                  ...latestEvent.victims.map((v: { description: string; isLeader: boolean; died: boolean }) => ({
                    description: v.description,
                    pk_type: v.died ? 'VICTIM' : 'VICTIM-GROUP',
                    leader: v.isLeader,
                  })),
                ];
                await postBattleToDiscord(
                  latestEvent.id,
                  latestEvent.stamp,
                  latestEvent.room_name || 'Unknown',
                  participants
                );
              }
            } catch (err) {
              logger.error('failed to post to discord:', err);
            }
          })();
        }
      }
    }
  } catch (error) {
    logger.error('Error checking for new events:', error);
  }
}

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('\nReceived shutdown signal, closing server gracefully...');

  // Clear all interval timers
  if (eventCheckInterval) clearInterval(eventCheckInterval);
  if (fragCheckInterval) clearInterval(fragCheckInterval);
  if (orphanImageCleanupInterval) clearInterval(orphanImageCleanupInterval);
  if (healthBroadcastInterval) clearInterval(healthBroadcastInterval);
  if (wsConnectionCountInterval) clearInterval(wsConnectionCountInterval);

  // Stop sync services
  stopGuildSync();

  // Stop background services
  const { stopAccountSyncService } = await import('./services/accountCharacterSync.js');
  stopAccountSyncService();

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

  // Close HTTP server
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });
  }

  // Close WebSocket connections
  if (wss) {
    wss.clients.forEach((client) => {
      client.close(1000, 'Server shutting down');
    });
    await new Promise<void>((resolve) => {
      wss.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }

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

// Validate MUD directory at startup
async function validateMudDirectory(): Promise<void> {
  const { access, constants } = await import('fs/promises');

  const MUD_DIR = process.env.MUD_DIR;

  if (!MUD_DIR) {
    logger.error('FATAL: MUD_DIR environment variable is not set');
    logger.error('Set it to the absolute path of your DurisMUD directory');
    process.exit(1);
  }

  if (!path.isAbsolute(MUD_DIR)) {
    logger.error('FATAL: MUD_DIR must be an absolute path');
    logger.error(`Got: ${MUD_DIR}`);
    process.exit(1);
  }

  try {
    await access(MUD_DIR, constants.R_OK | constants.X_OK);
  } catch {
    logger.error(`FATAL: Cannot access MUD_DIR: ${MUD_DIR}`);
    logger.error('Verify the path exists and has correct permissions');
    process.exit(1);
  }

  logger.info(`mud directory validated: ${MUD_DIR}`);
}

// helper to verify websocket auth with minimum level requirement
async function verifyWebSocketAuth(
  token: string | undefined,
  minLevel: number,
): Promise<WebSocketPrincipal | null> {
  if (!token) {
    logger.warn('[verifyWebSocketAuth] no token provided');
    return null;
  }
  const payload = verifyToken(token);
  if (!isAccessToken(payload)) {
    logger.warn('[verifyWebSocketAuth] invalid or non-access token');
    return null;
  }
  if (!payload.sid || !await hasActiveWebSession(payload.accountName, payload.sid)) {
    logger.warn('[verifyWebSocketAuth] inactive or legacy session');
    return null;
  }
  const accountData = await parseAccountFile(payload.accountName);
  if (!accountData) {
    logger.warn(`[verifyWebSocketAuth] no account data for ${payload.accountName}`);
    return null;
  }
  const permissions = await getUserPermissions(payload.accountName, accountData.characters);
  logger.info(`[verifyWebSocketAuth] ${payload.accountName} maxLevel=${permissions.maxLevel} minLevel=${minLevel}`);
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
    const principal = await verifyWebSocketAuth(decodeURIComponent(token), 0);
    if (principal) (ws as any).wsPrincipal = principal;
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

  (ws as any).wsPrincipal = principal;
  return principal;
}

async function startServer() {
  try {
    // Validate MUD directory first
    await validateMudDirectory();

    // Check database connection
    logger.info('Checking database connection...');
    const isConnected = await checkDatabaseConnection();

    if (!isConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Verify database schema
    logger.info('\nVerifying database schema...');
    await verifyDatabaseSchema();

    // Get initial last event ID
    const initialEvents = await getLatestEvents(1, 0);
    if (initialEvents.events.length > 0) {
      lastEventId = initialEvents.events[0].id;
    }

    // Create HTTP server from Express app
    server = http.createServer(app);

    // Create WebSocket server
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws: WebSocket, request) => {
      (ws as any).messageCount = 0;
      (ws as any).lastReset = Date.now();
      (ws as any).logSubscriptions = new Map<string, (newLines: string[]) => void>();
      (ws as any).playerEventsSubscribed = false;
      (ws as any).wholistSubscribed = false;
      void hydrateWebSocketPrincipal(ws, request.headers.cookie);

      ws.on('close', async () => {
        const sessionId = getSessionByWebSocket(ws);
        if (sessionId !== undefined) {
          await destroyTerminalSession(sessionId);
        }
        delete (ws as any).terminalAuth;
        wsStreamLimiter.clear(ws);
      });

      const ensureTerminalOperation = async (sessionId: number): Promise<boolean> => {
        const terminalAuth = (ws as any).terminalAuth as {
          accountName?: string;
          webSessionId?: string;
        } | undefined;
        const authorized = terminalAuth?.accountName && terminalAuth.webSessionId
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
          ws.send(JSON.stringify({
            type: 'TERMINAL_ERROR',
            message: 'Terminal session is no longer active',
          }));
        }
        delete (ws as any).terminalAuth;
        return false;
      };

      // Handle incoming messages
      ws.on('message', async (message: string | Buffer) => {
        // Security: Message size limit (10KB max)
        const MAX_MESSAGE_SIZE = 10 * 1024;
        if (message.length > MAX_MESSAGE_SIZE) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Message too large' }));
          return;
        }

        // Security: Rate limiting (20 messages per second burst)
        const now = Date.now();
        if (now - (ws as any).lastReset > 1000) {
          (ws as any).messageCount = 0;
          (ws as any).lastReset = now;
        }
        (ws as any).messageCount++;

        if ((ws as any).messageCount > 20) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Rate limit exceeded' }));
          return;
        }

        // Security: Safe JSON parsing
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
          return;
        }

        try {
          // Fast ping/pong for latency measurement
          if (data.type === 'ping') {
            ws.send('{"type":"pong"}');
            return;
          }

          // Handle log subscription
          if (data.type === 'SUBSCRIBE_LOG') {
            const principal = await verifyWebSocketAuth(data.token, 0);
            if (!principal || !hasWebSocketPermission(principal, 'view_server_logs')) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Server log permission required' }));
              return;
            }
            (ws as any).wsPrincipal = principal;

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
                ws.send(JSON.stringify({
                  type: 'LOG_UPDATE',
                  category,
                  logName,
                  newLines,
                }));
              }
            };

            // Store callback in Map for cleanup
            (ws as any).logSubscriptions.set(subscriptionKey, callback);

            // Start watching the log file
            watchLog(category, logName, callback);

            // Confirm subscription
            ws.send(JSON.stringify({
              type: 'LOG_SUBSCRIBED',
              category,
              logName,
            }));
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
            ws.send(JSON.stringify({
              type: 'LOG_UNSUBSCRIBED',
              category,
              logName,
            }));
          }

          // Handle player events subscription (level 57+ only)
          if (data.type === 'SUBSCRIBE_PLAYER_EVENTS') {
            logger.info('[WebSocket] SUBSCRIBE_PLAYER_EVENTS received');
            const principal = await verifyWebSocketAuth(data.token, 57);
            if (!principal) {
              logger.warn('[WebSocket] player events subscription auth failed');
              return;
            }
            (ws as any).wsPrincipal = principal;
            (ws as any).playerEventsSubscribed = true;
            logger.info('[WebSocket] client subscribed to player events');
          }

          if (data.type === 'UNSUBSCRIBE_PLAYER_EVENTS') {
            (ws as any).playerEventsSubscribed = false;
          }

          // Handle wholist subscription (level 57+ only)
          if (data.type === 'SUBSCRIBE_WHOLIST') {
            const principal = await verifyWebSocketAuth(data.token, 57);
            if (!principal) return;
            (ws as any).wsPrincipal = principal;
            (ws as any).wholistSubscribed = true;
          }

          if (data.type === 'UNSUBSCRIBE_WHOLIST') {
            (ws as any).wholistSubscribed = false;
          }

          // Handle terminal connection request
          if (data.type === 'TERMINAL_CONNECT') {
            try {
              const { token, cols, rows } = data;

              // Verify the short-lived terminal capability
              const payload = verifyTerminalToken(token);
              if (!payload) {
                ws.send(JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: 'Invalid or expired token'
                }));
                return;
              }

              if (!payload.sid || !await hasActiveWebSession(payload.accountName, payload.sid)) {
                ws.send(JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: 'Session is no longer active'
                }));
                return;
              }

              // Parse account and check permissions
              const accountData = await parseAccountFile(payload.accountName);
              if (!accountData) {
                ws.send(JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: 'Account not found'
                }));
                return;
              }

              const permissions = await getUserPermissions(payload.accountName, accountData.characters);

              // Require terminal_access permission OR Overlord role
              const hasTerminalAccess = permissions.role === 'overlord' ||
                permissions.adminPermissions?.includes('terminal_access');

              if (!hasTerminalAccess) {
                ws.send(JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: 'Terminal access permission required'
                }));
                return;
              }

              // Create terminal session
              const result = await createTerminalSession(
                payload.accountName,
                ws,
                cols || 80,
                rows || 24
              );

              if (result.error) {
                ws.send(JSON.stringify({
                  type: 'TERMINAL_ERROR',
                  message: result.error
                }));
                return;
              }

              (ws as any).terminalAuth = {
                accountName: payload.accountName,
                webSessionId: payload.sid,
              };

              ws.send(JSON.stringify({
                type: 'TERMINAL_CONNECTED',
                sessionId: result.sessionId
              }));

            } catch (error) {
              logger.error('Terminal connect error:', error);
              ws.send(JSON.stringify({
                type: 'TERMINAL_ERROR',
                message: 'Failed to create terminal session'
              }));
            }
          }

          // Handle terminal input
          if (data.type === 'TERMINAL_INPUT') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && await ensureTerminalOperation(sessionId)) {
              await writeTerminalInput(sessionId, data.data);
            }
          }

          // Handle terminal resize
          if (data.type === 'TERMINAL_RESIZE') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && await ensureTerminalOperation(sessionId)) {
              resizeTerminal(sessionId, data.cols, data.rows);
            }
          }

          // Handle terminal disconnect
          if (data.type === 'TERMINAL_DISCONNECT') {
            const sessionId = getSessionByWebSocket(ws);
            if (sessionId !== undefined && await ensureTerminalOperation(sessionId)) {
              await destroyTerminalSession(sessionId);
            }
          }

          // Handle zone data streaming request
          if (data.type === 'ZONE_STREAM_START') {
            const { zoneId, streamType } = data;

            if (!zoneId || !['rooms', 'mobs', 'objects'].includes(streamType)) {
              ws.send(JSON.stringify({
                type: 'ZONE_STREAM_ERROR',
                zoneId,
                streamType,
                message: 'Invalid zone ID or stream type',
              }));
              return;
            }

            const principal = await authorizeZoneStream(ws, data.token, zoneId);
            if (!principal) {
              ws.send(JSON.stringify({
                type: 'ZONE_STREAM_ERROR',
                zoneId,
                streamType,
                message: 'Authentication or zone view permission required',
              }));
              return;
            }

            const streamKey = `zone:${zoneId}:${streamType}`;
            if (!wsStreamLimiter.acquire(ws, streamKey)) {
              ws.send(JSON.stringify({
                type: 'ZONE_STREAM_ERROR',
                zoneId,
                streamType,
                message: 'Too many active zone streams',
              }));
              return;
            }

            try {
              // Get total count first
              const counts = await countZoneItems(zoneId);
              const total = counts[streamType as 'rooms' | 'mobs' | 'objects'];

              // Send start event
              ws.send(JSON.stringify({
                type: 'ZONE_STREAM_START',
                zoneId,
                streamType,
                total,
              }));

              // Select streamer
              const streamer = streamType === 'rooms' ? streamRooms :
                               streamType === 'mobs' ? streamMobs : streamObjects;

              let loaded = 0;

              // Stream chunks
              for await (const chunk of streamer(zoneId)) {
                // Check if WebSocket is still open
                if (ws.readyState !== WebSocket.OPEN) {
                  break;
                }

                loaded += chunk.length;
                ws.send(JSON.stringify({
                  type: 'ZONE_STREAM_PROGRESS',
                  zoneId,
                  streamType,
                  loaded,
                  total,
                  items: chunk,
                }));
              }

              // Send complete event
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ZONE_STREAM_COMPLETE',
                  zoneId,
                  streamType,
                  total: loaded,
                }));
              }
            } catch (error) {
              logger.error(`Error streaming ${streamType} for zone ${zoneId}:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ZONE_STREAM_ERROR',
                  zoneId,
                  streamType,
                  message: getErrorMessage(error),
                }));
              }
            } finally {
              wsStreamLimiter.release(ws, streamKey);
            }
          }

          // Handle zone resets streaming request
          if (data.type === 'ZONE_RESETS_STREAM_START') {
            const { zoneId } = data;

            if (!zoneId) {
              ws.send(JSON.stringify({
                type: 'ZONE_RESETS_STREAM_ERROR',
                zoneId,
                message: 'Invalid zone ID',
              }));
              return;
            }

            const principal = await authorizeZoneStream(ws, data.token, zoneId);
            if (!principal) {
              ws.send(JSON.stringify({
                type: 'ZONE_RESETS_STREAM_ERROR',
                zoneId,
                message: 'Authentication or zone view permission required',
              }));
              return;
            }

            const streamKey = `resets:${zoneId}`;
            if (!wsStreamLimiter.acquire(ws, streamKey)) {
              ws.send(JSON.stringify({
                type: 'ZONE_RESETS_STREAM_ERROR',
                zoneId,
                message: 'Too many active zone streams',
              }));
              return;
            }

            try {
              // Get total count first
              const total = await countResets(zoneId);

              // Send start event
              ws.send(JSON.stringify({
                type: 'ZONE_RESETS_STREAM_START',
                zoneId,
                total,
              }));

              let loaded = 0;

              // Stream chunks
              for await (const chunk of streamResets(zoneId)) {
                // Check if WebSocket is still open
                if (ws.readyState !== WebSocket.OPEN) {
                  break;
                }

                loaded += chunk.length;
                ws.send(JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_PROGRESS',
                  zoneId,
                  loaded,
                  total,
                  items: chunk,
                }));
              }

              // Send complete event
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_COMPLETE',
                  zoneId,
                  total: loaded,
                }));
              }
            } catch (error) {
              logger.error(`Error streaming resets for zone ${zoneId}:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ZONE_RESETS_STREAM_ERROR',
                  zoneId,
                  message: getErrorMessage(error),
                }));
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
                ws.send(JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: 'Invalid commit hash format',
                }));
                return;
              }

              // Verify JWT token
              const payload = verifyToken(token);
              if (!isAccessToken(payload)) {
                ws.send(JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: 'Invalid or expired token',
                }));
                return;
              }

              if (!payload.sid || !await hasActiveWebSession(payload.accountName, payload.sid)) {
                ws.send(JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: 'Session is no longer active',
                }));
                return;
              }

              // Parse account and check permissions
              const accountData = await parseAccountFile(payload.accountName);
              if (!accountData) {
                ws.send(JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: 'Account not found',
                }));
                return;
              }

              const permissions = await getUserPermissions(payload.accountName, accountData.characters);

              // Require Overlord role for deployment
              if (permissions.role !== 'overlord') {
                ws.send(JSON.stringify({
                  type: 'DEPLOY_ERROR',
                  message: 'Overlord access required for deployment',
                }));
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
              ws.send(JSON.stringify({
                type: 'DEPLOY_STARTED',
                action,
                fromHash: currentCommit.short,
                toHash: targetHash.substring(0, 7),
              }));

              // Start deployment (async, streams progress via WebSocket)
              await deployToCommit(ctx);

            } catch (error) {
              logger.error('Deployment WebSocket error:', error);
              ws.send(JSON.stringify({
                type: 'DEPLOY_ERROR',
                message: getErrorMessage(error) || 'Deployment failed',
              }));
            }
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', async () => {
        // Unsubscribe from all logs on disconnect with proper callback cleanup
        (ws as any).logSubscriptions.forEach((callback: (newLines: string[]) => void, subscriptionKey: string) => {
          const [category, logName] = subscriptionKey.split(':');
          unwatchLog(category as 'runtime' | 'player', logName, callback);
        });
        (ws as any).logSubscriptions.clear();

        // Cleanup terminal session if exists
        const sessionId = getSessionByWebSocket(ws);
        if (sessionId !== undefined) {
          await destroyTerminalSession(sessionId);
        }
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'CONNECTED',
          message: 'Connected to DurisMUD PvP WebSocket',
        })
      );
    });

    // Get pvp delay setting for polling interval
    const settings = await getWebSettings();
    const pvpPollInterval = settings.pvpDelayMinutes * 60 * 1000;
    logger.info(`PvP/frag polling interval set to ${settings.pvpDelayMinutes} minutes`);

    // Start polling for new events using pvpDelayMinutes setting
    eventCheckInterval = setInterval(checkForNewEvents, pvpPollInterval);

    // Start polling for frag updates using same interval
    fragCheckInterval = setInterval(checkForFragUpdates, pvpPollInterval);

    // netstat watcher removed - player count now tracked via mud websocket events

    // Start guild auto-access sync service (polls every 5 minutes)
    // DISABLED by default - set ENABLE_GUILD_SYNC=true in .env to enable
    if (process.env.ENABLE_GUILD_SYNC === 'true') {
      startGuildSync();
      logger.info('Guild sync service enabled');
    } else {
      logger.info('Guild sync service disabled (set ENABLE_GUILD_SYNC=true to enable)');
    }

    // crash detection now handled by mud websocket disconnect in mudAuctionClient

    // Start server health monitoring (records metrics every 5 minutes)
    const { startHealthMonitoring } = await import('./services/serverHealthService.js');
    startHealthMonitoring();
    logger.info('Server health monitoring started');


    // Update WebSocket connection count every 10 seconds
    wsConnectionCountInterval = setInterval(updateWebSocketConnectionCount, 10000);

    // Start account-character sync service (polls every 5 minutes)
    startAccountSyncService();

    // Initialize GeoIP database
    const { initializeGeoIP } = await import('./utils/geoip.js');
    await initializeGeoIP();

    // mud connection log sync removed - now using websocket events from mudAuctionClient

    // Initialize backup service broadcaster and scheduler
    const { setProgressBroadcaster, setRestoreProgressBroadcaster, startHourlyBackupScheduler } = await import('./services/backupService.js');
    setProgressBroadcaster(broadcastBackupProgress);
    setRestoreProgressBroadcaster(broadcastRestoreProgress);
    startHourlyBackupScheduler();
    logger.info('Backup service initialized with hourly scheduler');

    // Initialize MUD control service broadcasters
    const { setStateBroadcaster, setOutputBroadcaster } = await import('./services/mudControlService.js');
    setStateBroadcaster(broadcastMudStateChange);
    setOutputBroadcaster(broadcastMudControlOutput);
    logger.info('MUD control service initialized');

    // Initialize MUD auction websocket client
    setAuctionBroadcaster(broadcastAuctionEvent);
    startMudAuctionClient();
    logger.info('MUD auction client started');

    // Initialize player event subscriber (redis pub/sub for login/logout)
    setPlayerEventBroadcaster(broadcastPlayerEvent);
    startPlayerEventSubscriber();
    logger.info('Player event subscriber started');

    // Initialize notification broadcaster
    setNotificationBroadcaster(broadcastNotification);
    logger.info('Notification broadcaster initialized');

    // Initialize news broadcaster
    setNewsBroadcaster(broadcastNewsUpdate);
    logger.info('News broadcaster initialized');

    // Start orphan image cleanup job (every hour)
    orphanImageCleanupInterval = setInterval(async () => {
      try {
        const deleted = await cleanupOrphanImages();
        if (deleted > 0) {
          logger.info(`Cleaned up ${deleted} orphan forum images`);
        }
      } catch (error) {
        logger.error('Error cleaning up orphan images:', error);
      }
    }, 60 * 60 * 1000); // Run every hour
    logger.info('Orphan image cleanup service started');

    // Start listening
    server.listen(PORT, HOST, () => {
      logger.info(`\n${'='.repeat(50)}`);
      logger.info(`DurisMUD PvP API Server`);
      logger.info(`${'='.repeat(50)}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
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
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Export for testing
export default app;

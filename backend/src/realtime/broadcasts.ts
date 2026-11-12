import { WebSocket, type WebSocketServer } from 'ws';
import logger from '../utils/logger.js';
import type { UserPermissions } from '../services/permissionService.js';
import { getCategoryAccessForAccount } from '../services/categoryService.js';
import {
  canReceiveAccountEvent,
  hasWebSocketPermission,
  type WebSocketPrincipal,
} from '../utils/websocketAccess.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import { clientState } from './clientState.js';

// The application WebSocket server bound by runtime startup; broadcasts are no-ops without it.
let wss: WebSocketServer | null = null;

/** Bind the one application WebSocket server that broadcasts deliver to. */
export function attachBroadcastServer(server: WebSocketServer): void {
  wss = server;
}

/** Clear the binding on stop so later broadcasts are no-ops. */
export function detachBroadcastServer(): void {
  wss = null;
}

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
  return clientState(client).wsPrincipal;
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
      sendApplicationMessage(client, message);
    }
  });
}

// Broadcast new PvP event to all connected WebSocket clients
export function broadcastNewEvent(event: any) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'NEW_PVP_EVENT',
    data: event,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      sendApplicationMessage(client, message);
    }
  });
}

// Broadcast frag leaderboard update to all connected WebSocket clients
export async function broadcastFragUpdate() {
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
        if (sendApplicationMessage(client, message)) sentCount++;
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
      sendApplicationMessage(client, message);
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
      clientState(client).playerEventsSubscribed &&
      hasWebSocketPermission(getWebSocketPrincipal(client), 'view_server_health', 57)
    ) {
      if (sendApplicationMessage(client, message)) sent++;
    }
  });

  logger.info(`[broadcastPlayerEvent] ${type} sent to ${sent} clients`);
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

  await Promise.all(
    Array.from(wss.clients).map(async (client) => {
      if (client.readyState !== WebSocket.OPEN) return;

      const principal = getWebSocketPrincipal(client);
      try {
        const access = await getCategoryAccessForAccount(
          categoryId,
          principal?.permissions || ANONYMOUS_WS_PERMISSIONS,
        );
        if (access.canView) sendApplicationMessage(client, message);
      } catch (error) {
        logger.error('Error checking forum broadcast access:', error);
      }
    }),
  );
}

// Broadcast connection log event to all connected WebSocket clients. The player's IP address
// stays server-side: no client consumes it, and the connection log API serves it on request.
export function broadcastConnectionEvent(event: {
  characterName: string;
  status: string;
  timestamp: Date;
}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'CONNECTION_EVENT',
    data: {
      characterName: event.characterName,
      status: event.status,
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
      sendApplicationMessage(client, message);
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
      sendApplicationMessage(client, message);
    }
  });

  logger.info(`[Broadcast] News update sent to ${wss.clients.size} clients`);
}

/**
 * mudAuctionClient.ts - websocket client to receive auction events from MUD
 *
 * connects to MUD's websocket server (port 4050), authenticates as durisweb,
 * and listens for auction events to broadcast to frontend clients.
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { getWebSettings } from './webSettingsService.js';
import * as notificationService from './unifiedNotificationService.js';
import { pool as db } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// auction event types from MUD
export interface AuctionNewEvent {
  id: number;
  seller: string;
  item: string;
  price: number;
  buyPrice: number;
  endTime: number;
}

export interface AuctionBidEvent {
  id: number;
  bidder: string;
  amount: number;
  prevBidderPid: number;
  prevBidder: string;
}

export interface AuctionCloseEvent {
  id: number;
  winner: string;
  winnerPid: number;
  price: number;
  reason: 'sold' | 'expired' | 'buynow' | 'removed';
  sellerPid: number;
  seller: string;
}

// callback type for broadcasting to frontend
type AuctionBroadcaster = (type: string, data: any) => void;

let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let broadcaster: AuctionBroadcaster | null = null;
let isShuttingDown = false;

const RECONNECT_DELAY = 5000; // 5 seconds
const PING_INTERVAL = 30000; // 30 seconds
const COMMAND_TIMEOUT = 10000; // 10 seconds timeout for command responses
let pingInterval: NodeJS.Timeout | null = null;

// Pending command requests waiting for MUD response
interface PendingRequest {
  resolve: (result: { success: boolean; error?: string }) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}
const pendingRequests = new Map<string, PendingRequest>();
let requestIdCounter = 0;

/**
 * generate hmac signature for durisweb authentication
 */
function generateDuriswebSig(): string {
  const secret = process.env.DURISWEB_SECRET || 'Dur1sM4pK3y2025xYz!';
  const minute = Math.floor(Date.now() / 60000);
  const ts = minute.toString();

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(ts);
  return hmac.digest('hex');
}

/**
 * connect to MUD websocket and start listening for auction events
 */
async function connect(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const settings = await getWebSettings();
    const wsPort = settings.mudWsPort || '4050';
    // backend always runs on same server as mud, use localhost
    const wsUrl = `ws://localhost:${wsPort}`;

    logger.info(`[MUD Auction] Connecting to ${wsUrl}...`);

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info('[MUD Auction] Connected to MUD websocket');

      // send durisweb_auth command
      const authMsg = {
        type: 'cmd',
        cmd: 'durisweb_auth',
        data: {
          sig: generateDuriswebSig(),
        },
      };

      ws?.send(JSON.stringify(authMsg));
      logger.info('[MUD Auction] Sent durisweb_auth');

      // start ping interval
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, PING_INTERVAL);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(msg);
      } catch (err) {
        logger.error('[MUD Auction] Error parsing message:', err);
      }
    });

    ws.on('close', (code, reason) => {
      logger.info(`[MUD Auction] Connection closed: ${code} ${reason}`);
      cleanup();
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      logger.error('[MUD Auction] WebSocket error:', err);
    });

    ws.on('pong', () => {
      // connection is alive
    });

  } catch (err) {
    logger.error('[MUD Auction] Connection error:', err);
    scheduleReconnect();
  }
}

/**
 * handle websocket messages from MUD
 */
function handleMessage(msg: any): void {
  switch (msg.type) {
    case 'durisweb_auth':
      if (msg.success) {
        logger.info('[MUD Auction] Authentication successful');
      } else {
        logger.error(`[MUD Auction] Authentication failed: ${msg.error}`);
      }
      break;

    case 'admin_delete_progress':
      // Broadcast progress update to frontend
      logger.info(`[MUD Command] Delete progress: ${msg.message} (${msg.status})`);
      broadcast('DELETE_PROGRESS', {
        requestId: msg.requestId,
        message: msg.message,
        status: msg.status
      });
      break;

    case 'admin_delete_character':
      // Resolve pending request if exists
      if (msg.requestId && pendingRequests.has(msg.requestId)) {
        const pending = pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timeout);
        pendingRequests.delete(msg.requestId);

        if (msg.success) {
          logger.info(`[MUD Command] Character deleted: ${msg.name} from account ${msg.account}`);
          // Soft delete in database
          softDeleteCharacter(msg.account, msg.name);
          pending.resolve({ success: true });
        } else {
          logger.error(`[MUD Command] Character deletion failed: ${msg.error}`);
          pending.resolve({ success: false, error: msg.error || 'Character deletion failed' });
        }
      } else {
        // No pending request (shouldn't happen but log it)
        if (msg.success) {
          logger.info(`[MUD Command] Character deleted (no pending request): ${msg.name}`);
          softDeleteCharacter(msg.account, msg.name);
        } else {
          logger.error(`[MUD Command] Character deletion failed (no pending request): ${msg.error}`);
        }
      }
      break;

    case 'auction_new':
      logger.info(`[MUD Auction] New auction: #${msg.data.id} ${msg.data.item} by ${msg.data.seller}`);
      broadcast('AUCTION_NEW', msg.data as AuctionNewEvent);
      break;

    case 'auction_bid':
      logger.info(`[MUD Auction] Bid on #${msg.data.id}: ${msg.data.amount}c by ${msg.data.bidder}`);
      broadcast('AUCTION_BID', msg.data as AuctionBidEvent);
      // Notify previous bidder they were outbid
      handleAuctionBid(msg.data as AuctionBidEvent);
      break;

    case 'auction_close':
      logger.info(`[MUD Auction] Auction #${msg.data.id} closed: ${msg.data.reason}`);
      broadcast('AUCTION_CLOSE', msg.data as AuctionCloseEvent);
      // Create notifications for sold auctions
      handleAuctionClose(msg.data as AuctionCloseEvent);
      break;

    default:
      // ignore other message types
      break;
  }
}

/**
 * broadcast auction event to frontend clients
 */
function broadcast(type: string, data: any): void {
  if (broadcaster) {
    broadcaster(type, data);
  }
}

/**
 * Handle auction bid event - notify previous bidder they were outbid
 */
async function handleAuctionBid(event: AuctionBidEvent): Promise<void> {
  // Only notify if there was a previous bidder
  if (!event.prevBidderPid || event.prevBidderPid === 0) {
    return;
  }

  try {
    // Get item name from database
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT obj_short FROM auctions WHERE id = ?',
      [event.id]
    );
    const itemName = rows[0]?.obj_short || 'item';

    notificationService.notifyOutbid(
      event.prevBidderPid,
      event.id,
      itemName,
      event.bidder,
      event.amount
    ).catch((err) => {
      logger.error('[MUD Auction] Error notifying outbid:', err);
    });
  } catch (err) {
    logger.error('[MUD Auction] Error handling auction bid notifications:', err);
  }
}

/**
 * Handle auction close event - create notifications for winner and seller
 */
async function handleAuctionClose(event: AuctionCloseEvent): Promise<void> {
  logger.info(`[MUD Auction] handleAuctionClose called: reason=${event.reason}, winnerPid=${event.winnerPid}, sellerPid=${event.sellerPid}`);

  // Only notify for sold or buynow auctions
  if (event.reason !== 'sold' && event.reason !== 'buynow') {
    logger.info('[MUD Auction] Skipping notifications - not sold/buynow');
    return;
  }

  try {
    // Get item name from database
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT obj_short FROM auctions WHERE id = ?',
      [event.id]
    );
    const itemName = rows[0]?.obj_short || 'item';
    logger.info(`[MUD Auction] Item name: ${itemName}`);

    // Notify winner
    if (event.winnerPid) {
      logger.info(`[MUD Auction] Notifying winner pid=${event.winnerPid}`);
      notificationService.notifyAuctionWon(
        event.winnerPid,
        event.id,
        itemName,
        event.price
      ).then(() => {
        logger.info('[MUD Auction] Winner notification created');
      }).catch((err) => {
        logger.error('[MUD Auction] Error notifying winner:', err);
      });
    }

    // Notify seller
    if (event.sellerPid) {
      logger.info(`[MUD Auction] Notifying seller pid=${event.sellerPid}`);
      notificationService.notifyItemSold(
        event.sellerPid,
        event.id,
        itemName,
        event.winner,
        event.price
      ).then(() => {
        logger.info('[MUD Auction] Seller notification created');
      }).catch((err) => {
        logger.error('[MUD Auction] Error notifying seller:', err);
      });
    }
  } catch (err) {
    logger.error('[MUD Auction] Error handling auction close notifications:', err);
  }
}

/**
 * cleanup resources
 */
function cleanup(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  ws = null;
}

/**
 * schedule reconnection
 */
function scheduleReconnect(): void {
  if (isShuttingDown) return;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(() => {
    logger.info('[MUD Auction] Attempting reconnection...');
    connect();
  }, RECONNECT_DELAY);
}

/**
 * set the broadcaster function for sending events to frontend clients
 */
export function setAuctionBroadcaster(fn: AuctionBroadcaster): void {
  broadcaster = fn;
}

/**
 * start the MUD auction client
 */
export function startMudAuctionClient(): void {
  isShuttingDown = false;
  connect();
}

/**
 * stop the MUD auction client
 */
export function stopMudAuctionClient(): void {
  isShuttingDown = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  cleanup();
  logger.info('[MUD Auction] Client stopped');
}

/**
 * Soft delete a character in the database
 */
async function softDeleteCharacter(accountName: string, characterName: string): Promise<void> {
  try {
    // Find the character's pid from players_core
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT pid FROM players_core WHERE name = ?',
      [characterName]
    );

    if (rows.length === 0) {
      logger.warn(`[MUD Command] Character ${characterName} not found in players_core`);
      return;
    }

    const pid = rows[0].pid;

    // Soft delete in account_characters
    await db.query<ResultSetHeader>(
      'UPDATE account_characters SET deleted_at = NOW() WHERE account_name = ? AND pid = ? AND deleted_at IS NULL',
      [accountName, pid]
    );

    logger.info(`[MUD Command] Soft deleted character ${characterName} (pid=${pid}) from account ${accountName}`);
  } catch (err) {
    logger.error('[MUD Command] Error soft deleting character:', err);
  }
}

/**
 * Send a command to the MUD via websocket (fire and forget)
 */
export function sendMudCommand(cmd: string, data: any): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.error('[MUD Command] WebSocket not connected');
    return false;
  }

  const msg = {
    type: 'cmd',
    cmd,
    data,
  };

  ws.send(JSON.stringify(msg));
  logger.info(`[MUD Command] Sent command: ${cmd}`);
  return true;
}

/**
 * Send a command to MUD and wait for response
 * Returns a promise that resolves with success/error from MUD
 */
export function sendMudCommandAsync(
  cmd: string,
  data: any
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.error('[MUD Command] WebSocket not connected');
      resolve({ success: false, error: 'MUD server is not connected' });
      return;
    }

    // Generate unique request ID
    const requestId = `${cmd}_${++requestIdCounter}_${Date.now()}`;

    // Set timeout for response
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        logger.error(`[MUD Command] Command ${cmd} timed out`);
        resolve({ success: false, error: 'Command timed out waiting for MUD response' });
      }
    }, COMMAND_TIMEOUT);

    // Store pending request
    pendingRequests.set(requestId, { resolve, reject, timeout });

    // Send command with request ID included in data
    const msg = {
      type: 'cmd',
      cmd,
      data: {
        ...data,
        requestId,
      },
    };

    ws.send(JSON.stringify(msg));
    logger.info(`[MUD Command] Sent command: ${cmd} (requestId: ${requestId})`);
  });
}

/**
 * Check if MUD websocket is connected
 */
export function isMudConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

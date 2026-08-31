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
import { getDmsProcessStats } from './processMonitor.js';
import redis from '../db/redis.js';
import { getOnlinePlayers as getOnlinePlayersFromPresence } from './onlinePlayersService.js';

const MUD_BOOT_TIME_KEY = 'mud:boot_timestamp';

// player info from mud events
export interface PlayerInfo {
  character: string;
  account: string;
  ip: string;
  level: number;
  race: string;
  class: string;
  faction: number; // racewar: 0=none, 1=good, 2=evil, 3=undead, 4=neutral
  client: string;
  clientVersion: string;
  loginTime: number; // timestamp when backend received login
}

// in-memory state for online players
const onlinePlayers: Map<string, PlayerInfo> = new Map();
let factionCounts = { none: 0, goods: 0, evils: 0, undeads: 0, neutrals: 0 };
let lastShutdownType: string | null = null; // track if shutdown was graceful
let mudWasDown: boolean = false; // true if mud shutdown/crashed, used to broadcast MUD_ONLINE on reconnect
let alreadyBroadcastCrash: boolean = false; // prevent spamming MUD_CRASH on reconnect failures

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
let isAuthenticated = false;
let reconnectTimeout: NodeJS.Timeout | null = null;
let broadcaster: AuctionBroadcaster | null = null;
let playerEventBroadcaster: AuctionBroadcaster | null = null;
let wholistBroadcaster: AuctionBroadcaster | null = null;
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
 * Generate the challenge-bound HMAC signature required by DurisMUD.
 *
 * The service secret is intentionally fail-closed: it must be supplied by the
 * deployment environment and is never embedded in source or replaced with a
 * known default.
 */
function generateDuriswebSig(challenge: string): string {
  if (!/^[0-9a-f]{64}$/i.test(challenge)) {
    throw new Error('Invalid DurisWeb authentication challenge');
  }

  const secret = process.env.DURISWEB_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('DURISWEB_SECRET must contain at least 32 bytes');
  }

  const minute = Math.floor(Date.now() / 60000);
  return crypto
    .createHmac('sha256', secret)
    .update(`${minute}:${challenge}`)
    .digest('hex');
}

function handleDuriswebChallenge(socket: WebSocket, message: any): void {
  const challenge = message?.nonce;
  if (typeof challenge !== 'string' || !/^[0-9a-f]{64}$/i.test(challenge)) {
    logger.error('[MUD Auction] Invalid authentication challenge received');
    socket.close();
    return;
  }

  try {
    socket.send(JSON.stringify({
      type: 'cmd',
      cmd: 'durisweb_auth',
      data: {
        sig: generateDuriswebSig(challenge),
      },
    }));
    logger.info('[MUD Auction] Sent durisweb_auth response');
  } catch (error) {
    logger.error('[MUD Auction] Could not answer authentication challenge:', error);
    socket.close();
  }
}

function resolveMudWebSocketUrl(wsPort: string): string {
  const configuredUrl = process.env.MUD_WS_URL?.trim();
  const configuredHost = process.env.MUD_WS_HOST?.trim() || '127.0.0.1';
  const candidate = configuredUrl || `ws://${configuredHost}:${wsPort}`;
  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('MUD_WS_URL is not a valid WebSocket URL');
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('MUD WebSocket URL must use ws:// or wss://');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MUD WebSocket URL must not contain credentials, queries, or a fragment');
  }
  return parsed.toString();
}

/**
 * connect to MUD websocket and start listening for auction events
 */
async function connect(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const settings = await getWebSettings();
    const wsPort = settings.mudWsPort || '4050';
    const wsUrl = resolveMudWebSocketUrl(wsPort);

    logger.info(`[MUD Auction] Connecting to ${wsUrl}...`);

    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.on('open', () => {
      isAuthenticated = false;
      logger.info('[MUD Auction] Connected to MUD websocket');

      // Request a one-time, connection-bound challenge before authenticating.
      socket.send(JSON.stringify({
        type: 'cmd',
        cmd: 'durisweb_challenge',
        data: {},
      }));
      logger.info('[MUD Auction] Sent durisweb_challenge');

      // start ping interval
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, PING_INTERVAL);
    });

    socket.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === 'durisweb_challenge') {
          handleDuriswebChallenge(socket, msg);
          return;
        }
        handleMessage(socket, msg);
      } catch (err) {
        logger.error('[MUD Auction] Error parsing message:', err);
      }
    });

    socket.on('close', (code, reason) => {
      logger.info(`[MUD Auction] Connection closed: ${code} ${reason}`);
      handleWebSocketClose();
      cleanup();
      scheduleReconnect();
    });

    socket.on('error', (err) => {
      logger.error('[MUD Auction] WebSocket error:', err);
    });

    socket.on('pong', () => {
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
function handleMessage(socket: WebSocket, msg: any): void {
  if (msg?.type !== 'durisweb_auth' && !isAuthenticated) {
    logger.warn(`[MUD Auction] Ignoring pre-authentication message: ${String(msg?.type || 'unknown')}`);
    return;
  }

  switch (msg.type) {
    case 'durisweb_auth':
      if (msg.success) {
        isAuthenticated = true;
        logger.info('[MUD Auction] Authentication successful');
      } else {
        isAuthenticated = false;
        logger.error(`[MUD Auction] Authentication failed: ${msg.error}`);
        socket.close();
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
      handleAuctionBid(msg.data as AuctionBidEvent).catch(err => logger.error('[MUD] auction_bid error:', err));
      break;

    case 'auction_close':
      logger.info(`[MUD Auction] Auction #${msg.data.id} closed: ${msg.data.reason}`);
      broadcast('AUCTION_CLOSE', msg.data as AuctionCloseEvent);
      // Create notifications for sold auctions
      handleAuctionClose(msg.data as AuctionCloseEvent).catch(err => logger.error('[MUD] auction_close error:', err));
      break;

    case 'wholist':
      handleWhoList(msg.data.players || []).catch(err => logger.error('[MUD] wholist error:', err));
      break;

    case 'player_login':
      handlePlayerLogin(msg.data).catch(err => logger.error('[MUD] player_login error:', err));
      break;

    case 'player_logout':
      handlePlayerLogout(msg.data).catch(err => logger.error('[MUD] player_logout error:', err));
      break;

    case 'mud_shutdown':
      handleMudShutdown(msg.data);
      break;

    default:
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
 * get faction key from racewar number
 */
function getFactionKey(faction: number): keyof typeof factionCounts {
  switch (faction) {
    case 1: return 'goods';
    case 2: return 'evils';
    case 3: return 'undeads';
    case 4: return 'neutrals';
    default: return 'none';
  }
}

/**
 * handle wholist - initial sync of all online players
 */
async function handleWhoList(players: any[]): Promise<void> {
  onlinePlayers.clear();
  factionCounts = { none: 0, goods: 0, evils: 0, undeads: 0, neutrals: 0 };

  // build player data in memory
  const now = Date.now();
  for (const p of players) {
    const player: PlayerInfo = {
      ...p,
      loginTime: now - ((p.uptime || 0) * 1000),
    };
    const key = player.character.toLowerCase();
    onlinePlayers.set(key, player);
    factionCounts[getFactionKey(player.faction)]++;
  }

  logger.info(`[MUD] wholist received: ${players.length} players online`);
  if (wholistBroadcaster) {
    wholistBroadcaster('WHOLIST', { players: Array.from(onlinePlayers.values()), counts: factionCounts });
  }

  // broadcast MUD_ONLINE only after crash/shutdown/reboot, not on regular backend restart
  if (mudWasDown) {
    mudWasDown = false;
    alreadyBroadcastCrash = false; // reset for next potential crash
    // mud just came back, save boot time (uptime is 0 or very small)
    await saveMudBootTime(0);
    logger.info('[MUD] mud is back online after downtime');
    // invalidate cached stats so dashboard shows fresh data (use dynamic import to avoid circular dep)
    try {
      const { invalidateOverviewStats } = await import('./analyticsService.js');
      await invalidateOverviewStats();
    } catch (err) {
      logger.error('[MUD] failed to invalidate stats cache:', err);
    }
    broadcast('MUD_ONLINE', { timestamp: Date.now(), onlineCount: players.length });
  }
}

/**
 * handle player login
 */
async function handlePlayerLogin(player: PlayerInfo): Promise<void> {
  const key = player.character.toLowerCase();
  player.loginTime = Date.now();

  if (!onlinePlayers.has(key)) {
    onlinePlayers.set(key, player);
    factionCounts[getFactionKey(player.faction)]++;
  }

  try {
    await db.query(
      'INSERT IGNORE INTO account_login_history (account_name, character_name, ip_address, status, timestamp, hostname, client, client_version) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)',
      [player.account, player.character, player.ip, 'login', null, player.client || null, player.clientVersion || null]
    );
  } catch (err) {
    logger.error('[MUD] failed to store login:', err);
  }

  // broadcast to subscribed admin clients only
  if (playerEventBroadcaster) {
    playerEventBroadcaster('PLAYER_LOGIN', { player, onlineCount: onlinePlayers.size, factionCounts });
  }
}

/**
 * handle player logout
 */
async function handlePlayerLogout(data: { character: string; faction: number }): Promise<void> {
  const key = data.character.toLowerCase();
  const player = onlinePlayers.get(key);

  if (player) {
    onlinePlayers.delete(key);
    factionCounts[getFactionKey(data.faction)]--;
    // clamp to 0
    const fk = getFactionKey(data.faction);
    if (factionCounts[fk] < 0) factionCounts[fk] = 0;
  }

  // store in database for history
  try {
    // get account from player if we had it, otherwise lookup
    const account = player?.account;
    if (account) {
      await db.query(
        'INSERT IGNORE INTO account_login_history (account_name, character_name, ip_address, status, timestamp, hostname) VALUES (?, ?, ?, ?, NOW(), ?)',
        [account, data.character, player?.ip || '', 'logout', null]
      );
    }
  } catch (err) {
    logger.error('[MUD] failed to store logout:', err);
  }

  // broadcast to subscribed admin clients only
  if (playerEventBroadcaster) {
    playerEventBroadcaster('PLAYER_LOGOUT', { character: data.character, onlineCount: onlinePlayers.size, factionCounts });
  }
}

/**
 * handle graceful mud shutdown
 */
function handleMudShutdown(data: { type: string; timestamp?: number }): void {
  lastShutdownType = data.type;
  mudWasDown = true; // flag for MUD_ONLINE broadcast on reconnect
  logger.info(`[MUD] graceful shutdown: ${data.type}`);

  // clear online players since mud is going down
  onlinePlayers.clear();
  factionCounts = { none: 0, goods: 0, evils: 0, undeads: 0, neutrals: 0 };

  broadcast('MUD_SHUTDOWN', { type: data.type, timestamp: data.timestamp || Date.now() });
}

/**
 * called when websocket closes - detect crash if no graceful shutdown
 */
async function handleWebSocketClose(): Promise<void> {
  // check if MUD process is still running via ps
  const processStats = await getDmsProcessStats();

  if (lastShutdownType !== null) {
    // graceful shutdown was received
    mudWasDown = true;
    alreadyBroadcastCrash = false;
    await clearMudBootTime();
    logger.info('[MUD] websocket closed after graceful shutdown');
  } else if (!processStats.isRunning && !alreadyBroadcastCrash) {
    // process not running = real crash
    mudWasDown = true;
    alreadyBroadcastCrash = true;
    await clearMudBootTime();
    logger.warn('[MUD] MUD process crashed (not running)');
    broadcast('MUD_CRASH', { timestamp: Date.now() });
  } else if (processStats.isRunning) {
    // process still running = just websocket disconnect, not a crash
    await saveMudBootTime(processStats.uptime);
    logger.info('[MUD] websocket disconnected but MUD still running (uptime: ' + processStats.uptime + 's)');
  }

  // clear state
  onlinePlayers.clear();
  factionCounts = { none: 0, goods: 0, evils: 0, undeads: 0, neutrals: 0 };
  lastShutdownType = null;
}

/**
 * cleanup resources
 */
function cleanup(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  isAuthenticated = false;
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
 * set the broadcaster function for player events (admin-only subscribed clients)
 */
export function setPlayerEventBroadcaster(fn: AuctionBroadcaster): void {
  playerEventBroadcaster = fn;
}

/**
 * set the broadcaster function for wholist (subscribed clients only)
 */
export function setWholistBroadcaster(fn: AuctionBroadcaster): void {
  wholistBroadcaster = fn;
}

async function saveMudBootTime(uptimeSeconds: number): Promise<void> {
  const bootTimestamp = Date.now() - (uptimeSeconds * 1000);
  await redis.set(MUD_BOOT_TIME_KEY, bootTimestamp.toString());
  logger.info(`[MUD] boot timestamp saved: ${new Date(bootTimestamp).toISOString()}`);
}

async function clearMudBootTime(): Promise<void> {
  await redis.del(MUD_BOOT_TIME_KEY);
  logger.info('[MUD] boot timestamp cleared');
}

export async function getMudBootTime(): Promise<number | null> {
  const value = await redis.get(MUD_BOOT_TIME_KEY);
  return value ? parseInt(value, 10) : null;
}

/**
 * load online players from the active MUD presence generation on startup
 */
async function loadOnlinePlayersFromPresence(): Promise<void> {
  try {
    const players = await getOnlinePlayersFromPresence();
    onlinePlayers.clear();
    factionCounts = { none: 0, goods: 0, evils: 0, undeads: 0, neutrals: 0 };

    for (const player of players) {
      onlinePlayers.set(String(player.pid), {
        character: player.name,
        account: player.account,
        ip: player.ip,
        level: player.level,
        race: player.race,
        class: player.class,
        faction: player.racewar,
        client: player.client,
        clientVersion: player.clientVersion,
        loginTime: player.loginTime * 1000,
      });
      factionCounts[getFactionKey(player.racewar)]++;
    }
    logger.info(`[MUD] loaded ${onlinePlayers.size} players from namespaced presence`);
  } catch (error) {
    logger.error('[MUD] failed to load namespaced presence:', error);
  }
}

/**
 * start the MUD auction client
 */
export async function startMudAuctionClient(): Promise<void> {
  isShuttingDown = false;

  // load the current namespaced presence snapshot
  await loadOnlinePlayersFromPresence();

  // check ps for mud uptime on backend start
  const processStats = await getDmsProcessStats();
  if (processStats.isRunning && processStats.uptime > 0) {
    await saveMudBootTime(processStats.uptime);
  } else {
    await clearMudBootTime();
  }

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
    // Find the character's pid from player_data
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT pid FROM player_data WHERE name = ?',
      [characterName]
    );

    if (rows.length === 0) {
      logger.warn(`[MUD Command] Character ${characterName} not found in player_data`);
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
  if (!ws || ws.readyState !== WebSocket.OPEN || !isAuthenticated) {
    logger.error('[MUD Command] WebSocket is not authenticated');
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
    if (!ws || ws.readyState !== WebSocket.OPEN || !isAuthenticated) {
      logger.error('[MUD Command] WebSocket is not authenticated');
      resolve({ success: false, error: 'MUD service is not authenticated' });
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

/**
 * get current online player count
 */
export function getOnlineCount(): number {
  return onlinePlayers.size;
}

/**
 * get pending requests count (for debugging)
 */
export function getPendingRequestsCount(): number {
  return pendingRequests.size;
}

/**
 * get current faction counts
 */
export function getFactionCounts(): typeof factionCounts {
  return { ...factionCounts };
}

/**
 * get online players list
 */
export function getOnlinePlayers(): (PlayerInfo & { uptime_seconds: number })[] {
  const now = Date.now();
  return Array.from(onlinePlayers.values()).map(p => ({
    ...p,
    uptime_seconds: Math.floor((now - p.loginTime) / 1000),
  }));
}


/**
 * request fresh wholist from mud
 */
export function requestWhoList(): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN || !isAuthenticated) {
    logger.warn('[MUD] cannot request wholist - service is not authenticated');
    return false;
  }

  const msg = {
    type: 'cmd',
    cmd: 'request_wholist',
    data: {},
  };

  ws.send(JSON.stringify(msg));
  logger.info('[MUD] requested fresh wholist');
  return true;
}

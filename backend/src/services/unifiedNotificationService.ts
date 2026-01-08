import { pool as db } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  sendAuctionOutbidNotification,
  sendAuctionWonNotification,
  sendItemSoldNotification,
  broadcastPush,
} from './pushNotificationService.js';
import { extractPlayerName } from '../utils/stringUtils.js';

// Broadcaster function set by index.ts to avoid circular dependencies
let notificationBroadcaster: ((accountName: string, notification: any) => void) | null = null;
let newsBroadcaster: ((data: { date: string; items: string[] }) => void) | null = null;

export function setNotificationBroadcaster(broadcaster: (accountName: string, notification: any) => void) {
  notificationBroadcaster = broadcaster;
}

export function setNewsBroadcaster(broadcaster: (data: { date: string; items: string[] }) => void) {
  newsBroadcaster = broadcaster;
}

export interface Notification {
  id: number;
  accountName: string;
  source: string;
  notificationType: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  triggeredByAccount: string | null;
  triggeredByCharacter: string | null;
  data: Record<string, any> | null;
}

/**
 * Create a notification
 */
export async function createNotification(params: {
  accountName: string;
  source: string;
  notificationType: string;
  message: string;
  link: string;
  triggeredByAccount?: string | null;
  triggeredByCharacter?: string | null;
  data?: Record<string, any> | null;
}): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO notifications
     (account_name, source, notification_type, message, link, triggered_by_account, triggered_by_character, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.accountName,
      params.source,
      params.notificationType,
      params.message,
      params.link,
      params.triggeredByAccount || null,
      params.triggeredByCharacter || null,
      params.data ? JSON.stringify(params.data) : null,
    ]
  );

  // Broadcast to WebSocket clients
  if (notificationBroadcaster) {
    notificationBroadcaster(params.accountName, {
      id: result.insertId,
      accountName: params.accountName,
      source: params.source,
      notificationType: params.notificationType,
      message: params.message,
      link: params.link,
      isRead: false,
      createdAt: new Date().toISOString(),
      triggeredByAccount: params.triggeredByAccount || null,
      triggeredByCharacter: params.triggeredByCharacter || null,
      data: params.data || null,
    });
  }

  return result.insertId;
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  accountName: string,
  options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { unreadOnly = false, limit = 50, offset = 0 } = options;

  let whereClause = 'WHERE account_name = ?';
  const params: (string | number)[] = [accountName];

  if (unreadOnly) {
    whereClause += ' AND is_read = FALSE';
  }

  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
    params
  );

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const notifications: Notification[] = rows.map((row) => ({
    id: row.id,
    accountName: row.account_name,
    source: row.source,
    notificationType: row.notification_type,
    message: row.message,
    link: row.link,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    readAt: row.read_at,
    triggeredByAccount: row.triggered_by_account,
    triggeredByCharacter: row.triggered_by_character,
    data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null,
  }));

  return { notifications, total: countRows[0]?.total || 0 };
}

/**
 * Get unread count
 */
export async function getUnreadCount(accountName: string): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) as count FROM notifications WHERE account_name = ? AND is_read = FALSE',
    [accountName]
  );
  return rows[0]?.count || 0;
}

/**
 * Mark as read
 */
export async function markAsRead(id: number, accountName: string): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND account_name = ?',
    [id, accountName]
  );
  return result.affectedRows > 0;
}

/**
 * Mark all as read
 */
export async function markAllAsRead(accountName: string): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE account_name = ? AND is_read = FALSE',
    [accountName]
  );
  return result.affectedRows;
}

/**
 * Delete notification
 */
export async function deleteNotification(id: number, accountName: string): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM notifications WHERE id = ? AND account_name = ?',
    [id, accountName]
  );
  return result.affectedRows > 0;
}

/**
 * Get account name from character pid
 */
export async function getAccountFromPid(pid: number): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT account_name FROM account_characters WHERE pid = ? LIMIT 1',
    [pid]
  );
  return rows[0]?.account_name || null;
}

/**
 * Get account name from character name
 */
export async function getAccountFromCharName(charName: string): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT account_name FROM account_characters WHERE char_name = ? AND deleted_at IS NULL LIMIT 1',
    [charName]
  );
  return rows[0]?.account_name || null;
}

// ============================================================================
// Helper functions for different sources
// ============================================================================

export async function notifyOutbid(
  outbidPid: number,
  auctionId: number,
  itemName: string,
  newBidderName: string,
  newBidAmount: number
): Promise<void> {
  const accountName = await getAccountFromPid(outbidPid);
  if (!accountName) return;

  await createNotification({
    accountName,
    source: 'auction',
    notificationType: 'outbid',
    message: `You were outbid on ${itemName}`,
    link: `/auction/${auctionId}`,
    triggeredByCharacter: newBidderName,
    data: { auctionId, itemName, amount: newBidAmount },
  });

  // send push notification
  sendAuctionOutbidNotification(accountName, {
    itemName,
    newBidder: newBidderName,
    auctionId,
  }).catch(() => {}); // fire and forget
}

export async function notifyAuctionWon(
  winnerPid: number,
  auctionId: number,
  itemName: string,
  finalPrice: number
): Promise<void> {
  const accountName = await getAccountFromPid(winnerPid);
  if (!accountName) {
    console.log(`[Notification] No account found for winner pid=${winnerPid}`);
    return;
  }
  console.log(`[Notification] Creating auction_won notification for ${accountName}`);

  await createNotification({
    accountName,
    source: 'auction',
    notificationType: 'auction_won',
    message: `You won the auction for ${itemName}`,
    link: `/auction/${auctionId}`,
    data: { auctionId, itemName, amount: finalPrice },
  });

  // send push notification
  sendAuctionWonNotification(accountName, {
    itemName,
    finalPrice,
    auctionId,
  }).catch(() => {}); // fire and forget
}

export async function notifyItemSold(
  sellerPid: number,
  auctionId: number,
  itemName: string,
  buyerName: string,
  salePrice: number
): Promise<void> {
  const accountName = await getAccountFromPid(sellerPid);
  if (!accountName) {
    console.log(`[Notification] No account found for seller pid=${sellerPid}`);
    return;
  }
  console.log(`[Notification] Creating item_sold notification for ${accountName}`);

  await createNotification({
    accountName,
    source: 'auction',
    notificationType: 'item_sold',
    message: `Your ${itemName} was sold to ${buyerName}`,
    link: `/auction/${auctionId}`,
    triggeredByCharacter: buyerName,
    data: { auctionId, itemName, amount: salePrice },
  });

  // send push notification
  sendItemSoldNotification(accountName, {
    itemName,
    buyerName,
    salePrice,
    auctionId,
  }).catch(() => {}); // fire and forget
}

/**
 * Broadcast news update to all users
 */
export async function notifyNewsUpdate(
  date: string,
  items: string[]
): Promise<void> {
  // broadcast to all websocket clients
  if (newsBroadcaster) {
    newsBroadcaster({ date, items });
  }

  // send push notification to all subscribers
  await broadcastPush({
    title: `News Update (${date})`,
    body: items[0] || 'New updates available',
    icon: '/icons/icon-192x192.svg',
    tag: `news-${date}`,
    data: { url: '/news' },
  });

  // create notification for all accounts (for offline users)
  // get all unique account names from login history
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT DISTINCT account_name FROM account_login_history WHERE account_name IS NOT NULL'
  );

  const message = `News Update (${date}): ${items[0] || 'New updates available'}`;

  // batch insert notifications for all accounts
  for (const row of rows) {
    await createNotification({
      accountName: row.account_name,
      source: 'news',
      notificationType: 'news_update',
      message,
      link: '/news',
      data: { date, itemCount: items.length },
    });
  }
}

/**
 * Broadcast PvP battle notification to all push subscribers
 */
export async function notifyPvpBattle(
  battleId: number,
  victims: Array<{ description: string }>,
  killers: Array<{ description: string }>,
  location: string
): Promise<void> {
  // format names for the notification
  const killerNames = killers
    .map(k => extractPlayerName(k.description))
    .filter(Boolean)
    .join(', ') || 'Unknown';

  const victimNames = victims
    .map(v => extractPlayerName(v.description))
    .filter(Boolean)
    .join(', ') || 'Unknown';

  // broadcast to all subscribers
  await broadcastPush({
    title: 'new pvp battle!',
    body: `${killerNames} killed ${victimNames} at ${location}`,
    icon: '/icons/icon-192x192.svg',
    tag: `pvp-${battleId}`,
    data: { url: `/pvp/battle/${battleId}` },
  });
}

export default {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getAccountFromPid,
  getAccountFromCharName,
  notifyOutbid,
  notifyAuctionWon,
  notifyItemSold,
  notifyPvpBattle,
  notifyNewsUpdate,
};

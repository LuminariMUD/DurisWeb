import webpush from 'web-push'
import { pool as db } from '../db/connection.js'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'

// vapid keys from environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@newduris.com'

// configure web-push if keys are available
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  console.log('[PushNotification] vapid keys configured')
} else {
  console.warn('[PushNotification] vapid keys not configured - push notifications disabled')
}

export interface PushSubscription {
  id: number
  accountName: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
  lastUsedAt: string | null
  userAgent: string | null
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, any>
  actions?: Array<{ action: string; title: string; icon?: string }>
}

/**
 * get vapid public key for frontend
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY
}

/**
 * check if push notifications are configured
 */
export function isPushEnabled(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

/**
 * save push subscription to database
 */
export async function saveSubscription(
  accountName: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<number> {
  // check if subscription already exists
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM push_subscriptions WHERE endpoint = ?',
    [subscription.endpoint]
  )

  if (existing.length > 0) {
    // update existing subscription
    await db.query<ResultSetHeader>(
      `UPDATE push_subscriptions
       SET account_name = ?, p256dh = ?, auth = ?, user_agent = ?, last_used_at = NOW()
       WHERE endpoint = ?`,
      [accountName, subscription.keys.p256dh, subscription.keys.auth, userAgent, subscription.endpoint]
    )
    return existing[0].id
  }

  // create new subscription
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO push_subscriptions (account_name, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [accountName, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent]
  )

  return result.insertId
}

/**
 * remove push subscription
 */
export async function removeSubscription(accountName: string, endpoint: string): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM push_subscriptions WHERE account_name = ? AND endpoint = ?',
    [accountName, endpoint]
  )
  return result.affectedRows > 0
}

/**
 * remove all subscriptions for an account
 */
export async function removeAllSubscriptions(accountName: string): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM push_subscriptions WHERE account_name = ?',
    [accountName]
  )
  return result.affectedRows
}

/**
 * get subscriptions for an account
 */
export async function getSubscriptions(accountName: string): Promise<PushSubscription[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT * FROM push_subscriptions WHERE account_name = ?',
    [accountName]
  )

  return rows.map((row) => ({
    id: row.id,
    accountName: row.account_name,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    userAgent: row.user_agent,
  }))
}

/**
 * send push notification to a specific subscription
 */
async function sendToSubscription(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<boolean> {
  if (!isPushEnabled()) {
    console.warn('[PushNotification] push not enabled, skipping')
    return false
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload))

    // update last used timestamp
    await db.query(
      'UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?',
      [subscription.id]
    )

    return true
  } catch (error: any) {
    console.error('[PushNotification] failed to send:', error.message)

    // remove invalid subscription (410 gone or 404 not found)
    if (error.statusCode === 410 || error.statusCode === 404) {
      await db.query('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id])
      console.log(`[PushNotification] removed invalid subscription id=${subscription.id}`)
    }

    return false
  }
}

/**
 * send push notification to all subscriptions for an account
 */
export async function sendPushToAccount(
  accountName: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getSubscriptions(accountName)

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const subscription of subscriptions) {
    const success = await sendToSubscription(subscription, payload)
    if (success) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}

/**
 * send push notification to multiple accounts
 */
export async function sendPushToAccounts(
  accountNames: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0
  let totalFailed = 0

  for (const accountName of accountNames) {
    const { sent, failed } = await sendPushToAccount(accountName, payload)
    totalSent += sent
    totalFailed += failed
  }

  return { sent: totalSent, failed: totalFailed }
}

/**
 * broadcast push notification to all subscriptions
 */
export async function broadcastPush(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT DISTINCT account_name FROM push_subscriptions'
  )

  const accountNames = rows.map((row) => row.account_name)
  return sendPushToAccounts(accountNames, payload)
}

// helper functions for common notification types

export async function sendPvpNotification(
  accountName: string,
  data: { killers: string; victims: string; location: string; battleId: number }
): Promise<void> {
  await sendPushToAccount(accountName, {
    title: 'new pvp battle!',
    body: `${data.killers} killed ${data.victims} at ${data.location}`,
    icon: '/icons/icon-192x192.svg',
    tag: `pvp-${data.battleId}`,
    data: { url: `/pvp/battle/${data.battleId}` },
  })
}

export async function sendAuctionOutbidNotification(
  accountName: string,
  data: { itemName: string; newBidder: string; auctionId: number }
): Promise<void> {
  await sendPushToAccount(accountName, {
    title: 'you were outbid!',
    body: `${data.newBidder} outbid you on ${data.itemName}`,
    icon: '/icons/icon-192x192.svg',
    tag: `auction-${data.auctionId}`,
    data: { url: `/auction/${data.auctionId}` },
  })
}

export async function sendAuctionWonNotification(
  accountName: string,
  data: { itemName: string; finalPrice: number; auctionId: number }
): Promise<void> {
  await sendPushToAccount(accountName, {
    title: 'you won the auction!',
    body: `you won ${data.itemName} for ${data.finalPrice} coins`,
    icon: '/icons/icon-192x192.svg',
    tag: `auction-won-${data.auctionId}`,
    data: { url: `/auction/${data.auctionId}` },
  })
}

export async function sendItemSoldNotification(
  accountName: string,
  data: { itemName: string; buyerName: string; salePrice: number; auctionId: number }
): Promise<void> {
  await sendPushToAccount(accountName, {
    title: 'your item sold!',
    body: `${data.buyerName} bought your ${data.itemName} for ${data.salePrice} coins`,
    icon: '/icons/icon-192x192.svg',
    tag: `auction-sold-${data.auctionId}`,
    data: { url: `/auction/${data.auctionId}` },
  })
}

export async function sendForumReplyNotification(
  accountName: string,
  data: { threadTitle: string; replier: string; threadId: number }
): Promise<void> {
  await sendPushToAccount(accountName, {
    title: 'new forum reply',
    body: `${data.replier} replied to "${data.threadTitle}"`,
    icon: '/icons/icon-192x192.svg',
    tag: `forum-${data.threadId}`,
    data: { url: `/forum/thread/${data.threadId}` },
  })
}

export async function sendCrashNotification(
  data: { incidentType: string; initiatedBy?: string; reason?: string }
): Promise<void> {
  let title = 'mud status update'
  let body = ''

  switch (data.incidentType) {
    case 'crash':
    case 'hung':
      title = 'newduris mud is down'
      body = 'the server has crashed. we are working on it.'
      break
    case 'recovery':
      title = 'newduris mud is back up!'
      body = 'the server is online again. come play!'
      break
    case 'reboot':
      title = 'newduris mud is rebooting'
      body = data.reason || 'server maintenance in progress'
      break
    case 'shutdown':
      title = 'newduris mud is shutting down'
      body = data.reason || 'planned maintenance'
      break
    case 'copyover':
      title = 'newduris mud updated'
      body = data.reason || 'new features deployed!'
      break
  }

  await broadcastPush({
    title,
    body,
    icon: '/icons/icon-192x192.svg',
    tag: 'mud-status',
    data: { url: '/status' },
  })
}

export default {
  getVapidPublicKey,
  isPushEnabled,
  saveSubscription,
  removeSubscription,
  removeAllSubscriptions,
  getSubscriptions,
  sendPushToAccount,
  sendPushToAccounts,
  broadcastPush,
  sendPvpNotification,
  sendAuctionOutbidNotification,
  sendAuctionWonNotification,
  sendItemSoldNotification,
  sendForumReplyNotification,
  sendCrashNotification,
}

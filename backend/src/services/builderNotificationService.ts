import { pool as db } from '../db/connection.js';
import * as notificationService from './unifiedNotificationService.js';

// ============================================================================
// Types (kept for backwards compatibility)
// ============================================================================

export interface BuilderNotification {
  id: number;
  accountName: string;
  notificationType: string;
  zoneId: string;
  zoneName: string | null;
  entityType: string | null;
  entityId: number | null;
  triggeredByAccount: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface BuilderMention {
  id: number;
  entityType: string;
  entityId: number;
  mentionedAccount: string;
  mentionedByAccount: string;
  createdAt: string;
}

// ============================================================================
// Notification Functions (delegates to unified service)
// ============================================================================

/**
 * Create a notification
 */
export async function createNotification(
  accountName: string,
  notificationType: string,
  zoneId: string,
  zoneName: string | null,
  entityType: string | null,
  entityId: number | null,
  triggeredByAccount: string,
  message: string,
): Promise<number> {
  const subTab = entityType === 'comment' ? 'comments' : 'proc-requests';
  return notificationService.createNotification({
    accountName,
    source: 'builder',
    notificationType,
    message,
    link: `/builder/zone/${zoneId}?tab=info&subTab=${subTab}`,
    triggeredByAccount,
    data: { zoneId, zoneName, entityType, entityId },
  });
}

/**
 * Get notifications for a user (delegates to unified service)
 */
export async function getNotifications(
  accountName: string,
  isRead?: boolean,
  limit: number = 50,
  offset: number = 0,
): Promise<{ notifications: BuilderNotification[]; total: number; hasMore: boolean }> {
  const unreadOnly = isRead === false;
  const result = await notificationService.getNotifications(accountName, {
    unreadOnly,
    limit,
    offset,
  });

  // Map unified notifications to BuilderNotification format for backwards compatibility
  const notifications: BuilderNotification[] = result.notifications.map((n) => ({
    id: n.id,
    accountName: n.accountName,
    notificationType: n.notificationType,
    zoneId: n.data?.zoneId || '',
    zoneName: n.data?.zoneName || null,
    entityType: n.data?.entityType || null,
    entityId: n.data?.entityId || null,
    triggeredByAccount: n.triggeredByAccount || '',
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt,
    readAt: n.readAt,
  }));

  return {
    notifications,
    total: result.total,
    hasMore: offset + notifications.length < result.total,
  };
}

/**
 * Get unread notification count for a user (delegates to unified service)
 */
export async function getUnreadCount(accountName: string): Promise<number> {
  return notificationService.getUnreadCount(accountName);
}

/**
 * Mark a notification as read (delegates to unified service)
 */
export async function markAsRead(notificationId: number, accountName: string): Promise<boolean> {
  return notificationService.markAsRead(notificationId, accountName);
}

/**
 * Mark all notifications as read for a user (delegates to unified service)
 */
export async function markAllAsRead(accountName: string): Promise<number> {
  return notificationService.markAllAsRead(accountName);
}

// ============================================================================
// Mention Functions
// ============================================================================

/**
 * Extract @mentions from content
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const matches = content.match(mentionRegex) || [];
  const mentions = matches.map((m) => m.slice(1).toLowerCase());
  // Remove duplicates
  return [...new Set(mentions)];
}

/**
 * Create mention records and notifications
 */
export async function createMentions(
  entityType: 'comment' | 'proc_request',
  entityId: number,
  mentionedAccounts: string[],
  mentionedByAccount: string,
  zoneId: string,
  zoneName: string | null,
  notificationMessage: string,
): Promise<void> {
  // Don't create self-mentions
  const accounts = mentionedAccounts.filter(
    (acc) => acc.toLowerCase() !== mentionedByAccount.toLowerCase(),
  );

  for (const account of accounts) {
    // Create mention record
    await db.query(
      `INSERT INTO builder_mentions (entity_type, entity_id, mentioned_account, mentioned_by_account)
       VALUES (?, ?, ?, ?)`,
      [entityType, entityId, account, mentionedByAccount],
    );

    // Create notification using unified service
    await createNotification(
      account,
      'comment_mention',
      zoneId,
      zoneName,
      entityType,
      entityId,
      mentionedByAccount,
      notificationMessage,
    );
  }
}

/**
 * Delete mentions for an entity (when entity is deleted)
 */
export async function deleteMentions(entityType: string, entityId: number): Promise<void> {
  await db.query(`DELETE FROM builder_mentions WHERE entity_type = ? AND entity_id = ?`, [
    entityType,
    entityId,
  ]);
}

export default {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  extractMentions,
  createMentions,
  deleteMentions,
};

import { pool as db } from '../../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createNotification } from '../../services/unifiedNotificationService.js';
import { processContentForWrite } from '../../utils/contentParser.js';
import { parsePagination } from '../../utils/validation.js';
import logger from '../../utils/logger.js';

export interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  content: string;
  category: 'public' | 'admin';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  isRead?: boolean;
}

export interface ChangelogListOptions {
  includeAdmin?: boolean;
  accountName?: string;
  page?: number;
  limit?: number;
}

function sanitizeChangelogContent(content: string): string {
  const processed = processContentForWrite(content);
  if (processed.error) {
    throw new Error(processed.error);
  }
  return processed.content;
}

/**
 * get all published changelog entries
 */
export async function getChangelogEntries(options: ChangelogListOptions = {}): Promise<{
  entries: ChangelogEntry[];
  total: number;
}> {
  const { includeAdmin = false, accountName } = options;
  const { page, limit } = parsePagination(
    options.page?.toString(),
    options.limit?.toString(),
    20,
    100,
  );
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE is_published = TRUE';
  const params: (string | number)[] = [];

  if (!includeAdmin) {
    whereClause += " AND category = 'public'";
  }

  // get total count
  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM website_changelog ${whereClause}`,
    params,
  );
  const total = countRows[0]?.total || 0;

  // get entries with read status if account provided
  let query: string;
  const queryParams = [...params];

  if (accountName) {
    query = `
      SELECT
        c.*,
        CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END as is_read
      FROM website_changelog c
      LEFT JOIN website_changelog_reads r ON c.id = r.changelog_id AND r.account_name = ?
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.unshift(accountName);
    queryParams.push(limit, offset);
  } else {
    query = `
      SELECT * FROM website_changelog
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(limit, offset);
  }

  const [rows] = await db.query<RowDataPacket[]>(query, queryParams);

  const entries: ChangelogEntry[] = rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPublished: Boolean(row.is_published),
    isRead: accountName ? Boolean(row.is_read) : undefined,
  }));

  return { entries, total };
}

/**
 * get all changelog entries for admin (including unpublished)
 */
export async function getAllChangelogEntriesForAdmin(
  requestedPage = 1,
  requestedLimit = 20,
): Promise<{
  entries: ChangelogEntry[];
  total: number;
}> {
  const { page, limit } = parsePagination(
    requestedPage.toString(),
    requestedLimit.toString(),
    20,
    100,
  );
  const offset = (page - 1) * limit;

  const [countRows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) as total FROM website_changelog',
  );
  const total = countRows[0]?.total || 0;

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM website_changelog ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );

  const entries: ChangelogEntry[] = rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPublished: Boolean(row.is_published),
  }));

  return { entries, total };
}

/**
 * get single changelog entry by id
 */
export async function getChangelogEntry(
  id: number,
  accountName?: string,
  includeAdmin = false,
): Promise<ChangelogEntry | null> {
  let query: string;
  const visibilityClause = includeAdmin
    ? 'c.id = ?'
    : "c.id = ? AND c.is_published = TRUE AND c.category = 'public'";
  const params: (string | number)[] = [id];

  if (accountName) {
    query = `
      SELECT
        c.*,
        CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END as is_read
      FROM website_changelog c
      LEFT JOIN website_changelog_reads r ON c.id = r.changelog_id AND r.account_name = ?
      WHERE ${visibilityClause}
    `;
    params.unshift(accountName);
  } else {
    query = `SELECT * FROM website_changelog c WHERE ${visibilityClause}`;
  }

  const [rows] = await db.query<RowDataPacket[]>(query, params);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPublished: Boolean(row.is_published),
    isRead: accountName ? Boolean(row.is_read) : undefined,
  };
}

/**
 * create new changelog entry
 */
export async function createChangelogEntry(data: {
  version: string;
  title: string;
  content: string;
  category: 'public' | 'admin';
  createdBy: string;
  isPublished?: boolean;
}): Promise<number> {
  const content = sanitizeChangelogContent(data.content);
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO website_changelog (version, title, content, category, created_by, is_published)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.version, data.title, content, data.category, data.createdBy, data.isPublished ?? false],
  );

  return result.insertId;
}

/**
 * update changelog entry
 */
export async function updateChangelogEntry(
  id: number,
  data: Partial<{
    version: string;
    title: string;
    content: string;
    category: 'public' | 'admin';
    isPublished: boolean;
  }>,
): Promise<{ found: boolean; published: boolean }> {
  const updates: string[] = [];
  const params: (string | number | boolean)[] = [];

  if (data.version !== undefined) {
    updates.push('version = ?');
    params.push(data.version);
  }
  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title);
  }
  if (data.content !== undefined) {
    updates.push('content = ?');
    params.push(sanitizeChangelogContent(data.content));
  }
  if (data.category !== undefined) {
    updates.push('category = ?');
    params.push(data.category);
  }
  // Publishing is a separate conditional statement below, so only one request can publish.
  if (data.isPublished === false) {
    updates.push('is_published = ?');
    params.push(false);
  }

  if (updates.length === 0 && data.isPublished === undefined) {
    return { found: false, published: false };
  }

  updates.push('updated_at = NOW()');
  params.push(id);

  const [result] = await db.query<ResultSetHeader>(
    `UPDATE website_changelog SET ${updates.join(', ')} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) return { found: false, published: false };
  if (data.isPublished !== true) return { found: true, published: false };

  // The row lock makes a concurrent publisher re-check is_published and match nothing.
  const [publish] = await db.query<ResultSetHeader>(
    'UPDATE website_changelog SET is_published = TRUE, updated_at = NOW() WHERE id = ? AND is_published = FALSE',
    [id],
  );
  return { found: true, published: publish.affectedRows === 1 };
}

/**
 * delete changelog entry
 */
export async function deleteChangelogEntry(id: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>('DELETE FROM website_changelog WHERE id = ?', [
    id,
  ]);

  return result.affectedRows > 0;
}

/**
 * mark changelog entry as read for a user
 */
export async function markAsRead(changelogId: number, accountName: string): Promise<void> {
  await db.query(
    `INSERT IGNORE INTO website_changelog_reads (changelog_id, account_name) VALUES (?, ?)`,
    [changelogId, accountName],
  );
}

/**
 * mark all entries as read for a user
 */
export async function markAllAsRead(accountName: string, includeAdmin = false): Promise<number> {
  // The returned count must not reveal how many admin entries exist to a non-admin.
  const categoryFilter = includeAdmin ? '' : "AND category = 'public'";
  const [result] = await db.query<ResultSetHeader>(
    `INSERT IGNORE INTO website_changelog_reads (changelog_id, account_name)
     SELECT id, ? FROM website_changelog WHERE is_published = TRUE ${categoryFilter}`,
    [accountName],
  );

  return result.affectedRows;
}

/**
 * get unread count for a user
 */
export async function getUnreadCount(accountName: string, includeAdmin = false): Promise<number> {
  let categoryFilter = "AND category = 'public'";
  if (includeAdmin) {
    categoryFilter = '';
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count
     FROM website_changelog c
     WHERE c.is_published = TRUE ${categoryFilter}
     AND NOT EXISTS (
       SELECT 1 FROM website_changelog_reads r
       WHERE r.changelog_id = c.id AND r.account_name = ?
     )`,
    [accountName],
  );

  return rows[0]?.count || 0;
}

/**
 * notify all users about a new changelog entry
 */
export async function notifyChangelogPublished(
  entryId: number,
  version: string,
  title: string,
  category: 'public' | 'admin',
): Promise<void> {
  // Admin entries are visible only to staff (immortal level 57+), but the recipients below
  // are every account that has logged in, so an admin title must never be sent to them.
  if (category !== 'public') return;

  // get all unique account names from login history
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT DISTINCT account_name FROM account_login_history WHERE account_name IS NOT NULL',
  );

  // create notification for each account; one failed insert must not drop the rest
  for (const row of rows) {
    try {
      await createNotification({
        accountName: row.account_name,
        source: 'changelog',
        notificationType: 'changelog_public',
        message: `New update: ${version} - ${title}`,
        link: '/news?tab=changelog',
        data: { entryId, version, title, category },
      });
    } catch (error) {
      logger.error('[Changelog] failed to notify an account about a new entry:', error);
    }
  }
}

export default {
  getChangelogEntries,
  getAllChangelogEntriesForAdmin,
  getChangelogEntry,
  createChangelogEntry,
  updateChangelogEntry,
  deleteChangelogEntry,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  notifyChangelogPublished,
};

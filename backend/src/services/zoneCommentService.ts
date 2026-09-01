import { pool as db } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { ZoneComment, CreateZoneComment, UpdateZoneComment } from '../types/builder.js';
import { extractMentions, createMentions, deleteMentions } from './builderNotificationService.js';
import { processContentForWrite } from '../utils/contentParser.js';

// ============================================================================
// Zone Comment Functions
// ============================================================================

/**
 * Map database row to ZoneComment object
 */
function mapRowToComment(row: RowDataPacket): ZoneComment {
  return {
    id: row.id,
    zoneId: row.zone_id,
    parentId: row.parent_id,
    procRequestId: row.proc_request_id,
    accountName: row.account_name,
    characterName: row.character_name,
    content: row.content,
    contentHtml: row.content_html,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeOptionalCommentHtml(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Comment HTML must be a string');
  }

  const processed = processContentForWrite(value);
  if (processed.error) {
    throw new Error(processed.error);
  }

  return processed.content;
}

/**
 * Get all comments for a zone (with single-level threading)
 * Returns top-level comments with their replies nested
 */
export async function getComments(
  zoneId: string,
  procRequestId?: number | null,
): Promise<ZoneComment[]> {
  let query = `
    SELECT id, zone_id, parent_id, proc_request_id, account_name, character_name,
           content, content_html, created_at, updated_at
    FROM builder_zone_comments
    WHERE zone_id = ?
  `;
  const params: (string | number | null)[] = [zoneId];

  if (procRequestId !== undefined) {
    if (procRequestId === null) {
      query += ' AND proc_request_id IS NULL';
    } else {
      query += ' AND proc_request_id = ?';
      params.push(procRequestId);
    }
  }

  query += ' ORDER BY created_at ASC';

  const [rows] = await db.query<RowDataPacket[]>(query, params);

  // Build threaded structure (single level)
  const comments: ZoneComment[] = [];
  const commentMap = new Map<number, ZoneComment>();

  // First pass: create all comment objects
  for (const row of rows) {
    const comment = mapRowToComment(row);
    comment.replies = [];
    commentMap.set(comment.id, comment);
  }

  // Second pass: organize into tree (single level only)
  for (const row of rows) {
    const comment = commentMap.get(row.id)!;
    if (row.parent_id === null) {
      // Top-level comment
      comments.push(comment);
    } else {
      // Reply - attach to parent
      const parent = commentMap.get(row.parent_id);
      if (parent) {
        parent.replies!.push(comment);
      } else {
        // Parent not found, treat as top-level
        comments.push(comment);
      }
    }
  }

  return comments;
}

/**
 * Get a specific comment by ID
 */
export async function getComment(id: number): Promise<ZoneComment | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, parent_id, proc_request_id, account_name, character_name,
            content, content_html, created_at, updated_at
     FROM builder_zone_comments
     WHERE id = ?`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRowToComment(rows[0]);
}

/**
 * Create a new comment
 */
export async function createComment(
  data: CreateZoneComment,
  accountName: string,
  zoneName?: string | null,
): Promise<ZoneComment> {
  const sanitizedContentHtml = sanitizeOptionalCommentHtml(data.contentHtml);

  // Validate parent exists if specified
  if (data.parentId) {
    const parent = await getComment(data.parentId);
    if (!parent) {
      throw new Error('Parent comment not found');
    }
    // Enforce single-level threading - don't allow reply to reply
    if (parent.parentId !== null) {
      throw new Error('Cannot reply to a reply (single-level threading)');
    }
  }

  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO builder_zone_comments
     (zone_id, parent_id, proc_request_id, account_name, character_name, content, content_html)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.zoneId,
      data.parentId ?? null,
      data.procRequestId ?? null,
      accountName,
      data.characterName ?? null,
      data.content,
      sanitizedContentHtml,
    ],
  );

  const created = await getComment(result.insertId);
  if (!created) {
    throw new Error('Failed to create comment');
  }

  // Extract mentions and create notifications
  const mentionedAccounts = extractMentions(data.content);
  if (mentionedAccounts.length > 0) {
    const displayName = data.characterName || accountName;
    const message = `${displayName} mentioned you in a comment on zone ${zoneName || data.zoneId}`;
    await createMentions(
      'comment',
      created.id,
      mentionedAccounts,
      accountName,
      data.zoneId,
      zoneName ?? null,
      message,
    );
  }

  return created;
}

/**
 * Update a comment (only by the author or admins)
 */
export async function updateComment(
  id: number,
  data: UpdateZoneComment,
  accountName: string,
  isAdmin: boolean = false,
): Promise<ZoneComment | null> {
  const sanitizedContentHtml = sanitizeOptionalCommentHtml(data.contentHtml);
  const existing = await getComment(id);
  if (!existing) {
    return null;
  }

  // Check ownership (unless admin)
  if (!isAdmin && existing.accountName !== accountName) {
    throw new Error('Not authorized to edit this comment');
  }

  await db.query(
    `UPDATE builder_zone_comments
     SET content = ?, content_html = ?, updated_at = NOW()
     WHERE id = ?`,
    [data.content, sanitizedContentHtml, id],
  );

  return getComment(id);
}

/**
 * Delete a comment (only by the author or admins)
 * Also deletes all replies if it's a top-level comment
 */
export async function deleteComment(
  id: number,
  accountName: string,
  isAdmin: boolean = false,
): Promise<boolean> {
  const existing = await getComment(id);
  if (!existing) {
    return false;
  }

  // Check ownership (unless admin)
  if (!isAdmin && existing.accountName !== accountName) {
    throw new Error('Not authorized to delete this comment');
  }

  // Delete replies first if this is a top-level comment
  if (existing.parentId === null) {
    // Get reply IDs to delete their mentions too
    const [replies] = await db.query<RowDataPacket[]>(
      `SELECT id FROM builder_zone_comments WHERE parent_id = ?`,
      [id],
    );
    for (const reply of replies) {
      await deleteMentions('comment', reply.id);
    }
    await db.query(`DELETE FROM builder_zone_comments WHERE parent_id = ?`, [id]);
  }

  // Delete mentions for this comment
  await deleteMentions('comment', id);

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM builder_zone_comments WHERE id = ?`,
    [id],
  );

  return result.affectedRows > 0;
}

/**
 * Get comment count for a zone
 */
export async function getCommentCount(
  zoneId: string,
  procRequestId?: number | null,
): Promise<number> {
  let query = `SELECT COUNT(*) as count FROM builder_zone_comments WHERE zone_id = ?`;
  const params: (string | number | null)[] = [zoneId];

  if (procRequestId !== undefined) {
    if (procRequestId === null) {
      query += ' AND proc_request_id IS NULL';
    } else {
      query += ' AND proc_request_id = ?';
      params.push(procRequestId);
    }
  }

  const [rows] = await db.query<RowDataPacket[]>(query, params);
  return rows[0]?.count ?? 0;
}

/**
 * Get recent comments by a user across all zones
 */
export async function getRecentCommentsByUser(
  accountName: string,
  limit: number = 10,
): Promise<ZoneComment[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, parent_id, proc_request_id, account_name, character_name,
            content, content_html, created_at, updated_at
     FROM builder_zone_comments
     WHERE account_name = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [accountName, limit],
  );

  return rows.map(mapRowToComment);
}

export default {
  getComments,
  getComment,
  createComment,
  updateComment,
  deleteComment,
  getCommentCount,
  getRecentCommentsByUser,
};

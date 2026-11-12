import { pool as db } from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import type { ZoneComment, CreateZoneComment, UpdateZoneComment } from '../types/builder.js';
import { extractMentions, createMentions, deleteMentions } from './builderNotificationService.js';
import { processContentForWrite } from '../utils/contentParser.js';
import { getProcRequest } from './procRequestService.js';

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
    throw new AppError('Comment HTML must be a string', 400);
  }

  const processed = processContentForWrite(value);
  if (processed.error) {
    throw new AppError(processed.error, 400);
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
 * Get a comment by ID, only if it belongs to the given zone
 */
export async function getComment(
  zoneId: string,
  id: number,
  connection?: PoolConnection,
): Promise<ZoneComment | null> {
  const [rows] = await (connection ?? db).query<RowDataPacket[]>(
    `SELECT id, zone_id, parent_id, proc_request_id, account_name, character_name,
            content, content_html, created_at, updated_at
     FROM builder_zone_comments
     WHERE id = ? AND zone_id = ?${connection ? ' FOR UPDATE' : ''}`,
    [id, zoneId],
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

  const connection = await db.getConnection();
  let created: ZoneComment;
  try {
    await connection.beginTransaction();
    // Lock proc requests before comments, matching proc-request deletion order.
    if (
      data.procRequestId &&
      !(await getProcRequest(data.zoneId, data.procRequestId, connection))
    ) {
      throw new AppError('Proc request not found', 400);
    }

    if (data.parentId) {
      const parent = await getComment(data.zoneId, data.parentId, connection);
      if (!parent) {
        throw new AppError('Parent comment not found', 400);
      }
      if (parent.parentId !== null) {
        throw new AppError('Cannot reply to a reply (single-level threading)', 400);
      }
      if (parent.procRequestId !== (data.procRequestId ?? null)) {
        throw new AppError('Parent comment belongs to another discussion', 400);
      }
    }

    const [result] = await connection.query<ResultSetHeader>(
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

    const saved = await getComment(data.zoneId, result.insertId, connection);
    if (!saved) {
      throw new Error('Failed to create comment');
    }
    created = saved;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
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
 * Update a comment (only by the author or admins); returns null when the ID is
 * missing or belongs to another zone
 */
export async function updateComment(
  zoneId: string,
  id: number,
  data: UpdateZoneComment,
  accountName: string,
  isAdmin: boolean = false,
): Promise<ZoneComment | null> {
  const sanitizedContentHtml = sanitizeOptionalCommentHtml(data.contentHtml);
  const existing = await getComment(zoneId, id);
  if (!existing) {
    return null;
  }

  // Check ownership (unless admin)
  if (!isAdmin && existing.accountName !== accountName) {
    throw new AppError('Not authorized to edit this comment', 403);
  }

  await db.query(
    `UPDATE builder_zone_comments
     SET content = ?, content_html = ?, updated_at = NOW()
     WHERE id = ? AND zone_id = ?`,
    [data.content, sanitizedContentHtml, id, zoneId],
  );

  return getComment(zoneId, id);
}

/**
 * Delete a comment (only by the author or admins)
 * Also deletes all replies if it's a top-level comment
 * Returns false when the ID is missing or belongs to another zone
 */
export async function deleteComment(
  zoneId: string,
  id: number,
  accountName: string,
  isAdmin: boolean = false,
): Promise<boolean> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await getComment(zoneId, id, connection);
    if (!existing) {
      await connection.rollback();
      return false;
    }

    // Check ownership (unless admin)
    if (!isAdmin && existing.accountName !== accountName) {
      throw new AppError('Not authorized to delete this comment', 403);
    }

    // Delete replies first if this is a top-level comment
    if (existing.parentId === null) {
      // Get reply IDs to delete their mentions too
      const [replies] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM builder_zone_comments WHERE parent_id = ? AND zone_id = ? FOR UPDATE`,
        [id, zoneId],
      );
      for (const reply of replies) {
        await deleteMentions('comment', reply.id, connection);
      }
      await connection.query(
        `DELETE FROM builder_zone_comments WHERE parent_id = ? AND zone_id = ?`,
        [id, zoneId],
      );
    }

    // Delete mentions for this comment
    await deleteMentions('comment', id, connection);

    const [result] = await connection.query<ResultSetHeader>(
      `DELETE FROM builder_zone_comments WHERE id = ? AND zone_id = ?`,
      [id, zoneId],
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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

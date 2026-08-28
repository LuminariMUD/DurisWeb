import { pool as db } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type {
  ProcRequest,
  CreateProcRequest,
  UpdateProcRequest,
  ProcRequestStatus,
  ProcRequestEntityType,
} from '../types/builder.js';
import {
  extractMentions,
  createMentions,
  deleteMentions,
  createNotification,
} from './builderNotificationService.js';
import { processContentForWrite } from '../utils/contentParser.js';

// ============================================================================
// Proc Request Functions
// ============================================================================

function sanitizeOptionalDescriptionHtml(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Description HTML must be a string');
  }

  const processed = processContentForWrite(value);
  if (processed.error) {
    throw new Error(processed.error);
  }

  return processed.content;
}

/**
 * Get all proc requests for a zone
 */
export async function getProcRequests(
  zoneId: string,
  filters?: {
    status?: ProcRequestStatus;
    entityType?: ProcRequestEntityType;
    assignedTo?: string;
  }
): Promise<ProcRequest[]> {
  let query = `
    SELECT id, zone_id, entity_type, vnum, title, description, description_html,
           status, assigned_to, requested_by, requested_at, updated_at
    FROM builder_proc_requests
    WHERE zone_id = ?
  `;
  const params: (string | number)[] = [zoneId];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters?.entityType) {
    query += ' AND entity_type = ?';
    params.push(filters.entityType);
  }

  if (filters?.assignedTo) {
    query += ' AND assigned_to = ?';
    params.push(filters.assignedTo);
  }

  query += ' ORDER BY requested_at DESC';

  const [rows] = await db.query<RowDataPacket[]>(query, params);

  return rows.map((row: RowDataPacket) => ({
    id: row.id,
    zoneId: row.zone_id,
    entityType: row.entity_type as ProcRequestEntityType,
    vnum: row.vnum,
    title: row.title,
    description: row.description,
    descriptionHtml: row.description_html,
    status: row.status as ProcRequestStatus,
    assignedTo: row.assigned_to,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get a specific proc request by ID
 */
export async function getProcRequest(id: number): Promise<ProcRequest | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, entity_type, vnum, title, description, description_html,
            status, assigned_to, requested_by, requested_at, updated_at
     FROM builder_proc_requests
     WHERE id = ?`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    zoneId: row.zone_id,
    entityType: row.entity_type as ProcRequestEntityType,
    vnum: row.vnum,
    title: row.title,
    description: row.description,
    descriptionHtml: row.description_html,
    status: row.status as ProcRequestStatus,
    assignedTo: row.assigned_to,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new proc request
 */
export async function createProcRequest(
  data: CreateProcRequest,
  requestedBy: string,
  zoneName?: string | null
): Promise<ProcRequest> {
  const sanitizedDescriptionHtml = sanitizeOptionalDescriptionHtml(data.descriptionHtml);
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO builder_proc_requests
     (zone_id, entity_type, vnum, title, description, description_html, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.zoneId,
      data.entityType,
      data.vnum,
      data.title,
      data.description ?? null,
      sanitizedDescriptionHtml,
      requestedBy,
    ]
  );

  const created = await getProcRequest(result.insertId);
  if (!created) {
    throw new Error('Failed to create proc request');
  }

  // Extract mentions from description and create notifications
  if (data.description) {
    const mentionedAccounts = extractMentions(data.description);
    if (mentionedAccounts.length > 0) {
      const message = `${requestedBy} mentioned you in a proc request: "${data.title}" on zone ${zoneName || data.zoneId}`;
      await createMentions(
        'proc_request',
        created.id,
        mentionedAccounts,
        requestedBy,
        data.zoneId,
        zoneName ?? null,
        message
      );
    }
  }

  return created;
}

/**
 * Update a proc request
 */
export async function updateProcRequest(
  id: number,
  data: UpdateProcRequest,
  updatedBy?: string,
  zoneName?: string | null
): Promise<ProcRequest | null> {
  const sanitizedDescriptionHtml = sanitizeOptionalDescriptionHtml(data.descriptionHtml);
  const existing = await getProcRequest(id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.entityType !== undefined) {
    updates.push('entity_type = ?');
    params.push(data.entityType);
  }

  if (data.vnum !== undefined) {
    updates.push('vnum = ?');
    params.push(data.vnum);
  }

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title);
  }

  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }

  if (data.descriptionHtml !== undefined) {
    updates.push('description_html = ?');
    params.push(sanitizedDescriptionHtml);
  }

  if (data.status !== undefined) {
    updates.push('status = ?');
    params.push(data.status);
  }

  if (data.assignedTo !== undefined) {
    updates.push('assigned_to = ?');
    params.push(data.assignedTo);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = NOW()');
  params.push(id);

  await db.query(
    `UPDATE builder_proc_requests SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  // Create notifications for assignment and status changes
  if (updatedBy) {
    const zoneDisplay = zoneName || existing.zoneId;

    // Notify on assignment change (when someone is assigned)
    if (data.assignedTo !== undefined && data.assignedTo !== existing.assignedTo && data.assignedTo !== null) {
      // Don't notify if assigning to self
      if (data.assignedTo.toLowerCase() !== updatedBy.toLowerCase()) {
        await createNotification(
          data.assignedTo,
          'proc_assigned',
          existing.zoneId,
          zoneName ?? null,
          'proc_request',
          id,
          updatedBy,
          `${updatedBy} assigned you to proc request: "${existing.title}" on zone ${zoneDisplay}`
        );
      }
    }

    // Notify requester on status change (if not self-update)
    if (data.status !== undefined && data.status !== existing.status) {
      if (existing.requestedBy.toLowerCase() !== updatedBy.toLowerCase()) {
        await createNotification(
          existing.requestedBy,
          'proc_status_change',
          existing.zoneId,
          zoneName ?? null,
          'proc_request',
          id,
          updatedBy,
          `${updatedBy} changed status of your proc request "${existing.title}" to ${data.status} on zone ${zoneDisplay}`
        );
      }
    }
  }

  return getProcRequest(id);
}

/**
 * Update just the status of a proc request
 */
export async function updateProcRequestStatus(
  id: number,
  status: ProcRequestStatus,
  assignedTo?: string | null,
  updatedBy?: string,
  zoneName?: string | null
): Promise<ProcRequest | null> {
  const updates: UpdateProcRequest = { status };
  if (assignedTo !== undefined) {
    updates.assignedTo = assignedTo;
  }
  return updateProcRequest(id, updates, updatedBy, zoneName);
}

/**
 * Delete a proc request
 */
export async function deleteProcRequest(id: number): Promise<boolean> {
  // Delete mentions for this proc request
  await deleteMentions('proc_request', id);

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM builder_proc_requests WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * Get proc requests assigned to a specific user across all zones
 */
export async function getAssignedProcRequests(accountName: string): Promise<ProcRequest[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, entity_type, vnum, title, description, description_html,
            status, assigned_to, requested_by, requested_at, updated_at
     FROM builder_proc_requests
     WHERE assigned_to = ? AND status != 'completed'
     ORDER BY updated_at DESC`,
    [accountName]
  );

  return rows.map((row: RowDataPacket) => ({
    id: row.id,
    zoneId: row.zone_id,
    entityType: row.entity_type as ProcRequestEntityType,
    vnum: row.vnum,
    title: row.title,
    description: row.description,
    descriptionHtml: row.description_html,
    status: row.status as ProcRequestStatus,
    assignedTo: row.assigned_to,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get proc request counts by status for a zone
 */
export async function getProcRequestCounts(
  zoneId: string
): Promise<Record<ProcRequestStatus, number>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) as count
     FROM builder_proc_requests
     WHERE zone_id = ?
     GROUP BY status`,
    [zoneId]
  );

  const counts: Record<ProcRequestStatus, number> = {
    requested: 0,
    assigned: 0,
    in_progress: 0,
    completed: 0,
  };

  for (const row of rows) {
    counts[row.status as ProcRequestStatus] = row.count;
  }

  return counts;
}

export default {
  getProcRequests,
  getProcRequest,
  createProcRequest,
  updateProcRequest,
  updateProcRequestStatus,
  deleteProcRequest,
  getAssignedProcRequests,
  getProcRequestCounts,
};

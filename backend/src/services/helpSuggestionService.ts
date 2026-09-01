import { pool } from '../db/connection.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as notificationService from './unifiedNotificationService.js';

// ============================================================================
// Types
// ============================================================================

export type SuggestionType = 'new' | 'edit';
export type SuggestionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision';

export interface HelpSuggestion extends RowDataPacket {
  id: number;
  suggestion_type: SuggestionType;
  page_id: number | null;
  title: string;
  text: string;
  category_id: number;
  see_also: string | null;
  submitter_notes: string | null;
  status: SuggestionStatus;
  reviewer_account: string | null;
  reviewer_notes: string | null;
  reviewed_at: Date | null;
  submitted_by: string;
  submitted_at: Date;
  updated_at: Date;
  ip_address: string | null;
  // Joined fields
  category_name?: string;
  original_title?: string;
  original_text?: string;
}

export interface CreateSuggestionData {
  suggestionType: SuggestionType;
  pageId?: number;
  title: string;
  text: string;
  categoryId: number;
  seeAlso?: string;
  submitterNotes?: string;
}

export interface UpdateSuggestionData {
  title?: string;
  text?: string;
  categoryId?: number;
  seeAlso?: string;
  submitterNotes?: string;
}

export type ReviewAction = 'approve' | 'reject' | 'needs_revision';

// ============================================================================
// Create Suggestion
// ============================================================================

export async function createSuggestion(
  data: CreateSuggestionData,
  accountName: string,
  ipAddress: string | null,
): Promise<HelpSuggestion> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO help_file_suggestions
     (suggestion_type, page_id, title, text, category_id, see_also, submitter_notes, submitted_by, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.suggestionType,
      data.pageId || null,
      data.title,
      data.text,
      data.categoryId,
      data.seeAlso || null,
      data.submitterNotes || null,
      accountName,
      ipAddress,
    ],
  );

  return getSuggestionById(result.insertId) as Promise<HelpSuggestion>;
}

// ============================================================================
// Get Suggestions
// ============================================================================

export async function getSuggestionById(id: number): Promise<HelpSuggestion | null> {
  const [rows] = await pool.query<HelpSuggestion[]>(
    `SELECT s.*,
       CASE s.category_id
         WHEN 0 THEN 'General'
         WHEN 1 THEN 'Redirect'
         WHEN 9 THEN 'Class'
         WHEN 10 THEN 'Class Skillsets'
         WHEN 16 THEN 'Spec'
         WHEN 25 THEN 'Race'
         ELSE 'Uncategorized'
       END as category_name,
       p.title as original_title,
       p.text as original_text
     FROM help_file_suggestions s
     LEFT JOIN pages p ON s.page_id = p.id
     WHERE s.id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function getUserSuggestions(
  accountName: string,
  status?: SuggestionStatus,
): Promise<HelpSuggestion[]> {
  let query = `
    SELECT s.*,
      CASE s.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
    FROM help_file_suggestions s
    WHERE s.submitted_by = ?
  `;
  const params: (string | SuggestionStatus)[] = [accountName];

  if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  query += ' ORDER BY s.submitted_at DESC';

  const [rows] = await pool.query<HelpSuggestion[]>(query, params);
  return rows;
}

export async function getAllSuggestions(
  page: number = 1,
  limit: number = 50,
  status?: SuggestionStatus,
): Promise<{
  suggestions: HelpSuggestion[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const offset = (page - 1) * limit;

  let query = `
    SELECT s.*,
      CASE s.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
    FROM help_file_suggestions s
  `;
  const params: (string | number)[] = [];

  if (status) {
    query += ' WHERE s.status = ?';
    params.push(status);
  }

  query += ' ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query<HelpSuggestion[]>(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM help_file_suggestions';
  const countParams: string[] = [];
  if (status) {
    countQuery += ' WHERE status = ?';
    countParams.push(status);
  }
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, countParams);
  const total = countRows[0].total;

  return {
    suggestions: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ============================================================================
// Update Suggestion
// ============================================================================

export async function updateSuggestion(
  id: number,
  data: UpdateSuggestionData,
  accountName: string,
): Promise<HelpSuggestion | null> {
  // First verify ownership and pending status
  const suggestion = await getSuggestionById(id);
  if (!suggestion) return null;
  if (suggestion.submitted_by !== accountName) return null;
  if (suggestion.status !== 'pending' && suggestion.status !== 'needs_revision') return null;

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title);
  }
  if (data.text !== undefined) {
    updates.push('text = ?');
    params.push(data.text);
  }
  if (data.categoryId !== undefined) {
    updates.push('category_id = ?');
    params.push(data.categoryId);
  }
  if (data.seeAlso !== undefined) {
    updates.push('see_also = ?');
    params.push(data.seeAlso || null);
  }
  if (data.submitterNotes !== undefined) {
    updates.push('submitter_notes = ?');
    params.push(data.submitterNotes || null);
  }

  // Reset to pending if it was needs_revision
  if (suggestion.status === 'needs_revision') {
    updates.push('status = ?');
    params.push('pending');
  }

  updates.push('updated_at = NOW()');

  if (updates.length === 0) return suggestion;

  params.push(id);
  await pool.query(`UPDATE help_file_suggestions SET ${updates.join(', ')} WHERE id = ?`, params);

  return getSuggestionById(id);
}

// ============================================================================
// Cancel/Delete Suggestion
// ============================================================================

export async function cancelSuggestion(id: number, accountName: string): Promise<boolean> {
  // Verify ownership and pending status
  const suggestion = await getSuggestionById(id);
  if (!suggestion) return false;
  if (suggestion.submitted_by !== accountName) return false;
  if (suggestion.status !== 'pending' && suggestion.status !== 'needs_revision') return false;

  await pool.query('DELETE FROM help_file_suggestions WHERE id = ?', [id]);
  return true;
}

// ============================================================================
// Review Suggestion (Admin)
// ============================================================================

export async function reviewSuggestion(
  id: number,
  action: ReviewAction,
  reviewerAccount: string,
  reviewerNotes?: string,
): Promise<HelpSuggestion | null> {
  const suggestion = await getSuggestionById(id);
  if (!suggestion) return null;

  // Map action to status
  const statusMap: Record<ReviewAction, SuggestionStatus> = {
    approve: 'approved',
    reject: 'rejected',
    needs_revision: 'needs_revision',
  };
  const newStatus = statusMap[action];

  // Update suggestion
  await pool.query(
    `UPDATE help_file_suggestions
     SET status = ?, reviewer_account = ?, reviewer_notes = ?, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [newStatus, reviewerAccount, reviewerNotes || null, id],
  );

  // If approved, apply the changes to the pages table
  if (action === 'approve') {
    await applySuggestion(suggestion);
  }

  // Create notification for the submitter
  const cleanTitle = stripAnsi(suggestion.title);
  const notificationMessages: Record<ReviewAction, string> = {
    approve: `Your help file suggestion "${cleanTitle}" has been approved and published!`,
    reject: `Your help file suggestion "${cleanTitle}" was not accepted.${reviewerNotes ? ` Reason: ${reviewerNotes}` : ''}`,
    needs_revision: `Your help file suggestion "${cleanTitle}" needs revision.${reviewerNotes ? ` Feedback: ${reviewerNotes}` : ''}`,
  };

  await notificationService.createNotification({
    accountName: suggestion.submitted_by,
    source: 'guide',
    notificationType: `help_suggestion_${action}`,
    message: notificationMessages[action],
    link: '/guide/my-suggestions',
    triggeredByAccount: reviewerAccount,
    data: { suggestionId: suggestion.id, title: cleanTitle },
  });

  return getSuggestionById(id);
}

// ============================================================================
// Apply Suggestion (Create/Update Help File)
// ============================================================================

// Strip ANSI codes from text
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/&[a-zA-Z]/g, '');
}

async function applySuggestion(suggestion: HelpSuggestion): Promise<void> {
  // Strip ANSI from title
  const cleanTitle = stripAnsi(suggestion.title);
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);

  // Build the final text with header
  const header = `${cleanTitle} - Last Edited: ${dateStr} by ${suggestion.submitted_by}\n${'='.repeat(57)}`;
  let finalText = `${header}\n${suggestion.text}`;
  if (suggestion.see_also) {
    finalText += `\n==See also==\n${suggestion.see_also}`;
  }

  if (suggestion.suggestion_type === 'new') {
    // Create new help file
    await pool.query(
      `INSERT INTO pages (title, text, category_id, last_update, last_update_by)
       VALUES (?, ?, ?, NOW(), ?)`,
      [cleanTitle, finalText, suggestion.category_id, suggestion.submitted_by],
    );
  } else if (suggestion.suggestion_type === 'edit' && suggestion.page_id) {
    // Update existing help file
    await pool.query(
      `UPDATE pages
       SET title = ?, text = ?, category_id = ?, last_update = NOW(), last_update_by = ?
       WHERE id = ?`,
      [cleanTitle, finalText, suggestion.category_id, suggestion.submitted_by, suggestion.page_id],
    );
  }
}

// ============================================================================
// Get Pending Count (for admin badge)
// ============================================================================

export async function getPendingSuggestionCount(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) as count FROM help_file_suggestions WHERE status = 'pending'",
  );
  return rows[0].count;
}

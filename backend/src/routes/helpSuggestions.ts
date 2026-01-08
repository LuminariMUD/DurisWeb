import { Router, type Router as ExpressRouter } from 'express';
import { getErrorMessage } from '../utils/logger.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { extractClientIP } from '../utils/ipExtractor.js';
import { pool } from '../db/connection.js';
import * as helpSuggestionService from '../services/helpSuggestionService.js';
import type { SuggestionStatus, ReviewAction } from '../services/helpSuggestionService.js';

const router: ExpressRouter = Router();

// Helper function to log admin actions
async function logAdminAction(
  accountName: string,
  actionType: string,
  target: string,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
  notes: string | null | undefined,
  ipAddress: string | null | undefined
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountName, actionType, target, oldValue || null, newValue || null, notes || null, ipAddress]
    );
  } catch {
    // Silently fail logging
  }
}

// ============================================================================
// User Endpoints (requireAuth only)
// ============================================================================

// GET /api/guide/suggestions - Get user's own suggestions
router.get('/guide/suggestions', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const status = req.query.status as SuggestionStatus | undefined;

    const suggestions = await helpSuggestionService.getUserSuggestions(accountName, status);
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// POST /api/guide/suggestions - Submit a new suggestion
router.post('/guide/suggestions', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const ipAddress = extractClientIP(req);
    const { suggestionType, pageId, title, text, categoryId, seeAlso, submitterNotes } = req.body;

    // Validation
    if (!suggestionType || !['new', 'edit'].includes(suggestionType)) {
      return res.status(400).json({ error: 'Invalid suggestion type' });
    }
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (suggestionType === 'edit' && !pageId) {
      return res.status(400).json({ error: 'Page ID is required for edit suggestions' });
    }

    const suggestion = await helpSuggestionService.createSuggestion(
      {
        suggestionType,
        pageId,
        title: title.trim(),
        text,
        categoryId: categoryId ?? 0,
        seeAlso: seeAlso?.trim() || undefined,
        submitterNotes: submitterNotes?.trim() || undefined,
      },
      accountName,
      ipAddress
    );

    return res.status(201).json(suggestion);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/guide/suggestions/:id - Get a specific suggestion (own only)
router.get('/guide/suggestions/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user!.accountName;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid suggestion ID' });
    }

    const suggestion = await helpSuggestionService.getSuggestionById(id);
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Users can only view their own suggestions
    if (suggestion.submitted_by !== accountName) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(suggestion);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PATCH /api/guide/suggestions/:id - Update own pending suggestion
router.patch('/guide/suggestions/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user!.accountName;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid suggestion ID' });
    }

    const { title, text, categoryId, seeAlso, submitterNotes } = req.body;

    const updated = await helpSuggestionService.updateSuggestion(
      id,
      {
        title: title?.trim(),
        text,
        categoryId,
        seeAlso: seeAlso?.trim(),
        submitterNotes: submitterNotes?.trim(),
      },
      accountName
    );

    if (!updated) {
      return res.status(404).json({ error: 'Suggestion not found or cannot be edited' });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// DELETE /api/guide/suggestions/:id - Cancel own pending suggestion
router.delete('/guide/suggestions/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user!.accountName;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid suggestion ID' });
    }

    const deleted = await helpSuggestionService.cancelSuggestion(id, accountName);
    if (!deleted) {
      return res.status(404).json({ error: 'Suggestion not found or cannot be cancelled' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// ============================================================================
// Admin Endpoints (requirePermission)
// ============================================================================

// GET /api/admin/help-suggestions - List all suggestions for review
router.get('/admin/help-suggestions', requireAuth, requirePermission('manage_help_suggestions'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as SuggestionStatus | undefined;

    const result = await helpSuggestionService.getAllSuggestions(page, limit, status);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/admin/help-suggestions/pending-count - Get count of pending suggestions
router.get('/admin/help-suggestions/pending-count', requireAuth, requirePermission('manage_help_suggestions'), async (_req, res) => {
  try {
    const count = await helpSuggestionService.getPendingSuggestionCount();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/admin/help-suggestions/:id - Get suggestion details for review
router.get('/admin/help-suggestions/:id', requireAuth, requirePermission('manage_help_suggestions'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid suggestion ID' });
    }

    const suggestion = await helpSuggestionService.getSuggestionById(id);
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    return res.json(suggestion);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PATCH /api/admin/help-suggestions/:id/review - Approve/Reject/Request revision
router.patch('/admin/help-suggestions/:id/review', requireAuth, requirePermission('manage_help_suggestions'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user!.accountName;
    const ipAddress = extractClientIP(req);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid suggestion ID' });
    }

    const { action, reviewerNotes } = req.body as { action: ReviewAction; reviewerNotes?: string };

    if (!action || !['approve', 'reject', 'needs_revision'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be approve, reject, or needs_revision' });
    }

    // Get suggestion before review for logging
    const beforeSuggestion = await helpSuggestionService.getSuggestionById(id);
    if (!beforeSuggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    const reviewed = await helpSuggestionService.reviewSuggestion(id, action, accountName, reviewerNotes);
    if (!reviewed) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Log the admin action
    const actionTypeMap: Record<ReviewAction, string> = {
      approve: 'help_suggestion_approved',
      reject: 'help_suggestion_rejected',
      needs_revision: 'help_suggestion_revision_requested',
    };

    await logAdminAction(
      accountName,
      actionTypeMap[action],
      `Help Suggestion: ${reviewed.title}`,
      `Status: ${beforeSuggestion.status}`,
      `Status: ${reviewed.status}`,
      reviewerNotes || null,
      ipAddress
    );

    return res.json(reviewed);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;

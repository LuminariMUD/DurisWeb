import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth, requirePermission, optionalAuth } from '../middleware/auth.js';
import { getErrorMessage } from '../utils/logger.js';
import * as changelogService from '../services/changelogService.js';
import { processContentForWrite } from '../utils/contentParser.js';

const router: ExpressRouter = Router();

/**
 * GET /api/changelog - list published changelog entries
 * public route, but filters by user level
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // check if user is admin (level 57+) to include admin entries
    const includeAdmin = req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;
    const accountName = req.user?.accountName;

    const result = await changelogService.getChangelogEntries({
      includeAdmin,
      accountName,
      page,
      limit,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/admin - list all changelog entries for admin
 */
router.get('/admin', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await changelogService.getAllChangelogEntriesForAdmin(page, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/unread-count - get unread count for banner
 */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const includeAdmin = req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;

    const count = await changelogService.getUnreadCount(accountName, includeAdmin);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/:id - get single changelog entry
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user?.accountName;

    const entry = await changelogService.getChangelogEntry(id, accountName);

    if (!entry) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    // check if user can view admin entries
    if (entry.category === 'admin') {
      const canViewAdmin = req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;
      if (!canViewAdmin) {
        return res.status(404).json({ error: 'Changelog entry not found' });
      }
    }

    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * POST /api/changelog - create new changelog entry
 */
router.post('/', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const { version, title, content, category, isPublished } = req.body;

    if (!version || !title || !content) {
      return res.status(400).json({ error: 'Version, title, and content are required' });
    }

    if (category && !['public', 'admin'].includes(category)) {
      return res.status(400).json({ error: 'Category must be "public" or "admin"' });
    }

    const processedContent = processContentForWrite(content);
    if (processedContent.error) {
      return res.status(400).json({ error: processedContent.error });
    }

    const id = await changelogService.createChangelogEntry({
      version,
      title,
      content: processedContent.content,
      category: category || 'public',
      createdBy: req.user!.accountName,
      isPublished: isPublished ?? false,
    });

    // send notifications if published
    if (isPublished) {
      changelogService.notifyChangelogPublished(id, version, title, category || 'public')
        .catch(() => {}); // fire and forget
    }

    return res.status(201).json({ id });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * PUT /api/changelog/:id - update changelog entry
 */
router.put('/:id', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { version, title, content, category, isPublished } = req.body;

    if (category && !['public', 'admin'].includes(category)) {
      return res.status(400).json({ error: 'Category must be "public" or "admin"' });
    }

    let processedContent: string | undefined;
    if (content !== undefined) {
      const result = processContentForWrite(content);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      processedContent = result.content;
    }

    // check if entry was previously unpublished (for notification)
    const existingEntry = await changelogService.getChangelogEntry(id);
    const wasUnpublished = existingEntry && !existingEntry.isPublished;

    const updated = await changelogService.updateChangelogEntry(id, {
      version,
      title,
      content: processedContent,
      category,
      isPublished,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    // send notifications if just published
    if (isPublished && wasUnpublished && existingEntry) {
      changelogService.notifyChangelogPublished(
        id,
        version || existingEntry.version,
        title || existingEntry.title,
        category || existingEntry.category
      ).catch(() => {}); // fire and forget
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/changelog/:id - delete changelog entry
 */
router.delete('/:id', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const deleted = await changelogService.deleteChangelogEntry(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * POST /api/changelog/:id/read - mark entry as read
 */
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const accountName = req.user!.accountName;

    await changelogService.markAsRead(id, accountName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * POST /api/changelog/read-all - mark all entries as read
 */
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;

    const count = await changelogService.markAllAsRead(accountName);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;

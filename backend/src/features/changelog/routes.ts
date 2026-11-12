import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth, requirePermission, optionalAuth } from '../../middleware/auth.js';
import { getErrorMessage } from '../../utils/logger.js';
import * as changelogService from './service.js';
import { processContentForWrite } from '../../utils/contentParser.js';
import { validateIdParam } from '../../utils/validation.js';
import { listPagination, validateChangelogWriteBody } from './validation.js';

export const changelogRouter: ExpressRouter = Router();

/**
 * GET /api/changelog - list published changelog entries
 * public route, but filters by user level
 */
changelogRouter.get('/', optionalAuth, async (req, res) => {
  const pagination = listPagination(req.query.page, req.query.limit);
  if (!pagination)
    return res.status(400).json({ error: 'page and limit must be decimal integers' });
  try {
    const { page, limit } = pagination;

    // check if user is admin (level 57+) to include admin entries
    const includeAdmin =
      req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;
    const accountName = req.user?.accountName;

    const result = await changelogService.getChangelogEntries({
      includeAdmin,
      accountName,
      page,
      limit,
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/admin - list all changelog entries for admin
 */
changelogRouter.get('/admin', requireAuth, requirePermission('manage_news'), async (req, res) => {
  const pagination = listPagination(req.query.page, req.query.limit);
  if (!pagination)
    return res.status(400).json({ error: 'page and limit must be decimal integers' });
  try {
    const { page, limit } = pagination;

    const result = await changelogService.getAllChangelogEntriesForAdmin(page, limit);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/unread-count - get unread count for banner
 */
changelogRouter.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const includeAdmin =
      req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;

    const count = await changelogService.getUnreadCount(accountName, includeAdmin);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * GET /api/changelog/:id - get single changelog entry
 */
changelogRouter.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid changelog entry ID' });
    }
    const accountName = req.user?.accountName;
    const canViewAdmin =
      req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;

    const entry = await changelogService.getChangelogEntry(id, accountName, canViewAdmin);

    if (!entry) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    // Defense in depth: the service applies the same visibility filter, but
    // never return an unpublished/public or admin row to a non-admin caller.
    if (!canViewAdmin && (!entry.isPublished || entry.category !== 'public')) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * POST /api/changelog - create new changelog entry
 */
changelogRouter.post('/', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const validationError = validateChangelogWriteBody(req.body, true);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { version, title, content, category, isPublished } = req.body;

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
      changelogService
        .notifyChangelogPublished(id, version, title, category || 'public')
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
changelogRouter.put('/:id', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const validationError = validateChangelogWriteBody(req.body, false);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid changelog entry ID' });
    }
    const { version, title, content, category, isPublished } = req.body;

    let processedContent: string | undefined;
    if (content !== undefined) {
      const result = processContentForWrite(content);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      processedContent = result.content;
    }

    const { found, published } = await changelogService.updateChangelogEntry(id, {
      version,
      title,
      content: processedContent,
      category,
      isPublished,
    });

    if (!found) {
      return res.status(404).json({ error: 'Changelog entry not found' });
    }

    // Only the request whose conditional update published the entry notifies players.
    if (published) {
      changelogService
        .getChangelogEntry(id, undefined, true)
        .then((entry) =>
          entry
            ? changelogService.notifyChangelogPublished(
                id,
                entry.version,
                entry.title,
                entry.category,
              )
            : undefined,
        )
        .catch(() => {}); // fire and forget
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/changelog/:id - delete changelog entry
 */
changelogRouter.delete('/:id', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid changelog entry ID' });
    }

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
changelogRouter.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid changelog entry ID' });
    }
    const accountName = req.user!.accountName;

    await changelogService.markAsRead(id, accountName);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

/**
 * POST /api/changelog/read-all - mark all entries as read
 */
changelogRouter.post('/read-all', requireAuth, async (req, res) => {
  try {
    const accountName = req.user!.accountName;
    const includeAdmin =
      req.user?.permissions?.immortalLevel != null && req.user.permissions.immortalLevel >= 57;

    const count = await changelogService.markAllAsRead(accountName, includeAdmin);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import {
  parseStrictPositiveId,
  validateIdParam,
  validateStringField,
} from '../../utils/validation.js';
import { getZoneName } from '../../services/zoneBuilderParser.js';
import procRequestService from '../../services/procRequestService.js';
import zoneCommentService from '../../services/zoneCommentService.js';
import builderNotificationService from '../../services/builderNotificationService.js';
import type {
  CreateProcRequest,
  UpdateProcRequest,
  ProcRequestStatus,
  CreateZoneComment,
} from '../../types/builder.js';
import {
  validateOptionalHtml,
  logBuilderActivity,
  canAccessZone,
  canModerateZoneComments,
} from './shared.js';

export const builderCollaborationRoutes: IRouter = Router();

function validateAssignee(value: unknown): string | null {
  return value === null ? null : validateStringField(value, 'Assigned account', 50);
}

// ========== Builder Notifications ==========

// GET /api/builder/notifications - Get user's notifications
builderCollaborationRoutes.get('/notifications', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const isRead =
      req.query.is_read === 'true' ? true : req.query.is_read === 'false' ? false : undefined;

    const result = await builderNotificationService.getNotifications(
      accountName,
      isRead,
      limit,
      offset,
    );
    res.json(result);
  } catch (error) {
    logger.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications', message: getErrorMessage(error) });
  }
});

// GET /api/builder/notifications/unread-count - Get unread notification count
builderCollaborationRoutes.get(
  '/notifications/unread-count',
  async (req: Request, res: Response) => {
    try {
      const accountName = req.user?.accountName;
      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const count = await builderNotificationService.getUnreadCount(accountName);
      res.json({ count });
    } catch (error) {
      logger.error('Error getting unread count:', error);
      res
        .status(500)
        .json({ error: 'Failed to get unread count', message: getErrorMessage(error) });
    }
  },
);

// PUT /api/builder/notifications/:id/read - Mark notification as read
builderCollaborationRoutes.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const notificationId = validateIdParam(req.params.id);
    if (notificationId === null) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const success = await builderNotificationService.markAsRead(notificationId, accountName);
    if (!success) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark as read', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/notifications/read-all - Mark all notifications as read
builderCollaborationRoutes.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;
    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const count = await builderNotificationService.markAllAsRead(accountName);
    res.json({ success: true, markedCount: count });
  } catch (error) {
    logger.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read', message: getErrorMessage(error) });
  }
});

// ========== Proc Requests ==========

// GET /api/builder/zones/:id/proc-requests - List proc requests
builderCollaborationRoutes.get('/zones/:id/proc-requests', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const status = req.query.status as ProcRequestStatus | undefined;
    const entityType = req.query.entity_type as 'mob' | 'object' | 'room' | undefined;
    const assignedTo = req.query.assigned_to as string | undefined;

    const procRequests = await procRequestService.getProcRequests(zoneId, {
      status,
      entityType,
      assignedTo,
    });

    res.json({ procRequests });
  } catch (error) {
    logger.error('Error getting proc requests:', error);
    res.status(500).json({ error: 'Failed to get proc requests', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/proc-requests - Create proc request
builderCollaborationRoutes.post('/zones/:id/proc-requests', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access to create proc requests
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { entityType, vnum, title, description, descriptionHtml } = req.body;

    if (!['mob', 'object', 'room'].includes(entityType)) {
      res.status(400).json({ error: 'Invalid entity type' });
      return;
    }

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const processedDescriptionHtml = validateOptionalHtml(descriptionHtml);
    if ('error' in processedDescriptionHtml) {
      res.status(400).json({ error: processedDescriptionHtml.error });
      return;
    }

    const data: CreateProcRequest = {
      zoneId,
      entityType,
      vnum: parseInt(vnum, 10) || 0,
      title,
      description,
      descriptionHtml: processedDescriptionHtml.contentHtml ?? undefined,
    };

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const procRequest = await procRequestService.createProcRequest(data, accountName, zoneName);

    await logBuilderActivity(
      accountName,
      'proc_request_create',
      zoneId,
      zoneName,
      entityType,
      data.vnum,
      title,
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ procRequest });
  } catch (error) {
    logger.error('Error creating proc request:', error);
    res
      .status(500)
      .json({ error: 'Failed to create proc request', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/proc-requests/:prId - Update proc request
builderCollaborationRoutes.put(
  '/zones/:id/proc-requests/:prId',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const prId = validateIdParam(req.params.prId);
      if (prId === null) {
        res.status(400).json({ error: 'Invalid proc request ID' });
        return;
      }
      const accountName = req.user?.accountName;

      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check edit access
      if (!(await canAccessZone(req, zoneId, 'edit'))) {
        res.status(403).json({ error: 'Access denied to this zone' });
        return;
      }

      let processedDescriptionHtml: string | undefined;
      const assigneeError = validateAssignee(req.body.assignedTo);
      if (assigneeError) {
        res.status(400).json({ error: assigneeError });
        return;
      }
      if (req.body.descriptionHtml !== undefined) {
        const result = validateOptionalHtml(req.body.descriptionHtml);
        if ('error' in result) {
          res.status(400).json({ error: result.error });
          return;
        }
        processedDescriptionHtml = result.contentHtml ?? undefined;
      }

      const data: UpdateProcRequest = {};
      if (req.body.entityType) data.entityType = req.body.entityType;
      if (req.body.vnum !== undefined) data.vnum = parseInt(req.body.vnum, 10);
      if (req.body.title) data.title = req.body.title;
      if (req.body.description !== undefined) data.description = req.body.description;
      if (req.body.descriptionHtml !== undefined) data.descriptionHtml = processedDescriptionHtml;
      if (req.body.status) data.status = req.body.status;
      if (req.body.assignedTo !== undefined) data.assignedTo = req.body.assignedTo;

      // Get zone name for notification message
      const zoneName = await getZoneName(zoneId);

      const procRequest = await procRequestService.updateProcRequest(
        zoneId,
        prId,
        data,
        accountName,
        zoneName,
      );

      if (!procRequest) {
        res.status(404).json({ error: 'Proc request not found' });
        return;
      }

      await logBuilderActivity(
        accountName,
        'proc_request_update',
        zoneId,
        zoneName,
        procRequest.entityType,
        procRequest.vnum,
        procRequest.title,
        req.ip || req.socket.remoteAddress || null,
      );

      res.json({ procRequest });
    } catch (error) {
      logger.error('Error updating proc request:', error);
      res
        .status(500)
        .json({ error: 'Failed to update proc request', message: getErrorMessage(error) });
    }
  },
);

// PUT /api/builder/zones/:id/proc-requests/:prId/status - Update status only
builderCollaborationRoutes.put(
  '/zones/:id/proc-requests/:prId/status',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const prId = validateIdParam(req.params.prId);
      if (prId === null) {
        res.status(400).json({ error: 'Invalid proc request ID' });
        return;
      }
      const accountName = req.user?.accountName;

      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check edit access
      if (!(await canAccessZone(req, zoneId, 'edit'))) {
        res.status(403).json({ error: 'Access denied to this zone' });
        return;
      }

      const { status, assignedTo } = req.body;
      const assigneeError = validateAssignee(assignedTo);
      if (assigneeError) {
        res.status(400).json({ error: assigneeError });
        return;
      }

      const validStatuses: ProcRequestStatus[] = [
        'requested',
        'assigned',
        'in_progress',
        'completed',
      ];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      // Get zone name for notification message
      const zoneName = await getZoneName(zoneId);

      const procRequest = await procRequestService.updateProcRequestStatus(
        zoneId,
        prId,
        status,
        assignedTo,
        accountName,
        zoneName,
      );

      if (!procRequest) {
        res.status(404).json({ error: 'Proc request not found' });
        return;
      }

      res.json({ procRequest });
    } catch (error) {
      logger.error('Error updating proc request status:', error);
      res.status(500).json({ error: 'Failed to update status', message: getErrorMessage(error) });
    }
  },
);

// DELETE /api/builder/zones/:id/proc-requests/:prId - Delete proc request
builderCollaborationRoutes.delete(
  '/zones/:id/proc-requests/:prId',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const prId = validateIdParam(req.params.prId);
      if (prId === null) {
        res.status(400).json({ error: 'Invalid proc request ID' });
        return;
      }
      const accountName = req.user?.accountName;

      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check edit access
      if (!(await canAccessZone(req, zoneId, 'edit'))) {
        res.status(403).json({ error: 'Access denied to this zone' });
        return;
      }

      const deleted = await procRequestService.deleteProcRequest(zoneId, prId);

      if (!deleted) {
        res.status(404).json({ error: 'Proc request not found' });
        return;
      }

      await logBuilderActivity(
        accountName,
        'proc_request_delete',
        zoneId,
        null,
        'zone',
        null,
        `Deleted proc request #${prId}`,
        req.ip || req.socket.remoteAddress || null,
      );

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting proc request:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete proc request', message: getErrorMessage(error) });
    }
  },
);

// ========== Zone Comments ==========

/** createComment errors caused by a body reference the zone does not contain. */
const COMMENT_REFERENCE_ERRORS = new Set([
  'Parent comment not found',
  'Proc request not found',
  'Cannot reply to a reply (single-level threading)',
  'Parent comment belongs to another discussion',
]);

// GET /api/builder/zones/:id/comments - List comments
builderCollaborationRoutes.get('/zones/:id/comments', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const procRequestId = req.query.proc_request_id
      ? parseInt(req.query.proc_request_id as string, 10)
      : undefined;

    const comments = await zoneCommentService.getComments(
      zoneId,
      procRequestId === undefined ? null : procRequestId,
    );

    res.json({ comments });
  } catch (error) {
    logger.error('Error getting comments:', error);
    res.status(500).json({ error: 'Failed to get comments', message: getErrorMessage(error) });
  }
});

// POST /api/builder/zones/:id/comments - Add comment
builderCollaborationRoutes.post('/zones/:id/comments', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check edit access to comment
    if (!(await canAccessZone(req, zoneId, 'edit'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const { parentId, procRequestId, characterName, content, contentHtml } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const processedHtml = validateOptionalHtml(contentHtml);
    if ('error' in processedHtml) {
      res.status(400).json({ error: processedHtml.error });
      return;
    }

    const parsedParentId = parentId == null ? null : parseStrictPositiveId(parentId);
    const parsedProcRequestId = procRequestId == null ? null : parseStrictPositiveId(procRequestId);
    if (
      (parentId != null && parsedParentId === null) ||
      (procRequestId != null && parsedProcRequestId === null)
    ) {
      res.status(400).json({ error: 'Invalid parent comment or proc request ID' });
      return;
    }

    const data: CreateZoneComment = {
      zoneId,
      parentId: parsedParentId,
      procRequestId: parsedProcRequestId,
      characterName: characterName ?? null,
      content,
      contentHtml: processedHtml.contentHtml ?? undefined,
    };

    // Get zone name for notification message
    const zoneName = await getZoneName(zoneId);

    const comment = await zoneCommentService.createComment(data, accountName, zoneName);

    await logBuilderActivity(
      accountName,
      'comment_create',
      zoneId,
      zoneName,
      'zone',
      null,
      content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      req.ip || req.socket.remoteAddress || null,
    );

    res.status(201).json({ comment });
  } catch (error) {
    if (COMMENT_REFERENCE_ERRORS.has(getErrorMessage(error))) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    logger.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment', message: getErrorMessage(error) });
  }
});

// PUT /api/builder/zones/:id/comments/:commentId - Edit comment
builderCollaborationRoutes.put(
  '/zones/:id/comments/:commentId',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const commentId = validateIdParam(req.params.commentId);
      if (commentId === null) {
        res.status(400).json({ error: 'Invalid comment ID' });
        return;
      }
      const accountName = req.user?.accountName;

      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check view access (author check is done in service)
      if (!(await canAccessZone(req, zoneId, 'view'))) {
        res.status(403).json({ error: 'Access denied to this zone' });
        return;
      }

      const { content, contentHtml } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      const processedHtml = validateOptionalHtml(contentHtml);
      if ('error' in processedHtml) {
        res.status(400).json({ error: processedHtml.error });
        return;
      }

      const isAdmin = await canModerateZoneComments(req, zoneId);

      const comment = await zoneCommentService.updateComment(
        zoneId,
        commentId,
        { content, contentHtml: processedHtml.contentHtml ?? undefined },
        accountName,
        isAdmin,
      );

      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      res.json({ comment });
    } catch (error) {
      if (getErrorMessage(error) === 'Not authorized to edit this comment') {
        res.status(403).json({ error: getErrorMessage(error) });
        return;
      }
      logger.error('Error updating comment:', error);
      res.status(500).json({ error: 'Failed to update comment', message: getErrorMessage(error) });
    }
  },
);

// DELETE /api/builder/zones/:id/comments/:commentId - Delete comment
builderCollaborationRoutes.delete(
  '/zones/:id/comments/:commentId',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const commentId = validateIdParam(req.params.commentId);
      if (commentId === null) {
        res.status(400).json({ error: 'Invalid comment ID' });
        return;
      }
      const accountName = req.user?.accountName;

      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check view access (author check is done in service)
      if (!(await canAccessZone(req, zoneId, 'view'))) {
        res.status(403).json({ error: 'Access denied to this zone' });
        return;
      }

      const isAdmin = await canModerateZoneComments(req, zoneId);

      const deleted = await zoneCommentService.deleteComment(
        zoneId,
        commentId,
        accountName,
        isAdmin,
      );

      if (!deleted) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      await logBuilderActivity(
        accountName,
        'comment_delete',
        zoneId,
        null,
        'zone',
        null,
        `Deleted comment #${commentId}`,
        req.ip || req.socket.remoteAddress || null,
      );

      res.json({ success: true });
    } catch (error) {
      if (getErrorMessage(error) === 'Not authorized to delete this comment') {
        res.status(403).json({ error: getErrorMessage(error) });
        return;
      }
      logger.error('Error deleting comment:', error);
      res.status(500).json({ error: 'Failed to delete comment', message: getErrorMessage(error) });
    }
  },
);

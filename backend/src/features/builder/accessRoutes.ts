import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import zoneInfoService from '../../services/zoneInfoService.js';
import { searchAccounts } from '../../services/accountService.js';
import type { ZonePermissionLevel } from '../../types/builder.js';
import {
  validateOptionalHtml,
  logBuilderActivity,
  canAccessZone,
  canManagePermissions,
} from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderAccessRoutes: IRouter = Router();

// ========== Zone Access Check ==========

// GET /api/builder/zones/:id/access - Check user's access level for a zone
builderAccessRoutes.get('/zones/:id/access', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Overlords have full access
    if (req.user?.permissions?.role === 'overlord') {
      res.json({ canView: true, canEdit: true, canManage: true, permissionLevel: 'manage' });
      return;
    }

    // Check global manage_zones permission
    if (req.user?.adminPermissions?.has('manage_zones')) {
      res.json({ canView: true, canEdit: true, canManage: true, permissionLevel: 'manage' });
      return;
    }

    // Check zone-specific permissions
    const canView = await zoneInfoService.canAccessZone(accountName, zoneId, 'view');
    const canEdit = await zoneInfoService.canAccessZone(accountName, zoneId, 'edit');
    const canManage = await zoneInfoService.canAccessZone(accountName, zoneId, 'manage');

    let permissionLevel: 'none' | 'view' | 'edit' | 'manage' = 'none';
    if (canManage) permissionLevel = 'manage';
    else if (canEdit) permissionLevel = 'edit';
    else if (canView) permissionLevel = 'view';

    res.json({ canView, canEdit, canManage, permissionLevel });
  } catch (error) {
    logger.error('Error checking zone access:', error);
    sendRouteError(res, error, 'Failed to check access', 'Failed to check access');
  }
});

// GET /api/builder/accessible-zones - Get list of zone IDs user can access
builderAccessRoutes.get('/accessible-zones', async (req: Request, res: Response) => {
  try {
    const accountName = req.user?.accountName;

    if (!accountName) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Overlords and users with manage_zones see all zones (return empty to indicate no filtering)
    if (
      req.user?.permissions?.role === 'overlord' ||
      req.user?.adminPermissions?.has('manage_zones')
    ) {
      res.json({ zoneIds: null }); // null means no filtering - all zones accessible
      return;
    }

    // Get zone IDs with at least view permission
    const zoneIds = await zoneInfoService.getAccessibleZoneIds(accountName);
    res.json({ zoneIds });
  } catch (error) {
    logger.error('Error getting accessible zones:', error);
    sendRouteError(res, error, 'Failed to get accessible zones', 'Failed to get accessible zones');
  }
});

// ========== Zone Info ==========

// GET /api/builder/zones/:id/info - Get zone info
builderAccessRoutes.get('/zones/:id/info', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const info = await zoneInfoService.getZoneInfo(zoneId);
    res.json({ info });
  } catch (error) {
    logger.error('Error getting zone info:', error);
    sendRouteError(res, error, 'Failed to get zone info', 'Failed to get zone info');
  }
});

// PUT /api/builder/zones/:id/info - Update zone info
builderAccessRoutes.put('/zones/:id/info', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
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

    const { description, descriptionHtml } = req.body;

    const processedDescriptionHtml = validateOptionalHtml(descriptionHtml);
    if ('error' in processedDescriptionHtml) {
      res.status(400).json({ error: processedDescriptionHtml.error });
      return;
    }

    const info = await zoneInfoService.upsertZoneInfo(
      zoneId,
      { description, descriptionHtml: processedDescriptionHtml.contentHtml ?? undefined },
      accountName,
    );

    // Log to activity log
    await logBuilderActivity(
      accountName,
      'zone_info_update',
      zoneId,
      null,
      'zone',
      null,
      'Updated zone description',
      req.ip || req.socket.remoteAddress || null,
    );

    // Log to zone info history
    await zoneInfoService.recordHistory(zoneId, accountName, 'description', 'Description updated');

    res.json({ info });
  } catch (error) {
    logger.error('Error updating zone info:', error);
    sendRouteError(res, error, 'Failed to update zone info', 'Failed to update zone info');
  }
});

// GET /api/builder/zones/:id/info/history - Get zone info edit history
builderAccessRoutes.get('/zones/:id/info/history', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check manage access (history is for managers only)
    if (!(await canAccessZone(req, zoneId, 'manage'))) {
      res.status(403).json({ error: 'Access denied - manage permission required' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await zoneInfoService.getZoneInfoHistory(zoneId, limit, offset);
    res.json(result);
  } catch (error) {
    logger.error('Error getting zone info history:', error);
    sendRouteError(res, error, 'Failed to get history', 'Failed to get history');
  }
});

// ========== Zone Permissions ==========

// GET /api/builder/zones/:id/permissions - Get zone permissions
builderAccessRoutes.get('/zones/:id/permissions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;

    // Check view access (can see permissions if can view zone)
    if (!(await canAccessZone(req, zoneId, 'view'))) {
      res.status(403).json({ error: 'Access denied to this zone' });
      return;
    }

    const permissions = await zoneInfoService.getZonePermissions(zoneId);
    const info = await zoneInfoService.getZoneInfo(zoneId);

    res.json({
      permissions,
      ownerAccount: info?.ownerAccount ?? null,
    });
  } catch (error) {
    logger.error('Error getting zone permissions:', error);
    sendRouteError(res, error, 'Failed to get zone permissions', 'Failed to get zone permissions');
  }
});

// POST /api/builder/zones/:id/permissions - Grant permission
builderAccessRoutes.post('/zones/:id/permissions', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const grantedBy = req.user?.accountName;

    if (!grantedBy) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Check if user can manage permissions
    if (!(await canManagePermissions(req, zoneId))) {
      res.status(403).json({ error: 'Not authorized to manage zone permissions' });
      return;
    }

    const { accountName, permissionLevel } = req.body;

    if (!accountName || typeof accountName !== 'string') {
      res.status(400).json({ error: 'Account name is required' });
      return;
    }

    const validLevels: ZonePermissionLevel[] = ['view', 'edit', 'manage'];
    if (!validLevels.includes(permissionLevel)) {
      res.status(400).json({ error: 'Invalid permission level. Must be view, edit, or manage' });
      return;
    }

    await zoneInfoService.grantZonePermission(zoneId, accountName, permissionLevel, grantedBy);

    // Log to activity log
    await logBuilderActivity(
      grantedBy,
      'zone_permission_grant',
      zoneId,
      null,
      'zone',
      null,
      `Granted ${permissionLevel} access to ${accountName}`,
      req.ip || req.socket.remoteAddress || null,
    );

    // Log to zone info history
    await zoneInfoService.recordHistory(
      zoneId,
      grantedBy,
      'permission_grant',
      `Granted ${permissionLevel} access to ${accountName}`,
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error granting zone permission:', error);
    sendRouteError(res, error, 'Failed to grant permission', 'Failed to grant permission');
  }
});

// DELETE /api/builder/zones/:id/permissions/:account - Revoke permission
builderAccessRoutes.delete(
  '/zones/:id/permissions/:account',
  async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.id;
      const targetAccount = req.params.account;
      const revokedBy = req.user?.accountName;

      if (!revokedBy) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Check if user can manage permissions
      if (!(await canManagePermissions(req, zoneId))) {
        res.status(403).json({ error: 'Not authorized to manage zone permissions' });
        return;
      }

      const revoked = await zoneInfoService.revokeZonePermission(zoneId, targetAccount);

      if (!revoked) {
        res.status(404).json({ error: 'Permission not found' });
        return;
      }

      // Log to activity log
      await logBuilderActivity(
        revokedBy,
        'zone_permission_revoke',
        zoneId,
        null,
        'zone',
        null,
        `Revoked access from ${targetAccount}`,
        req.ip || req.socket.remoteAddress || null,
      );

      // Log to zone info history
      await zoneInfoService.recordHistory(
        zoneId,
        revokedBy,
        'permission_revoke',
        `Revoked access from ${targetAccount}`,
      );

      res.json({ success: true });
    } catch (error) {
      logger.error('Error revoking zone permission:', error);
      sendRouteError(res, error, 'Failed to revoke permission', 'Failed to revoke permission');
    }
  },
);

// ========== Account Search (for permission autocomplete) ==========

// GET /api/builder/accounts/search - Search accounts
// Empty query returns first N accounts (for combobox initial display)
builderAccessRoutes.get('/accounts/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

    // Allow empty query to return first N accounts
    const accounts = await searchAccounts(query, limit);
    res.json({ accounts });
  } catch (error) {
    logger.error('Error searching accounts:', error);
    sendRouteError(res, error, 'Failed to search accounts', 'Failed to search accounts');
  }
});

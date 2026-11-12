import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth, requireOverlord } from '../../middleware/auth.js';
import { pool as db } from '../../db/connection.js';
import { RowDataPacket } from 'mysql2';
import {
  getAllPermissions,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getAccountPermissions,
  getUserPermissions,
  assignRole,
  revokeRole,
  grantPermission,
  revokePermission,
} from '../../services/adminPermissionService.js';
import { searchAccounts } from '../../services/accountService.js';
import { revalidateSockets } from '../../realtime/socketAuth.js';
import { getGodLevelFromCharacterLevel } from '../../services/permissionService.js';
import {
  parseStrictPositiveId,
  parseStrictPositiveIdArray,
  validateIdParam,
} from '../../utils/validation.js';
import { sendRouteError } from '../../utils/routeError.js';

export const adminAccessRoutes: IRouter = Router();

/**
 * ========================================
 * PERMISSION MANAGEMENT ROUTES (Phase 2)
 * ========================================
 */

/**
 * GET /api/admin/permissions
 * List all available permissions
 */
adminAccessRoutes.get(
  '/permissions',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const permissions = await getAllPermissions();
      return res.json(permissions);
    } catch (error) {
      logger.error('Get permissions error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  },
);

/**
 * GET /api/admin/roles
 * List all roles with permission counts
 */
adminAccessRoutes.get(
  '/roles',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const roles = await getAllRoles();
      return res.json(roles);
    } catch (error) {
      logger.error('Get roles error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch roles' });
    }
  },
);

/**
 * GET /api/admin/roles/:id
 * Get role details with permissions
 */
adminAccessRoutes.get(
  '/roles/:id',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const roleId = validateIdParam(req.params.id);

      if (roleId === null) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }

      const role = await getRoleById(roleId);

      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }

      return res.json(role);
    } catch (error) {
      logger.error('Get role error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch role' });
    }
  },
);

/**
 * POST /api/admin/roles
 * Create new role
 */
adminAccessRoutes.post(
  '/roles',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { name, description, permissionIds } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Role name is required' });
      }

      if (!Array.isArray(permissionIds)) {
        return res.status(400).json({ error: 'Permission IDs must be an array' });
      }
      const parsedPermissionIds = parseStrictPositiveIdArray(permissionIds);
      if (parsedPermissionIds === null) {
        return res.status(400).json({
          error:
            'Permission IDs must contain only positive safe integer IDs and at most 100 entries',
        });
      }

      const accountName = req.user?.accountName;
      if (!accountName) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const roleId = await createRole(name, description || null, parsedPermissionIds, accountName);

      return res.status(201).json({
        success: true,
        roleId,
        message: 'Role created successfully',
      });
    } catch (error) {
      logger.error('Create role error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to create role' });
    }
  },
);

/**
 * PUT /api/admin/roles/:id
 * Update role
 */
adminAccessRoutes.put(
  '/roles/:id',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const roleId = validateIdParam(req.params.id);
      const { name, description, permissionIds } = req.body;

      if (roleId === null) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Role name is required' });
      }

      if (!Array.isArray(permissionIds)) {
        return res.status(400).json({ error: 'Permission IDs must be an array' });
      }
      const parsedPermissionIds = parseStrictPositiveIdArray(permissionIds);
      if (parsedPermissionIds === null) {
        return res.status(400).json({
          error:
            'Permission IDs must contain only positive safe integer IDs and at most 100 entries',
        });
      }

      await updateRole(roleId, name, description || null, parsedPermissionIds);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Role updated successfully',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to update role', 'Failed to update role');
    }
  },
);

/**
 * DELETE /api/admin/roles/:id
 * Delete role
 */
adminAccessRoutes.delete(
  '/roles/:id',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const roleId = validateIdParam(req.params.id);

      if (roleId === null) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }

      await deleteRole(roleId);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to delete role', 'Failed to delete role');
    }
  },
);

/**
 * GET /api/admin/accounts
 * Get all accounts with assigned roles, permissions, or god-level characters
 * Returns full permission data to avoid N+1 queries
 */
adminAccessRoutes.get(
  '/accounts',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
        a.account_name,
        MAX(pd.level) as max_level,
        GROUP_CONCAT(DISTINCT CONCAT(r.id, ':', r.role_name) SEPARATOR '|') as roles,
        GROUP_CONCAT(DISTINCT CONCAT(p.id, ':', p.permission_name) SEPARATOR '|') as permissions
      FROM (
        SELECT account_name FROM admin_account_roles
        UNION
        SELECT account_name FROM admin_account_permissions
        UNION
        SELECT DISTINCT ac.account_name
        FROM account_characters ac
        INNER JOIN player_data pd ON ac.pid = pd.pid
        WHERE pd.level >= 57 AND ac.deleted_at IS NULL
      ) AS a
      LEFT JOIN account_characters ac ON a.account_name = ac.account_name AND ac.deleted_at IS NULL
      LEFT JOIN player_data pd ON ac.pid = pd.pid
      LEFT JOIN admin_account_roles ar ON a.account_name = ar.account_name
      LEFT JOIN admin_roles r ON ar.role_id = r.id
      LEFT JOIN admin_account_permissions ap ON a.account_name = ap.account_name
      LEFT JOIN admin_permissions p ON ap.permission_id = p.id
      GROUP BY a.account_name
      ORDER BY max_level DESC, a.account_name`,
      );

      // Parse the concatenated strings into structured data
      const accounts = rows.map((row: any) => {
        const maxLevel = row.max_level || 0;
        const { role: godLevel, immortalLevel } = getGodLevelFromCharacterLevel(maxLevel);

        // Parse roles from "id:name|id:name" format
        const roles = row.roles
          ? row.roles.split('|').map((r: string) => {
              const [id, name] = r.split(':');
              return { id: parseInt(id), name };
            })
          : [];

        // Parse permissions from "id:name|id:name" format
        const individualPermissions = row.permissions
          ? row.permissions.split('|').map((p: string) => {
              const [id, name] = p.split(':');
              return { id: parseInt(id), name };
            })
          : [];

        return {
          accountName: row.account_name,
          godLevel,
          immortalLevel,
          roles,
          individualPermissions,
        };
      });

      return res.json(accounts);
    } catch (error) {
      logger.error('Get accounts with permissions error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch accounts' });
    }
  },
);

/**
 * GET /api/admin/accounts/search
 * Search for accounts by name prefix
 */
adminAccessRoutes.get(
  '/accounts/search',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const query = (req.query.query as string) || '';
      const limit = parseInt(req.query.limit as string) || 9999;

      // Allow empty query to fetch all accounts
      const accounts = await searchAccounts(query, limit);
      return res.json(accounts);
    } catch (error) {
      logger.error('Search accounts error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to search accounts' });
    }
  },
);

/**
 * GET /api/admin/accounts/:accountName/permissions
 * Get account's effective permissions
 */
adminAccessRoutes.get(
  '/accounts/:accountName/permissions',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;

      const effectivePermissions = await getUserPermissions(accountName);
      const accountDetails = await getAccountPermissions(accountName);

      // Get god level from permission service
      const { parseAccountFile } = await import('../../services/mudAccountParser.js');
      const { getUserPermissions: getPermissions } = await import(
        '../../services/permissionService.js'
      );

      const mudAccount = await parseAccountFile(accountName);
      const userPermissions = await getPermissions(accountName, mudAccount.characters);

      return res.json({
        accountName,
        godLevel: userPermissions.role,
        immortalLevel: userPermissions.immortalLevel || null,
        effectivePermissions: Array.from(effectivePermissions),
        roles: accountDetails.roles,
        individualPermissions: accountDetails.individual_permissions,
      });
    } catch (error) {
      logger.error('Get account permissions error:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch account permissions' });
    }
  },
);

/**
 * POST /api/admin/accounts/:accountName/roles
 * Assign role to account
 */
adminAccessRoutes.post(
  '/accounts/:accountName/roles',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { roleId } = req.body;
      const parsedRoleId = parseStrictPositiveId(roleId);

      if (parsedRoleId === null) {
        return res.status(400).json({ error: 'Valid role ID is required' });
      }

      const grantedBy = req.user?.accountName;
      if (!grantedBy) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      await assignRole(accountName, parsedRoleId, grantedBy, ipAddress);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Role assigned successfully',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to assign role', 'Failed to assign role');
    }
  },
);

/**
 * DELETE /api/admin/accounts/:accountName/roles/:roleId
 * Revoke role from account
 */
adminAccessRoutes.delete(
  '/accounts/:accountName/roles/:roleId',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName, roleId } = req.params;
      const parsedRoleId = parseStrictPositiveId(roleId);

      if (parsedRoleId === null) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }

      const revokedBy = req.user?.accountName || 'system';
      const ipAddress = req.ip || req.socket.remoteAddress;
      await revokeRole(accountName, parsedRoleId, revokedBy, ipAddress);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Role revoked successfully',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to revoke role', 'Failed to revoke role');
    }
  },
);

/**
 * POST /api/admin/accounts/:accountName/permissions
 * Grant individual permission to account
 */
adminAccessRoutes.post(
  '/accounts/:accountName/permissions',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName } = req.params;
      const { permissionId } = req.body;
      const parsedPermissionId = parseStrictPositiveId(permissionId);

      if (parsedPermissionId === null) {
        return res.status(400).json({ error: 'Valid permission ID is required' });
      }

      const grantedBy = req.user?.accountName;
      if (!grantedBy) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      await grantPermission(accountName, parsedPermissionId, grantedBy, ipAddress);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Permission granted successfully',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to grant permission', 'Failed to grant permission');
    }
  },
);

/**
 * DELETE /api/admin/accounts/:accountName/permissions/:permissionId
 * Revoke individual permission from account
 */
adminAccessRoutes.delete(
  '/accounts/:accountName/permissions/:permissionId',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const { accountName, permissionId } = req.params;
      const parsedPermissionId = parseStrictPositiveId(permissionId);

      if (parsedPermissionId === null) {
        return res.status(400).json({ error: 'Invalid permission ID' });
      }

      const revokedBy = req.user?.accountName || 'system';
      const ipAddress = req.ip || req.socket.remoteAddress;
      await revokePermission(accountName, parsedPermissionId, revokedBy, ipAddress);
      await revalidateSockets();

      return res.json({
        success: true,
        message: 'Permission revoked successfully',
      });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to revoke permission',
        'Failed to revoke permission',
      );
    }
  },
);

import { pool as db } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache, deleteCache } from '../db/redis.js';

// Cache TTL for admin permissions (in seconds for Redis)
const ADMIN_PERM_CACHE_TTL = 5 * 60; // 5 minutes
const REDIS_KEY_PREFIX = 'perm:admin:';

interface Permission {
  id: number;
  permission_key: string;
  permission_name: string;
  description: string;
  category: string;
  sort_order: number;
}

interface Role {
  id: number;
  role_name: string;
  description: string;
  is_system_role: boolean;
}

interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

interface AccountPermissions {
  roles: Array<{
    id: number;
    role_name: string;
    granted_by: string;
    granted_at: Date;
  }>;
  individual_permissions: Array<{
    id: number;
    permission_key: string;
    permission_name: string;
    granted_by: string;
    granted_at: Date;
  }>;
  effective_permissions: string[]; // Array of permission_key strings
}

/**
 * Get all effective permissions for an account (roles + individual)
 * Returns a Set of permission_key strings
 */
export async function getUserPermissions(accountName: string): Promise<Set<string>> {
  const cacheKey = `${REDIS_KEY_PREFIX}${accountName}`;

  // Check Redis cache first
  const cached = await getCache<string[]>(cacheKey);
  if (cached) {
    return new Set(cached);
  }

  const permissions = new Set<string>();

  // Get permissions from assigned roles
  const rolePermissions = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT p.permission_key
     FROM admin_account_roles aar
     JOIN admin_role_permissions arp ON aar.role_id = arp.role_id
     JOIN admin_permissions p ON arp.permission_id = p.id
     WHERE aar.account_name = ?`,
    [accountName]
  );

  rolePermissions[0].forEach((row: any) => {
    permissions.add(row.permission_key);
  });

  // Get individual permission overrides
  const individualPermissions = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT p.permission_key
     FROM admin_account_permissions aap
     JOIN admin_permissions p ON aap.permission_id = p.id
     WHERE aap.account_name = ?`,
    [accountName]
  );

  individualPermissions[0].forEach((row: any) => {
    permissions.add(row.permission_key);
  });

  // Store in Redis as array (Sets don't serialize to JSON)
  await setCache(cacheKey, Array.from(permissions), ADMIN_PERM_CACHE_TTL);

  return permissions;
}

/**
 * Check if an account has a specific permission
 */
export async function hasPermission(accountName: string, permissionKey: string): Promise<boolean> {
  const permissions = await getUserPermissions(accountName);
  return permissions.has(permissionKey);
}

/**
 * Invalidate permission cache for an account
 */
export async function invalidatePermissionCache(accountName: string): Promise<void> {
  await deleteCache(`${REDIS_KEY_PREFIX}${accountName}`);
}

/**
 * Clear entire permission cache
 */
export async function clearPermissionCache(): Promise<void> {
  await deleteCache(`${REDIS_KEY_PREFIX}*`);
}

/**
 * Get all available permissions
 */
export async function getAllPermissions(): Promise<Permission[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, permission_key, permission_name, description, category, sort_order
     FROM admin_permissions
     ORDER BY sort_order`
  );
  return rows as Permission[];
}

/**
 * Get all roles with permission counts
 */
export async function getAllRoles(): Promise<Array<Role & { permission_count: number }>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       r.id,
       r.role_name,
       r.description,
       r.is_system_role,
       COUNT(arp.permission_id) as permission_count
     FROM admin_roles r
     LEFT JOIN admin_role_permissions arp ON r.id = arp.role_id
     GROUP BY r.id, r.role_name, r.description, r.is_system_role
     ORDER BY r.role_name`
  );
  return rows as Array<Role & { permission_count: number }>;
}

/**
 * Get a single role with its permissions
 */
export async function getRoleById(roleId: number): Promise<RoleWithPermissions | null> {
  const [roleRows] = await db.query<RowDataPacket[]>(
    `SELECT id, role_name, description, is_system_role
     FROM admin_roles
     WHERE id = ?`,
    [roleId]
  );

  if (roleRows.length === 0) {
    return null;
  }

  const role = roleRows[0] as Role;

  const [permissionRows] = await db.query<RowDataPacket[]>(
    `SELECT p.id, p.permission_key, p.permission_name, p.description, p.category, p.sort_order
     FROM admin_role_permissions arp
     JOIN admin_permissions p ON arp.permission_id = p.id
     WHERE arp.role_id = ?
     ORDER BY p.sort_order`,
    [roleId]
  );

  return {
    ...role,
    permissions: permissionRows as Permission[],
  };
}

/**
 * Get detailed permission info for an account
 */
export async function getAccountPermissions(accountName: string): Promise<AccountPermissions> {
  // Get assigned roles
  const [roleRows] = await db.query<RowDataPacket[]>(
    `SELECT r.id, r.role_name, aar.granted_by, aar.granted_at
     FROM admin_account_roles aar
     JOIN admin_roles r ON aar.role_id = r.id
     WHERE aar.account_name = ?
     ORDER BY r.role_name`,
    [accountName]
  );

  // Get individual permissions
  const [permRows] = await db.query<RowDataPacket[]>(
    `SELECT p.id, p.permission_key, p.permission_name, aap.granted_by, aap.granted_at
     FROM admin_account_permissions aap
     JOIN admin_permissions p ON aap.permission_id = p.id
     WHERE aap.account_name = ?
     ORDER BY p.permission_name`,
    [accountName]
  );

  // Get effective permissions
  const effectivePermissions = await getUserPermissions(accountName);

  return {
    roles: roleRows as any[],
    individual_permissions: permRows as any[],
    effective_permissions: Array.from(effectivePermissions),
  };
}

/**
 * Assign a role to an account
 */
export async function assignRole(
  accountName: string,
  roleId: number,
  grantedBy: string,
  ipAddress?: string
): Promise<void> {
  // Get role name for audit log
  const [roleRows] = await db.query<RowDataPacket[]>(
    'SELECT role_name FROM admin_roles WHERE id = ?',
    [roleId]
  );
  const roleName = roleRows[0]?.role_name || 'Unknown Role';

  await db.query(
    `INSERT INTO admin_account_roles (account_name, role_id, granted_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by), granted_at = NOW()`,
    [accountName, roleId, grantedBy]
  );

  // Audit log
  await db.query(
    `INSERT INTO admin_permission_audit (account_name, action_type, target_account, target_item, target_id, ip_address)
     VALUES (?, 'assign_role', ?, ?, ?, ?)`,
    [grantedBy, accountName, roleName, roleId, ipAddress]
  );

  await invalidatePermissionCache(accountName);
}

/**
 * Revoke a role from an account
 */
export async function revokeRole(
  accountName: string,
  roleId: number,
  revokedBy: string,
  ipAddress?: string
): Promise<void> {
  // Get role name for audit log
  const [roleRows] = await db.query<RowDataPacket[]>(
    'SELECT role_name FROM admin_roles WHERE id = ?',
    [roleId]
  );
  const roleName = roleRows[0]?.role_name || 'Unknown Role';

  await db.query(
    `DELETE FROM admin_account_roles
     WHERE account_name = ? AND role_id = ?`,
    [accountName, roleId]
  );

  // Audit log
  await db.query(
    `INSERT INTO admin_permission_audit (account_name, action_type, target_account, target_item, target_id, ip_address)
     VALUES (?, 'revoke_role', ?, ?, ?, ?)`,
    [revokedBy, accountName, roleName, roleId, ipAddress]
  );

  await invalidatePermissionCache(accountName);
}

/**
 * Grant an individual permission to an account
 */
export async function grantPermission(
  accountName: string,
  permissionId: number,
  grantedBy: string,
  ipAddress?: string
): Promise<void> {
  // Get permission key for audit log
  const [permRows] = await db.query<RowDataPacket[]>(
    'SELECT permission_key FROM admin_permissions WHERE id = ?',
    [permissionId]
  );
  const permissionKey = permRows[0]?.permission_key || 'Unknown Permission';

  await db.query(
    `INSERT INTO admin_account_permissions (account_name, permission_id, granted_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by), granted_at = NOW()`,
    [accountName, permissionId, grantedBy]
  );

  // Audit log
  await db.query(
    `INSERT INTO admin_permission_audit (account_name, action_type, target_account, target_item, target_id, ip_address)
     VALUES (?, 'grant_permission', ?, ?, ?, ?)`,
    [grantedBy, accountName, permissionKey, permissionId, ipAddress]
  );

  await invalidatePermissionCache(accountName);
}

/**
 * Revoke an individual permission from an account
 */
export async function revokePermission(
  accountName: string,
  permissionId: number,
  revokedBy: string,
  ipAddress?: string
): Promise<void> {
  // Get permission key for audit log
  const [permRows] = await db.query<RowDataPacket[]>(
    'SELECT permission_key FROM admin_permissions WHERE id = ?',
    [permissionId]
  );
  const permissionKey = permRows[0]?.permission_key || 'Unknown Permission';

  await db.query(
    `DELETE FROM admin_account_permissions
     WHERE account_name = ? AND permission_id = ?`,
    [accountName, permissionId]
  );

  // Audit log
  await db.query(
    `INSERT INTO admin_permission_audit (account_name, action_type, target_account, target_item, target_id, ip_address)
     VALUES (?, 'revoke_permission', ?, ?, ?, ?)`,
    [revokedBy, accountName, permissionKey, permissionId, ipAddress]
  );

  await invalidatePermissionCache(accountName);
}

/**
 * Create a new role
 */
export async function createRole(
  roleName: string,
  description: string,
  permissionIds: number[],
  createdBy: string
): Promise<number> {
  const [result] = await db.query<any>(
    `INSERT INTO admin_roles (role_name, description, is_system_role, created_by)
     VALUES (?, ?, false, ?)`,
    [roleName, description, createdBy]
  );

  const roleId = result.insertId;

  // Assign permissions to the new role
  if (permissionIds.length > 0) {
    const values = permissionIds.map(permId => [roleId, permId]);
    await db.query(
      `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?`,
      [values]
    );
  }

  return roleId;
}

/**
 * Update a role
 */
export async function updateRole(
  roleId: number,
  roleName: string,
  description: string,
  permissionIds: number[]
): Promise<void> {
  // Check if role exists
  const [roleRows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM admin_roles WHERE id = ?`,
    [roleId]
  );

  if (roleRows.length === 0) {
    throw new Error('Role not found');
  }

  // Update role metadata
  await db.query(
    `UPDATE admin_roles
     SET role_name = ?, description = ?, updated_at = NOW()
     WHERE id = ?`,
    [roleName, description, roleId]
  );

  // Replace all permissions
  await db.query(`DELETE FROM admin_role_permissions WHERE role_id = ?`, [roleId]);

  if (permissionIds.length > 0) {
    const values = permissionIds.map(permId => [roleId, permId]);
    await db.query(
      `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?`,
      [values]
    );
  }

  // Invalidate cache for all users with this role
  const [accountRows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT account_name FROM admin_account_roles WHERE role_id = ?`,
    [roleId]
  );

  for (const row of accountRows) {
    await invalidatePermissionCache((row as any).account_name);
  }
}

/**
 * Delete a role
 */
export async function deleteRole(roleId: number): Promise<void> {
  // Check if role exists
  const [roleRows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM admin_roles WHERE id = ?`,
    [roleId]
  );

  if (roleRows.length === 0) {
    throw new Error('Role not found');
  }

  // Get accounts with this role (to invalidate cache)
  const [accountRows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT account_name FROM admin_account_roles WHERE role_id = ?`,
    [roleId]
  );

  // Delete the role (cascade will handle junction tables)
  await db.query(`DELETE FROM admin_roles WHERE id = ?`, [roleId]);

  // Invalidate cache for affected users
  for (const row of accountRows) {
    await invalidatePermissionCache((row as any).account_name);
  }
}

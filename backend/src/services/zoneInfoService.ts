import { pool as db } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type {
  ZoneInfo,
  ZoneInfoUpdate,
  ZonePermission,
  ZonePermissionLevel,
  ZoneInfoHistory,
} from '../types/builder.js';

// ============================================================================
// Zone Info Functions
// ============================================================================

/**
 * Get zone info by zone ID
 */
export async function getZoneInfo(zoneId: string): Promise<ZoneInfo | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, description, description_html, owner_account, created_at, updated_at
     FROM builder_zone_info
     WHERE zone_id = ?`,
    [zoneId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    zoneId: row.zone_id,
    description: row.description,
    descriptionHtml: row.description_html,
    ownerAccount: row.owner_account,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create or update zone info
 */
export async function upsertZoneInfo(
  zoneId: string,
  data: ZoneInfoUpdate,
  ownerAccount: string
): Promise<ZoneInfo> {
  // Check if zone info exists
  const existing = await getZoneInfo(zoneId);

  if (existing) {
    // Update existing
    await db.query(
      `UPDATE builder_zone_info
       SET description = ?, description_html = ?, updated_at = NOW()
       WHERE zone_id = ?`,
      [data.description ?? null, data.descriptionHtml ?? null, zoneId]
    );
  } else {
    // Create new
    await db.query(
      `INSERT INTO builder_zone_info (zone_id, description, description_html, owner_account)
       VALUES (?, ?, ?, ?)`,
      [zoneId, data.description ?? null, data.descriptionHtml ?? null, ownerAccount]
    );
  }

  // Return updated/created info
  const result = await getZoneInfo(zoneId);
  if (!result) {
    throw new Error('Failed to create/update zone info');
  }
  return result;
}

/**
 * Set zone owner (creates zone info if doesn't exist)
 */
export async function setZoneOwner(zoneId: string, ownerAccount: string): Promise<void> {
  const existing = await getZoneInfo(zoneId);

  if (existing) {
    await db.query(
      `UPDATE builder_zone_info SET owner_account = ?, updated_at = NOW() WHERE zone_id = ?`,
      [ownerAccount, zoneId]
    );
  } else {
    await db.query(
      `INSERT INTO builder_zone_info (zone_id, owner_account) VALUES (?, ?)`,
      [zoneId, ownerAccount]
    );
  }
}

// ============================================================================
// Zone Permission Functions
// ============================================================================

/**
 * Get all permissions for a zone
 */
export async function getZonePermissions(zoneId: string): Promise<ZonePermission[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, account_name, permission_level, granted_by, granted_at
     FROM builder_zone_permissions
     WHERE zone_id = ?
     ORDER BY granted_at DESC`,
    [zoneId]
  );

  return rows.map((row: RowDataPacket) => ({
    id: row.id,
    zoneId: row.zone_id,
    accountName: row.account_name,
    permissionLevel: row.permission_level as ZonePermissionLevel,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  }));
}

/**
 * Get a specific permission for a user on a zone
 */
export async function getZonePermission(
  zoneId: string,
  accountName: string
): Promise<ZonePermission | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, account_name, permission_level, granted_by, granted_at
     FROM builder_zone_permissions
     WHERE zone_id = ? AND account_name = ?`,
    [zoneId, accountName]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    zoneId: row.zone_id,
    accountName: row.account_name,
    permissionLevel: row.permission_level as ZonePermissionLevel,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  };
}

/**
 * Grant permission to a user for a zone
 */
export async function grantZonePermission(
  zoneId: string,
  accountName: string,
  permissionLevel: ZonePermissionLevel,
  grantedBy: string
): Promise<void> {
  // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both create and update
  await db.query(
    `INSERT INTO builder_zone_permissions (zone_id, account_name, permission_level, granted_by, granted_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE permission_level = VALUES(permission_level), granted_by = VALUES(granted_by), granted_at = NOW()`,
    [zoneId, accountName, permissionLevel, grantedBy]
  );
}

/**
 * Revoke permission from a user for a zone
 */
export async function revokeZonePermission(zoneId: string, accountName: string): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM builder_zone_permissions WHERE zone_id = ? AND account_name = ?`,
    [zoneId, accountName]
  );
  return result.affectedRows > 0;
}

// ============================================================================
// Access Control Functions
// ============================================================================

const PERMISSION_LEVELS: Record<ZonePermissionLevel, number> = {
  view: 1,
  edit: 2,
  manage: 3,
};

/**
 * Check if a user can access a zone with the required permission level
 * Returns true if:
 * - User is the zone owner (full access)
 * - User has explicit permission at or above the required level
 */
export async function canAccessZone(
  accountName: string,
  zoneId: string,
  requiredLevel: ZonePermissionLevel
): Promise<boolean> {
  // Check if user is the zone owner
  const zoneInfo = await getZoneInfo(zoneId);
  if (zoneInfo?.ownerAccount === accountName) {
    return true;
  }

  // Check explicit permission
  const permission = await getZonePermission(zoneId, accountName);
  if (!permission) {
    return false;
  }

  const userLevel = PERMISSION_LEVELS[permission.permissionLevel];
  const required = PERMISSION_LEVELS[requiredLevel];
  return userLevel >= required;
}

/**
 * Check if a user can manage permissions for a zone
 * Requires either:
 * - Being the zone owner
 * - Having 'manage' permission on the zone
 */
export async function canManageZonePermissions(
  accountName: string,
  zoneId: string
): Promise<boolean> {
  return canAccessZone(accountName, zoneId, 'manage');
}

/**
 * Get all zone IDs that a user has access to (any level)
 * Used for dashboard filtering
 */
export async function getAccessibleZoneIds(accountName: string): Promise<string[]> {
  // Get zones where user is owner
  const [ownedRows] = await db.query<RowDataPacket[]>(
    `SELECT zone_id FROM builder_zone_info WHERE owner_account = ?`,
    [accountName]
  );

  // Get zones where user has explicit permission
  const [permittedRows] = await db.query<RowDataPacket[]>(
    `SELECT zone_id FROM builder_zone_permissions WHERE account_name = ?`,
    [accountName]
  );

  // Combine and deduplicate
  const zoneIds = new Set<string>();
  for (const row of ownedRows) {
    zoneIds.add(row.zone_id);
  }
  for (const row of permittedRows) {
    zoneIds.add(row.zone_id);
  }

  return Array.from(zoneIds);
}

/**
 * Check if a zone has any info/permissions set up
 * Used to determine if a zone is "claimed" or still public
 */
export async function isZoneClaimed(zoneId: string): Promise<boolean> {
  const info = await getZoneInfo(zoneId);
  return info !== null;
}

// ============================================================================
// History Functions
// ============================================================================

/**
 * Record a history entry for zone info changes
 */
export async function recordHistory(
  zoneId: string,
  accountName: string,
  fieldChanged: string,
  details: string | null
): Promise<void> {
  await db.query(
    `INSERT INTO builder_zone_info_history (zone_id, account_name, field_changed, details)
     VALUES (?, ?, ?, ?)`,
    [zoneId, accountName, fieldChanged, details]
  );
}

/**
 * Get history entries for a zone
 */
export async function getZoneInfoHistory(
  zoneId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ history: ZoneInfoHistory[]; total: number; hasMore: boolean }> {
  // Get total count
  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM builder_zone_info_history WHERE zone_id = ?`,
    [zoneId]
  );
  const total = countRows[0]?.total || 0;

  // Get paginated results
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, zone_id, account_name, field_changed, details, changed_at
     FROM builder_zone_info_history
     WHERE zone_id = ?
     ORDER BY changed_at DESC
     LIMIT ? OFFSET ?`,
    [zoneId, limit, offset]
  );

  const history: ZoneInfoHistory[] = rows.map((row: RowDataPacket) => ({
    id: row.id,
    zoneId: row.zone_id,
    accountName: row.account_name,
    fieldChanged: row.field_changed,
    details: row.details,
    changedAt: row.changed_at,
  }));

  return {
    history,
    total,
    hasMore: offset + history.length < total,
  };
}

export default {
  getZoneInfo,
  upsertZoneInfo,
  setZoneOwner,
  getZonePermissions,
  getZonePermission,
  grantZonePermission,
  revokeZonePermission,
  canAccessZone,
  canManageZonePermissions,
  getAccessibleZoneIds,
  isZoneClaimed,
  recordHistory,
  getZoneInfoHistory,
};

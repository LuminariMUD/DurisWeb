import type { Request } from 'express';
import logger from '../../utils/logger.js';
import { pool } from '../../db/connection.js';
import { processContentForWrite } from '../../utils/contentParser.js';
import zoneInfoService from '../../services/zoneInfoService.js';

type OptionalHtmlResult = { contentHtml: string | null } | { error: string };

export function validateOptionalHtml(value: unknown): OptionalHtmlResult {
  if (value === undefined || value === null || value === '') {
    return { contentHtml: null };
  }

  if (typeof value !== 'string') {
    return { error: 'Comment HTML must be a string' };
  }

  const processed = processContentForWrite(value);
  return processed.error ? { error: processed.error } : { contentHtml: processed.content };
}

// Helper function to log builder activity to the dedicated activity log table
export async function logBuilderActivity(
  accountName: string,
  actionType: string, // 'room_create', 'room_update', 'room_delete', 'mob_create', etc.
  zoneId: string,
  zoneName: string | null,
  entityType: string, // 'room', 'mob', 'object', 'reset', 'zone'
  entityVnum: number | null,
  entityName: string | null,
  ipAddress: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO builder_activity_log
       (account_name, action_type, zone_id, zone_name, entity_type, entity_vnum, entity_name, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [accountName, actionType, zoneId, zoneName, entityType, entityVnum, entityName, ipAddress],
    );
  } catch (error) {
    logger.error('Failed to log builder activity:', error);
  }
}

// =============================================================================
// PHASE 7: ZONE INFO, PERMISSIONS, PROC REQUESTS, COMMENTS
// =============================================================================

// Helper: Check if user can access a zone at specified level
export async function canAccessZone(
  req: Request,
  zoneId: string,
  level: 'view' | 'edit' | 'manage',
): Promise<boolean> {
  const accountName = req.user?.accountName;
  if (!accountName) return false;

  // Overlords bypass all checks
  if (req.user?.permissions?.role === 'overlord') return true;

  // Check global manage_zones permission
  if (req.user?.adminPermissions?.has('manage_zones')) return true;

  // Check zone-specific permission
  return zoneInfoService.canAccessZone(accountName, zoneId, level);
}

// Helper: Check if user can manage zone permissions
export async function canManagePermissions(req: Request, zoneId: string): Promise<boolean> {
  const accountName = req.user?.accountName;
  if (!accountName) return false;

  // Overlords can manage any zone permissions
  if (req.user?.permissions?.role === 'overlord') return true;

  // Check manage_zone_permissions admin permission AND zone-level manage access
  if (req.user?.adminPermissions?.has('manage_zone_permissions')) {
    // Must also have manage access to the specific zone
    return zoneInfoService.canAccessZone(accountName, zoneId, 'manage');
  }

  return false;
}

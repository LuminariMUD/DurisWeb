import { RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';

export interface ForumSettings {
  min_level_to_moderate: number;
  min_level_to_ban: number;
  min_level_to_pin: number;
  min_level_to_lock: number;
  min_level_to_delete_any_post: number;
  min_level_immortal_forum: number;
  min_level_god_forum: number;
  allow_mortal_posts: boolean;
  post_rate_limit: number;
  thread_rate_limit: number;
}

export interface CategoryPermissions {
  min_level_to_view: number | null;
  min_level_to_post: number | null;
  min_level_to_moderate: number | null;
}

// Cache for settings (5 minute TTL)
let settingsCache: { settings: ForumSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get all forum settings
 */
export async function getForumSettings(): Promise<ForumSettings> {
  // Check cache
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.settings;
  }

  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT setting_key, setting_value FROM forum_settings',
  );

  // Convert rows to settings object
  const settings: any = {
    allow_mortal_posts: true,
    post_rate_limit: 20,
    thread_rate_limit: 5,
  };

  rows.forEach((row: RowDataPacket) => {
    const key = row.setting_key;
    const value = row.setting_value;

    if (key === 'allow_mortal_posts') {
      settings[key] = value === '1';
    } else if (key === 'post_rate_limit' || key === 'thread_rate_limit') {
      settings[key] = parseInt(value, 10);
    } else if (key.startsWith('min_level_')) {
      settings[key] = parseInt(value, 10);
    }
  });

  // Cache the settings
  settingsCache = {
    settings: settings as ForumSettings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return settings as ForumSettings;
}

/**
 * Update a forum setting (Overlord only)
 */
export async function updateForumSetting(
  key: string,
  value: string,
  updatedBy: string,
): Promise<void> {
  // Get old value for audit log
  const [oldRows] = await db.query<RowDataPacket[]>(
    'SELECT setting_value FROM forum_settings WHERE setting_key = ?',
    [key],
  );

  const oldValue = oldRows.length > 0 ? oldRows[0].setting_value : null;

  // Update setting
  await db.query(
    `INSERT INTO forum_settings (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?, updated_at = NOW()`,
    [key, value, updatedBy, value, updatedBy],
  );

  // Log to audit table
  await db.query(
    `INSERT INTO forum_permission_audit (changed_by, change_type, target_key, old_value, new_value)
     VALUES (?, 'setting', ?, ?, ?)`,
    [updatedBy, key, oldValue, value],
  );

  // Invalidate cache
  settingsCache = null;
}

/**
 * Get category-specific permission overrides
 */
export async function getCategoryPermissions(categoryId: number): Promise<CategoryPermissions> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT min_level_to_view, min_level_to_post, min_level_to_moderate
     FROM forum_categories
     WHERE id = ?`,
    [categoryId],
  );

  if (rows.length === 0) {
    return {
      min_level_to_view: null,
      min_level_to_post: null,
      min_level_to_moderate: null,
    };
  }

  return {
    min_level_to_view: rows[0].min_level_to_view,
    min_level_to_post: rows[0].min_level_to_post,
    min_level_to_moderate: rows[0].min_level_to_moderate,
  };
}

/**
 * Update category permission overrides (Overlord only)
 */
export async function updateCategoryPermissions(
  categoryId: number,
  permissions: Partial<CategoryPermissions>,
  updatedBy: string,
): Promise<void> {
  const updates: string[] = [];
  const values: any[] = [];

  if (permissions.min_level_to_view !== undefined) {
    updates.push('min_level_to_view = ?');
    values.push(permissions.min_level_to_view);
  }

  if (permissions.min_level_to_post !== undefined) {
    updates.push('min_level_to_post = ?');
    values.push(permissions.min_level_to_post);
  }

  if (permissions.min_level_to_moderate !== undefined) {
    updates.push('min_level_to_moderate = ?');
    values.push(permissions.min_level_to_moderate);
  }

  if (updates.length === 0) {
    return;
  }

  values.push(categoryId);

  await db.query(`UPDATE forum_categories SET ${updates.join(', ')} WHERE id = ?`, values);

  // Log to audit table
  await db.query(
    `INSERT INTO forum_permission_audit (changed_by, change_type, target_key, old_value, new_value)
     VALUES (?, 'category_permission', ?, NULL, ?)`,
    [updatedBy, `category_${categoryId}`, JSON.stringify(permissions)],
  );
}

/**
 * Clear settings cache (called after updates)
 */
export function clearSettingsCache(): void {
  settingsCache = null;
}

/**
 * Get audit log with filters and pagination
 */
export interface AuditLogFilters {
  page?: number;
  limit?: number;
  changedBy?: string;
  changeType?:
    | 'property_change'
    | 'level_cap_change'
    | 'wipe'
    | 'timer_reset'
    | 'setting'
    | 'category_permission'
    | 'all';
  targetKey?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface AuditLogResponse {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function getPermissionAuditLog(
  filters: AuditLogFilters = {},
): Promise<AuditLogResponse> {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 50, 100);
  const offset = (page - 1) * limit;

  // Build WHERE clauses for admin_action_log
  const adminWhereClauses: string[] = [];
  const adminParams: any[] = [];

  if (filters.changedBy) {
    adminWhereClauses.push('account_name LIKE ?');
    adminParams.push(`%${filters.changedBy}%`);
  }

  if (
    filters.changeType &&
    filters.changeType !== 'all' &&
    ['property_change', 'level_cap_change', 'wipe', 'timer_reset'].includes(filters.changeType)
  ) {
    adminWhereClauses.push('action_type = ?');
    adminParams.push(filters.changeType);
  }

  if (filters.targetKey) {
    adminWhereClauses.push('target LIKE ?');
    adminParams.push(`%${filters.targetKey}%`);
  }

  if (filters.startDate) {
    adminWhereClauses.push('timestamp >= ?');
    adminParams.push(filters.startDate);
  }

  if (filters.endDate) {
    adminWhereClauses.push('timestamp <= ?');
    adminParams.push(filters.endDate);
  }

  if (filters.search) {
    adminWhereClauses.push(
      '(account_name LIKE ? OR target LIKE ? OR old_value LIKE ? OR new_value LIKE ? OR notes LIKE ?)',
    );
    const searchTerm = `%${filters.search}%`;
    adminParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const adminWhereSQL =
    adminWhereClauses.length > 0 ? `WHERE ${adminWhereClauses.join(' AND ')}` : '';

  // Build WHERE clauses for forum_permission_audit
  const forumWhereClauses: string[] = [];
  const forumParams: any[] = [];

  if (filters.changedBy) {
    forumWhereClauses.push('changed_by LIKE ?');
    forumParams.push(`%${filters.changedBy}%`);
  }

  if (
    filters.changeType &&
    filters.changeType !== 'all' &&
    ['setting', 'category_permission'].includes(filters.changeType)
  ) {
    forumWhereClauses.push('change_type = ?');
    forumParams.push(filters.changeType);
  }

  if (filters.targetKey) {
    forumWhereClauses.push('target_key LIKE ?');
    forumParams.push(`%${filters.targetKey}%`);
  }

  if (filters.startDate) {
    forumWhereClauses.push('changed_at >= ?');
    forumParams.push(filters.startDate);
  }

  if (filters.endDate) {
    forumWhereClauses.push('changed_at <= ?');
    forumParams.push(filters.endDate);
  }

  if (filters.search) {
    forumWhereClauses.push(
      '(changed_by LIKE ? OR target_key LIKE ? OR old_value LIKE ? OR new_value LIKE ?)',
    );
    const searchTerm = `%${filters.search}%`;
    forumParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const forumWhereSQL =
    forumWhereClauses.length > 0 ? `WHERE ${forumWhereClauses.join(' AND ')}` : '';

  // Build WHERE clauses for admin_permission_audit
  const permAuditWhereClauses: string[] = [];
  const permAuditParams: any[] = [];

  if (filters.changedBy) {
    permAuditWhereClauses.push('account_name LIKE ?');
    permAuditParams.push(`%${filters.changedBy}%`);
  }

  if (
    filters.changeType &&
    filters.changeType !== 'all' &&
    ['assign_role', 'revoke_role', 'grant_permission', 'revoke_permission'].includes(
      filters.changeType,
    )
  ) {
    permAuditWhereClauses.push('action_type = ?');
    permAuditParams.push(filters.changeType);
  }

  if (filters.targetKey) {
    permAuditWhereClauses.push('(target_account LIKE ? OR target_item LIKE ?)');
    permAuditParams.push(`%${filters.targetKey}%`, `%${filters.targetKey}%`);
  }

  if (filters.startDate) {
    permAuditWhereClauses.push('created_at >= ?');
    permAuditParams.push(filters.startDate);
  }

  if (filters.endDate) {
    permAuditWhereClauses.push('created_at <= ?');
    permAuditParams.push(filters.endDate);
  }

  if (filters.search) {
    permAuditWhereClauses.push(
      '(account_name LIKE ? OR target_account LIKE ? OR target_item LIKE ? OR notes LIKE ?)',
    );
    const searchTerm = `%${filters.search}%`;
    permAuditParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const permAuditWhereSQL =
    permAuditWhereClauses.length > 0 ? `WHERE ${permAuditWhereClauses.join(' AND ')}` : '';

  // Decide which tables to query based on changeType filter
  const queryAllTables = !filters.changeType || filters.changeType === 'all';
  const queryAdminOnly =
    filters.changeType &&
    [
      'property_change',
      'level_cap_change',
      'wipe',
      'timer_reset',
      'help_file_create',
      'help_file_edit',
      'help_file_delete',
      'news_edit',
      'motd_edit',
      'zone_create',
      'zone_edit',
      'zone_delete',
    ].includes(filters.changeType);
  const queryPermAuditOnly =
    filters.changeType &&
    ['assign_role', 'revoke_role', 'grant_permission', 'revoke_permission'].includes(
      filters.changeType,
    );

  // Build unified query with UNION
  let countQuery = '';
  let dataQuery = '';
  let countParams: any[] = [];
  let dataParams: any[] = [];

  if (queryAllTables) {
    // Query all three tables
    countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT id FROM admin_action_log ${adminWhereSQL}
        UNION ALL
        SELECT id FROM forum_permission_audit ${forumWhereSQL}
        UNION ALL
        SELECT id FROM admin_permission_audit ${permAuditWhereSQL}
      ) as combined
    `;
    countParams = [...adminParams, ...forumParams, ...permAuditParams];

    dataQuery = `
      SELECT * FROM (
        SELECT
          id,
          account_name as changed_by,
          action_type as change_type,
          target as target_key,
          old_value as old_value,
          new_value as new_value,
          notes as notes,
          timestamp as changed_at
        FROM admin_action_log
        ${adminWhereSQL}
        UNION ALL
        SELECT
          id,
          changed_by,
          change_type,
          target_key,
          old_value,
          new_value,
          NULL as notes,
          changed_at
        FROM forum_permission_audit
        ${forumWhereSQL}
        UNION ALL
        SELECT
          id,
          account_name as changed_by,
          action_type as change_type,
          CONCAT(target_account, ' -> ', target_item) as target_key,
          NULL as old_value,
          NULL as new_value,
          notes,
          created_at as changed_at
        FROM admin_permission_audit
        ${permAuditWhereSQL}
      ) as combined
      ORDER BY changed_at DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [...adminParams, ...forumParams, ...permAuditParams, limit, offset];
  } else if (queryAdminOnly) {
    // Query admin_action_log only
    countQuery = `SELECT COUNT(*) as total FROM admin_action_log ${adminWhereSQL}`;
    countParams = adminParams;

    dataQuery = `
      SELECT
        id,
        account_name as changed_by,
        action_type as change_type,
        target as target_key,
        old_value,
        new_value,
        notes,
        timestamp as changed_at
      FROM admin_action_log
      ${adminWhereSQL}
      ORDER BY changed_at DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [...adminParams, limit, offset];
  } else if (queryPermAuditOnly) {
    // Query admin_permission_audit only
    countQuery = `SELECT COUNT(*) as total FROM admin_permission_audit ${permAuditWhereSQL}`;
    countParams = permAuditParams;

    dataQuery = `
      SELECT
        id,
        account_name as changed_by,
        action_type as change_type,
        CONCAT(target_account, ' -> ', target_item) as target_key,
        NULL as old_value,
        NULL as new_value,
        notes,
        created_at as changed_at
      FROM admin_permission_audit
      ${permAuditWhereSQL}
      ORDER BY changed_at DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [...permAuditParams, limit, offset];
  } else {
    // Query forum_permission_audit only
    countQuery = `SELECT COUNT(*) as total FROM forum_permission_audit ${forumWhereSQL}`;
    countParams = forumParams;

    dataQuery = `
      SELECT
        id,
        changed_by,
        change_type,
        target_key,
        old_value,
        new_value,
        NULL as notes,
        changed_at
      FROM forum_permission_audit
      ${forumWhereSQL}
      ORDER BY changed_at DESC
      LIMIT ? OFFSET ?
    `;
    dataParams = [...forumParams, limit, offset];
  }

  // Get total count
  const [countResult] = await db.query<RowDataPacket[]>(countQuery, countParams);
  const total = countResult[0].total;

  // Get paginated data
  const [rows] = await db.query<RowDataPacket[]>(dataQuery, dataParams);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

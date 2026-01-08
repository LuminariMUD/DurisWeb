import { pool } from '../db/connection.js';
import type {
  UserListItem,
  UserManagementFilters,
  UserManagementResponse,
  UserBan
} from '../types/index.js';
import { sendMudCommandAsync, isMudConnected } from './mudAuctionClient.js';

/**
 * Strip ANSI color codes from a string
 */
function stripAnsiCodes(text: string): string {
  return text
    .replace(/&\+R/g, '')
    .replace(/&\+G/g, '')
    .replace(/&\+B/g, '')
    .replace(/&\+Y/g, '')
    .replace(/&\+W/g, '')
    .replace(/&\+L/g, '')
    .replace(/&\+r/g, '')
    .replace(/&\+g/g, '')
    .replace(/&n/g, '');
}

/**
 * Get paginated list of users with filters
 */
export async function getUserList(
  filters: UserManagementFilters
): Promise<UserManagementResponse> {
  const {
    search = '',
    race,
    class: classFilter,
    alignment,
    ban_status = 'all',
    page = 1,
    limit = 50,
    sort_by = 'last_login',
    sort_order = 'desc'
  } = filters;

  const offset = (page - 1) * limit;

  // Build WHERE clauses
  const whereClauses: string[] = [];
  const params: any[] = [];

  // Search filter (account, character, IP)
  if (search) {
    whereClauses.push(`(
      ac.account_name LIKE ? OR
      pc.name LIKE ? OR
      latest_char.last_ip LIKE ?
    )`);
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  // Race filter (stripped ANSI comparison)
  if (race) {
    whereClauses.push(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(pc.race,
        '&+R', ''), '&+G', ''), '&+B', ''), '&+Y', ''), '&+W', ''),
        '&+L', ''), '&+r', ''), '&+g', ''), '&n', ''
    ) = ?`);
    params.push(stripAnsiCodes(race));
  }

  // Class filter (stripped ANSI comparison)
  if (classFilter) {
    whereClauses.push(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(pc.classname,
        '&+R', ''), '&+G', ''), '&+B', ''), '&+Y', ''), '&+W', ''),
        '&+L', ''), '&+r', ''), '&+g', ''), '&n', ''
    ) = ?`);
    params.push(stripAnsiCodes(classFilter));
  }

  // Alignment filter (racewar)
  if (alignment) {
    whereClauses.push('pc.racewar = ?');
    params.push(alignment);
  }

  // Ban status filter
  if (ban_status === 'banned') {
    whereClauses.push('ub.is_active = TRUE');
  } else if (ban_status === 'active') {
    whereClauses.push('(ub.is_active IS NULL OR ub.is_active = FALSE)');
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Map sort_by to actual column
  const sortColumnMap: Record<string, string> = {
    account_name: 'ac.account_name',
    character_name: 'pc.name',
    race: 'pc.race',
    class: 'pc.classname',
    email: 'ac.account_name', // No email available, sort by account name
    last_login: 'mud_login.last_login'
  };

  const sortColumn = sortColumnMap[sort_by] || 'mud_login.last_login';
  const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Get total count - use account_characters as base table (source of truth)
  const countQuery = `
    SELECT COUNT(DISTINCT ac.account_name) as total
    FROM (
      SELECT DISTINCT account_name
      FROM account_characters
    ) ac
    LEFT JOIN account_characters ac_latest ON ac.account_name  = ac_latest.account_name      AND ac_latest.deleted_at IS NULL
      AND ac_latest.created_at = (
        SELECT MAX(created_at)
        FROM account_characters
        WHERE account_name  = ac.account_name  AND deleted_at IS NULL
      )
    LEFT JOIN players_core pc ON ac_latest.pid = pc.pid
    LEFT JOIN user_bans ub ON ac.account_name  = ub.account_name  AND ub.is_active = TRUE
    LEFT JOIN (
      SELECT account_name, MAX(created_at) as last_login
      FROM web_sessions
      GROUP BY account_name
    ) ws ON ac.account_name  = ws.account_name
    LEFT JOIN (
      SELECT account_name, ANY_VALUE(last_ip) as last_ip
      FROM account_characters
      WHERE deleted_at IS NULL
      GROUP BY account_name
    ) latest_char ON ac.account_name = latest_char.account_name
    ${whereSQL}
  `;

  const [countResult]: any = await pool.query(countQuery, params);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  // Get paginated data - use account_characters as base table (source of truth)
  // Get ALL characters for each account (including deleted ones)
  const dataQuery = `
    SELECT
      ac_all.account_name,
      pc.name as character_name,
      pc.race,
      pc.classname as class,
      pc.level,
      pc.racewar,
      latest_char.email,
      latest_char.last_ip,
      mud_login.last_login,
      ws.web_last_login,
      CASE WHEN ub.is_active = TRUE THEN 1 ELSE 0 END as is_banned,
      ub.reason as ban_reason,
      ub.banned_at,
      ub.banned_by,
      CASE WHEN ac_all.deleted_at IS NOT NULL THEN 1 ELSE 0 END as is_deleted,
      ac_all.deleted_at
    FROM (
      SELECT DISTINCT account_name
      FROM account_characters
    ) ac
    LEFT JOIN account_characters ac_all ON ac.account_name = ac_all.account_name
    LEFT JOIN players_core pc ON ac_all.pid = pc.pid
    LEFT JOIN (
      SELECT account_name, ANY_VALUE(email) as email, ANY_VALUE(last_ip) as last_ip
      FROM account_characters
      WHERE deleted_at IS NULL
      GROUP BY account_name
    ) latest_char ON ac.account_name = latest_char.account_name
    LEFT JOIN LATERAL (
      SELECT ii.last_connect as last_login
      FROM account_characters ac_inner
      JOIN ip_info ii ON ac_inner.pid = ii.pid
      WHERE ac_inner.account_name = ac.account_name
        AND ac_inner.deleted_at IS NULL
      ORDER BY ii.last_connect DESC
      LIMIT 1
    ) mud_login ON TRUE
    LEFT JOIN user_bans ub ON ac.account_name = ub.account_name AND ub.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT created_at as web_last_login
      FROM web_sessions
      WHERE web_sessions.account_name = ac.account_name
      ORDER BY created_at DESC
      LIMIT 1
    ) ws ON TRUE
    ${whereSQL}
    ORDER BY ${sortColumn} ${sortDirection}, ac_all.account_name, ac_all.deleted_at ASC, pc.name
    LIMIT ? OFFSET ?
  `;

  const [rows]: any = await pool.query(dataQuery, [...params, limit, offset]);

  const data: UserListItem[] = rows.map((row: any) => ({
    account_name: row.account_name,
    character_name: row.character_name,
    race: row.race,
    class: row.class,
    level: row.level,
    racewar: row.racewar,
    email: row.email,
    last_ip: row.last_ip,
    last_login: row.last_login,
    web_last_login: row.web_last_login,
    is_banned: Boolean(row.is_banned),
    ban_reason: row.ban_reason,
    banned_at: row.banned_at,
    banned_by: row.banned_by,
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Ban a user
 */
export async function banUser(
  accountName: string,
  reason: string,
  bannedBy: string
): Promise<void> {
  const query = `
    INSERT INTO user_bans (account_name, banned_by, reason, is_active)
    VALUES (?, ?, ?, TRUE)
  `;

  await pool.query(query, [accountName, bannedBy, reason]);
}

/**
 * Unban a user
 */
export async function unbanUser(
  accountName: string,
  unbannedBy: string
): Promise<void> {
  const query = `
    UPDATE user_bans
    SET is_active = FALSE,
        unbanned_at = NOW(),
        unbanned_by = ?
    WHERE account_name = ?
      AND is_active = TRUE
  `;

  await pool.query(query, [unbannedBy, accountName]);
}

/**
 * Get user's ban history
 */
export async function getUserBanHistory(accountName: string): Promise<UserBan[]> {
  const query = `
    SELECT *
    FROM user_bans
    WHERE account_name = ?
    ORDER BY banned_at DESC
  `;

  const [rows]: any = await pool.query(query, [accountName]);

  return rows.map((row: any) => ({
    id: row.id,
    account_name: row.account_name,
    banned_by: row.banned_by,
    banned_at: row.banned_at,
    unbanned_at: row.unbanned_at,
    unbanned_by: row.unbanned_by,
    reason: row.reason,
    is_active: Boolean(row.is_active)
  }));
}

/**
 * Check if user is currently banned
 */
export async function isUserBanned(accountName: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_bans
    WHERE account_name = ? AND is_active = TRUE
  `;

  const [rows]: any = await pool.query(query, [accountName]);
  return rows[0].count > 0;
}

/**
 * Delete a character from an account via MUD websocket
 */
export async function deleteCharacter(
  accountName: string,
  characterName: string,
  deletedBy: string
): Promise<{ success: boolean; message: string }> {
  // Check if MUD is connected
  if (!isMudConnected()) {
    return {
      success: false,
      message: 'MUD server is not connected'
    };
  }

  // Check if the character exists and belongs to this account
  const checkQuery = `
    SELECT ac.pid
    FROM account_characters ac
    JOIN players_core pc ON ac.pid = pc.pid
    WHERE ac.account_name = ?
      AND pc.name = ?
      AND ac.deleted_at IS NULL
  `;

  const [checkResult]: any = await pool.query(checkQuery, [accountName, characterName]);

  if (checkResult.length === 0) {
    return {
      success: false,
      message: 'Character not found or already deleted'
    };
  }

  const pid = checkResult[0].pid;

  // Send delete command to MUD via websocket and wait for response
  const result = await sendMudCommandAsync('admin_delete_character', {
    account: accountName,
    name: characterName,
    pid: pid,
    deletedBy: deletedBy
  });

  if (!result.success) {
    return {
      success: false,
      message: result.error || 'Failed to delete character'
    };
  }

  return {
    success: true,
    message: `Character ${characterName} has been deleted`
  };
}

/**
 * Get unique races for filter dropdown (with ANSI codes for display, but need stripped version for filtering)
 */
export async function getUniqueRaces(): Promise<string[]> {
  const query = `
    SELECT DISTINCT race
    FROM players_core
    WHERE race IS NOT NULL AND race != ''
    ORDER BY REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(race,
          '&+R', ''), '&+G', ''), '&+B', ''), '&+Y', ''), '&+W', ''),
          '&+L', ''), '&+r', ''), '&+g', ''), '&n', ''
      )
  `;

  const [rows]: any = await pool.query(query);
  return rows.map((row: any) => row.race);
}

/**
 * Get unique classes for filter dropdown (with ANSI codes for display, but need stripped version for filtering)
 */
export async function getUniqueClasses(): Promise<string[]> {
  const query = `
    SELECT DISTINCT classname as class
    FROM players_core
    WHERE classname IS NOT NULL AND classname != ''
    ORDER BY REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(classname,
          '&+R', ''), '&+G', ''), '&+B', ''), '&+Y', ''), '&+W', ''),
          '&+L', ''), '&+r', ''), '&+g', ''), '&n', ''
      )
  `;

  const [rows]: any = await pool.query(query);
  return rows.map((row: any) => row.class);
}

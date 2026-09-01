import { pool } from '../db/connection.js';
import type {
  UserListItem,
  UserManagementFilters,
  UserManagementResponse,
  UserBan
} from '../types/index.js';
import { sendMudCommandAsync, isMudConnected } from './mudAuctionClient.js';
import { isHookEnabledSync } from '../hooks/hookGate.js';

/**
 * Get paginated list of users with filters
 *
 * Uses account_characters as the base table (every character must have an account).
 * Joins to:
 * - players_core: for race, classname (with spec), level, racewar
 * - ip_info: for last_connect timestamp and last_ip
 * - user_bans: for ban status
 * - web_sessions: for web login time
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

  // build where clauses - use account_characters as base
  const whereClauses: string[] = [];
  const params: any[] = [];

  // only show active (non-deleted) characters
  whereClauses.push('ac.deleted_at IS NULL');

  // search filter (account, character, ip, pid)
  if (search) {
    whereClauses.push(`(
      ac.account_name LIKE ? OR
      ac.char_name LIKE ? OR
      ii.last_ip LIKE ? OR
      ac.pid = ?
    )`);
    const searchPattern = `%${search}%`;
    const pidSearch = parseInt(search) || 0;
    params.push(searchPattern, searchPattern, searchPattern, pidSearch);
  }

  // race filter (from players_core)
  if (race) {
    whereClauses.push(`pc.race = ?`);
    params.push(race);
  }

  // class filter (from players_core)
  if (classFilter) {
    whereClauses.push(`pc.classname = ?`);
    params.push(classFilter);
  }

  // alignment filter (racewar from player_data)
  if (alignment) {
    whereClauses.push('pd.racewar = ?');
    params.push(alignment);
  }

  // ban status filter
  if (ban_status === 'banned') {
    whereClauses.push('ub.is_active = TRUE');
  } else if (ban_status === 'active') {
    whereClauses.push('(ub.is_active IS NULL OR ub.is_active = FALSE)');
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // map sort_by to actual column
  const sortColumnMap: Record<string, string> = {
    pid: 'ac.pid',
    account_name: 'ac.account_name',
    character_name: 'ac.char_name',
    race: 'pc.race',
    class: 'pc.classname',
    email: 'a.email',
    last_login: 'ii.last_connect'
  };

  const sortColumn = sortColumnMap[sort_by] || 'ii.last_connect';
  const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM account_characters ac
    LEFT JOIN accounts a ON ac.account_name = a.account_name
    LEFT JOIN players_core pc ON LOWER(ac.char_name) = LOWER(pc.name)
    LEFT JOIN ip_info ii ON ac.pid = ii.pid
    LEFT JOIN user_bans ub ON ac.account_name = ub.account_name AND ub.is_active = TRUE
    ${whereSQL}
  `;

  const [countResult]: any = await pool.query(countQuery, params);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  // get paginated data
  const dataQuery = `
    SELECT
      ac.pid,
      ac.account_name,
      ac.char_name as character_name,
      COALESCE(pc.race, '') as race,
      COALESCE(pc.classname, '') as class,
      pc.level,
      pc.racewar,
      a.email,
      ii.last_ip,
      ii.last_connect as last_login,
      ws.web_last_login,
      CASE WHEN ub.is_active = TRUE THEN 1 ELSE 0 END as is_banned,
      ub.reason as ban_reason,
      ub.banned_at,
      ub.banned_by,
      CASE WHEN ac.deleted_at IS NOT NULL THEN 1 ELSE 0 END as is_deleted,
      ac.deleted_at
    FROM account_characters ac
    LEFT JOIN accounts a ON ac.account_name = a.account_name
    LEFT JOIN players_core pc ON LOWER(ac.char_name) = LOWER(pc.name)
    LEFT JOIN ip_info ii ON ac.pid = ii.pid
    LEFT JOIN user_bans ub ON ac.account_name = ub.account_name AND ub.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT created_at as web_last_login
      FROM web_sessions
      WHERE web_sessions.account_name = ac.account_name
      ORDER BY created_at DESC
      LIMIT 1
    ) ws ON TRUE
    ${whereSQL}
    ORDER BY ${sortColumn} ${sortDirection}, ac.char_name
    LIMIT ? OFFSET ?
  `;

  const [rows]: any = await pool.query(dataQuery, [...params, limit, offset]);

  const data: UserListItem[] = rows.map((row: any) => ({
    pid: row.pid,
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
  if (!isHookEnabledSync('admin_delete_character')) {
    return {
      success: false,
      message: 'Character deletion is disabled by the website hook gate',
    };
  }
  // Check if MUD is connected
  if (!isMudConnected()) {
    return {
      success: false,
      message: 'MUD server is not connected'
    };
  }

  // check if the character exists and belongs to this account
  const checkQuery = `
    SELECT ac.pid
    FROM account_characters ac
    WHERE ac.account_name = ?
      AND ac.char_name = ?
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
 * Get unique races for filter dropdown
 */
export async function getUniqueRaces(): Promise<string[]> {
  const query = `
    SELECT DISTINCT race
    FROM players_core
    WHERE race IS NOT NULL AND race != ''
    ORDER BY race
  `;

  const [rows]: any = await pool.query(query);
  return rows.map((row: any) => row.race);
}

/**
 * Get unique classes for filter dropdown (includes specializations)
 */
export async function getUniqueClasses(): Promise<string[]> {
  const query = `
    SELECT DISTINCT classname as class
    FROM players_core
    WHERE classname IS NOT NULL AND classname != ''
    ORDER BY classname
  `;

  const [rows]: any = await pool.query(query);
  return rows.map((row: any) => row.class);
}

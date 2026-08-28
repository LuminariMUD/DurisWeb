import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import { UserPermissions, CharacterInfo } from './permissionService.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CategoryPermission {
  id: number;
  category_id: number;
  permission_type: 'allow' | 'deny';

  // Target (at least one must be set)
  min_immortal_level: number | null;
  guild_name: string | null;
  account_name: string | null;
  character_pid: bigint | null;

  // Permission flags
  can_view: boolean;
  can_post: boolean;
  can_moderate: boolean;

  created_at: Date;
  created_by: string;
}

export interface CategoryWithPermissions {
  id: number;
  name: string;
  description: string | null;
  access_type: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl';
  min_level: number | null;
  guild_name: string | null;
  parent_id: number | null;
  sort_order: number;
  icon: string | null;
  is_archived: boolean;
  archived_at: Date | null;
  archived_by: string | null;
  created_at: Date;
  permissions?: CategoryPermission[];
}

export interface CategoryAccessResult {
  canView: boolean;
  canPost: boolean;
  canModerate: boolean;
}

// ============================================================================
// CRUD Operations (Admin Only)
// ============================================================================

/**
 * Get all categories including archived (admin view)
 */
export async function getAllCategoriesAdmin(includeArchived: boolean = false): Promise<CategoryWithPermissions[]> {
  const whereClause = includeArchived ? '' : 'WHERE is_archived = 0';

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM forum_categories ${whereClause} ORDER BY sort_order ASC, id ASC`
  );

  // Get permissions for each category
  const categories: CategoryWithPermissions[] = [];

  for (const cat of rows) {
    const [perms] = await db.query<RowDataPacket[]>(
      'SELECT * FROM forum_category_permissions WHERE category_id = ? ORDER BY id ASC',
      [cat.id]
    );

    categories.push({
      ...cat,
      permissions: perms as CategoryPermission[]
    } as CategoryWithPermissions);
  }

  return categories;
}

/**
 * Get single category by ID (admin view)
 */
export async function getCategoryByIdAdmin(categoryId: number): Promise<CategoryWithPermissions | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT * FROM forum_categories WHERE id = ?',
    [categoryId]
  );

  if (rows.length === 0) return null;

  const cat = rows[0];

  // Get permissions
  const [perms] = await db.query<RowDataPacket[]>(
    'SELECT * FROM forum_category_permissions WHERE category_id = ? ORDER BY id ASC',
    [categoryId]
  );

  return {
    ...cat,
    permissions: perms as CategoryPermission[]
  } as CategoryWithPermissions;
}

/**
 * Create new category
 */
export async function createCategory(
  name: string,
  description: string | null,
  accessType: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl',
  _createdBy: string, // Prefixed with _ to indicate intentionally unused
  options: {
    minLevel?: number;
    guildName?: string;
    parentId?: number;
    sortOrder?: number;
    icon?: string;
  } = {}
): Promise<number> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Validate parent_id if provided
    if (options.parentId) {
      const [parents] = await connection.query<RowDataPacket[]>(
        'SELECT id, parent_id FROM forum_categories WHERE id = ?',
        [options.parentId]
      );

      if (parents.length === 0) {
        throw new Error('Parent category not found');
      }

      // Prevent nesting beyond one level (no grandchildren)
      if (parents[0].parent_id !== null) {
        throw new Error('Cannot nest categories more than one level deep');
      }
    }

    // Validate access_type-specific fields
    if (accessType === 'role_based' && !options.minLevel) {
      throw new Error('min_level is required for role_based access');
    }

    if (accessType === 'guild' && !options.guildName) {
      throw new Error('guild_name is required for guild access');
    }

    // Get next sort_order if not provided
    let sortOrder = options.sortOrder;
    if (sortOrder === undefined) {
      const [maxOrder] = await connection.query<RowDataPacket[]>(
        'SELECT MAX(sort_order) as max_order FROM forum_categories'
      );
      sortOrder = (maxOrder[0].max_order || 0) + 10;
    }

    // Insert category
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO forum_categories
       (name, description, access_type, min_level, guild_name, parent_id, sort_order, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description,
        accessType,
        options.minLevel || null,
        options.guildName || null,
        options.parentId || null,
        sortOrder,
        options.icon || null
      ]
    );

    const categoryId = result.insertId;

    await connection.commit();
    return categoryId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update category
 */
export async function updateCategory(
  categoryId: number,
  updates: {
    name?: string;
    description?: string | null;
    accessType?: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl';
    minLevel?: number | null;
    guildName?: string | null;
    parentId?: number | null;
    sortOrder?: number;
    icon?: string | null;
  }
): Promise<boolean> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Validate parent_id if being updated
    if (updates.parentId !== undefined) {
      if (updates.parentId === categoryId) {
        throw new Error('Category cannot be its own parent');
      }

      if (updates.parentId !== null) {
        const [parents] = await connection.query<RowDataPacket[]>(
          'SELECT id, parent_id FROM forum_categories WHERE id = ?',
          [updates.parentId]
        );

        if (parents.length === 0) {
          throw new Error('Parent category not found');
        }

        if (parents[0].parent_id !== null) {
          throw new Error('Cannot nest categories more than one level deep');
        }
      }

      // Check if this category has children - cannot become a child if it has children
      const [children] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM forum_categories WHERE parent_id = ?',
        [categoryId]
      );

      if (children.length > 0 && updates.parentId !== null) {
        throw new Error('Cannot make a parent category into a child category');
      }
    }

    // Build update query dynamically
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }
    if (updates.accessType !== undefined) {
      setClauses.push('access_type = ?');
      values.push(updates.accessType);
    }
    if (updates.minLevel !== undefined) {
      setClauses.push('min_level = ?');
      values.push(updates.minLevel);
    }
    if (updates.guildName !== undefined) {
      setClauses.push('guild_name = ?');
      values.push(updates.guildName);
    }
    if (updates.parentId !== undefined) {
      setClauses.push('parent_id = ?');
      values.push(updates.parentId);
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      values.push(updates.sortOrder);
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?');
      values.push(updates.icon);
    }

    if (setClauses.length === 0) {
      return false; // Nothing to update
    }

    values.push(categoryId);

    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE forum_categories SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Archive category (soft delete)
 */
export async function archiveCategory(
  categoryId: number,
  archivedBy: string
): Promise<boolean> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Archive the category
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE forum_categories
       SET is_archived = 1, archived_at = NOW(), archived_by = ?
       WHERE id = ?`,
      [archivedBy, categoryId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Category not found');
    }

    // Archive all child categories
    await connection.query(
      `UPDATE forum_categories
       SET is_archived = 1, archived_at = NOW(), archived_by = ?
       WHERE parent_id = ?`,
      [archivedBy, categoryId]
    );

    // Archive all threads in this category
    await connection.query(
      `UPDATE forum_threads
       SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
       WHERE category_id = ?`,
      [archivedBy, categoryId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Restore archived category
 */
export async function restoreCategory(categoryId: number): Promise<boolean> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Check if parent is archived (can't restore child of archived parent)
    const [categories] = await connection.query<RowDataPacket[]>(
      'SELECT parent_id FROM forum_categories WHERE id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      throw new Error('Category not found');
    }

    if (categories[0].parent_id !== null) {
      const [parents] = await connection.query<RowDataPacket[]>(
        'SELECT is_archived FROM forum_categories WHERE id = ?',
        [categories[0].parent_id]
      );

      if (parents.length > 0 && parents[0].is_archived === 1) {
        throw new Error('Cannot restore category: parent category is archived');
      }
    }

    // Restore the category
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE forum_categories
       SET is_archived = 0, archived_at = NULL, archived_by = NULL
       WHERE id = ?`,
      [categoryId]
    );

    // Note: We don't auto-restore threads or child categories
    // Those must be restored manually

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Permanently delete category (dangerous!)
 */
export async function deleteCategoryPermanent(categoryId: number): Promise<boolean> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Check for child categories
    const [children] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_categories WHERE parent_id = ?',
      [categoryId]
    );

    if (children.length > 0) {
      throw new Error('Cannot delete category with child categories');
    }

    // Check for threads
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_threads WHERE category_id = ?',
      [categoryId]
    );

    if (threads.length > 0) {
      throw new Error('Cannot delete category with threads');
    }

    // Delete permissions first (foreign key)
    await connection.query(
      'DELETE FROM forum_category_permissions WHERE category_id = ?',
      [categoryId]
    );

    // Delete category
    const [result] = await connection.query<ResultSetHeader>(
      'DELETE FROM forum_categories WHERE id = ?',
      [categoryId]
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Reorder categories
 */
export async function reorderCategories(categoryOrders: { id: number; sortOrder: number }[]): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const { id, sortOrder } of categoryOrders) {
      await connection.query(
        'UPDATE forum_categories SET sort_order = ? WHERE id = ?',
        [sortOrder, id]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// ACL Permission Management
// ============================================================================

/**
 * Add ACL permission rule
 */
export async function addPermission(
  categoryId: number,
  createdBy: string,
  permissionType: 'allow' | 'deny',
  target: {
    minImmortalLevel?: number;
    guildName?: string;
    accountName?: string;
    characterPid?: bigint;
  },
  permissions: {
    canView?: boolean;
    canPost?: boolean;
    canModerate?: boolean;
  }
): Promise<number> {
  // Validate at least one target is specified
  if (!target.minImmortalLevel && !target.guildName && !target.accountName && !target.characterPid) {
    throw new Error('At least one target must be specified (level, guild, account, or character)');
  }

  // Validate min_immortal_level range
  if (target.minImmortalLevel !== undefined && (target.minImmortalLevel < 57 || target.minImmortalLevel > 62)) {
    throw new Error('min_immortal_level must be between 57 and 62');
  }

  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_category_permissions
     (category_id, permission_type, min_immortal_level, guild_name, account_name, character_pid,
      can_view, can_post, can_moderate, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      categoryId,
      permissionType,
      target.minImmortalLevel || null,
      target.guildName || null,
      target.accountName || null,
      target.characterPid || null,
      permissions.canView !== undefined ? permissions.canView : true,
      permissions.canPost !== undefined ? permissions.canPost : true,
      permissions.canModerate !== undefined ? permissions.canModerate : false,
      createdBy
    ]
  );

  return result.insertId;
}

/**
 * Remove ACL permission rule
 */
export async function removePermission(permissionId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM forum_category_permissions WHERE id = ?',
    [permissionId]
  );

  return result.affectedRows > 0;
}

/**
 * Get permissions for a category
 */
export async function getCategoryPermissions(categoryId: number): Promise<CategoryPermission[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT * FROM forum_category_permissions WHERE category_id = ? ORDER BY id ASC',
    [categoryId]
  );

  return rows as CategoryPermission[];
}

// ============================================================================
// ACL Permission Checking
// ============================================================================

/**
 * Check user's access to a category using full ACL system
 *
 * Access evaluation priority:
 * 1. Overlords (level 62) - always full access
 * 2. Custom ACL rules (if access_type = 'custom_acl')
 *    - Evaluate in order: character > account > guild > role
 *    - First matching DENY rule blocks access
 *    - First matching ALLOW rule grants access
 * 3. Role-based access (if access_type = 'role_based')
 * 4. Guild access (if access_type = 'guild')
 * 5. Authenticated access (if access_type = 'authenticated')
 * 6. Public access (if access_type = 'public')
 */
export async function checkCategoryAccess(
  categoryId: number,
  accountName: string,
  userPermissions: UserPermissions,
  characters: CharacterInfo[]
): Promise<CategoryAccessResult> {
  // Overlords always have full access
  if (userPermissions.immortalLevel === 62) {
    return { canView: true, canPost: true, canModerate: true };
  }

  // Get category info
  const [categories] = await db.query<RowDataPacket[]>(
    'SELECT access_type, min_level, guild_name, is_archived FROM forum_categories WHERE id = ?',
    [categoryId]
  );

  if (categories.length === 0) {
    return { canView: false, canPost: false, canModerate: false };
  }

  const category = categories[0];

  // Archived categories only visible to moderators
  if (category.is_archived && !userPermissions.canModerate) {
    return { canView: false, canPost: false, canModerate: false };
  }

  // Custom ACL evaluation
  if (category.access_type === 'custom_acl') {
    const aclResult = await evaluateACLPermissions(
      categoryId,
      accountName,
      userPermissions.immortalLevel,
      userPermissions.guilds,
      characters.map(c => c.pid)
    );

    if (aclResult !== null) {
      return aclResult;
    }

    // Custom ACL categories are allow-lists: no matching rule is default deny.
    return { canView: false, canPost: false, canModerate: false };
  }

  // Role-based access
  if (category.access_type === 'role_based') {
    const hasAccess = userPermissions.immortalLevel !== null &&
                      userPermissions.immortalLevel >= category.min_level;

    if (!hasAccess) {
      return { canView: false, canPost: false, canModerate: false };
    }

    return {
      canView: true,
      canPost: true,
      canModerate: userPermissions.canModerate
    };
  }

  // Guild access
  if (category.access_type === 'guild') {
    // Overlords (level 62+) can access all guild forums for moderation
    const isOverlord = userPermissions.immortalLevel && userPermissions.immortalLevel >= 62;

    const hasGuildAccess = category.guild_name && userPermissions.guilds.includes(category.guild_name);

    if (!isOverlord && !hasGuildAccess) {
      return { canView: false, canPost: false, canModerate: false };
    }

    return {
      canView: true,
      canPost: true,
      canModerate: userPermissions.canModerate
    };
  }

  // Authenticated and public access
  if (category.access_type === 'authenticated') {
    const isAuthenticated = Boolean(accountName);
    return {
      canView: isAuthenticated,
      canPost: isAuthenticated,
      canModerate: isAuthenticated && userPermissions.canModerate
    };
  }

  if (category.access_type === 'public') {
    return {
      canView: true,
      canPost: Boolean(accountName),
      canModerate: userPermissions.canModerate
    };
  }

  // Default deny
  return { canView: false, canPost: false, canModerate: false };
}

/**
 * Evaluate ACL permissions for a user
 * Returns null if no rules match (caller should apply default access)
 */
async function evaluateACLPermissions(
  categoryId: number,
  accountName: string,
  immortalLevel: number | null,
  guilds: string[],
  characterPids: number[]
): Promise<CategoryAccessResult | null> {
  // Get all ACL rules for this category
  const [rules] = await db.query<RowDataPacket[]>(
    `SELECT * FROM forum_category_permissions
     WHERE category_id = ?
     ORDER BY
       CASE
         WHEN character_pid IS NOT NULL THEN 1
         WHEN account_name IS NOT NULL THEN 2
         WHEN guild_name IS NOT NULL THEN 3
         WHEN min_immortal_level IS NOT NULL THEN 4
         ELSE 5
       END`,
    [categoryId]
  );

  if (rules.length === 0) {
    return null; // No ACL rules, use default access
  }

  // Evaluate rules in priority order
  for (const rule of rules) {
    let matches = false;

    // Check character match
    if (rule.character_pid !== null) {
      matches = characterPids.includes(Number(rule.character_pid));
    }
    // Check account match
    else if (rule.account_name !== null) {
      matches = rule.account_name === accountName;
    }
    // Check guild match
    else if (rule.guild_name !== null) {
      matches = guilds.includes(rule.guild_name);
    }
    // Check level match
    else if (rule.min_immortal_level !== null) {
      matches = immortalLevel !== null && immortalLevel >= rule.min_immortal_level;
    }

    if (matches) {
      if (rule.permission_type === 'deny') {
        // DENY rule - block access
        return { canView: false, canPost: false, canModerate: false };
      } else {
        // ALLOW rule - grant permissions
        return {
          canView: rule.can_view === 1,
          canPost: rule.can_post === 1,
          canModerate: rule.can_moderate === 1
        };
      }
    }
  }

  return null; // No matching rules
}

/**
 * Resolve category access using the authenticated account's current characters.
 * This is the canonical bridge used by forum routes and services so character-
 * scoped ACL rules cannot be bypassed by direct-ID lookups.
 */
export async function getCategoryAccessForAccount(
  categoryId: number,
  userPermissions: UserPermissions,
): Promise<CategoryAccessResult> {
  const characterPids: number[] = [];

  if (userPermissions.accountName) {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT pid FROM account_characters WHERE account_name = ? AND deleted_at IS NULL',
      [userPermissions.accountName],
    );

    for (const row of rows) {
      const pid = Number(row.pid);
      if (Number.isSafeInteger(pid)) characterPids.push(pid);
    }
  }

  const characters = characterPids.map((pid) => ({
    pid,
    name: '',
    level: 0,
    guild: '',
    race: '',
    classname: '',
    racewar: 0,
    active: true,
    money: 0,
  } satisfies CharacterInfo));

  return checkCategoryAccess(
    categoryId,
    userPermissions.accountName,
    userPermissions,
    characters,
  );
}


/**
 * Get all archived categories with deletion metadata
 */
export async function getArchivedCategories() {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      c.id,
      c.name,
      c.description,
      c.access_type,
      c.parent_id,
      c.icon,
      c.is_archived,
      c.archived_at,
      c.archived_by,
      (SELECT COUNT(*) FROM forum_threads t WHERE t.category_id = c.id AND t.is_deleted = TRUE) as deleted_thread_count,
      (SELECT COUNT(*) FROM forum_threads t WHERE t.category_id = c.id AND t.is_deleted = FALSE) as active_thread_count
    FROM forum_categories c
    WHERE c.is_archived = TRUE
    ORDER BY c.archived_at DESC`
  );

  return rows;
}

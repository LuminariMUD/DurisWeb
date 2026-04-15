import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool as db } from '../db/connection.js';
import { UserPermissions } from './permissionService.js';
import { findCharacterGuild } from './guildService.js';
import { processForumContent } from '../utils/contentParser.js';
import { extractImageUrls, linkImagesToPost, linkImagesToThread } from './postImageService.js';
import logger, { isErrorWithCode } from '../utils/logger.js';
import * as notificationService from './unifiedNotificationService.js';
import { sendForumReplyNotification } from './pushNotificationService.js';
import { getWebSettings } from './webSettingsService.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ForumCategory {
  id: number;
  name: string;
  description: string | null;
  access_type: 'public' | 'authenticated' | 'guild' | 'immortal' | 'god' | 'role_based' | 'custom_acl';
  guild_name: string | null;
  parent_id: number | null;
  sort_order: number;
  icon: string | null;
  min_level?: number | null;
  created_at: Date;
  thread_count?: number;
  post_count?: number;
  last_post?: {
    thread_id: number;
    thread_title: string;
    author_name: string;
    created_at: Date;
  } | null;
}

export interface ForumThread {
  id: number;
  category_id: number;
  author_account_name: string;
  author_character_pid: bigint | null;
  author_character_name: string | null;
  title: string;
  content: string;
  ip_address?: string | null; // Overlord-only
  created_at: Date;
  updated_at: Date;
  last_post_at: Date;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  view_count: number;
  reply_count: number;
}

export interface ForumPost {
  id: number;
  thread_id: number;
  parent_post_id: number | null;
  author_account_name: string;
  author_character_pid: bigint | null;
  author_character_name: string | null;
  content: string;
  ip_address?: string | null; // Overlord-only
  created_at: Date;
  edited_at: Date | null;
  is_deleted: boolean;
  reactions?: PostReaction[];
  character_title?: string | null;
  guild_name?: string | null;  // Contains ANSI codes
  guild_id?: number | null;
  guild_rank_title?: string | null;
}

export interface PostReaction {
  emoji: string;
  count: number;
  user_reacted: boolean;
}

export interface ThreadSubscription {
  user_account_name: string;
  thread_id: number;
  last_read_at: Date;
  notify_on_reply: boolean;
}

export interface ForumNotification {
  id: number;
  user_account_name: string;
  type: 'reply' | 'mention' | 'reaction';
  thread_id: number | null;
  post_id: number | null;
  triggered_by_account_name: string | null;
  is_read: boolean;
  created_at: Date;
  thread_title?: string;
  post_content_preview?: string;
}

// ============================================================================
// Category Management
// ============================================================================

/**
 * Get all categories with access control filtering
 */
export async function getCategories(
  permissions: UserPermissions
): Promise<ForumCategory[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      c.id,
      c.name,
      c.description,
      c.access_type,
      c.guild_name,
      c.parent_id,
      c.sort_order,
      c.icon,
      c.min_level,
      c.created_at,
      COUNT(DISTINCT t.id) as thread_count,
      COUNT(DISTINCT p.id) as post_count
    FROM forum_categories c
    LEFT JOIN forum_threads t ON c.id = t.category_id AND t.is_deleted = 0
    LEFT JOIN forum_posts p ON t.id = p.thread_id AND p.is_deleted = 0
    WHERE c.is_archived = 0
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.id ASC`
  );

  // Filter categories based on permissions
  const filtered: RowDataPacket[] = [];

  for (const cat of rows) {
    if (cat.access_type === 'public') {
      filtered.push(cat);
      continue;
    }
    if (cat.access_type === 'authenticated') {
      // Only show to authenticated users (check if accountName exists)
      if (permissions.accountName) {
        filtered.push(cat);
      }
      continue;
    }
    if (cat.access_type === 'god' && permissions.canAccessGodForum) {
      filtered.push(cat);
      continue;
    }
    if (cat.access_type === 'immortal' && permissions.canAccessImmortalForum) {
      filtered.push(cat);
      continue;
    }
    if (cat.access_type === 'guild') {
      // Overlords (level 62+) can see all guild forums for moderation
      if (permissions.immortalLevel && permissions.immortalLevel >= 62) {
        filtered.push(cat);
        continue;
      }
      if (cat.guild_name && permissions.guilds.includes(cat.guild_name)) {
        filtered.push(cat);
      }
      continue;
    }
    if (cat.access_type === 'role_based') {
      // Check forum_category_permissions table
      const [permRows] = await db.query<RowDataPacket[]>(
        `SELECT * FROM forum_category_permissions WHERE category_id = ?`,
        [cat.id]
      );

      if (permRows.length === 0) {
        // No permissions set - only overlords can see it
        if (permissions.role === 'overlord' || (permissions.immortalLevel && permissions.immortalLevel >= 60)) {
          filtered.push(cat);
        }
        continue;
      }

      // Check if user meets any of the permission requirements
      for (const perm of permRows) {
        let hasAccess = false;

        if (perm.permission_type === 'immortal_level' && perm.min_immortal_level) {
          hasAccess = (permissions.immortalLevel || 0) >= perm.min_immortal_level;
        } else if (perm.permission_type === 'account' && perm.account_name) {
          hasAccess = permissions.accountName === perm.account_name;
        } else if (perm.permission_type === 'guild' && perm.guild_name) {
          hasAccess = permissions.guilds.includes(perm.guild_name);
        }

        if (hasAccess) {
          filtered.push(cat);
          break;
        }
      }
    }
  }

  // Get last post info for each category
  const categoriesWithLastPost: ForumCategory[] = [];

  for (const cat of filtered) {
    const [lastPostRows] = await db.query<RowDataPacket[]>(
      `SELECT
        t.id as thread_id,
        t.title as thread_title,
        pc.char_name as author_name,
        p.created_at
      FROM forum_posts p
      JOIN forum_threads t ON p.thread_id = t.id
      LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
      WHERE t.category_id = ? AND t.is_deleted = 0 AND p.is_deleted = 0
      ORDER BY p.created_at DESC
      LIMIT 1`,
      [cat.id]
    );

    categoriesWithLastPost.push({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      access_type: cat.access_type,
      guild_name: cat.guild_name,
      parent_id: cat.parent_id,
      sort_order: cat.sort_order,
      icon: cat.icon,
      created_at: cat.created_at,
      thread_count: cat.thread_count || 0,
      post_count: cat.post_count || 0,
      last_post: lastPostRows.length > 0 ? {
        created_at: lastPostRows[0].created_at,
        author_name: lastPostRows[0].author_name || 'Unknown',
        thread_id: lastPostRows[0].thread_id,
        thread_title: lastPostRows[0].thread_title
      } : null
    });
  }

  return categoriesWithLastPost;
}

/**
 * Get category by ID with permission check
 */
export async function getCategoryById(
  categoryId: number,
  permissions: UserPermissions
): Promise<ForumCategory | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT * FROM forum_categories WHERE id = ?',
    [categoryId]
  );

  if (rows.length === 0) return null;

  const cat = rows[0];

  // Check access
  if (cat.access_type === 'public' || cat.access_type === 'authenticated') {
    return cat as ForumCategory;
  }
  if (cat.access_type === 'god' && !permissions.canAccessGodForum) return null;
  if (cat.access_type === 'immortal' && !permissions.canAccessImmortalForum) return null;
  if (cat.access_type === 'guild') {
    // Overlords (level 62+) can access all guild forums
    const isOverlord = permissions.immortalLevel && permissions.immortalLevel >= 62;
    if (!isOverlord && (!cat.guild_name || !permissions.guilds.includes(cat.guild_name))) return null;
  }

  return cat as ForumCategory;
}

/**
 * Get child categories of a parent category with access filtering
 */
export async function getChildCategories(
  parentId: number,
  permissions: UserPermissions
): Promise<ForumCategory[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.*,
      (SELECT COUNT(*) FROM forum_threads t WHERE t.category_id = c.id AND t.is_deleted = 0) as thread_count,
      (SELECT COUNT(*) FROM forum_posts p
       JOIN forum_threads t ON p.thread_id = t.id
       WHERE t.category_id = c.id AND p.is_deleted = 0 AND t.is_deleted = 0) as post_count
     FROM forum_categories c
     WHERE c.parent_id = ? AND c.is_archived = 0
     ORDER BY c.sort_order, c.name`,
    [parentId]
  );

  // Filter by access permissions (same logic as getCategories)
  const filtered: ForumCategory[] = [];
  const isOverlord = permissions.immortalLevel && permissions.immortalLevel >= 62;

  for (const cat of rows) {
    if (cat.access_type === 'public') {
      filtered.push(cat as ForumCategory);
      continue;
    }
    if (cat.access_type === 'authenticated' && permissions.accountName) {
      filtered.push(cat as ForumCategory);
      continue;
    }
    if (cat.access_type === 'god' && permissions.canAccessGodForum) {
      filtered.push(cat as ForumCategory);
      continue;
    }
    if (cat.access_type === 'immortal' && permissions.canAccessImmortalForum) {
      filtered.push(cat as ForumCategory);
      continue;
    }
    if (cat.access_type === 'guild') {
      // Overlords can see all guild forums
      if (isOverlord) {
        filtered.push(cat as ForumCategory);
        continue;
      }
      if (cat.guild_name && permissions.guilds.includes(cat.guild_name)) {
        filtered.push(cat as ForumCategory);
      }
      continue;
    }
    if (cat.access_type === 'role_based') {
      if (isOverlord || (permissions.immortalLevel && permissions.immortalLevel >= (cat.min_level || 60))) {
        filtered.push(cat as ForumCategory);
      }
    }
  }

  // Get last post info for ALL categories in one query using ROW_NUMBER()
  const categoryIds = filtered.map(cat => cat.id);

  if (categoryIds.length > 0) {
    const [lastPostRows] = await db.query<RowDataPacket[]>(
      `SELECT
        category_id,
        thread_id,
        thread_title,
        author_name,
        created_at
      FROM (
        SELECT
          t.category_id,
          t.id as thread_id,
          t.title as thread_title,
          pc.char_name as author_name,
          p.created_at,
          ROW_NUMBER() OVER (PARTITION BY t.category_id ORDER BY p.created_at DESC) as rn
        FROM forum_posts p
        JOIN forum_threads t ON p.thread_id = t.id
        LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
        WHERE t.category_id IN (?) AND t.is_deleted = 0 AND p.is_deleted = 0
      ) ranked
      WHERE rn = 1`,
      [categoryIds]
    );

    // Build map for O(1) lookup
    const lastPostMap = new Map<number, {
      thread_id: number;
      thread_title: string;
      author_name: string;
      created_at: string;
    }>();

    for (const row of lastPostRows) {
      lastPostMap.set(row.category_id, {
        thread_id: row.thread_id,
        thread_title: row.thread_title,
        author_name: row.author_name,
        created_at: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : `${String(row.created_at).replace(' ', 'T')}Z`
      });
    }

    // Attach last post to each category
    for (const cat of filtered) {
      if (lastPostMap.has(cat.id)) {
        (cat as any).last_post = lastPostMap.get(cat.id);
      }
    }
  }

  return filtered;
}

/**
 * Auto-create guild category if it doesn't exist
 */
export async function ensureGuildCategory(guildName: string): Promise<number> {
  // Check if guild category already exists
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM forum_categories WHERE access_type = ? AND guild_name = ?',
    ['guild', guildName]
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new guild category
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_categories (name, description, access_type, guild_name, sort_order, icon)
     VALUES (?, ?, 'guild', ?, 100, '🏰')`,
    [
      `${guildName} Guild Hall`,
      `Private forum for members of ${guildName}`,
      guildName
    ]
  );

  return result.insertId;
}

/**
 * Create new forum category
 */
export async function createCategory(
  name: string,
  description: string | null,
  icon: string | null,
  accessType: 'public' | 'authenticated' | 'guild' | 'immortal' | 'god' | 'role_based' | 'custom_acl' = 'public',
  guildName: string | null = null,
  minLevel: number | null = null,
  sortOrder: number = 100
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_categories (name, description, icon, access_type, guild_name, min_level, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, description, icon, accessType, guildName, minLevel, sortOrder]
  );

  return result.insertId;
}

/**
 * Update forum category
 */
export async function updateCategory(
  categoryId: number,
  updates: {
    name?: string;
    description?: string;
    icon?: string;
    accessType?: 'public' | 'authenticated' | 'guild' | 'immortal' | 'god' | 'role_based' | 'custom_acl';
    guildName?: string;
    minLevel?: number | null;
    sortOrder?: number;
  }
): Promise<boolean> {
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description || null);
  }
  if (updates.icon !== undefined) {
    setClauses.push('icon = ?');
    values.push(updates.icon || null);
  }
  if (updates.accessType !== undefined) {
    setClauses.push('access_type = ?');
    values.push(updates.accessType);
  }
  if (updates.guildName !== undefined) {
    setClauses.push('guild_name = ?');
    values.push(updates.guildName || null);
  }
  if (updates.minLevel !== undefined) {
    setClauses.push('min_level = ?');
    values.push(updates.minLevel);
  }
  if (updates.sortOrder !== undefined) {
    setClauses.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  if (setClauses.length === 0) return false;

  values.push(categoryId);

  const [result] = await db.query<ResultSetHeader>(
    `UPDATE forum_categories SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Archive/delete a category (soft delete)
 */
export async function archiveCategory(categoryId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_categories SET is_archived = 1 WHERE id = ?',
    [categoryId]
  );

  return result.affectedRows > 0;
}

// ============================================================================
// Thread Management
// ============================================================================

/**
 * Get threads for a category (paginated)
 */
export async function getThreadsByCategory(
  categoryId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ threads: ForumThread[]; total: number }> {
  const offset = (page - 1) * limit;

  // Get total count
  const [countRows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) as total FROM forum_threads WHERE category_id = ? AND is_deleted = 0',
    [categoryId]
  );

  const total = countRows[0].total;

  // Get threads with character names
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      t.*,
      pc.char_name as author_character_name
    FROM forum_threads t
    LEFT JOIN frag_leaderboard pc ON t.author_character_pid = pc.pid
    WHERE t.category_id = ? AND t.is_deleted = 0
    ORDER BY t.is_pinned DESC, t.last_post_at DESC
    LIMIT ? OFFSET ?`,
    [categoryId, limit, offset]
  );

  return {
    threads: rows as ForumThread[],
    total
  };
}

/**
 * Get thread by ID
 */
export async function getThreadById(
  threadId: number,
  userPermissions?: UserPermissions
): Promise<ForumThread | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      t.*,
      pc.char_name as author_character_name,
      up.avatar_url as author_avatar_url,
      (SELECT COUNT(*) FROM forum_polls WHERE thread_id = t.id) > 0 as has_poll
    FROM forum_threads t
    LEFT JOIN frag_leaderboard pc ON t.author_character_pid = pc.pid
    LEFT JOIN user_profiles up ON t.author_account_name = up.account_name
    WHERE t.id = ?`,
    [threadId]
  );

  if (rows.length === 0) return null;

  const thread = rows[0];

  // Fetch guild data if character exists
  let guildInfo = null;
  if (thread.author_character_name) {
    guildInfo = await findCharacterGuild(thread.author_character_name);
  }

  // Get reactions for thread
  const [reactionRows] = await db.query<RowDataPacket[]>(
    `SELECT
      emoji,
      COUNT(*) as count,
      MAX(CASE WHEN user_account_name = ? THEN 1 ELSE 0 END) as user_reacted
    FROM forum_reactions
    WHERE thread_id = ?
    GROUP BY emoji`,
    [userPermissions?.accountName || '', threadId]
  );

  const result: any = {
    ...thread,
    author: thread.author_account_name, // Add alias for frontend compatibility
    character_name: thread.author_character_name, // Add alias for frontend compatibility
    guild_name: guildInfo?.guildName || null,
    guild_id: guildInfo?.guildId || null,
    guild_rank_title: guildInfo?.rankTitle || null,
    character_title: null, // TODO: Implement god-set titles from player file
    has_poll: Boolean(thread.has_poll), // Convert to boolean
    reactions: reactionRows.map((r: RowDataPacket) => ({
      emoji: r.emoji,
      count: r.count,
      userReacted: r.user_reacted === 1 // Convert to camelCase for frontend
    }))
  };

  // Only include IP address for Overlords (immortal level 60+)
  if (!userPermissions || !userPermissions.immortalLevel || userPermissions.immortalLevel < 60) {
    delete result.ip_address;
  }

  return result as unknown as ForumThread;
}

/**
 * Create new thread
 */
export async function createThread(
  categoryId: number,
  authorAccountName: string,
  authorCharacterPid: bigint | null,
  title: string,
  content: string,
  ipAddress: string | null = null
): Promise<number> {
  // Sanitize and process content
  const processed = processForumContent(content);
  if (processed.error) {
    throw new Error(processed.error);
  }

  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO forum_threads
     (category_id, author_account_name, author_character_pid, title, content, ip_address, last_post_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [categoryId, authorAccountName, authorCharacterPid, title, processed.content, ipAddress]
  );

  const threadId = result.insertId;

  // Link any images in the thread content (non-blocking)
  const imageUrls = extractImageUrls(processed.content || '');
  if (imageUrls.length > 0) {
    linkImagesToThread(threadId, imageUrls, authorAccountName).catch(err => {
      logger.error('Failed to link images to thread:', err);
    });
  }

  // Create mention notifications (non-blocking)
  if (processed.mentions.length > 0) {
    createMentions(threadId, processed.mentions, authorAccountName).catch(err => {
      logger.error('Failed to create mentions for thread:', err);
    });
  }

  return threadId;
}

/**
 * Update thread (title/content only, by author)
 */
export async function updateThread(
  threadId: number,
  title: string,
  content: string
): Promise<boolean> {
  // Sanitize and process content
  const processed = processForumContent(content);
  if (processed.error) {
    throw new Error(processed.error);
  }

  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_threads SET title = ?, content = ?, updated_at = NOW() WHERE id = ?',
    [title, processed.content, threadId]
  );

  return result.affectedRows > 0;
}

/**
 * Soft delete thread
 */
export async function deleteThread(threadId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_threads SET is_deleted = 1 WHERE id = ?',
    [threadId]
  );

  return result.affectedRows > 0;
}

/**
 * Pin/unpin thread (moderator only)
 */
export async function togglePinThread(threadId: number, isPinned: boolean): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_threads SET is_pinned = ? WHERE id = ?',
    [isPinned ? 1 : 0, threadId]
  );

  return result.affectedRows > 0;
}

/**
 * Lock/unlock thread (moderator only)
 */
export async function toggleLockThread(threadId: number, isLocked: boolean): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_threads SET is_locked = ? WHERE id = ?',
    [isLocked ? 1 : 0, threadId]
  );

  return result.affectedRows > 0;
}

/**
 * Increment thread view count
 */
export async function incrementThreadViews(threadId: number): Promise<void> {
  await db.query(
    'UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ?',
    [threadId]
  );
}

// ============================================================================
// Post Management
// ============================================================================

/**
 * Get posts for a thread (paginated)
 */
export async function getPostsByThread(
  threadId: number,
  accountName: string,
  page: number = 1,
  limit: number = 50,
  userPermissions?: UserPermissions
): Promise<{ posts: ForumPost[]; total: number }> {
  const offset = (page - 1) * limit;

  // Get total count (include deleted posts)
  const [countRows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) as total FROM forum_posts WHERE thread_id = ?',
    [threadId]
  );

  const total = countRows[0].total;

  // Get posts with character names, avatar URLs, and reactions (include deleted posts)
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      p.*,
      pc.char_name as author_character_name,
      up.avatar_url as author_avatar_url
    FROM forum_posts p
    LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
    LEFT JOIN user_profiles up ON p.author_account_name = up.account_name
    WHERE p.thread_id = ?
    ORDER BY p.created_at ASC
    LIMIT ? OFFSET ?`,
    [threadId, limit, offset]
  );

  // Get reactions for each post
  const posts: ForumPost[] = [];

  for (const post of rows) {
    const [reactionRows] = await db.query<RowDataPacket[]>(
      `SELECT
        emoji,
        COUNT(*) as count,
        MAX(CASE WHEN user_account_name = ? THEN 1 ELSE 0 END) as user_reacted
      FROM forum_reactions
      WHERE post_id = ?
      GROUP BY emoji`,
      [accountName, post.id]
    );

    // Fetch guild data if character exists
    let guildInfo = null;
    if (post.author_character_name) {
      guildInfo = await findCharacterGuild(post.author_character_name);
    }

    const postData: any = {
      ...(post as any),
      author: post.author_account_name, // Add alias for frontend compatibility
      character_name: post.author_character_name, // Add alias for frontend compatibility
      guild_name: guildInfo?.guildName || null,
      guild_id: guildInfo?.guildId || null,
      guild_rank_title: guildInfo?.rankTitle || null,
      character_title: null, // TODO: Implement god-set titles from player file
      reactions: reactionRows.map((r: RowDataPacket) => ({
        emoji: r.emoji,
        count: r.count,
        userReacted: r.user_reacted === 1 // Convert to camelCase for frontend
      }))
    };

    // Only include IP address for Overlords (immortal level 60+)
    if (!userPermissions || !userPermissions.immortalLevel || userPermissions.immortalLevel < 60) {
      delete postData.ip_address;
    }

    posts.push(postData as ForumPost);
  }

  return { posts, total };
}

/**
 * Get a single post by ID with all related data
 */
export async function getPostById(
  postId: number,
  accountName: string,
  userPermissions?: UserPermissions
): Promise<ForumPost | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
      p.*,
      pc.char_name as author_character_name,
      up.avatar_url as author_avatar_url
    FROM forum_posts p
    LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
    LEFT JOIN user_profiles up ON p.author_account_name = up.account_name
    WHERE p.id = ?`,
    [postId]
  );

  if (rows.length === 0) {
    return null;
  }

  const post = rows[0];

  // Get reactions
  const [reactionRows] = await db.query<RowDataPacket[]>(
    `SELECT
      emoji,
      COUNT(*) as count,
      MAX(CASE WHEN user_account_name = ? THEN 1 ELSE 0 END) as user_reacted
    FROM forum_reactions
    WHERE post_id = ?
    GROUP BY emoji`,
    [accountName, postId]
  );

  // Fetch guild data if character exists
  let guildInfo = null;
  if (post.author_character_name) {
    guildInfo = await findCharacterGuild(post.author_character_name);
  }

  const postData: any = {
    ...(post as any),
    author: post.author_account_name,
    character_name: post.author_character_name,
    guild_name: guildInfo?.guildName || null,
    guild_id: guildInfo?.guildId || null,
    guild_rank_title: guildInfo?.rankTitle || null,
    character_title: null,
    reactions: reactionRows.map((r: RowDataPacket) => ({
      emoji: r.emoji,
      count: r.count,
      userReacted: r.user_reacted === 1
    }))
  };

  // Only include IP address for Overlords (immortal level 60+)
  if (!userPermissions || !userPermissions.immortalLevel || userPermissions.immortalLevel < 60) {
    delete postData.ip_address;
  }

  return postData as ForumPost;
}

/**
 * Create new post (reply)
 */
export async function createPost(
  threadId: number,
  authorAccountName: string,
  authorCharacterPid: bigint | null,
  content: string,
  parentPostId: number | null = null,
  ipAddress: string | null = null
): Promise<number> {
  // Sanitize and process content first
  const processed = processForumContent(content);
  if (processed.error) {
    throw new Error(processed.error);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Get thread info for notifications
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT category_id FROM forum_threads WHERE id = ?',
      [threadId]
    );

    if (threads.length === 0) {
      throw new Error('Thread not found');
    }

    const categoryId = threads[0].category_id;

    // Insert post with sanitized content
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO forum_posts
       (thread_id, parent_post_id, author_account_name, author_character_pid, content, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [threadId, parentPostId, authorAccountName, authorCharacterPid, processed.content, ipAddress]
    );

    const postId = result.insertId;

    // Update thread's last_post_at and reply_count
    await connection.query(
      'UPDATE forum_threads SET last_post_at = NOW(), reply_count = reply_count + 1 WHERE id = ?',
      [threadId]
    );

    // Get character name for notifications
    let characterName: string | null = null;
    if (authorCharacterPid) {
      const [chars] = await connection.query<RowDataPacket[]>(
        'SELECT COALESCE(fl.char_name, pd.name) as name FROM player_data pd LEFT JOIN frag_leaderboard fl ON pd.pid = fl.pid WHERE pd.pid = ?',
        [authorCharacterPid]
      );
      if (chars.length > 0) {
        characterName = chars[0].name;
      }
    }

    await connection.commit();

    // Link any images in the post content (after commit, non-blocking)
    const imageUrls = extractImageUrls(processed.content || '');
    if (imageUrls.length > 0) {
      linkImagesToPost(postId, imageUrls, authorAccountName).catch(err => {
        logger.error('Failed to link images to post:', err);
      });
    }

    // Create mention notifications (after commit, non-blocking)
    if (processed.mentions.length > 0) {
      createMentions(postId, processed.mentions, authorAccountName).catch(err => {
        logger.error('Failed to create mentions:', err);
      });
    }

    // Create notifications (after commit, non-blocking)
    // We don't await this to avoid slowing down post creation
    createPostNotifications(postId, threadId, categoryId, authorAccountName, characterName).catch(err => {
      logger.error('Failed to create post notifications:', err);
    });

    return postId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update post (author only, within 15 minutes)
 */
export async function updatePost(
  postId: number,
  content: string
): Promise<boolean> {
  // Sanitize and process content
  const processed = processForumContent(content);
  if (processed.error) {
    throw new Error(processed.error);
  }

  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_posts SET content = ?, edited_at = NOW() WHERE id = ?',
    [processed.content, postId]
  );

  return result.affectedRows > 0;
}

/**
 * Soft delete post
 */
export async function deletePost(postId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE forum_posts SET is_deleted = 1 WHERE id = ?',
    [postId]
  );

  // Decrement thread reply count
  const [postRows] = await db.query<RowDataPacket[]>(
    'SELECT thread_id FROM forum_posts WHERE id = ?',
    [postId]
  );

  if (postRows.length > 0) {
    await db.query(
      'UPDATE forum_threads SET reply_count = GREATEST(0, reply_count - 1) WHERE id = ?',
      [postRows[0].thread_id]
    );
  }

  return result.affectedRows > 0;
}

/**
 * Check if user can edit post (author only, within 15 minutes)
 */
export async function canEditPost(postId: number, accountName: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT author_account_name
    FROM forum_posts
    WHERE id = ?`,
    [postId]
  );

  if (rows.length === 0) return false;

  const post = rows[0];
  // Authors can always edit their own posts (no time limit)
  return post.author_account_name === accountName;
}

// ============================================================================
// Reactions
// ============================================================================

/**
 * Add emoji reaction to post or thread
 */
export async function addReaction(
  postId: number | null,
  accountName: string,
  emoji: string,
  threadId?: number
): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO forum_reactions (post_id, thread_id, user_account_name, emoji)
       VALUES (?, ?, ?, ?)`,
      [postId, threadId || null, accountName, emoji]
    );
    return true;
  } catch (error) {
    // Duplicate key error (user already reacted with this emoji)
    if (isErrorWithCode(error) && error.code === 'ER_DUP_ENTRY') {
      return false;
    }
    throw error;
  }
}

/**
 * Remove emoji reaction from post or thread
 */
export async function removeReaction(
  postId: number | null,
  accountName: string,
  emoji: string,
  threadId?: number
): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM forum_reactions WHERE post_id <=> ? AND thread_id <=> ? AND user_account_name = ? AND emoji = ?',
    [postId, threadId || null, accountName, emoji]
  );

  return result.affectedRows > 0;
}

// ============================================================================
// Notifications (uses unified notification service)
// ============================================================================

/**
 * Create notification for thread subscribers (on new reply)
 */
export async function notifyThreadSubscribers(
  threadId: number,
  postId: number,
  triggeredByAccountName: string
): Promise<void> {
  // Get thread title for the notification message
  const [threads] = await db.query<RowDataPacket[]>(
    'SELECT title FROM forum_threads WHERE id = ?',
    [threadId]
  );
  const threadTitle = threads[0]?.title || 'a thread';

  // Get all subscribers (excluding the person who posted)
  const [subscribers] = await db.query<RowDataPacket[]>(
    `SELECT user_account_name
     FROM forum_subscriptions
     WHERE thread_id = ? AND notify_on_reply = 1 AND user_account_name != ?`,
    [threadId, triggeredByAccountName]
  );

  // Create notifications using unified service
  for (const sub of subscribers) {
    await notificationService.createNotification({
      accountName: sub.user_account_name,
      source: 'forum',
      notificationType: 'reply',
      message: `New reply in "${threadTitle}"`,
      link: `/forum/thread/${threadId}#post-${postId}`,
      triggeredByAccount: triggeredByAccountName,
      data: { threadId, postId },
    });

    // send push notification
    sendForumReplyNotification(sub.user_account_name, {
      threadTitle,
      replier: triggeredByAccountName,
      threadId,
    }).catch(() => {}); // fire and forget
  }
}

// ============================================================================
// Search Functions
// ============================================================================

export interface SearchFilters {
  query: string;
  scope?: 'titles' | 'content' | 'both';
  author?: string;
  categoryId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  id: number;
  type: 'thread' | 'post';
  thread_id: number;
  thread_title: string;
  category_id: number;
  category_name: string;
  author: string;
  character_name: string | null;
  content: string;
  created_at: Date;
  relevance_score: number;
}

/**
 * Search forum threads and posts using FULLTEXT search
 */
export async function searchForum(
  filters: SearchFilters,
  permissions: UserPermissions,
  page: number = 1,
  limit: number = 50
): Promise<{ results: SearchResult[]; total: number }> {
  const offset = (page - 1) * limit;
  const { query, scope = 'both', author, categoryId, dateFrom, dateTo } = filters;

  // Build WHERE clauses for filters
  const whereClauses: string[] = [];
  const queryParams: any[] = [];

  // Get accessible categories
  const accessibleCategories = await getAccessibleCategoryIds(permissions);
  if (accessibleCategories.length === 0) {
    return { results: [], total: 0 };
  }

  whereClauses.push(`c.id IN (${accessibleCategories.join(',')})`);

  // Author filter
  if (author) {
    whereClauses.push('(t.author_account_name = ? OR p.author_account_name = ?)');
    queryParams.push(author, author);
  }

  // Category filter
  if (categoryId) {
    whereClauses.push('c.id = ?');
    queryParams.push(categoryId);
  }

  // Date range filters
  if (dateFrom) {
    whereClauses.push('(t.created_at >= ? OR p.created_at >= ?)');
    queryParams.push(dateFrom, dateFrom);
  }
  if (dateTo) {
    whereClauses.push('(t.created_at <= ? OR p.created_at <= ?)');
    queryParams.push(dateTo, dateTo);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let searchQuery = '';

  if (scope === 'titles' || scope === 'both') {
    // Search in thread titles and content
    searchQuery += `
      SELECT
        t.id,
        'thread' as type,
        t.id as thread_id,
        t.title as thread_title,
        t.category_id,
        c.name as category_name,
        t.author_account_name as author,
        pc.char_name as character_name,
        t.content,
        t.created_at,
        MATCH(t.title, t.content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance_score
      FROM forum_threads t
      JOIN forum_categories c ON t.category_id = c.id
      LEFT JOIN frag_leaderboard pc ON t.author_character_pid = pc.pid
      ${whereClause}
        AND t.is_deleted = 0
        AND MATCH(t.title, t.content) AGAINST(? IN NATURAL LANGUAGE MODE)
    `;
    queryParams.unshift(query, query);
  }

  if (scope === 'content' || scope === 'both') {
    // Search in post content
    if (searchQuery) searchQuery += ' UNION ALL ';

    searchQuery += `
      SELECT
        p.id,
        'post' as type,
        p.thread_id,
        t.title as thread_title,
        t.category_id,
        c.name as category_name,
        p.author_account_name as author,
        pc.char_name as character_name,
        p.content,
        p.created_at,
        MATCH(p.content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance_score
      FROM forum_posts p
      JOIN forum_threads t ON p.thread_id = t.id
      JOIN forum_categories c ON t.category_id = c.id
      LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
      ${whereClause}
        AND p.is_deleted = 0
        AND t.is_deleted = 0
        AND MATCH(p.content) AGAINST(? IN NATURAL LANGUAGE MODE)
    `;
    queryParams.push(query, query);
  }

  // Add ordering and pagination
  searchQuery += `
    ORDER BY relevance_score DESC
    LIMIT ? OFFSET ?
  `;
  queryParams.push(limit, offset);

  // Get results
  const [rows] = await db.query<RowDataPacket[]>(searchQuery, queryParams);

  // Get total count (simplified - just count returned results for now)
  const total = rows.length;

  return {
    results: rows as SearchResult[],
    total
  };
}

/**
 * Helper: Get accessible category IDs based on permissions
 */
async function getAccessibleCategoryIds(permissions: UserPermissions): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM forum_categories
     WHERE access_type = 'public'
        OR (access_type = 'authenticated')
        OR (access_type = 'guild' AND ? > 0)
        OR (access_type = 'immortal' AND ?)
        OR (access_type = 'god' AND ?)`,
    [
      permissions.guilds.length,
      permissions.canAccessImmortalForum,
      permissions.canAccessGodForum,
    ]
  );

  return rows.map((r) => r.id);
}

// ============================================================================
// Moderation Functions
// ============================================================================

export interface ModerationLogEntry {
  id: number;
  moderator_account: string;
  action_type: string;
  target_type: 'post' | 'thread';
  target_id: number;
  category_id: number | null;
  new_category_id: number | null;
  reason: string | null;
  original_content: string | null;
  created_at: Date;
}

/**
 * Soft-delete a post (moderator action)
 */
export async function moderatorDeletePost(
  postId: number,
  moderatorAccount: string,
  reason: string | null = null
): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get post content before deletion
    const [posts] = await connection.query<RowDataPacket[]>(
      'SELECT content, thread_id FROM forum_posts WHERE id = ? AND is_deleted = 0',
      [postId]
    );

    if (posts.length === 0) {
      throw new Error('Post not found or already deleted');
    }

    const post = posts[0];

    // Soft delete the post
    await connection.query(
      `UPDATE forum_posts
       SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
       WHERE id = ?`,
      [moderatorAccount, postId]
    );

    // Log the moderation action
    await connection.query(
      `INSERT INTO forum_moderation_log
       (moderator_account, action_type, target_type, target_id, reason, original_content)
       VALUES (?, 'delete_post', 'post', ?, ?, ?)`,
      [moderatorAccount, postId, reason, post.content]
    );

    // Update thread reply count
    await connection.query(
      'UPDATE forum_threads SET reply_count = reply_count - 1 WHERE id = ?',
      [post.thread_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Restore a soft-deleted post
 */
export async function restorePost(
  postId: number,
  moderatorAccount: string
): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get the post
    const [posts] = await connection.query<RowDataPacket[]>(
      'SELECT thread_id FROM forum_posts WHERE id = ? AND is_deleted = 1',
      [postId]
    );

    if (posts.length === 0) {
      throw new Error('Post not found or not deleted');
    }

    const post = posts[0];

    // Restore the post
    await connection.query(
      `UPDATE forum_posts
       SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [postId]
    );

    // Log the moderation action
    await connection.query(
      `INSERT INTO forum_moderation_log
       (moderator_account, action_type, target_type, target_id)
       VALUES (?, 'restore_post', 'post', ?)`,
      [moderatorAccount, postId]
    );

    // Update thread reply count
    await connection.query(
      'UPDATE forum_threads SET reply_count = reply_count + 1 WHERE id = ?',
      [post.thread_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Soft-delete a thread (moderator action)
 */
export async function moderatorDeleteThread(
  threadId: number,
  moderatorAccount: string,
  reason: string | null = null
): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get thread info before deletion
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT title, content, category_id FROM forum_threads WHERE id = ? AND is_deleted = 0',
      [threadId]
    );

    if (threads.length === 0) {
      throw new Error('Thread not found or already deleted');
    }

    const thread = threads[0];

    // Soft delete the thread
    await connection.query(
      `UPDATE forum_threads
       SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
       WHERE id = ?`,
      [moderatorAccount, threadId]
    );

    // Log the moderation action
    await connection.query(
      `INSERT INTO forum_moderation_log
       (moderator_account, action_type, target_type, target_id, category_id, reason, original_content)
       VALUES (?, 'delete_thread', 'thread', ?, ?, ?, ?)`,
      [moderatorAccount, threadId, thread.category_id, reason, `${thread.title}\n\n${thread.content}`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Restore a soft-deleted thread
 */
export async function restoreThread(
  threadId: number,
  moderatorAccount: string
): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Check thread exists and is deleted
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT category_id FROM forum_threads WHERE id = ? AND is_deleted = 1',
      [threadId]
    );

    if (threads.length === 0) {
      throw new Error('Thread not found or not deleted');
    }

    const thread = threads[0];

    // Restore the thread
    await connection.query(
      `UPDATE forum_threads
       SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [threadId]
    );

    // Log the moderation action
    await connection.query(
      `INSERT INTO forum_moderation_log
       (moderator_account, action_type, target_type, target_id, category_id)
       VALUES (?, 'restore_thread', 'thread', ?, ?)`,
      [moderatorAccount, threadId, thread.category_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Move a thread to a different category
 */
export async function moveThread(
  threadId: number,
  newCategoryId: number,
  moderatorAccount: string,
  reason: string | null = null
): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get current category
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT category_id FROM forum_threads WHERE id = ? AND is_deleted = 0',
      [threadId]
    );

    if (threads.length === 0) {
      throw new Error('Thread not found or deleted');
    }

    const oldCategoryId = threads[0].category_id;

    if (oldCategoryId === newCategoryId) {
      throw new Error('Thread is already in this category');
    }

    // Check new category exists
    const [categories] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_categories WHERE id = ?',
      [newCategoryId]
    );

    if (categories.length === 0) {
      throw new Error('Target category not found');
    }

    // Move the thread
    await connection.query(
      'UPDATE forum_threads SET category_id = ? WHERE id = ?',
      [newCategoryId, threadId]
    );

    // Log the moderation action
    await connection.query(
      `INSERT INTO forum_moderation_log
       (moderator_account, action_type, target_type, target_id, category_id, new_category_id, reason)
       VALUES (?, 'move_thread', 'thread', ?, ?, ?, ?)`,
      [moderatorAccount, threadId, oldCategoryId, newCategoryId, reason]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get moderation log (filtered by permissions)
 */
export async function getModerationLog(
  limit: number = 50,
  offset: number = 0,
  filters?: {
    moderator?: string;
    actionType?: string;
    categoryId?: number;
  }
): Promise<{ logs: ModerationLogEntry[]; total: number }> {
  let whereClause = '1=1';
  const queryParams: any[] = [];

  if (filters?.moderator) {
    whereClause += ' AND moderator_account = ?';
    queryParams.push(filters.moderator);
  }

  if (filters?.actionType) {
    whereClause += ' AND action_type = ?';
    queryParams.push(filters.actionType);
  }

  if (filters?.categoryId) {
    whereClause += ' AND (category_id = ? OR new_category_id = ?)';
    queryParams.push(filters.categoryId, filters.categoryId);
  }

  // Get logs
  const [logs] = await db.query<RowDataPacket[]>(
    `SELECT * FROM forum_moderation_log
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  // Get total count
  const [countResult] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM forum_moderation_log WHERE ${whereClause}`,
    queryParams
  );

  return {
    logs: logs as ModerationLogEntry[],
    total: countResult[0].total
  };
}

// ============================================
// SUBSCRIPTION FUNCTIONS
// ============================================

/**
 * Subscribe to a thread
 */
export async function subscribeToThread(
  accountName: string,
  threadId: number,
  notificationPreference: 'all' | 'mentions' | 'none' = 'all'
): Promise<void> {
  const connection = await db.getConnection();
  try {
    // Check if thread exists
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_threads WHERE id = ? AND is_deleted = 0',
      [threadId]
    );

    if (threads.length === 0) {
      throw new Error('Thread not found');
    }

    // Insert or update subscription
    await connection.query(
      `INSERT INTO forum_subscriptions (user_account_name, subscription_type, thread_id, notification_preference)
       VALUES (?, 'thread', ?, ?)
       ON DUPLICATE KEY UPDATE notification_preference = VALUES(notification_preference)`,
      [accountName, threadId, notificationPreference]
    );
  } finally {
    connection.release();
  }
}

/**
 * Subscribe to a category
 */
export async function subscribeToCategory(
  accountName: string,
  categoryId: number,
  notificationPreference: 'all' | 'mentions' | 'none' = 'all'
): Promise<void> {
  const connection = await db.getConnection();
  try {
    // Check if category exists
    const [categories] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_categories WHERE id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      throw new Error('Category not found');
    }

    // Insert or update subscription
    await connection.query(
      `INSERT INTO forum_subscriptions (user_account_name, subscription_type, category_id, notification_preference)
       VALUES (?, 'category', ?, ?)
       ON DUPLICATE KEY UPDATE notification_preference = VALUES(notification_preference)`,
      [accountName, categoryId, notificationPreference]
    );
  } finally {
    connection.release();
  }
}

/**
 * Unsubscribe from a thread
 */
export async function unsubscribeFromThread(accountName: string, threadId: number): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.query(
      `DELETE FROM forum_subscriptions
       WHERE user_account_name = ? AND subscription_type = 'thread' AND thread_id = ?`,
      [accountName, threadId]
    );
  } finally {
    connection.release();
  }
}

/**
 * Unsubscribe from a category
 */
export async function unsubscribeFromCategory(accountName: string, categoryId: number): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.query(
      `DELETE FROM forum_subscriptions
       WHERE user_account_name = ? AND subscription_type = 'category' AND category_id = ?`,
      [accountName, categoryId]
    );
  } finally {
    connection.release();
  }
}

/**
 * Get user's subscriptions
 */
export async function getUserSubscriptions(accountName: string): Promise<{
  threads: any[];
  categories: any[];
}> {
  const connection = await db.getConnection();
  try {
    // Get thread subscriptions with thread details
    const [threadSubs] = await connection.query<RowDataPacket[]>(
      `SELECT
        s.id,
        s.account_name as accountName,
        s.subscription_type as subscriptionType,
        s.thread_id as threadId,
        s.notification_preference as notificationPreference,
        s.created_at as createdAt,
        t.title as threadTitle,
        t.category_id as categoryId,
        c.name as categoryName
       FROM forum_subscriptions s
       JOIN forum_threads t ON s.thread_id = t.id
       JOIN forum_categories c ON t.category_id = c.id
       WHERE s.user_account_name = ? AND s.subscription_type = 'thread'
       ORDER BY s.created_at DESC`,
      [accountName]
    );

    // Get category subscriptions with category details
    const [categorySubs] = await connection.query<RowDataPacket[]>(
      `SELECT
        s.id,
        s.user_account_name as accountName,
        s.subscription_type as subscriptionType,
        s.category_id as categoryId,
        s.notification_preference as notificationPreference,
        s.created_at as createdAt,
        c.name as categoryName
       FROM forum_subscriptions s
       JOIN forum_categories c ON s.category_id = c.id
       WHERE s.user_account_name = ? AND s.subscription_type = 'category'
       ORDER BY s.created_at DESC`,
      [accountName]
    );

    return {
      threads: threadSubs,
      categories: categorySubs
    };
  } finally {
    connection.release();
  }
}

/**
 * Check if user is subscribed to a thread
 */
export async function isSubscribedToThread(accountName: string, threadId: number): Promise<boolean> {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM forum_subscriptions
       WHERE user_account_name = ? AND subscription_type = 'thread' AND thread_id = ?`,
      [accountName, threadId]
    );
    return rows.length > 0;
  } finally {
    connection.release();
  }
}

/**
 * Check if user is subscribed to a category
 */
export async function isSubscribedToCategory(accountName: string, categoryId: number): Promise<boolean> {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM forum_subscriptions
       WHERE user_account_name = ? AND subscription_type = 'category' AND category_id = ?`,
      [accountName, categoryId]
    );
    return rows.length > 0;
  } finally {
    connection.release();
  }
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

/**
 * Create notifications for post creation
 * Notifies users subscribed to the thread or category
 */
export async function createPostNotifications(
  postId: number,
  threadId: number,
  categoryId: number,
  authorAccount: string,
  authorCharacter: string | null
): Promise<void> {
  const connection = await db.getConnection();
  try {
    // Get all users subscribed to this thread or category (excluding the author)
    const [subscribers] = await connection.query<RowDataPacket[]>(
      `SELECT DISTINCT
        s.user_account_name as account_name,
        s.notification_preference,
        s.subscription_type
       FROM forum_subscriptions s
       WHERE s.user_account_name != ?
       AND (
         (s.subscription_type = 'thread' AND s.thread_id = ?)
         OR (s.subscription_type = 'category' AND s.category_id = ?)
       )`,
      [authorAccount, threadId, categoryId]
    );

    if (subscribers.length === 0) {
      return;
    }

    // Get thread title for notification message
    const [threads] = await connection.query<RowDataPacket[]>(
      'SELECT title FROM forum_threads WHERE id = ?',
      [threadId]
    );

    if (threads.length === 0) {
      return;
    }

    const threadTitle = threads[0].title;
    const characterDisplay = authorCharacter || authorAccount;

    // Create notifications for each subscriber
    const notifications = subscribers
      .filter(sub => sub.notification_preference === 'all') // Only notify if preference is 'all'
      .map(sub => [
        sub.account_name,
        'new_post',
        threadId,
        postId,
        authorAccount,
        authorCharacter,
        `${characterDisplay} posted in "${threadTitle}"`
      ]);

    if (notifications.length > 0) {
      const notifRows = notifications.map(n => ['forum', ...n]);
      await connection.query(
        `INSERT INTO notifications
         (source, account_name, notification_type, thread_id, post_id, triggered_by_account, triggered_by_character, message)
         VALUES ?`,
        [notifRows]
      );
    }
  } finally {
    connection.release();
  }
}

/**
 * Get user's notifications (delegates to unified service)
 * @deprecated Use unifiedNotificationService directly
 */
export async function getUserNotifications(
  accountName: string,
  page: number = 1,
  limit: number = 50,
  unreadOnly: boolean = false
): Promise<{ notifications: any[]; total: number }> {
  const offset = (page - 1) * limit;
  return notificationService.getNotifications(accountName, { unreadOnly, limit, offset });
}

/**
 * Mark notification as read (delegates to unified service)
 * @deprecated Use unifiedNotificationService directly
 */
export async function markNotificationAsRead(notificationId: number, accountName: string): Promise<void> {
  await notificationService.markAsRead(notificationId, accountName);
}

/**
 * Mark all notifications as read (delegates to unified service)
 * @deprecated Use unifiedNotificationService directly
 */
export async function markAllNotificationsAsRead(accountName: string): Promise<void> {
  await notificationService.markAllAsRead(accountName);
}

/**
 * Get unread notification count (delegates to unified service)
 * @deprecated Use unifiedNotificationService directly
 */
export async function getUnreadNotificationCount(accountName: string): Promise<number> {
  return notificationService.getUnreadCount(accountName);
}

/**
 * Delete notification (delegates to unified service)
 * @deprecated Use unifiedNotificationService directly
 */
export async function deleteNotification(notificationId: number, accountName: string): Promise<void> {
  await notificationService.deleteNotification(notificationId, accountName);
}

// ============================================
// USER PROFILE FUNCTIONS
// ============================================

export interface UserProfile {
  accountName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  website: string | null;
  location: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface UserProfileStats {
  totalPosts: number;
  totalThreads: number;
  totalReactionsReceived: number;
  reputationScore: number;
  firstPostAt: Date | null;
  lastPostAt: Date | null;
  characterCount: number;
  totalFrags: number;
  totalDeaths: number;
  totalWealth: number;
}

export interface UserProfileWithStats extends UserProfile {
  stats: UserProfileStats;
}

/**
 * Get user profile with stats
 */
export async function getUserProfile(accountName: string): Promise<UserProfileWithStats | null> {
  const connection = await db.getConnection();
  try {
    // Get profile (may not exist yet - that's OK, we'll return defaults)
    const [profileRows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM user_profiles WHERE account_name = ?',
      [accountName]
    );

    const profile = profileRows[0] || {
      account_name: accountName,
      bio: null,
      avatar_url: null,
      banner_url: null,
      website: null,
      location: null,
      created_at: new Date(),
      last_seen_at: null
    };

    // Calculate post stats
    const [postStats] = await connection.query<RowDataPacket[]>(
      `SELECT
        COUNT(DISTINCT p.id) as total_posts,
        MIN(p.created_at) as first_post_at,
        MAX(p.created_at) as last_post_at
       FROM forum_posts p
       WHERE p.author_account_name = ? AND p.is_deleted = 0`,
      [accountName]
    );

    // Calculate thread count from forum_threads (threads user created)
    const [threadStats] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total_threads
       FROM forum_threads t
       WHERE t.author_account_name = ? AND t.is_deleted = 0`,
      [accountName]
    );

    const stats = {
      total_posts: postStats[0]?.total_posts || 0,
      total_threads: threadStats[0]?.total_threads || 0,
      first_post_at: postStats[0]?.first_post_at || null,
      last_post_at: postStats[0]?.last_post_at || null
    };

    // Get character totals
    const [charTotals] = await connection.query<RowDataPacket[]>(
      `SELECT
        COUNT(DISTINCT ac.pid) as character_count,
        COALESCE(SUM(FLOOR(COALESCE(fl.total_frags, 0) / 100)), 0) as total_frags,
        COALESCE(SUM(pc.money + pc.balance), 0) as total_wealth
       FROM account_characters ac
       LEFT JOIN frag_leaderboard pc ON ac.pid = pc.pid
       LEFT JOIN frag_leaderboard fl ON ac.pid = fl.pid AND fl.deleted_at IS NULL
       WHERE ac.account_name = ? AND ac.deleted_at IS NULL`,
      [accountName]
    );

    // Get total deaths across all characters
    const [deathTotals] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total_deaths
       FROM pkill_info pi
       JOIN account_characters ac ON pi.pid = ac.pid
       WHERE ac.account_name = ? AND ac.deleted_at IS NULL AND pi.pk_type = 'VICTIM'`,
      [accountName]
    );

    const charStats = charTotals[0] || { character_count: 0, total_frags: 0, total_wealth: 0 };
    const deathStats = deathTotals[0] || { total_deaths: 0 };

    return {
      accountName: profile.account_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      bannerUrl: profile.banner_url,
      website: profile.website,
      location: profile.location,
      createdAt: profile.created_at,
      lastSeenAt: profile.last_seen_at,
      stats: {
        totalPosts: stats.total_posts,
        totalThreads: stats.total_threads,
        totalReactionsReceived: 0, // Will implement when reactions are tracked
        reputationScore: 0, // Will implement reputation system later
        firstPostAt: stats.first_post_at,
        lastPostAt: stats.last_post_at,
        characterCount: Number(charStats.character_count) || 0,
        totalFrags: Number(charStats.total_frags) || 0,
        totalDeaths: Number(deathStats.total_deaths) || 0,
        totalWealth: Number(charStats.total_wealth) || 0
      }
    };
  } finally {
    connection.release();
  }
}

/**
 * Update user profile (upsert - creates if doesn't exist)
 */
export async function updateUserProfile(
  accountName: string,
  updates: {
    bio?: string;
    website?: string;
    location?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
  }
): Promise<void> {
  const connection = await db.getConnection();
  try {
    const updateClauses: string[] = [];
    const insertColumns: string[] = ['account_name'];
    const insertPlaceholders: string[] = ['?'];
    const insertValues: any[] = [accountName];

    if (updates.bio !== undefined) {
      insertColumns.push('bio');
      insertPlaceholders.push('?');
      insertValues.push(updates.bio);
      updateClauses.push('bio = VALUES(bio)');
    }
    if (updates.website !== undefined) {
      insertColumns.push('website');
      insertPlaceholders.push('?');
      insertValues.push(updates.website);
      updateClauses.push('website = VALUES(website)');
    }
    if (updates.location !== undefined) {
      insertColumns.push('location');
      insertPlaceholders.push('?');
      insertValues.push(updates.location);
      updateClauses.push('location = VALUES(location)');
    }
    if (updates.avatarUrl !== undefined) {
      insertColumns.push('avatar_url');
      insertPlaceholders.push('?');
      insertValues.push(updates.avatarUrl);
      updateClauses.push('avatar_url = VALUES(avatar_url)');
    }
    if (updates.bannerUrl !== undefined) {
      insertColumns.push('banner_url');
      insertPlaceholders.push('?');
      insertValues.push(updates.bannerUrl);
      updateClauses.push('banner_url = VALUES(banner_url)');
    }

    if (updateClauses.length === 0) return;

    await connection.query(
      `INSERT INTO user_profiles (${insertColumns.join(', ')})
       VALUES (${insertPlaceholders.join(', ')})
       ON DUPLICATE KEY UPDATE ${updateClauses.join(', ')}`,
      insertValues
    );
  } finally {
    connection.release();
  }
}

/**
 * Get user's posts with pagination
 */
export async function getUserPosts(
  accountName: string,
  page: number = 1,
  limit: number = 50
): Promise<{ posts: any[]; total: number }> {
  const connection = await db.getConnection();
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM forum_posts p
       WHERE p.author_account_name = ? AND p.is_deleted = 0`,
      [accountName]
    );

    const total = countRows[0].total;

    // Get posts with thread info
    const [posts] = await connection.query<RowDataPacket[]>(
      `SELECT
        p.*,
        t.id as thread_id,
        t.title as thread_title,
        t.category_id,
        c.name as category_name,
        pc.char_name as character_name
       FROM forum_posts p
       JOIN forum_threads t ON p.thread_id = t.id
       JOIN forum_categories c ON t.category_id = c.id
       LEFT JOIN frag_leaderboard pc ON p.author_character_pid = pc.pid
       WHERE p.author_account_name = ? AND p.is_deleted = 0 AND t.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [accountName, limit, offset]
    );

    return { posts, total };
  } finally {
    connection.release();
  }
}

/**
 * Get user's threads with pagination
 */
export async function getUserThreads(
  accountName: string,
  page: number = 1,
  limit: number = 50
): Promise<{ threads: any[]; total: number }> {
  const connection = await db.getConnection();
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM forum_threads t
       WHERE t.author_account_name = ? AND t.is_deleted = 0`,
      [accountName]
    );

    const total = countRows[0].total;

    // Get threads
    const [threads] = await connection.query<RowDataPacket[]>(
      `SELECT
        t.*,
        c.name as category_name,
        pc.char_name as character_name
       FROM forum_threads t
       JOIN forum_categories c ON t.category_id = c.id
       LEFT JOIN frag_leaderboard pc ON t.author_character_pid = pc.pid
       WHERE t.author_account_name = ? AND t.is_deleted = 0
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [accountName, limit, offset]
    );

    return { threads, total };
  } finally {
    connection.release();
  }
}

/**
 * Update user stats (called after post/thread actions)
 */
export async function updateUserStats(accountName: string): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.query(
      `INSERT INTO user_profile_stats (account_name, total_posts, total_threads, first_post_at, last_post_at)
       SELECT
         ? as account_name,
         (SELECT COUNT(*) FROM forum_posts WHERE author_account_name = ? AND is_deleted = 0) as total_posts,
         (SELECT COUNT(*) FROM forum_threads WHERE author_account_name = ? AND is_deleted = 0) as total_threads,
         (SELECT MIN(created_at) FROM (
           SELECT created_at FROM forum_posts WHERE author_account_name = ? AND is_deleted = 0
           UNION
           SELECT created_at FROM forum_threads WHERE author_account_name = ? AND is_deleted = 0
         ) combined) as first_post_at,
         (SELECT MAX(created_at) FROM (
           SELECT created_at FROM forum_posts WHERE author_account_name = ? AND is_deleted = 0
           UNION
           SELECT created_at FROM forum_threads WHERE author_account_name = ? AND is_deleted = 0
         ) combined) as last_post_at
       ON DUPLICATE KEY UPDATE
         total_posts = VALUES(total_posts),
         total_threads = VALUES(total_threads),
         first_post_at = VALUES(first_post_at),
         last_post_at = VALUES(last_post_at)`,
      [accountName, accountName, accountName, accountName, accountName, accountName, accountName]
    );
  } finally {
    connection.release();
  }
}

// ============================================
// MENTION FUNCTIONS
// ============================================

/**
 * Extract @username mentions from content
 */
export async function extractMentions(content: string): Promise<string[]> {
  // Match @username pattern (letters, numbers, underscore, hyphen)
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const matches = content.matchAll(mentionRegex);
  const usernames = new Set<string>();

  for (const match of matches) {
    usernames.add(match[1].toLowerCase());
  }

  if (usernames.size === 0) {
    return [];
  }

  // Verify accounts exist by checking MUD account files
  const { accountExists } = await import('./mudAccountParser.js');
  const validAccounts: string[] = [];

  for (const username of usernames) {
    if (await accountExists(username)) {
      validAccounts.push(username);
    }
  }

  return validAccounts;
}

/**
 * Create mentions for a post
 */
export async function createMentions(
  postId: number,
  mentionedAccounts: string[],
  mentionedBy: string
): Promise<void> {
  if (mentionedAccounts.length === 0) return;

  const connection = await db.getConnection();
  try {
    // Remove self-mentions
    const filteredAccounts = mentionedAccounts.filter(acc => acc !== mentionedBy);
    if (filteredAccounts.length === 0) return;

    // Insert mentions
    const values = filteredAccounts.map(acc => [postId, acc, mentionedBy]);
    await connection.query(
      'INSERT INTO forum_mentions (post_id, mentioned_account_name, mentioned_by_account_name) VALUES ?',
      [values]
    );

    // Create notifications for mentioned users
    // Get post and thread info
    const [posts] = await connection.query<RowDataPacket[]>(
      `SELECT p.thread_id, p.author_character_pid, t.title as thread_title
       FROM forum_posts p
       JOIN forum_threads t ON p.thread_id = t.id
       WHERE p.id = ?`,
      [postId]
    );

    if (posts.length === 0) return;

    const post = posts[0];
    const threadId = post.thread_id;
    const threadTitle = post.thread_title;

    // Get mentioner's character name if available
    let characterName: string | null = null;
    if (post.author_character_pid) {
      const [chars] = await connection.query<RowDataPacket[]>(
        'SELECT COALESCE(fl.char_name, pd.name) as name FROM player_data pd LEFT JOIN frag_leaderboard fl ON pd.pid = fl.pid WHERE pd.pid = ?',
        [post.author_character_pid]
      );
      if (chars.length > 0) {
        characterName = chars[0].name;
      }
    }

    const displayName = characterName || mentionedBy;

    // Create notifications for each mentioned user using unified service
    for (const accountName of filteredAccounts) {
      await notificationService.createNotification({
        accountName,
        source: 'forum',
        notificationType: 'mention',
        message: `${displayName} mentioned you in "${threadTitle}"`,
        link: `/forum/thread/${threadId}#post-${postId}`,
        triggeredByAccount: mentionedBy,
        triggeredByCharacter: characterName,
        data: { threadId, postId },
      });
    }
  } finally {
    connection.release();
  }
}

// Re-export searchAccounts from accountService for convenience
export { searchAccounts } from './accountService.js';

/**
 * Get character profile by character name
 */
export async function getCharacterProfile(characterName: string): Promise<any | null> {
  const connection = await db.getConnection();
  try {
    // Get web settings to check if we should respect webinfo_toggle
    const webSettings = await getWebSettings();
    const respectWebinfo = webSettings.respectWebinfoToggle;

    // webinfo is stored as bit 28 (134217728) in act2 column
    const PLR2_WEBINFO = 134217728;

    // Get character data from player_data with optional frag_leaderboard for race/class
    const [characters] = await connection.query<RowDataPacket[]>(
      `SELECT pd.pid, pd.name, COALESCE(fl.race, '') as race, COALESCE(fl.class, '') as classname, pd.spec,
              COALESCE(a.name, '') as guild, pd.racewar, pd.level,
              pd.copper + pd.silver * 10 + pd.gold * 100 + pd.platinum * 1000 as money,
              pd.bank_copper + pd.bank_silver * 10 + pd.bank_gold * 100 + pd.bank_platinum * 1000 as balance,
              pd.played_time as playtime, pd.epics, pd.active,
              (pd.act2 & ${PLR2_WEBINFO}) != 0 as webinfo_enabled
       FROM player_data pd
       LEFT JOIN frag_leaderboard fl ON pd.pid = fl.pid
       LEFT JOIN associations a ON pd.assoc_id = a.id
       WHERE pd.name = ?`,
      [characterName]
    );

    if (characters.length === 0) {
      return null;
    }

    const character = characters[0];
    const webInfoEnabled = Boolean(character.webinfo_enabled);

    // If respectWebinfoToggle is enabled AND player's webinfo is disabled, return limited profile
    if (respectWebinfo && !webInfoEnabled) {
      return {
        pid: character.pid,
        name: character.name,
        race: character.race,
        class: character.classname,
        spec: character.spec,
        guild: character.guild,
        racewar: character.racewar,
        level: character.level,
        active: character.active === 1,
        webInfoEnabled: false,
        // hide sensitive/extended info
        money: null,
        balance: null,
        playtime: null,
        epics: null,
        guildInfo: null,
        stats: null,
      };
    }

    // Get character's forum post count
    const [postCountRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as post_count
       FROM forum_posts
       WHERE author_character_pid = ? AND is_deleted = 0`,
      [character.pid]
    );

    // Get character's thread count
    const [threadCountRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as thread_count
       FROM forum_threads
       WHERE author_character_pid = ? AND is_deleted = 0`,
      [character.pid]
    );

    // Get PvP stats (kills and deaths)
    const [killsRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as kills
       FROM pkill_info
       WHERE pid = ? AND pk_type IN ('KILLER', 'KILLER-GROUP')`,
      [character.pid]
    );

    const [deathsRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as deaths
       FROM pkill_info
       WHERE pid = ? AND pk_type = 'VICTIM'`,
      [character.pid]
    );

    // Try to get guild info if character is in a guild
    let guildInfo = null;
    if (character.guild) {
      const { findCharacterGuild } = await import('./mudGuildParser.js');
      guildInfo = await findCharacterGuild(character.name);
    }

    return {
      pid: character.pid,
      name: character.name,
      race: character.race,
      class: character.classname,
      spec: character.spec,
      guild: character.guild,
      guildInfo: guildInfo, // { guildId, guildName, rankTitle, rankNumber }
      racewar: character.racewar,
      level: character.level,
      money: character.money,
      balance: character.balance,
      playtime: character.playtime,
      epics: character.epics,
      active: character.active === 1,
      webInfoEnabled: true,
      stats: {
        forumPosts: postCountRows[0].post_count,
        forumThreads: threadCountRows[0].thread_count,
        pvpKills: killsRows[0].kills,
        pvpDeaths: deathsRows[0].deaths,
      }
    };
  } finally {
    connection.release();
  }
}

/**
 * Get character's recent forum posts
 */
export async function getCharacterPosts(characterName: string, page: number = 1, limit: number = 20): Promise<any> {
  const connection = await db.getConnection();
  try {
    // First get the character's PID
    const [characters] = await connection.query<RowDataPacket[]>(
      'SELECT pid FROM player_data WHERE name = ?',
      [characterName]
    );

    if (characters.length === 0) {
      return { posts: [], total: 0, page, limit };
    }

    const pid = characters[0].pid;
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM forum_posts
       WHERE author_character_pid = ? AND is_deleted = 0`,
      [pid]
    );

    // Get posts with thread info
    const [posts] = await connection.query<RowDataPacket[]>(
      `SELECT
         p.id, p.thread_id, p.content, p.created_at, p.edited_at,
         t.title as thread_title, t.category_id,
         c.name as category_name
       FROM forum_posts p
       JOIN forum_threads t ON p.thread_id = t.id
       JOIN forum_categories c ON t.category_id = c.id
       WHERE p.author_character_pid = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [pid, limit, offset]
    );

    return {
      posts: posts.map((p: any) => ({
        id: p.id,
        threadId: p.thread_id,
        threadTitle: p.thread_title,
        categoryId: p.category_id,
        categoryName: p.category_name,
        content: p.content.substring(0, 200) + (p.content.length > 200 ? '...' : ''), // Truncate
        createdAt: p.created_at,
        editedAt: p.edited_at,
      })),
      total: countRows[0].total,
      page,
      limit
    };
  } finally {
    connection.release();
  }
}

/**
 * Get character's recent PvP events
 */
export async function getCharacterPvPEvents(characterName: string, page: number = 1, limit: number = 20): Promise<any> {
  const connection = await db.getConnection();
  try {
    // First get the character's PID
    const [characters] = await connection.query<RowDataPacket[]>(
      'SELECT pid FROM player_data WHERE name = ?',
      [characterName]
    );

    if (characters.length === 0) {
      return { events: [], total: 0, page, limit };
    }

    const pid = characters[0].pid;
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT event_id) as total
       FROM pkill_info
       WHERE pid = ?`,
      [pid]
    );

    // Get PvP events
    const [events] = await connection.query<RowDataPacket[]>(
      `SELECT
         e.id as event_id,
         e.stamp as event_date,
         e.room_name as location,
         pi.pk_type,
         pi.player_description,
         pi.level,
         pi.inroom,
         pi.leader
       FROM pkill_info pi
       JOIN pkill_event e ON pi.event_id = e.id
       WHERE pi.pid = ?
       ORDER BY e.stamp DESC
       LIMIT ? OFFSET ?`,
      [pid, limit, offset]
    );

    return {
      events: events.map((e: any) => ({
        eventId: e.event_id,
        date: e.event_date,
        location: e.location,
        role: e.pk_type, // 'KILLER', 'VICTIM', 'KILLER-GROUP', 'VICTIM-GROUP'
        description: e.player_description,
        level: e.level,
        inRoom: e.inroom === 1,
        isLeader: e.leader === 1,
      })),
      total: countRows[0].total,
      page,
      limit
    };
  } finally {
    connection.release();
  }
}

/**
 * Get guild profile by guild name
 */
export async function getGuildProfile(guildNameOrSlug: string): Promise<any | null> {
  const connection = await db.getConnection();
  try {
    // Import slug function
    const { slugify } = await import('../utils/stringUtils.js');

    // Get all guilds via associations table
    const [allGuildRows] = await connection.query<RowDataPacket[]>(
      `SELECT DISTINCT a.name as guild
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       WHERE a.name IS NOT NULL AND a.name != ''`
    );

    // Find the guild that matches the slug
    const matchingDbGuild = allGuildRows.find((row: any) =>
      slugify(row.guild) === slugify(guildNameOrSlug)
    );

    if (!matchingDbGuild) {
      return null;
    }

    // Use the actual guild name from the database (with ANSI codes) for subsequent queries
    const actualGuildName = matchingDbGuild.guild;

    // Get all guild files and find matching one
    const { getAllGuilds, parseGuildFile } = await import('./mudGuildParser.js');
    const allGuilds = await getAllGuilds();

    // Find guild by slug match
    const matchingGuild = allGuilds.find(
      g => slugify(g.name) === slugify(actualGuildName)
    );

    if (!matchingGuild) {
      return null;
    }

    // Parse full guild data
    const guildData = await parseGuildFile(matchingGuild.id);
    if (!guildData) {
      return null;
    }

    // Get member count from player_data via associations table
    const [memberCountRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as member_count
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       WHERE a.name = ?`,
      [actualGuildName]
    );

    // Get forum stats (posts/threads by guild members)
    const [forumStatsRows] = await connection.query<RowDataPacket[]>(
      `SELECT
         COUNT(DISTINCT p.id) as post_count,
         COUNT(DISTINCT t.id) as thread_count
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       LEFT JOIN forum_posts p ON pd.pid = p.author_character_pid AND p.is_deleted = 0
       LEFT JOIN forum_threads t ON pd.pid = t.author_character_pid AND t.is_deleted = 0
       WHERE a.name = ?`,
      [actualGuildName]
    );

    // Get PvP stats for guild
    const [pvpStatsRows] = await connection.query<RowDataPacket[]>(
      `SELECT
         COUNT(CASE WHEN pi.pk_type IN ('KILLER', 'KILLER-GROUP') THEN 1 END) as kills,
         COUNT(CASE WHEN pi.pk_type = 'VICTIM' THEN 1 END) as deaths
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       JOIN pkill_info pi ON pd.pid = pi.pid
       WHERE a.name = ?`,
      [actualGuildName]
    );

    // Get active member list with character data
    const [activeMembers] = await connection.query<RowDataPacket[]>(
      `SELECT pd.pid, pd.name, pd.level, COALESCE(fl.race, '') as race, COALESCE(fl.class, '') as classname, pd.active
       FROM player_data pd
       JOIN associations a ON pd.assoc_id = a.id
       LEFT JOIN frag_leaderboard fl ON pd.pid = fl.pid
       WHERE a.name = ?
       ORDER BY pd.level DESC, pd.name ASC`,
      [actualGuildName]
    );

    // Enhance members with guild rank information
    const enhancedMembers = activeMembers.map((member: any) => {
      const guildMember = guildData.members.find(
        m => m.name.toLowerCase() === member.name.toLowerCase()
      );

      let rankTitle = 'Member';
      let rankNumber = 2;

      if (guildMember) {
        // Extract rank from member.rank using bit masking
        const A_RK_MASK = 0x1C;
        const rankBits = guildMember.rank & A_RK_MASK;
        rankNumber = rankBits >> 2;

        const rankTitles = [
          guildData.rankTitles.enemy,
          guildData.rankTitles.onParole,
          guildData.rankTitles.member,
          guildData.rankTitles.senior,
          guildData.rankTitles.officer,
          guildData.rankTitles.deputy,
          guildData.rankTitles.leader,
          guildData.rankTitles.king,
        ];
        rankTitle = rankTitles[rankNumber] || guildData.rankTitles.member;
      }

      return {
        pid: member.pid,
        name: member.name,
        level: member.level,
        race: member.race,
        class: member.classname,
        active: member.active === 1,
        rankTitle,
        rankNumber,
        bits: guildMember?.bits || 0,
        debt: guildMember?.debt || 0,
      };
    });

    return {
      id: guildData.guildId,
      name: guildData.name, // With ANSI codes
      racewar: guildData.racewar,
      frags: guildData.frags,
      rankTitles: guildData.rankTitles,
      stats: {
        totalMembers: memberCountRows[0].member_count,
        forumPosts: forumStatsRows[0].post_count || 0,
        forumThreads: forumStatsRows[0].thread_count || 0,
        pvpKills: pvpStatsRows[0].kills || 0,
        pvpDeaths: pvpStatsRows[0].deaths || 0,
      },
      members: enhancedMembers,
    };
  } finally {
    connection.release();
  }
}

/**
 * Get guild's recent forum activity
 */
export async function getGuildForumActivity(guildName: string, page: number = 1, limit: number = 20): Promise<any> {
  const connection = await db.getConnection();
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM forum_posts p
       JOIN player_data pd ON p.author_character_pid = pd.pid
       JOIN associations a ON pd.assoc_id = a.id
       WHERE a.name = ? AND p.is_deleted = 0`,
      [guildName]
    );

    // Get posts with thread and author info
    const [posts] = await connection.query<RowDataPacket[]>(
      `SELECT
         p.id, p.thread_id, p.content, p.created_at,
         pd.name as character_name,
         t.title as thread_title, t.category_id,
         c.name as category_name
       FROM forum_posts p
       JOIN player_data pd ON p.author_character_pid = pd.pid
       JOIN associations a ON pd.assoc_id = a.id
       JOIN forum_threads t ON p.thread_id = t.id
       JOIN forum_categories c ON t.category_id = c.id
       WHERE a.name = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [guildName, limit, offset]
    );

    return {
      posts: posts.map((p: any) => ({
        id: p.id,
        threadId: p.thread_id,
        threadTitle: p.thread_title,
        categoryId: p.category_id,
        categoryName: p.category_name,
        characterName: p.character_name,
        content: p.content.substring(0, 200) + (p.content.length > 200 ? '...' : ''),
        createdAt: p.created_at,
      })),
      total: countRows[0].total,
      page,
      limit
    };
  } finally {
    connection.release();
  }
}

/**
 * Get latest threads across all accessible categories
 * Returns most recently active threads (by last post time)
 */
export async function getLatestThreads(permissions: any, limit: number = 10): Promise<any[]> {
  const connection = await db.getConnection();
  try {
    // Get accessible categories
    const categories = await getCategories(permissions);
    const categoryIds = categories.map((c: any) => c.id);

    if (categoryIds.length === 0) {
      return [];
    }

    const [threads] = await connection.query<RowDataPacket[]>(
      `SELECT
         t.id, t.title, t.category_id, t.last_post_at,
         c.name as category_name,
         COUNT(p.id) as post_count
       FROM forum_threads t
       JOIN forum_categories c ON t.category_id = c.id
       LEFT JOIN forum_posts p ON t.id = p.thread_id AND p.is_deleted = 0
       WHERE t.category_id IN (?) AND t.is_deleted = 0
       GROUP BY t.id, t.title, t.category_id, t.last_post_at, c.name
       ORDER BY t.last_post_at DESC
       LIMIT ?`,
      [categoryIds, limit]
    );

    return threads.map((t: any) => ({
      id: t.id,
      title: t.title,
      categoryId: t.category_id,
      categoryName: t.category_name,
      postCount: t.post_count,
      lastPostAt: t.last_post_at,
    }));
  } finally {
    connection.release();
  }
}

/**
 * Get popular threads across all accessible categories
 * Returns threads with most posts in the last 30 days
 */
export async function getPopularThreads(permissions: any, limit: number = 10): Promise<any[]> {
  const connection = await db.getConnection();
  try {
    // Get accessible categories
    const categories = await getCategories(permissions);
    const categoryIds = categories.map((c: any) => c.id);

    if (categoryIds.length === 0) {
      return [];
    }

    const [threads] = await connection.query<RowDataPacket[]>(
      `SELECT
         t.id, t.title, t.category_id, t.view_count, t.last_post_at,
         c.name as category_name,
         COUNT(p.id) as post_count,
         SUM(CASE WHEN p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as recent_posts
       FROM forum_threads t
       JOIN forum_categories c ON t.category_id = c.id
       LEFT JOIN forum_posts p ON t.id = p.thread_id AND p.is_deleted = 0
       WHERE t.category_id IN (?) AND t.is_deleted = 0
       GROUP BY t.id, t.title, t.category_id, t.view_count, t.last_post_at, c.name
       HAVING recent_posts > 0
       ORDER BY recent_posts DESC, t.view_count DESC
       LIMIT ?`,
      [categoryIds, limit]
    );

    return threads.map((t: any) => ({
      id: t.id,
      title: t.title,
      categoryId: t.category_id,
      categoryName: t.category_name,
      postCount: t.post_count,
      recentPosts: t.recent_posts,
      viewCount: t.view_count,
      lastPostAt: t.last_post_at,
    }));
  } finally {
    connection.release();
  }
}

// ============================================================================
// Archive Management
// ============================================================================

/**
 * Get deleted threads with pagination and filters
 */
export async function getDeletedThreads(params: {
  page?: number;
  limit?: number;
  categoryId?: number;
}) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  let query = `
    SELECT
      t.id,
      t.category_id,
      t.title,
      t.author_account_name as author_account,
      t.author_character_pid,
      t.view_count,
      t.is_locked,
      t.is_pinned,
      t.is_deleted,
      t.deleted_at,
      t.deleted_by,
      t.created_at,
      c.name as category_name,
      (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id) as post_count
    FROM forum_threads t
    LEFT JOIN forum_categories c ON t.category_id = c.id
    WHERE t.is_deleted = TRUE
  `;

  const queryParams: any[] = [];

  if (params.categoryId) {
    query += ` AND t.category_id = ?`;
    queryParams.push(params.categoryId);
  }

  query += ` ORDER BY t.deleted_at DESC LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const [rows] = await db.query<RowDataPacket[]>(query, queryParams);

  // Get total count
  let countQuery = `SELECT COUNT(*) as total FROM forum_threads WHERE is_deleted = TRUE`;
  const countParams: any[] = [];

  if (params.categoryId) {
    countQuery += ` AND category_id = ?`;
    countParams.push(params.categoryId);
  }

  const [countRows] = await db.query<RowDataPacket[]>(countQuery, countParams);
  const total = countRows[0]?.total || 0;

  return {
    threads: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get deleted posts with pagination and filters
 */
export async function getDeletedPosts(params: {
  page?: number;
  limit?: number;
  threadId?: number;
}) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  let query = `
    SELECT
      p.id,
      p.thread_id,
      p.content,
      p.author_account_name as author_account,
      p.author_character_pid,
      p.is_deleted,
      p.deleted_at,
      p.deleted_by,
      p.created_at,
      p.edited_at,
      t.title as thread_title,
      t.category_id,
      c.name as category_name
    FROM forum_posts p
    LEFT JOIN forum_threads t ON p.thread_id = t.id
    LEFT JOIN forum_categories c ON t.category_id = c.id
    WHERE p.is_deleted = TRUE
  `;

  const queryParams: any[] = [];

  if (params.threadId) {
    query += ` AND p.thread_id = ?`;
    queryParams.push(params.threadId);
  }

  query += ` ORDER BY p.deleted_at DESC LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const [rows] = await db.query<RowDataPacket[]>(query, queryParams);

  // Get total count
  let countQuery = `SELECT COUNT(*) as total FROM forum_posts WHERE is_deleted = TRUE`;
  const countParams: any[] = [];

  if (params.threadId) {
    countQuery += ` AND thread_id = ?`;
    countParams.push(params.threadId);
  }

  const [countRows] = await db.query<RowDataPacket[]>(countQuery, countParams);
  const total = countRows[0]?.total || 0;

  return {
    posts: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get all characters for an account with their stats
 */
export async function getAccountCharacters(accountName: string): Promise<{
  characters: import('../types/index.js').CharacterWithStats[];
  totals: {
    characterCount: number;
    totalFrags: number;
    totalDeaths: number;
    totalWealth: number;
  };
}> {
  const connection = await db.getConnection();
  try {
    // Get all characters for this account from account_characters table
    const [characterRows] = await connection.query<RowDataPacket[]>(
      `SELECT
        ac.pid,
        ac.char_name,
        COALESCE(fl.race, '') as race,
        COALESCE(fl.class, '') as classname,
        pd.spec,
        pd.level,
        COALESCE(a.name, '') as guild,
        pd.copper + pd.silver * 10 + pd.gold * 100 + pd.platinum * 1000 as money,
        pd.bank_copper + pd.bank_silver * 10 + pd.bank_gold * 100 + pd.bank_platinum * 1000 as balance,
        pd.played_time as playtime,
        pd.epics,
        pd.active
      FROM account_characters ac
      LEFT JOIN player_data pd ON ac.pid = pd.pid
      LEFT JOIN frag_leaderboard fl ON ac.pid = fl.pid
      LEFT JOIN associations a ON pd.assoc_id = a.id
      WHERE ac.account_name = ? AND ac.deleted_at IS NULL
      ORDER BY pd.level DESC, ac.char_name ASC`,
      [accountName]
    );

    const characters: import('../types/index.js').CharacterWithStats[] = [];
    let totalFrags = 0;
    let totalDeaths = 0;
    let totalWealth = 0;

    for (const char of characterRows) {
      // Get frag stats from frag_leaderboard
      const [fragRows] = await connection.query<RowDataPacket[]>(
        `SELECT total_frags,
          (SELECT COUNT(*) + 1 FROM frag_leaderboard WHERE total_frags > fl.total_frags AND deleted_at IS NULL) as frag_rank
         FROM frag_leaderboard fl
         WHERE pid = ? AND deleted_at IS NULL`,
        [char.pid]
      );

      // Get death count from pkill_info
      const [deathRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as deaths
         FROM pkill_info
         WHERE pid = ? AND pk_type = 'VICTIM'`,
        [char.pid]
      );

      // Get forum stats
      const [forumRows] = await connection.query<RowDataPacket[]>(
        `SELECT
          (SELECT COUNT(*) FROM forum_posts WHERE author_character_pid = ? AND is_deleted = FALSE) as forum_posts,
          (SELECT COUNT(*) FROM forum_threads WHERE author_character_pid = ? AND is_deleted = FALSE) as forum_threads`,
        [char.pid, char.pid]
      );

      // Get guild info
      let guildRank: string | null = null;
      if (char.guild) {
        try {
          const guildInfo = await findCharacterGuild(char.char_name);
          if (guildInfo) {
            guildRank = guildInfo.rankTitle;
          }
        } catch {
          // Ignore guild lookup errors
        }
      }

      const frags = fragRows[0]?.total_frags ? Math.floor(fragRows[0].total_frags / 100) : 0;
      const deaths = deathRows[0]?.deaths || 0;
      const charWealth = (char.money || 0) + (char.balance || 0);

      totalFrags += frags;
      totalDeaths += deaths;
      totalWealth += charWealth;

      // EQ_WIPE is 20000000 seconds - a baseline offset added after equipment wipe
      // Real playtime = stored playtime - EQ_WIPE
      const EQ_WIPE = 20000000;
      const rawPlaytime = char.playtime || 0;
      const actualPlaytime = rawPlaytime >= EQ_WIPE ? rawPlaytime - EQ_WIPE : rawPlaytime;

      characters.push({
        pid: char.pid,
        name: char.char_name,
        race: char.race || '',
        class: char.classname || '',
        spec: char.spec || null,
        level: char.level || 0,
        guild: char.guild || null,
        guildRank,
        active: char.active === 1,
        money: char.money || 0,
        balance: char.balance || 0,
        playtime: actualPlaytime,
        epics: char.epics || 0,
        stats: {
          frags,
          deaths,
          fragRank: fragRows[0]?.frag_rank || null,
          kdRatio: deaths > 0 ? Math.round((frags / deaths) * 100) / 100 : frags,
          forumPosts: forumRows[0]?.forum_posts || 0,
          forumThreads: forumRows[0]?.forum_threads || 0
        }
      });
    }

    return {
      characters,
      totals: {
        characterCount: characters.length,
        totalFrags,
        totalDeaths,
        totalWealth
      }
    };
  } finally {
    connection.release();
  }
}

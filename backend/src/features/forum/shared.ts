import rateLimit from 'express-rate-limit';
import { getThreadById } from '../../services/forumService.js';
import { type UserPermissions } from '../../services/permissionService.js';
import { getCategoryAccessForAccount } from '../../services/categoryService.js';

// Anonymous user permissions (no access to restricted content)
export const ANONYMOUS_PERMISSIONS: UserPermissions = {
  accountName: '',
  role: 'player',
  immortalLevel: null,
  maxLevel: 0,
  canAccessImmortalForum: false,
  canAccessGodForum: false,
  guilds: [],
  canModerate: false,
  canBan: false,
  canEditPosts: false,
  canDeletePosts: false,
  canPinThreads: false,
  canLockThreads: false,
  adminPermissions: [],
};

type ForumThreadAccessMode = 'view' | 'post';

export async function getAuthorizedThread(
  threadId: number,
  permissions: UserPermissions,
  mode: ForumThreadAccessMode = 'view',
  includeDeleted = false,
): Promise<{
  thread: NonNullable<Awaited<ReturnType<typeof getThreadById>>>;
  canPost: boolean;
  canModerate: boolean;
} | null> {
  const thread = await getThreadById(threadId, undefined, { includeDeleted });
  if (!thread) return null;

  const access = await getCategoryAccessForAccount(thread.category_id, permissions);
  if (!access.canView || (mode === 'post' && !access.canPost)) return null;

  return { thread, canPost: access.canPost, canModerate: access.canModerate };
}

// Rate limiting for forum posts
/** One shared budget across thread, post and poll-vote writes, as before the split. */
export const postLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 posts per minute
  message: 'Too many posts, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

import { apiClient as api } from '@/services/httpClient'
import type {
  PaginatedResponse,
  ForumCategory,
  ForumThread,
  ForumPost,
  ForumSearchResult,
  ThreadSubscription,
  ModerationLogEntry,
} from '@/types'

/**
 * Forum API endpoints
 */
export const forumApi = {
  /**
   * Get all categories (filtered by user permissions)
   */
  async getCategories(): Promise<ForumCategory[]> {
    const { data } = await api.get<{ categories: ForumCategory[] }>('/api/forum/categories')
    return data.categories
  },

  /**
   * Get single category by ID
   */
  async getCategory(id: number): Promise<ForumCategory> {
    const { data } = await api.get<{ category: ForumCategory }>(`/api/forum/categories/${id}`)
    return data.category
  },

  /**
   * Get child categories of a parent category
   */
  async getChildCategories(parentId: number): Promise<ForumCategory[]> {
    const { data } = await api.get<{ children: ForumCategory[] }>(
      `/api/forum/categories/${parentId}/children`,
    )
    return data.children
  },

  /**
   * Get threads in a category (paginated)
   */
  async getThreads(
    categoryId: number,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResponse<ForumThread>> {
    const { data } = await api.get<PaginatedResponse<ForumThread>>(
      `/api/forum/categories/${categoryId}/threads?page=${page}&limit=${limit}`,
    )
    return data
  },

  /**
   * Get single thread with posts
   */
  async getThread(
    threadId: number,
    page: number = 1,
    limit: number = 50,
    postId?: number,
  ): Promise<{
    thread: ForumThread
    category: { id: number; name: string }
    posts: ForumPost[]
    pagination: { page: number; limit: number; total: number; pages: number }
  }> {
    const target = postId === undefined ? '' : `&postId=${postId}`
    const { data } = await api.get(
      `/api/forum/threads/${threadId}?page=${page}&limit=${limit}${target}`,
    )
    return data
  },

  /**
   * Create new thread
   */
  async createThread(
    categoryId: number,
    title: string,
    content: string,
    characterPid?: number,
  ): Promise<{ threadId: number }> {
    const { data } = await api.post('/api/forum/threads', {
      categoryId,
      title,
      content,
      characterPid,
    })
    return data
  },

  /**
   * Update thread (author only)
   */
  async updateThread(threadId: number, title: string, content: string): Promise<void> {
    await api.patch(`/api/forum/threads/${threadId}`, { title, content })
  },

  /**
   * Delete thread (author or moderator)
   */
  async deleteThread(threadId: number): Promise<void> {
    await api.delete(`/api/forum/threads/${threadId}`)
  },

  /**
   * Pin/unpin thread (moderator only)
   */
  async togglePin(threadId: number, isPinned: boolean): Promise<void> {
    await api.post(`/api/forum/threads/${threadId}/pin`, { isPinned })
  },

  /**
   * Lock/unlock thread (moderator only)
   */
  async toggleLock(threadId: number, isLocked: boolean): Promise<void> {
    await api.post(`/api/forum/threads/${threadId}/lock`, { isLocked })
  },

  /**
   * Create post/reply
   */
  async createPost(
    threadId: number,
    content: string,
    characterPid?: number,
    parentPostId?: number,
  ): Promise<{ postId: number; post: ForumPost }> {
    const { data } = await api.post(`/api/forum/threads/${threadId}/posts`, {
      content,
      characterPid,
      parentPostId,
    })
    return data
  },

  /**
   * Update post (author only, 15min window)
   */
  async updatePost(postId: number, content: string): Promise<void> {
    await api.patch(`/api/forum/posts/${postId}`, { content })
  },

  /**
   * Delete post (author or moderator)
   */
  async deletePost(postId: number): Promise<void> {
    await api.delete(`/api/forum/posts/${postId}`)
  },

  /**
   * Add emoji reaction to post or thread
   */
  async addReaction(
    postOrThreadId: number,
    emoji: string,
    isThread: boolean = false,
  ): Promise<void> {
    const endpoint = isThread
      ? `/api/forum/threads/${postOrThreadId}/reactions`
      : `/api/forum/posts/${postOrThreadId}/reactions`
    await api.post(endpoint, { emoji })
  },

  /**
   * Remove emoji reaction from post or thread
   */
  async removeReaction(
    postOrThreadId: number,
    emoji: string,
    isThread: boolean = false,
  ): Promise<void> {
    const endpoint = isThread
      ? `/api/forum/threads/${postOrThreadId}/reactions/${encodeURIComponent(emoji)}`
      : `/api/forum/posts/${postOrThreadId}/reactions/${encodeURIComponent(emoji)}`
    await api.delete(endpoint)
  },

  /**
   * Subscribe to thread
   */
  async subscribe(threadId: number, notifyOnReply: boolean = true): Promise<void> {
    await api.post(`/api/forum/threads/${threadId}/subscribe`, { notifyOnReply })
  },

  /**
   * Unsubscribe from thread
   */
  async unsubscribe(threadId: number): Promise<void> {
    await api.delete(`/api/forum/threads/${threadId}/subscribe`)
  },

  /**
   * Get user's subscriptions
   */
  async getSubscriptions(): Promise<ThreadSubscription[]> {
    const { data } = await api.get<{ subscriptions: ThreadSubscription[] }>(
      '/api/forum/subscriptions',
    )
    return data.subscriptions
  },

  /**
   * Mark notification as read (old - deprecated)
   */
  async markNotificationRead(notificationId: number): Promise<void> {
    await api.post(`/api/forum/notifications/${notificationId}/read`)
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead(): Promise<void> {
    await api.post('/api/forum/notifications/read-all')
  },

  /**
   * Search forum threads and posts
   */
  async searchForum(
    query: string,
    page: number = 1,
    limit: number = 50,
    filters?: {
      scope?: 'titles' | 'content' | 'both'
      author?: string
      categoryId?: number
      dateFrom?: string
      dateTo?: string
    },
  ): Promise<{ results: ForumSearchResult[]; pagination: any }> {
    const params = new URLSearchParams({
      query,
      page: page.toString(),
      limit: limit.toString(),
      ...(filters?.scope && { scope: filters.scope }),
      ...(filters?.author && { author: filters.author }),
      ...(filters?.categoryId && { categoryId: filters.categoryId.toString() }),
      ...(filters?.dateFrom && { dateFrom: filters.dateFrom }),
      ...(filters?.dateTo && { dateTo: filters.dateTo }),
    })

    const { data } = await api.get(`/api/forum/search?${params}`)
    return data
  },

  /**
   * Moderation: Delete a post (moderator only)
   */
  async moderatorDeletePost(postId: number, reason?: string): Promise<void> {
    await api.delete(`/api/forum/moderation/posts/${postId}`, {
      data: { reason },
    })
  },

  /**
   * Moderation: Restore a deleted post
   */
  async restorePost(postId: number): Promise<void> {
    await api.post(`/api/forum/moderation/posts/${postId}/restore`)
  },

  /**
   * Moderation: Delete a thread (moderator only)
   */
  async moderatorDeleteThread(threadId: number, reason?: string): Promise<void> {
    await api.delete(`/api/forum/moderation/threads/${threadId}`, {
      data: { reason },
    })
  },

  /**
   * Moderation: Restore a deleted thread
   */
  async restoreThread(threadId: number): Promise<void> {
    await api.post(`/api/forum/moderation/threads/${threadId}/restore`)
  },

  /**
   * Moderation: Move a thread to different category
   */
  async moveThread(threadId: number, categoryId: number, reason?: string): Promise<void> {
    await api.post(`/api/forum/moderation/threads/${threadId}/move`, {
      categoryId,
      reason,
    })
  },

  /**
   * Moderation: Get moderation log
   */
  async getModerationLog(
    page: number = 1,
    limit: number = 50,
    filters?: {
      moderator?: string
      actionType?: string
      categoryId?: number
    },
  ): Promise<{ logs: ModerationLogEntry[]; pagination: any }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(filters?.moderator && { moderator: filters.moderator }),
      ...(filters?.actionType && { actionType: filters.actionType }),
      ...(filters?.categoryId && { categoryId: filters.categoryId.toString() }),
    })

    const { data } = await api.get(`/api/forum/moderation/logs?${params}`)
    return data
  },

  // Subscriptions
  async getUserSubscriptions(): Promise<{ threads: any[]; categories: any[] }> {
    const { data } = await api.get('/api/forum/subscriptions')
    return data.subscriptions
  },

  async subscribeToThread(
    threadId: number,
    notificationPreference: 'all' | 'mentions' | 'none' = 'all',
  ): Promise<void> {
    await api.post(`/api/forum/threads/${threadId}/subscribe`, { notificationPreference })
  },

  async unsubscribeFromThread(threadId: number): Promise<void> {
    await api.delete(`/api/forum/threads/${threadId}/subscribe`)
  },

  async isSubscribedToThread(threadId: number): Promise<boolean> {
    const { data } = await api.get(`/api/forum/threads/${threadId}/is-subscribed`)
    return data.isSubscribed
  },

  async subscribeToCategory(
    categoryId: number,
    notificationPreference: 'all' | 'mentions' | 'none' = 'all',
  ): Promise<void> {
    await api.post(`/api/forum/categories/${categoryId}/subscribe`, { notificationPreference })
  },

  async unsubscribeFromCategory(categoryId: number): Promise<void> {
    await api.delete(`/api/forum/categories/${categoryId}/subscribe`)
  },

  async isSubscribedToCategory(categoryId: number): Promise<boolean> {
    const { data } = await api.get(`/api/forum/categories/${categoryId}/is-subscribed`)
    return data.isSubscribed
  },

  // Notifications
  async getNotifications(
    page: number = 1,
    limit: number = 50,
    unreadOnly: boolean = false,
  ): Promise<{ notifications: any[]; pagination: any; unreadCount: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      unreadOnly: unreadOnly.toString(),
    })
    const { data } = await api.get(`/api/forum/notifications?${params}`)
    return data
  },

  async getUnreadNotificationCount(): Promise<number> {
    const { data } = await api.get('/api/forum/notifications/unread-count')
    return data.unreadCount
  },

  async markNotificationAsRead(notificationId: number): Promise<void> {
    await api.post(`/api/forum/notifications/${notificationId}/read`)
  },

  async markAllNotificationsAsRead(): Promise<void> {
    await api.post('/api/forum/notifications/read-all')
  },

  async deleteNotification(notificationId: number): Promise<void> {
    await api.delete(`/api/forum/notifications/${notificationId}`)
  },

  // ============================================================================
  // Poll API
  // ============================================================================

  /**
   * Create a poll for a thread
   */
  async createPoll(
    threadId: number,
    pollData: import('@/types').PollCreationData,
  ): Promise<{ pollId: number }> {
    const { data } = await api.post(`/api/forum/threads/${threadId}/poll`, pollData)
    return data
  },

  /**
   * Get poll for a thread
   */
  async getThreadPoll(threadId: number): Promise<import('@/types').PollResultData> {
    const { data } = await api.get(`/api/forum/threads/${threadId}/poll`)
    return data
  },

  /**
   * Check if thread has a poll (lightweight)
   */
  async checkThreadHasPoll(threadId: number): Promise<boolean> {
    const { data } = await api.get(`/api/forum/threads/${threadId}/has-poll`)
    return data.hasPoll
  },

  /**
   * Cast or update vote on a poll
   */
  async votePoll(pollId: number, optionIds: number[]): Promise<void> {
    await api.post(`/api/forum/polls/${pollId}/vote`, { optionIds })
  },

  /**
   * Remove vote from a poll
   */
  async removeVote(pollId: number): Promise<void> {
    await api.delete(`/api/forum/polls/${pollId}/vote`)
  },

  /**
   * Close a poll (creator or moderator)
   */
  async closePoll(pollId: number): Promise<void> {
    await api.patch(`/api/forum/polls/${pollId}/close`)
  },

  /**
   * Delete a poll (creator or moderator)
   */
  async deletePoll(pollId: number): Promise<void> {
    await api.delete(`/api/forum/polls/${pollId}`)
  },

  /**
   * Search accounts for mention autocomplete
   */
  async searchAccounts(query: string): Promise<string[]> {
    const { data } = await api.get('/api/forum/accounts/search', {
      params: { q: query },
    })
    return data.accounts
  },

  /**
   * Search guilds
   */
  async searchGuilds(query: string): Promise<string[]> {
    const { data } = await api.get('/api/forum/guilds/search', {
      params: { q: query },
    })
    return data.guilds
  },

  /**
   * Get latest threads across all accessible categories
   */
  async getLatestThreads(limit: number = 5): Promise<any[]> {
    const { data } = await api.get('/api/forum/activity/latest', {
      params: { limit },
    })
    return data
  },

  /**
   * Get popular threads across all accessible categories
   */
  async getPopularThreads(limit: number = 5): Promise<any[]> {
    const { data } = await api.get('/api/forum/activity/popular', {
      params: { limit },
    })
    return data
  },

  // ============================================================================
  // Post Image Methods
  // ============================================================================

  /**
   * Upload an image for use in forum posts
   * Returns { success, imageId, imageUrl }
   */
  async uploadPostImage(
    file: File,
  ): Promise<{ success: boolean; imageId: number; imageUrl: string }> {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await api.post('/api/forum/images/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  /**
   * Delete an orphan image (only own images that haven't been linked to a post)
   */
  async deletePostImage(imageId: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/forum/images/${imageId}`)
    return data
  },

  /**
   * Get current image upload status (pending orphan count)
   */
  async getImageUploadStatus(): Promise<{
    pendingImages: number
    pendingRemovals: number
    maxImages: number
    canUpload: boolean
  }> {
    const { data } = await api.get('/api/forum/images/status')
    return data
  },

  /**
   * Clear all orphan images for current user
   */
  async clearOrphanImages(): Promise<{
    deleted: number
    failed: number
    remaining: number | null
    unavailableImageUrls: string[]
    reference?: string
  }> {
    const { data } = await api.delete<unknown>('/api/forum/images/orphans')
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid image removal response')
    const { deleted, failed, remaining, unavailableImageUrls, reference } = data as Record<
      string,
      unknown
    >
    if (
      [deleted, failed, ...(remaining === null ? [] : [remaining])].some(
        (value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0,
      ) ||
      ((remaining === null || reference !== undefined) &&
        (typeof reference !== 'string' ||
          !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(reference))) ||
      !Array.isArray(unavailableImageUrls) ||
      unavailableImageUrls.length > 100 ||
      !unavailableImageUrls.every(
        (value): value is string =>
          typeof value === 'string' && value.length > 0 && value.length <= 2048,
      )
    )
      throw new Error('Invalid image removal response')
    return {
      deleted: deleted as number,
      failed: failed as number,
      remaining: remaining as number | null,
      unavailableImageUrls,
      ...(typeof reference === 'string' ? { reference } : {}),
    }
  },
}

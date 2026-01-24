import axios from 'axios'
import type {
  PvPEvent,
  BattleDetail,
  PaginatedResponse,
  PlayerStats,
  Leaderboard,
  LocationOption,
  PlayerOption,
  NewsContent,
  UserContext,
  AuthStatus,
  ForumCategory,
  ForumThread,
  ForumPost,
  ForumSearchResult,
  ThreadSubscription,
  ForumSettings,
  CategoryPermissions,
  AuditLogEntry,
  ModerationLogEntry,
  UserProfileWithStats,
  UserPost,
  UserThread,
  CategoryPermissionRule,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  AddPermissionRequest,
  AccountCharactersResponse,
  PvPBattleComment,
  PvPBattleStats,
  PvPFavoritesResponse,
  WikiContinent,
  WikiMapTile,
  WikiZoneEntrance,
  WikiMapBounds,
  WikiZone,
  WikiZoneDetail,
  WikiZoneMapData,
  WikiObject,
  WikiObjectDetail,
  WikiZoneFilters,
  WikiObjectFilters,
  WikiObjectType,
  WikiWearSlot,
  WikiAffectType,
  WikiMob,
  WikiMobDetail,
  WikiMobFilters,
  WikiMobClass,
  WikiMobRace,
  WikiActFlag,
  WikiZoneSpawns,
  WebSettingRow,
  SiteConfig,
  UnifiedNotification,
  AuctionListItem,
  AuctionDetail,
  AuctionBidHistory,
  AuctionFilters,
  AuctionStats,
  AuctionHistoryItem,
  AuctionHistoryFilters,
  ChangelogEntry,
  ChangelogListResponse,
} from '@/types'

// Create axios instance - uses relative URLs so Vite proxy works
const api = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable cookies for auth
})

// Request interceptor to include CSRF token
api.interceptors.request.use(
  (config) => {
    // Extract CSRF token from cookie
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrf_token='))
      ?.split('=')[1]

    // Add CSRF token header for state-changing requests
    if (csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
      config.headers['X-CSRF-Token'] = csrfToken
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error)
  }
)

// Public API (no auth required)
export async function getSiteConfig(): Promise<SiteConfig> {
  const { data } = await api.get<SiteConfig>('/api/site-config')
  return data
}

// API Service Functions
export const pvpApi = {
  /**
   * Get paginated list of PvP events
   */
  async getEvents(filters: any = {}): Promise<PaginatedResponse<PvPEvent>> {
    const params = new URLSearchParams()

    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.date_from || filters.startDate) params.append('date_from', filters.date_from || filters.startDate)
    if (filters.date_to || filters.endDate) params.append('date_to', filters.date_to || filters.endDate)
    if (filters.player || filters.playerName) params.append('player', filters.player || filters.playerName)
    if (filters.location) params.append('location', filters.location)
    if (filters.sort_by) params.append('sort_by', filters.sort_by)
    if (filters.hour !== undefined && filters.hour !== null) params.append('hour', filters.hour.toString())

    const { data } = await api.get<PaginatedResponse<PvPEvent>>(`/api/pvp/events?${params}`)
    return data
  },

  /**
   * Get detailed information about a specific battle
   */
  async getBattleDetail(eventId: number): Promise<BattleDetail> {
    const { data } = await api.get<BattleDetail>(`/api/pvp/events/${eventId}`)
    return data
  },

  /**
   * Get player statistics
   */
  async getPlayerStats(playerName: string): Promise<PlayerStats> {
    const { data } = await api.get<PlayerStats>(`/api/pvp/stats/player/${encodeURIComponent(playerName)}`)
    return data
  },

  /**
   * Get leaderboard
   */
  async getLeaderboard(type: 'kills' | 'deaths' | 'kd_ratio' = 'kills', period: '7d' | '30d' | 'all' = '30d'): Promise<Leaderboard> {
    const { data } = await api.get<Leaderboard>(`/api/pvp/stats/leaderboard?type=${type}&period=${period}`)
    return data
  },

  /**
   * Search battles with advanced criteria
   */
  async search(query: any): Promise<PaginatedResponse<PvPEvent>> {
    const params = new URLSearchParams()

    // Support both naming conventions
    if (query.player || query.playerName) params.append('player', query.player || query.playerName)
    if (query.date_from || query.dateRange?.start) params.append('date_from', query.date_from || query.dateRange?.start)
    if (query.date_to || query.dateRange?.end) params.append('date_to', query.date_to || query.dateRange?.end)
    if (query.location) params.append('location', query.location)
    if (query.class && query.class.length > 0) params.append('class', query.class.join(','))
    if (query.race && query.race.length > 0) params.append('race', query.race.join(','))
    if (query.level_min || query.levelRange?.min) params.append('level_min', (query.level_min || query.levelRange?.min).toString())
    if (query.level_max || query.levelRange?.max) params.append('level_max', (query.level_max || query.levelRange?.max).toString())
    if (query.alignment) params.append('alignment', query.alignment)
    if (query.hour !== undefined && query.hour !== null) params.append('hour', query.hour.toString())
    if (query.sort_by) params.append('sort_by', query.sort_by)
    if (query.page) params.append('page', query.page.toString())
    if (query.limit) params.append('limit', query.limit.toString())

    const { data } = await api.get<PaginatedResponse<PvPEvent>>(`/api/pvp/search?${params}`)
    return data
  },

  /**
   * Get location autocomplete options
   */
  async getLocations(search?: string, page: number = 1, limit: number = 20): Promise<LocationOption[]> {
    const params = new URLSearchParams()
    if (search) params.append('q', search)
    params.append('page', page.toString())
    params.append('limit', limit.toString())
    const { data } = await api.get<LocationOption[]>(`/api/pvp/locations?${params}`)
    return data
  },

  /**
   * Get player name autocomplete options
   */
  async getPlayers(search?: string, page: number = 1, limit: number = 20): Promise<PlayerOption[]> {
    const params = new URLSearchParams()
    if (search) params.append('q', search)
    params.append('page', page.toString())
    params.append('limit', limit.toString())
    const { data } = await api.get<PlayerOption[]>(`/api/pvp/players?${params}`)
    return data
  },

  /**
   * Analytics: Get kill timeline
   */
  async getKillTimeline(period: string = '30d'): Promise<Array<{ date: string; kills: number }>> {
    const { data } = await api.get(`/api/pvp/analytics/timeline?period=${period}`)
    return data
  },

  /**
   * Analytics: Get active hours heatmap
   */
  async getActiveHours(period: string = 'all'): Promise<Array<{ hour: number; kills: number }>> {
    const { data } = await api.get(`/api/pvp/analytics/active-hours?period=${period}`)
    return data
  },

  /**
   * Analytics: Get popular locations
   */
  async getPopularLocations(limit: number = 10, period: string = 'all'): Promise<Array<{ location: string; kills: number }>> {
    const { data } = await api.get(`/api/pvp/analytics/popular-locations?limit=${limit}&period=${period}`)
    return data
  },

  /**
   * Analytics: Get class matchup matrix
   */
  async getClassMatchups(period: string = 'all'): Promise<Array<{ killer_class: string; victim_class: string; wins: number }>> {
    const { data } = await api.get(`/api/pvp/analytics/class-matchups?period=${period}`)
    return data
  },

  async getClientStats(period: string = '30d'): Promise<{ clients: Array<{ name: string; count: number; percentage: number; versions: Array<{ version: string; count: number }> }>; total: number; period: string }> {
    const { data } = await api.get(`/api/pvp/analytics/client-stats?period=${period}`)
    return data
  },

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const { data } = await api.get<{ status: string; timestamp: string }>('/health')
    return data
  },

  // ==================== Battle Interactions ====================

  /**
   * Get battle interaction stats (likes, comments, user status)
   */
  async getBattleStats(eventId: number): Promise<PvPBattleStats> {
    const { data } = await api.get<PvPBattleStats>(`/api/pvp/events/${eventId}/stats`)
    return data
  },

  /**
   * Like a battle
   */
  async likeBattle(eventId: number): Promise<void> {
    await api.post(`/api/pvp/events/${eventId}/like`)
  },

  /**
   * Unlike a battle
   */
  async unlikeBattle(eventId: number): Promise<void> {
    await api.delete(`/api/pvp/events/${eventId}/like`)
  },

  /**
   * Favorite a battle
   */
  async favoriteBattle(eventId: number): Promise<void> {
    await api.post(`/api/pvp/events/${eventId}/favorite`)
  },

  /**
   * Unfavorite a battle
   */
  async unfavoriteBattle(eventId: number): Promise<void> {
    await api.delete(`/api/pvp/events/${eventId}/favorite`)
  },

  /**
   * Get comments for a battle
   */
  async getComments(eventId: number): Promise<PvPBattleComment[]> {
    const { data } = await api.get<PvPBattleComment[]>(`/api/pvp/events/${eventId}/comments`)
    return data
  },

  /**
   * Create a comment on a battle
   */
  async createComment(
    eventId: number,
    content: string,
    characterPid?: number,
    parentId?: number,
    quotedText?: string,
    lineNumber?: number,
    participantId?: number
  ): Promise<PvPBattleComment> {
    const { data } = await api.post<PvPBattleComment>(`/api/pvp/events/${eventId}/comments`, {
      content,
      characterPid,
      parentId,
      quotedText,
      lineNumber,
      participantId,
    })
    return data
  },

  /**
   * Update a comment
   */
  async updateComment(commentId: number, content: string): Promise<void> {
    await api.patch(`/api/pvp/comments/${commentId}`, { content })
  },

  /**
   * Delete a comment
   */
  async deleteComment(commentId: number): Promise<void> {
    await api.delete(`/api/pvp/comments/${commentId}`)
  },

  /**
   * Get user's favorited battles
   */
  async getUserFavorites(accountName: string, page: number = 1, limit: number = 20): Promise<PvPFavoritesResponse> {
    const { data } = await api.get<PvPFavoritesResponse>(
      `/api/pvp/users/${encodeURIComponent(accountName)}/favorites?page=${page}&limit=${limit}`
    )
    return data
  },
}

/**
 * News API endpoints
 */
export const newsApi = {
  /**
   * Get news content from mud_info table
   */
  async getNews(): Promise<NewsContent> {
    const { data } = await api.get<NewsContent>('/api/content/news')
    return data
  },
}

/**
 * Authentication API endpoints
 */
export const authApi = {
  /**
   * Login with MUD credentials
   */
  async login(username: string, password: string): Promise<UserContext> {
    const { data } = await api.post<{ user: UserContext }>('/api/auth/login', {
      username,
      password,
    })
    return data.user
  },

  /**
   * Logout (invalidate refresh token)
   */
  async logout(): Promise<void> {
    await api.post('/api/auth/logout')
  },

  /**
   * Refresh access token
   */
  async refresh(): Promise<void> {
    await api.post('/api/auth/refresh')
  },

  /**
   * Get current user context (full profile)
   */
  async getMe(): Promise<UserContext> {
    const { data } = await api.get<{ user: UserContext }>('/api/auth/me')
    return data.user
  },

  /**
   * Quick auth status check
   */
  async checkAuth(): Promise<AuthStatus> {
    const { data } = await api.get<AuthStatus>('/api/auth/check')
    return data
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/api/auth/change-password', {
      currentPassword,
      newPassword,
    })
  },
}

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
    const { data } = await api.get<{ children: ForumCategory[] }>(`/api/forum/categories/${parentId}/children`)
    return data.children
  },

  /**
   * Get threads in a category (paginated)
   */
  async getThreads(categoryId: number, page: number = 1, limit: number = 50): Promise<PaginatedResponse<ForumThread>> {
    const { data } = await api.get<PaginatedResponse<ForumThread>>(
      `/api/forum/categories/${categoryId}/threads?page=${page}&limit=${limit}`
    )
    return data
  },

  /**
   * Get single thread with posts
   */
  async getThread(threadId: number, page: number = 1, limit: number = 50): Promise<{ thread: ForumThread; category: { id: number; name: string }; posts: ForumPost[]; pagination: any }> {
    const { data } = await api.get(`/api/forum/threads/${threadId}?page=${page}&limit=${limit}`)
    return data
  },

  /**
   * Create new thread
   */
  async createThread(categoryId: number, title: string, content: string, characterPid?: number): Promise<{ threadId: number }> {
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
  async createPost(threadId: number, content: string, characterPid?: number, parentPostId?: number): Promise<{ postId: number; post: ForumPost }> {
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
  async addReaction(postOrThreadId: number, emoji: string, isThread: boolean = false): Promise<void> {
    const endpoint = isThread
      ? `/api/forum/threads/${postOrThreadId}/reactions`
      : `/api/forum/posts/${postOrThreadId}/reactions`
    await api.post(endpoint, { emoji })
  },

  /**
   * Remove emoji reaction from post or thread
   */
  async removeReaction(postOrThreadId: number, emoji: string, isThread: boolean = false): Promise<void> {
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
    const { data } = await api.get<{ subscriptions: ThreadSubscription[] }>('/api/forum/subscriptions')
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
    }
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
      data: { reason }
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
      data: { reason }
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
      reason
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
    }
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

  async subscribeToThread(threadId: number, notificationPreference: 'all' | 'mentions' | 'none' = 'all'): Promise<void> {
    await api.post(`/api/forum/threads/${threadId}/subscribe`, { notificationPreference })
  },

  async unsubscribeFromThread(threadId: number): Promise<void> {
    await api.delete(`/api/forum/threads/${threadId}/subscribe`)
  },

  async isSubscribedToThread(threadId: number): Promise<boolean> {
    const { data } = await api.get(`/api/forum/threads/${threadId}/is-subscribed`)
    return data.isSubscribed
  },

  async subscribeToCategory(categoryId: number, notificationPreference: 'all' | 'mentions' | 'none' = 'all'): Promise<void> {
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
    unreadOnly: boolean = false
  ): Promise<{ notifications: any[]; pagination: any; unreadCount: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      unreadOnly: unreadOnly.toString()
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
  async createPoll(threadId: number, pollData: import('@/types').PollCreationData): Promise<{ pollId: number }> {
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
      params: { q: query }
    })
    return data.accounts
  },

  /**
   * Search guilds
   */
  async searchGuilds(query: string): Promise<string[]> {
    const { data } = await api.get('/api/forum/guilds/search', {
      params: { q: query }
    })
    return data.guilds
  },

  /**
   * Get latest threads across all accessible categories
   */
  async getLatestThreads(limit: number = 5): Promise<any[]> {
    const { data } = await api.get('/api/forum/activity/latest', {
      params: { limit }
    })
    return data
  },

  /**
   * Get popular threads across all accessible categories
   */
  async getPopularThreads(limit: number = 5): Promise<any[]> {
    const { data } = await api.get('/api/forum/activity/popular', {
      params: { limit }
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
  async uploadPostImage(file: File): Promise<{ success: boolean; imageId: number; imageUrl: string }> {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await api.post('/api/forum/images/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
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
  async getImageUploadStatus(): Promise<{ pendingImages: number; maxImages: number; canUpload: boolean }> {
    const { data } = await api.get('/api/forum/images/status')
    return data
  },

  /**
   * Clear all orphan images for current user
   */
  async clearOrphanImages(): Promise<{ deleted: number }> {
    const { data } = await api.delete('/api/forum/images/orphans')
    return data
  },
}

/**
 * Admin API endpoints (Overlord only)
 */
export const adminApi = {
  /**
   * Get forum settings
   */
  async getSettings(): Promise<ForumSettings> {
    const { data } = await api.get<{ settings: ForumSettings }>('/api/admin/forum/settings')
    return data.settings
  },

  /**
   * Update single forum setting
   */
  async updateSetting(key: string, value: string): Promise<void> {
    await api.put(`/api/admin/forum/settings/${key}`, { value })
  },

  /**
   * Get category permissions
   */
  async getCategoryPermissions(categoryId: number): Promise<CategoryPermissions> {
    const { data } = await api.get<{ permissions: CategoryPermissions }>(`/api/admin/forum/categories/${categoryId}/permissions`)
    return data.permissions
  },

  /**
   * Update category permissions
   */
  async updateCategoryPermissions(categoryId: number, permissions: Partial<CategoryPermissions>): Promise<void> {
    await api.patch(`/api/admin/forum/categories/${categoryId}/permissions`, permissions)
  },

  /**
   * Get permission audit log
   */
  async getAuditLog(limit: number = 50): Promise<AuditLogEntry[]> {
    const { data } = await api.get<{ auditLog: AuditLogEntry[] }>(`/api/admin/forum/audit-log?limit=${limit}`)
    return data.auditLog
  },

  // ============================================================================
  // Category Management (New)
  // ============================================================================

  /**
   * Get all non-archived categories (admin view)
   */
  async getAllCategories(): Promise<ForumCategory[]> {
    const { data } = await api.get<{ categories: ForumCategory[] }>(
      `/api/forum/categories`
    )
    return data.categories
  },

  /**
   * Get single category with ACL permissions (admin view)
   */
  async getCategoryDetails(categoryId: number): Promise<ForumCategory> {
    const { data } = await api.get<{ category: ForumCategory }>(
      `/api/admin/forum/categories/${categoryId}/details`
    )
    return data.category
  },

  /**
   * Create new category
   */
  async createCategory(request: CreateCategoryRequest): Promise<number> {
    const { data } = await api.post<{ id: number }>(
      '/api/forum/categories',
      request
    )
    return data.id
  },

  /**
   * Update category
   */
  async updateCategory(categoryId: number, request: UpdateCategoryRequest): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, request)
  },

  /**
   * Archive category (soft delete)
   */
  async archiveCategory(categoryId: number): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, { isArchived: true })
  },

  /**
   * Restore archived category
   */
  async restoreCategory(categoryId: number): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, { isArchived: false })
  },

  /**
   * Permanently delete category
   */
  async deleteCategoryPermanent(categoryId: number): Promise<void> {
    await api.delete(`/api/forum/categories/${categoryId}`)
  },

  /**
   * Get archived categories
   */
  async getArchivedCategories(): Promise<{ categories: any[] }> {
    const { data } = await api.get<{ categories: any[] }>('/api/admin/archives/categories')
    return data
  },

  /**
   * Get deleted threads (paginated)
   */
  async getDeletedThreads(page: number = 1, limit: number = 50): Promise<{
    threads: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get('/api/admin/archives/threads', {
      params: { page, limit }
    })
    return data
  },

  /**
   * Get deleted posts (paginated)
   */
  async getDeletedPosts(page: number = 1, limit: number = 50): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get('/api/admin/archives/posts', {
      params: { page, limit }
    })
    return data
  },

  /**
   * Restore deleted thread
   */
  async restoreThread(threadId: number): Promise<void> {
    await api.post(`/api/admin/forum/threads/${threadId}/restore`)
  },

  /**
   * Permanently delete thread
   */
  async deleteThreadPermanent(threadId: number): Promise<void> {
    await api.delete(`/api/admin/forum/threads/${threadId}`)
  },

  /**
   * Restore deleted post
   */
  async restorePost(postId: number): Promise<void> {
    await api.post(`/api/admin/forum/posts/${postId}/restore`)
  },

  /**
   * Permanently delete post
   */
  async deletePostPermanent(postId: number): Promise<void> {
    await api.delete(`/api/admin/forum/posts/${postId}`)
  },

  /**
   * Permanently delete category (dangerous!)
   */
  async deleteCategory(categoryId: number): Promise<void> {
    await api.delete(`/api/forum/categories/${categoryId}`)
  },

  /**
   * Reorder categories
   */
  async reorderCategories(orders: { id: number; sortOrder: number }[]): Promise<void> {
    await api.post('/api/admin/forum/categories/reorder', { orders })
  },

  /**
   * Get ACL permissions for a category
   */
  async getCategoryACL(categoryId: number): Promise<CategoryPermissionRule[]> {
    const { data } = await api.get<{ permissions: CategoryPermissionRule[] }>(
      `/api/admin/forum/categories/${categoryId}/acl`
    )
    return data.permissions
  },

  /**
   * Add ACL permission rule
   */
  async addCategoryPermission(categoryId: number, request: AddPermissionRequest): Promise<number> {
    const { data } = await api.post<{ permissionId: number }>(
      `/api/admin/forum/categories/${categoryId}/acl`,
      request
    )
    return data.permissionId
  },

  /**
   * Remove ACL permission rule
   */
  async removeCategoryPermission(categoryId: number, permissionId: number): Promise<void> {
    await api.delete(`/api/admin/forum/categories/${categoryId}/acl/${permissionId}`)
  },

  // MUD Backup API methods
  /**
   * Get list of all backups
   */
  async getBackupList(): Promise<{ backups: import('@/types').BackupInfo[] }> {
    const { data } = await api.get('/api/admin/backup/list')
    return data
  },

  /**
   * Start a new backup
   */
  async createBackup(): Promise<{ success: boolean; id: number; filename: string }> {
    const { data } = await api.post('/api/admin/backup/create')
    return data
  },

  /**
   * Get backup status (fallback polling)
   */
  async getBackupStatus(id: number): Promise<{ backup: import('@/types').BackupInfo }> {
    const { data } = await api.get(`/api/admin/backup/status/${id}`)
    return data
  },

  /**
   * Delete a backup (overlord only)
   */
  async deleteBackup(id: number): Promise<void> {
    await api.delete(`/api/admin/backup/${id}`)
  },

  /**
   * Delete all failed backups (overlord only)
   */
  async deleteFailedBackups(): Promise<{ deletedCount: number }> {
    const { data } = await api.delete('/api/admin/backup/failed')
    return data
  },

  /**
   * Get backup download URL
   */
  getBackupDownloadUrl(id: number): string {
    return `/api/admin/backup/download/${id}`
  },

  /**
   * Get contents of a backup (accounts and characters)
   */
  async getBackupContents(id: number): Promise<import('@/types').BackupContents> {
    const { data } = await api.get(`/api/admin/backup/${id}/contents`)
    return data
  },

  /**
   * Check if MUD is currently running (for restore warning)
   */
  async getMudRunningStatus(): Promise<{ running: boolean }> {
    const { data } = await api.get('/api/admin/backup/mud-status')
    return data
  },

  /**
   * Create a restore operation
   */
  async createRestore(
    request: import('@/types').RestoreRequest
  ): Promise<{ success: boolean; id: number; message: string }> {
    const { data } = await api.post('/api/admin/backup/restore', request)
    return data
  },

  /**
   * Get restore status
   */
  async getRestoreStatus(id: number): Promise<import('@/types').RestoreInfo> {
    const { data } = await api.get(`/api/admin/restore/status/${id}`)
    return data
  },

  /**
   * Get list of all restore operations
   */
  async getRestoreList(): Promise<import('@/types').RestoreInfo[]> {
    const { data } = await api.get('/api/admin/restore/list')
    return data
  },

  /**
   * Upload a backup file for restoration
   */
  async uploadBackup(file: File): Promise<{
    success: boolean
    tempPath: string
    contents: import('@/types').BackupContents
  }> {
    const formData = new FormData()
    formData.append('backup', file)
    const { data } = await api.post('/api/admin/backup/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  /**
   * Create a restore from an uploaded backup file
   */
  async createRestoreFromUpload(
    tempPath: string,
    request: Omit<import('@/types').RestoreRequest, 'backupId'>
  ): Promise<{ success: boolean; id: number; message: string }> {
    const { data } = await api.post('/api/admin/backup/upload/restore', {
      tempPath,
      ...request,
    })
    return data
  },

  /**
   * Cancel an upload and cleanup temp file
   */
  async cancelBackupUpload(tempPath: string): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete('/api/admin/backup/upload/cancel', {
      data: { tempPath },
    })
    return data
  },

  // MUD Control API methods
  /**
   * Get MUD status
   */
  async getMudStatus(): Promise<{
    state: string
    cycleMudPid: number | null
    dmsPid: number | null
    uptime: number
    cpu: number
    memory: number
    lastStartTime: string | null
    lastStopTime: string | null
    startedBy: string | null
  }> {
    const { data } = await api.get('/api/mud/status')
    return data
  },

  /**
   * Start the MUD
   */
  async startMud(): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/start')
    return data
  },

  /**
   * Stop the MUD
   */
  async stopMud(reason: string): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/stop', { reason })
    return data
  },

  /**
   * Restart the MUD
   */
  async restartMud(reason: string): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/restart', { reason })
    return data
  },

  // ============================================================================
  // Web Settings
  // ============================================================================

  /**
   * Get all web settings (for admin page)
   */
  async getWebSettings(): Promise<WebSettingRow[]> {
    const { data } = await api.get<{ settings: WebSettingRow[] }>('/api/admin/web/settings')
    return data.settings
  },

  /**
   * Update single web setting
   */
  async updateWebSetting(key: string, value: string): Promise<void> {
    await api.put(`/api/admin/web/settings/${key}`, { value })
  },

  /**
   * Upload site logo
   */
  async uploadSiteLogo(file: File): Promise<{ logoUrl: string }> {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await api.post<{ success: boolean; logoUrl: string }>(
      '/api/admin/web/logo',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return { logoUrl: data.logoUrl }
  },

  /**
   * Delete site logo
   */
  async deleteSiteLogo(): Promise<void> {
    await api.delete('/api/admin/web/logo')
  },

  /**
   * Upload hero image
   */
  async uploadHeroImage(file: File): Promise<{ heroUrl: string }> {
    const formData = new FormData()
    formData.append('hero', file)
    const { data } = await api.post<{ success: boolean; heroUrl: string }>(
      '/api/admin/web/hero-image',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return { heroUrl: data.heroUrl }
  },

  /**
   * Delete hero image
   */
  async deleteHeroImage(): Promise<void> {
    await api.delete('/api/admin/web/hero-image')
  },

  /**
   * Test discord webhook
   */
  async testDiscordWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await api.post<{ success: boolean; error?: string }>(
      '/api/admin/discord/test',
      { webhookUrl }
    )
    return data
  },

  /**
   * Manually post a battle to discord
   */
  async postBattleToDiscord(eventId: number): Promise<void> {
    await api.post(`/api/admin/pvp/events/${eventId}/discord`)
  },

}

/**
 * User Management API endpoints (Overlord only)
 */
export const userManagementApi = {
  /**
   * Get paginated list of users with filters
   */
  async getUserList(params: {
    search?: string
    race?: string
    class?: string
    alignment?: number
    ban_status?: 'all' | 'active' | 'banned'
    page?: number
    limit?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }): Promise<any> {
    const { data } = await api.get('/api/admin/users', { params })
    return data
  },

  /**
   * Get list of unique races for filter dropdown
   */
  async getRaces(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/admin/users/filters/races')
    return data
  },

  /**
   * Get list of unique classes for filter dropdown
   */
  async getClasses(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/admin/users/filters/classes')
    return data
  },

  /**
   * Ban a user
   */
  async banUser(accountName: string, reason: string): Promise<void> {
    await api.post(`/api/admin/users/${accountName}/ban`, { reason })
  },

  /**
   * Unban a user
   */
  async unbanUser(accountName: string): Promise<void> {
    await api.post(`/api/admin/users/${accountName}/unban`)
  },

  /**
   * Get user's ban history
   */
  async getBanHistory(accountName: string): Promise<any[]> {
    const { data } = await api.get<any[]>(`/api/admin/users/${accountName}/ban-history`)
    return data
  },

  /**
   * Delete a character from an account
   */
  async deleteCharacter(accountName: string, characterName: string): Promise<void> {
    await api.delete(`/api/admin/users/${encodeURIComponent(accountName)}/characters/${encodeURIComponent(characterName)}`)
  },
}

/**
 * Analytics API endpoints (Overlord only)
 */
export const analyticsApi = {
  /**
   * Get overview statistics
   */
  async getOverviewStats(): Promise<{ stats: any }> {
    const { data } = await api.get('/api/admin/analytics/overview')
    return data
  },

  /**
   * Get forum analytics
   */
  async getForumStats(): Promise<{ stats: any }> {
    const { data } = await api.get('/api/admin/analytics/forum')
    return data
  },

  /**
   * Get PvP analytics
   */
  async getPvPStats(): Promise<{ stats: any }> {
    const { data } = await api.get('/api/admin/analytics/pvp')
    return data
  },

  /**
   * Get player demographics
   */
  async getPlayerStats(): Promise<{ stats: any }> {
    const { data } = await api.get('/api/admin/analytics/players')
    return data
  },

  /**
   * Get server health metrics
   */
  async getServerHealth(): Promise<{ health: any }> {
    const { data } = await api.get('/api/admin/analytics/server')
    return data
  },

  /**
   * Get WHO list (currently online players)
   */
  async getWhoList(): Promise<{ players: any[] }> {
    const { data } = await api.get('/api/admin/who')
    return data
  },

  /**
   * Clean up stale connections and get refreshed WHO list
   */
  async cleanupAndRefreshWho(): Promise<{ success: boolean; message: string; whoList: any[] }> {
    const { data } = await api.post('/api/admin/analytics/cleanup-connections')
    return data
  },

  /**
   * Get player activity over time for charts
   */
  async getPlayerActivity(hours: number = 24): Promise<{ activity: Array<{ timestamp: number; playerCount: number }> }> {
    const { data } = await api.get(`/api/admin/analytics/activity?hours=${hours}`)
    return data
  },
}

/**
 * User Profile API endpoints
 */
export const profileApi = {
  /**
   * Get user profile with stats
   */
  async getUserProfile(accountName: string): Promise<UserProfileWithStats> {
    const { data } = await api.get<UserProfileWithStats>(`/api/forum/users/${accountName}/profile`)
    return data
  },

  /**
   * Update own profile
   */
  async updateProfile(updates: { bio?: string; website?: string; location?: string }): Promise<void> {
    await api.patch('/api/forum/users/me/profile', updates)
  },

  /**
   * Get user's posts with pagination
   */
  async getUserPosts(accountName: string, page: number = 1, limit: number = 50): Promise<{
    posts: UserPost[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/users/${accountName}/posts`, {
      params: { page, limit }
    })
    return data
  },

  /**
   * Get user's threads with pagination
   */
  async getUserThreads(accountName: string, page: number = 1, limit: number = 50): Promise<{
    threads: UserThread[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/users/${accountName}/threads`, {
      params: { page, limit }
    })
    return data
  },

  /**
   * Upload own avatar
   */
  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData()
    formData.append('avatar', file)
    const { data } = await api.post('/api/forum/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  /**
   * Upload avatar for another user (admin only)
   */
  async uploadUserAvatar(accountName: string, file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData()
    formData.append('avatar', file)
    const { data } = await api.post(`/api/forum/users/${accountName}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  /**
   * Delete own avatar
   */
  async deleteAvatar(): Promise<void> {
    await api.delete('/api/forum/users/me/avatar')
  },

  /**
   * Delete avatar for another user (admin only)
   */
  async deleteUserAvatar(accountName: string): Promise<void> {
    await api.delete(`/api/forum/users/${accountName}/avatar`)
  },

  /**
   * Get account characters with stats
   */
  async getAccountCharacters(accountName: string): Promise<AccountCharactersResponse> {
    const { data } = await api.get<AccountCharactersResponse>(`/api/forum/users/${accountName}/characters`)
    return data
  },

  /**
   * Get account name for a character
   */
  async getCharacterAccount(characterName: string): Promise<{ accountName: string }> {
    const { data } = await api.get<{ accountName: string }>(`/api/forum/characters/${encodeURIComponent(characterName)}/account`)
    return data
  },

  /**
   * Batch lookup account names for multiple characters
   */
  async getCharacterAccountsBatch(characterNames: string[]): Promise<Record<string, string>> {
    const { data } = await api.post<Record<string, string>>('/api/forum/characters/batch/accounts', { characterNames })
    return data
  },

  /**
   * Upload own banner
   */
  async uploadBanner(file: File): Promise<{ bannerUrl: string }> {
    const formData = new FormData()
    formData.append('banner', file)
    const { data } = await api.post('/api/forum/users/me/banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  /**
   * Upload banner for another user (admin only)
   */
  async uploadUserBanner(accountName: string, file: File): Promise<{ bannerUrl: string }> {
    const formData = new FormData()
    formData.append('banner', file)
    const { data } = await api.post(`/api/forum/users/${accountName}/banner`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  /**
   * Delete own banner
   */
  async deleteBanner(): Promise<void> {
    await api.delete('/api/forum/users/me/banner')
  },

  /**
   * Delete banner for another user (admin only)
   */
  async deleteUserBanner(accountName: string): Promise<void> {
    await api.delete(`/api/forum/users/${accountName}/banner`)
  },
}

// Character Profile API
export const characterApi = {
  /**
   * Get character profile with stats
   */
  async getCharacterProfile(characterName: string): Promise<any> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/profile`)
    return data
  },

  /**
   * Get character's forum posts with pagination
   */
  async getCharacterPosts(characterName: string, page: number = 1, limit: number = 20): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/posts`, {
      params: { page, limit }
    })
    return data
  },

  /**
   * Get character's PvP events with pagination
   */
  async getCharacterPvPEvents(characterName: string, page: number = 1, limit: number = 20): Promise<{
    events: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/pvp`, {
      params: { page, limit }
    })
    return data
  },
}

// Guild Profile API
export const guildApi = {
  /**
   * Get guild profile with stats
   */
  async getGuildProfile(guildName: string): Promise<any> {
    const { data } = await api.get(`/api/forum/guilds/${encodeURIComponent(guildName)}/profile`)
    return data
  },

  /**
   * Get guild's forum activity with pagination
   */
  async getGuildForumActivity(guildName: string, page: number = 1, limit: number = 20): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/guilds/${encodeURIComponent(guildName)}/activity`, {
      params: { page, limit }
    })
    return data
  },
}

/**
 * Frag Leaderboard API endpoints
 */
export const fragApi = {
  /**
   * Get frag leaderboard with filters
   */
  async getLeaderboard(filters: any = {}): Promise<any> {
    const params = new URLSearchParams()

    if (filters.racewar !== undefined) params.append('racewar', filters.racewar.toString())
    if (filters.race) params.append('race', filters.race)
    if (filters.class) params.append('class', filters.class)
    if (filters.level_min !== undefined) params.append('level_min', filters.level_min.toString())
    if (filters.level_max !== undefined) params.append('level_max', filters.level_max.toString())
    if (filters.account_name) params.append('account_name', filters.account_name)
    if (filters.char_name) params.append('char_name', filters.char_name)
    if (filters.min_frags !== undefined) params.append('min_frags', filters.min_frags.toString())
    if (filters.include_deleted) params.append('include_deleted', 'true')
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())

    const { data } = await api.get(`/api/frag/leaderboard?${params}`)
    return data
  },

  /**
   * Get top frag gainers over a time period
   */
  async getTopGainers(period: '7d' | '30d' | '90d' = '30d', limit: number = 50): Promise<any> {
    const params = new URLSearchParams()
    params.append('period', period)
    params.append('limit', limit.toString())

    const { data } = await api.get(`/api/frag/top-gainers?${params}`)
    return data
  },

  /**
   * Get available races for autocomplete
   */
  async getRaces(): Promise<Array<{ value: string; label: string }>> {
    const { data } = await api.get('/api/frag/races')
    return data
  },

  /**
   * Get available classes for autocomplete
   */
  async getClasses(): Promise<Array<{ value: string; label: string }>> {
    const { data } = await api.get('/api/frag/classes')
    return data
  },

  /**
   * Get frag statistics for a specific character
   */
  async getCharacterStats(charName: string): Promise<any> {
    const { data } = await api.get(`/api/frag/player/${encodeURIComponent(charName)}`)
    return data
  },

  /**
   * Get all characters and their frag stats for an account
   */
  async getAccountStats(accountName: string): Promise<any[]> {
    const { data } = await api.get(`/api/frag/account/${encodeURIComponent(accountName)}`)
    return data
  },
}

/**
 * Git History API endpoints (Admin only)
 */
export const gitApi = {
  /**
   * Get paginated list of git commits
   */
  async getCommits(page: number = 1, limit: number = 50, refresh: boolean = false): Promise<import('@/types').GitCommitsResponse> {
    const { data } = await api.get('/api/admin/git/commits', {
      params: { page, limit, refresh: refresh ? 'true' : undefined }
    })
    return data
  },

  /**
   * Get current deployment status
   */
  async getStatus(): Promise<import('@/types').GitStatus> {
    const { data } = await api.get('/api/admin/git/status')
    return data
  },
}

/**
 * Zone Builder API endpoints
 * Uses zone ID (filename without extension) as unique identifier
 */
export const builderApi = {
  /**
   * Get list of zones with pagination
   */
  async getZones(params?: {
    page?: number
    limit?: number
    search?: string
    filterByAccess?: boolean
  }): Promise<{
    zones: import('@/types').ZoneIndex[]
    total: number
    page: number
    totalPages: number
    stats: {
      totalZones: number
      totalRooms: number
      totalMobs: number
      totalObjects: number
    }
  }> {
    const { data } = await api.get('/api/builder/zones', { params })
    return data
  },

  /**
   * Get zone map data (rooms with exits)
   */
  async getZone(zoneId: string): Promise<{ zone: import('@/types').ZoneMapData }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}`)
    return data
  },

  /**
   * Get zone header info
   */
  async getZoneHeader(zoneId: string): Promise<{ header: import('@/types').ZoneHeader; resetCount: number }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/header`)
    return data
  },

  /**
   * Get single room
   */
  async getRoom(zoneId: string, vnum: number): Promise<{ room: import('@/types').Room }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/rooms/${vnum}`)
    return data
  },

  /**
   * Update room
   */
  async updateRoom(zoneId: string, vnum: number, room: import('@/types').Room): Promise<{ success: boolean; room: import('@/types').Room }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/rooms/${vnum}`, room)
    return data
  },

  /**
   * Create new room
   */
  async createRoom(zoneId: string, room: Partial<import('@/types').Room>): Promise<{ success: boolean; room: import('@/types').Room }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/rooms`, room)
    return data
  },

  /**
   * Delete room
   */
  async deleteRoom(zoneId: string, vnum: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/builder/zones/${zoneId}/rooms/${vnum}`)
    return data
  },

  /**
   * Clone a room within the same zone
   */
  async cloneRoom(zoneId: string, sourceVnum: number, targetVnum?: number, count: number = 1): Promise<{ success: boolean; room: import('@/types').Room; vnum: number; vnums?: number[] }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/rooms/${sourceVnum}/clone`, { targetVnum, count })
    return data
  },

  /**
   * Global search across all zones
   */
  async globalSearch(
    query: string,
    type: 'all' | 'room' | 'mob' | 'object' = 'all',
    page: number = 1,
    limit: number = 20
  ): Promise<{
    results: Array<{
      type: 'room' | 'mob' | 'object'
      zoneId: string
      zoneName: string
      vnum: number
      name: string
      keywords?: string
      level?: number
      itemType?: number
    }>
    total: number
    page: number
    totalPages: number
  }> {
    const { data } = await api.get('/api/builder/search', {
      params: { query, type, page, limit },
    })
    return data
  },

  /**
   * Get builder activity log
   */
  async getBuilderActivity(params: {
    account?: string
    zone?: string
    entityType?: string
    limit?: number
    offset?: number
  } = {}): Promise<import('@/types').BuilderActivityResponse> {
    const { data } = await api.get('/api/builder/activity', {
      params: {
        account: params.account,
        zone: params.zone,
        entity_type: params.entityType,
        limit: params.limit,
        offset: params.offset,
      },
    })
    return data
  },

  /**
   * Get single mobile
   */
  async getMobile(zoneId: string, vnum: number): Promise<{ mobile: import('@/types').Mobile }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/mobs/${vnum}`)
    return data
  },

  /**
   * Update mobile
   */
  async updateMobile(zoneId: string, vnum: number, mobile: import('@/types').Mobile): Promise<{ success: boolean; mobile: import('@/types').Mobile }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/mobs/${vnum}`, mobile)
    return data
  },

  /**
   * Create new mobile
   */
  async createMobile(zoneId: string, mobile: Partial<import('@/types').Mobile>): Promise<{ success: boolean; mobile: import('@/types').Mobile }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/mobs`, mobile)
    return data
  },

  /**
   * Delete mobile
   */
  async deleteMobile(zoneId: string, vnum: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/builder/zones/${zoneId}/mobs/${vnum}`)
    return data
  },

  /**
   * Get single object
   */
  async getObject(zoneId: string, vnum: number): Promise<{ object: import('@/types').ZoneObject }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/objects/${vnum}`)
    return data
  },

  /**
   * Update object
   */
  async updateObject(zoneId: string, vnum: number, obj: import('@/types').ZoneObject): Promise<{ success: boolean; object: import('@/types').ZoneObject }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/objects/${vnum}`, obj)
    return data
  },

  /**
   * Create new object
   */
  async createObject(zoneId: string, obj: Partial<import('@/types').ZoneObject>): Promise<{ success: boolean; object: import('@/types').ZoneObject }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/objects`, obj)
    return data
  },

  /**
   * Delete object
   */
  async deleteObject(zoneId: string, vnum: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/builder/zones/${zoneId}/objects/${vnum}`)
    return data
  },

  /**
   * Get all flag definitions
   */
  async getFlags(): Promise<import('@/types').BuilderFlags> {
    const { data } = await api.get('/api/builder/flags')
    return data
  },

  /**
   * Sync flags from MUD source code to database
   */
  async syncFlags(): Promise<{
    success: boolean
    stats: {
      inserted: number
      updated: number
      deleted: number
      categories: string[]
    }
  }> {
    const { data } = await api.post('/api/builder/flags/sync')
    return data
  },

  /**
   * Get all flag categories with counts
   */
  async getFlagCategories(): Promise<Array<{
    category: string
    count: number
    lastUpdated: string
  }>> {
    const { data } = await api.get('/api/builder/flags/categories')
    return data
  },

  /**
   * Get next available vnum
   */
  async getNextVnum(zoneId: string, type: 'room' | 'mob' | 'obj'): Promise<{ nextVnum: number }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/next-vnum/${type}`)
    return data
  },

  /**
   * Create a new zone
   */
  async createZone(zoneNumber: number, zoneName: string): Promise<{ success: boolean; zoneId: string; zoneNumber: number; zoneName: string }> {
    const { data } = await api.post('/api/builder/zones', { zoneNumber, zoneName })
    return data
  },

  /**
   * Delete a zone
   */
  async deleteZone(zoneId: string): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/builder/zones/${zoneId}`)
    return data
  },

  /**
   * Clone a zone
   */
  async cloneZone(sourceZoneId: string, targetZoneNumber: number, zoneName?: string): Promise<{ success: boolean; sourceZoneId: string; newZoneId: string; targetZoneNumber: number }> {
    const { data } = await api.post(`/api/builder/zones/${sourceZoneId}/clone`, { targetZoneNumber, zoneName })
    return data
  },

  /**
   * Get room positions for zone map
   */
  async getZonePositions(zoneId: string): Promise<import('@/types').ZonePositions> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/positions`)
    return data
  },

  /**
   * Save room positions for zone map
   */
  async saveZonePositions(zoneId: string, positions: Record<number, import('@/types').RoomPosition>): Promise<{ success: boolean }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/positions`, { positions })
    return data
  },

  /**
   * Validate an exit (quick validation for real-time feedback)
   */
  async validateExit(zoneId: string, toRoom?: number, keyVnum?: number): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/validate/exit`, { toRoom, keyVnum })
    return data
  },

  /**
   * Validate object values (quick validation for real-time feedback)
   */
  async validateObjectValues(zoneId: string, itemType: number, values: number[]): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/validate/object-values`, { itemType, values })
    return data
  },

  /**
   * Save zone resets
   */
  async saveZoneResets(zoneId: string, resets: import('@/types').ResetCommand[]): Promise<{ success: boolean; resetCount: number }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/resets`, { resets })
    return data
  },

  /**
   * Get git status for zone files
   */
  async getZoneGitStatus(zoneId: string): Promise<{
    modified: boolean
    files: Array<{ path: string; status: 'modified' | 'new' | 'deleted' }>
  }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/git/status`)
    return data
  },

  /**
   * Commit zone files to git
   */
  async commitZone(zoneId: string, message: string): Promise<{
    success: boolean
    commitHash?: string
    error?: string
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/git/commit`, { message })
    return data
  },

  /**
   * Get builder settings
   */
  async getBuilderSettings(): Promise<Record<string, string>> {
    const { data } = await api.get('/api/builder/settings')
    return data.settings
  },

  /**
   * Update builder settings
   */
  async updateBuilderSettings(settings: Record<string, string>): Promise<{ success: boolean }> {
    const { data } = await api.put('/api/builder/settings', { settings })
    return data
  },

  // ============================================================================
  // Phase 7: Zone Info, Permissions, Proc Requests, Comments
  // ============================================================================

  /**
   * Get zone info (documentation)
   */
  async getZoneInfo(zoneId: string): Promise<import('@/types').ZoneInfo | null> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/info`)
    return data.info
  },

  /**
   * Update zone info (create or update)
   */
  async updateZoneInfo(zoneId: string, info: import('@/types').ZoneInfoUpdate): Promise<import('@/types').ZoneInfo> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/info`, info)
    return data.info
  },

  /**
   * Get zone info edit history
   */
  async getZoneInfoHistory(zoneId: string, limit: number = 50, offset: number = 0): Promise<import('@/types').ZoneInfoHistoryResponse> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/info/history`, {
      params: { limit, offset },
    })
    return data
  },

  // ============================================================================
  // Builder Notification Methods
  // ============================================================================

  /**
   * Get notifications for current user
   */
  async getBuilderNotifications(
    params?: { isRead?: boolean; limit?: number; offset?: number }
  ): Promise<import('@/types').BuilderNotificationsResponse> {
    const { data } = await api.get('/api/builder/notifications', { params })
    return data
  },

  /**
   * Get unread notification count
   */
  async getBuilderNotificationUnreadCount(): Promise<number> {
    const { data } = await api.get('/api/builder/notifications/unread-count')
    return data.count
  },

  /**
   * Mark a notification as read
   */
  async markBuilderNotificationAsRead(notificationId: number): Promise<void> {
    await api.put(`/api/builder/notifications/${notificationId}/read`)
  },

  /**
   * Mark all notifications as read
   */
  async markAllBuilderNotificationsAsRead(): Promise<{ markedCount: number }> {
    const { data } = await api.put('/api/builder/notifications/read-all')
    return data
  },

  /**
   * Get zone permissions list
   */
  async getZonePermissions(zoneId: string): Promise<import('@/types').ZonePermission[]> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/permissions`)
    return data.permissions
  },

  /**
   * Grant zone permission to account
   */
  async grantZonePermission(zoneId: string, accountName: string, permissionLevel: import('@/types').ZonePermissionLevel): Promise<void> {
    await api.post(`/api/builder/zones/${zoneId}/permissions`, { accountName, permissionLevel })
  },

  /**
   * Revoke zone permission from account
   */
  async revokeZonePermission(zoneId: string, accountName: string): Promise<void> {
    await api.delete(`/api/builder/zones/${zoneId}/permissions/${accountName}`)
  },

  /**
   * Check user's access to a zone
   */
  async checkZoneAccess(zoneId: string): Promise<import('@/types').ZoneAccessResponse> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/access`)
    return data
  },

  /**
   * Get zones accessible to current user (for dashboard filtering)
   */
  async getAccessibleZones(): Promise<string[] | null> {
    const { data } = await api.get('/api/builder/accessible-zones')
    return data.zoneIds
  },

  /**
   * Search accounts for permissions autocomplete
   */
  async searchAccounts(query: string, limit: number = 10): Promise<string[]> {
    const { data } = await api.get('/api/builder/accounts/search', {
      params: { q: query, limit },
    })
    return data.accounts
  },

  // --- Proc Requests ---

  /**
   * Get proc requests for a zone
   */
  async getProcRequests(zoneId: string, filters?: {
    status?: import('@/types').ProcRequestStatus
    entityType?: import('@/types').ProcRequestEntityType
    assignedTo?: string
  }): Promise<import('@/types').ProcRequest[]> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/proc-requests`, { params: filters })
    return data.procRequests
  },

  /**
   * Get single proc request
   */
  async getProcRequest(zoneId: string, requestId: number): Promise<import('@/types').ProcRequest> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/proc-requests/${requestId}`)
    return data.request
  },

  /**
   * Create proc request
   */
  async createProcRequest(zoneId: string, request: import('@/types').CreateProcRequest): Promise<import('@/types').ProcRequest> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/proc-requests`, request)
    return data.request
  },

  /**
   * Update proc request
   */
  async updateProcRequest(zoneId: string, requestId: number, updates: import('@/types').UpdateProcRequest): Promise<import('@/types').ProcRequest> {
    const { data } = await api.patch(`/api/builder/zones/${zoneId}/proc-requests/${requestId}`, updates)
    return data.request
  },

  /**
   * Update proc request status only
   */
  async updateProcRequestStatus(zoneId: string, requestId: number, status: import('@/types').ProcRequestStatus, assignedTo?: string | null): Promise<import('@/types').ProcRequest> {
    const { data } = await api.patch(`/api/builder/zones/${zoneId}/proc-requests/${requestId}/status`, { status, assignedTo })
    return data.request
  },

  /**
   * Delete proc request
   */
  async deleteProcRequest(zoneId: string, requestId: number): Promise<void> {
    await api.delete(`/api/builder/zones/${zoneId}/proc-requests/${requestId}`)
  },

  /**
   * Get proc requests assigned to current user
   */
  async getMyProcRequests(): Promise<import('@/types').ProcRequest[]> {
    const { data } = await api.get('/api/builder/my-proc-requests')
    return data.requests
  },

  // --- Zone Comments ---

  /**
   * Get comments for a zone (optionally filtered by proc request)
   */
  async getZoneComments(zoneId: string, procRequestId?: number | null): Promise<import('@/types').ZoneComment[]> {
    const params: Record<string, string> = {}
    if (procRequestId !== undefined) {
      params.procRequestId = procRequestId === null ? 'null' : procRequestId.toString()
    }
    const { data } = await api.get(`/api/builder/zones/${zoneId}/comments`, { params })
    return data.comments
  },

  /**
   * Create zone comment
   */
  async createZoneComment(zoneId: string, comment: import('@/types').CreateZoneComment): Promise<import('@/types').ZoneComment> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/comments`, comment)
    return data.comment
  },

  /**
   * Update zone comment
   */
  async updateZoneComment(zoneId: string, commentId: number, updates: import('@/types').UpdateZoneComment): Promise<import('@/types').ZoneComment> {
    const { data } = await api.patch(`/api/builder/zones/${zoneId}/comments/${commentId}`, updates)
    return data.comment
  },

  /**
   * Delete zone comment
   */
  async deleteZoneComment(zoneId: string, commentId: number): Promise<void> {
    await api.delete(`/api/builder/zones/${zoneId}/comments/${commentId}`)
  },
}

// Wiki API
export const wikiApi = {
  /**
   * Get wiki access level (public or registered)
   */
  async getAccessLevel(): Promise<{ accessLevel: 'public' | 'registered' }> {
    const { data } = await api.get('/api/wiki/access')
    return data
  },

  /**
   * Get all continents
   */
  async getContinents(): Promise<WikiContinent[]> {
    const { data } = await api.get<WikiContinent[]>('/api/wiki/map/continents')
    return data
  },

  /**
   * Get map bounds (optionally for a specific layer)
   */
  async getMapBounds(layer?: number): Promise<WikiMapBounds> {
    const params = layer !== undefined ? { layer } : {}
    const { data } = await api.get<WikiMapBounds>('/api/wiki/map/bounds', { params })
    return data
  },

  /**
   * Get world map as PNG image
   * @param layer - The map layer (0 = surface, -1 = underdark, etc.)
   * @returns PNG blob
   */
  async getWorldMapImage(layer: number = 0): Promise<Blob> {
    const response = await api.get(`/api/wiki/map/image`, {
      params: { layer },
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Get available map layers
   */
  async getMapLayers(): Promise<{ id: number; name: string; description: string }[]> {
    const { data } = await api.get<{ id: number; name: string; description: string }[]>('/api/wiki/map/layers')
    return data
  },

  /**
   * Get map tiles for viewport
   */
  async getMapTiles(bounds: WikiMapBounds, layer: number = 0): Promise<WikiMapTile[]> {
    const params = new URLSearchParams({
      minX: bounds.minX.toString(),
      maxX: bounds.maxX.toString(),
      minY: bounds.minY.toString(),
      maxY: bounds.maxY.toString(),
      layer: layer.toString(),
    })
    const { data } = await api.get<WikiMapTile[]>(`/api/wiki/map/tiles?${params}`)
    return data
  },

  /**
   * Get zone entrances for viewport
   */
  async getZoneEntrances(bounds: WikiMapBounds, layer: number = 0): Promise<WikiZoneEntrance[]> {
    const params = new URLSearchParams({
      minX: bounds.minX.toString(),
      maxX: bounds.maxX.toString(),
      minY: bounds.minY.toString(),
      maxY: bounds.maxY.toString(),
      layer: layer.toString(),
    })
    const { data } = await api.get<WikiZoneEntrance[]>(`/api/wiki/map/entrances?${params}`)
    return data
  },

  /**
   * Search zones for autocomplete with infinite scroll support
   */
  async searchZones(query: string = '', limit: number = 20, offset: number = 0): Promise<{ zones: { number: number; name: string }[]; hasMore: boolean }> {
    const { data } = await api.get<{ zones: { number: number; name: string }[]; hasMore: boolean }>('/api/wiki/zones/search', {
      params: { q: query, limit, offset }
    })
    return data
  },

  /**
   * Get paginated zone list
   */
  async getZones(
    filters: WikiZoneFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'number',
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Promise<{ zones: WikiZone[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.alignmentMin !== undefined) params.append('alignmentMin', filters.alignmentMin.toString())
    if (filters.alignmentMax !== undefined) params.append('alignmentMax', filters.alignmentMax.toString())
    if (filters.difficultyMin !== undefined) params.append('difficultyMin', filters.difficultyMin.toString())
    if (filters.difficultyMax !== undefined) params.append('difficultyMax', filters.difficultyMax.toString())
    if (filters.epicTypes && filters.epicTypes.length > 0) params.append('epicTypes', filters.epicTypes.join(','))
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())

    const { data } = await api.get(`/api/wiki/zones?${params}`)
    return data
  },

  /**
   * Get zone detail
   */
  async getZoneDetail(zoneNumber: number): Promise<WikiZoneDetail> {
    const { data } = await api.get<WikiZoneDetail>(`/api/wiki/zones/${zoneNumber}`)
    return data
  },

  /**
   * Get zone map data for Cytoscape.js
   */
  async getZoneMapData(zoneNumber: number): Promise<WikiZoneMapData> {
    const { data } = await api.get<WikiZoneMapData>(`/api/wiki/zones/${zoneNumber}/map-data`)
    return data
  },

  /**
   * Get object types for filters
   */
  async getObjectTypes(): Promise<WikiObjectType[]> {
    const { data } = await api.get<WikiObjectType[]>('/api/wiki/objects/types')
    return data
  },

  /**
   * Get wear slots for filters
   */
  async getWearSlots(): Promise<WikiWearSlot[]> {
    const { data } = await api.get<WikiWearSlot[]>('/api/wiki/objects/slots')
    return data
  },

  /**
   * Get affect types for filters
   */
  async getAffectTypes(): Promise<WikiAffectType[]> {
    const { data } = await api.get<WikiAffectType[]>('/api/wiki/objects/affects')
    return data
  },

  /**
   * Get paginated object list
   */
  async getObjects(
    filters: WikiObjectFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'vnum',
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Promise<{ objects: WikiObject[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.type !== undefined) params.append('type', filters.type.toString())
    if (filters.excludeTypes && filters.excludeTypes.length > 0) {
      params.append('excludeTypes', filters.excludeTypes.join(','))
    }
    if (filters.slot !== undefined) params.append('slot', filters.slot.toString())
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())
    if (filters.affectType !== undefined) params.append('affectType', filters.affectType.toString())
    if (filters.affects && filters.affects.length > 0) {
      params.append('affects', JSON.stringify(filters.affects))
    }
    if (filters.spellEffects && filters.spellEffects.length > 0) {
      params.append('spellEffects', filters.spellEffects.join(','))
    }
    if (filters.zone !== undefined) params.append('zone', filters.zone.toString())
    if (filters.allowedClass !== undefined) params.append('allowedClass', filters.allowedClass.toString())
    if (filters.allowedRace !== undefined) params.append('allowedRace', filters.allowedRace.toString())

    const { data } = await api.get(`/api/wiki/objects?${params}`)
    return data
  },

  /**
   * Get available spell effect types for filtering
   */
  async getSpellEffectTypes(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/wiki/objects/spell-effects')
    return data
  },

  /**
   * Get object classes for restriction filtering
   */
  async getObjectClasses(): Promise<{ id: number; name: string }[]> {
    const { data } = await api.get<{ id: number; name: string }[]>('/api/wiki/objects/classes')
    return data
  },

  /**
   * Get object races for restriction filtering
   */
  async getObjectRaces(): Promise<{ id: number; name: string }[]> {
    const { data } = await api.get<{ id: number; name: string }[]>('/api/wiki/objects/races')
    return data
  },

  /**
   * Get object detail
   */
  async getObjectDetail(vnum: number): Promise<WikiObjectDetail> {
    const { data } = await api.get<WikiObjectDetail>(`/api/wiki/objects/${vnum}`)
    return data
  },

  /**
   * Update wiki access level (admin only)
   */
  async setAccessLevel(accessLevel: 'public' | 'registered'): Promise<void> {
    await api.put('/api/wiki/settings/access', { accessLevel })
  },

  /**
   * Get mob classes for filters
   */
  async getMobClasses(): Promise<WikiMobClass[]> {
    const { data } = await api.get<WikiMobClass[]>('/api/wiki/mobs/classes')
    return data
  },

  /**
   * Get mob races for filters
   */
  async getMobRaces(): Promise<WikiMobRace[]> {
    const { data } = await api.get<WikiMobRace[]>('/api/wiki/mobs/races')
    return data
  },

  /**
   * Get act flags for legend
   */
  async getActFlags(): Promise<WikiActFlag[]> {
    const { data } = await api.get<WikiActFlag[]>('/api/wiki/mobs/flags')
    return data
  },

  /**
   * Get paginated mob list
   */
  async getMobs(
    filters: WikiMobFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'vnum',
    sortOrder: 'asc' | 'desc' = 'asc'
  ): Promise<{ mobs: WikiMob[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())
    if (filters.alignmentMin !== undefined) params.append('alignmentMin', filters.alignmentMin.toString())
    if (filters.alignmentMax !== undefined) params.append('alignmentMax', filters.alignmentMax.toString())
    if (filters.mobClass !== undefined) params.append('mobClass', filters.mobClass.toString())
    // New filters
    if (filters.race !== undefined) params.append('race', filters.race.toString())
    if (filters.flag !== undefined) params.append('flag', filters.flag.toString())
    if (filters.zone !== undefined) params.append('zone', filters.zone.toString())

    const { data } = await api.get(`/api/wiki/mobs?${params}`)
    return data
  },

  /**
   * Get mob detail (unique by zone + vnum)
   */
  async getMobDetail(zoneNumber: number, vnum: number): Promise<WikiMobDetail> {
    const { data } = await api.get<WikiMobDetail>(`/api/wiki/mobs/${zoneNumber}/${vnum}`)
    return data
  },

  /**
   * Get zone spawns (mobs and objects in each room)
   */
  async getZoneSpawns(zoneNumber: number): Promise<WikiZoneSpawns> {
    const { data } = await api.get<WikiZoneSpawns>(`/api/wiki/zones/${zoneNumber}/spawns`)
    return data
  },
}

// ========================================
// Public Guide (Help Files) API
// ========================================

import type {
  PublicHelpFile,
  PublicHelpFilesResponse,
  GuideCategoryWithCount,
  HelpSuggestion,
  HelpSuggestionsResponse,
  CreateHelpSuggestion,
  UpdateHelpSuggestion,
  ReviewHelpSuggestion,
  SuggestionStatus,
} from '@/types'

export const guideApi = {
  /**
   * Get all categories with article counts
   */
  async getCategories(): Promise<{ categories: GuideCategoryWithCount[] }> {
    const { data } = await api.get<{ categories: GuideCategoryWithCount[] }>('/api/guide/categories')
    return data
  },

  /**
   * Get paginated help files with optional filtering
   */
  async getHelpFiles(params: {
    page?: number
    limit?: number
    category_id?: number
    search?: string
  } = {}): Promise<PublicHelpFilesResponse> {
    const { data } = await api.get<PublicHelpFilesResponse>('/api/guide/help', { params })
    return data
  },

  /**
   * Search help files (quick search for instant results)
   */
  async searchHelpFiles(query: string, limit: number = 20): Promise<{ results: PublicHelpFile[] }> {
    const { data } = await api.get<{ results: PublicHelpFile[] }>('/api/guide/help/search', {
      params: { q: query, limit }
    })
    return data
  },

  /**
   * Get single help file by ID with full content
   */
  async getHelpFile(id: number): Promise<PublicHelpFile> {
    const { data } = await api.get<PublicHelpFile>(`/api/guide/help/${id}`)
    return data
  },
}

// ========================================
// Help File Suggestions API
// ========================================

export const helpSuggestionApi = {
  // ========== User Endpoints ==========

  /**
   * Get user's own suggestions
   */
  async getMySuggestions(status?: SuggestionStatus): Promise<HelpSuggestionsResponse> {
    const { data } = await api.get<HelpSuggestionsResponse>('/api/guide/suggestions', {
      params: status ? { status } : undefined,
    })
    return data
  },

  /**
   * Submit a new suggestion
   */
  async createSuggestion(suggestion: CreateHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.post<HelpSuggestion>('/api/guide/suggestions', suggestion)
    return data
  },

  /**
   * Get a specific suggestion (own only)
   */
  async getSuggestion(id: number): Promise<HelpSuggestion> {
    const { data } = await api.get<HelpSuggestion>(`/api/guide/suggestions/${id}`)
    return data
  },

  /**
   * Update own pending suggestion
   */
  async updateSuggestion(id: number, updates: UpdateHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.patch<HelpSuggestion>(`/api/guide/suggestions/${id}`, updates)
    return data
  },

  /**
   * Cancel own pending suggestion
   */
  async cancelSuggestion(id: number): Promise<void> {
    await api.delete(`/api/guide/suggestions/${id}`)
  },

  // ========== Admin Endpoints ==========

  /**
   * Get all suggestions for review (admin)
   */
  async getAdminQueue(params: {
    page?: number
    limit?: number
    status?: SuggestionStatus
  } = {}): Promise<HelpSuggestionsResponse & { pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const { data } = await api.get('/api/admin/help-suggestions', { params })
    return data
  },

  /**
   * Get pending suggestion count (admin badge)
   */
  async getPendingCount(): Promise<{ count: number }> {
    const { data } = await api.get<{ count: number }>('/api/admin/help-suggestions/pending-count')
    return data
  },

  /**
   * Get suggestion details for review (admin)
   */
  async getAdminSuggestion(id: number): Promise<HelpSuggestion> {
    const { data } = await api.get<HelpSuggestion>(`/api/admin/help-suggestions/${id}`)
    return data
  },

  /**
   * Review a suggestion (admin)
   */
  async reviewSuggestion(id: number, review: ReviewHelpSuggestion): Promise<HelpSuggestion> {
    const { data } = await api.patch<HelpSuggestion>(`/api/admin/help-suggestions/${id}/review`, review)
    return data
  },
}

// ============================================================================
// Unified Notifications API
// ============================================================================

export interface UnifiedNotificationsResponse {
  notifications: UnifiedNotification[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  unreadCount: number
}

export const notificationApi = {
  /**
   * Get all notifications (forum + builder combined)
   */
  async getNotifications(
    page: number = 1,
    limit: number = 50,
    unreadOnly: boolean = false
  ): Promise<UnifiedNotificationsResponse> {
    const { data } = await api.get<UnifiedNotificationsResponse>('/api/notifications', {
      params: { page, limit, unread_only: unreadOnly },
    })
    return data
  },

  /**
   * Get combined unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/api/notifications/unread-count')
    return data.count
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(id: number): Promise<void> {
    await api.post(`/api/notifications/${id}/read`)
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await api.post('/api/notifications/read-all')
  },

  /**
   * Delete a notification
   */
  async deleteNotification(id: number): Promise<void> {
    await api.delete(`/api/notifications/${id}`)
  },
}

// ==================== Auction API ====================

export const auctionApi = {
  /**
   * Get auction listings with optional filters
   */
  async getListings(filters: AuctionFilters = {}): Promise<PaginatedResponse<AuctionListItem>> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.seller) params.append('seller', filters.seller)
    if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice.toString())
    if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString())
    if (filters.hasBuyNow) params.append('hasBuyNow', 'true')
    if (filters.keywords?.length) params.append('keywords', filters.keywords.join(','))
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

    const { data } = await api.get<PaginatedResponse<AuctionListItem>>(
      `/api/auction/listings?${params}`
    )
    return data
  },

  /**
   * Get single auction detail
   */
  async getAuctionDetail(auctionId: number): Promise<AuctionDetail> {
    const { data } = await api.get<AuctionDetail>(`/api/auction/listings/${auctionId}`)
    return data
  },

  /**
   * Get bid history for an auction
   */
  async getBidHistory(auctionId: number): Promise<AuctionBidHistory[]> {
    const { data } = await api.get<AuctionBidHistory[]>(
      `/api/auction/listings/${auctionId}/history`
    )
    return data
  },

  /**
   * Get available filter keywords
   */
  async getKeywords(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/auction/keywords')
    return data
  },

  /**
   * Get auction statistics
   */
  async getStats(): Promise<AuctionStats> {
    const { data } = await api.get<AuctionStats>('/api/auction/stats')
    return data
  },

  /**
   * Get auction history (completed sales from last 30 days)
   */
  async getHistory(filters: AuctionHistoryFilters): Promise<PaginatedResponse<AuctionHistoryItem>> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.seller) params.append('seller', filters.seller)
    if (filters.buyer) params.append('buyer', filters.buyer)
    if (filters.page) params.append('page', String(filters.page))
    if (filters.limit) params.append('limit', String(filters.limit))
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

    const { data } = await api.get<PaginatedResponse<AuctionHistoryItem>>(
      `/api/auction/history?${params.toString()}`
    )
    return data
  },

  /**
   * Place a bid on an auction
   */
  async placeBid(auctionId: number, bidAmountCopper: number, characterPid: number): Promise<{ success: boolean; message: string; auctionClosed?: boolean }> {
    const { data } = await api.post(`/api/auction/listings/${auctionId}/bid`, {
      bidAmountCopper,
      characterPid,
    })
    return data
  },

  /**
   * Buy-it-now on an auction
   */
  async buyNow(auctionId: number, characterPid: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post(`/api/auction/listings/${auctionId}/buy`, {
      characterPid,
    })
    return data
  },

  /**
   * Admin: Remove an auction (returns item to seller, refunds bidder)
   */
  async removeAuction(auctionId: number, reason?: string): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/auction/listings/${auctionId}`, {
      data: { reason },
    })
    return data
  },
}

// Website Changelog API
export const changelogApi = {
  /**
   * Get published changelog entries (public)
   */
  async getEntries(page = 1, limit = 20): Promise<ChangelogListResponse> {
    const { data } = await api.get<ChangelogListResponse>(`/api/changelog?page=${page}&limit=${limit}`)
    return data
  },

  /**
   * Get single changelog entry
   */
  async getEntry(id: number): Promise<ChangelogEntry> {
    const { data } = await api.get<ChangelogEntry>(`/api/changelog/${id}`)
    return data
  },

  /**
   * Get unread count for banner
   */
  async getUnreadCount(): Promise<{ count: number }> {
    const { data } = await api.get<{ count: number }>('/api/changelog/unread-count')
    return data
  },

  /**
   * Mark entry as read
   */
  async markAsRead(id: number): Promise<{ success: boolean }> {
    const { data } = await api.post<{ success: boolean }>(`/api/changelog/${id}/read`)
    return data
  },

  /**
   * Mark all entries as read
   */
  async markAllAsRead(): Promise<{ success: boolean; count: number }> {
    const { data } = await api.post<{ success: boolean; count: number }>('/api/changelog/read-all')
    return data
  },

  // Admin endpoints
  /**
   * Get all entries for admin (including unpublished)
   */
  async getAdminEntries(page = 1, limit = 20): Promise<ChangelogListResponse> {
    const { data } = await api.get<ChangelogListResponse>(`/api/changelog/admin?page=${page}&limit=${limit}`)
    return data
  },

  /**
   * Create new changelog entry
   */
  async createEntry(entry: {
    version: string
    title: string
    content: string
    category: 'public' | 'admin'
    isPublished?: boolean
  }): Promise<{ id: number }> {
    const { data } = await api.post<{ id: number }>('/api/changelog', entry)
    return data
  },

  /**
   * Update changelog entry
   */
  async updateEntry(
    id: number,
    entry: Partial<{
      version: string
      title: string
      content: string
      category: 'public' | 'admin'
      isPublished: boolean
    }>
  ): Promise<{ success: boolean }> {
    const { data } = await api.put<{ success: boolean }>(`/api/changelog/${id}`, entry)
    return data
  },

  /**
   * Delete changelog entry
   */
  async deleteEntry(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(`/api/changelog/${id}`)
    return data
  },
}

// Public Statistics API
export interface FactionActivityPoint {
  timestamp: number
  goods: number
  evils: number
  neutrals: number
  undeads: number
}

export const publicStatsApi = {
  getFactionActivity: async (date: string) => {
    const response = await api.get(`/api/public/statistics/faction-activity`, {
      params: { date },
    })
    return response.data as { data: FactionActivityPoint[]; date: string }
  },

  getAvailableDates: async () => {
    const response = await api.get(`/api/public/statistics/available-dates`)
    return response.data as { dates: string[] }
  },
}

// Export axios instance for direct use
export { api as apiClient }

export default pvpApi

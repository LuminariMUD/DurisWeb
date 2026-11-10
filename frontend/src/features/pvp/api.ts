import { apiClient as api } from '@/services/httpClient'
import type {
  PvPEvent,
  BattleDetail,
  PaginatedResponse,
  PlayerStats,
  Leaderboard,
  LocationOption,
  PlayerOption,
  PvPBattleComment,
  PvPBattleStats,
  PvPFavoritesResponse,
} from '@/types'

// API Service Functions
export const pvpApi = {
  /**
   * Get paginated list of PvP events
   */
  async getEvents(filters: any = {}): Promise<PaginatedResponse<PvPEvent>> {
    const params = new URLSearchParams()

    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.date_from || filters.startDate)
      params.append('date_from', filters.date_from || filters.startDate)
    if (filters.date_to || filters.endDate)
      params.append('date_to', filters.date_to || filters.endDate)
    if (filters.player || filters.playerName)
      params.append('player', filters.player || filters.playerName)
    if (filters.location) params.append('location', filters.location)
    if (filters.sort_by) params.append('sort_by', filters.sort_by)
    if (filters.hour !== undefined && filters.hour !== null)
      params.append('hour', filters.hour.toString())

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
    const { data } = await api.get<PlayerStats>(
      `/api/pvp/stats/player/${encodeURIComponent(playerName)}`,
    )
    return data
  },

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    type: 'kills' | 'deaths' | 'kd_ratio' = 'kills',
    period: '7d' | '30d' | 'all' = '30d',
  ): Promise<Leaderboard> {
    const { data } = await api.get<Leaderboard>(
      `/api/pvp/stats/leaderboard?type=${type}&period=${period}`,
    )
    return data
  },

  /**
   * Search battles with advanced criteria
   */
  async search(query: any): Promise<PaginatedResponse<PvPEvent>> {
    const params = new URLSearchParams()

    // Support both naming conventions
    if (query.player || query.playerName) params.append('player', query.player || query.playerName)
    if (query.date_from || query.dateRange?.start)
      params.append('date_from', query.date_from || query.dateRange?.start)
    if (query.date_to || query.dateRange?.end)
      params.append('date_to', query.date_to || query.dateRange?.end)
    if (query.location) params.append('location', query.location)
    if (query.class && query.class.length > 0) params.append('class', query.class.join(','))
    if (query.race && query.race.length > 0) params.append('race', query.race.join(','))
    if (query.level_min || query.levelRange?.min)
      params.append('level_min', (query.level_min || query.levelRange?.min).toString())
    if (query.level_max || query.levelRange?.max)
      params.append('level_max', (query.level_max || query.levelRange?.max).toString())
    if (query.alignment) params.append('alignment', query.alignment)
    if (query.hour !== undefined && query.hour !== null)
      params.append('hour', query.hour.toString())
    if (query.sort_by) params.append('sort_by', query.sort_by)
    if (query.page) params.append('page', query.page.toString())
    if (query.limit) params.append('limit', query.limit.toString())

    const { data } = await api.get<PaginatedResponse<PvPEvent>>(`/api/pvp/search?${params}`)
    return data
  },

  /**
   * Get location autocomplete options
   */
  async getLocations(
    search?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<LocationOption[]> {
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
  async getPopularLocations(
    limit: number = 10,
    period: string = 'all',
  ): Promise<Array<{ location: string; kills: number }>> {
    const { data } = await api.get(
      `/api/pvp/analytics/popular-locations?limit=${limit}&period=${period}`,
    )
    return data
  },

  /**
   * Analytics: Get class matchup matrix
   */
  async getClassMatchups(
    period: string = 'all',
  ): Promise<Array<{ killer_class: string; victim_class: string; wins: number }>> {
    const { data } = await api.get(`/api/pvp/analytics/class-matchups?period=${period}`)
    return data
  },

  async getClientStats(period: string = '30d'): Promise<{
    clients: Array<{
      name: string
      count: number
      percentage: number
      versions: Array<{ version: string; count: number }>
    }>
    total: number
    period: string
  }> {
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
    participantId?: number,
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
  async getUserFavorites(
    accountName: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PvPFavoritesResponse> {
    const { data } = await api.get<PvPFavoritesResponse>(
      `/api/pvp/users/${encodeURIComponent(accountName)}/favorites?page=${page}&limit=${limit}`,
    )
    return data
  },
}

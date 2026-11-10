import { apiClient as api } from '@/services/httpClient'

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

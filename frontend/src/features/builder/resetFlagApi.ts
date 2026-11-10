import { apiClient as api } from '@/services/httpClient'

export const builderResetFlagApi = {
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
  async getFlagCategories(): Promise<
    Array<{
      category: string
      count: number
      lastUpdated: string
    }>
  > {
    const { data } = await api.get('/api/builder/flags/categories')
    return data
  },

  /**
   * Save zone resets
   */
  async saveZoneResets(
    zoneId: string,
    resets: import('@/types').ResetCommand[],
  ): Promise<{ success: boolean; resetCount: number }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/resets`, { resets })
    return data
  },
}

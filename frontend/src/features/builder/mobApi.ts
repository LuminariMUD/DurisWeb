import { apiClient as api } from '@/services/httpClient'

export const builderMobApi = {
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
  async updateMobile(
    zoneId: string,
    vnum: number,
    mobile: import('@/types').Mobile,
  ): Promise<{ success: boolean; mobile: import('@/types').Mobile }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/mobs/${vnum}`, mobile)
    return data
  },

  /**
   * Create new mobile
   */
  async createMobile(
    zoneId: string,
    mobile: Partial<import('@/types').Mobile>,
  ): Promise<{ success: boolean; mobile: import('@/types').Mobile }> {
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
}

import { apiClient as api } from '@/services/httpClient'

export const builderObjectApi = {
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
  async updateObject(
    zoneId: string,
    vnum: number,
    obj: import('@/types').ZoneObject,
  ): Promise<{ success: boolean; object: import('@/types').ZoneObject }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/objects/${vnum}`, obj)
    return data
  },

  /**
   * Create new object
   */
  async createObject(
    zoneId: string,
    obj: Partial<import('@/types').ZoneObject>,
  ): Promise<{ success: boolean; object: import('@/types').ZoneObject }> {
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
}

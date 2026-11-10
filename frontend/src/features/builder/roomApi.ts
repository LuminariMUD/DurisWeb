import { apiClient as api } from '@/services/httpClient'

export const builderRoomApi = {
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
  async updateRoom(
    zoneId: string,
    vnum: number,
    room: import('@/types').Room,
  ): Promise<{ success: boolean; room: import('@/types').Room }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/rooms/${vnum}`, room)
    return data
  },

  /**
   * Create new room
   */
  async createRoom(
    zoneId: string,
    room: Partial<import('@/types').Room>,
  ): Promise<{ success: boolean; room: import('@/types').Room }> {
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
  async cloneRoom(
    zoneId: string,
    sourceVnum: number,
    targetVnum?: number,
    count: number = 1,
  ): Promise<{ success: boolean; room: import('@/types').Room; vnum: number; vnums?: number[] }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/rooms/${sourceVnum}/clone`, {
      targetVnum,
      count,
    })
    return data
  },
}

import { apiClient as api } from '@/services/httpClient'

export const builderZoneApi = {
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
  async getZoneHeader(
    zoneId: string,
  ): Promise<{ header: import('@/types').ZoneHeader; resetCount: number }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/header`)
    return data
  },

  /**
   * Global search across all zones
   */
  async globalSearch(
    query: string,
    type: 'all' | 'room' | 'mob' | 'object' = 'all',
    page: number = 1,
    limit: number = 20,
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
  async getBuilderActivity(
    params: {
      account?: string
      zone?: string
      entityType?: string
      limit?: number
      offset?: number
    } = {},
  ): Promise<import('@/types').BuilderActivityResponse> {
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
   * Get next available vnum
   */
  async getNextVnum(zoneId: string, type: 'room' | 'mob' | 'obj'): Promise<{ nextVnum: number }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/next-vnum/${type}`)
    return data
  },

  /**
   * Create a new zone
   */
  async createZone(
    zoneNumber: number,
    zoneName: string,
  ): Promise<{ success: boolean; zoneId: string; zoneNumber: number; zoneName: string }> {
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
  async cloneZone(
    sourceZoneId: string,
    targetZoneNumber: number,
    zoneName?: string,
  ): Promise<{
    success: boolean
    sourceZoneId: string
    newZoneId: string
    targetZoneNumber: number
  }> {
    const { data } = await api.post(`/api/builder/zones/${sourceZoneId}/clone`, {
      targetZoneNumber,
      zoneName,
    })
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
  async saveZonePositions(
    zoneId: string,
    positions: Record<number, import('@/types').RoomPosition>,
  ): Promise<{ success: boolean }> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/positions`, { positions })
    return data
  },
}

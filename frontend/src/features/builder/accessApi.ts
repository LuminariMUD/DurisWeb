import { apiClient as api } from '@/services/httpClient'

export const builderAccessApi = {
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
  async updateZoneInfo(
    zoneId: string,
    info: import('@/types').ZoneInfoUpdate,
  ): Promise<import('@/types').ZoneInfo> {
    const { data } = await api.put(`/api/builder/zones/${zoneId}/info`, info)
    return data.info
  },

  /**
   * Get zone info edit history
   */
  async getZoneInfoHistory(
    zoneId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<import('@/types').ZoneInfoHistoryResponse> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/info/history`, {
      params: { limit, offset },
    })
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
  async grantZonePermission(
    zoneId: string,
    accountName: string,
    permissionLevel: import('@/types').ZonePermissionLevel,
  ): Promise<void> {
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
}

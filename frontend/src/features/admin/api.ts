import { apiClient as api } from '@/services/httpClient'
import { adminCommunityApi } from './communityApi.js'
import { adminBackupApi } from './backupApi.js'
import { adminMudControlApi } from './mudControlApi.js'
import { adminSettingsApi } from './settingsApi.js'
import { adminDiscordApi } from './discordApi.js'

/**
 * Admin API endpoints (Overlord only)
 */
export const adminApi = {
  ...adminCommunityApi,
  ...adminBackupApi,
  ...adminMudControlApi,
  ...adminSettingsApi,
  ...adminDiscordApi,
}

// ============================================================================
// Dupe Detection Types & API (Overlord only)
// ============================================================================

export interface DupedItem {
  /** BIGINT UNSIGNED, carried as a canonical decimal string. */
  obj_uid: string
  vnum: number
  /** Distinct vnums sharing this UID; > 1 means inconsistent item metadata. */
  vnum_count: number
  item_name: string | null
  item_name_ansi: string | null
  players: string
  total_count: number
  player_count: number
  created_at: string | null
}

export interface DupeDetail {
  id: number
  obj_uid: string
  vnum: number
  item_name: string | null
  item_name_ansi: string | null
  player_name: string
  pid: number
  location: string
  source: 'inventory' | 'locker'
  created_at: string | null
}

export interface DupeSummary {
  total_duped_uids: number
  total_duped_records: number
  player_pairs: Array<{ players: string; duped_items: number }>
}

/**
 * Dupe Detection API (Overlord only)
 */
export const dupeApi = {
  /**
   * Fetches all duplicate items and summary statistics.
   */
  async getDupes(): Promise<{ items: DupedItem[]; summary: DupeSummary }> {
    const { data } = await api.get('/api/admin/dupes')
    return data
  },

  /**
   * Fetches detailed location and ownership records for a specific duplicated obj_uid.
   */
  async getDupeDetails(objUid: string): Promise<{ details: DupeDetail[] }> {
    const { data } = await api.get(`/api/admin/dupes/${objUid}`)
    return data
  },

  /**
   * Deletes a specific inventory item copy by its id.
   */
  async deleteItem(itemId: number): Promise<void> {
    await api.delete(`/api/admin/dupes/item/${itemId}`)
  },

  /**
   * Deletes a specific locker item copy by its id.
   */
  async deleteLockerItem(itemId: number): Promise<void> {
    await api.delete(`/api/admin/dupes/locker-item/${itemId}`)
  },

  /**
   * Deletes all duplicate copies for a given obj_uid and vnum, keeping one copy.
   */
  async deleteAllDupes(objUid: string, vnum: number): Promise<{ deletedCount: number }> {
    const { data } = await api.delete(`/api/admin/dupes/uid/${objUid}/${vnum}`)
    return data
  },

  /**
   * Deletes multiple items by their ids in a single request.
   */
  async bulkDelete(itemIds: number[]): Promise<{ deletedCount: number }> {
    const { data } = await api.post('/api/admin/dupes/bulk-delete', { itemIds })
    return data
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
    await api.delete(
      `/api/admin/users/${encodeURIComponent(accountName)}/characters/${encodeURIComponent(characterName)}`,
    )
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
  async getPlayerActivity(
    hours: number = 24,
  ): Promise<{ activity: Array<{ timestamp: number; playerCount: number }> }> {
    const { data } = await api.get(`/api/admin/analytics/activity?hours=${hours}`)
    return data
  },
}

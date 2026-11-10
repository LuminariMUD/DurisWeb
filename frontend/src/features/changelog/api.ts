import { apiClient as api } from '@/services/httpClient'
import type { ChangelogEntry, ChangelogListResponse } from '@/types'

/** Website Changelog API. */
export const changelogApi = {
  /**
   * Get published changelog entries (public)
   */
  async getEntries(page = 1, limit = 20): Promise<ChangelogListResponse> {
    const { data } = await api.get<ChangelogListResponse>(
      `/api/changelog?page=${page}&limit=${limit}`,
    )
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
    const { data } = await api.get<ChangelogListResponse>(
      `/api/changelog/admin?page=${page}&limit=${limit}`,
    )
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
    }>,
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

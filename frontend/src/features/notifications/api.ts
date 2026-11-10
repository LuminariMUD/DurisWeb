import { apiClient as api } from '@/services/httpClient'
import type { UnifiedNotification } from '@/types'

export interface UnifiedNotificationsResponse {
  notifications: UnifiedNotification[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  unreadCount: number
}

export const notificationApi = {
  /**
   * Get all notifications (forum + builder combined)
   */
  async getNotifications(
    page: number = 1,
    limit: number = 50,
    unreadOnly: boolean = false,
  ): Promise<UnifiedNotificationsResponse> {
    const { data } = await api.get<UnifiedNotificationsResponse>('/api/notifications', {
      params: { page, limit, unread_only: unreadOnly },
    })
    return data
  },

  /**
   * Get combined unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/api/notifications/unread-count')
    return data.count
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(id: number): Promise<void> {
    await api.post(`/api/notifications/${id}/read`)
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await api.post('/api/notifications/read-all')
  },

  /**
   * Delete a notification
   */
  async deleteNotification(id: number): Promise<void> {
    await api.delete(`/api/notifications/${id}`)
  },
}

// ==================== Auction API ====================

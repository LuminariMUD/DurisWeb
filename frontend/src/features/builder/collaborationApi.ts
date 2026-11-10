import { apiClient as api } from '@/services/httpClient'

export const builderCollaborationApi = {
  // ============================================================================
  // Builder Notification Methods
  // ============================================================================

  /**
   * Get notifications for current user
   */
  async getBuilderNotifications(params?: {
    isRead?: boolean
    limit?: number
    offset?: number
  }): Promise<import('@/types').BuilderNotificationsResponse> {
    const { data } = await api.get('/api/builder/notifications', { params })
    return data
  },

  /**
   * Get unread notification count
   */
  async getBuilderNotificationUnreadCount(): Promise<number> {
    const { data } = await api.get('/api/builder/notifications/unread-count')
    return data.count
  },

  /**
   * Mark a notification as read
   */
  async markBuilderNotificationAsRead(notificationId: number): Promise<void> {
    await api.put(`/api/builder/notifications/${notificationId}/read`)
  },

  /**
   * Mark all notifications as read
   */
  async markAllBuilderNotificationsAsRead(): Promise<{ markedCount: number }> {
    const { data } = await api.put('/api/builder/notifications/read-all')
    return data
  },

  // --- Proc Requests ---

  /**
   * Get proc requests for a zone
   */
  async getProcRequests(
    zoneId: string,
    filters?: {
      status?: import('@/types').ProcRequestStatus
      entityType?: import('@/types').ProcRequestEntityType
      assignedTo?: string
    },
  ): Promise<import('@/types').ProcRequest[]> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/proc-requests`, {
      params: filters,
    })
    return data.procRequests
  },

  /**
   * Get single proc request
   */
  async getProcRequest(zoneId: string, requestId: number): Promise<import('@/types').ProcRequest> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/proc-requests/${requestId}`)
    return data.request
  },

  /**
   * Create proc request
   */
  async createProcRequest(
    zoneId: string,
    request: import('@/types').CreateProcRequest,
  ): Promise<import('@/types').ProcRequest> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/proc-requests`, request)
    return data.request
  },

  /**
   * Update proc request
   */
  async updateProcRequest(
    zoneId: string,
    requestId: number,
    updates: import('@/types').UpdateProcRequest,
  ): Promise<import('@/types').ProcRequest> {
    const { data } = await api.patch(
      `/api/builder/zones/${zoneId}/proc-requests/${requestId}`,
      updates,
    )
    return data.request
  },

  /**
   * Update proc request status only
   */
  async updateProcRequestStatus(
    zoneId: string,
    requestId: number,
    status: import('@/types').ProcRequestStatus,
    assignedTo?: string | null,
  ): Promise<import('@/types').ProcRequest> {
    const { data } = await api.patch(
      `/api/builder/zones/${zoneId}/proc-requests/${requestId}/status`,
      { status, assignedTo },
    )
    return data.request
  },

  /**
   * Delete proc request
   */
  async deleteProcRequest(zoneId: string, requestId: number): Promise<void> {
    await api.delete(`/api/builder/zones/${zoneId}/proc-requests/${requestId}`)
  },

  /**
   * Get proc requests assigned to current user
   */
  async getMyProcRequests(): Promise<import('@/types').ProcRequest[]> {
    const { data } = await api.get('/api/builder/my-proc-requests')
    return data.requests
  },

  // --- Zone Comments ---

  /**
   * Get comments for a zone (optionally filtered by proc request)
   */
  async getZoneComments(
    zoneId: string,
    procRequestId?: number | null,
  ): Promise<import('@/types').ZoneComment[]> {
    const params: Record<string, string> = {}
    if (procRequestId !== undefined) {
      params.procRequestId = procRequestId === null ? 'null' : procRequestId.toString()
    }
    const { data } = await api.get(`/api/builder/zones/${zoneId}/comments`, { params })
    return data.comments
  },

  /**
   * Create zone comment
   */
  async createZoneComment(
    zoneId: string,
    comment: import('@/types').CreateZoneComment,
  ): Promise<import('@/types').ZoneComment> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/comments`, comment)
    return data.comment
  },

  /**
   * Update zone comment
   */
  async updateZoneComment(
    zoneId: string,
    commentId: number,
    updates: import('@/types').UpdateZoneComment,
  ): Promise<import('@/types').ZoneComment> {
    const { data } = await api.patch(`/api/builder/zones/${zoneId}/comments/${commentId}`, updates)
    return data.comment
  },

  /**
   * Delete zone comment
   */
  async deleteZoneComment(zoneId: string, commentId: number): Promise<void> {
    await api.delete(`/api/builder/zones/${zoneId}/comments/${commentId}`)
  },
}

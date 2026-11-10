import { apiClient as api } from '@/services/httpClient'
import type {
  ForumCategory,
  ForumSettings,
  CategoryPermissions,
  AuditLogEntry,
  CategoryPermissionRule,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  AddPermissionRequest,
} from '@/types'

export const adminCommunityApi = {
  /**
   * Get forum settings
   */
  async getSettings(): Promise<ForumSettings> {
    const { data } = await api.get<{ settings: ForumSettings }>('/api/admin/forum/settings')
    return data.settings
  },

  /**
   * Update single forum setting
   */
  async updateSetting(key: string, value: string): Promise<void> {
    await api.put(`/api/admin/forum/settings/${key}`, { value })
  },

  /**
   * Get category permissions
   */
  async getCategoryPermissions(categoryId: number): Promise<CategoryPermissions> {
    const { data } = await api.get<{ permissions: CategoryPermissions }>(
      `/api/admin/forum/categories/${categoryId}/permissions`,
    )
    return data.permissions
  },

  /**
   * Update category permissions
   */
  async updateCategoryPermissions(
    categoryId: number,
    permissions: Partial<CategoryPermissions>,
  ): Promise<void> {
    await api.patch(`/api/admin/forum/categories/${categoryId}/permissions`, permissions)
  },

  /**
   * Get permission audit log
   */
  async getAuditLog(limit: number = 50): Promise<AuditLogEntry[]> {
    const { data } = await api.get<{ auditLog: AuditLogEntry[] }>(
      `/api/admin/forum/audit-log?limit=${limit}`,
    )
    return data.auditLog
  },

  // ============================================================================
  // Category Management (New)
  // ============================================================================

  /**
   * Get all non-archived categories (admin view)
   */
  async getAllCategories(): Promise<ForumCategory[]> {
    const { data } = await api.get<{ categories: ForumCategory[] }>(`/api/forum/categories`)
    return data.categories
  },

  /**
   * Get single category with ACL permissions (admin view)
   */
  async getCategoryDetails(categoryId: number): Promise<ForumCategory> {
    const { data } = await api.get<{ category: ForumCategory }>(
      `/api/admin/forum/categories/${categoryId}/details`,
    )
    return data.category
  },

  /**
   * Create new category
   */
  async createCategory(request: CreateCategoryRequest): Promise<number> {
    const { data } = await api.post<{ id: number }>('/api/forum/categories', request)
    return data.id
  },

  /**
   * Update category
   */
  async updateCategory(categoryId: number, request: UpdateCategoryRequest): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, request)
  },

  /**
   * Archive category (soft delete)
   */
  async archiveCategory(categoryId: number): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, { isArchived: true })
  },

  /**
   * Restore archived category
   */
  async restoreCategory(categoryId: number): Promise<void> {
    await api.patch(`/api/forum/categories/${categoryId}`, { isArchived: false })
  },

  /**
   * Permanently delete category
   */
  async deleteCategoryPermanent(categoryId: number): Promise<void> {
    await api.delete(`/api/forum/categories/${categoryId}`)
  },

  /**
   * Get archived categories
   */
  async getArchivedCategories(): Promise<{ categories: any[] }> {
    const { data } = await api.get<{ categories: any[] }>('/api/admin/archives/categories')
    return data
  },

  /**
   * Get deleted threads (paginated)
   */
  async getDeletedThreads(
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    threads: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get('/api/admin/archives/threads', {
      params: { page, limit },
    })
    return data
  },

  /**
   * Get deleted posts (paginated)
   */
  async getDeletedPosts(
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get('/api/admin/archives/posts', {
      params: { page, limit },
    })
    return data
  },

  /**
   * Restore deleted thread
   */
  async restoreThread(threadId: number): Promise<void> {
    await api.post(`/api/admin/forum/threads/${threadId}/restore`)
  },

  /**
   * Permanently delete thread
   */
  async deleteThreadPermanent(threadId: number): Promise<void> {
    await api.delete(`/api/admin/forum/threads/${threadId}`)
  },

  /**
   * Restore deleted post
   */
  async restorePost(postId: number): Promise<void> {
    await api.post(`/api/admin/forum/posts/${postId}/restore`)
  },

  /**
   * Permanently delete post
   */
  async deletePostPermanent(postId: number): Promise<void> {
    await api.delete(`/api/admin/forum/posts/${postId}`)
  },

  /**
   * Permanently delete category (dangerous!)
   */
  async deleteCategory(categoryId: number): Promise<void> {
    await api.delete(`/api/forum/categories/${categoryId}`)
  },

  /**
   * Reorder categories
   */
  async reorderCategories(orders: { id: number; sortOrder: number }[]): Promise<void> {
    await api.post('/api/admin/forum/categories/reorder', { orders })
  },

  /**
   * Get ACL permissions for a category
   */
  async getCategoryACL(categoryId: number): Promise<CategoryPermissionRule[]> {
    const { data } = await api.get<{ permissions: CategoryPermissionRule[] }>(
      `/api/admin/forum/categories/${categoryId}/acl`,
    )
    return data.permissions
  },

  /**
   * Add ACL permission rule
   */
  async addCategoryPermission(categoryId: number, request: AddPermissionRequest): Promise<number> {
    const { data } = await api.post<{ permissionId: number }>(
      `/api/admin/forum/categories/${categoryId}/acl`,
      request,
    )
    return data.permissionId
  },

  /**
   * Remove ACL permission rule
   */
  async removeCategoryPermission(categoryId: number, permissionId: number): Promise<void> {
    await api.delete(`/api/admin/forum/categories/${categoryId}/acl/${permissionId}`)
  },
}

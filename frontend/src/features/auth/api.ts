import { apiClient as api } from '@/services/httpClient'
import type { UserContext, AuthStatus } from '@/types'

/**
 * Authentication API endpoints
 */
export const authApi = {
  /**
   * Login with MUD credentials
   */
  async login(username: string, password: string): Promise<UserContext> {
    const { data } = await api.post<{ user: UserContext }>('/api/auth/login', {
      username,
      password,
    })
    return data.user
  },

  /**
   * Logout (invalidate refresh token)
   */
  async logout(): Promise<void> {
    await api.post('/api/auth/logout')
  },

  /**
   * Refresh access token
   */
  async refresh(): Promise<void> {
    await api.post('/api/auth/refresh')
  },

  /**
   * Get current user context (full profile)
   */
  async getMe(): Promise<UserContext | null> {
    const { data } = await api.get<{ user: UserContext | null }>('/api/auth/me')
    return data.user
  },

  /**
   * Quick auth status check
   */
  async checkAuth(): Promise<AuthStatus> {
    const { data } = await api.get<AuthStatus>('/api/auth/check')
    return data
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/api/auth/change-password', {
      currentPassword,
      newPassword,
    })
  },

  /**
   * Check if account exists (for registration validation)
   */
  async accountExists(accountName: string): Promise<boolean> {
    const { data } = await api.get<{ exists: boolean }>(
      `/api/auth/account-exists/${encodeURIComponent(accountName)}`,
    )
    return data.exists
  },
}

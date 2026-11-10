import { apiClient as api } from '@/services/httpClient'
import type { UserProfileWithStats, UserPost, UserThread, AccountCharactersResponse } from '@/types'

/**
 * User Profile API endpoints
 */
export const profileApi = {
  /**
   * Get user profile with stats
   */
  async getUserProfile(accountName: string): Promise<UserProfileWithStats> {
    const { data } = await api.get<UserProfileWithStats>(`/api/forum/users/${accountName}/profile`)
    return data
  },

  /**
   * Update own profile
   */
  async updateProfile(updates: {
    bio?: string
    website?: string
    location?: string
  }): Promise<void> {
    await api.patch('/api/forum/users/me/profile', updates)
  },

  /**
   * Get user's posts with pagination
   */
  async getUserPosts(
    accountName: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    posts: UserPost[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/users/${accountName}/posts`, {
      params: { page, limit },
    })
    return data
  },

  /**
   * Get user's threads with pagination
   */
  async getUserThreads(
    accountName: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    threads: UserThread[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/users/${accountName}/threads`, {
      params: { page, limit },
    })
    return data
  },

  /**
   * Upload own avatar
   */
  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData()
    formData.append('avatar', file)
    const { data } = await api.post('/api/forum/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * Upload avatar for another user (admin only)
   */
  async uploadUserAvatar(accountName: string, file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData()
    formData.append('avatar', file)
    const { data } = await api.post(`/api/forum/users/${accountName}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * Delete own avatar
   */
  async deleteAvatar(): Promise<void> {
    await api.delete('/api/forum/users/me/avatar')
  },

  /**
   * Delete avatar for another user (admin only)
   */
  async deleteUserAvatar(accountName: string): Promise<void> {
    await api.delete(`/api/forum/users/${accountName}/avatar`)
  },

  /**
   * Get account characters with stats
   */
  async getAccountCharacters(accountName: string): Promise<AccountCharactersResponse> {
    const { data } = await api.get<AccountCharactersResponse>(
      `/api/forum/users/${accountName}/characters`,
    )
    return data
  },

  /**
   * Get account name for a character
   */
  async getCharacterAccount(characterName: string): Promise<{ accountName: string }> {
    const { data } = await api.get<{ accountName: string }>(
      `/api/forum/characters/${encodeURIComponent(characterName)}/account`,
    )
    return data
  },

  /**
   * Batch lookup account names for multiple characters
   */
  async getCharacterAccountsBatch(characterNames: string[]): Promise<Record<string, string>> {
    const { data } = await api.post<Record<string, string>>(
      '/api/forum/characters/batch/accounts',
      { characterNames },
    )
    return data
  },

  /**
   * Upload own banner
   */
  async uploadBanner(file: File): Promise<{ bannerUrl: string }> {
    const formData = new FormData()
    formData.append('banner', file)
    const { data } = await api.post('/api/forum/users/me/banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * Upload banner for another user (admin only)
   */
  async uploadUserBanner(accountName: string, file: File): Promise<{ bannerUrl: string }> {
    const formData = new FormData()
    formData.append('banner', file)
    const { data } = await api.post(`/api/forum/users/${accountName}/banner`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * Delete own banner
   */
  async deleteBanner(): Promise<void> {
    await api.delete('/api/forum/users/me/banner')
  },

  /**
   * Delete banner for another user (admin only)
   */
  async deleteUserBanner(accountName: string): Promise<void> {
    await api.delete(`/api/forum/users/${accountName}/banner`)
  },
}

// Character Profile API
export const characterApi = {
  /**
   * Get character profile with stats
   */
  async getCharacterProfile(characterName: string): Promise<any> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/profile`)
    return data
  },

  /**
   * Get character's forum posts with pagination
   */
  async getCharacterPosts(
    characterName: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/posts`, {
      params: { page, limit },
    })
    return data
  },

  /**
   * Get character's PvP events with pagination
   */
  async getCharacterPvPEvents(
    characterName: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    events: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/characters/${characterName}/pvp`, {
      params: { page, limit },
    })
    return data
  },
}

// Guild Profile API
export const guildApi = {
  /**
   * Get guild profile with stats
   */
  async getGuildProfile(guildName: string): Promise<any> {
    const { data } = await api.get(`/api/forum/guilds/${encodeURIComponent(guildName)}/profile`)
    return data
  },

  /**
   * Get guild's forum activity with pagination
   */
  async getGuildForumActivity(
    guildName: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    posts: any[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const { data } = await api.get(`/api/forum/guilds/${encodeURIComponent(guildName)}/activity`, {
      params: { page, limit },
    })
    return data
  },
}

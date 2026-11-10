import { apiClient as api } from '@/services/httpClient'
import type { WebSettingRow } from '@/types'

export const adminSettingsApi = {
  // ============================================================================
  // Web Settings
  // ============================================================================

  /**
   * Get all web settings (for admin page)
   */
  async getWebSettings(): Promise<WebSettingRow[]> {
    const { data } = await api.get<{ settings: WebSettingRow[] }>('/api/admin/web/settings')
    return data.settings
  },

  /**
   * Update single web setting
   */
  async updateWebSetting(key: string, value: string): Promise<void> {
    await api.put(`/api/admin/web/settings/${key}`, { value })
  },

  /**
   * Upload site logo
   */
  async uploadSiteLogo(file: File): Promise<{ logoUrl: string }> {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await api.post<{ success: boolean; logoUrl: string }>(
      '/api/admin/web/logo',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return { logoUrl: data.logoUrl }
  },

  /**
   * Delete site logo
   */
  async deleteSiteLogo(): Promise<void> {
    await api.delete('/api/admin/web/logo')
  },

  /**
   * Upload hero image
   */
  async uploadHeroImage(file: File): Promise<{ heroUrl: string }> {
    const formData = new FormData()
    formData.append('hero', file)
    const { data } = await api.post<{ success: boolean; heroUrl: string }>(
      '/api/admin/web/hero-image',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return { heroUrl: data.heroUrl }
  },

  /**
   * Delete hero image
   */
  async deleteHeroImage(): Promise<void> {
    await api.delete('/api/admin/web/hero-image')
  },
}

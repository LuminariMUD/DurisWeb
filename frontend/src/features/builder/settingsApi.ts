import { apiClient as api } from '@/services/httpClient'

export const builderSettingsApi = {
  /**
   * Get builder settings
   */
  async getBuilderSettings(): Promise<Record<string, string>> {
    const { data } = await api.get('/api/builder/settings')
    return data.settings
  },

  /**
   * Update builder settings
   */
  async updateBuilderSettings(settings: Record<string, string>): Promise<{ success: boolean }> {
    const { data } = await api.put('/api/builder/settings', { settings })
    return data
  },
}

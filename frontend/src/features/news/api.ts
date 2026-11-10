import { apiClient as api } from '@/services/httpClient'
import type { NewsContent } from '@/types'

/**
 * News API endpoints
 */
export const newsApi = {
  /**
   * Get news content from mud_info table
   */
  async getNews(): Promise<NewsContent> {
    const { data } = await api.get<NewsContent>('/api/content/news')
    return data
  },
}

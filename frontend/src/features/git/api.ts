import { apiClient as api } from '@/services/httpClient'

/**
 * Git History API endpoints (Admin only)
 */
export const gitApi = {
  /**
   * Get paginated list of git commits
   */
  async getCommits(
    page: number = 1,
    limit: number = 50,
    refresh: boolean = false,
  ): Promise<import('@/types').GitCommitsResponse> {
    const { data } = await api.get('/api/admin/git/commits', {
      params: { page, limit, refresh: refresh ? 'true' : undefined },
    })
    return data
  },

  /**
   * Get current deployment status
   */
  async getStatus(): Promise<import('@/types').GitStatus> {
    const { data } = await api.get('/api/admin/git/status')
    return data
  },
}

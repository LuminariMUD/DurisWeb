import { apiClient as api } from '@/services/httpClient'

export const builderGitApi = {
  /**
   * Get git status for zone files
   */
  async getZoneGitStatus(zoneId: string): Promise<{
    modified: boolean
    files: Array<{ path: string; status: 'modified' | 'new' | 'deleted' }>
  }> {
    const { data } = await api.get(`/api/builder/zones/${zoneId}/git/status`)
    return data
  },

  /**
   * Commit zone files to git
   */
  async commitZone(
    zoneId: string,
    message: string,
  ): Promise<{
    success: boolean
    commitHash?: string
    error?: string
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/git/commit`, { message })
    return data
  },
}

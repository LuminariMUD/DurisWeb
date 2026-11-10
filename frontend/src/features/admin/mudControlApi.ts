import { apiClient as api } from '@/services/httpClient'

export const adminMudControlApi = {
  // MUD Control API methods
  /**
   * Get MUD status
   */
  async getMudStatus(): Promise<{
    state: string
    cycleMudPid: number | null
    dmsPid: number | null
    uptime: number
    cpu: number
    memory: number
    lastStartTime: string | null
    lastStopTime: string | null
    startedBy: string | null
  }> {
    const { data } = await api.get('/api/mud/status')
    return data
  },

  /**
   * Start the MUD
   */
  async startMud(): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/start')
    return data
  },

  /**
   * Stop the MUD
   */
  async stopMud(reason: string): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/stop', { reason })
    return data
  },

  /**
   * Restart the MUD
   */
  async restartMud(reason: string): Promise<{ success: boolean; message: string; logId: number }> {
    const { data } = await api.post('/api/mud/restart', { reason })
    return data
  },
}

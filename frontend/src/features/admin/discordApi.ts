import { apiClient as api } from '@/services/httpClient'
import type { DiscordDeliveryStatus } from '@/types'

export const adminDiscordApi = {
  /**
   * Test the configured Discord bot
   */
  async testDiscordBot(): Promise<{ success: boolean; error?: string }> {
    const { data } = await api.post<{ success: boolean; error?: string }>('/api/admin/discord/test')
    return data
  },

  async getDiscordDeliveryStatus(): Promise<DiscordDeliveryStatus> {
    const { data } = await api.get<DiscordDeliveryStatus>('/api/admin/discord/delivery')
    return data
  },

  async retryFailedDiscordDeliveries(): Promise<void> {
    await api.post('/api/admin/discord/delivery/retry')
  },

  /**
   * Manually post a battle to discord
   */
  async postBattleToDiscord(eventId: number): Promise<void> {
    await api.post(`/api/admin/pvp/events/${eventId}/discord`)
  },
}

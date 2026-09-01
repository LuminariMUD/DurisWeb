import { apiClient } from '@/services/api'
import type { HooksResponse, ReconcileResponse } from '@/types/hooks'

export const hooksApi = {
  async getAll(): Promise<HooksResponse> {
    const { data } = await apiClient.get<HooksResponse>('/api/hooks')
    return data
  },

  async setWebsite(id: string, enabled: boolean): Promise<ReconcileResponse['hook']> {
    const { data } = await apiClient.patch<{ hook: ReconcileResponse['hook'] }>(
      `/api/hooks/${encodeURIComponent(id)}`,
      { enabled },
    )
    return data.hook
  },

  async reconcile(id: string, enabled: boolean): Promise<ReconcileResponse> {
    const { data } = await apiClient.post<ReconcileResponse>(
      `/api/hooks/${encodeURIComponent(id)}/reconcile`,
      { enabled },
    )
    return data
  },
}

export function hookApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response
    if (typeof response?.data?.error === 'string') return response.data.error
  }
  return error instanceof Error ? error.message : 'Hook request failed'
}

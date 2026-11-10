import { apiClient as api } from '@/services/httpClient'

// Public API (no auth required)
/** Fetches untrusted public site configuration for boundary validation by the composable. */
export async function getSiteConfig(): Promise<unknown> {
  const { data } = await api.get<unknown>('/api/site-config')
  return data
}

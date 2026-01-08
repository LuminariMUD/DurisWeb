import { useQuery } from '@tanstack/vue-query'
import { newsApi } from '@/services/api'

/**
 * Fetch news content from mud_info table
 */
export function useNews() {
  return useQuery({
    queryKey: ['news'] as const,
    queryFn: () => newsApi.getNews(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

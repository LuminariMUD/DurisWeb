import { useQuery } from '@tanstack/vue-query'
import { namedSetsApi } from '@/features/namedSets/api'

export function useNamedSets() {
  return useQuery({
    queryKey: ['named-sets'],
    queryFn: () => namedSetsApi.getReport(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
}

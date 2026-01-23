import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRef, unref } from 'vue'
import { publicStatsApi } from '@/services/api'

export function useFactionActivity(date: MaybeRef<string>) {
  return useQuery({
    queryKey: computed(() => ['faction-activity', unref(date)]),
    queryFn: () => publicStatsApi.getFactionActivity(unref(date)),
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: computed(() => !!unref(date)),
  })
}

export function useAvailableDates() {
  return useQuery({
    queryKey: ['available-dates'],
    queryFn: () => publicStatsApi.getAvailableDates(),
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}

import { useQuery, keepPreviousData } from '@tanstack/vue-query'
import { fragApi } from '@/services/api'
import type {
  FragLeaderboardFilters,
  FragLeaderboardResponse,
  TopGainersResponse,
  AutocompleteOption,
} from '@/types'
import type { Ref } from 'vue'

/**
 * Hook for fetching frag leaderboard with filters
 */
export function useFragLeaderboard(filters: Ref<FragLeaderboardFilters>) {
  return useQuery<FragLeaderboardResponse>({
    queryKey: ['frag-leaderboard', filters],
    queryFn: () => fragApi.getLeaderboard(filters.value),
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
  })
}

/**
 * Hook for fetching top frag gainers
 */
export function useTopGainers(period: Ref<'7d' | '30d' | '90d'>, limit: number = 50) {
  return useQuery<TopGainersResponse>({
    queryKey: ['top-gainers', period],
    queryFn: () => fragApi.getTopGainers(period.value, limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
  })
}

/**
 * Hook for fetching available races (autocomplete)
 */
export function useFragRaces() {
  return useQuery<AutocompleteOption[]>({
    queryKey: ['frag-races'],
    queryFn: () => fragApi.getRaces(),
    staleTime: 1000 * 60 * 60, // 1 hour (races don't change often)
  })
}

/**
 * Hook for fetching available classes (autocomplete)
 */
export function useFragClasses() {
  return useQuery<AutocompleteOption[]>({
    queryKey: ['frag-classes'],
    queryFn: () => fragApi.getClasses(),
    staleTime: 1000 * 60 * 60, // 1 hour (classes don't change often)
  })
}

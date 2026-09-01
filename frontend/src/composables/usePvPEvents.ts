import { useQuery } from '@tanstack/vue-query'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'
import pvpApi from '@/services/api'
import type { PvPFilters } from '@/types'

export function usePvPEvents(filters: MaybeRef<PvPFilters> = {}) {
  return useQuery({
    queryKey: ['pvp-events', filters] as const,
    queryFn: () => pvpApi.getEvents(unref(filters)),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

export function useBattleDetail(eventId: MaybeRef<number>) {
  return useQuery({
    queryKey: ['battle-detail', eventId] as const,
    queryFn: () => pvpApi.getBattleDetail(unref(eventId)),
    enabled: () => !!unref(eventId),
  })
}

export function usePlayerStats(playerName: MaybeRef<string>) {
  return useQuery({
    queryKey: ['player-stats', playerName] as const,
    queryFn: () => pvpApi.getPlayerStats(unref(playerName)),
    enabled: () => !!unref(playerName),
  })
}

export function useLeaderboard(
  type: MaybeRef<'kills' | 'deaths' | 'kd_ratio'> = 'kills',
  period: MaybeRef<'7d' | '30d' | 'all'> = '30d',
) {
  return useQuery({
    queryKey: ['leaderboard', type, period] as const,
    queryFn: () => pvpApi.getLeaderboard(unref(type), unref(period)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useLocations(search: MaybeRef<string | undefined> = undefined) {
  return useQuery({
    queryKey: ['locations', search] as const,
    queryFn: () => pvpApi.getLocations(unref(search)),
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}

export function usePlayers(search: MaybeRef<string | undefined> = undefined) {
  return useQuery({
    queryKey: ['players', search] as const,
    queryFn: () => pvpApi.getPlayers(unref(search)),
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}

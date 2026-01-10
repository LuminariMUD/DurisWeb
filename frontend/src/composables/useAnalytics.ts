import { useQuery } from '@tanstack/vue-query';
import { computed, unref, type MaybeRef } from 'vue';
import pvpApi from '@/services/api';
import type { AnalyticsPeriod } from '@/types';

export function useKillTimeline(period: MaybeRef<AnalyticsPeriod> = '30d') {
  return useQuery({
    queryKey: computed(() => ['kill-timeline', unref(period)]),
    queryFn: () => pvpApi.getKillTimeline(unref(period)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useActiveHours(period: MaybeRef<AnalyticsPeriod> = 'all') {
  return useQuery({
    queryKey: computed(() => ['active-hours', unref(period)]),
    queryFn: () => pvpApi.getActiveHours(unref(period)),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function usePopularLocations(limit: number = 10, period: MaybeRef<AnalyticsPeriod> = 'all') {
  return useQuery({
    queryKey: computed(() => ['popular-locations', limit, unref(period)]),
    queryFn: () => pvpApi.getPopularLocations(limit, unref(period)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useClassMatchups(period: MaybeRef<AnalyticsPeriod> = 'all') {
  return useQuery({
    queryKey: computed(() => ['class-matchups', unref(period)]),
    queryFn: () => pvpApi.getClassMatchups(unref(period)),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useClientStats(period: MaybeRef<AnalyticsPeriod> = '30d') {
  return useQuery({
    queryKey: computed(() => ['client-stats', unref(period)]),
    queryFn: () => pvpApi.getClientStats(unref(period)),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

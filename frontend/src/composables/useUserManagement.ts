import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { userManagementApi } from '@/services/api'
import type { Ref } from 'vue'

export interface UserManagementFilters {
  search: string
  race: string
  class: string
  alignment: number | null
  ban_status: 'all' | 'active' | 'banned'
  page: number
  limit: number
  sort_by: string
  sort_order: 'asc' | 'desc'
}

/**
 * Hook for fetching user list with filters
 */
export function useUserList(filters: Ref<UserManagementFilters>) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => {
      // Transform alignment from null to undefined for API
      const params = {
        ...filters.value,
        alignment: filters.value.alignment ?? undefined
      }
      return userManagementApi.getUserList(params)
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook for fetching races for filter dropdown
 */
export function useRaces() {
  return useQuery({
    queryKey: ['user-races'],
    queryFn: () => userManagementApi.getRaces(),
    staleTime: 1000 * 60 * 10, // 10 minutes (rarely changes)
  })
}

/**
 * Hook for fetching classes for filter dropdown
 */
export function useClasses() {
  return useQuery({
    queryKey: ['user-classes'],
    queryFn: () => userManagementApi.getClasses(),
    staleTime: 1000 * 60 * 10, // 10 minutes (rarely changes)
  })
}

/**
 * Hook for banning a user
 */
export function useBanUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ accountName, reason }: { accountName: string; reason: string }) =>
      userManagementApi.banUser(accountName, reason),
    onSuccess: () => {
      // Invalidate user list to refresh data
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/**
 * Hook for unbanning a user
 */
export function useUnbanUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (accountName: string) => userManagementApi.unbanUser(accountName),
    onSuccess: () => {
      // Invalidate user list to refresh data
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/**
 * Hook for fetching user's ban history
 */
export function useBanHistory(accountName: Ref<string | null>) {
  return useQuery({
    queryKey: ['ban-history', accountName],
    queryFn: () => userManagementApi.getBanHistory(accountName.value!),
    enabled: () => !!accountName.value,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook for deleting a character
 */
export function useDeleteCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ accountName, characterName }: { accountName: string; characterName: string }) =>
      userManagementApi.deleteCharacter(accountName, characterName),
    onSuccess: () => {
      // Invalidate and refetch user list immediately
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.refetchQueries({ queryKey: ['users'] })
    },
  })
}

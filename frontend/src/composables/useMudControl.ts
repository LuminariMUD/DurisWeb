import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { adminApi } from '@/services/api'
import { useWebSocket } from './useWebSocket'

export interface MudStatus {
  state: 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown'
  cycleMudPid: number | null
  dmsPid: number | null
  uptime: number
  cpu: number
  memory: number
  lastStartTime: string | null
  lastStopTime: string | null
  startedBy: string | null
}

export function useMudControl() {
  const queryClient = useQueryClient()
  const { onMudStateChange, offMudStateChange } = useWebSocket()
  const actionInProgress = ref<string | null>(null)

  // Query for MUD status
  const {
    data: statusData,
    isLoading: statusLoading,
    error: statusError,
    refetch: refetchStatus
  } = useQuery({
    queryKey: ['mud-status'],
    queryFn: async () => {
      const result = await adminApi.getMudStatus()
      return result as MudStatus
    },
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 2000, // Consider data stale after 2 seconds
  })

  // Start mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      actionInProgress.value = 'start'
      return await adminApi.startMud()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mud-status'] })
    },
    onSettled: () => {
      actionInProgress.value = null
    }
  })

  // Stop mutation
  const stopMutation = useMutation({
    mutationFn: async (reason: string) => {
      actionInProgress.value = 'stop'
      return await adminApi.stopMud(reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mud-status'] })
    },
    onSettled: () => {
      actionInProgress.value = null
    }
  })

  // Restart mutation
  const restartMutation = useMutation({
    mutationFn: async (reason: string) => {
      actionInProgress.value = 'restart'
      return await adminApi.restartMud(reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mud-status'] })
    },
    onSettled: () => {
      actionInProgress.value = null
    }
  })

  // Handle WebSocket MUD state change updates
  const handleMudStateChange = (data: {
    state: string
    action?: string
    by?: string
    reason?: string
    timestamp?: string
  }) => {
    // Update the status in the cache
    queryClient.setQueryData<MudStatus>(['mud-status'], (oldData) => {
      if (!oldData) return oldData
      return {
        ...oldData,
        state: data.state as MudStatus['state'],
      }
    })

    // If state changed to running or stopped, refetch to get full status data
    if (data.state === 'running' || data.state === 'stopped') {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['mud-status'] })
      }, 1000)
    }
  }

  onMounted(() => {
    onMudStateChange(handleMudStateChange)
  })

  onUnmounted(() => {
    offMudStateChange(handleMudStateChange)
  })

  // Computed properties
  const status = computed(() => statusData.value || null)
  const isRunning = computed(() => status.value?.state === 'running')
  const isStopped = computed(() => status.value?.state === 'stopped')
  const isTransitioning = computed(() =>
    status.value?.state === 'starting' || status.value?.state === 'stopping'
  )

  return {
    status,
    statusLoading,
    statusError,
    refetchStatus,
    isRunning,
    isStopped,
    isTransitioning,
    actionInProgress,
    startMud: startMutation.mutateAsync,
    stopMud: stopMutation.mutateAsync,
    restartMud: restartMutation.mutateAsync,
    isStarting: computed(() => startMutation.isPending.value),
    isStopping: computed(() => stopMutation.isPending.value),
    isRestarting: computed(() => restartMutation.isPending.value),
    startError: computed(() => startMutation.error.value),
    stopError: computed(() => stopMutation.error.value),
    restartError: computed(() => restartMutation.error.value),
  }
}

// Utility function to format uptime
export function formatUptime(seconds: number): string {
  if (seconds === 0) return '-'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 && days === 0) parts.push(`${secs}s`)

  return parts.join(' ') || '0s'
}

// Utility function for relative time
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '-'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 0) return 'Just now' // Future date edge case
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffSecs > 10) return `${diffSecs} seconds ago`
  return 'Just now'
}

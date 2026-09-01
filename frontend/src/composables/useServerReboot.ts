import { useQuery } from '@tanstack/vue-query'
import { ref, computed, onScopeDispose } from 'vue'
import { apiClient } from '@/services/api'

interface CurrentReboot {
  bootTime: number
  uptime: number
  bootDate: string
}

interface ServerReboot {
  id: number
  bootTime: number
  shutdownTime: number | null
  uptimeSeconds: number | null
  createdAt: string
}

interface RebootHistory {
  reboots: ServerReboot[]
  total: number
  page: number
  limit: number
}

interface UptimeStats {
  currentUptime: number | null
  averageUptime: number | null
  longestUptime: number | null
  totalReboots: number
  rebootsLast30Days: number
}

/**
 * Fetch current server uptime (updates every second locally)
 */
export function useCurrentUptime() {
  const { data, isLoading, error, refetch } = useQuery<CurrentReboot>({
    queryKey: ['server-reboot', 'current'],
    queryFn: async () => {
      const response = await apiClient.get('/api/server/reboot/current')
      return response.data
    },
    staleTime: 30000, // Refetch from server every 30 seconds
    refetchInterval: 30000,
  })

  // Live-updating uptime (ticks every second)
  const liveUptime = ref(0)
  const bootTime = computed(() => data.value?.bootTime || 0)

  // Update live uptime every second
  const updateLiveUptime = () => {
    if (bootTime.value) {
      const currentTime = Math.floor(Date.now() / 1000)
      liveUptime.value = currentTime - bootTime.value
    }
  }

  // Initial update and set interval
  updateLiveUptime()
  const intervalId = setInterval(updateLiveUptime, 1000)

  // Clean up interval when scope is disposed
  onScopeDispose(() => {
    clearInterval(intervalId)
  })

  return {
    bootTime,
    bootDate: computed(() => data.value?.bootDate || null),
    uptime: liveUptime,
    isLoading,
    error,
    refetch,
  }
}

/**
 * Fetch reboot history with pagination
 */
export function useRebootHistory(page: number = 1, limit: number = 20) {
  return useQuery<RebootHistory>({
    queryKey: ['server-reboot', 'history', page, limit],
    queryFn: async () => {
      const response = await apiClient.get('/api/server/reboot/history', {
        params: { page, limit },
      })
      return response.data
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * Fetch uptime statistics
 */
export function useUptimeStats() {
  return useQuery<UptimeStats>({
    queryKey: ['server-reboot', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/server/reboot/stats')
      return response.data
    },
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Fetch MUD uptime statistics
 */
export function useMudUptimeStats() {
  return useQuery<UptimeStats>({
    queryKey: ['server-reboot', 'mud-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/server/reboot/mud-stats')
      return response.data
    },
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Fetch MUD reboot history from server_reboots table
 */
export function useMudRebootHistory() {
  return useQuery<
    Array<{
      rebootTime: number
      uptimeBeforeReboot: number
      shutdownType: string
      initiatedBy: string | null
      reason: string | null
    }>
  >({
    queryKey: ['server-reboot', 'mud-history'],
    queryFn: async () => {
      const response = await apiClient.get('/api/server/reboot/mud-history')
      return response.data
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * Format uptime seconds to human-readable format
 * @param seconds - Uptime in seconds
 * @returns Formatted string like "2d 14h 32m 15s"
 */
export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds === 0) {
    return '0s'
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

/**
 * Get uptime health status color
 * Returns green for healthy, yellow for approaching auto-reboot (65h), red for critical
 */
export function getUptimeHealthColor(uptimeSeconds: number): string {
  const uptimeHours = uptimeSeconds / 3600

  if (uptimeHours >= 65) {
    return 'text-red-500' // Critical - auto-reboot threshold
  } else if (uptimeHours >= 60) {
    return 'text-yellow-500' // Warning - approaching auto-reboot
  } else {
    return 'text-green-500' // Healthy
  }
}

/**
 * Get shutdown type badge color and label
 * Displays database value with title case and appropriate color
 */
export function getShutdownTypeBadge(type: string): {
  color: string
  label: string
} {
  // Assign colors based on type
  let color = 'bg-blue-500' // default

  if (type === 'crash') {
    color = 'bg-red-500'
  } else if (type === 'shutdown') {
    color = 'bg-gray-500'
  } else if (type === 'unknown') {
    color = 'bg-gray-500'
  } else if (type.includes('reboot')) {
    color = 'bg-green-500'
  } else if (type === 'copyover') {
    color = 'bg-yellow-500'
  }

  // Convert to title case (e.g., "autoreboot_copyover" -> "Autoreboot Copyover")
  const label = type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  return { color, label }
}

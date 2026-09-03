import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref, unref } from 'vue'
import axios from 'axios'
import { frontendConfiguration } from '@/config/environment'

const apiClient = axios.create({
  baseURL: frontendConfiguration.apiUrl,
  timeout: 10000,
  withCredentials: true,
})

export interface ServerHealthMetrics {
  // MUD Server
  mudIsRunning: boolean
  mudPid: number | null
  mudUptimeSeconds: number
  mudCpuPercent: number
  mudMemoryMb: number

  // Player Activity
  onlinePlayers: number

  // Database
  dbConnected: boolean
  dbQueryTimeMs: number
  dbConnectionPoolUsed: number
  dbConnectionPoolTotal: number

  // System Resources
  systemLoad1m: number
  systemLoad5m: number
  systemLoad15m: number
  diskUsedGb: number
  diskTotalGb: number
  diskPercent: number

  // WebSocket
  websocketConnections: number

  // Incidents
  crashesLastHour: number
  crashesLast24h: number
}

export interface HealthStatus {
  status: 'operational' | 'degraded' | 'offline' | 'maintenance'
  message: string
}

export interface ServerHealthResponse {
  health: ServerHealthMetrics
  status: HealthStatus
}

export interface HistoricalMetric {
  recorded_at: string
  mud_is_running: boolean
  mud_cpu_percent: number
  mud_memory_mb: number
  online_players: number
  db_query_time_ms: number
  disk_percent: number
  system_load_1m: number
}

export interface Incident {
  id: number
  incident_type:
    | 'crash'
    | 'shutdown'
    | 'reboot'
    | 'copyover'
    | 'maintenance'
    | 'degraded'
    | 'outage'
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  description: string
}

/**
 * Fetches server health status, database ping, memory, and services, optionally auto-refreshing.
 */
export function useServerHealth(autoRefresh = true) {
  const refetchInterval = autoRefresh ? 30000 : false // 30 seconds

  const {
    data: healthData,
    isLoading: isLoadingHealth,
    error: healthError,
  } = useQuery<ServerHealthResponse>({
    queryKey: ['server-health'],
    queryFn: async () => {
      const response = await apiClient.get('/api/admin/server-health')
      return response.data
    },
    refetchInterval,
  })

  return {
    health: computed(() => healthData.value?.health),
    status: computed(() => healthData.value?.status),
    isLoading: isLoadingHealth,
    error: healthError,
  }
}

/**
 * Fetches historical health metric samples over a specified hourly window.
 */
export function useHealthHistory(hours: Ref<number> | number = 24) {
  const { data, isLoading, error } = useQuery<{ history: HistoricalMetric[] }>({
    queryKey: ['server-health-history', hours],
    queryFn: async () => {
      const hoursValue = unref(hours)
      const response = await apiClient.get(`/api/admin/server-health/history?hours=${hoursValue}`)
      return response.data
    },
  })

  return {
    history: computed(() => data.value?.history || []),
    isLoading,
    error,
  }
}

/**
 * Fetches server uptime percentage over a specified window of days.
 * The uptime percentage is null when no health samples were recorded for the window.
 */
export function useUptime(days: number = 90) {
  // uptime is null when no health samples were recorded for the window.
  const { data, isLoading, error } = useQuery<{ uptime: number | null; days: number }>({
    queryKey: ['server-uptime', days],
    queryFn: async () => {
      const response = await apiClient.get(`/api/admin/server-health/uptime?days=${days}`)
      return response.data
    },
  })

  return {
    uptime: computed(() => data.value?.uptime),
    days: computed(() => data.value?.days),
    isLoading,
    error,
  }
}

export function useIncidents(limit: number = 20) {
  const { data, isLoading, error, refetch } = useQuery<{ incidents: Incident[] }>({
    queryKey: ['server-incidents', limit],
    queryFn: async () => {
      const response = await apiClient.get(`/api/admin/server-health/incidents?limit=${limit}`)
      return response.data
    },
  })

  return {
    incidents: computed(() => data.value?.incidents || []),
    isLoading,
    error,
    refetch,
  }
}

export function formatUptime(seconds: number): string {
  if (!seconds) return 'N/A'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function formatBytes(mb: number): string {
  if (mb < 1024) {
    return `${mb.toFixed(0)} MB`
  }
  return `${(mb / 1024).toFixed(2)} GB`
}

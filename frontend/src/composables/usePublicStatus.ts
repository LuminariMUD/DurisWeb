import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import axios from 'axios'
import { frontendConfiguration } from '@/config/environment'

const apiClient = axios.create({
  baseURL: frontendConfiguration.apiUrl,
  timeout: 10000,
})

export interface PublicStatus {
  status: 'operational' | 'degraded' | 'offline' | 'maintenance'
  message: string
  mudIsRunning: boolean
  onlinePlayers: number
  uptimeSeconds: number
  lastUpdated: string
}

export interface UptimeStats {
  /** Null when no health samples were recorded for the window. */
  last30Days: number | null
  last90Days: number | null
}

export interface PublicIncident {
  id: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  incident_type: string
  severity: string | null
  title: string | null
  description: string
  resolved: boolean
}

export interface UptimeHistoryDay {
  date: string
  total_checks: number
  running_checks: number
  uptime_percent: number
  incidents: PublicIncident[] | null
  worst_severity: 'critical' | 'major' | 'minor' | 'info' | null
}

export function usePublicStatus(autoRefresh = true) {
  const refetchInterval = autoRefresh ? 30000 : false // 30 seconds

  const { data, isLoading, error } = useQuery<PublicStatus>({
    queryKey: ['public-status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/status')
      return response.data
    },
    refetchInterval,
  })

  return {
    status: computed(() => data.value),
    isLoading,
    error,
  }
}

export function usePublicUptime() {
  const { data, isLoading, error } = useQuery<UptimeStats>({
    queryKey: ['public-uptime'],
    queryFn: async () => {
      const response = await apiClient.get('/api/status/uptime')
      return response.data
    },
  })

  return {
    uptime: computed(() => data.value),
    isLoading,
    error,
  }
}

export function usePublicIncidents() {
  const { data, isLoading, error } = useQuery<{ incidents: PublicIncident[] }>({
    queryKey: ['public-incidents'],
    queryFn: async () => {
      const response = await apiClient.get('/api/status/incidents')
      return response.data
    },
  })

  return {
    incidents: computed(() => data.value?.incidents || []),
    isLoading,
    error,
  }
}

export function useUptimeHistory() {
  const { data, isLoading, error } = useQuery<{ history: UptimeHistoryDay[] }>({
    queryKey: ['uptime-history'],
    queryFn: async () => {
      const response = await apiClient.get('/api/status/history')
      return response.data
    },
  })

  return {
    history: computed(() => data.value?.history || []),
    isLoading,
    error,
  }
}

export function formatUptime(seconds: number): string {
  if (!seconds) return '0m'

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

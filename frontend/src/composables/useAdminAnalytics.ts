import { useQuery } from '@tanstack/vue-query'
import { analyticsApi } from '@/services/api'

export interface OverviewStats {
  currentOnlinePlayers: number
  peakPlayerCount: number
  peakPlayerTimestamp: string | null
  totalForumPosts: number
  totalPvPBattles: number
  totalPlayerAccounts: number
  activeGuilds: number
  serverUptime: number
}

export interface ForumStats {
  totalThreads: number
  totalPosts: number
  activeUsers7Days: number
  postsToday: number
  postsThisWeek: number
  avgPostsPerThread: number
  topPosters: Array<{ account: string; postCount: number }>
  postsByCategory: Array<{ categoryName: string; postCount: number }>
  postsPerDay: Array<{ date: string; count: number }>
}

export interface PvPStats {
  totalBattles: number
  battlesToday: number
  battlesThisWeek: number
  topKiller: { name: string; kills: number } | null
  topVictim: { name: string; deaths: number } | null
  mostActiveLocation: { location: string; battles: number } | null
  battlesPerDay: Array<{ date: string; count: number }>
  killsByClass: Array<{ className: string; kills: number }>
  activityByHour: Array<{ hour: number; battles: number }>
}

export interface PlayerStats {
  totalAccounts: number
  maxLevel: number
  avgLevel: number
  noneCount: number
  goodsCount: number
  evilsCount: number
  illithidsCount: number
  undeadsCount: number
  neutralsCount: number
  topGuilds: Array<{ guild: string; memberCount: number }>
  levelDistribution: Array<{ range: string; count: number }>
}

export interface ServerHealth {
  diskSpace: { used: number; total: number; percent: number; available?: number; free?: number }
  memoryUsage: { used: number; total: number; percent: number }
  memory?: { used: number; total: number; percent: number; available?: number; free?: number }
  uptimeMs: number
  nodeVersion: string
  platform: string
  dmsProcess?: {
    isRunning?: boolean
    pid?: number
    uptime?: number
    memory?: number
    memoryPercent?: number
    cpu?: number
  }
  databaseStatus: {
    connected: boolean
    poolActive: number
    poolIdle: number
    avgQueryTime: number
  }
  database?: {
    connected: boolean
    poolActive?: number
    poolIdle?: number
    tables?: Array<{ name: string; size: number; rows: number }>
  }
  tableSizes: Array<{ tableName: string; sizeBytes: number; rowCount: number }>
}

/**
 * Fetch overview statistics for admin dashboard
 * Now uses WebSocket for real-time updates instead of polling
 */
export function useOverviewStats() {
  return useQuery({
    queryKey: ['admin-analytics', 'overview'],
    queryFn: async () => {
      const response = await analyticsApi.getOverviewStats()
      return response.stats as OverviewStats
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Removed refetchInterval - using WebSocket instead
  })
}

/**
 * Fetch forum analytics
 */
export function useForumStats() {
  return useQuery({
    queryKey: ['admin-analytics', 'forum'],
    queryFn: async () => {
      const response = await analyticsApi.getForumStats()
      return response.stats as ForumStats
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Fetch PvP analytics
 */
export function usePvPStats() {
  return useQuery({
    queryKey: ['admin-analytics', 'pvp'],
    queryFn: async () => {
      const response = await analyticsApi.getPvPStats()
      return response.stats as PvPStats
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Fetch player demographics
 */
export function usePlayerStats() {
  return useQuery({
    queryKey: ['admin-analytics', 'players'],
    queryFn: async () => {
      const response = await analyticsApi.getPlayerStats()
      return response.stats as PlayerStats
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Fetch server health metrics
 */
export function useServerHealth() {
  return useQuery({
    queryKey: ['admin-analytics', 'server'],
    queryFn: async () => {
      const response = await analyticsApi.getServerHealth()
      return response.health as ServerHealth
    },
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 5 * 1000, // Auto-refresh every 5 seconds
  })
}

export function useWhoList() {
  return useQuery({
    queryKey: ['admin', 'who'],
    queryFn: async () => {
      const response = await analyticsApi.getWhoList()
      return response.players
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Fetch player activity over time for charts
 */
export function usePlayerActivity(hours: number = 24) {
  return useQuery({
    queryKey: ['admin-analytics', 'activity', hours],
    queryFn: async () => {
      const response = await analyticsApi.getPlayerActivity(hours)
      return response.activity
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format milliseconds to human-readable uptime
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m`
  } else {
    return `${seconds}s`
  }
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return 'Never'

  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  } else {
    return 'Just now'
  }
}

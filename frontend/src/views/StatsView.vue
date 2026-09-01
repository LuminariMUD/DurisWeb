<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useLeaderboard, usePlayerStats } from '@/composables/usePvPEvents'
import {
  useKillTimeline,
  useActiveHours,
  usePopularLocations,
  useClassMatchups,
  useClientStats,
} from '@/composables/useAnalytics'
import { Bar, Doughnut, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js'
import { format } from 'date-fns'
import { parseAnsiForVue, stripAnsiCodes } from '@/utils/ansiParser'
import { profileApi } from '@/services/api'
import {
  Trophy,
  Medal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

useHead({
  title: 'DurisMUD | Statistics',
})
import PeriodSelector from '@/components/ui/PeriodSelector.vue'
import type { AnalyticsPeriod } from '@/types'

// Register Chart.js components
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
)

const route = useRoute()
const router = useRouter()

const leaderboardType = ref<'kills' | 'deaths' | 'kd_ratio'>('kills')
const leaderboardPeriod = ref<'7d' | '30d' | 'all'>('30d')
const leaderboardPage = ref(1)
const leaderboardItemsPerPage = 10

const {
  data: leaderboard,
  isLoading: isLoadingLeaderboard,
  isError: isErrorLeaderboard,
} = useLeaderboard(leaderboardType, leaderboardPeriod)

// Reset page when type or period changes
watch([leaderboardType, leaderboardPeriod], () => {
  leaderboardPage.value = 1
})

// Pagination computed properties
const leaderboardTotalItems = computed(() => leaderboard.value?.entries?.length || 0)
const leaderboardTotalPages = computed(() =>
  Math.ceil(leaderboardTotalItems.value / leaderboardItemsPerPage),
)

const paginatedLeaderboard = computed(() => {
  if (!leaderboard.value?.entries) return []
  const start = (leaderboardPage.value - 1) * leaderboardItemsPerPage
  return leaderboard.value.entries.slice(start, start + leaderboardItemsPerPage)
})

function goToLeaderboardPage(page: number) {
  leaderboardPage.value = page
}

function getVisiblePages(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const delta = 2
  const range: (number | string)[] = []
  const rangeWithDots: (number | string)[] = []

  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i)
  }

  if (current - delta > 2) {
    rangeWithDots.push(1, '...')
  } else {
    rangeWithDots.push(1)
  }

  rangeWithDots.push(...range)

  if (current + delta < total - 1) {
    rangeWithDots.push('...', total)
  } else if (total > 1) {
    rangeWithDots.push(total)
  }

  return rangeWithDots
}

// Player search
const playerSearchName = ref('')
const searchedPlayer = ref('')

const {
  data: playerStats,
  isLoading: isLoadingPlayer,
  isError: isErrorPlayer,
} = usePlayerStats(searchedPlayer)

const searchPlayer = () => {
  if (playerSearchName.value.trim()) {
    searchedPlayer.value = playerSearchName.value.trim()
  }
}

// Analytics period - shared across all analytics charts
const analyticsPeriod = ref<AnalyticsPeriod>((route.query.period as AnalyticsPeriod) || '30d')

// Watch for period changes and update URL
watch(analyticsPeriod, (newPeriod) => {
  router.replace({ query: { ...route.query, period: newPeriod } })
})

// Analytics data with period filtering
const { data: killTimeline, isLoading: isLoadingTimeline } = useKillTimeline(analyticsPeriod)
const { data: activeHours, isLoading: isLoadingHours } = useActiveHours(analyticsPeriod)
const { data: popularLocations, isLoading: isLoadingLocations } = usePopularLocations(
  10,
  analyticsPeriod,
)
const { data: classMatchups, isLoading: isLoadingMatchups } = useClassMatchups(analyticsPeriod)
const { data: clientStats, isLoading: isLoadingClients } = useClientStats(analyticsPeriod)

// Type labels
const typeLabels: Record<string, string> = {
  kills: 'Most Kills',
  deaths: 'Most Deaths',
  kd_ratio: 'Best K/D Ratio',
}

const _periodLabels: Record<string, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  all: 'All Time',
}

// Chart data - Top 10 Players Bar Chart
const barChartData = computed(() => {
  if (!leaderboard.value || !leaderboard.value.entries) {
    return null
  }

  const top10 = leaderboard.value.entries.slice(0, 10)

  return {
    labels: top10.map((entry) => entry.playerName),
    datasets: [
      {
        label: typeLabels[leaderboardType.value],
        data: top10.map((entry) => entry.value),
        backgroundColor: [
          'rgba(34, 211, 238, 0.8)', // cyan
          'rgba(6, 182, 212, 0.8)', // cyan-600
          'rgba(8, 145, 178, 0.8)', // cyan-700
          'rgba(21, 94, 117, 0.8)', // cyan-800
          'rgba(22, 78, 99, 0.8)', // cyan-900
          'rgba(34, 211, 238, 0.6)',
          'rgba(6, 182, 212, 0.6)',
          'rgba(8, 145, 178, 0.6)',
          'rgba(21, 94, 117, 0.6)',
          'rgba(22, 78, 99, 0.6)',
        ],
        borderColor: [
          'rgb(34, 211, 238)',
          'rgb(6, 182, 212)',
          'rgb(8, 145, 178)',
          'rgb(21, 94, 117)',
          'rgb(22, 78, 99)',
          'rgb(34, 211, 238)',
          'rgb(6, 182, 212)',
          'rgb(8, 145, 178)',
          'rgb(21, 94, 117)',
          'rgb(22, 78, 99)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: 'Top 10 Players',
      color: '#e5e7eb',
      font: {
        size: 16,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        color: '#9ca3af',
      },
      grid: {
        color: 'rgba(75, 85, 99, 0.3)',
      },
    },
    x: {
      ticks: {
        color: '#9ca3af',
        maxRotation: 45,
        minRotation: 45,
      },
      grid: {
        color: 'rgba(75, 85, 99, 0.3)',
      },
    },
  },
}

// K/D Ratio Comparison - Doughnut Chart (Top 5)
const doughnutChartData = computed(() => {
  if (!leaderboard.value || !leaderboard.value.entries || leaderboardType.value === 'kd_ratio') {
    return null
  }

  const top5 = leaderboard.value.entries.slice(0, 5)

  return {
    labels: top5.map((entry) => entry.playerName),
    datasets: [
      {
        label: 'K/D Ratio',
        data: top5.map((entry) => entry.kdRatio || 0),
        backgroundColor: [
          'rgba(34, 211, 238, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(8, 145, 178, 0.8)',
          'rgba(21, 94, 117, 0.8)',
          'rgba(22, 78, 99, 0.8)',
        ],
        borderColor: [
          'rgb(34, 211, 238)',
          'rgb(6, 182, 212)',
          'rgb(8, 145, 178)',
          'rgb(21, 94, 117)',
          'rgb(22, 78, 99)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#e5e7eb',
        font: {
          size: 12,
        },
      },
    },
    title: {
      display: true,
      text: 'K/D Ratio Comparison (Top 5)',
      color: '#e5e7eb',
      font: {
        size: 16,
      },
    },
  },
}

// Kill Timeline Chart Data
const timelineChartData = computed(() => {
  if (!killTimeline.value || !Array.isArray(killTimeline.value)) return null

  return {
    labels: killTimeline.value.map((item) => format(new Date(item.date), 'MMM dd')),
    datasets: [
      {
        label: 'PvP Kills',
        data: killTimeline.value.map((item) => item.kills),
        borderColor: 'rgb(34, 211, 238)',
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const timelineChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: `Kill Timeline (${periodLabel.value})`,
      color: '#e5e7eb',
      font: { size: 16 },
    },
  },
  scales: {
    y: {
      ticks: { color: '#9ca3af' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
    },
    x: {
      ticks: { color: '#9ca3af' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
    },
  },
  onClick: handleTimelineClick,
}))

// Active Hours Chart Data
const activeHoursChartData = computed(() => {
  if (!activeHours.value || !Array.isArray(activeHours.value)) return null

  return {
    labels: activeHours.value.map((item) => `${item.hour}:00`),
    datasets: [
      {
        label: 'PvP Activity',
        data: activeHours.value.map((item) => item.kills),
        backgroundColor: 'rgba(34, 211, 238, 0.8)',
        borderColor: 'rgb(34, 211, 238)',
        borderWidth: 1,
      },
    ],
  }
})

const activeHoursChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: `Active Hours (${periodLabel.value})`,
      color: '#e5e7eb',
      font: { size: 16 },
    },
  },
  scales: {
    y: {
      ticks: { color: '#9ca3af' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
    },
    x: {
      ticks: { color: '#9ca3af' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
    },
  },
  onClick: handleActiveHoursClick,
}))

// Client Stats Chart Data
const clientStatsChartData = computed(() => {
  if (!clientStats.value || !clientStats.value.clients || clientStats.value.clients.length === 0)
    return null

  return {
    labels: clientStats.value.clients.map((c) => c.name),
    datasets: [
      {
        label: 'Logins',
        data: clientStats.value.clients.map((c) => c.count),
        backgroundColor: [
          'rgba(34, 211, 238, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(8, 145, 178, 0.8)',
          'rgba(21, 94, 117, 0.8)',
          'rgba(22, 78, 99, 0.8)',
          'rgba(34, 211, 238, 0.6)',
          'rgba(6, 182, 212, 0.6)',
          'rgba(8, 145, 178, 0.6)',
          'rgba(21, 94, 117, 0.6)',
          'rgba(22, 78, 99, 0.6)',
        ],
        borderColor: [
          'rgb(34, 211, 238)',
          'rgb(6, 182, 212)',
          'rgb(8, 145, 178)',
          'rgb(21, 94, 117)',
          'rgb(22, 78, 99)',
          'rgb(34, 211, 238)',
          'rgb(6, 182, 212)',
          'rgb(8, 145, 178)',
          'rgb(21, 94, 117)',
          'rgb(22, 78, 99)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

const clientStatsChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#e5e7eb',
        font: { size: 12 },
      },
    },
    title: {
      display: true,
      text: `MUD Clients (${periodLabel.value})`,
      color: '#e5e7eb',
      font: { size: 16 },
    },
    tooltip: {
      callbacks: {
        title: (items: any[]) => {
          if (!items.length) return ''
          return items[0].label
        },
        label: (context: any) => {
          const idx = context.dataIndex
          const client = clientStats.value?.clients?.[idx]
          if (!client || !client.versions) return [`  logins: ${context.raw}`]
          return client.versions.map(
            (v: { version: string; count: number }) => `  ${v.version}: ${v.count}`,
          )
        },
      },
    },
  },
}))

// Popular Locations Chart Data
const locationsChartData = computed(() => {
  if (!popularLocations.value || !Array.isArray(popularLocations.value)) return null

  return {
    labels: popularLocations.value.map((item) => {
      const stripped = stripAnsiCodes(item.location)
      return stripped.length > 18 ? stripped.substring(0, 18) + '...' : stripped
    }),
    datasets: [
      {
        label: 'Kills',
        data: popularLocations.value.map((item) => item.kills),
        backgroundColor: [
          'rgba(34, 211, 238, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(8, 145, 178, 0.8)',
          'rgba(21, 94, 117, 0.8)',
          'rgba(22, 78, 99, 0.8)',
          'rgba(34, 211, 238, 0.6)',
          'rgba(6, 182, 212, 0.6)',
          'rgba(8, 145, 178, 0.6)',
          'rgba(21, 94, 117, 0.6)',
          'rgba(22, 78, 99, 0.6)',
        ],
        borderColor: 'rgb(34, 211, 238)',
        borderWidth: 1,
      },
    ],
  }
})

const locationsChartOptions = computed(
  () =>
    ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y' as const,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: `Popular PvP Locations (${periodLabel.value})`,
          color: '#e5e7eb',
          font: { size: 16 },
        },
      },
      scales: {
        y: {
          ticks: { color: '#9ca3af' },
          grid: { color: 'rgba(75, 85, 99, 0.3)' },
        },
        x: {
          ticks: { color: '#9ca3af' },
          grid: { color: 'rgba(75, 85, 99, 0.3)' },
        },
      },
    }) as any,
)

// Click handler for location chart
const handleLocationClick = (event: any, elements: any[]) => {
  if (elements.length > 0) {
    const index = elements[0].index
    const location = popularLocations.value?.[index]?.location
    if (location) {
      const stripped = stripAnsiCodes(location)
      router.push({ path: '/pvp', query: { location: stripped } })
    }
  }
}

// Add onClick handler
const locationsChartOptionsWithClick = computed(
  () =>
    ({
      ...locationsChartOptions.value,
      onClick: handleLocationClick,
    }) as any,
)

// Click handler for timeline chart
const handleTimelineClick = (event: any, elements: any[]) => {
  if (elements.length > 0) {
    const index = elements[0].index
    const date = killTimeline.value?.[index]?.date
    if (date) {
      router.push({ path: '/pvp', query: { date_from: date, date_to: date } })
    }
  }
}

// Click handler for active hours chart
const handleActiveHoursClick = (event: any, elements: any[]) => {
  if (elements.length > 0) {
    const index = elements[0].index
    const hour = activeHours.value?.[index]?.hour
    if (hour !== undefined) {
      // Navigate to PvP page with hour filter
      router.push({
        path: '/pvp',
        query: { hour: hour.toString() },
      })
    }
  }
}

// Period labels for chart titles
const periodLabel = computed(() => {
  const labels: Record<AnalyticsPeriod, string> = {
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    '90d': 'Last 90 Days',
    all: 'All Time',
  }
  return labels[analyticsPeriod.value]
})

// Click handler for class matchup rows
const handleMatchupClick = (killerClass: string, victimClass: string) => {
  router.push({
    path: '/pvp',
    query: {
      killer_class: killerClass,
      victim_class: victimClass,
    },
  })
}

// Navigate to user profile when clicking a player name
const navigateToPlayer = async (playerName: string) => {
  try {
    const { accountName } = await profileApi.getCharacterAccount(playerName)
    router.push({ name: 'user-profile', params: { accountName } })
  } catch {
    // Character not found - do nothing
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div>
      <h2 class="text-3xl font-bold tracking-tight text-gray-100">Statistics</h2>
      <p class="text-gray-400">
        PvP leaderboards and player statistics
      </p>
    </div>

    <!-- Leaderboard Section -->
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 class="text-lg lg:text-xl font-semibold text-gray-100">Leaderboard</h3>
        <div class="flex items-center gap-2 sm:gap-4">
          <!-- Type Selector -->
          <select
            v-model="leaderboardType"
            class="flex h-8 lg:h-9 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 lg:px-3 py-1 text-xs lg:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
          >
            <option value="kills">Most Kills</option>
            <option value="deaths">Most Deaths</option>
            <option value="kd_ratio">Best K/D</option>
          </select>

          <!-- Period Selector -->
          <select
            v-model="leaderboardPeriod"
            class="flex h-8 lg:h-9 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 lg:px-3 py-1 text-xs lg:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
          >
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoadingLeaderboard" class="flex items-center justify-center py-8">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="isErrorLeaderboard" class="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p class="text-sm text-destructive">Error loading leaderboard</p>
      </div>

      <!-- Leaderboard Table -->
      <div v-else-if="leaderboard">
        <!-- Mobile Cards -->
        <div class="lg:hidden space-y-2">
          <div
            v-for="entry in paginatedLeaderboard"
            :key="entry.rank"
            class="rounded-lg border border-gray-800 bg-gray-950 p-3 cursor-pointer hover:bg-gray-900 transition-colors"
            @click="navigateToPlayer(entry.playerName)"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <div class="flex items-center gap-1 flex-shrink-0 w-8">
                  <Trophy v-if="entry.rank === 1" class="w-4 h-4 text-yellow-500" />
                  <Medal v-else-if="entry.rank === 2" class="w-4 h-4 text-gray-400" />
                  <Medal v-else-if="entry.rank === 3" class="w-4 h-4 text-orange-600" />
                  <span v-else class="text-sm text-gray-400">#{{ entry.rank }}</span>
                </div>
                <div class="min-w-0">
                  <div class="font-medium text-gray-100 truncate">{{ entry.playerName }}</div>
                  <div class="text-xs text-gray-400">
                    Lv{{ entry.level }} <span v-html="parseAnsiForVue(entry.class)"></span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3 text-sm flex-shrink-0">
                <div class="text-center">
                  <div class="font-semibold text-green-400">{{ entry.kills }}</div>
                  <div class="text-xs text-gray-500">K</div>
                </div>
                <div class="text-center">
                  <div class="font-semibold text-red-400">{{ entry.deaths }}</div>
                  <div class="text-xs text-gray-500">D</div>
                </div>
                <div class="text-center">
                  <div class="font-semibold text-gray-100">{{ entry.kdRatio.toFixed(2) }}</div>
                  <div class="text-xs text-gray-500">K/D</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="hidden lg:block rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
          <table class="w-full">
            <thead class="border-b border-gray-800 bg-gray-900">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-400 w-16">Rank</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Player</th>
                <th class="px-4 py-3 text-center text-sm font-medium text-gray-400">Level</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Class</th>
                <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Race</th>
                <th class="px-4 py-3 text-right text-sm font-medium text-gray-400">Kills</th>
                <th class="px-4 py-3 text-right text-sm font-medium text-gray-400">Deaths</th>
                <th class="px-4 py-3 text-right text-sm font-medium text-gray-400">K/D Ratio</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in paginatedLeaderboard"
                :key="entry.rank"
                class="border-b border-gray-800 transition-colors hover:bg-gray-900 cursor-pointer"
                @click="navigateToPlayer(entry.playerName)"
              >
                <td class="px-4 py-3 text-sm font-bold">
                  <div class="flex items-center gap-1">
                    <Trophy v-if="entry.rank === 1" class="w-4 h-4 text-yellow-500" />
                    <Medal v-else-if="entry.rank === 2" class="w-4 h-4 text-gray-400" />
                    <Medal v-else-if="entry.rank === 3" class="w-4 h-4 text-orange-600" />
                    <span :class="entry.rank <= 3 ? '' : 'text-gray-400'">{{ entry.rank }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm font-medium text-gray-100 hover:underline">
                  {{ entry.playerName }}
                </td>
                <td class="px-4 py-3 text-sm text-center text-cyan-400">{{ entry.level }}</td>
                <td class="px-4 py-3 text-sm" v-html="parseAnsiForVue(entry.class)"></td>
                <td class="px-4 py-3 text-sm" v-html="parseAnsiForVue(entry.race)"></td>
                <td class="px-4 py-3 text-sm text-right font-semibold text-green-400">{{ entry.kills }}</td>
                <td class="px-4 py-3 text-sm text-right font-semibold text-red-400">{{ entry.deaths }}</td>
                <td class="px-4 py-3 text-sm text-right font-semibold text-gray-100">
                  {{ entry.kdRatio.toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="leaderboardTotalPages > 1" class="flex justify-center items-center gap-1 p-4 lg:border-t lg:border-gray-800 mt-4 lg:mt-0">
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToLeaderboardPage(1)"
            :disabled="leaderboardPage === 1"
          >
            <ChevronsLeft class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToLeaderboardPage(Math.max(1, leaderboardPage - 1))"
            :disabled="leaderboardPage === 1"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>

          <template
            v-for="(page, index) in getVisiblePages(leaderboardPage, leaderboardTotalPages)"
            :key="index"
          >
            <span v-if="page === '...'" class="px-2 text-muted-foreground">...</span>
            <Button
              v-else
              :variant="page === leaderboardPage ? 'default' : 'outline'"
              size="icon"
              class="h-8 w-8"
              @click="goToLeaderboardPage(page as number)"
            >
              {{ page }}
            </Button>
          </template>

          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToLeaderboardPage(Math.min(leaderboardTotalPages, leaderboardPage + 1))"
            :disabled="leaderboardPage === leaderboardTotalPages"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            @click="goToLeaderboardPage(leaderboardTotalPages)"
            :disabled="leaderboardPage === leaderboardTotalPages"
          >
            <ChevronsRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div v-if="leaderboard && barChartData" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Bar Chart -->
      <div class="rounded-lg border border-gray-800 bg-gray-950 p-6">
        <div style="height: 350px;">
          <Bar :data="barChartData" :options="barChartOptions" />
        </div>
      </div>

      <!-- Doughnut Chart -->
      <div v-if="doughnutChartData" class="rounded-lg border border-gray-800 bg-gray-950 p-6">
        <div style="height: 350px;">
          <Doughnut :data="doughnutChartData" :options="doughnutChartOptions" />
        </div>
      </div>

      <!-- Placeholder if K/D Ratio selected -->
      <div v-else class="rounded-lg border border-gray-800 bg-gray-950 p-6 flex items-center justify-center">
        <p class="text-gray-400 text-center">
          K/D Ratio comparison chart is only available<br />when viewing Kills or Deaths leaderboards
        </p>
      </div>
    </div>

    <!-- Player Search Section -->
    <div class="space-y-4">
      <h3 class="text-lg lg:text-xl font-semibold text-gray-100">Player Statistics</h3>

      <div class="flex flex-col sm:flex-row gap-2">
        <input
          v-model="playerSearchName"
          @keyup.enter="searchPlayer"
          type="text"
          placeholder="Enter player name..."
          class="flex h-9 w-full sm:max-w-sm rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
        />
        <button
          @click="searchPlayer"
          class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 bg-cyan-600 text-white hover:bg-cyan-700 h-9 px-4 flex-shrink-0"
        >
          Search
        </button>
      </div>

      <!-- Player Stats -->
      <div v-if="isLoadingPlayer" class="flex items-center justify-center py-8">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
      </div>

      <div v-else-if="isErrorPlayer" class="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p class="text-sm text-destructive">Player not found or error loading stats</p>
      </div>

      <div v-else-if="playerStats" class="rounded-lg border border-gray-800 bg-gray-950 p-4 lg:p-6">
        <div class="mb-4 lg:mb-6">
          <h4 class="text-xl lg:text-2xl font-bold text-gray-100 mb-2">{{ playerStats.playerName }}</h4>
          <div class="flex flex-wrap items-center gap-2 lg:gap-3 text-sm">
            <span class="text-cyan-400 font-semibold">Level {{ playerStats.level }}</span>
            <span class="text-gray-500">•</span>
            <span v-html="parseAnsiForVue(playerStats.class)"></span>
            <span class="text-gray-500">•</span>
            <span v-html="parseAnsiForVue(playerStats.race)"></span>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 lg:gap-4">
          <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 lg:p-4 text-center">
            <div class="text-xl lg:text-3xl font-bold text-green-400">{{ playerStats.kills }}</div>
            <div class="text-xs lg:text-sm text-gray-400 mt-1">Kills</div>
          </div>
          <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 lg:p-4 text-center">
            <div class="text-xl lg:text-3xl font-bold text-red-400">{{ playerStats.deaths }}</div>
            <div class="text-xs lg:text-sm text-gray-400 mt-1">Deaths</div>
          </div>
          <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 lg:p-4 text-center">
            <div class="text-xl lg:text-3xl font-bold text-gray-100">{{ playerStats.kdRatio.toFixed(2) }}</div>
            <div class="text-xs lg:text-sm text-gray-400 mt-1">K/D</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Section -->
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 class="text-xl lg:text-2xl font-bold text-gray-100">Analytics & Trends</h3>
        <PeriodSelector v-model="analyticsPeriod" />
      </div>

      <!-- Kill Timeline Chart -->
      <div v-if="timelineChartData" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6">
        <div class="h-[200px] lg:h-[300px]">
          <Line :data="timelineChartData" :options="timelineChartOptions" />
        </div>
      </div>
      <div v-else-if="isLoadingTimeline" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6 flex items-center justify-center h-[200px] lg:h-[300px]">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
      </div>

      <!-- Active Hours and Popular Locations -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <!-- Active Hours + MUD Clients -->
        <div class="flex flex-col gap-4">
          <div v-if="activeHoursChartData" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6">
            <div class="h-[250px] lg:h-[350px]">
              <Bar :data="activeHoursChartData" :options="activeHoursChartOptions" />
            </div>
          </div>
          <div v-else-if="isLoadingHours" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6 flex items-center justify-center h-[250px] lg:h-[350px]">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          </div>

          <!-- MUD Clients -->
          <div v-if="clientStatsChartData" class="flex-1 rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6">
            <div class="h-full">
              <Doughnut :data="clientStatsChartData" :options="clientStatsChartOptions" />
            </div>
          </div>
          <div v-else-if="isLoadingClients" class="flex-1 rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6 flex items-center justify-center">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          </div>
        </div>

        <!-- Popular Locations -->
        <div class="space-y-4">
          <div v-if="locationsChartData" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6">
            <div class="h-[250px] lg:h-[350px]">
              <Bar :data="locationsChartData" :options="locationsChartOptionsWithClick" />
            </div>
          </div>
          <div v-else-if="isLoadingLocations" class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6 flex items-center justify-center h-[250px] lg:h-[350px]">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          </div>

          <!-- Popular Locations Table with MUD colors -->
          <div v-if="popularLocations && popularLocations.length > 0" class="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="border-b border-gray-800 bg-gray-900">
                  <tr>
                    <th class="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-medium text-gray-400 w-10 lg:w-16">#</th>
                    <th class="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-medium text-gray-400">Location</th>
                    <th class="px-2 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-medium text-gray-400">Kills</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(location, index) in popularLocations"
                    :key="index"
                    class="border-b border-gray-800 hover:bg-gray-900 transition-colors"
                  >
                    <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm font-bold text-gray-400">
                      {{ index + 1 }}
                    </td>
                    <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm" v-html="parseAnsiForVue(location.location)"></td>
                    <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-right font-semibold text-cyan-400">{{ location.kills }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Class Matchup Matrix -->
      <div class="rounded-lg border border-gray-800 bg-gray-950 p-3 lg:p-6">
        <h4 class="text-base lg:text-lg font-semibold mb-3 lg:mb-4 text-gray-100">Class Matchup Matrix</h4>
        <div v-if="isLoadingMatchups" class="flex items-center justify-center py-8">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        </div>
        <div v-else-if="classMatchups && classMatchups.length > 0" class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-gray-800 bg-gray-900">
              <tr>
                <th class="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-medium text-gray-400">Killer</th>
                <th class="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-medium text-gray-400">Victim</th>
                <th class="px-2 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-medium text-gray-400">Wins</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(matchup, index) in classMatchups.slice(0, 20)"
                :key="index"
                class="border-b border-gray-800 hover:bg-gray-900 transition-colors cursor-pointer"
                @click="handleMatchupClick(matchup.killer_class, matchup.victim_class)"
              >
                <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm font-medium text-green-400">{{ matchup.killer_class }}</td>
                <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm font-medium text-red-400">{{ matchup.victim_class }}</td>
                <td class="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-right font-semibold text-cyan-400">{{ matchup.wins }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-center text-gray-400 py-8">
          No class matchup data available
        </div>
      </div>
    </div>
  </div>
</template>

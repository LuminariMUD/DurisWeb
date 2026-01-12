<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useOverviewStats, usePlayerActivity, useWhoList, formatRelativeTime } from '@/composables/useAdminAnalytics'
import StatCard from './StatCard.vue'
import LineChart from '@/components/charts/LineChart.vue'
import { Users, TrendingUp, MessageSquare, Swords, UsersRound, Shield, Clock, Database, RefreshCw } from 'lucide-vue-next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-vue-next'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { useToast } from '@/composables/useToast'
import { analyticsApi } from '@/services/api'
import { useWebSocket } from '@/composables/useWebSocket'
import type { ChartData } from 'chart.js'

const { data: stats, isLoading, error, refetch: refetchStats } = useOverviewStats()
const { onPlayerLogin, offPlayerLogin, onPlayerLogout, offPlayerLogout, onWholist, offWholist, onMudOnline, offMudOnline, onMudCrash, offMudCrash, subscribePlayerEvents, unsubscribePlayerEvents, subscribeWholist, unsubscribeWholist } = useWebSocket()

// WHO list data - initial fetch, then updated via websocket events
const { data: whoListData, isLoading: whoListLoading, refetch: refetchWhoList } = useWhoList()

// mud boot time from redis (fetched on load)
const mudBootTime = ref<number | null>(null)
const uptimeSeconds = ref<number>(0)
let uptimeInterval: ReturnType<typeof setInterval> | null = null

async function fetchBootTime() {
  try {
    const response = await fetch('/api/admin/mud-boot-time')
    const data = await response.json()
    mudBootTime.value = data.bootTime
    updateUptime()
  } catch (err) {
    console.error('Failed to fetch boot time:', err)
    mudBootTime.value = null
  }
}

function updateUptime() {
  if (mudBootTime.value) {
    uptimeSeconds.value = Math.floor((Date.now() - mudBootTime.value) / 1000)
  } else {
    uptimeSeconds.value = 0
  }
}

// websocket handlers for real-time updates
const handlePlayerLogin = (_data: any) => {
  refetchWhoList()
}

const handlePlayerLogout = (_data: any) => {
  refetchWhoList()
}

const handleWholist = (_data: any) => {
  refetchWhoList()
}

const handleMudOnline = async () => {
  // mud came back online, refetch boot time
  await fetchBootTime()
  refetchStats()
  refetchWhoList()
}

const handleMudCrash = () => {
  // mud crashed, clear boot time
  mudBootTime.value = null
  uptimeSeconds.value = 0
  refetchStats()
}

let bootTimeInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchBootTime()
  uptimeInterval = setInterval(updateUptime, 10000)
  bootTimeInterval = setInterval(fetchBootTime, 30000)

  subscribePlayerEvents()
  subscribeWholist()
  onPlayerLogin(handlePlayerLogin)
  onPlayerLogout(handlePlayerLogout)
  onWholist(handleWholist)
  onMudOnline(handleMudOnline)
  onMudCrash(handleMudCrash)
})

onUnmounted(() => {
  if (uptimeInterval) clearInterval(uptimeInterval)
  if (bootTimeInterval) clearInterval(bootTimeInterval)
  unsubscribePlayerEvents()
  unsubscribeWholist()
  offPlayerLogin(handlePlayerLogin)
  offPlayerLogout(handlePlayerLogout)
  offWholist(handleWholist)
  offMudOnline(handleMudOnline)
  offMudCrash(handleMudCrash)
})

const isServerRunning = computed(() => mudBootTime.value !== null)

// use wholist data as single source of truth
const currentOnlinePlayers = computed(() => whoListData.value?.length ?? 0)
const peakPlayerCount = computed(() => stats.value?.peakPlayerCount ?? 0)
const peakPlayerTimestampValue = computed(() => stats.value?.peakPlayerTimestamp)

function formatUptimeSeconds(seconds: number): string {
  if (seconds <= 0) return 'Not Running'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const formattedUptime = computed(() => formatUptimeSeconds(uptimeSeconds.value))

const peakTimestamp = computed(() => {
  return peakPlayerTimestampValue.value
    ? formatRelativeTime(peakPlayerTimestampValue.value)
    : 'Never'
})

// Player activity chart data
const { data: activityData, isLoading: activityLoading } = usePlayerActivity(24)

const chartData = computed<ChartData<'line'>>(() => {
  if (!activityData.value || activityData.value.length === 0) {
    return {
      labels: [],
      datasets: []
    }
  }

  // Format timestamps to readable labels
  const labels = activityData.value.map(item => {
    const date = new Date(item.timestamp * 1000)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  })

  const data = activityData.value.map(item => item.playerCount)

  return {
    labels,
    datasets: [
      {
        label: 'Players Online',
        data,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ]
  }
})

// Format player uptime
function formatPlayerUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

// Refresh WHO list functionality
const { success, error: showError } = useToast()
const isRefreshing = ref(false)

async function refreshWhoList() {
  isRefreshing.value = true
  try {
    const result = await analyticsApi.cleanupAndRefreshWho()

    // Refetch the query to update the list
    await refetchWhoList()

    // Show success message
    success(result.message, 'Refreshed', 3000)
  } catch (err) {
    console.error('Failed to refresh WHO list:', err)
    showError('Failed to refresh online players', 'Error', 5000)
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Error Alert -->
    <Alert v-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load analytics data. Please try refreshing the page.
      </AlertDescription>
    </Alert>

    <!-- Overview Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <!-- Current Online Players -->
      <StatCard
        title="Online Players"
        :value="currentOnlinePlayers"
        :icon="Users"
        :is-loading="isLoading"
        subtitle="Currently in-game"
      />

      <!-- Peak Player Count -->
      <StatCard
        title="Peak Player Count"
        :value="peakPlayerCount"
        :icon="TrendingUp"
        :is-loading="isLoading"
        :subtitle="peakTimestamp"
      />

      <!-- Total Forum Posts -->
      <StatCard
        title="Total Forum Posts"
        :value="stats?.totalForumPosts ?? 0"
        :icon="MessageSquare"
        :is-loading="isLoading"
        subtitle="All-time posts"
      />

      <!-- Total PvP Battles -->
      <StatCard
        title="Total PvP Battles"
        :value="stats?.totalPvPBattles ?? 0"
        :icon="Swords"
        :is-loading="isLoading"
        subtitle="All-time battles"
      />

      <!-- Total Player Accounts -->
      <StatCard
        title="Player Accounts"
        :value="stats?.totalPlayerAccounts ?? 0"
        :icon="UsersRound"
        :is-loading="isLoading"
        subtitle="Registered accounts"
      />

      <!-- Active Guilds -->
      <StatCard
        title="Active Guilds"
        :value="stats?.activeGuilds ?? 0"
        :icon="Shield"
        :is-loading="isLoading"
        subtitle="Guilds with members"
      />

      <!-- Server Uptime -->
      <StatCard
        title="MUD Server Uptime"
        :value="formattedUptime"
        :icon="Clock"
        :is-loading="isLoading"
        :error="!isServerRunning"
        subtitle="DurisMUD runtime"
      />

      <!-- Database Status -->
      <StatCard
        title="Database"
        value="Connected"
        :icon="Database"
        :is-loading="isLoading"
        subtitle="MySQL Online"
      />
    </div>

    <!-- Player Activity Chart -->
    <div class="rounded-lg border p-6">
      <h3 class="text-lg font-semibold mb-4">Player Activity (Last 24 Hours)</h3>
      <div v-if="activityLoading" class="flex items-center justify-center h-[300px]">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
      <div v-else-if="!activityData || activityData.length === 0" class="text-center py-8 text-muted-foreground">
        No activity data available
      </div>
      <LineChart v-else :data="chartData" :height="300" />
    </div>

    <!-- WHO List -->
    <div class="rounded-lg border p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Currently Online</h3>
        <Button
          @click="refreshWhoList"
          variant="outline"
          size="sm"
          :disabled="isRefreshing"
        >
          <RefreshCw :class="['h-4 w-4 mr-2', isRefreshing && 'animate-spin']" />
          Refresh
        </Button>
      </div>
      <div v-if="whoListLoading && !whoListData" class="space-y-2">
        <div class="h-10 bg-muted animate-pulse rounded"></div>
        <div class="h-10 bg-muted animate-pulse rounded"></div>
        <div class="h-10 bg-muted animate-pulse rounded"></div>
      </div>
      <div v-else-if="!whoListData || whoListData.length === 0" class="text-center py-8 text-muted-foreground">
        No players online
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="player in whoListData"
          :key="`${player.char_name}-${player.level}-${player.last_connect}`"
          class="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
        >
          <div class="text-xl font-bold text-muted-foreground w-10 text-center">
            {{ player.level }}
          </div>
          <RouterLink
            :to="`/user/${encodeURIComponent(player.account)}`"
            class="font-medium hover:underline"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <span v-html="parseAnsiForVue(player.char_name)"></span>
          </RouterLink>
          <div class="text-sm text-muted-foreground">
            <span v-html="parseAnsiForVue(player.race)"></span>
            <span class="mx-1">•</span>
            <span v-html="parseAnsiForVue(player.class)"></span>
          </div>
          <div class="flex-1"></div>
          <div class="text-xs text-muted-foreground font-mono">
            <span v-if="player.client">{{ player.client }}</span>
            <span v-if="player.client" class="mx-2">•</span>
            <span>{{ formatPlayerUptime(player.uptime_seconds) }}</span>
            <span class="mx-2">•</span>
            <RouterLink
              :to="`/user/${encodeURIComponent(player.account)}`"
              class="hover:underline text-primary"
            >
              {{ player.account }}
            </RouterLink>
            <span class="mx-2">•</span>
            <span>{{ player.last_ip }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

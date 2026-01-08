<script setup lang="ts">
import { computed } from 'vue'
import { usePvPStats } from '@/composables/useAdminAnalytics'
import StatCard from './StatCard.vue'
import { Swords, TrendingUp, Calendar, MapPin } from 'lucide-vue-next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-vue-next'
import { parseAnsiForVue } from '@/utils/ansiParser'

const { data: stats, isLoading, error } = usePvPStats()

const killsByClass = computed(() => stats.value?.killsByClass || [])
</script>

<template>
  <div class="space-y-6">
    <!-- Error Alert -->
    <Alert v-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load PvP statistics. Please try refreshing the page.
      </AlertDescription>
    </Alert>

    <!-- Overview Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Battles"
        :value="stats?.totalBattles ?? 0"
        :icon="Swords"
        :is-loading="isLoading"
        subtitle="All-time battles"
      />

      <StatCard
        title="Battles Today"
        :value="stats?.battlesToday ?? 0"
        :icon="TrendingUp"
        :is-loading="isLoading"
        subtitle="Last 24 hours"
      />

      <StatCard
        title="Battles This Week"
        :value="stats?.battlesThisWeek ?? 0"
        :icon="Calendar"
        :is-loading="isLoading"
        subtitle="Last 7 days"
      />

      <div v-if="stats?.mostActiveLocation" class="rounded-lg border p-6">
        <div class="flex items-start gap-3">
          <MapPin class="h-4 w-4 mt-1 text-muted-foreground" />
          <div class="flex-1">
            <div class="text-sm font-medium text-muted-foreground mb-1">Hotspot</div>
            <div class="text-2xl font-bold" v-html="parseAnsiForVue(stats.mostActiveLocation.location)"></div>
            <div class="text-sm text-muted-foreground mt-1">
              {{ stats.mostActiveLocation.battles }} battles
            </div>
          </div>
        </div>
      </div>
      <div v-else class="rounded-lg border p-6">
        <div class="flex items-start gap-3">
          <MapPin class="h-4 w-4 mt-1 text-muted-foreground" />
          <div class="flex-1">
            <div class="text-sm font-medium text-muted-foreground mb-1">Hotspot</div>
            <div v-if="isLoading" class="h-8 bg-muted animate-pulse rounded w-32"></div>
            <div v-else class="text-2xl font-bold">No data</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top Killers, Victims & Class Stats -->
    <div class="grid gap-4 md:grid-cols-3">
      <!-- Top Killer -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Top Killer</h3>
        <div v-if="isLoading" class="h-24 bg-muted animate-pulse rounded"></div>
        <div v-else-if="!stats?.topKiller" class="text-center py-8 text-muted-foreground">
          No PvP activity yet
        </div>
        <div v-else class="space-y-3">
          <div class="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div class="font-medium mb-1" v-html="parseAnsiForVue(stats.topKiller.name)"></div>
            <div class="text-2xl font-bold text-green-400">
              {{ stats.topKiller.kills }} kills
            </div>
          </div>
        </div>
      </div>

      <!-- Top Victim -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Top Victim</h3>
        <div v-if="isLoading" class="h-24 bg-muted animate-pulse rounded"></div>
        <div v-else-if="!stats?.topVictim" class="text-center py-8 text-muted-foreground">
          No PvP activity yet
        </div>
        <div v-else class="space-y-3">
          <div class="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div class="font-medium mb-1" v-html="parseAnsiForVue(stats.topVictim.name)"></div>
            <div class="text-2xl font-bold text-red-400">
              {{ stats.topVictim.deaths }} deaths
            </div>
          </div>
        </div>
      </div>

      <!-- Kills by Class -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Kills by Class</h3>
        <div v-if="isLoading" class="space-y-2">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="killsByClass.length === 0" class="text-center py-8 text-muted-foreground">
          No data available
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="classData in killsByClass.slice(0, 5)"
            :key="classData.className"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <span class="font-medium" v-html="parseAnsiForVue(classData.className)"></span>
            <span class="text-sm text-muted-foreground">
              {{ classData.kills }} kills
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

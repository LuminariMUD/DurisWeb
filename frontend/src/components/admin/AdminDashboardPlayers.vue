<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStats } from '@/composables/useAdminAnalytics'
import StatCard from './StatCard.vue'
import { Users, TrendingUp, Shield, BarChart3 } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from '@lucide/vue'
import { parseAnsiForVue } from '@/utils/ansiParser'

const { data: stats, isLoading, error } = usePlayerStats()

const topGuilds = computed(() => stats.value?.topGuilds || [])
const levelDistribution = computed(() => stats.value?.levelDistribution || [])
</script>

<template>
  <div class="space-y-6">
    <!-- Error Alert -->
    <Alert v-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load player statistics. Please try refreshing the page.
      </AlertDescription>
    </Alert>

    <!-- Overview Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Accounts"
        :value="stats?.totalAccounts ?? 0"
        :icon="Users"
        :is-loading="isLoading"
        subtitle="Registered players"
      />

      <StatCard
        title="Max Level"
        :value="stats?.maxLevel ?? 0"
        :icon="TrendingUp"
        :is-loading="isLoading"
        subtitle="Highest character"
      />

      <StatCard
        title="Average Level"
        :value="stats?.avgLevel ?? 0"
        :icon="BarChart3"
        :is-loading="isLoading"
        subtitle="Across all characters"
      />

      <StatCard
        title="Active Guilds"
        :value="topGuilds.length"
        :icon="Shield"
        :is-loading="isLoading"
        subtitle="With members"
      />
    </div>

    <!-- Racewar Distribution -->
    <div class="rounded-lg border p-6">
      <h3 class="text-lg font-semibold mb-4">Racewar Distribution</h3>
      <div class="grid gap-4 md:grid-cols-5">
        <div class="p-4 rounded-lg bg-faint/10 border border-faint/20">
          <h3 class="text-sm font-medium text-bone-muted mb-2">None (0)</h3>
          <div v-if="isLoading" class="h-12 bg-muted animate-pulse rounded"></div>
          <div v-else class="text-3xl font-bold text-muted-foreground">
            {{ stats?.noneCount ?? 0 }}
          </div>
        </div>

        <div class="p-4 rounded-lg bg-warning/10 border border-warning/20">
          <h3 class="text-sm font-medium text-warning mb-2">Good (1)</h3>
          <div v-if="isLoading" class="h-12 bg-muted animate-pulse rounded"></div>
          <div v-else class="text-3xl font-bold text-warning">
            {{ stats?.goodsCount ?? 0 }}
          </div>
        </div>

        <div class="p-4 rounded-lg bg-danger/10 border border-danger/20">
          <h3 class="text-sm font-medium text-danger mb-2">Evil (2)</h3>
          <div v-if="isLoading" class="h-12 bg-muted animate-pulse rounded"></div>
          <div v-else class="text-3xl font-bold text-danger">
            {{ stats?.evilsCount ?? 0 }}
          </div>
        </div>

        <div class="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <h3 class="text-sm font-medium text-purple-300 mb-2">Undead (3)</h3>
          <div v-if="isLoading" class="h-12 bg-muted animate-pulse rounded"></div>
          <div v-else class="text-3xl font-bold text-purple-400">
            {{ stats?.undeadsCount ?? 0 }}
          </div>
        </div>

        <div class="p-4 rounded-lg bg-info/10 border border-info/20">
          <h3 class="text-sm font-medium text-info mb-2">Neutral (4)</h3>
          <div v-if="isLoading" class="h-12 bg-muted animate-pulse rounded"></div>
          <div v-else class="text-3xl font-bold text-info">
            {{ stats?.neutralsCount ?? 0 }}
          </div>
        </div>
      </div>
    </div>

    <!-- Top Guilds & Level Distribution -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Top Guilds -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Top Guilds</h3>
        <div v-if="isLoading" class="space-y-2">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="topGuilds.length === 0" class="text-center py-8 text-muted-foreground">
          No guilds found
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(guild, index) in topGuilds"
            :key="guild.guild"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-muted-foreground w-6">
                #{{ index + 1 }}
              </span>
              <span class="font-medium" v-html="parseAnsiForVue(guild.guild)"></span>
            </div>
            <span class="text-sm text-muted-foreground">
              {{ guild.memberCount }} members
            </span>
          </div>
        </div>
      </div>

      <!-- Level Distribution -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Level Distribution</h3>
        <div v-if="isLoading" class="space-y-2">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="levelDistribution.length === 0" class="text-center py-8 text-muted-foreground">
          No data available
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="level in levelDistribution"
            :key="level.range"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <span class="font-medium">Level {{ level.range }}</span>
            <span class="text-sm text-muted-foreground">
              {{ level.count }} players
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<template>
  <div class="top-fragger-widget h-full">
    <!-- Loading state -->
    <div v-if="isLoading" class="space-y-2">
      <div v-for="i in 5" :key="i" class="h-10 bg-ink-top/50 rounded animate-pulse" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-center text-faint py-4 text-sm">
      Failed to load leaderboard
    </div>

    <!-- Empty state -->
    <div v-else-if="!topPlayers.length" class="text-center text-faint py-4 text-sm">
      No frag data available
    </div>

    <!-- Leaderboard -->
    <div v-else class="space-y-1">
      <div
        v-for="(player, index) in topPlayers"
        :key="player.char_name"
        class="flex items-center justify-between px-3 py-2 rounded bg-ink-high/50 hover:bg-ink-top/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          <span
            :class="[
              'w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0',
              index === 0 ? 'bg-warning/20 text-warning' :
              index === 1 ? 'bg-bone-muted/20 text-foreground' :
              index === 2 ? 'bg-warning-deep/20 text-warning' :
              'bg-rule/20 text-muted-foreground'
            ]"
          >
            {{ index + 1 }}
          </span>
          <div class="min-w-0">
            <div class="text-base font-medium text-foreground" v-html="parseAnsiForVue(player.char_name)" />
            <div class="text-sm text-faint">
              <span>Lvl {{ player.level }}</span>
              <span class="mx-1">·</span>
              <span v-html="parseAnsiForVue(player.race)" />
              <span class="mx-1">·</span>
              <span v-html="parseAnsiForVue(player.class)" />
            </div>
          </div>
        </div>
        <div class="text-base font-semibold text-vermilion flex-shrink-0">{{ player.total_frags.toFixed(2) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fragApi } from '@/services/api'
import { parseAnsiForVue } from '@/utils/ansiParser'
import type { FragLeaderboardEntry } from '@/types'

const isLoading = ref(true)
const error = ref(false)
const topPlayers = ref<FragLeaderboardEntry[]>([])

onMounted(async () => {
  try {
    const response = await fragApi.getLeaderboard({ limit: 5 })
    topPlayers.value = response.data?.slice(0, 5) || []
  } catch {
    error.value = true
  } finally {
    isLoading.value = false
  }
})
</script>

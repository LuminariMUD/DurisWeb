<template>
  <div class="recent-pvp-widget h-full">
    <!-- Loading state -->
    <div v-if="isLoading" class="text-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-vermilion mx-auto" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-center text-faint py-4 text-sm">
      Failed to load recent PvP
    </div>

    <!-- Empty state -->
    <div v-else-if="!latestEvent" class="text-center text-faint py-4 text-sm">
      No recent PvP events
    </div>

    <!-- Latest PvP event -->
    <div v-else class="text-center space-y-2">
      <!-- Location -->
      <div class="text-sm text-muted-foreground">{{ latestEvent.room_name }}</div>

      <!-- Winner -->
      <div class="text-danger font-medium">
        <span
          v-for="(killer, idx) in latestEvent.killers"
          :key="`k-${idx}`"
          v-html="parseAnsiForVue(killer.description)"
        />
      </div>

      <!-- VS -->
      <div class="text-xs text-faint uppercase tracking-wider">vs</div>

      <!-- Victim -->
      <div class="text-vermilion font-medium">
        <span
          v-for="(victim, idx) in latestEvent.victims"
          :key="`v-${idx}`"
          v-html="parseAnsiForVue(victim.description)"
        />
      </div>

      <!-- Link to PvP page -->
      <a
        :href="`/pvp/${latestEvent.id}`"
        class="inline-block mt-2 text-xs text-muted-foreground hover:text-vermilion transition-colors"
      >
        View Details →
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { pvpApi } from '@/services/api'
import { parseAnsiForVue } from '@/utils/ansiParser'
import type { PvPEvent } from '@/types'

const isLoading = ref(true)
const error = ref(false)
const latestEvent = ref<PvPEvent | null>(null)

onMounted(async () => {
  try {
    const response = await pvpApi.getEvents({ limit: 1 })
    latestEvent.value = response.data?.[0] || null
  } catch {
    error.value = true
  } finally {
    isLoading.value = false
  }
})
</script>

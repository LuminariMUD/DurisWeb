<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useMapBroadcastReceiver } from '@/composables/useMapBroadcast'
import MudMap from '@/components/mud/MudMap.vue'
import { WifiOff, Loader2 } from 'lucide-vue-next'

const {
  room,
  visitedRooms,
  wildernessMap,
  zoneNumber,
  isConnected,
  requestSync,
  requestSpeedwalk
} = useMapBroadcastReceiver()

// Track if we've ever received data
const hasReceivedData = ref(false)

watch(room, (newRoom) => {
  if (newRoom) {
    hasReceivedData.value = true
  }
})

onMounted(() => {
  // Set window title
  document.title = 'DurisMUD - Map'

  // Request initial sync
  requestSync()
})
</script>

<template>
  <div class="h-screen w-screen bg-black overflow-hidden relative">
    <!-- Waiting for connection -->
    <div
      v-if="!hasReceivedData"
      class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 z-10"
    >
      <Loader2 class="h-8 w-8 animate-spin mb-4" />
      <p class="text-sm">Waiting for game window...</p>
      <p class="text-xs mt-2 text-gray-500">Make sure the game is running</p>
    </div>

    <!-- Disconnected warning -->
    <div
      v-else-if="!isConnected"
      class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10"
    >
      <WifiOff class="h-8 w-8 text-red-400 mb-4" />
      <p class="text-sm text-gray-300">Connection lost</p>
      <p class="text-xs mt-2 text-gray-500">Game window may be closed</p>
    </div>

    <!-- Map Component (reusing MudMap in standalone mode) -->
    <MudMap
      v-if="hasReceivedData"
      standalone
      :room="room"
      :visited-rooms="visitedRooms"
      :wilderness-map="wildernessMap"
      :zone-number="zoneNumber"
      :on-speedwalk-request="requestSpeedwalk"
      class="absolute inset-0"
    />

    <!-- Connection status indicator (small, top-right) -->
    <div class="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/50 rounded px-2 py-1">
      <div
        :class="[
          'w-2 h-2 rounded-full',
          isConnected ? 'bg-green-500' : 'bg-red-500'
        ]"
      />
      <span class="text-xs text-gray-400">
        {{ isConnected ? 'Synced' : 'Disconnected' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Ensure full viewport coverage */
</style>

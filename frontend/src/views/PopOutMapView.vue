<script setup lang="ts">
import { onMounted } from 'vue'
import { useMapBroadcastReceiver } from '../composables/useMapBroadcast.js'
import MudMap from '../components/mud/MudMap.vue'
const { snapshot, isConnected, hasData, requestAction } = useMapBroadcastReceiver()
onMounted(() => {
  document.title = 'DurisMUD — Map'
})
</script>
<template>
  <main class="h-screen w-screen bg-background">
    <MudMap v-if="isConnected" standalone :snapshot="snapshot" :on-action="requestAction" />
    <div v-else class="h-full flex items-center justify-center p-4 text-muted-foreground" role="status">
      {{ hasData ? 'Map session ended or connection lost. Open a new map from the game window.' : 'Waiting for the owning game window. Open this map using Pop out in /play.' }}
    </div>
  </main>
</template>

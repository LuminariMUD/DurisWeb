<template>
  <div class="map-preview-widget h-full relative" :style="height ? { minHeight: `${height}px` } : {}">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center bg-gray-800/50 rounded" :style="{ height: `${height}px` }">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex items-center justify-center bg-gray-800/50 rounded text-gray-500" :style="{ height: `${height}px` }">
      Failed to load map
    </div>

    <!-- Map preview -->
    <template v-else>
      <div class="absolute inset-0 rounded overflow-hidden">
        <LeafletMap
          v-if="bounds"
          :bounds="bounds"
          :initial-zoom="1"
          :initial-show-markers="false"
          :initial-show-zone-names="false"
          :hide-controls="true"
          :min-zoom="0"
          :zoom-snap="0.25"
          style="width: 100%; height: 100%;"
        />
      </div>
      <a
        href="/wiki/map"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 text-white px-4 py-2 bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-colors shadow-lg"
      >
        <Map class="h-4 w-4" />
        <span class="text-sm font-medium">Explore World Map</span>
      </a>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Map } from 'lucide-vue-next'
import LeafletMap from '@/components/wiki/LeafletMap.vue'
import { wikiApi } from '@/services/api'
import type { WikiMapBounds } from '@/types'

defineProps<{
  height?: number
}>()

const isLoading = ref(true)
const error = ref(false)
const bounds = ref<WikiMapBounds | null>(null)

onMounted(async () => {
  try {
    bounds.value = await wikiApi.getMapBounds()
  } catch {
    error.value = true
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <NodeViewWrapper class="widget-node-wrapper my-4 h-full">
    <div class="widget-container rounded-lg border border-gray-600 overflow-hidden h-full flex flex-col">
      <!-- Header -->
      <div class="border-b border-gray-700 bg-gray-900 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2">
          <MapIcon class="h-4 w-4 text-cyan-500" />
          <span class="text-sm font-medium text-gray-300">World Map Widget</span>
        </div>
        <button
          @click="deleteNode"
          class="text-gray-400 hover:text-red-400 transition-colors"
          type="button"
          title="Remove widget"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Preview -->
      <div class="map-wrapper flex-1 min-h-0">
        <MapPreviewDisplay />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Map as MapIcon, X } from 'lucide-vue-next'
import MapPreviewDisplay from '@/components/forum/widgets/MapPreviewDisplay.vue'

const props = defineProps(nodeViewProps)

function deleteNode() {
  props.deleteNode()
}
</script>

<style scoped>
.widget-node-wrapper {
  user-select: none;
}

.widget-container {
  background: transparent;
}

.map-wrapper {
  position: relative;
  height: 100%;
  overflow: hidden;
}

:deep(.map-preview-widget) {
  position: absolute;
  inset: 0;
}
</style>

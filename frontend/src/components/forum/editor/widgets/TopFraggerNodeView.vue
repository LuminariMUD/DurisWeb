<template>
  <NodeViewWrapper class="widget-node-wrapper my-4 h-full">
    <div class="widget-container rounded-lg border border-faint overflow-hidden h-full flex flex-col">
      <!-- Header -->
      <div class="border-b border-border bg-card px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2">
          <Trophy class="h-4 w-4 text-warning" />
          <span class="text-sm font-medium text-bone-muted">Top Fragger Widget</span>
        </div>
        <button
          @click="deleteNode"
          class="text-muted-foreground hover:text-danger transition-colors"
          type="button"
          title="Remove widget"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Preview -->
      <div class="content-wrapper flex-1 min-h-0">
        <TopFraggerDisplay />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Trophy, X } from '@lucide/vue'
import TopFraggerDisplay from '@/components/forum/widgets/TopFraggerDisplay.vue'

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

.content-wrapper {
  overflow: auto;
}

:deep(.top-fragger-widget) {
  height: 100%;
}
</style>

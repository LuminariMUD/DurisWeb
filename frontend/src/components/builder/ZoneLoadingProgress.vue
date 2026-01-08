<script setup lang="ts">
import { computed } from 'vue'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'

const props = defineProps<{
  type: 'rooms' | 'mobs' | 'objects'
  loaded: number
  total: number
  isStreaming: boolean
  isComplete?: boolean
  error?: string | null
}>()

const percentage = computed(() =>
  props.total > 0 ? Math.round((props.loaded / props.total) * 100) : 0
)

// Show indeterminate state when streaming but total not yet known
const isIndeterminate = computed(() =>
  props.isStreaming && props.total === 0
)

const typeLabel = computed(() => {
  switch (props.type) {
    case 'rooms':
      return 'Rooms'
    case 'mobs':
      return 'Mobs'
    case 'objects':
      return 'Objects'
    default:
      return 'Items'
  }
})
</script>

<template>
  <div class="space-y-2 p-3 bg-muted/50 rounded-lg">
    <div class="flex items-center justify-between text-sm">
      <div class="flex items-center gap-2">
        <Loader2
          v-if="isStreaming"
          class="h-4 w-4 animate-spin text-primary"
        />
        <CheckCircle2
          v-else-if="isComplete && !error"
          class="h-4 w-4 text-green-500"
        />
        <XCircle
          v-else-if="error"
          class="h-4 w-4 text-destructive"
        />
        <span :class="{ 'text-destructive': error }">
          {{ isStreaming ? `Loading ${typeLabel}...` : error ? `Error loading ${typeLabel}` : `${typeLabel} loaded` }}
        </span>
      </div>
      <span class="text-muted-foreground tabular-nums">
        <template v-if="isIndeterminate">Loading...</template>
        <template v-else>{{ loaded.toLocaleString() }} / {{ total.toLocaleString() }} ({{ percentage }}%)</template>
      </span>
    </div>

    <Progress
      :model-value="isIndeterminate ? undefined : percentage"
      class="h-2"
      :class="{ '[&>div]:bg-destructive': error }"
    />

    <p
      v-if="error"
      class="text-xs text-destructive"
    >
      {{ error }}
    </p>
  </div>
</template>

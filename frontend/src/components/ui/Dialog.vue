<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui'

interface Props {
  open: boolean
  title?: string
  titleHtml?: string
  size?: 'default' | 'compact'
  noPadding?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
  noPadding: false,
})
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// Compute dialog size classes
const dialogClasses = computed(() => {
  if (props.size === 'compact') {
    return 'w-[calc(100%-2rem)] sm:w-full sm:max-w-2xl max-h-[80vh]'
  }
  return 'w-[calc(100%-2rem)] h-full sm:max-w-7xl max-h-[95vh]'
})
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/80" />
      <DialogContent
        :aria-describedby="undefined"
        :class="['fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-w-[calc(100%-2rem)] flex flex-col bg-background border border-border rounded-lg shadow-xl', dialogClasses]"
      >
        <div class="flex items-center justify-between p-4 border-b border-border">
          <DialogTitle v-if="titleHtml" class="text-lg font-semibold text-foreground"><span v-html="titleHtml" /></DialogTitle>
          <DialogTitle v-else class="text-lg font-semibold text-foreground">{{ title || 'Dialog' }}</DialogTitle>
          <DialogClose class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-vermilion focus:ring-offset-2">
            <svg class="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span class="sr-only">Close</span>
          </DialogClose>
        </div>
        <div :class="['flex-1 overflow-auto', noPadding ? '' : 'p-6']">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

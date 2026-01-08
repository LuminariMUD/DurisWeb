<script setup lang="ts">
import { watch, computed } from 'vue'

interface Props {
  open: boolean
  title?: string
  titleHtml?: string
  size?: 'default' | 'compact'
  noPadding?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
  noPadding: false
})
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const close = () => {
  emit('update:open', false)
}

// Compute dialog size classes
const dialogClasses = computed(() => {
  if (props.size === 'compact') {
    return 'w-full max-w-2xl max-h-[80vh]'
  }
  return 'w-full h-full max-w-7xl max-h-[95vh]'
})

// Prevent body scroll when dialog is open
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="close"
      >
        <div :class="['relative m-4 flex flex-col bg-gray-950 border border-gray-800 rounded-lg shadow-xl', dialogClasses]">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 v-if="titleHtml" class="text-lg font-semibold text-gray-100" v-html="titleHtml"></h2>
            <h2 v-else-if="title" class="text-lg font-semibold text-gray-100">{{ title }}</h2>
            <button
              @click="close"
              class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
            >
              <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span class="sr-only">Close</span>
            </button>
          </div>

          <!-- Content -->
          <div :class="['flex-1 overflow-auto', noPadding ? '' : 'p-6']">
            <slot></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

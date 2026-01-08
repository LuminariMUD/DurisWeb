<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { Loader2, ServerCog } from 'lucide-vue-next'

const store = useMudStore()

const isVisible = computed(() => store.copyoverInProgress)
const message = computed(() => store.copyoverMessage || 'Server updating, please wait...')
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-full"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-300 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-full"
  >
    <div
      v-if="isVisible"
      class="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 shadow-lg"
    >
      <div class="flex items-center justify-center gap-3 max-w-screen-xl mx-auto">
        <ServerCog class="h-5 w-5 animate-pulse" />
        <span class="font-medium">{{ message }}</span>
        <Loader2 class="h-4 w-4 animate-spin" />
      </div>
    </div>
  </Transition>
</template>

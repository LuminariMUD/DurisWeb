<script setup lang="ts">
import { parseAnsiForVue } from '@/utils/ansiParser'
import { computed } from 'vue'
import { Bell } from 'lucide-vue-next'

const props = defineProps<{
  message: string
  onDismiss: () => void
}>()

const parsedMessage = computed(() => parseAnsiForVue(props.message))
</script>

<template>
  <div
    class="flex items-start gap-3 p-4 bg-card border border-border rounded-lg shadow-lg cursor-pointer hover:bg-muted/50 transition-colors min-w-[300px] max-w-[400px]"
    @click="onDismiss"
  >
    <div class="shrink-0 p-1.5 rounded-full bg-blue-500/20">
      <Bell class="h-4 w-4 text-blue-400" />
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-foreground mb-0.5">New Notification</p>
      <p class="text-sm text-muted-foreground leading-snug" v-html="parsedMessage" />
    </div>
  </div>
</template>

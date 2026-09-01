<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2, Info } from 'lucide-vue-next'

interface ProgressEntry {
  message: string
  status: 'info' | 'success' | 'error'
  timestamp: Date
}

defineProps<{
  open: boolean
  characterName: string
  accountName: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'complete', success: boolean): void
}>()

const { onDeleteProgress, offDeleteProgress } = useWebSocket()

const progressLog = ref<ProgressEntry[]>([])
const isComplete = ref(false)
const wasSuccessful = ref(false)
const logContainer = ref<HTMLElement | null>(null)

function handleProgress(data: { requestId: string; message: string; status: string }) {
  progressLog.value.push({
    message: data.message,
    status: data.status as 'info' | 'success' | 'error',
    timestamp: new Date(),
  })

  // Check if deletion completed
  if (data.message === 'Character deletion completed') {
    isComplete.value = true
    wasSuccessful.value = data.status === 'success'
  }

  // Auto-scroll to bottom
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

function handleClose() {
  if (isComplete.value) {
    emit('complete', wasSuccessful.value)
  }
  emit('update:open', false)
  // Reset state for next use
  progressLog.value = []
  isComplete.value = false
  wasSuccessful.value = false
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return CheckCircle2
    case 'error':
      return XCircle
    default:
      return Info
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    default:
      return 'text-blue-500'
  }
}

onMounted(() => {
  onDeleteProgress(handleProgress)
})

onUnmounted(() => {
  offDeleteProgress(handleProgress)
})
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Loader2 v-if="!isComplete" class="h-5 w-5 animate-spin" />
          <CheckCircle2 v-else-if="wasSuccessful" class="h-5 w-5 text-green-500" />
          <XCircle v-else class="h-5 w-5 text-red-500" />
          Deleting {{ characterName }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Removing character from account {{ accountName }}
        </p>

        <!-- Progress Log -->
        <div
          ref="logContainer"
          class="bg-muted/50 rounded-md p-3 h-64 overflow-y-auto font-mono text-sm space-y-1"
        >
          <div
            v-for="(entry, index) in progressLog"
            :key="index"
            class="flex items-start gap-2"
          >
            <component
              :is="getStatusIcon(entry.status)"
              class="h-4 w-4 mt-0.5 shrink-0"
              :class="getStatusColor(entry.status)"
            />
            <span :class="entry.status === 'error' ? 'text-red-500' : ''">
              {{ entry.message }}
            </span>
          </div>

          <!-- Waiting indicator when no progress yet -->
          <div v-if="progressLog.length === 0" class="flex items-center gap-2 text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
            Waiting for MUD response...
          </div>
        </div>

        <!-- Close button -->
        <div class="flex justify-end">
          <Button
            @click="handleClose"
            :variant="isComplete ? 'default' : 'outline'"
            :disabled="!isComplete"
          >
            {{ isComplete ? 'Close' : 'Processing...' }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

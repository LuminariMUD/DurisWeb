<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  targetHash: string
  targetMessage: string
  action: 'deploy' | 'rollback'
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'complete', success: boolean): void
}>()

interface LogEntry {
  type: string
  message: string
}

const logs = ref<LogEntry[]>([])
const isRunning = ref(false)
const isComplete = ref(false)
const success = ref(false)
const logContainer = ref<HTMLElement | null>(null)
const wsRef = ref<WebSocket | null>(null)

// Get terminal token from backend API (reuse existing endpoint)
async function getToken(): Promise<string | null> {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    const response = await fetch(`${apiUrl}/api/auth/terminal-token`, {
      credentials: 'include',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.token || null
  } catch {
    return null
  }
}

watch(
  () => props.open,
  async (newVal) => {
    if (newVal && props.targetHash) {
      await startDeployment()
    }
  },
)

onUnmounted(() => {
  if (wsRef.value) {
    wsRef.value.close()
    wsRef.value = null
  }
})

async function startDeployment() {
  logs.value = []
  isRunning.value = true
  isComplete.value = false
  success.value = false

  // Get auth token
  const token = await getToken()
  if (!token) {
    logs.value.push({ type: 'error', message: 'Authentication failed. Please log in again.' })
    isRunning.value = false
    isComplete.value = true
    success.value = false
    return
  }

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

  try {
    const ws = new WebSocket(wsUrl)
    wsRef.value = ws

    ws.onopen = () => {
      // Send deployment request
      ws.send(
        JSON.stringify({
          type: 'DEPLOY_START',
          token,
          targetHash: props.targetHash,
        }),
      )
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'DEPLOY_STARTED':
            logs.value.push({
              type: 'info',
              message: `Starting ${data.action}: ${data.fromHash} -> ${data.toHash}`,
            })
            break

          case 'DEPLOY_PROGRESS':
            logs.value.push({
              type: data.progressType,
              message: data.message,
            })
            scrollToBottom()
            break

          case 'DEPLOY_COMPLETE':
            isRunning.value = false
            isComplete.value = true
            success.value = data.success
            emit('complete', data.success)
            ws.close()
            break

          case 'DEPLOY_ERROR':
            logs.value.push({ type: 'error', message: data.message })
            isRunning.value = false
            isComplete.value = true
            success.value = false
            ws.close()
            break
        }
      } catch (err) {
        console.error('Error parsing deployment message:', err)
      }
    }

    ws.onerror = () => {
      logs.value.push({ type: 'error', message: 'WebSocket connection failed' })
      isRunning.value = false
      isComplete.value = true
      success.value = false
    }

    ws.onclose = () => {
      if (isRunning.value) {
        logs.value.push({ type: 'error', message: 'Connection closed unexpectedly' })
        isRunning.value = false
        isComplete.value = true
        success.value = false
      }
    }
  } catch {
    logs.value.push({ type: 'error', message: 'Failed to connect to server' })
    isRunning.value = false
    isComplete.value = true
    success.value = false
  }
}

async function scrollToBottom() {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

function getLogClass(type: string): string {
  switch (type) {
    case 'error':
      return 'text-red-500'
    case 'success':
      return 'text-green-500'
    case 'step':
      return 'text-blue-400 font-semibold'
    case 'info':
      return 'text-yellow-400'
    case 'compile':
      return 'text-gray-300'
    case 'output':
      return 'text-gray-400'
    default:
      return 'text-gray-400'
  }
}

function handleClose() {
  if (wsRef.value) {
    wsRef.value.close()
    wsRef.value = null
  }
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="!max-w-[90vw] w-[1200px] max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Loader2 v-if="isRunning" class="h-5 w-5 animate-spin" />
          <CheckCircle v-else-if="success" class="h-5 w-5 text-green-500" />
          <XCircle v-else-if="isComplete" class="h-5 w-5 text-red-500" />
          {{ action === 'deploy' ? 'Deploying' : 'Rolling back' }} to {{ targetHash.substring(0, 7) }}
        </DialogTitle>
        <DialogDescription class="truncate">
          {{ targetMessage }}
        </DialogDescription>
      </DialogHeader>

      <!-- Log Output Terminal -->
      <div
        ref="logContainer"
        class="flex-1 bg-black rounded-lg p-4 min-h-[500px] max-h-[600px] overflow-auto font-mono text-sm"
      >
        <div
          v-for="(log, index) in logs"
          :key="index"
          :class="getLogClass(log.type)"
          class="whitespace-pre-wrap break-all leading-relaxed"
        >{{ log.message }}</div>

        <div v-if="isRunning && logs.length === 0" class="text-gray-500">
          Connecting...
        </div>

        <div v-if="isRunning && logs.length > 0" class="text-gray-500 animate-pulse mt-2">
          _
        </div>
      </div>

      <!-- Status & Close -->
      <div class="flex items-center justify-between pt-4 border-t">
        <div v-if="isComplete" class="flex items-center gap-2">
          <template v-if="success">
            <CheckCircle class="h-5 w-5 text-green-500" />
            <span class="text-green-500 text-sm">Complete! Remember to shutdown/copyover the MUD.</span>
          </template>
          <template v-else>
            <XCircle class="h-5 w-5 text-red-500" />
            <span class="text-red-500 text-sm">Deployment failed. Check the log above for errors.</span>
          </template>
        </div>
        <div v-else class="text-muted-foreground text-sm">
          Please wait while deployment is in progress...
        </div>

        <Button
          :disabled="isRunning"
          @click="handleClose"
        >
          {{ isRunning ? 'Running...' : 'Close' }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

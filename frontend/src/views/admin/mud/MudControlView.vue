<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMudControl, formatUptime, formatRelativeTime } from '@/composables/useMudControl'
import { useWebSocket } from '@/composables/useWebSocket'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Power,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Cpu,
  MemoryStick,
  Timer,
  User,
  Terminal,
  ExternalLink
} from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { RouterLink } from 'vue-router'

const { success: toastSuccess, error: toastError } = useToast()

const {
  status,
  statusLoading,
  statusError,
  refetchStatus,
  isRunning,
  isStopped,
  isTransitioning,
  startMud,
  stopMud,
  restartMud,
  isStarting,
  isStopping,
  isRestarting,
} = useMudControl()

// Dialog state
const showStopDialog = ref(false)
const showRestartDialog = ref(false)
const stopReason = ref('')
const restartReason = ref('')

// Output modal state
const showOutputDialog = ref(false)
const selectedOutput = ref('')
const outputLoading = ref(false)
const currentOperationId = ref<string | null>(null)
const isLiveOutput = ref(false)
const outputContainerRef = ref<HTMLElement | null>(null)

// WebSocket for live output
const { onMudControlOutput, offMudControlOutput } = useWebSocket()

// Handle live output from WebSocket
const handleLiveOutput = (data: { operationId: string; chunk: string; isComplete: boolean }) => {
  // Accept output if we're watching for any operation (operationId can change between calls)
  if (showOutputDialog.value && isLiveOutput.value) {
    // Track the operation ID once we receive output
    if (!currentOperationId.value && data.operationId) {
      currentOperationId.value = data.operationId
    }
    // Only process if it's the same operation we're tracking (or first output)
    if (!currentOperationId.value || currentOperationId.value === data.operationId) {
      if (data.chunk) {
        selectedOutput.value += data.chunk
        // Auto-scroll to bottom
        nextTick(() => {
          if (outputContainerRef.value) {
            outputContainerRef.value.scrollTop = outputContainerRef.value.scrollHeight
          }
        })
      }
      if (data.isComplete) {
        isLiveOutput.value = false
        outputLoading.value = false
      }
    }
  }
}

// Start watching live output for an operation
function watchLiveOutput() {
  currentOperationId.value = null
  selectedOutput.value = ''
  isLiveOutput.value = true
  outputLoading.value = true
  showOutputDialog.value = true
}

// Close output dialog
function closeOutputDialog() {
  showOutputDialog.value = false
  currentOperationId.value = null
  isLiveOutput.value = false
}

// Setup WebSocket listener
onMounted(() => {
  onMudControlOutput(handleLiveOutput)
})

onUnmounted(() => {
  offMudControlOutput(handleLiveOutput)
})

// Status badge styling
function getStateClass(state: string): string {
  switch (state) {
    case 'running':
      return 'bg-green-500 hover:bg-green-600'
    case 'stopped':
      return 'bg-red-500 hover:bg-red-600'
    case 'starting':
    case 'stopping':
      return 'bg-yellow-500 hover:bg-yellow-600'
    default:
      return 'bg-gray-500 hover:bg-gray-600'
  }
}

function getStateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'running':
      return 'default'
    case 'stopped':
      return 'destructive'
    case 'starting':
    case 'stopping':
      return 'secondary'
    default:
      return 'outline'
  }
}

// Action handlers
async function handleStart() {
  // Open live output modal and wait for Vue to update
  watchLiveOutput()
  await nextTick()

  try {
    const result = await startMud()
    if (result.success) {
      toastSuccess(result.message, 'MUD Starting')
    } else {
      toastError(result.message, 'Start Failed')
    }
  } catch (error) {
    toastError(error instanceof Error ? error.message : 'Failed to start MUD', 'Error')
  }
}

async function handleStop() {
  if (!stopReason.value.trim()) {
    return
  }
  const reason = stopReason.value
  // Close dialog immediately - stop can take a few seconds
  showStopDialog.value = false
  stopReason.value = ''

  // Open live output modal and wait for Vue to update
  watchLiveOutput()
  await nextTick()

  try {
    const result = await stopMud(reason)
    if (result.success) {
      toastSuccess(result.message, 'MUD Stopping')
    } else {
      toastError(result.message, 'Stop Failed')
    }
  } catch (error) {
    toastError(error instanceof Error ? error.message : 'Failed to stop MUD', 'Error')
  }
}

async function handleRestart() {
  if (!restartReason.value.trim()) {
    return
  }
  const reason = restartReason.value
  // Close dialog immediately - restart is a long operation
  showRestartDialog.value = false
  restartReason.value = ''

  // Open live output modal and wait for Vue to update
  watchLiveOutput()
  await nextTick()

  try {
    const result = await restartMud(reason)
    if (result.success) {
      toastSuccess(result.message, 'MUD Restarting')
    } else {
      toastError(result.message, 'Restart Failed')
    }
  } catch (error) {
    toastError(error instanceof Error ? error.message : 'Failed to restart MUD', 'Error')
  }
}

// Whether any action is in progress
const anyActionInProgress = computed(() => isStarting.value || isStopping.value || isRestarting.value)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-2">
          <Power class="h-8 w-8" />
          <h1 class="text-3xl font-bold">MUD Control</h1>
        </div>
        <p class="text-muted-foreground mt-1">Start, stop, and restart the MUD server</p>
      </div>
      <Button
        variant="outline"
        @click="() => refetchStatus()"
        :disabled="statusLoading"
      >
        <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': statusLoading }" />
        Refresh
      </Button>
    </div>

    <!-- Status Card -->
    <Card class="mb-6" :class="{
      'border-green-500/50': status?.state === 'running',
      'border-red-500/50': status?.state === 'stopped',
      'border-yellow-500/50': status?.state === 'starting' || status?.state === 'stopping',
    }">
      <CardContent class="pt-6">
        <div v-if="statusLoading && !status" class="space-y-4">
          <Skeleton class="h-8 w-32" />
          <Skeleton class="h-4 w-48" />
        </div>

        <div v-else-if="statusError" class="flex items-center gap-3 text-destructive">
          <AlertCircle class="h-5 w-5" />
          <p>Failed to load status: {{ (statusError as Error).message }}</p>
        </div>

        <div v-else-if="status" class="space-y-6">
          <!-- Status Indicator -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center"
                :class="{
                  'bg-green-500/20': status.state === 'running',
                  'bg-red-500/20': status.state === 'stopped',
                  'bg-yellow-500/20': status.state === 'starting' || status.state === 'stopping',
                  'bg-gray-500/20': status.state === 'unknown',
                }"
              >
                <template v-if="status.state === 'running'">
                  <CheckCircle class="h-8 w-8 text-green-500" />
                </template>
                <template v-else-if="status.state === 'stopped'">
                  <Square class="h-8 w-8 text-red-500" />
                </template>
                <template v-else-if="status.state === 'starting' || status.state === 'stopping'">
                  <Loader2 class="h-8 w-8 text-yellow-500 animate-spin" />
                </template>
                <template v-else>
                  <AlertCircle class="h-8 w-8 text-gray-500" />
                </template>
              </div>
              <div>
                <Badge
                  :variant="getStateVariant(status.state)"
                  :class="getStateClass(status.state)"
                  class="text-lg px-3 py-1"
                >
                  {{ status.state.toUpperCase() }}
                </Badge>
                <p v-if="status.startedBy && status.state === 'running'" class="text-sm text-muted-foreground mt-1">
                  <User class="h-3 w-3 inline mr-1" />
                  Started by {{ status.startedBy }}
                </p>
              </div>
            </div>

            <!-- Control Buttons -->
            <div class="flex gap-2">
              <Button
                v-if="isStopped || status.state === 'unknown'"
                @click="handleStart"
                :disabled="anyActionInProgress || isTransitioning"
                class="bg-green-600 hover:bg-green-700"
              >
                <Play class="h-4 w-4 mr-2" v-if="!isStarting" />
                <Loader2 class="h-4 w-4 mr-2 animate-spin" v-else />
                Start
              </Button>

              <Button
                v-if="isRunning"
                variant="destructive"
                @click="showStopDialog = true"
                :disabled="anyActionInProgress || isTransitioning"
              >
                <Square class="h-4 w-4 mr-2" v-if="!isStopping" />
                <Loader2 class="h-4 w-4 mr-2 animate-spin" v-else />
                Stop
              </Button>

              <Button
                v-if="isRunning"
                variant="outline"
                @click="showRestartDialog = true"
                :disabled="anyActionInProgress || isTransitioning"
              >
                <RotateCcw class="h-4 w-4 mr-2" v-if="!isRestarting" />
                <Loader2 class="h-4 w-4 mr-2 animate-spin" v-else />
                Restart
              </Button>
            </div>
          </div>

          <!-- Stats Grid -->
          <div v-if="status.state === 'running'" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Timer class="h-5 w-5 text-muted-foreground" />
              <div>
                <p class="text-xs text-muted-foreground">Uptime</p>
                <p class="font-semibold">{{ formatUptime(status.uptime) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Cpu class="h-5 w-5 text-muted-foreground" />
              <div>
                <p class="text-xs text-muted-foreground">CPU</p>
                <p class="font-semibold">{{ status.cpu.toFixed(1) }}%</p>
              </div>
            </div>
            <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <MemoryStick class="h-5 w-5 text-muted-foreground" />
              <div>
                <p class="text-xs text-muted-foreground">Memory</p>
                <p class="font-semibold">{{ status.memory.toFixed(1) }} MiB</p>
              </div>
            </div>
            <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock class="h-5 w-5 text-muted-foreground" />
              <div>
                <p class="text-xs text-muted-foreground">Last Start</p>
                <p class="font-semibold text-sm">{{ formatRelativeTime(status.lastStartTime) }}</p>
              </div>
            </div>
          </div>

          <!-- Process Info -->
          <div v-if="status.dmsPid || status.cycleMudPid" class="text-xs text-muted-foreground">
            <span v-if="status.cycleMudPid">cycle_mud.sh PID: {{ status.cycleMudPid }}</span>
            <span v-if="status.dmsPid" class="ml-4">dms PID: {{ status.dmsPid }}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Link to Reboot History -->
    <Card class="bg-muted/30">
      <CardContent class="pt-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Clock class="h-5 w-5 text-muted-foreground" />
            <div>
              <p class="font-medium">Reboot History</p>
              <p class="text-sm text-muted-foreground">View all MUD restart history including crashes, shutdowns, and web-initiated restarts</p>
            </div>
          </div>
          <RouterLink to="/admin/server-health">
            <Button variant="outline">
              <ExternalLink class="h-4 w-4 mr-2" />
              View History
            </Button>
          </RouterLink>
        </div>
      </CardContent>
    </Card>

    <!-- Stop Dialog -->
    <Dialog v-model:open="showStopDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop MUD Server</DialogTitle>
          <DialogDescription>
            This will stop the MUD server. Players will be disconnected.
            Please provide a reason for stopping the server.
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Label for="stop-reason">Reason (required)</Label>
          <Input
            id="stop-reason"
            v-model="stopReason"
            placeholder="e.g., Scheduled maintenance, Deploying update"
            class="mt-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showStopDialog = false">Cancel</Button>
          <Button
            variant="destructive"
            @click="handleStop"
            :disabled="!stopReason.trim() || isStopping"
          >
            <Square class="h-4 w-4 mr-2" v-if="!isStopping" />
            <Loader2 class="h-4 w-4 mr-2 animate-spin" v-else />
            Stop MUD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Restart Dialog -->
    <Dialog v-model:open="showRestartDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restart MUD Server</DialogTitle>
          <DialogDescription>
            This will restart the MUD server. Players will be disconnected and
            the server will start again automatically.
            Please provide a reason for restarting.
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Label for="restart-reason">Reason (required)</Label>
          <Input
            id="restart-reason"
            v-model="restartReason"
            placeholder="e.g., Applying hotfix, Memory cleanup"
            class="mt-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showRestartDialog = false">Cancel</Button>
          <Button
            @click="handleRestart"
            :disabled="!restartReason.trim() || isRestarting"
          >
            <RotateCcw class="h-4 w-4 mr-2" v-if="!isRestarting" />
            <Loader2 class="h-4 w-4 mr-2 animate-spin" v-else />
            Restart MUD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Output Modal -->
    <Dialog v-model:open="showOutputDialog" @update:open="(open) => !open && closeOutputDialog()">
      <DialogContent class="max-w-3xl flex flex-col max-h-[80vh]">
        <DialogHeader class="flex-shrink-0">
          <DialogTitle class="flex items-center gap-2">
            <Terminal class="h-5 w-5" />
            Command Output
            <span v-if="isLiveOutput" class="inline-flex items-center gap-1 text-xs font-normal text-green-500">
              <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </DialogTitle>
          <DialogDescription>
            Output from cycle_mud.sh script execution
          </DialogDescription>
        </DialogHeader>
        <div class="flex-1 min-h-0 py-4">
          <div
            ref="outputContainerRef"
            class="h-[400px] w-full rounded-md border bg-black/90 overflow-auto"
          >
            <pre class="p-4 text-sm font-mono text-green-400 whitespace-pre-wrap break-all">{{ selectedOutput || (outputLoading ? 'Waiting for output...' : 'No output available') }}</pre>
          </div>
        </div>
        <DialogFooter class="flex-shrink-0">
          <Button variant="outline" @click="closeOutputDialog">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>


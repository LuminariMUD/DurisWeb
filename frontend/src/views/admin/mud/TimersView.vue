<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Timer Management</h1>
        <p class="text-gray-400 mt-1">View and reset global game timers</p>
      </div>
      <button
        @click="loadTimers"
        :disabled="isLoading"
        class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
        title="Refresh data"
      >
        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && timers.length === 0" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Main Content -->
    <div v-else-if="timers.length > 0" class="space-y-6">
      <!-- Actions Bar -->
      <div class="flex items-center justify-between rounded-lg border p-4">
        <div class="flex items-center gap-4">
          <button
            @click="selectAll"
            class="text-sm text-blue-400 hover:text-blue-300"
          >
            Select All
          </button>
          <button
            @click="deselectAll"
            class="text-sm text-muted-foreground hover:text-foreground"
          >
            Deselect All
          </button>
          <span class="text-sm text-muted-foreground">
            {{ selectedTimers.length }} of {{ timers.length }} selected
          </span>
        </div>

        <div class="flex items-center gap-3">
          <button
            @click="resetSelectedTimers"
            :disabled="selectedTimers.length === 0"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Reset Selected ({{ selectedTimers.length }})
          </button>
          <button
            @click="resetAllTimers"
            class="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors text-sm"
          >
            Reset All Timers
          </button>
        </div>
      </div>

      <!-- Timers Table -->
      <div class="rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b bg-muted/50">
              <tr>
                <th class="w-12 px-4 py-3"></th>
                <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Timer Name</th>
                <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Description</th>
                <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Interval</th>
                <th class="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Last Reset</th>
                <th class="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Next Trigger</th>
                <th class="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr
                v-for="timer in timers"
                :key="timer.name"
                class="hover:bg-muted/50 transition-colors"
                :class="{ 'bg-blue-500/10': selectedTimers.includes(timer.name) }"
              >
                <!-- Checkbox -->
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    :checked="selectedTimers.includes(timer.name)"
                    @change="toggleTimer(timer.name)"
                    class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </td>

                <!-- Timer Name -->
                <td class="px-4 py-3 text-sm font-mono">
                  {{ timer.name }}
                </td>

                <!-- Description -->
                <td class="px-4 py-3 text-sm text-muted-foreground">
                  {{ getTimerDescription(timer.name) }}
                </td>

                <!-- Interval -->
                <td class="px-4 py-3 text-sm text-muted-foreground">
                  {{ getTimerInterval(timer.name) }}
                </td>

                <!-- Last Reset -->
                <td class="px-4 py-3 text-sm text-right">
                  {{ formatTimestamp(timer.date) }}
                </td>

                <!-- Next Trigger with Color -->
                <td class="px-4 py-3 text-sm text-right">
                  <span :class="getNextTriggerColor(timer.name, timer.date)">
                    {{ formatNextTrigger(timer.name, timer.date) }}
                  </span>
                </td>

                <!-- Actions -->
                <td class="px-4 py-3 text-sm text-center">
                  <button
                    @click="resetSingleTimer(timer.name)"
                    class="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded"
                    title="Reset this timer"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Info Box -->
      <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <div class="flex items-start gap-3">
          <Info class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-blue-300 font-medium">About Timers</p>
            <ul class="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Timers control when certain game events and updates trigger</li>
              <li>Resetting a timer to NOW() will cause its event to trigger sooner</li>
              <li>Color indicators: <span class="text-green-400">Green (&lt; 1hr)</span>, <span class="text-yellow-400">Yellow (1-24hr)</span>, <span class="text-red-400">Red (&gt; 24hr)</span></li>
              <li>All timer resets are logged to the audit trail</li>
              <li>Auto-refreshes every 30 seconds</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Confirmation Dialog -->
    <TimerResetDialog
      :open="showResetDialog"
      :timer-names="pendingResetTimers"
      :saving="isSaving"
      :is-reset-all="isResetAllOperation"
      @update:open="showResetDialog = $event"
      @confirm="handleConfirmReset"
      @cancel="handleCancelReset"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RefreshCw, RotateCcw, Info } from 'lucide-vue-next'
import { apiClient as api } from '@/services/api'
import { toast } from 'vue-sonner'
import TimerResetDialog from '@/components/admin/TimerResetDialog.vue'

interface Timer {
  name: string
  date: string // ISO timestamp
}

const isLoading = ref(true)
const error = ref<string | null>(null)
const timers = ref<Timer[]>([])
const selectedTimers = ref<string[]>([])

const showResetDialog = ref(false)
const pendingResetTimers = ref<string[]>([])
const isResetAllOperation = ref(false)
const isSaving = ref(false)

let refreshInterval: number | null = null

// Timer descriptions
const timerDescriptions: Record<string, string> = {
  epic_zone_mod: 'Epic Zone Modifier',
  update_cargo: 'Ship Cargo Update Cycle',
  update_delayed_cargo_prices: 'Delayed Cargo Price Adjustments',
  zone_trophy_reduction: 'Zone Trophy Reduction Timer',
  arena_event: 'Arena Event Scheduler',
  quest_reset: 'Daily Quest Reset',
}

// Timer intervals (how often they trigger)
const timerIntervals: Record<string, string> = {
  epic_zone_mod: 'Every 1 hour',
  update_cargo: 'Every 4 hours',
  update_delayed_cargo_prices: 'Every 1 hour',
  zone_trophy_reduction: 'Every 1 hour',
  arena_event: 'Every 2 hours',
  quest_reset: 'Every 24 hours',
}

// Timer interval in seconds (for calculating next trigger)
const timerIntervalSeconds: Record<string, number> = {
  epic_zone_mod: 3600, // 1 hour
  update_cargo: 14400, // 4 hours
  update_delayed_cargo_prices: 3600, // 1 hour
  zone_trophy_reduction: 3600, // 1 hour
  arena_event: 7200, // 2 hours
  quest_reset: 86400, // 24 hours
}

const getTimerDescription = (name: string): string => {
  return timerDescriptions[name] || formatTimerName(name)
}

const getTimerInterval = (name: string): string => {
  return timerIntervals[name] || 'Varies'
}

const formatTimerName = (name: string): string => {
  // Convert snake_case to Title Case
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const _getTimeAgoColor = (timestamp: string): string => {
  const now = new Date()
  const date = new Date(timestamp)
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

  if (diffHours < 1) return 'text-green-400'
  if (diffHours < 24) return 'text-yellow-400'
  return 'text-red-400'
}

const formatNextTrigger = (name: string, lastResetTimestamp: string): string => {
  const intervalSeconds = timerIntervalSeconds[name]
  if (!intervalSeconds) return 'Unknown'

  const lastReset = new Date(lastResetTimestamp)
  const nextTrigger = new Date(lastReset.getTime() + intervalSeconds * 1000)
  const now = new Date()

  // If next trigger is in the past, it should trigger "now"
  if (nextTrigger.getTime() <= now.getTime()) {
    return 'Ready now'
  }

  // Calculate time until next trigger
  const diffMs = nextTrigger.getTime() - now.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMinutes < 1) return 'In < 1m'
  if (diffMinutes < 60) return `In ${diffMinutes}m`
  if (diffHours < 24) return `In ${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  return `In ${diffDays}d`
}

const getNextTriggerColor = (name: string, lastResetTimestamp: string): string => {
  const intervalSeconds = timerIntervalSeconds[name]
  if (!intervalSeconds) return 'text-gray-400'

  const lastReset = new Date(lastResetTimestamp)
  const nextTrigger = new Date(lastReset.getTime() + intervalSeconds * 1000)
  const now = new Date()

  // If overdue or ready
  if (nextTrigger.getTime() <= now.getTime()) {
    return 'text-red-400 font-semibold'
  }

  // Calculate percentage of time elapsed
  const totalInterval = intervalSeconds * 1000
  const elapsed = now.getTime() - lastReset.getTime()
  const percentElapsed = (elapsed / totalInterval) * 100

  if (percentElapsed >= 75) return 'text-yellow-400' // 75%+ elapsed
  if (percentElapsed >= 50) return 'text-blue-400' // 50%+ elapsed
  return 'text-green-400' // < 50% elapsed
}

const toggleTimer = (name: string) => {
  const index = selectedTimers.value.indexOf(name)
  if (index > -1) {
    selectedTimers.value.splice(index, 1)
  } else {
    selectedTimers.value.push(name)
  }
}

const selectAll = () => {
  selectedTimers.value = timers.value.map((t) => t.name)
}

const deselectAll = () => {
  selectedTimers.value = []
}

const resetSingleTimer = (name: string) => {
  pendingResetTimers.value = [name]
  isResetAllOperation.value = false
  showResetDialog.value = true
}

const resetSelectedTimers = () => {
  if (selectedTimers.value.length === 0) return
  pendingResetTimers.value = [...selectedTimers.value]
  isResetAllOperation.value = false
  showResetDialog.value = true
}

const resetAllTimers = () => {
  pendingResetTimers.value = timers.value.map((t) => t.name)
  isResetAllOperation.value = true
  showResetDialog.value = true
}

const handleConfirmReset = async (notes: string) => {
  isSaving.value = true

  try {
    if (isResetAllOperation.value) {
      // Reset all timers
      const response = await api.post('/api/admin/mud/timers/reset-all', { notes })
      toast.success('All timers reset successfully!', {
        description: response.data.message,
      })
    } else {
      // Reset selected timers
      const response = await api.post('/api/admin/mud/timers/reset', {
        timerNames: pendingResetTimers.value,
        notes,
      })
      toast.success('Timers reset successfully!', {
        description: response.data.message,
      })
    }

    // Clear selection and reload
    selectedTimers.value = []
    await loadTimers()
    showResetDialog.value = false
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || 'Failed to reset timers'
    toast.error('Reset failed', {
      description: errorMsg,
    })
    console.error('Timer reset error:', err)
  } finally {
    isSaving.value = false
  }
}

const handleCancelReset = () => {
  showResetDialog.value = false
}

const loadTimers = async () => {
  isLoading.value = true
  error.value = null

  try {
    const response = await api.get<{ timers: Timer[] }>('/api/admin/mud/dashboard')
    if (response.data.timers) {
      timers.value = response.data.timers
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load timers'
    console.error('Timers load error:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadTimers()
  // Auto-refresh every 30 seconds
  refreshInterval = window.setInterval(loadTimers, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="bg-gray-800 border border-gray-700 max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle class="text-white text-xl">Property Change History</DialogTitle>
        <DialogDescription class="text-gray-400">
          Audit trail for <span class="font-mono text-blue-400">{{ propertyKey }}</span>
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto pr-2">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p class="text-red-400">{{ error }}</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="!history || history.length === 0" class="text-center py-12">
          <History class="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p class="text-gray-400">No change history found for this property</p>
          <p class="text-xs text-gray-500 mt-1">Changes will appear here once the property is edited</p>
        </div>

        <!-- History Timeline -->
        <div v-else class="space-y-4 py-4">
          <div
            v-for="(change, index) in history"
            :key="change.id"
            class="relative pl-8 pb-6 last:pb-0"
            :class="{ 'border-l-2 border-gray-700': index < history.length - 1 }"
          >
            <!-- Timeline dot -->
            <div
              class="absolute left-0 top-2 w-3 h-3 rounded-full border-2"
              :class="isRecent(change.timestamp)
                ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
                : 'bg-gray-600 border-gray-500'"
            ></div>

            <!-- Change card -->
            <div
              class="bg-gray-900/50 rounded-lg p-4 border"
              :class="isRecent(change.timestamp)
                ? 'border-green-500/30'
                : 'border-gray-700'"
            >
              <!-- Header: Account + Timestamp -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <User class="w-4 h-4 text-blue-400" />
                  <span class="font-medium text-white">{{ change.accountName }}</span>
                  <span
                    v-if="isRecent(change.timestamp)"
                    class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded"
                  >
                    Recent
                  </span>
                </div>
                <div class="flex items-center gap-2 text-sm text-gray-400">
                  <Clock class="w-3.5 h-3.5" />
                  <span>{{ formatTimestamp(change.timestamp) }}</span>
                </div>
              </div>

              <!-- Value change -->
              <div class="flex items-center gap-3 mb-3">
                <div class="flex-1 bg-red-900/20 border border-red-500/30 rounded px-3 py-2">
                  <p class="text-xs text-gray-400 mb-1">Old Value</p>
                  <p class="text-lg font-mono text-red-400">{{ change.oldValue }}</p>
                </div>
                <ArrowRight class="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div class="flex-1 bg-green-900/20 border border-green-500/30 rounded px-3 py-2">
                  <p class="text-xs text-gray-400 mb-1">New Value</p>
                  <p class="text-lg font-mono text-green-400">{{ change.newValue }}</p>
                </div>
              </div>

              <!-- Notes -->
              <div v-if="change.notes" class="bg-gray-800/50 border border-gray-600 rounded px-3 py-2">
                <p class="text-xs text-gray-400 mb-1">Notes</p>
                <p class="text-sm text-gray-300">{{ change.notes }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <button
          @click="handleClose"
          class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Close
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { History, User, Clock, ArrowRight } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface HistoryEntry {
  id: number
  accountName: string
  oldValue: string
  newValue: string
  timestamp: Date
  notes?: string
}

interface Props {
  open: boolean
  propertyKey: string
  history: HistoryEntry[]
  loading?: boolean
  error?: string | null
}

interface Emits {
  (e: 'update:open', value: boolean): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

const handleClose = () => {
  emit('update:open', false)
}

const isRecent = (timestamp: Date): boolean => {
  const now = new Date()
  const changeDate = new Date(timestamp)
  const hoursDiff = (now.getTime() - changeDate.getTime()) / (1000 * 60 * 60)
  return hoursDiff < 24
}

const formatTimestamp = (timestamp: Date): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  // Less than 1 hour ago
  if (diffHours < 1) {
    const minutes = Math.floor(diffMs / (1000 * 60))
    return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`
  }

  // Less than 24 hours ago
  if (diffHours < 24) {
    const hours = Math.floor(diffHours)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }

  // Less than 7 days ago
  if (diffDays < 7) {
    const days = Math.floor(diffDays)
    return days === 1 ? 'Yesterday' : `${days} days ago`
  }

  // Older - show full date
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
</script>

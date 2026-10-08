<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="bg-ink-high border border-border max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle class="text-white text-xl">Property Change History</DialogTitle>
        <DialogDescription class="text-muted-foreground">
          Audit trail for <span class="font-mono text-info">{{ propertyKey }}</span>
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto pr-2">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="bg-danger-deep/20 border border-danger rounded-lg p-4">
          <p class="text-danger">{{ error }}</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="!history || history.length === 0" class="text-center py-12">
          <History class="w-12 h-12 text-faint mx-auto mb-3" />
          <p class="text-muted-foreground">No change history found for this property</p>
          <p class="text-xs text-faint mt-1">Changes will appear here once the property is edited</p>
        </div>

        <!-- History Timeline -->
        <div v-else class="space-y-4 py-4">
          <div
            v-for="(change, index) in history"
            :key="change.id"
            class="relative pl-8 pb-6 last:pb-0"
            :class="{ 'border-l-2 border-border': index < history.length - 1 }"
          >
            <!-- Timeline dot -->
            <div
              class="absolute left-0 top-2 w-3 h-3 rounded-full border-2"
              :class="isRecent(change.timestamp)
                ? 'bg-success border-success shadow-lg shadow-success/50'
                : 'bg-rule border-faint'"
            ></div>

            <!-- Change card -->
            <div
              class="bg-card/50 rounded-lg p-4 border"
              :class="isRecent(change.timestamp)
                ? 'border-success/30'
                : 'border-border'"
            >
              <!-- Header: Account + Timestamp -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <User class="w-4 h-4 text-info" />
                  <span class="font-medium text-white">{{ change.accountName }}</span>
                  <span
                    v-if="isRecent(change.timestamp)"
                    class="text-xs bg-success/20 text-success px-2 py-0.5 rounded"
                  >
                    Recent
                  </span>
                </div>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock class="w-3.5 h-3.5" />
                  <span>{{ formatTimestamp(change.timestamp) }}</span>
                </div>
              </div>

              <!-- Value change -->
              <div class="flex items-center gap-3 mb-3">
                <div class="flex-1 bg-danger-deep/20 border border-danger/30 rounded px-3 py-2">
                  <p class="text-xs text-muted-foreground mb-1">Old Value</p>
                  <p class="text-lg font-mono text-danger">{{ change.oldValue }}</p>
                </div>
                <ArrowRight class="w-5 h-5 text-faint flex-shrink-0" />
                <div class="flex-1 bg-success-deep/20 border border-success/30 rounded px-3 py-2">
                  <p class="text-xs text-muted-foreground mb-1">New Value</p>
                  <p class="text-lg font-mono text-success">{{ change.newValue }}</p>
                </div>
              </div>

              <!-- Notes -->
              <div v-if="change.notes" class="bg-ink-high/50 border border-faint rounded px-3 py-2">
                <p class="text-xs text-muted-foreground mb-1">Notes</p>
                <p class="text-sm text-bone-muted">{{ change.notes }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <button
          @click="handleClose"
          class="px-4 py-2 bg-ink-top text-white rounded hover:bg-rule transition-colors"
        >
          Close
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { History, User, Clock, ArrowRight } from '@lucide/vue'
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

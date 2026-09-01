<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, UserPlus, UserMinus, History, Loader2, AlertCircle } from 'lucide-vue-next'
import type { ZoneInfoHistory } from '@/types'

const props = defineProps<{
  zoneId: string
}>()

// Pagination
const limit = 50
const offset = ref(0)

// Fetch history
const {
  data: historyData,
  isLoading,
  error,
  isFetching,
} = useQuery({
  queryKey: ['zone-info-history', props.zoneId, offset],
  queryFn: () => builderApi.getZoneInfoHistory(props.zoneId, limit, offset.value),
})

const history = computed(() => historyData.value?.history || [])
const hasMore = computed(() => historyData.value?.hasMore ?? false)
const total = computed(() => historyData.value?.total ?? 0)

// Load more
function loadMore() {
  offset.value += limit
}

// Get icon for field changed
function getIcon(fieldChanged: string) {
  switch (fieldChanged) {
    case 'description':
      return FileText
    case 'permission_grant':
      return UserPlus
    case 'permission_revoke':
      return UserMinus
    case 'permission_update':
      return UserPlus
    default:
      return History
  }
}

// Get action verb for field changed
function getAction(entry: ZoneInfoHistory): string {
  switch (entry.fieldChanged) {
    case 'description':
      return 'updated the zone description'
    case 'permission_grant':
    case 'permission_revoke':
    case 'permission_update':
      return entry.details || 'modified permissions'
    default:
      return entry.details || 'made changes'
  }
}

// Format relative time
function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return dateString
  }
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <History class="h-4 w-4 text-muted-foreground" />
        <h3 class="text-sm font-medium">Edit History</h3>
        <span v-if="total > 0" class="text-xs text-muted-foreground">
          ({{ total }} {{ total === 1 ? 'entry' : 'entries' }})
        </span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading && history.length === 0" class="space-y-3">
      <div v-for="i in 5" :key="i" class="flex items-start gap-3">
        <Skeleton class="h-8 w-8 rounded-full shrink-0" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-3 w-1/4" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <Alert v-else-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load history. {{ (error as Error).message }}
      </AlertDescription>
    </Alert>

    <!-- Empty state -->
    <div v-else-if="history.length === 0" class="text-center py-12 text-muted-foreground">
      <History class="h-12 w-12 mx-auto mb-4 opacity-20" />
      <p class="text-sm">No history recorded yet</p>
      <p class="text-xs mt-1">Changes to the zone description and permissions will appear here</p>
    </div>

    <!-- History list -->
    <ScrollArea v-else class="h-[calc(100vh-320px)]">
      <div class="space-y-3 pr-4">
        <div
          v-for="entry in history"
          :key="entry.id"
          class="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <!-- Icon -->
          <div class="p-2 rounded-full bg-background border shrink-0">
            <component :is="getIcon(entry.fieldChanged)" class="h-4 w-4 text-muted-foreground" />
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <p class="text-sm">
              <span class="font-medium">{{ entry.accountName }}</span>
              <span class="text-muted-foreground"> {{ getAction(entry) }}</span>
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ formatTime(entry.changedAt) }}
            </p>
          </div>
        </div>

        <!-- Load more button -->
        <div v-if="hasMore" class="pt-2">
          <Button
            variant="outline"
            size="sm"
            class="w-full"
            :disabled="isFetching"
            @click="loadMore"
          >
            <Loader2 v-if="isFetching" class="h-4 w-4 mr-2 animate-spin" />
            Load more
          </Button>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>

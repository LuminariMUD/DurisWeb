<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { formatDistanceToNow } from 'date-fns'
import type { BuilderActivity } from '@/types'
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Users,
  Package,
  DoorOpen,
  Download,
  GitCommit,
  RefreshCw,
  MapPin,
  User,
  Clock,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

const { accountName } = useAuth()
const router = useRouter()

// Toggle between "My Activity" and "All Activity"
const viewMode = ref<'my' | 'all'>('my')
const offset = ref(0)
const limit = 20

// Query for activity data
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['builder-activity', viewMode, offset],
  queryFn: () =>
    builderApi.getBuilderActivity({
      account: viewMode.value === 'my' ? (accountName.value ?? undefined) : undefined,
      limit,
      offset: offset.value,
    }),
  staleTime: 1000 * 60, // 1 minute
})

// Reset offset when view mode changes
watch(viewMode, () => {
  offset.value = 0
})

const activities = computed(() => data.value?.activities ?? [])
const hasMore = computed(() => data.value?.hasMore ?? false)
const total = computed(() => data.value?.total ?? 0)

// Action type to icon mapping
const getActionIcon = (actionType: string) => {
  if (actionType.includes('create')) return Plus
  if (actionType.includes('update')) return Pencil
  if (actionType.includes('delete')) return Trash2
  if (actionType.includes('clone')) return Copy
  if (actionType.includes('download')) return Download
  if (actionType.includes('git_commit')) return GitCommit
  if (actionType.includes('reset')) return RefreshCw
  return Pencil
}

// Entity type to icon mapping
const getEntityIcon = (entityType: string) => {
  switch (entityType) {
    case 'room':
      return DoorOpen
    case 'mob':
      return Users
    case 'object':
      return Package
    case 'zone':
      return MapPin
    case 'reset':
      return RefreshCw
    default:
      return MapPin
  }
}

// Entity type badge color
const getEntityBadgeVariant = (
  entityType: string,
): 'default' | 'secondary' | 'outline' | 'destructive' => {
  switch (entityType) {
    case 'room':
      return 'default'
    case 'mob':
      return 'destructive'
    case 'object':
      return 'secondary'
    default:
      return 'outline'
  }
}

// Action type to verb mapping
const getActionVerb = (actionType: string): string => {
  const parts = actionType.split('_')
  const action = parts[parts.length - 1] ?? actionType
  switch (action) {
    case 'create':
      return 'created'
    case 'update':
      return 'updated'
    case 'delete':
      return 'deleted'
    case 'clone':
      return 'cloned'
    case 'download':
      return 'downloaded'
    case 'commit':
      return 'committed'
    default:
      return action
  }
}

// Format timestamp
const formatTime = (dateStr: string): string => {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

// Navigate to zone
const navigateToZone = (activity: BuilderActivity) => {
  if (activity.zoneId && activity.zoneId !== 'system') {
    const query: Record<string, string> = {}
    if (activity.entityType && activity.entityType !== 'zone' && activity.entityVnum) {
      query.select = activity.entityType
      query.vnum = String(activity.entityVnum)
    }
    router.push({
      path: `/builder/zone/${activity.zoneId}`,
      query,
    })
  }
}

const loadMore = () => {
  offset.value += limit
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header with toggle -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Recent Activity</h3>
      <Tabs v-model="viewMode" class="w-auto">
        <TabsList class="h-8">
          <TabsTrigger value="my" class="text-xs px-3 h-6">
            <User class="h-3 w-3 mr-1" />
            My Activity
          </TabsTrigger>
          <TabsTrigger value="all" class="text-xs px-3 h-6">
            <Users class="h-3 w-3 mr-1" />
            All Activity
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && activities.length === 0" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-sm text-destructive">
      Failed to load activity. <Button variant="link" size="sm" class="p-0 h-auto" @click="refetch()">Retry</Button>
    </div>

    <!-- Empty state -->
    <div v-else-if="activities.length === 0" class="text-sm text-muted-foreground py-4 text-center">
      No activity yet. Start editing zones to see your activity here.
    </div>

    <!-- Activity list -->
    <div v-else class="space-y-1">
      <div
        v-for="activity in activities"
        :key="activity.id"
        class="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
        @click="navigateToZone(activity)"
      >
        <!-- Action icon -->
        <div class="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
          <component :is="getActionIcon(activity.actionType)" class="h-3 w-3 text-muted-foreground" />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 text-sm">
            <!-- Account name (only in "All" mode) -->
            <span v-if="viewMode === 'all'" class="font-medium text-primary">
              {{ activity.accountName }}
            </span>
            <span v-if="viewMode === 'all'" class="text-muted-foreground">{{ getActionVerb(activity.actionType) }}</span>
            <span v-else class="text-muted-foreground capitalize">{{ getActionVerb(activity.actionType) }}</span>

            <!-- Entity badge -->
            <Badge :variant="getEntityBadgeVariant(activity.entityType)" class="text-xs px-1.5 py-0 h-5">
              <component :is="getEntityIcon(activity.entityType)" class="h-3 w-3 mr-0.5" />
              {{ activity.entityType }}
            </Badge>

            <!-- VNUM if available -->
            <span v-if="activity.entityVnum" class="text-muted-foreground text-xs">
              #{{ activity.entityVnum }}
            </span>
          </div>

          <!-- Entity name and zone -->
          <div class="text-xs text-muted-foreground truncate">
            <span v-if="activity.entityName" v-html="parseAnsiToHtml(activity.entityName)" class="mr-1"></span>
            <span v-if="activity.zoneId !== 'system'" class="opacity-75">in {{ activity.zoneName || activity.zoneId }}</span>
          </div>
        </div>

        <!-- Timestamp -->
        <div class="flex-shrink-0 text-xs text-muted-foreground flex items-center gap-1">
          <Clock class="h-3 w-3" />
          {{ formatTime(activity.createdAt) }}
        </div>
      </div>
    </div>

    <!-- Load more button -->
    <div v-if="hasMore" class="pt-2">
      <Button variant="outline" size="sm" class="w-full" :disabled="isLoading" @click="loadMore">
        <span v-if="isLoading">Loading...</span>
        <span v-else>Load more ({{ activities.length }} of {{ total }})</span>
      </Button>
    </div>
  </div>
</template>

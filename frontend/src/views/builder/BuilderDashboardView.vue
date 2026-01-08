<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import ZoneCard from '@/components/builder/ZoneCard.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import GlobalSearchDialog from '@/components/builder/GlobalSearchDialog.vue'
import ActivityFeed from '@/components/builder/ActivityFeed.vue'
import { Search, Map, Home, Users, Package, RefreshCw, Plus, Settings, SearchCode, Lock } from 'lucide-vue-next'
import type { ZoneIndex } from '@/types'

const router = useRouter()
const queryClient = useQueryClient()
const toast = useToast()
const { user } = useAuth()

// Pagination state
const currentPage = ref(1)
const itemsPerPage = 10 // 5 columns x 2 rows

// Search state
const searchQuery = ref('')
const debouncedSearch = ref('')

// My Zones filter
const showMyZonesOnly = ref(false)

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (newVal) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = newVal
    currentPage.value = 1 // Reset to page 1 on search
  }, 300)
})

// Reset page when filter changes
watch(showMyZonesOnly, () => {
  currentPage.value = 1
})

// Dialog states
const createDialogOpen = ref(false)
const cloneDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const globalSearchOpen = ref(false)

// Form states
const newZoneNumber = ref('')
const newZoneName = ref('')
const cloneSourceZone = ref<ZoneIndex | null>(null)
const cloneTargetNumber = ref('')
const cloneZoneName = ref('')
const deleteZone = ref<ZoneIndex | null>(null)

// Fetch zones with server-side pagination and filtering
const { data: zonesData, isLoading, error, refetch } = useQuery({
  queryKey: ['builder-zones', currentPage, debouncedSearch, showMyZonesOnly],
  queryFn: () => builderApi.getZones({
    page: currentPage.value,
    limit: itemsPerPage,
    search: debouncedSearch.value,
    filterByAccess: showMyZonesOnly.value,
  }),
  staleTime: 1000 * 60 * 5, // 5 minutes
})

// Create zone mutation
const createZoneMutation = useMutation({
  mutationFn: (params: { zoneNumber: number; zoneName: string }) =>
    builderApi.createZone(params.zoneNumber, params.zoneName),
  onSuccess: (data) => {
    toast.success(`Zone ${data.zoneNumber} (${data.zoneId}) created successfully`)
    queryClient.invalidateQueries({ queryKey: ['builder-zones'] })
    createDialogOpen.value = false
    newZoneNumber.value = ''
    newZoneName.value = ''
    // Navigate to the new zone using zone ID
    router.push(`/builder/zone/${data.zoneId}`)
  },
  onError: (error: Error) => {
    toast.error(`Failed to create zone: ${error.message}`)
  },
})

// Clone zone mutation
const cloneZoneMutation = useMutation({
  mutationFn: (params: { sourceZoneId: string; targetZoneNumber: number; zoneName?: string }) =>
    builderApi.cloneZone(params.sourceZoneId, params.targetZoneNumber, params.zoneName),
  onSuccess: (data) => {
    toast.success(`Zone cloned to ${data.newZoneId} successfully`)
    queryClient.invalidateQueries({ queryKey: ['builder-zones'] })
    cloneDialogOpen.value = false
    cloneSourceZone.value = null
    cloneTargetNumber.value = ''
    cloneZoneName.value = ''
  },
  onError: (error: Error) => {
    toast.error(`Failed to clone zone: ${error.message}`)
  },
})

// Delete zone mutation
const deleteZoneMutation = useMutation({
  mutationFn: (zoneId: string) => builderApi.deleteZone(zoneId),
  onSuccess: () => {
    toast.success('Zone deleted successfully')
    queryClient.invalidateQueries({ queryKey: ['builder-zones'] })
    deleteDialogOpen.value = false
    deleteZone.value = null
  },
  onError: (error: Error) => {
    toast.error(`Failed to delete zone: ${error.message}`)
  },
})

// Zones from server (already paginated and filtered server-side)
const zones = computed(() => zonesData.value?.zones || [])
const totalZones = computed(() => zonesData.value?.total || 0)
const totalPages = computed(() => zonesData.value?.totalPages || 1)

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  // Scroll to top of zones grid
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Statistics from server (totals across ALL zones)
const stats = computed(() => {
  if (!zonesData.value?.stats) {
    return { totalZones: 0, totalRooms: 0, totalMobs: 0, totalObjects: 0 }
  }
  return zonesData.value.stats
})

// Open clone dialog for a zone
function openCloneDialog(zone: ZoneIndex) {
  cloneSourceZone.value = zone
  cloneZoneName.value = `Clone of ${zone.name.replace(/&\+[a-zA-Z]|&n/g, '')}`
  cloneDialogOpen.value = true
}

// Open delete dialog for a zone
function openDeleteDialog(zone: ZoneIndex) {
  deleteZone.value = zone
  deleteDialogOpen.value = true
}

// Handle create zone
function handleCreateZone() {
  const zoneNum = parseInt(newZoneNumber.value, 10)
  if (isNaN(zoneNum) || zoneNum < 0) {
    toast.error('Please enter a valid zone number')
    return
  }
  if (!newZoneName.value.trim()) {
    toast.error('Please enter a zone name')
    return
  }
  createZoneMutation.mutate({ zoneNumber: zoneNum, zoneName: newZoneName.value.trim() })
}

// Handle clone zone
function handleCloneZone() {
  if (!cloneSourceZone.value) return
  const targetNum = parseInt(cloneTargetNumber.value, 10)
  if (isNaN(targetNum) || targetNum < 0) {
    toast.error('Please enter a valid target zone number')
    return
  }
  cloneZoneMutation.mutate({
    sourceZoneId: cloneSourceZone.value.id,
    targetZoneNumber: targetNum,
    zoneName: cloneZoneName.value.trim() || undefined,
  })
}

// Handle delete zone
function handleDeleteZone() {
  if (!deleteZone.value) return
  deleteZoneMutation.mutate(deleteZone.value.id)
}

// Expose clone/delete functions to ZoneCard
defineExpose({ openCloneDialog, openDeleteDialog })
</script>

<template>
  <div class="container mx-auto py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Zone Builder</h1>
        <p class="text-muted-foreground">
          Create and edit zones for DurisMUD
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button @click="globalSearchOpen = true" variant="outline">
          <SearchCode class="h-4 w-4 mr-2" />
          Search All
        </Button>
        <Button @click="createDialogOpen = true">
          <Plus class="h-4 w-4 mr-2" />
          New Zone
        </Button>
        <Button @click="refetch()" variant="outline" :disabled="isLoading">
          <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </Button>
        <Button @click="router.push('/builder/settings')" variant="outline">
          <Settings class="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Map class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Zones</p>
              <p class="text-2xl font-bold">{{ stats.totalZones }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg">
              <Home class="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Rooms</p>
              <p class="text-2xl font-bold">{{ stats.totalRooms.toLocaleString() }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-500/10 rounded-lg">
              <Users class="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Mobs</p>
              <p class="text-2xl font-bold">{{ stats.totalMobs.toLocaleString() }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-orange-500/10 rounded-lg">
              <Package class="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Objects</p>
              <p class="text-2xl font-bold">{{ stats.totalObjects.toLocaleString() }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-4">
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search zones by name or number..."
          class="pl-10"
        />
      </div>
      <!-- My Zones Toggle -->
      <div v-if="user" class="flex items-center gap-2">
        <Switch
          id="my-zones"
          :model-value="showMyZonesOnly"
          @update:model-value="showMyZonesOnly = $event"
        />
        <Label for="my-zones" class="text-sm cursor-pointer flex items-center gap-1">
          <Lock class="h-3 w-3" />
          My Zones
        </Label>
      </div>
      <span class="text-sm text-muted-foreground">
        {{ totalZones }} zone{{ totalZones !== 1 ? 's' : '' }} found
        <span v-if="totalPages > 1 && !showMyZonesOnly">(page {{ currentPage }} of {{ totalPages }})</span>
      </span>
    </div>

    <!-- Error State -->
    <div v-if="error" class="text-center py-12">
      <p class="text-destructive">Failed to load zones: {{ (error as Error).message }}</p>
      <Button @click="refetch()" variant="outline" class="mt-4">
        Try Again
      </Button>
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <Card v-for="i in 8" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-3/4" />
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-full" />
          </div>
          <Skeleton class="h-8 w-full" />
        </CardContent>
      </Card>
    </div>

    <!-- Zones Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      <ZoneCard
        v-for="zone in zones"
        :key="zone.id"
        :zone="zone"
        @clone="openCloneDialog"
        @delete="openDeleteDialog"
      />
    </div>

    <!-- Pagination -->
    <div v-if="!isLoading && !error && totalPages > 1" class="flex justify-center pt-4">
      <PaginationWithEllipsis
        :current-page="currentPage"
        :total-pages="totalPages"
        :sibling-count="2"
        @page-change="handlePageChange"
      />
    </div>

    <!-- Empty State -->
    <div
      v-if="!isLoading && !error && zones.length === 0"
      class="text-center py-12"
    >
      <Map class="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 class="text-lg font-medium">No zones found</h3>
      <p class="text-muted-foreground mb-4">
        {{ searchQuery ? 'Try a different search term' : 'No zone files found in the areas directory' }}
      </p>
      <Button @click="createDialogOpen = true">
        <Plus class="h-4 w-4 mr-2" />
        Create First Zone
      </Button>
    </div>

    <!-- Recent Activity Section -->
    <Card class="mt-6">
      <CardHeader class="pb-3">
        <ActivityFeed />
      </CardHeader>
    </Card>

    <!-- Create Zone Dialog -->
    <Dialog v-model:open="createDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Zone</DialogTitle>
          <DialogDescription>
            Create a new zone with initial files. The zone will start with one empty room.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="zone-number">Zone Number</Label>
            <Input
              id="zone-number"
              v-model="newZoneNumber"
              type="number"
              placeholder="e.g., 999"
            />
            <p class="text-xs text-muted-foreground">
              Room vnums will start at [zone number] * 100
            </p>
          </div>
          <div class="space-y-2">
            <Label for="zone-name">Zone Name</Label>
            <Input
              id="zone-name"
              v-model="newZoneName"
              placeholder="e.g., The Dark Forest"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="createDialogOpen = false">
            Cancel
          </Button>
          <Button
            @click="handleCreateZone"
            :disabled="createZoneMutation.isPending.value"
          >
            {{ createZoneMutation.isPending.value ? 'Creating...' : 'Create Zone' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Clone Zone Dialog -->
    <Dialog v-model:open="cloneDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone Zone</DialogTitle>
          <DialogDescription>
            Create a copy of zone {{ cloneSourceZone?.number }} with remapped vnums.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="clone-target">Target Zone Number</Label>
            <Input
              id="clone-target"
              v-model="cloneTargetNumber"
              type="number"
              placeholder="e.g., 999"
            />
            <p class="text-xs text-muted-foreground">
              All vnums will be remapped to the new zone's range
            </p>
          </div>
          <div class="space-y-2">
            <Label for="clone-name">New Zone Name (optional)</Label>
            <Input
              id="clone-name"
              v-model="cloneZoneName"
              :placeholder="cloneSourceZone ? `Clone of Zone ${cloneSourceZone.number}` : ''"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="cloneDialogOpen = false">
            Cancel
          </Button>
          <Button
            @click="handleCloneZone"
            :disabled="cloneZoneMutation.isPending.value"
          >
            {{ cloneZoneMutation.isPending.value ? 'Cloning...' : 'Clone Zone' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Zone Confirmation -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Zone {{ deleteZone?.number }}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all zone files (.wld, .mob, .obj, .zon).
            A backup will be created before deletion. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            @click="handleDeleteZone"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {{ deleteZoneMutation.isPending.value ? 'Deleting...' : 'Delete Zone' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Global Search Dialog -->
    <GlobalSearchDialog v-model:open="globalSearchOpen" />
  </div>
</template>

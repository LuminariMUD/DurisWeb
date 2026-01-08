<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import AnsiText from '@/components/ui/AnsiText.vue'
import { wikiApi } from '@/services/api'
import type { WikiZone, WikiZoneFilters } from '@/types'
import { Search, SortAsc, SortDesc, X, Filter, ChevronDown, ChevronUp } from 'lucide-vue-next'

const router = useRouter()

// State
const initialLoading = ref(true) // Only true on first load
const tableLoading = ref(false) // True when fetching data (pagination, sort, filter)
const zones = ref<WikiZone[]>([])
const total = ref(0)
const currentPage = ref(1)
const totalPages = ref(1)
const limit = 20

// Filters
const search = ref('')
const selectedEpicType = ref<string>('')
const selectedAlignment = ref<string>('')
const selectedDifficulty = ref<string>('')

// Mobile filter drawer
const showFilters = ref(false)

// Sorting
const sortBy = ref('number')
const sortOrder = ref<'asc' | 'desc'>('asc')

// Epic type labels
const epicTypeLabels: Record<number, string> = {
  0: 'None',
  1: 'Solo',
  2: 'Group',
  3: 'Raid',
}

// Alignment labels
const alignmentLabels: Record<string, string> = {
  '-5': 'Evil -5',
  '-4': 'Evil -4',
  '-3': 'Evil -3',
  '-2': 'Evil -2',
  '-1': 'Evil -1',
  '0': 'Neutral',
  '1': 'Good +1',
  '2': 'Good +2',
  '3': 'Good +3',
  '4': 'Good +4',
  '5': 'Good +5',
}

// Difficulty badge variant
function getDifficultyVariant(difficulty: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (difficulty <= 2) return 'outline'
  if (difficulty <= 4) return 'secondary'
  if (difficulty <= 6) return 'default'
  return 'destructive'
}

// Build filters object
const filters = computed((): WikiZoneFilters => {
  const f: WikiZoneFilters = {}
  if (search.value) f.search = search.value
  if (selectedEpicType.value && selectedEpicType.value !== 'all') {
    f.epicTypes = [parseInt(selectedEpicType.value)]
  }
  if (selectedAlignment.value && selectedAlignment.value !== 'all') {
    const align = parseInt(selectedAlignment.value)
    f.alignmentMin = align
    f.alignmentMax = align
  }
  if (selectedDifficulty.value && selectedDifficulty.value !== 'all') {
    const diff = parseInt(selectedDifficulty.value)
    f.difficultyMin = diff
    f.difficultyMax = diff
  }
  return f
})

// Load zones
async function loadZones(isInitial = false) {
  try {
    if (isInitial) {
      initialLoading.value = true
    } else {
      tableLoading.value = true
    }
    const result = await wikiApi.getZones(filters.value, currentPage.value, limit, sortBy.value, sortOrder.value)
    zones.value = result.zones
    total.value = result.total
    totalPages.value = result.totalPages
  } catch (e) {
    console.error('Failed to load zones:', e)
  } finally {
    initialLoading.value = false
    tableLoading.value = false
  }
}

// Debounced search
const debouncedSearch = useDebounceFn(() => {
  currentPage.value = 1
  loadZones()
}, 300)

// Watch for filter changes
watch([selectedEpicType, selectedAlignment, selectedDifficulty], () => {
  currentPage.value = 1
  loadZones()
})

// Handle search input
watch(search, () => {
  debouncedSearch()
})

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  loadZones()
}

// Handle sort
function handleSort(column: string) {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortOrder.value = 'asc'
  }
  loadZones()
}

// Navigate to zone detail
function goToZone(zoneNumber: number) {
  router.push(`/wiki/zones/${zoneNumber}`)
}

// Clear filters
function clearFilters() {
  search.value = ''
  selectedEpicType.value = 'all'
  selectedAlignment.value = 'all'
  selectedDifficulty.value = 'all'
  currentPage.value = 1
  loadZones()
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return search.value ||
    (selectedEpicType.value && selectedEpicType.value !== 'all') ||
    (selectedAlignment.value && selectedAlignment.value !== 'all') ||
    (selectedDifficulty.value && selectedDifficulty.value !== 'all')
})

// Load on mount
onMounted(() => {
  loadZones(true)
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div class="flex-1 overflow-y-auto">
      <div class="px-4 py-6 space-y-6">
        <!-- Filters -->
        <Card>
          <CardContent class="pt-4 lg:pt-6">
            <!-- Mobile: Search + Filter Toggle -->
            <div class="lg:hidden space-y-3">
              <!-- Search always visible -->
              <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input v-model="search" placeholder="Search zones..." class="pl-10" />
              </div>
              <!-- Filter toggle button -->
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="showFilters = !showFilters" class="gap-2">
                  <Filter class="h-4 w-4" />
                  Filters
                  <Badge v-if="hasActiveFilters" variant="secondary" class="ml-1">!</Badge>
                  <component :is="showFilters ? ChevronUp : ChevronDown" class="h-4 w-4" />
                </Button>
                <Button v-if="hasActiveFilters" variant="ghost" size="sm" @click="clearFilters" class="gap-1">
                  <X class="h-4 w-4" />
                  Clear
                </Button>
              </div>
              <!-- Collapsible filter drawer -->
              <div v-if="showFilters" class="space-y-3 pt-2 border-t">
                <!-- Epic Type Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Epic Type</label>
                  <Select v-model="selectedEpicType">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="0">None</SelectItem>
                      <SelectItem value="1">Solo</SelectItem>
                      <SelectItem value="2">Group</SelectItem>
                      <SelectItem value="3">Raid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <!-- Alignment Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Alignment</label>
                  <Select v-model="selectedAlignment">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem v-for="i in 11" :key="i - 6" :value="(i - 6).toString()">
                        {{ alignmentLabels[(i - 6).toString()] }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <!-- Difficulty Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Difficulty</label>
                  <Select v-model="selectedDifficulty">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem v-for="i in 11" :key="i - 1" :value="(i - 1).toString()">
                        {{ i - 1 }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <!-- Desktop: Inline filters -->
            <div class="hidden lg:flex flex-wrap gap-4 items-end">
              <!-- Search -->
              <div class="flex-1 min-w-[200px]">
                <label class="text-sm font-medium mb-2 block">Search</label>
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    v-model="search"
                    placeholder="Search zones..."
                    class="pl-10"
                  />
                </div>
              </div>

              <!-- Epic Type Filter -->
              <div class="w-[150px]">
                <label class="text-sm font-medium mb-2 block">Epic Type</label>
                <Select v-model="selectedEpicType">
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="0">None</SelectItem>
                    <SelectItem value="1">Solo</SelectItem>
                    <SelectItem value="2">Group</SelectItem>
                    <SelectItem value="3">Raid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Alignment Filter -->
              <div class="w-[150px]">
                <label class="text-sm font-medium mb-2 block">Alignment</label>
                <Select v-model="selectedAlignment">
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem v-for="i in 11" :key="i - 6" :value="(i - 6).toString()">
                      {{ alignmentLabels[(i - 6).toString()] }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Difficulty Filter -->
              <div class="w-[150px]">
                <label class="text-sm font-medium mb-2 block">Difficulty</label>
                <Select v-model="selectedDifficulty">
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem v-for="i in 11" :key="i - 1" :value="(i - 1).toString()">
                      {{ i - 1 }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Clear Filters -->
              <Button
                v-if="hasActiveFilters"
                variant="ghost"
                size="sm"
                @click="clearFilters"
                class="gap-2"
              >
                <X class="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Results -->
        <Card>
          <CardContent class="p-0">
            <!-- Initial Loading State with Skeleton -->
            <div v-if="initialLoading">
              <!-- Mobile skeleton -->
              <div class="lg:hidden divide-y">
                <div v-for="i in 10" :key="i" class="p-3">
                  <div class="flex items-start gap-3">
                    <Skeleton class="w-12 h-10 rounded-lg flex-shrink-0" />
                    <div class="flex-1 space-y-2">
                      <Skeleton class="h-4 w-3/4" />
                      <div class="flex gap-1">
                        <Skeleton class="h-5 w-12 rounded-full" />
                        <Skeleton class="h-5 w-8 rounded-full" />
                        <Skeleton class="h-5 w-14 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Desktop skeleton -->
              <div class="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-[100px]">Zone #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead class="w-[100px]">Align</TableHead>
                      <TableHead class="w-[100px]">Difficulty</TableHead>
                      <TableHead class="w-[100px]">Epic</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="i in 10" :key="i">
                      <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton class="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-12 rounded-full" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-8 rounded-full" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-16 rounded-full" /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="zones.length === 0" class="text-center py-12 text-muted-foreground">
              No zones found matching your criteria.
            </div>

            <!-- Results: Mobile Cards + Desktop Table -->
            <div v-else class="relative">
              <!-- Loading overlay for pagination/filter changes -->
              <div
                v-if="tableLoading"
                class="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
              >
                <div class="flex items-center gap-2 text-muted-foreground">
                  <div class="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span class="text-sm">Loading...</span>
                </div>
              </div>

              <!-- Mobile: Card list -->
              <div class="lg:hidden divide-y">
                <div
                  v-for="zone in zones"
                  :key="`mobile-${zone.number}`"
                  class="p-3 cursor-pointer hover:bg-muted/50 active:bg-muted"
                  @click="goToZone(zone.number)"
                >
                  <div class="flex items-start gap-3">
                    <!-- Zone number indicator -->
                    <div class="flex flex-col items-center justify-center w-12 h-10 rounded-lg bg-muted/50 flex-shrink-0">
                      <span class="text-xs font-mono font-semibold">{{ zone.number }}</span>
                    </div>
                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate">
                        <AnsiText :text="zone.name" />
                      </div>
                      <!-- Badges row -->
                      <div class="flex flex-wrap gap-1 mt-1">
                        <Badge :variant="zone.alignment > 0 ? 'default' : zone.alignment < 0 ? 'destructive' : 'secondary'" class="text-xs">
                          {{ zone.alignment > 0 ? '+' : '' }}{{ zone.alignment }}
                        </Badge>
                        <Badge :variant="getDifficultyVariant(zone.difficulty)" class="text-xs">
                          D{{ zone.difficulty }}
                        </Badge>
                        <Badge v-if="zone.epicType > 0" variant="outline" class="text-xs">
                          {{ epicTypeLabels[zone.epicType] }}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Desktop: Table -->
              <div class="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('number')">
                        <div class="flex items-center gap-1">
                          Zone #
                          <component :is="sortBy === 'number' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="cursor-pointer hover:bg-muted/50" @click="handleSort('name')">
                        <div class="flex items-center gap-1">
                          Name
                          <component :is="sortBy === 'name' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('alignment')">
                        <div class="flex items-center gap-1">
                          Align
                          <component :is="sortBy === 'alignment' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('difficulty')">
                        <div class="flex items-center gap-1">
                          Difficulty
                          <component :is="sortBy === 'difficulty' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('epic_type')">
                        <div class="flex items-center gap-1">
                          Epic
                          <component :is="sortBy === 'epic_type' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow
                      v-for="zone in zones"
                      :key="zone.number"
                      class="cursor-pointer hover:bg-muted/50"
                      @click="goToZone(zone.number)"
                    >
                      <TableCell class="font-mono text-sm">{{ zone.number }}</TableCell>
                      <TableCell>
                        <AnsiText :text="zone.name" />
                      </TableCell>
                      <TableCell>
                        <Badge :variant="zone.alignment > 0 ? 'default' : zone.alignment < 0 ? 'destructive' : 'secondary'">
                          {{ zone.alignment > 0 ? '+' : '' }}{{ zone.alignment }}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge :variant="getDifficultyVariant(zone.difficulty)">
                          {{ zone.difficulty }}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge v-if="zone.epicType > 0" variant="outline">
                          {{ epicTypeLabels[zone.epicType] }}
                        </Badge>
                        <span v-else class="text-muted-foreground">-</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="!initialLoading && zones.length > 0" class="border-t px-3 lg:px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p class="text-xs sm:text-sm text-muted-foreground">
                {{ (currentPage - 1) * limit + 1 }}-{{ Math.min(currentPage * limit, total) }} of {{ total }}
              </p>
              <PaginationWithEllipsis
                :current-page="currentPage"
                :total-pages="totalPages"
                @page-change="handlePageChange"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

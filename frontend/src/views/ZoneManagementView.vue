<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  useZonesQuery,
  useZoneStatsQuery,
  type ZoneFilters,
  type PaginationParams,
  EPIC_TYPE_LABELS,
  getAlignmentLabel,
  getAlignmentColor,
  getDifficultyStars,
  getLastTouchLabel,
} from '@/composables/useZones'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpDown, Edit } from 'lucide-vue-next'
import ZoneEditDialog from '@/components/ZoneEditDialog.vue'
import ZoneBulkEditDialog from '@/components/ZoneBulkEditDialog.vue'
import ZoneStatsCard from '@/components/ZoneStatsCard.vue'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'

const filters = ref<ZoneFilters>({
  search: '',
  epicTypes: [],
  onlyEpicZones: false,
})

const pagination = ref<PaginationParams>({
  page: 1,
  limit: 20,
  sortBy: 'number',
  sortOrder: 'asc',
})

const perPageValue = ref('20')

// Watch perPageValue and update pagination
watch(perPageValue, (newValue) => {
  pagination.value.limit = Number(newValue)
  pagination.value.page = 1
  selectedZones.value = new Set()
})

const { data: zonesData, isLoading, error } = useZonesQuery(filters, pagination)
const { data: stats } = useZoneStatsQuery()

const selectedZones = ref<Set<number>>(new Set())
const editingZone = ref<number | null>(null)
const showBulkEdit = ref(false)

// Debounced search
const searchQuery = ref('')
let searchTimeout: ReturnType<typeof setTimeout>

watch(searchQuery, (newValue) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    filters.value.search = newValue
    pagination.value.page = 1 // Reset to first page on search
  }, 300)
})

// Epic type filter
const selectedEpicTypes = ref<number[]>([])
watch(selectedEpicTypes, (newValue) => {
  filters.value.epicTypes = newValue
  pagination.value.page = 1
  selectedZones.value = new Set()
})

// Only epic zones toggle
const onlyEpicZones = ref(false)
watch(onlyEpicZones, (newValue) => {
  filters.value.onlyEpicZones = newValue
  pagination.value.page = 1
  selectedZones.value = new Set()
})

// Sorting
function toggleSort(column: string) {
  if (pagination.value.sortBy === column) {
    pagination.value.sortOrder = pagination.value.sortOrder === 'asc' ? 'desc' : 'asc'
  } else {
    pagination.value.sortBy = column
    pagination.value.sortOrder = 'asc'
  }
}

// Pagination
function goToPage(page: number) {
  pagination.value.page = page
  selectedZones.value = new Set()
}

// Selection
function toggleZoneSelection(zoneNumber: number) {
  const newSet = new Set(selectedZones.value)
  if (newSet.has(zoneNumber)) {
    newSet.delete(zoneNumber)
  } else {
    newSet.add(zoneNumber)
  }
  selectedZones.value = newSet
}

function toggleSelectAll() {
  if (!zonesData.value?.zones) return

  if (isAllSelected.value) {
    selectedZones.value = new Set()
  } else {
    const newSet = new Set<number>()
    zonesData.value.zones.forEach((zone: { number: number }) => {
      newSet.add(zone.number)
    })
    selectedZones.value = newSet
  }
}

const isAllSelected = computed(() => {
  if (!zonesData.value?.zones || zonesData.value.zones.length === 0) {
    return false
  }
  return zonesData.value.zones.every((zone: { number: number }) =>
    selectedZones.value.has(zone.number),
  )
})

const isSomeSelected = computed(() => {
  return selectedZones.value.size > 0
})

// Edit zone
function openEditDialog(zoneNumber: number) {
  editingZone.value = zoneNumber
}

function closeEditDialog() {
  editingZone.value = null
}

// Bulk edit
function openBulkEditDialog() {
  showBulkEdit.value = true
}

function closeBulkEditDialog() {
  showBulkEdit.value = false
  selectedZones.value = new Set()
}

// Clear filters
function clearFilters() {
  searchQuery.value = ''
  selectedEpicTypes.value = []
  onlyEpicZones.value = false
  pagination.value.page = 1
}
</script>

<template>
  <div class="container mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">Zone Management</h1>

    <div class="space-y-4">
        <!-- Statistics Card -->
        <ZoneStatsCard :stats="stats" />

        <!-- Filters -->
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter zones</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Search -->
              <div class="space-y-2">
                <label class="text-sm font-medium">Search</label>
                <Input
                  v-model="searchQuery"
                  placeholder="Zone name or number..."
                  type="text"
                />
              </div>

              <!-- Epic Type Filter -->
              <div class="space-y-2">
                <label class="text-sm font-medium">Epic Type</label>
                <Select v-model="selectedEpicTypes" multiple>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="0">None</SelectItem>
                    <SelectItem :value="1">Small</SelectItem>
                    <SelectItem :value="2">Large</SelectItem>
                    <SelectItem :value="3">Monolith</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Only Epic Zones -->
              <div class="space-y-2 flex items-end">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    v-model:checked="onlyEpicZones"
                    id="only-epic"
                  />
                  <span class="text-sm font-medium">Only Epic Zones</span>
                </label>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <Button variant="outline" size="sm" @click="clearFilters">
                Clear Filters
              </Button>
              <Button
                v-if="isSomeSelected"
                @click="openBulkEditDialog"
                size="sm"
              >
                Bulk Edit ({{ selectedZones.size }})
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Zones Table -->
        <Card>
          <CardHeader>
            <div class="flex justify-between items-center">
              <div>
                <CardTitle>Zones</CardTitle>
                <CardDescription>
                  {{ zonesData?.total || 0 }} total zones
                  <span v-if="filters.search || filters.epicTypes?.length || filters.onlyEpicZones">
                    (filtered)
                  </span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <!-- Loading State -->
            <div v-show="isLoading" class="space-y-2">
              <Skeleton class="h-10 w-full" v-for="i in 10" :key="i" />
            </div>

            <!-- Error State -->
            <div v-show="error && !isLoading" class="text-center py-8 text-red-500">
              Error loading zones: {{ error }}
            </div>

            <!-- Empty State -->
            <div v-show="!isLoading && !error && zonesData && !zonesData.zones.length" class="text-center py-8 text-muted-foreground">
              No zones found
            </div>

            <!-- Zones Table -->
            <div v-show="!isLoading && !error && zonesData && zonesData.zones.length">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-12">
                      <Checkbox
                        :model-value="isAllSelected"
                        @update:model-value="toggleSelectAll"
                      />
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('number')">
                      <div class="flex items-center gap-1">
                        Zone #
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('name')">
                      <div class="flex items-center gap-1">
                        Name
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('epic_type')">
                      <div class="flex items-center gap-1">
                        Epic Type
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('alignment')">
                      <div class="flex items-center gap-1">
                        Alignment
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('suggested_group_size')">
                      <div class="flex items-center gap-1">
                        Group
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('difficulty')">
                      <div class="flex items-center gap-1">
                        Difficulty
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="toggleSort('epic_payout')">
                      <div class="flex items-center gap-1">
                        Payout
                        <ArrowUpDown class="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Last Touch</TableHead>
                    <TableHead class="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="zone in (zonesData?.zones || [])"
                    :key="zone.id"
                    :class="{ 'bg-muted/50': selectedZones.has(zone.number) }"
                  >
                    <TableCell>
                      <Checkbox
                        :model-value="selectedZones.has(zone.number)"
                        @update:model-value="() => toggleZoneSelection(zone.number)"
                      />
                    </TableCell>
                    <TableCell class="font-mono">{{ zone.number }}</TableCell>
                    <TableCell>
                      <div v-html="parseAnsiForVue(zone.name)" class="inline"></div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        :class="{
                          'bg-gray-500/20 text-gray-400 border-gray-500': zone.epicType === 0,
                          'bg-blue-500/20 text-blue-400 border-blue-500': zone.epicType === 1,
                          'bg-purple-500/20 text-purple-400 border-purple-500': zone.epicType === 2,
                          'bg-pink-500/20 text-pink-400 border-pink-500': zone.epicType === 3,
                        }"
                      >
                        {{ EPIC_TYPE_LABELS[zone.epicType as 0 | 1 | 2 | 3].name }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span :class="getAlignmentColor(zone.alignment)">
                        {{ getAlignmentLabel(zone.alignment) }}
                      </span>
                    </TableCell>
                    <TableCell class="text-center">{{ zone.suggestedGroupSize }}</TableCell>
                    <TableCell>
                      <span :title="getDifficultyStars(zone.difficulty)">
                        {{ zone.difficulty }}/10
                      </span>
                    </TableCell>
                    <TableCell class="text-center">{{ zone.epicPayout }}</TableCell>
                    <TableCell class="text-sm text-muted-foreground">
                      {{ getLastTouchLabel(zone.lastTouch) }}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="openEditDialog(zone.number)"
                      >
                        <Edit class="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Pagination -->
              <div v-if="zonesData" class="flex items-center justify-between mt-4">
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <Label for="perPage" class="text-sm text-muted-foreground">Per page:</Label>
                    <Select v-model="perPageValue">
                      <SelectTrigger id="perPage" class="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div class="text-sm text-muted-foreground">
                  Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
                  {{ Math.min(pagination.page * pagination.limit, zonesData.total) }}
                  of {{ zonesData.total }} results
                </div>
                <div class="flex justify-end">
                  <PaginationWithEllipsis
                    :key="`pagination-${pagination.limit}-${zonesData.totalPages}`"
                    :current-page="pagination.page"
                    :total-pages="zonesData.totalPages"
                    @page-change="goToPage"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    <!-- Edit Dialog -->
    <ZoneEditDialog
      v-if="editingZone !== null"
      :zone-number="editingZone"
      @close="closeEditDialog"
    />

    <!-- Bulk Edit Dialog -->
    <ZoneBulkEditDialog
      v-if="showBulkEdit"
      :zone-numbers="Array.from(selectedZones)"
      @close="closeBulkEditDialog"
    />
  </div>
</template>

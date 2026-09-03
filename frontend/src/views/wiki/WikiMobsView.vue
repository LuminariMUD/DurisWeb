<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { hasApiErrorCode } from '@/utils/apiError'
import type { WikiMob, WikiMobFilters, WikiMobClass, WikiMobRace, WikiActFlag } from '@/types'
import {
  Search,
  SortAsc,
  SortDesc,
  X,
  Info,
  Check,
  ChevronsUpDown,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next'

const router = useRouter()

// State
const initialLoading = ref(true)
const tableLoading = ref(false)
const referenceUnavailable = ref(false)
const mobs = ref<WikiMob[]>([])
const total = ref(0)
const currentPage = ref(1)
const totalPages = ref(1)
const limit = 20

// Filter options
const mobClasses = ref<WikiMobClass[]>([])
const mobRaces = ref<WikiMobRace[]>([])
const actFlags = ref<WikiActFlag[]>([])

// Zone search state
const zoneSearchResults = ref<{ number: number; name: string }[]>([])
const zoneSearchQuery = ref('')
const zoneSearchLoading = ref(false)
const zoneHasMore = ref(false)
const zoneOffset = ref(0)
const selectedZoneData = ref<{ number: number; name: string } | null>(null)
const ZONE_PAGE_SIZE = 20

// Filters
const search = ref('')
const selectedClass = ref<string>('')
const selectedRace = ref<string>('')
const selectedFlag = ref<string>('')
const selectedZone = ref<string>('')
const minLevel = ref<string>('')
const maxLevel = ref<string>('')
const alignmentFilter = ref<string>('')

// Popover open states
const classOpen = ref(false)
const raceOpen = ref(false)
const flagOpen = ref(false)
const zoneOpen = ref(false)

// Mobile filter drawer
const showFilters = ref(false)

// Sorting
const sortBy = ref('vnum')
const sortOrder = ref<'asc' | 'desc'>('asc')

// Alignment options
const alignmentOptions = [
  { value: 'evil', label: 'Evil (-1000 to -350)' },
  { value: 'neutral', label: 'Neutral (-349 to 349)' },
  { value: 'good', label: 'Good (350 to 1000)' },
]

// Get display name for selected values
const selectedClassName = computed(() => {
  if (!selectedClass.value) return 'All classes'
  const cls = mobClasses.value.find((c) => c.id.toString() === selectedClass.value)
  return cls?.name || 'All classes'
})

const selectedRaceName = computed(() => {
  if (!selectedRace.value) return 'All races'
  const race = mobRaces.value.find((r) => r.id.toString() === selectedRace.value)
  return race?.name || 'All races'
})

const selectedFlagName = computed(() => {
  if (!selectedFlag.value) return 'All flags'
  const flag = actFlags.value.find((f) => f.id.toString() === selectedFlag.value)
  return flag?.name || 'All flags'
})

const selectedZoneName = computed(() => {
  if (!selectedZone.value || !selectedZoneData.value) return 'All zones'
  return `#${selectedZoneData.value.number} ${stripAnsi(selectedZoneData.value.name)}`
})

// Strip ANSI codes for search matching
function stripAnsi(text: string): string {
  return text.replace(/&[+\-=][a-zA-Z]/g, '').replace(/&n/g, '')
}

// Build filters object
const filters = computed((): WikiMobFilters => {
  const f: WikiMobFilters = {}
  if (search.value) f.search = search.value
  if (selectedClass.value) {
    f.mobClass = parseInt(selectedClass.value)
  }
  if (selectedRace.value) {
    f.race = parseInt(selectedRace.value)
  }
  if (selectedFlag.value) {
    f.flag = parseInt(selectedFlag.value)
  }
  if (selectedZone.value) {
    f.zone = parseInt(selectedZone.value)
  }
  if (minLevel.value) f.minLevel = parseInt(minLevel.value)
  if (maxLevel.value) f.maxLevel = parseInt(maxLevel.value)

  // Alignment filter
  if (alignmentFilter.value === 'evil') {
    f.alignmentMin = -1000
    f.alignmentMax = -350
  } else if (alignmentFilter.value === 'neutral') {
    f.alignmentMin = -349
    f.alignmentMax = 349
  } else if (alignmentFilter.value === 'good') {
    f.alignmentMin = 350
    f.alignmentMax = 1000
  }

  return f
})

// Load filter options
async function loadFilterOptions() {
  try {
    const [classes, races, flags] = await Promise.all([
      wikiApi.getMobClasses(),
      wikiApi.getMobRaces(),
      wikiApi.getActFlags(),
    ])
    mobClasses.value = classes.filter((c) => c.id > 0) // Filter out "None"
    mobRaces.value = races.filter((r) => r.id > 0) // Filter out "None"
    actFlags.value = flags.filter((f) => f.name !== 'ISNPC') // Filter out internal flag
  } catch (e) {
    console.error('Failed to load filter options:', e)
  }
}

// Load zones (initial or search) - resets list
async function loadZones(query: string = '') {
  zoneSearchLoading.value = true
  zoneOffset.value = 0
  try {
    const result = await wikiApi.searchZones(query, ZONE_PAGE_SIZE, 0)
    zoneSearchResults.value = result.zones
    zoneHasMore.value = result.hasMore
    zoneOffset.value = result.zones.length
  } catch (e) {
    console.error('Failed to search zones:', e)
    zoneSearchResults.value = []
    zoneHasMore.value = false
  } finally {
    zoneSearchLoading.value = false
  }
}

// Load more zones (append to list)
async function loadMoreZones() {
  if (zoneSearchLoading.value || !zoneHasMore.value) return
  zoneSearchLoading.value = true
  try {
    const result = await wikiApi.searchZones(
      zoneSearchQuery.value,
      ZONE_PAGE_SIZE,
      zoneOffset.value,
    )
    zoneSearchResults.value = [...zoneSearchResults.value, ...result.zones]
    zoneHasMore.value = result.hasMore
    zoneOffset.value += result.zones.length
  } catch (e) {
    console.error('Failed to load more zones:', e)
  } finally {
    zoneSearchLoading.value = false
  }
}

// Handle scroll in zone list for infinite loading
function handleZoneScroll(event: Event) {
  const target = event.target as HTMLElement
  const threshold = 50
  if (target.scrollHeight - target.scrollTop - target.clientHeight < threshold) {
    loadMoreZones()
  }
}

// Search zones with debounce
const searchZonesDebounced = useDebounceFn((query: string) => {
  loadZones(query)
}, 300)

// Watch zone search query
watch(zoneSearchQuery, (query) => {
  searchZonesDebounced(query)
})

// Load initial zones when popover opens
watch(zoneOpen, (open) => {
  if (open && zoneSearchResults.value.length === 0) {
    loadZones('')
  }
})

// Load mobs
async function loadMobs(isInitial = false) {
  try {
    if (isInitial) {
      initialLoading.value = true
    } else {
      tableLoading.value = true
    }
    const result = await wikiApi.getMobs(
      filters.value,
      currentPage.value,
      limit,
      sortBy.value,
      sortOrder.value,
    )
    mobs.value = result.mobs
    referenceUnavailable.value = false
    total.value = result.total
    totalPages.value = result.totalPages
  } catch (e) {
    if (hasApiErrorCode(e, 503, 'WIKI_MOB_REFERENCE_UNAVAILABLE')) {
      referenceUnavailable.value = true
      mobs.value = []
      total.value = 0
      totalPages.value = 0
    } else {
      console.error('Failed to load mobs:', e)
    }
  } finally {
    initialLoading.value = false
    tableLoading.value = false
  }
}

// Debounced search
const debouncedSearch = useDebounceFn(() => {
  currentPage.value = 1
  loadMobs()
}, 300)

// Watch for filter changes
watch(
  [selectedClass, selectedRace, selectedFlag, selectedZone, minLevel, maxLevel, alignmentFilter],
  () => {
    currentPage.value = 1
    loadMobs()
  },
)

// Handle search input
watch(search, () => {
  debouncedSearch()
})

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  loadMobs()
}

// Handle sort
function handleSort(column: string) {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortOrder.value = 'asc'
  }
  loadMobs()
}

// Navigate to mob detail (unique by zone + vnum)
function goToMob(zoneNumber: number, vnum: number) {
  router.push(`/wiki/mobs/${zoneNumber}/${vnum}`)
}

// Clear filters
function clearFilters() {
  search.value = ''
  selectedClass.value = ''
  selectedRace.value = ''
  selectedFlag.value = ''
  selectedZone.value = ''
  selectedZoneData.value = null
  zoneSearchQuery.value = ''
  zoneSearchResults.value = []
  minLevel.value = ''
  maxLevel.value = ''
  alignmentFilter.value = 'all'
  currentPage.value = 1
  loadMobs()
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return (
    search.value ||
    selectedClass.value ||
    selectedRace.value ||
    selectedFlag.value ||
    selectedZone.value ||
    minLevel.value ||
    maxLevel.value ||
    (alignmentFilter.value && alignmentFilter.value !== 'all')
  )
})

// Get alignment badge variant
function getAlignmentVariant(alignment: number): 'default' | 'destructive' | 'secondary' {
  if (alignment >= 350) return 'default'
  if (alignment <= -350) return 'destructive'
  return 'secondary'
}

// Format alignment for display
function formatAlignment(alignment: number): string {
  if (alignment >= 350) return `+${alignment}`
  return alignment.toString()
}

// Navigate to zone
function goToZone(zoneNumber: number, event: Event) {
  event.stopPropagation()
  router.push(`/wiki/zones/${zoneNumber}`)
}

// Handle class selection
function selectClass(value: string) {
  selectedClass.value = value
  classOpen.value = false
}

// Handle race selection
function selectRace(value: string) {
  selectedRace.value = value
  raceOpen.value = false
}

// Handle flag selection
function selectFlag(value: string) {
  selectedFlag.value = value
  flagOpen.value = false
}

// Handle zone selection
function selectZone(zone: { number: number; name: string } | null) {
  if (zone) {
    selectedZone.value = zone.number.toString()
    selectedZoneData.value = zone
  } else {
    selectedZone.value = ''
    selectedZoneData.value = null
  }
  zoneSearchQuery.value = ''
  zoneSearchResults.value = []
  zoneOpen.value = false
}

// Load on mount
onMounted(async () => {
  await loadFilterOptions()
  await loadMobs(true)
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
                <Input
                  v-model="search"
                  placeholder="Search mobs..."
                  class="pl-10"
                />
              </div>
              <!-- Filter toggle button -->
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  @click="showFilters = !showFilters"
                  class="gap-2"
                >
                  <Filter class="h-4 w-4" />
                  Filters
                  <Badge v-if="hasActiveFilters" variant="secondary" class="ml-1">
                    {{ [selectedClass, selectedRace, selectedFlag, selectedZone, minLevel, maxLevel, alignmentFilter && alignmentFilter !== 'all' ? alignmentFilter : ''].filter(Boolean).length }}
                  </Badge>
                  <component :is="showFilters ? ChevronUp : ChevronDown" class="h-4 w-4" />
                </Button>
                <Button
                  v-if="hasActiveFilters"
                  variant="ghost"
                  size="sm"
                  @click="clearFilters"
                  class="gap-1"
                >
                  <X class="h-4 w-4" />
                  Clear
                </Button>
              </div>
              <!-- Collapsible filter drawer -->
              <div v-if="showFilters" class="space-y-3 pt-2 border-t">
                <!-- Class Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Class</label>
                  <Popover v-model:open="classOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" :aria-expanded="classOpen" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedClassName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search class..." />
                        <CommandEmpty>No class found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectClass('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedClass === '' ? 'opacity-100' : 'opacity-0'" />
                              All Classes
                            </CommandItem>
                            <CommandItem v-for="cls in mobClasses" :key="cls.id" :value="cls.name" @select="selectClass(cls.id.toString())">
                              <Check class="mr-2 h-4 w-4" :class="selectedClass === cls.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              {{ cls.name }}
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Race Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Race</label>
                  <Popover v-model:open="raceOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" :aria-expanded="raceOpen" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedRaceName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search race..." />
                        <CommandEmpty>No race found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectRace('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedRace === '' ? 'opacity-100' : 'opacity-0'" />
                              All Races
                            </CommandItem>
                            <CommandItem v-for="race in mobRaces" :key="race.id" :value="race.name" @select="selectRace(race.id.toString())">
                              <Check class="mr-2 h-4 w-4" :class="selectedRace === race.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              {{ race.name }}
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Flag Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Flag</label>
                  <Popover v-model:open="flagOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" :aria-expanded="flagOpen" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedFlagName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search flag..." />
                        <CommandEmpty>No flag found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectFlag('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedFlag === '' ? 'opacity-100' : 'opacity-0'" />
                              All Flags
                            </CommandItem>
                            <CommandItem v-for="flag in actFlags" :key="flag.id" :value="flag.name" @select="selectFlag(flag.id.toString())">
                              <Check class="mr-2 h-4 w-4 shrink-0" :class="selectedFlag === flag.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              <div class="flex flex-col">
                                <span class="font-medium">{{ flag.name }}</span>
                                <span class="text-xs text-muted-foreground">{{ flag.description }}</span>
                              </div>
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Zone Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Zone</label>
                  <Popover v-model:open="zoneOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" :aria-expanded="zoneOpen" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedZoneName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[320px] p-0">
                      <Command :filter-function="() => 1">
                        <CommandInput v-model="zoneSearchQuery" placeholder="Search zones..." />
                        <CommandList class="max-h-[300px]" @scroll="handleZoneScroll">
                          <CommandEmpty>
                            <span v-if="zoneSearchLoading && zoneSearchResults.length === 0">Loading...</span>
                            <span v-else>No zone found.</span>
                          </CommandEmpty>
                          <CommandGroup v-if="selectedZone">
                            <CommandItem value="clear" class="cursor-pointer" @select="selectZone(null)">
                              <X class="mr-2 h-4 w-4" />
                              Clear selection
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup v-if="zoneSearchResults.length > 0">
                            <CommandItem v-for="zone in zoneSearchResults" :key="zone.number" :value="`zone-${zone.number}`" class="cursor-pointer" @select="selectZone(zone)">
                              <Check class="mr-2 h-4 w-4 shrink-0" :class="selectedZone === zone.number.toString() ? 'opacity-100' : 'opacity-0'" />
                              <span class="text-muted-foreground mr-2">#{{ zone.number }}</span>
                              <AnsiText :text="zone.name" class="truncate" />
                            </CommandItem>
                            <div v-if="zoneSearchLoading && zoneSearchResults.length > 0" class="py-2 text-center text-sm text-muted-foreground">
                              Loading more...
                            </div>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Alignment Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Alignment</label>
                  <Select v-model="alignmentFilter">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem v-for="opt in alignmentOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <!-- Level Range -->
                <div class="flex items-end gap-2">
                  <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Min Level</label>
                    <Input v-model="minLevel" type="number" placeholder="1" min="1" max="100" />
                  </div>
                  <span class="pb-2 text-muted-foreground">-</span>
                  <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Max Level</label>
                    <Input v-model="maxLevel" type="number" placeholder="100" min="1" max="100" />
                  </div>
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
                    placeholder="Search mobs..."
                    class="pl-10"
                  />
                </div>
              </div>

              <!-- Class Filter (Popover + Command) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Class</label>
                <Popover v-model:open="classOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="classOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedClassName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search class..." />
                      <CommandEmpty>No class found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectClass('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedClass === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Classes
                          </CommandItem>
                          <CommandItem
                            v-for="cls in mobClasses"
                            :key="cls.id"
                            :value="cls.name"
                            @select="selectClass(cls.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedClass === cls.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            {{ cls.name }}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Race Filter (Popover + Command) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Race</label>
                <Popover v-model:open="raceOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="raceOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedRaceName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search race..." />
                      <CommandEmpty>No race found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectRace('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedRace === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Races
                          </CommandItem>
                          <CommandItem
                            v-for="race in mobRaces"
                            :key="race.id"
                            :value="race.name"
                            @select="selectRace(race.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedRace === race.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            {{ race.name }}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Flag Filter (Popover + Command) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Flag</label>
                <Popover v-model:open="flagOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="flagOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedFlagName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[280px] p-0">
                    <Command>
                      <CommandInput placeholder="Search flag..." />
                      <CommandEmpty>No flag found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectFlag('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedFlag === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Flags
                          </CommandItem>
                          <CommandItem
                            v-for="flag in actFlags"
                            :key="flag.id"
                            :value="flag.name"
                            @select="selectFlag(flag.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4 shrink-0"
                              :class="selectedFlag === flag.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            <div class="flex flex-col">
                              <span class="font-medium">{{ flag.name }}</span>
                              <span class="text-xs text-muted-foreground">{{ flag.description }}</span>
                            </div>
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Zone Filter (Async Search + Infinite Scroll) -->
              <div class="w-[200px]">
                <label class="text-sm font-medium mb-2 block">Zone</label>
                <Popover v-model:open="zoneOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="zoneOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedZoneName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[320px] p-0">
                    <Command :filter-function="() => 1">
                      <CommandInput
                        v-model="zoneSearchQuery"
                        placeholder="Search zones..."
                      />
                      <CommandList class="max-h-[300px]" @scroll="handleZoneScroll">
                        <CommandEmpty>
                          <span v-if="zoneSearchLoading && zoneSearchResults.length === 0">Loading...</span>
                          <span v-else>No zone found.</span>
                        </CommandEmpty>
                        <CommandGroup v-if="selectedZone">
                          <CommandItem value="clear" class="cursor-pointer hover:bg-accent hover:text-accent-foreground" @select="selectZone(null)">
                            <X class="mr-2 h-4 w-4" />
                            Clear selection
                          </CommandItem>
                        </CommandGroup>
                        <CommandGroup v-if="zoneSearchResults.length > 0">
                          <CommandItem
                            v-for="zone in zoneSearchResults"
                            :key="zone.number"
                            :value="`zone-${zone.number}`"
                            class="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                            @select="selectZone(zone)"
                          >
                            <Check
                              class="mr-2 h-4 w-4 shrink-0"
                              :class="selectedZone === zone.number.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            <span class="text-muted-foreground mr-2">#{{ zone.number }}</span>
                            <AnsiText :text="zone.name" />
                          </CommandItem>
                          <!-- Loading more indicator -->
                          <div v-if="zoneSearchLoading && zoneSearchResults.length > 0" class="py-2 text-center text-sm text-muted-foreground">
                            Loading more...
                          </div>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Alignment Filter -->
              <div class="w-[180px]">
                <label class="text-sm font-medium mb-2 block">Alignment</label>
                <Select v-model="alignmentFilter">
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem v-for="opt in alignmentOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Level Range -->
              <div class="flex items-end gap-2">
                <div class="w-[80px]">
                  <label class="text-sm font-medium mb-2 block">Min Lvl</label>
                  <Input
                    v-model="minLevel"
                    type="number"
                    placeholder="1"
                    min="1"
                    max="100"
                  />
                </div>
                <span class="pb-2 text-muted-foreground">-</span>
                <div class="w-[80px]">
                  <label class="text-sm font-medium mb-2 block">Max Lvl</label>
                  <Input
                    v-model="maxLevel"
                    type="number"
                    placeholder="100"
                    min="1"
                    max="100"
                  />
                </div>
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
                    <Skeleton class="w-10 h-10 rounded-lg flex-shrink-0" />
                    <div class="flex-1 space-y-2">
                      <Skeleton class="h-4 w-3/4" />
                      <div class="flex gap-1">
                        <Skeleton class="h-5 w-16 rounded-full" />
                        <Skeleton class="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton class="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
              <!-- Desktop skeleton -->
              <div class="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-[80px]">VNUM</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead class="w-[60px]">Level</TableHead>
                      <TableHead class="w-[100px]">Class</TableHead>
                      <TableHead class="w-[150px]">Flags</TableHead>
                      <TableHead class="w-[100px]">Race</TableHead>
                      <TableHead class="w-[90px]">Alignment</TableHead>
                      <TableHead>Zone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="i in 10" :key="i">
                      <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton class="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton class="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton class="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton class="h-4 w-32" /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Unpublished Reference State -->
            <div v-else-if="referenceUnavailable" class="text-center py-12 px-4 text-muted-foreground">
              <p class="font-medium text-foreground">Mob reference data is temporarily unavailable.</p>
              <p class="mt-1 text-sm">An operator must publish and verify the current reference generation.</p>
            </div>

            <!-- Empty Filter State -->
            <div v-else-if="mobs.length === 0" class="text-center py-12 text-muted-foreground">
              No mobs found matching your criteria.
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
                  v-for="mob in mobs"
                  :key="`mobile-${mob.zoneNumber}-${mob.vnum}`"
                  class="p-3 cursor-pointer hover:bg-muted/50 active:bg-muted"
                  @click="goToMob(mob.zoneNumber, mob.vnum)"
                >
                  <div class="flex items-start gap-3">
                    <!-- Level indicator -->
                    <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-muted/50 flex-shrink-0">
                      <span class="text-xs text-muted-foreground">Lvl</span>
                      <span class="text-sm font-semibold">{{ mob.level }}</span>
                    </div>
                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate">
                        <AnsiText :text="mob.name" />
                      </div>
                      <!-- Badges row -->
                      <div class="flex flex-wrap gap-1 mt-1">
                        <Badge v-if="mob.classname !== 'None'" variant="outline" class="text-xs">
                          {{ mob.classname }}
                        </Badge>
                        <Badge variant="secondary" class="text-xs">{{ mob.raceName }}</Badge>
                        <Badge :variant="getAlignmentVariant(mob.alignment)" class="text-xs">
                          {{ formatAlignment(mob.alignment) }}
                        </Badge>
                      </div>
                      <!-- Flags row -->
                      <div v-if="mob.flags.filter(f => f !== 'ISNPC').length > 0" class="flex flex-wrap gap-1 mt-1">
                        <Badge
                          v-for="flag in mob.flags.filter(f => f !== 'ISNPC').slice(0, 2)"
                          :key="flag"
                          variant="outline"
                          class="text-xs"
                        >
                          {{ flag }}
                        </Badge>
                        <Badge
                          v-if="mob.flags.filter(f => f !== 'ISNPC').length > 2"
                          variant="outline"
                          class="text-xs"
                        >
                          +{{ mob.flags.filter(f => f !== 'ISNPC').length - 2 }}
                        </Badge>
                      </div>
                      <!-- Zone -->
                      <div class="text-xs text-muted-foreground mt-1 truncate">
                        <AnsiText :text="mob.zoneName" />
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
                      <TableHead class="w-[80px] cursor-pointer hover:bg-muted/50" @click="handleSort('vnum')">
                        <div class="flex items-center gap-1">
                          VNUM
                          <component :is="sortBy === 'vnum' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="cursor-pointer hover:bg-muted/50" @click="handleSort('name')">
                        <div class="flex items-center gap-1">
                          Name
                          <component :is="sortBy === 'name' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[60px] cursor-pointer hover:bg-muted/50" @click="handleSort('level')">
                        <div class="flex items-center gap-1">
                          Level
                          <component :is="sortBy === 'level' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('class')">
                        <div class="flex items-center gap-1">
                          Class
                          <component :is="sortBy === 'class' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[150px]">
                        <div class="flex items-center gap-1">
                          Flags
                          <Popover>
                            <PopoverTrigger as-child>
                              <Button variant="ghost" size="icon" class="h-5 w-5">
                                <Info class="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-80 max-h-[400px] overflow-y-auto">
                              <h4 class="font-medium mb-2">Flag Legend</h4>
                              <div class="space-y-1 text-sm">
                                <div v-for="flag in actFlags" :key="flag.id" class="flex gap-2">
                                  <Badge variant="outline" class="shrink-0 text-xs">{{ flag.name }}</Badge>
                                  <span class="text-muted-foreground text-xs">{{ flag.description }}</span>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableHead>
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('race')">
                        <div class="flex items-center gap-1">
                          Race
                          <component :is="sortBy === 'race' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[90px] cursor-pointer hover:bg-muted/50" @click="handleSort('alignment')">
                        <div class="flex items-center gap-1">
                          Alignment
                          <component :is="sortBy === 'alignment' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="cursor-pointer hover:bg-muted/50" @click="handleSort('zone')">
                        <div class="flex items-center gap-1">
                          Zone
                          <component :is="sortBy === 'zone' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow
                      v-for="mob in mobs"
                      :key="`${mob.zoneNumber}-${mob.vnum}`"
                      class="cursor-pointer hover:bg-muted/50"
                      @click="goToMob(mob.zoneNumber, mob.vnum)"
                    >
                      <TableCell class="font-mono text-sm">{{ mob.vnum }}</TableCell>
                      <TableCell>
                        <AnsiText :text="mob.name" />
                      </TableCell>
                      <TableCell class="text-center">{{ mob.level }}</TableCell>
                      <TableCell>
                        <Badge v-if="mob.classname !== 'None'" variant="outline">
                          {{ mob.classname }}
                        </Badge>
                        <span v-else class="text-muted-foreground">-</span>
                      </TableCell>
                      <TableCell>
                        <div class="flex flex-wrap gap-1">
                          <Badge
                            v-for="flag in mob.flags.filter(f => f !== 'ISNPC').slice(0, 3)"
                            :key="flag"
                            variant="secondary"
                            class="text-xs"
                          >
                            {{ flag }}
                          </Badge>
                          <Badge
                            v-if="mob.flags.filter(f => f !== 'ISNPC').length > 3"
                            variant="outline"
                            class="text-xs"
                          >
                            +{{ mob.flags.filter(f => f !== 'ISNPC').length - 3 }}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell class="text-sm">{{ mob.raceName }}</TableCell>
                      <TableCell>
                        <Badge :variant="getAlignmentVariant(mob.alignment)">
                          {{ formatAlignment(mob.alignment) }}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          class="p-0 h-auto text-left font-normal"
                          @click="goToZone(mob.zoneNumber, $event)"
                        >
                          <AnsiText :text="mob.zoneName" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="!initialLoading && mobs.length > 0" class="border-t px-3 lg:px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
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

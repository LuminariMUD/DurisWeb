<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import AnsiText from '@/components/ui/AnsiText.vue'
import { wikiApi } from '@/services/api'
import type { WikiObject, WikiObjectFilters, WikiObjectType, WikiWearSlot, WikiAffectType } from '@/types'
import { Loader2, Search, SortAsc, SortDesc, X, ChevronDown, ChevronUp, Plus, Trash2, Check, ChevronsUpDown, Filter } from 'lucide-vue-next'

const router = useRouter()

// State
const loading = ref(true)
const objects = ref<WikiObject[]>([])
const total = ref(0)
const currentPage = ref(1)
const totalPages = ref(1)
const limit = 20

// Filter options
const objectTypes = ref<WikiObjectType[]>([])
const wearSlots = ref<WikiWearSlot[]>([])
const affectTypes = ref<WikiAffectType[]>([])
const spellEffectTypes = ref<string[]>([])

// Zone search state
const zoneSearchResults = ref<{ number: number; name: string }[]>([])
const zoneSearchQuery = ref('')
const zoneSearchLoading = ref(false)
const zoneHasMore = ref(false)
const zoneOffset = ref(0)
const selectedZoneData = ref<{ number: number; name: string } | null>(null)
const ZONE_PAGE_SIZE = 20

// Basic Filters
const search = ref('')
const selectedType = ref<string>('')
const selectedSlot = ref<string>('')
const selectedAffect = ref<string>('')
const selectedZone = ref<string>('')
const minLevel = ref<string>('')
const maxLevel = ref<string>('')
const excludeTrash = ref(false)

// Popover open states
const typeOpen = ref(false)
const slotOpen = ref(false)
const affectOpen = ref(false)
const zoneOpen = ref(false)

// Mobile filter drawer
const showFilters = ref(false)

// Advanced Filters
const advancedOpen = ref(false)
const affectFilters = ref<{ location: string; minModifier: string }[]>([])
const selectedSpellEffects = ref<string[]>([])

// Sorting
const sortBy = ref('vnum')
const sortOrder = ref<'asc' | 'desc'>('asc')

// Get display names for selected values
const selectedTypeName = computed(() => {
  if (!selectedType.value) return 'All types'
  const type = objectTypes.value.find((t) => t.id.toString() === selectedType.value)
  return type?.name || 'All types'
})

const selectedSlotName = computed(() => {
  if (!selectedSlot.value) return 'All slots'
  const slot = wearSlots.value.find((s) => s.id.toString() === selectedSlot.value)
  return slot?.name || 'All slots'
})

const selectedAffectName = computed(() => {
  if (!selectedAffect.value) return 'All affects'
  const affect = affectTypes.value.find((a) => a.id.toString() === selectedAffect.value)
  return affect?.name || 'All affects'
})

const selectedZoneName = computed(() => {
  if (!selectedZone.value || !selectedZoneData.value) return 'All zones'
  return `#${selectedZoneData.value.number} ${stripAnsi(selectedZoneData.value.name)}`
})

// Build filters object
const filters = computed((): WikiObjectFilters => {
  const f: WikiObjectFilters = {}
  if (search.value) f.search = search.value
  if (selectedType.value) f.type = parseInt(selectedType.value)
  if (selectedSlot.value) f.slot = parseInt(selectedSlot.value)
  if (selectedAffect.value) f.affectType = parseInt(selectedAffect.value)
  if (selectedZone.value) f.zone = parseInt(selectedZone.value)
  if (minLevel.value) f.minLevel = parseInt(minLevel.value)
  if (maxLevel.value) f.maxLevel = parseInt(maxLevel.value)

  // Exclude Trash (type 13)
  if (excludeTrash.value) {
    f.excludeTypes = [13]
  }

  // Advanced affect filters
  const validAffects = affectFilters.value
    .filter(af => af.location)
    .map(af => ({
      location: parseInt(af.location),
      minModifier: af.minModifier ? parseInt(af.minModifier) : undefined,
    }))
  if (validAffects.length > 0) {
    f.affects = validAffects
  }

  // Spell effects filter
  if (selectedSpellEffects.value.length > 0) {
    f.spellEffects = selectedSpellEffects.value
  }

  return f
})

// Load filter options
async function loadFilterOptions() {
  try {
    const [types, slots, affects, spellEffects] = await Promise.all([
      wikiApi.getObjectTypes(),
      wikiApi.getWearSlots(),
      wikiApi.getAffectTypes(),
      wikiApi.getSpellEffectTypes(),
    ])
    objectTypes.value = types.filter((t) => t.id > 0) // Filter out "Undefined"
    wearSlots.value = slots
    affectTypes.value = affects.filter((a) => a.id > 0) // Filter out "None"
    spellEffectTypes.value = spellEffects
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
    const result = await wikiApi.searchZones(zoneSearchQuery.value, ZONE_PAGE_SIZE, zoneOffset.value)
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

// Selection handlers
function selectType(value: string) {
  selectedType.value = value
  typeOpen.value = false
}

function selectSlot(value: string) {
  selectedSlot.value = value
  slotOpen.value = false
}

function selectAffect(value: string) {
  selectedAffect.value = value
  affectOpen.value = false
}

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

// Add affect filter row
function addAffectFilter() {
  affectFilters.value.push({ location: '', minModifier: '' })
}

// Remove affect filter row
function removeAffectFilter(index: number) {
  affectFilters.value.splice(index, 1)
  currentPage.value = 1
  loadObjects()
}

// Toggle spell effect selection
function toggleSpellEffect(effect: string) {
  const idx = selectedSpellEffects.value.indexOf(effect)
  if (idx >= 0) {
    selectedSpellEffects.value.splice(idx, 1)
  } else {
    selectedSpellEffects.value.push(effect)
  }
  currentPage.value = 1
  loadObjects()
}

// Load objects
async function loadObjects() {
  try {
    loading.value = true
    const result = await wikiApi.getObjects(filters.value, currentPage.value, limit, sortBy.value, sortOrder.value)
    objects.value = result.objects
    total.value = result.total
    totalPages.value = result.totalPages
  } catch (e) {
    console.error('Failed to load objects:', e)
  } finally {
    loading.value = false
  }
}

// Debounced search
const debouncedSearch = useDebounceFn(() => {
  currentPage.value = 1
  loadObjects()
}, 300)

// Watch for filter changes
watch([selectedType, selectedSlot, selectedAffect, selectedZone, minLevel, maxLevel, excludeTrash], () => {
  currentPage.value = 1
  loadObjects()
})

// Watch for affect filter changes (deep watch)
watch(affectFilters, () => {
  currentPage.value = 1
  loadObjects()
}, { deep: true })

// Handle search input
watch(search, () => {
  debouncedSearch()
})

// Handle page change
function handlePageChange(page: number) {
  currentPage.value = page
  loadObjects()
}

// Handle sort
function handleSort(column: string) {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortOrder.value = 'asc'
  }
  loadObjects()
}

// Navigate to object detail
function goToObject(vnum: number) {
  router.push(`/wiki/objects/${vnum}`)
}

// Clear filters
function clearFilters() {
  search.value = ''
  selectedType.value = ''
  selectedSlot.value = ''
  selectedAffect.value = ''
  selectedZone.value = ''
  selectedZoneData.value = null
  zoneSearchQuery.value = ''
  zoneSearchResults.value = []
  minLevel.value = ''
  maxLevel.value = ''
  excludeTrash.value = false
  affectFilters.value = []
  selectedSpellEffects.value = []
  currentPage.value = 1
  loadObjects()
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return search.value ||
    selectedType.value ||
    selectedSlot.value ||
    selectedAffect.value ||
    selectedZone.value ||
    minLevel.value ||
    maxLevel.value ||
    excludeTrash.value ||
    affectFilters.value.length > 0 ||
    selectedSpellEffects.value.length > 0
})

// Format affects for display
function formatAffects(obj: WikiObject): string {
  if (obj.affects.length === 0) return '-'
  return obj.affects
    .map((a) => `${a.modifier > 0 ? '+' : ''}${a.modifier} ${a.locationName}`)
    .join(', ')
}

// Format spell effects for display
function formatSpellEffects(obj: WikiObject): string {
  if (!obj.spellEffects || obj.spellEffects.length === 0) return '-'
  return obj.spellEffects.join(', ')
}

// Strip ANSI codes for search matching
function stripAnsi(text: string): string {
  return text.replace(/&\+[a-zA-Z]|&n/g, '')
}

// Load on mount
onMounted(async () => {
  await loadFilterOptions()
  await loadObjects()
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
                <Input v-model="search" placeholder="Search objects..." class="pl-10" />
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
                <!-- Type Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Type</label>
                  <Popover v-model:open="typeOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedTypeName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search type..." />
                        <CommandEmpty>No type found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectType('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedType === '' ? 'opacity-100' : 'opacity-0'" />
                              All Types
                            </CommandItem>
                            <CommandItem v-for="type in objectTypes" :key="type.id" :value="type.name" @select="selectType(type.id.toString())">
                              <Check class="mr-2 h-4 w-4" :class="selectedType === type.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              {{ type.name }}
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Slot Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Slot</label>
                  <Popover v-model:open="slotOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedSlotName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search slot..." />
                        <CommandEmpty>No slot found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectSlot('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedSlot === '' ? 'opacity-100' : 'opacity-0'" />
                              All Slots
                            </CommandItem>
                            <CommandItem v-for="slot in wearSlots" :key="slot.id" :value="slot.name" @select="selectSlot(slot.id.toString())">
                              <Check class="mr-2 h-4 w-4" :class="selectedSlot === slot.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              {{ slot.name }}
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Affect Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Affect</label>
                  <Popover v-model:open="affectOpen">
                    <PopoverTrigger as-child>
                      <Button variant="outline" role="combobox" class="w-full justify-between font-normal">
                        <span class="truncate">{{ selectedAffectName }}</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[calc(100vw-2rem)] max-w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search affect..." />
                        <CommandEmpty>No affect found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value="all" @select="selectAffect('')">
                              <Check class="mr-2 h-4 w-4" :class="selectedAffect === '' ? 'opacity-100' : 'opacity-0'" />
                              All Affects
                            </CommandItem>
                            <CommandItem v-for="affect in affectTypes" :key="affect.id" :value="affect.name" @select="selectAffect(affect.id.toString())">
                              <Check class="mr-2 h-4 w-4" :class="selectedAffect === affect.id.toString() ? 'opacity-100' : 'opacity-0'" />
                              {{ affect.name }}
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
                      <Button variant="outline" role="combobox" class="w-full justify-between font-normal">
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
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <!-- Level Range -->
                <div class="flex items-end gap-2">
                  <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Min Level</label>
                    <Input v-model="minLevel" type="number" placeholder="0" min="0" max="100" />
                  </div>
                  <span class="pb-2 text-muted-foreground">-</span>
                  <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Max Level</label>
                    <Input v-model="maxLevel" type="number" placeholder="100" min="0" max="100" />
                  </div>
                </div>
                <!-- Exclude Trash Checkbox -->
                <div class="flex items-center gap-2">
                  <Checkbox id="exclude-trash-mobile" :checked="excludeTrash" @update:checked="excludeTrash = $event" />
                  <Label for="exclude-trash-mobile" class="text-sm cursor-pointer">Exclude Trash</Label>
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
                    placeholder="Search objects..."
                    class="pl-10"
                  />
                </div>
              </div>

              <!-- Type Filter (Combobox) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Type</label>
                <Popover v-model:open="typeOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="typeOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedTypeName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search type..." />
                      <CommandEmpty>No type found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectType('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedType === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Types
                          </CommandItem>
                          <CommandItem
                            v-for="type in objectTypes"
                            :key="type.id"
                            :value="type.name"
                            @select="selectType(type.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedType === type.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            {{ type.name }}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Slot Filter (Combobox) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Slot</label>
                <Popover v-model:open="slotOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="slotOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedSlotName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search slot..." />
                      <CommandEmpty>No slot found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectSlot('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedSlot === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Slots
                          </CommandItem>
                          <CommandItem
                            v-for="slot in wearSlots"
                            :key="slot.id"
                            :value="slot.name"
                            @select="selectSlot(slot.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedSlot === slot.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            {{ slot.name }}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <!-- Affect Filter (Combobox) -->
              <div class="w-[160px]">
                <label class="text-sm font-medium mb-2 block">Affect</label>
                <Popover v-model:open="affectOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="affectOpen"
                      class="w-full justify-between font-normal"
                    >
                      <span class="truncate">{{ selectedAffectName }}</span>
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search affect..." />
                      <CommandEmpty>No affect found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem value="all" @select="selectAffect('')">
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedAffect === '' ? 'opacity-100' : 'opacity-0'"
                            />
                            All Affects
                          </CommandItem>
                          <CommandItem
                            v-for="affect in affectTypes"
                            :key="affect.id"
                            :value="affect.name"
                            @select="selectAffect(affect.id.toString())"
                          >
                            <Check
                              class="mr-2 h-4 w-4"
                              :class="selectedAffect === affect.id.toString() ? 'opacity-100' : 'opacity-0'"
                            />
                            {{ affect.name }}
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

              <!-- Level Range -->
              <div class="flex items-end gap-2">
                <div class="w-[80px]">
                  <label class="text-sm font-medium mb-2 block">Min Lvl</label>
                  <Input
                    v-model="minLevel"
                    type="number"
                    placeholder="0"
                    min="0"
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
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <!-- Exclude Trash Checkbox -->
              <div class="flex items-center gap-2 pb-2">
                <Checkbox
                  id="exclude-trash"
                  :checked="excludeTrash"
                  @update:checked="excludeTrash = $event"
                />
                <Label for="exclude-trash" class="text-sm cursor-pointer">
                  Exclude Trash
                </Label>
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

            <!-- Advanced Filters -->
            <Collapsible v-model:open="advancedOpen" class="mt-4 border-t pt-4">
              <CollapsibleTrigger class="flex items-center gap-2 text-sm font-medium hover:text-foreground text-muted-foreground">
                <ChevronDown class="h-4 w-4 transition-transform" :class="{ 'rotate-180': advancedOpen }" />
                Advanced Filters
              </CollapsibleTrigger>
              <CollapsibleContent class="pt-4 space-y-4">
                <!-- Multi-Affect Filters -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium">Filter by Multiple Affects (AND)</label>
                    <Button variant="outline" size="sm" @click="addAffectFilter" class="gap-1">
                      <Plus class="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                  <div v-if="affectFilters.length === 0" class="text-sm text-muted-foreground">
                    No affect filters. Click "Add" to filter objects that have multiple specific affects.
                  </div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="(af, idx) in affectFilters"
                      :key="idx"
                      class="flex flex-col sm:flex-row items-start sm:items-center gap-2"
                    >
                      <Select v-model="af.location" class="w-full sm:w-[150px]">
                        <SelectTrigger>
                          <SelectValue placeholder="Select affect" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem v-for="affect in affectTypes" :key="affect.id" :value="affect.id.toString()">
                            {{ affect.name }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        v-model="af.minModifier"
                        type="number"
                        placeholder="Min value"
                        class="w-full sm:w-[100px]"
                      />
                      <Button variant="ghost" size="icon" @click="removeAffectFilter(idx)">
                        <Trash2 class="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>

                <!-- Spell Effects Filter -->
                <div>
                  <label class="text-sm font-medium mb-2 block">Filter by Spell Effects (AND)</label>
                  <div class="flex flex-wrap gap-2">
                    <Badge
                      v-for="effect in spellEffectTypes"
                      :key="effect"
                      :variant="selectedSpellEffects.includes(effect) ? 'default' : 'outline'"
                      class="cursor-pointer hover:bg-primary/80"
                      @click="toggleSpellEffect(effect)"
                    >
                      {{ effect }}
                    </Badge>
                  </div>
                  <p v-if="selectedSpellEffects.length > 0" class="text-sm text-muted-foreground mt-2">
                    Selected: {{ selectedSpellEffects.join(', ') }}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <!-- Results -->
        <Card>
          <CardContent class="p-0">
            <!-- Loading State -->
            <div v-if="loading" class="flex items-center justify-center py-12">
              <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
            </div>

            <!-- Empty State -->
            <div v-else-if="objects.length === 0" class="text-center py-12 text-muted-foreground">
              No objects found matching your criteria.
            </div>

            <!-- Results: Mobile Cards + Desktop Table -->
            <div v-else>
              <!-- Mobile: Card list -->
              <div class="lg:hidden divide-y">
                <div
                  v-for="obj in objects"
                  :key="`mobile-${obj.vnum}`"
                  class="p-3 cursor-pointer hover:bg-muted/50 active:bg-muted"
                  @click="goToObject(obj.vnum)"
                >
                  <div class="flex items-start gap-3">
                    <!-- Level indicator -->
                    <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-muted/50 flex-shrink-0">
                      <span class="text-xs text-muted-foreground">Lvl</span>
                      <span class="text-sm font-semibold">{{ obj.level }}</span>
                    </div>
                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate">
                        <AnsiText :text="obj.name" />
                      </div>
                      <!-- Type + Slots badges -->
                      <div class="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" class="text-xs">{{ obj.typeName }}</Badge>
                        <Badge v-for="slot in obj.slots.slice(0, 2)" :key="slot" variant="secondary" class="text-xs">
                          {{ slot }}
                        </Badge>
                        <Badge v-if="obj.slots.length > 2" variant="outline" class="text-xs">
                          +{{ obj.slots.length - 2 }}
                        </Badge>
                      </div>
                      <!-- Affects -->
                      <div v-if="obj.affects.length > 0" class="text-xs text-muted-foreground mt-1 truncate">
                        {{ formatAffects(obj) }}
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
                      <TableHead class="w-[100px] cursor-pointer hover:bg-muted/50" @click="handleSort('vnum')">
                        <div class="flex items-center gap-1">
                          VNUM
                          <component :is="sortBy === 'vnum' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="cursor-pointer hover:bg-muted/50" @click="handleSort('short_desc')">
                        <div class="flex items-center gap-1">
                          Name
                          <component :is="sortBy === 'short_desc' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[120px] cursor-pointer hover:bg-muted/50" @click="handleSort('obj_type')">
                        <div class="flex items-center gap-1">
                          Type
                          <component :is="sortBy === 'obj_type' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[80px] cursor-pointer hover:bg-muted/50" @click="handleSort('level')">
                        <div class="flex items-center gap-1">
                          Level
                          <component :is="sortBy === 'level' ? (sortOrder === 'asc' ? SortAsc : SortDesc) : 'span'" class="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead class="w-[150px]">Slots</TableHead>
                      <TableHead>Affects</TableHead>
                      <TableHead>Spell Effects</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow
                      v-for="obj in objects"
                      :key="obj.vnum"
                      class="cursor-pointer hover:bg-muted/50"
                      @click="goToObject(obj.vnum)"
                    >
                      <TableCell class="font-mono text-sm">{{ obj.vnum }}</TableCell>
                      <TableCell>
                        <AnsiText :text="obj.name" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{{ obj.typeName }}</Badge>
                      </TableCell>
                      <TableCell class="text-center">{{ obj.level }}</TableCell>
                      <TableCell>
                        <div class="flex flex-wrap gap-1">
                          <Badge
                            v-for="slot in obj.slots"
                            :key="slot"
                            variant="secondary"
                            class="text-xs"
                          >
                            {{ slot }}
                          </Badge>
                          <span v-if="obj.slots.length === 0" class="text-muted-foreground">-</span>
                        </div>
                      </TableCell>
                      <TableCell class="text-sm text-muted-foreground max-w-[300px] truncate">
                        {{ formatAffects(obj) }}
                      </TableCell>
                      <TableCell class="text-sm text-muted-foreground max-w-[200px] truncate">
                        {{ formatSpellEffects(obj) }}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="!loading && objects.length > 0" class="border-t px-3 lg:px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
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
